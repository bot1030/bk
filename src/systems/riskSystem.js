const prisma = require('../database/prisma');
const riskConfig = require('../config/riskConfig');
const { formatCoins } = require('../utils/format');

const alertCooldowns = new Map();

function minutesAgo(minutes) {
  return new Date(Date.now() - minutes * 60 * 1000);
}

function formatPercent(value) {
  return `${Math.round(value * 100)}%`;
}

function nowMinusMinutes(minutes) {
  return new Date(Date.now() - minutes * 60 * 1000);
}

async function getRecentGamblingStats(discordUserId) {
  const user = await prisma.user.findUnique({
    where: { discordId: discordUserId }
  });

  if (!user) {
    return {
      games: 0,
      wins: 0,
      winRate: 0,
      netProfit: 0,
      totalBet: 0,
      averageBet: 0,
      windowMinutes: riskConfig.monitoringWindowMinutes
    };
  }

  const transactions = await prisma.transaction.findMany({
    where: {
      userId: user.id,
      type: { in: riskConfig.gamblingTransactionTypes },
      currency: 'COINS',
      createdAt: { gte: minutesAgo(riskConfig.monitoringWindowMinutes) }
    },
    orderBy: { createdAt: 'desc' }
  });

  const bets = transactions.filter(tx => tx.amount < 0);
  const payouts = transactions.filter(tx => tx.amount > 0);

  const games = bets.length;
  const wins = payouts.length;
  const winRate = games > 0 ? wins / games : 0;
  const netProfit = transactions.reduce((sum, tx) => sum + tx.amount, 0);
  const totalBet = bets.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
  const averageBet = games > 0 ? Math.floor(totalBet / games) : 0;

  return {
    games,
    wins,
    winRate,
    netProfit,
    totalBet,
    averageBet,
    windowMinutes: riskConfig.monitoringWindowMinutes
  };
}

function getRiskLevel(stats) {
  const hasEnoughGames = stats.games >= riskConfig.minGamesForWinRateCheck;

  const criticalByProfit = stats.netProfit >= riskConfig.criticalProfitCoins;
  const criticalByWinRate = hasEnoughGames &&
    stats.winRate >= riskConfig.criticalWinRate &&
    stats.totalBet >= riskConfig.criticalTotalBetCoins;

  if (criticalByProfit || criticalByWinRate) return 'CRITICAL';

  const highByProfit = stats.netProfit >= riskConfig.highProfitCoins;
  const highByWinRate = hasEnoughGames &&
    stats.winRate >= riskConfig.highWinRate &&
    stats.totalBet >= riskConfig.highTotalBetCoins;

  if (highByProfit || highByWinRate) return 'HIGH';

  return 'NORMAL';
}

function getMaxBetForRiskLevel(level) {
  if (level === 'CRITICAL') return riskConfig.maxBetWhenCriticalRisk;
  if (level === 'HIGH') return riskConfig.maxBetWhenHighRisk;
  return null;
}

async function getUserByDiscordId(discordUserId) {
  return prisma.user.findUnique({ where: { discordId: discordUserId } });
}

function buildRoundsFromTransactions(transactions) {
  const rounds = [];
  let current = null;

  for (const tx of transactions) {
    if (tx.amount < 0) {
      if (current) rounds.push(current);
      current = {
        type: tx.type,
        bet: Math.abs(tx.amount),
        payout: 0,
        net: tx.amount,
        createdAt: tx.createdAt,
        reason: tx.reason || ''
      };
      continue;
    }

    if (tx.amount > 0 && current && tx.type === current.type) {
      current.payout += tx.amount;
      current.net += tx.amount;
    }
  }

  if (current) rounds.push(current);
  return rounds;
}

async function getRecentGamblingRounds(discordUserId, windowMinutes = riskConfig.antiMartingale.windowMinutes) {
  const user = await getUserByDiscordId(discordUserId);
  if (!user) return { user: null, rounds: [] };

  const transactions = await prisma.transaction.findMany({
    where: {
      userId: user.id,
      type: { in: riskConfig.gamblingTransactionTypes },
      currency: 'COINS',
      createdAt: { gte: nowMinusMinutes(windowMinutes) }
    },
    orderBy: { createdAt: 'asc' }
  });

  return {
    user,
    rounds: buildRoundsFromTransactions(transactions)
  };
}

