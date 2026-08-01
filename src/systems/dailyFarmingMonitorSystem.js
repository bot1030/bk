const { EmbedBuilder } = require('discord.js');
const prisma = require('../database/prisma');
const { formatCoinsWithEvent, formatNumber, formatCoins } = require('../utils/format');
const { ROLE_SHOP } = require('../config/roleShopConfig');
const luckyConfig = require('../config/luckyBlockConfig');

const ADMIN_USER_IDS = [
  '473647287026057227',
  '786683877107302461',
  '1319968425698922591'
];

const LOOKBACK_DAYS = 30;
const WARNING_THRESHOLD = 15;
const HIGH_WARNING_THRESHOLD = 20;
const MIN_MEANINGFUL_GAME_ROUNDS = 5;
const MEANINGFUL_GAME_MIN_SPEND = luckyConfig.meaningfulGameMinSpend || 1000;

// Fishing is intentionally excluded. Only real paid games count for this warning.
const GAME_TRANSACTION_TYPES = ['COINFLIP', 'SLOTS', 'MINES', 'LUCKY_BLOCK'];

function getLookbackStart() {
  return new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
}

function isIgnoredUser(discordId) {
  return ROLE_SHOP.thief.protectedUserIds.includes(discordId);
}

function parseSpendKey(tx) {
  const text = String(tx.reason || '');
  const match = text.match(/局號\s*([A-Za-z0-9_-]+)/);
  if (match) return `${tx.type}:${match[1]}`;
  return `${tx.type}:${tx.id}`;
}

async function getMeaningfulGameStats(userId, since) {
  // Only normal 金幣 spending counts as meaningful game activity.
  // 活動金幣 spending is ignored so event coins cannot be used to bypass daily-farming warnings.
  const spendTransactions = await prisma.transaction.findMany({
    where: {
      userId,
      type: { in: GAME_TRANSACTION_TYPES },
      currency: 'COINS',
      amount: { lt: 0 },
      createdAt: { gte: since }
    },
    select: {
      id: true,
      type: true,
      currency: true,
      amount: true,
      reason: true,
      createdAt: true
    },
    orderBy: { createdAt: 'asc' }
  });

  const rounds = new Map();
  for (const tx of spendTransactions) {
    const key = parseSpendKey(tx);
    const existing = rounds.get(key) || { type: tx.type, spend: 0 };
    existing.spend += Math.abs(Number(tx.amount || 0));
    rounds.set(key, existing);
  }

  let meaningfulRounds = 0;
  let lowSpendRounds = 0;
  let totalMainGameSpend = 0;

  for (const round of rounds.values()) {
    totalMainGameSpend += round.spend;
    if (round.spend >= MEANINGFUL_GAME_MIN_SPEND) meaningfulRounds += 1;
    else lowSpendRounds += 1;
  }

  return {
    rawSpendTransactions: spendTransactions.length,
    roundCount: rounds.size,
    meaningfulRounds,
    lowSpendRounds,
    totalMainGameSpend
  };
}

function buildReasonLines({ meaningfulRounds, lowSpendRounds }) {
  const reasons = [];

  if (meaningfulRounds === 0) {
    reasons.push(`最近 30 天沒有有效主要遊戲紀錄（每局至少 ${formatCoins(MEANINGFUL_GAME_MIN_SPEND)}）`);
  } else if (meaningfulRounds < MIN_MEANINGFUL_GAME_ROUNDS) {
    reasons.push(`最近 30 天有效主要遊戲只有 ${formatNumber(meaningfulRounds)} 局，低於系統參考值 ${formatNumber(MIN_MEANINGFUL_GAME_ROUNDS)} 局`);
  }

  if (lowSpendRounds > 0) {
    reasons.push(`有 ${formatNumber(lowSpendRounds)} 局低金額投入未列入有效主要遊戲，避免用小額投入規避提醒`);
  }

  return reasons;
}

async function hasRecentAlert(targetDiscordId, alertType, since) {
  const existing = await prisma.adminWarningLog.findFirst({
    where: {
      targetDiscordId,
      alertType,
      createdAt: { gte: since }
    },
    orderBy: { createdAt: 'desc' }
  });

  return Boolean(existing);
}

async function sendAdminDms(client, embed) {
  const results = await Promise.allSettled(
    ADMIN_USER_IDS.map(async adminId => {
      const adminUser = await client.users.fetch(adminId);
      return adminUser.send({ embeds: [embed] });
    })
  );

  const failed = results.filter(result => result.status === 'rejected');
  if (failed.length > 0) {
    console.warn(`[dailyFarmingMonitor] Failed to DM ${failed.length} admin(s).`);
  }
}

