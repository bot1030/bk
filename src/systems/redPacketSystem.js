const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags
} = require('discord.js');
const prisma = require('../database/prisma');
const { STARTING_COINS } = require('../config/economyConfig');
const { formatCoins, formatEventCoins, formatJK, formatNumber } = require('../utils/format');
const { getActivePunishment, buildPunishmentMessage } = require('./punishmentSystem');

const CLAIM_RETRY_LIMIT = 6;

const CURRENCY_CONFIG = {
  coins: {
    db: 'COINS',
    label: '金幣',
    emoji: '🪙',
    format: formatCoins,
    userField: 'coins'
  },
  event_coins: {
    db: 'EVENT_COINS',
    label: '活動金幣',
    emoji: '🎁',
    format: formatEventCoins,
    userField: 'eventCoins'
  },
  jk: {
    db: 'JK',
    label: 'JK餘額',
    emoji: '💎',
    format: formatJK,
    userField: 'jkBalance'
  }
};

function privatePayload(payload = {}) {
  return { ...payload, flags: MessageFlags.Ephemeral };
}

function getCurrencyConfig(currency) {
  const config = CURRENCY_CONFIG[currency] || Object.values(CURRENCY_CONFIG).find(item => item.db === currency);
  if (!config) throw new Error(`Unsupported red packet currency: ${currency}`);
  return config;
}

function randomInt(min, max) {
  const safeMin = Math.ceil(min);
  const safeMax = Math.floor(max);
  if (safeMax <= safeMin) return safeMin;
  return Math.floor(Math.random() * (safeMax - safeMin + 1)) + safeMin;
}

function rollClaimAmount(remainingAmount, remainingSlots) {
  if (remainingSlots <= 1) return remainingAmount;

  const minimumReserved = remainingSlots - 1;
  const spendablePool = Math.max(1, remainingAmount - minimumReserved);
  const average = Math.max(1, Math.floor(remainingAmount / remainingSlots));
  const max = Math.max(1, Math.min(spendablePool, average * 2));

  return randomInt(1, max);
}

function buildRedPacketEmbed(packet, finished = false) {
  const config = getCurrencyConfig(packet.currency);
  const claimedCount = Number(packet.claimedCount || 0);
  const playerLimit = Number(packet.playerLimit || 0);
  const remainingAmount = Number(packet.remainingAmount || 0);

  const lines = [
    `貨幣：**${config.emoji} ${config.label}**`,
    `總金額：**${config.format(packet.totalAmount)}**`,
    `可領人數：**${formatNumber(playerLimit)} 人**`,
    `已領取：**${formatNumber(claimedCount)} / ${formatNumber(playerLimit)}**`,
    finished ? `剩餘：**${config.format(remainingAmount)}**` : null,
    '',
    finished
      ? '福袋已被搶完。'
      : '點擊下方按鈕搶福袋，手速快的人才拿得到。'
  ];

  if (finished && packet.bestLuckUserId) {
    lines.push('', `👑 運氣王：<@${packet.bestLuckUserId}> 獲得 **${config.format(packet.bestLuckAmount)}**！`);
  }

  return new EmbedBuilder()
    .setColor(finished ? 0x95a5a6 : 0xf1c40f)
    .setTitle(finished ? '🧧 福袋已搶完' : '🧧 JK商城福袋')
    .setDescription(lines.filter(Boolean).join('\n'))
    .setTimestamp();
}

function buildRedPacketComponents(packet, disabled = false) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`red_packet:claim:${packet.id}`)
        .setLabel(disabled ? '福袋已搶完' : '搶福袋')
        .setEmoji('🧧')
        .setStyle(disabled ? ButtonStyle.Secondary : ButtonStyle.Danger)
        .setDisabled(disabled)
    )
  ];
}

async function createRedPacketPanel({ interaction, channel, currency, totalAmount, playerLimit }) {
  const config = getCurrencyConfig(currency);

  const packet = await prisma.redPacket.create({
    data: {
      guildId: interaction.guildId,
      channelId: channel.id,
      creatorDiscordId: interaction.user.id,
      currency: config.db,
      totalAmount,
      remainingAmount: totalAmount,
      playerLimit,
      claimedCount: 0,
      status: 'ACTIVE'
    }
  });

  const message = await channel.send({
    embeds: [buildRedPacketEmbed(packet, false)],
    components: buildRedPacketComponents(packet, false)
  });

  await prisma.redPacket.update({
    where: { id: packet.id },
    data: { messageId: message.id }
  });

  return { packet, message };
}

async function ensureUserInsideTransaction(tx, discordUser) {
  return tx.user.upsert({
    where: { discordId: discordUser.id },
    update: { username: discordUser.username },
    create: {
      discordId: discordUser.id,
      username: discordUser.username,
      coins: STARTING_COINS,
      eventCoins: 0,
      jkBalance: 0,
      ownedRods: ['basic'],
      selectedRod: 'basic'
    }
  });
}

async function applyRewardInsideTransaction(tx, user, discordUser, amount, config, packetId) {
  const before = Number(user[config.userField] || 0);
  const updated = await tx.user.update({
    where: { id: user.id },
    data: {
      [config.userField]: { increment: amount },
      username: discordUser.username
    }
  });

  await tx.transaction.create({
    data: {
      userId: user.id,
      type: 'RED_PACKET',
      currency: config.db,
      amount,
      balanceBefore: before,
      balanceAfter: Number(updated[config.userField] || 0),
      reason: `福袋獎勵｜福袋 ${packetId}`
    }
  });

  return updated;
}