function analyzeMartingaleRounds(rounds, requestedBet = null) {
  const cfg = riskConfig.antiMartingale;
  const sequence = [...rounds];

  if (requestedBet && requestedBet > 0) {
    sequence.push({
      type: 'PENDING',
      bet: requestedBet,
      payout: 0,
      net: null,
      pending: true,
      createdAt: new Date(),
      reason: 'pending bet'
    });
  }

  let consecutiveSteps = 0;
  let maxSteps = 0;
  const detectedSteps = [];

  for (let i = 1; i < sequence.length; i += 1) {
    const previous = sequence[i - 1];
    const current = sequence[i];

    const previousWasLoss = typeof previous.net === 'number' && previous.net < 0;
    const currentLargeEnough = current.bet >= cfg.minBetForStep;
    const increasedEnough = current.bet >= Math.ceil(previous.bet * cfg.betIncreaseRatio);

    if (previousWasLoss && currentLargeEnough && increasedEnough) {
      consecutiveSteps += 1;
      maxSteps = Math.max(maxSteps, consecutiveSteps);
      detectedSteps.push({
        previousBet: previous.bet,
        currentBet: current.bet,
        currentPending: Boolean(current.pending),
        currentType: current.type
      });
    } else if (!previousWasLoss || !increasedEnough) {
      consecutiveSteps = 0;
    }
  }

  const netProfit = rounds.reduce((sum, round) => sum + (round.net || 0), 0);
  const totalBet = rounds.reduce((sum, round) => sum + round.bet, 0);
  const wins = rounds.filter(round => round.net > 0).length;
  const losses = rounds.filter(round => round.net < 0).length;

  return {
    triggered: maxSteps >= cfg.triggerSteps,
    maxSteps,
    triggerSteps: cfg.triggerSteps,
    detectedSteps,
    recentProfit: Math.max(0, netProfit),
    netProfit,
    totalBet,
    rounds: rounds.length,
    wins,
    losses,
    windowMinutes: cfg.windowMinutes
  };
}

async function recentlyBlocked(userId) {
  const cfg = riskConfig.antiMartingale;
  const block = await prisma.transaction.findFirst({
    where: {
      userId,
      type: cfg.blockTransactionType,
      createdAt: { gte: nowMinusMinutes(cfg.blockCooldownMinutes) }
    },
    orderBy: { createdAt: 'desc' }
  });

  return Boolean(block);
}

async function logAntiMartingaleBlock(user, analysis, requestedBet) {
  const cfg = riskConfig.antiMartingale;
  const alreadyBlocked = await recentlyBlocked(user.id);

  if (!alreadyBlocked) {
    await prisma.transaction.create({
      data: {
        userId: user.id,
        type: cfg.blockTransactionType,
        currency: 'COINS',
        amount: 0,
        balanceBefore: user.coins,
        balanceAfter: user.coins,
        reason: `倍投法風險控管：${analysis.maxSteps}/${analysis.triggerSteps} steps，拒絕下注 ${requestedBet}`
      }
    });
  }

  return { alreadyBlocked };
}

async function checkAntiMartingaleAllowed(discordUser, requestedBet) {
  const cfg = riskConfig.antiMartingale;
  if (!cfg.enabled) return { ok: true };

  const { user, rounds } = await getRecentGamblingRounds(discordUser.id, cfg.windowMinutes);
  if (!user) return { ok: true };

  const analysis = analyzeMartingaleRounds(rounds, requestedBet);
  if (!analysis.triggered) {
    return { ok: true, analysis };
  }

  const blockLog = await logAntiMartingaleBlock(user, analysis, requestedBet);

  const lines = [
    '⚠️ 倍投法風險控管啟動',
    '',
    `系統偵測到你在最近 **${analysis.windowMinutes} 分鐘** 內多次使用「輸了就加倍下注」的下注模式。`,
    `偵測次數：**${analysis.maxSteps}/${analysis.triggerSteps}**`,
    `近期賭博淨收益：**${formatCoins(analysis.netProfit)}**`,
    '',
    `為了防止系統經濟被倍投法破壞，你目前只能下注 **${formatCoins(cfg.maxBetWhenFlagged)}** 或以下。`,
    `此限制會在 **${cfg.blockCooldownMinutes} 分鐘** 後自動解除。`
  ];

  if (blockLog.alreadyBlocked) {
    lines.push('你目前仍在風險控管時間內。');
  }

  return {
    ok: requestedBet <= cfg.maxBetWhenFlagged,
    analysis,
    maxAllowedBet: cfg.maxBetWhenFlagged,
    message: lines.join('\n')
  };
}

