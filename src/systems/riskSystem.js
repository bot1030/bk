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

async function checkGamblingBetAllowed(discordUser, requestedBet) {
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

  if (level === 'NORMAL') return { level, stats };

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
  getRiskLevel
};