async function claimRedPacketOnce(packetId, discordUser) {
  return prisma.$transaction(async tx => {
    const packet = await tx.redPacket.findUnique({ where: { id: packetId } });

    if (!packet || packet.status !== 'ACTIVE' || packet.claimedCount >= packet.playerLimit || packet.remainingAmount <= 0) {
      return { status: 'SOLD_OUT' };
    }

    const existingClaim = await tx.redPacketClaim.findUnique({
      where: {
        redPacketId_discordId: {
          redPacketId: packetId,
          discordId: discordUser.id
        }
      }
    });

    if (existingClaim) {
      return { status: 'ALREADY_CLAIMED', amount: existingClaim.amount, currency: existingClaim.currency };
    }

    const remainingSlots = packet.playerLimit - packet.claimedCount;
    const claimAmount = rollClaimAmount(packet.remainingAmount, remainingSlots);
    const newClaimedCount = packet.claimedCount + 1;
    const newRemainingAmount = packet.remainingAmount - claimAmount;
    const finished = newClaimedCount >= packet.playerLimit || newRemainingAmount <= 0;
    const isBestLuck = claimAmount > Number(packet.bestLuckAmount || 0);

    const locked = await tx.redPacket.updateMany({
      where: {
        id: packet.id,
        status: 'ACTIVE',
        claimedCount: packet.claimedCount,
        remainingAmount: packet.remainingAmount
      },
      data: {
        claimedCount: { increment: 1 },
        remainingAmount: { decrement: claimAmount },
        status: finished ? 'FINISHED' : 'ACTIVE',
        ...(isBestLuck ? { bestLuckUserId: discordUser.id, bestLuckAmount: claimAmount } : {})
      }
    });

    if (locked.count === 0) {
      return { status: 'CONFLICT' };
    }

    const config = getCurrencyConfig(packet.currency);
    const user = await ensureUserInsideTransaction(tx, discordUser);
    await applyRewardInsideTransaction(tx, user, discordUser, claimAmount, config, packet.id);

    await tx.redPacketClaim.create({
      data: {
        redPacketId: packet.id,
        discordId: discordUser.id,
        username: discordUser.username,
        amount: claimAmount,
        currency: config.db
      }
    });

    const updatedPacket = await tx.redPacket.findUnique({ where: { id: packet.id } });

    return {
      status: 'CLAIMED',
      amount: claimAmount,
      currency: config.db,
      packet: updatedPacket,
      finished: updatedPacket.status === 'FINISHED'
    };
  });
}

async function claimRedPacket(packetId, discordUser) {
  for (let attempt = 0; attempt < CLAIM_RETRY_LIMIT; attempt += 1) {
    const result = await claimRedPacketOnce(packetId, discordUser);
    if (result.status !== 'CONFLICT') return result;
    await new Promise(resolve => setTimeout(resolve, 80 + attempt * 40));
  }

  return { status: 'BUSY' };
}

async function refreshRedPacketMessage(client, packet) {
  if (!packet?.channelId || !packet?.messageId) return;

  const channel = await client.channels.fetch(packet.channelId).catch(() => null);
  if (!channel || !channel.isTextBased()) return;

  const message = await channel.messages.fetch(packet.messageId).catch(() => null);
  if (!message) return;

  const finished = packet.status === 'FINISHED';
  await message.edit({
    embeds: [buildRedPacketEmbed(packet, finished)],
    components: buildRedPacketComponents(packet, finished)
  }).catch(() => null);
}

async function handleRedPacketButton(interaction) {
  if (!interaction.customId.startsWith('red_packet:claim:')) return null;

  const packetId = interaction.customId.split(':')[2];
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const punishment = await getActivePunishment(interaction.user.id, interaction.guildId, 'RED_PACKET');
  if (punishment) {
    return interaction.editReply({ content: buildPunishmentMessage(punishment, 'RED_PACKET') });
  }

  const result = await claimRedPacket(packetId, interaction.user);

  if (result.status === 'SOLD_OUT') {
    return interaction.editReply({ content: '福袋被搶完了 下次手速快一點' });
  }

  if (result.status === 'ALREADY_CLAIMED') {
    const config = getCurrencyConfig(result.currency);
    return interaction.editReply({ content: `你已經搶過這個福袋了，本次獲得：**${config.format(result.amount)}**` });
  }

  if (result.status === 'BUSY') {
    return interaction.editReply({ content: '目前太多人同時搶福袋，請再點一次。' });
  }

  const config = getCurrencyConfig(result.currency);
  await interaction.editReply({ content: `恭喜你搶到 **${config.format(result.amount)}**！` });

  if (result.packet) {
    await refreshRedPacketMessage(interaction.client, result.packet);
  }

  return null;
}

module.exports = {
  CURRENCY_CONFIG,
  createRedPacketPanel,
  handleRedPacketButton,
  buildRedPacketEmbed,
  buildRedPacketComponents,
  refreshRedPacketMessage,
  getCurrencyConfig
};
