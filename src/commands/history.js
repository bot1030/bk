const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags
} = require('discord.js');
const prisma = require('../database/prisma');
const { getOrCreateUser } = require('../systems/economySystem');
const { formatCoins, formatEventCoins, formatJK, formatNumber } = require('../utils/format');

const ADMIN_USER_IDS = [
  '473647287026057227',
  '786683877107302461',
  '1319968425698922591',
  '1535635248157827102'
];

const TYPE_LABELS = {
  COINFLIP: '硬幣翻轉',
  SLOTS: '幸運轉盤',
  MINES: '踩地雷',
  LUCKY_BLOCK: '幸運方塊',
  FISHING: '釣魚',
  DAILY: '每日獎勵',
  CONVERT: '貨幣兌換',
  CONVERT_SETTLE: '待結算完成',
  CONVERT_SETTLE_REMAINDER: '待結算退回',
  ADMIN_ADD: '管理員新增',
  ADMIN_DELETE: '管理員刪除',
  RED_PACKET: '福袋獎勵',
  ROD_PURCHASE: '釣竿購買',
  ROLE_PURCHASE: '身分組購買',
  THEFT: '偷竊',
  THEFT_FINE: '偷竊失敗罰款',
  ANTI_MARTINGALE_BLOCK: '連續玩法控管',
  SYSTEM: '系統'
};

const DEFAULT_PAGE_SIZE = 7;
const MIN_PAGE_SIZE = 5;
const MAX_PAGE_SIZE = 10;

function privatePayload(payload = {}) {
  return { ...payload, flags: MessageFlags.Ephemeral };
}

function isAdmin(userId) {
  return ADMIN_USER_IDS.includes(userId);
}

function clampPageSize(value) {
  const number = Number(value || DEFAULT_PAGE_SIZE);
  return Math.max(MIN_PAGE_SIZE, Math.min(MAX_PAGE_SIZE, Number.isInteger(number) ? number : DEFAULT_PAGE_SIZE));
}

function formatTransactionAmount(tx) {
  const sign = tx.amount >= 0 ? '+' : '-';
  const abs = Math.abs(tx.amount);

  if (tx.currency === 'JK') return `${sign}${formatJK(abs)}`;
  if (tx.currency === 'PENDING_JK') return `${sign}${formatJK(abs)} 待結算`;
  if (tx.currency === 'EVENT_COINS') return `${sign}${formatEventCoins(abs)}`;
  return `${sign}${formatCoins(abs)}`;
}

function formatBalanceLabel(tx) {
  if (tx.currency === 'JK' || tx.currency === 'PENDING_JK') {
    return `${formatNumber(tx.balanceBefore)} ➜ ${formatNumber(tx.balanceAfter)} JK`;
  }

  if (tx.currency === 'EVENT_COINS') {
    return `${formatNumber(tx.balanceBefore)} ➜ ${formatNumber(tx.balanceAfter)} 活動金幣`;
  }

  return `${formatNumber(tx.balanceBefore)} ➜ ${formatNumber(tx.balanceAfter)} 金幣`;
}

function trimReason(reason) {
  const text = String(reason || '').trim();
  if (!text) return '';
  return text.length > 45 ? `${text.slice(0, 45)}...` : text;
}

function formatTransactionLine(tx, index) {
  const label = TYPE_LABELS[tx.type] || tx.type;
  const time = `<t:${Math.floor(tx.createdAt.getTime() / 1000)}:R>`;
  const reason = trimReason(tx.reason);

  return [
    `**${index}.** ${time}`,
    `類型：**${label}**`,
    `金額：**${formatTransactionAmount(tx)}**`,
    `餘額：${formatBalanceLabel(tx)}`,
    reason ? `備註：${reason}` : null
  ].filter(Boolean).join('\n');
}