async function checkDailyFarmingWarning(client, guild, discordUser) {
  if (!client || !discordUser || discordUser.bot) return null;
  if (isIgnoredUser(discordUser.id)) return null;

  const user = await prisma.user.findUnique({
    where: { discordId: discordUser.id }
  });

  if (!user) return null;

  const since = getLookbackStart();

  const [dailyClaimCount, fishingCount, gameStats] = await Promise.all([
    prisma.transaction.count({
      where: {
        userId: user.id,
        type: 'DAILY',
        currency: 'COINS',
        amount: { gt: 0 },
        createdAt: { gte: since }
      }
    }),
    prisma.transaction.count({
      where: {
        userId: user.id,
        type: 'FISHING',
        createdAt: { gte: since }
      }
    }),
    getMeaningfulGameStats(user.id, since)
  ]);

  if (dailyClaimCount < WARNING_THRESHOLD) return null;

  const reasonLines = buildReasonLines(gameStats);
  if (reasonLines.length === 0) return null;

  const alertTypeBase = dailyClaimCount >= HIGH_WARNING_THRESHOLD
    ? 'DAILY_FARMING_20_PLUS_LOW_MAIN_GAME_ACTIVITY'
    : 'DAILY_FARMING_15_PLUS_LOW_MAIN_GAME_ACTIVITY';
  const alertType = `${alertTypeBase}_MIN_${MEANINGFUL_GAME_MIN_SPEND}_ROUNDS_${MIN_MEANINGFUL_GAME_ROUNDS}`;

  const alreadySent = await hasRecentAlert(discordUser.id, alertType, since);
  if (alreadySent) return null;

  const embed = new EmbedBuilder()
    .setColor(dailyClaimCount >= HIGH_WARNING_THRESHOLD ? 0xe74c3c : 0xf1c40f)
    .setTitle('⚠️ 每日獎勵異常提醒')
    .setDescription([
      `玩家：<@${discordUser.id}>`,
      `伺服器：**${guild?.name || '未知伺服器'}**`,
      '',
      `最近 **${LOOKBACK_DAYS} 天**每日領取次數：**${formatNumber(dailyClaimCount)}**`,
      `有效主要遊戲局數：**${formatNumber(gameStats.meaningfulRounds)}**`,
      `主要遊戲總局數：**${formatNumber(gameStats.roundCount)}**`,
      `低金額主要遊戲局數：**${formatNumber(gameStats.lowSpendRounds)}**`,
      `主要遊戲正式金幣投入總額：**${formatCoins(gameStats.totalMainGameSpend)}**`,
      `釣魚紀錄：**${formatNumber(fishingCount)}**（不列入主要遊戲）`,
      `目前金幣：**${formatCoinsWithEvent(user.coins, user.eventCoins)}**`,
      '',
      '觸發原因：',
      ...reasonLines.map(reason => `• ${reason}`),
      '',
      '此通知只是提醒，不會自動處罰玩家。'
    ].join('\n'))
    .setFooter({ text: `有效主要遊戲：硬幣翻轉、幸運轉盤、踩地雷、幸運方塊；每局正式金幣投入至少 ${formatNumber(MEANINGFUL_GAME_MIN_SPEND)} 才列入，活動金幣不列入。` })
    .setTimestamp();

  await sendAdminDms(client, embed);

  await prisma.adminWarningLog.create({
    data: {
      guildId: guild?.id || null,
      targetDiscordId: discordUser.id,
      alertType,
      dailyClaims: dailyClaimCount,
      gameTransactions: gameStats.meaningfulRounds,
      coinReductionTransactions: gameStats.rawSpendTransactions,
      targetCoins: user.coins,
      reason: reasonLines.join('；')
    }
  });

  return {
    alerted: true,
    alertType,
    dailyClaimCount,
    meaningfulRounds: gameStats.meaningfulRounds,
    lowSpendRounds: gameStats.lowSpendRounds
  };
}

module.exports = {
  checkDailyFarmingWarning,
  ADMIN_USER_IDS,
  LOOKBACK_DAYS,
  WARNING_THRESHOLD,
  HIGH_WARNING_THRESHOLD,
  MIN_MEANINGFUL_GAME_ROUNDS,
  MEANINGFUL_GAME_MIN_SPEND,
  GAME_TRANSACTION_TYPES
};
