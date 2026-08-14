const { EmbedBuilder, MessageFlags } = require('discord.js');
const prisma = require('../database/prisma');

const ADMIN_USER_IDS = new Set([
  '473647287026057227',
  '786683877107302461',
  '1319968425698922591'
]);

const ACTIONS = {
  DAILY: { label: '每日獎勵', emoji: '🎁' },
  FISH: { label: '釣魚', emoji: '🎣' },
  RED_PACKET: { label: '福袋', emoji: '🧧' },
  COINFLIP: { label: '硬幣翻轉', emoji: '🪙' },
  SLOTS: { label: '幸運轉盤', emoji: '🎰' },
  MINES: { label: '踩地雷', emoji: '💣' },
  LUCKY_BLOCK: { label: '幸運方塊', emoji: '🎁' },
  ALL_GAMES: { label: '所有主要遊戲', emoji: '🎮' },
  ALL_REWARDS: { label: '所有獎勵功能', emoji: '🎫' },
  ALL: { label: '所有功能', emoji: '⛔' }
};

const ACTION_CHOICES = Object.entries(ACTIONS).map(([value, item]) => ({
  name: `${item.emoji} ${item.label}`,
  value
}));

const ACTION_BLOCKERS = {
  DAILY: ['DAILY', 'ALL_REWARDS', 'ALL'],
  FISH: ['FISH', 'ALL_REWARDS', 'ALL'],
  RED_PACKET: ['RED_PACKET', 'ALL_REWARDS', 'ALL'],
  COINFLIP: ['COINFLIP', 'ALL_GAMES', 'ALL'],
  SLOTS: ['SLOTS', 'ALL_GAMES', 'ALL'],
  MINES: ['MINES', 'ALL_GAMES', 'ALL'],
  LUCKY_BLOCK: ['LUCKY_BLOCK', 'ALL_GAMES', 'ALL']
};

function isAdmin(userId) {
  return ADMIN_USER_IDS.has(userId);
}

function privatePayload(payload = {}) {
  return { ...payload, flags: MessageFlags.Ephemeral };
}

function getActionLabel(action) {
  const item = ACTIONS[action];
  return item ? `${item.emoji} ${item.label}` : action;
}

function parseTargetId(raw) {
  const text = String(raw || '').trim();
  const match = text.match(/^(?:<@!?)?(\d{15,25})>?$/);
  return match ? match[1] : null;
}

function parseDuration(raw) {
  const text = String(raw || '').trim().toLowerCase();
  if (!text || ['永久', '永久限制', 'permanent', 'perm', 'forever', 'none'].includes(text)) {
    return { expiresAt: null, label: '永久限制' };
  }

  const match = text.match(/^(\d+)\s*(m|min|mins|minute|minutes|分鐘|h|hr|hour|hours|小時|d|day|days|天|w|week|weeks|週|周)$/i);
  if (!match) return { error: '時間格式錯誤。請使用例如：30m、12h、3d、1w，或輸入 permanent。' };

  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  if (!Number.isSafeInteger(amount) || amount <= 0) return { error: '時間數量必須大於 0。' };

  let ms;
  let labelUnit;
  if (['m', 'min', 'mins', 'minute', 'minutes', '分鐘'].includes(unit)) {
    ms = amount * 60 * 1000;
    labelUnit = '分鐘';
  } else if (['h', 'hr', 'hour', 'hours', '小時'].includes(unit)) {
    ms = amount * 60 * 60 * 1000;
    labelUnit = '小時';
  } else if (['d', 'day', 'days', '天'].includes(unit)) {
    ms = amount * 24 * 60 * 60 * 1000;
    labelUnit = '天';
  } else {
    ms = amount * 7 * 24 * 60 * 60 * 1000;
    labelUnit = '週';
  }

  return {
    expiresAt: new Date(Date.now() + ms),
    label: `${amount} ${labelUnit}`
  };
}

function formatDateTime(date) {
  if (!date) return '永久限制';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '未知時間';
  return d.toLocaleString('zh-TW', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function buildPunishmentMessage(punishment, attemptedAction) {
  const actionLabel = getActionLabel(attemptedAction);
  return [
    `⛔ 你目前無法使用 **${actionLabel}**。`,
    `原因：${punishment.reason || '未提供原因'}`,
    `解除時間：${formatDateTime(punishment.expiresAt)}`
  ].join('\n');
}

async function cleanupExpiredPunishments() {
  await prisma.punishment.updateMany({
    where: {
      active: true,
      expiresAt: { not: null, lte: new Date() }
    },
    data: { active: false }
  }).catch(() => null);
}

async function getActivePunishment(targetDiscordId, guildId, attemptedAction) {
  await cleanupExpiredPunishments();

  const blockers = ACTION_BLOCKERS[attemptedAction] || [attemptedAction, 'ALL'];
  const records = await prisma.punishment.findMany({
    where: {
      active: true,
      targetDiscordId,
      action: { in: blockers },
      AND: [
        {
          OR: [
            { guildId: null },
            { guildId }
          ]
        },
        {
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: new Date() } }
          ]
        }
      ]
    },
    orderBy: { createdAt: 'desc' },
    take: 1
  });

  return records[0] || null;
}

async function replyIfPunished(interaction, attemptedAction, mode = 'reply') {
  const punishment = await getActivePunishment(interaction.user.id, interaction.guildId, attemptedAction);
  if (!punishment) return false;

  const payload = { content: buildPunishmentMessage(punishment, attemptedAction) };

  if (mode === 'edit') {
    await interaction.editReply(payload);
    return true;
  }

  if (mode === 'followUp') {
    await interaction.followUp(privatePayload(payload)).catch(() => null);
    return true;
  }

  if (interaction.deferred || interaction.replied) {
    await interaction.followUp(privatePayload(payload)).catch(() => null);
    return true;
  }

  await interaction.reply(privatePayload(payload));
  return true;
}

function buildPunishmentEmbed(record, title = '⛔ 功能限制已設定') {
  return new EmbedBuilder()
    .setColor(0xe74c3c)
    .setTitle(title)
    .addFields(
      { name: '玩家', value: `<@${record.targetDiscordId}>\n\`${record.targetDiscordId}\``, inline: true },
      { name: '限制功能', value: getActionLabel(record.action), inline: true },
      { name: '解除時間', value: formatDateTime(record.expiresAt), inline: true },
      { name: '原因', value: record.reason || '未提供原因', inline: false }
    )
    .setFooter({ text: `紀錄 ID：${record.id}` })
    .setTimestamp();
}

module.exports = {
  ADMIN_USER_IDS,
  ACTIONS,
  ACTION_CHOICES,
  isAdmin,
  privatePayload,
  parseTargetId,
  parseDuration,
  formatDateTime,
  getActionLabel,
  getActivePunishment,
  buildPunishmentMessage,
  replyIfPunished,
  buildPunishmentEmbed,
  cleanupExpiredPunishments
};