async function checkGamblingBetAllowed(discordUser, requestedBet) {
  const martingale = await checkAntiMartingaleAllowed(discordUser, requestedBet);
  if (!martingale.ok) {
    return {
      ok: false,
      level: 'ANTI_MARTINGALE',
      stats: null,
      maxAllowedBet: martingale.maxAllowedBet,
      message: martingale.message
    };
  }

  const stats = await getRecentGamblingStats(discordUser.id);
  const level = getRiskLevel(stats);
  const maxAllowedBet = getMaxBetForRiskLevel(level);

  if (!maxAllowedBet || requestedBet <= maxAllowedBet) {
    return { ok: true, level, stats, maxAllowedBet };
  }

  return {
    ok: false,
    level,
    stats,
    maxAllowedBet,
    message: [
      '⚠️ 風險控管啟動',
      '',
      `你最近的下注波動過高，系統暫時限制你的單次下注上限為 **${formatCoins(maxAllowedBet)}**。`,
      '請降低下注金額後再試一次。'
    ].join('\n')
  };
}

function shouldSendAlert(discordUserId, level) {
  const key = `${discordUserId}:${level}`;
  const now = Date.now();
  const last = alertCooldowns.get(key) || 0;
  const cooldownMs = riskConfig.alertCooldownMinutes * 60 * 1000;

  if (now - last < cooldownMs) return false;
  alertCooldowns.set(key, now);
  return true;
}

async function sendAdminAlert(client, discordUser, title, lines, level = 'INFO') {
  if (level !== 'INFO' && !shouldSendAlert(discordUser.id, level)) return;

  const message = [
    `🚨 **${title}**`,
    `玩家：${discordUser.tag || discordUser.username} (${discordUser.id})`,
    '',
    ...lines
  ].join('\n');

  await Promise.allSettled(
    riskConfig.adminUserIds.map(async adminId => {
      const admin = await client.users.fetch(adminId).catch(() => null);
      if (!admin) return;
      await admin.send(message).catch(() => null);
    })
  );
}

async function sendPostGameRiskAlert(client, discordUser, gameLabel, extraLines = []) {
  const stats = await getRecentGamblingStats(discordUser.id);
  const level = getRiskLevel(stats);

  if (level !== 'NORMAL') {
    await sendAdminAlert(
      client,
      discordUser,
      `經濟風險警報：${gameLabel}`,
      [
        `風險等級：**${level}**`,
        `監控區間：最近 **${stats.windowMinutes} 分鐘**`,
        `遊戲局數：**${stats.games}**`,
        `勝利次數：**${stats.wins}**`,
        `勝率：**${formatPercent(stats.winRate)}**`,
        `總下注：**${formatCoins(stats.totalBet)}**`,
        `淨收益：**${formatCoins(stats.netProfit)}**`,
        ...extraLines
      ],
      level
    );
  }

  // Post-game audit only alerts/records blocks. It does not remove coins and does not rig RNG.
  if (riskConfig.antiMartingale.enabled) {
    const { user, rounds } = await getRecentGamblingRounds(discordUser.id, riskConfig.antiMartingale.windowMinutes);
    const analysis = analyzeMartingaleRounds(rounds);

    if (user && analysis.triggered) {
      await logAntiMartingaleBlock(user, analysis, 0);
      await sendAdminAlert(
        client,
        discordUser,
        `倍投法偵測：${gameLabel}`,
        [
          `偵測次數：**${analysis.maxSteps}/${analysis.triggerSteps}**`,
          `最近 **${analysis.windowMinutes} 分鐘** 賭博淨收益：**${formatCoins(analysis.netProfit)}**`,
          `後續高風險下注會被限制至 **${formatCoins(riskConfig.antiMartingale.maxBetWhenFlagged)}** 或以下。`,
          ...extraLines
        ],
        'ANTI_MARTINGALE'
      );
    }
  }

  return { level, stats };
}

async function sendSpecialRewardAlert(client, discordUser, title, lines) {
  await sendAdminAlert(client, discordUser, title, lines, 'INFO');
}

module.exports = {
  checkGamblingBetAllowed,
  sendPostGameRiskAlert,
  sendSpecialRewardAlert,
  getRecentGamblingStats,
  getRiskLevel,
  getRecentGamblingRounds,
  analyzeMartingaleRounds,
  checkAntiMartingaleAllowed
};
