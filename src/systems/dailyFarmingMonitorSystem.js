const { EmbedBuilder } = require('discord.js');
const prisma = require('../database/prisma');
const { formatCoins, formatNumber } = require('../utils/format');
const { ROLE_SHOP } = require('../config/roleShopConfig');

const ADMIN_USER_IDS = [
  '473647287026057227',
  '786683877107302461',
  '1319968425698922591'
];

const LOOKBACK_DAYS = 30;
const WARNING_THRESHOLD = 15;
const HIGH_WARNING_THRESHOLD = 20;
const GAME_TRANSACTION_TYPES = ['COINFLIP', 'SLOTS', 'MINES', 'FISHING'];

function getLookbackStart() {
  return new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
}

function isIgnoredUser(discordId) {
  return ROLE_SHOP.thief.protectedUserIds.includes(discordId);
}

function buildReasonLines({ gameTransactionCount, coinReductionCount }) {
  const reasons = [];

  if (gameTransactionCount === 0) {
    reasons.push('最近 30 天沒有任何遊戲交易紀錄');
  }

  if (coinReductionCount === 0) {
    reasons.push('最近 30 天沒有任何金幣扣除紀錄');
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

  const [dailyClaimCount, gameTransactionCount, coinReductionCount] = await Promise.all([
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
        type: { in: GAME_TRANSACTION_TYPES },
        createdAt: { gte: since }
      }
    }),
    prisma.transaction.count({
      where: {
        userId: user.id,
        currency: 'COINS',
        amount: { lt: 0 },
        createdAt: { gte: since }
      }
    })
  ]);

  if (dailyClaimCount < WARNING_THRESHOLD) return null;

  const reasonLines = buildReasonLines({ gameTransactionCount, coinReductionCount });
  if (reasonLines.length === 0) return null;

  const alertType = dailyClaimCount >= HIGH_WARNING_THRESHOLD
    ? 'DAILY_FARMING_20_PLUS'
    : 'DAILY_FARMING_15_PLUS';

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
      `遊戲交易次數：**${formatNumber(gameTransactionCount)}**`,
      `金幣扣除次數：**${formatNumber(coinReductionCount)}**`,
      `目前金幣：**${formatCoins(user.coins)}**`,
      '',
      '觸發原因：',
      ...reasonLines.map(reason => `• ${reason}`),
      '',
      '此通知只是提醒，不會自動處罰玩家。請人工確認是否只是正常囤幣。'
    ].join('\n'))
    .setFooter({ text: '觸發條件：最近 30 天每日領取 ≥ 15 次，且無遊戲紀錄或無金幣扣除紀錄。' })
    .setTimestamp();

  await sendAdminDms(client, embed);

  await prisma.adminWarningLog.create({
    data: {
      guildId: guild?.id || null,
      targetDiscordId: discordUser.id,
      alertType,
      dailyClaims: dailyClaimCount,
      gameTransactions: gameTransactionCount,
      coinReductionTransactions: coinReductionCount,
      targetCoins: user.coins,
      reason: reasonLines.join('；')
    }
  });

  return {
    alerted: true,
    alertType,
    dailyClaimCount,
    gameTransactionCount,
    coinReductionCount
  };
}

module.exports = {
  checkDailyFarmingWarning,
  ADMIN_USER_IDS,
  LOOKBACK_DAYS,
  WARNING_THRESHOLD,
  HIGH_WARNING_THRESHOLD
};