function buildHistoryButtons({ viewerId, targetDiscordId, page, pageSize, totalPages }) {
  const previousPage = Math.max(0, page - 1);
  const nextPage = Math.min(totalPages - 1, page + 1);

  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`history:go:${viewerId}:${targetDiscordId}:${previousPage}:${pageSize}`)
        .setLabel('上一頁')
        .setEmoji('⬅️')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page <= 0),
      new ButtonBuilder()
        .setCustomId(`history:go:${viewerId}:${targetDiscordId}:${nextPage}:${pageSize}`)
        .setLabel('下一頁')
        .setEmoji('➡️')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page >= totalPages - 1)
    )
  ];
}

async function buildHistoryResponse({ viewerId, targetDiscordId, page = 0, pageSize = DEFAULT_PAGE_SIZE }) {
  const user = await prisma.user.findUnique({ where: { discordId: targetDiscordId } });

  if (!user) {
    const embed = new EmbedBuilder()
      .setColor(0x9b59b6)
      .setTitle('📜 交易紀錄')
      .setDescription(`玩家：<@${targetDiscordId}>\n\n目前沒有任何交易紀錄。`);

    return { embeds: [embed], components: [] };
  }

  const safePageSize = clampPageSize(pageSize);
  const totalCount = await prisma.transaction.count({ where: { userId: user.id } });
  const totalPages = Math.max(1, Math.ceil(totalCount / safePageSize));
  const safePage = Math.max(0, Math.min(Number(page) || 0, totalPages - 1));

  const transactions = await prisma.transaction.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    skip: safePage * safePageSize,
    take: safePageSize
  });

  const startIndex = safePage * safePageSize;
  const embed = new EmbedBuilder()
    .setColor(0x9b59b6)
    .setTitle('📜 交易紀錄')
    .setDescription([
      `玩家：<@${targetDiscordId}>`,
      `頁數：**${formatNumber(safePage + 1)} / ${formatNumber(totalPages)}**`,
      `總紀錄：**${formatNumber(totalCount)}** 筆`,
      '',
      transactions.length > 0
        ? transactions.map((tx, index) => formatTransactionLine(tx, startIndex + index + 1)).join('\n\n')
        : '目前沒有任何交易紀錄。'
    ].join('\n'))
    .setTimestamp();

  return {
    embeds: [embed],
    components: totalPages > 1
      ? buildHistoryButtons({ viewerId, targetDiscordId, page: safePage, pageSize: safePageSize, totalPages })
      : []
  };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('history')
    .setDescription('查看交易與金幣變動紀錄')
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('要查看紀錄的玩家；只有管理員可以查看其他玩家')
        .setRequired(false)
    )
    .addIntegerOption(option =>
      option
        .setName('limit')
        .setDescription('每頁顯示幾筆紀錄，最少 5，最多 10')
        .setMinValue(MIN_PAGE_SIZE)
        .setMaxValue(MAX_PAGE_SIZE)
        .setRequired(false)
    ),

  async execute(interaction) {
    const target = interaction.options.getUser('user') || interaction.user;
    const pageSize = clampPageSize(interaction.options.getInteger('limit'));
    const viewingOtherUser = target.id !== interaction.user.id;

    if (viewingOtherUser && !isAdmin(interaction.user.id)) {
      return interaction.reply(privatePayload({ content: '你不能查看其他玩家的交易紀錄。' }));
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await getOrCreateUser(target);

    const response = await buildHistoryResponse({
      viewerId: interaction.user.id,
      targetDiscordId: target.id,
      page: 0,
      pageSize
    });

    return interaction.editReply(response);
  },

  async handleButton(interaction) {
    const [, action, viewerId, targetDiscordId, rawPage, rawPageSize] = interaction.customId.split(':');
    if (action !== 'go') return null;

    if (interaction.user.id !== viewerId) {
      return interaction.reply(privatePayload({ content: '這不是你的紀錄頁面。' }));
    }

    if (targetDiscordId !== interaction.user.id && !isAdmin(interaction.user.id)) {
      return interaction.reply(privatePayload({ content: '你不能查看其他玩家的交易紀錄。' }));
    }

    const response = await buildHistoryResponse({
      viewerId,
      targetDiscordId,
      page: Number(rawPage) || 0,
      pageSize: clampPageSize(Number(rawPageSize))
    });

    return interaction.update(response);
  }
};
