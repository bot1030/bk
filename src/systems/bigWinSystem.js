const { EmbedBuilder } = require('discord.js');
const prisma = require('../database/prisma');
const { formatCoins, formatJK } = require('../utils/format');

const DEFAULT_COIN_THRESHOLD = 50000;
const DEFAULT_JK_THRESHOLD = 50;

async function getOrCreateGuildConfig(guildId) {
  if (!guildId) return null;

  return prisma.guildConfig.upsert({
    where: { guildId },
    update: {},
    create: {
      guildId,
      bigWinCoinThreshold: DEFAULT_COIN_THRESHOLD,
      bigWinJkThreshold: DEFAULT_JK_THRESHOLD
    }
  });
}

async function setBigWinChannel(guildId, channelId, coinThreshold = DEFAULT_COIN_THRESHOLD, jkThreshold = DEFAULT_JK_THRESHOLD) {
  if (!guildId) throw new Error('guildId is required');

  return prisma.guildConfig.upsert({
    where: { guildId },
    update: {
      bigWinChannelId: channelId,
      bigWinCoinThreshold: coinThreshold,
      bigWinJkThreshold: jkThreshold
    },
    create: {
      guildId,
      bigWinChannelId: channelId,
      bigWinCoinThreshold: coinThreshold,
      bigWinJkThreshold: jkThreshold
    }
  });
}

function buildBigWinEmbed({ user, gameName, coins = 0, jk = 0, detailLines = [], isHiddenDiamond = false }) {
  const rewardText = [];
  if (coins > 0) rewardText.push(formatCoins(coins));
  if (jk > 0) rewardText.push(formatJK(jk));

  return new EmbedBuilder()
    .setColor(isHiddenDiamond ? 0x9b59b6 : 0xf1c40f)
    .setTitle(isHiddenDiamond ? '💎 隱藏鑽石公告！' : '🏆 大獎公告！')
    .setDescription([
      `玩家：<@${user.id}>`,
      `遊戲：**${gameName}**`,
      `獎勵：**${rewardText.join(' + ') || '0'}**`,
      '',
      ...detailLines
    ].filter(Boolean).join('\n'))
    .setFooter({ text: '大獎頻道由 /setup_bigwin 設定。' })
    .setTimestamp(new Date());
}

async function announceBigWin(client, guildId, payload) {
  if (!guildId) return { sent: false, reason: 'NO_GUILD' };

  const config = await prisma.guildConfig.findUnique({ where: { guildId } });
  if (!config || !config.bigWinChannelId) return { sent: false, reason: 'NO_CHANNEL' };

  const coins = Number(payload.coins || 0);
  const jk = Number(payload.jk || 0);
  const isHiddenDiamond = Boolean(payload.isHiddenDiamond);

  const meetsCoinThreshold = coins >= config.bigWinCoinThreshold;
  const meetsJkThreshold = jk >= config.bigWinJkThreshold;

  if (!isHiddenDiamond && !meetsCoinThreshold && !meetsJkThreshold) {
    return { sent: false, reason: 'BELOW_THRESHOLD' };
  }

  const channel = await client.channels.fetch(config.bigWinChannelId).catch(() => null);
  if (!channel || !channel.isTextBased()) {
    return { sent: false, reason: 'CHANNEL_NOT_FOUND' };
  }

  const embed = buildBigWinEmbed(payload);
  await channel.send({ embeds: [embed] }).catch(() => null);
  return { sent: true };
}

module.exports = {
  DEFAULT_COIN_THRESHOLD,
  DEFAULT_JK_THRESHOLD,
  getOrCreateGuildConfig,
  setBigWinChannel,
  announceBigWin
};
