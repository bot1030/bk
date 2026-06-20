const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const prisma = require('../database/prisma');
const { getOrCreateUser } = require('../systems/economySystem');
const { formatCoins, formatJK, formatNumber } = require('../utils/format');

const ADMIN_USER_IDS = [
  '473647287026057227',
  '786683877107302461',
  '1319968425698922591'
];

const TYPE_LABELS = {
  COINFLIP: '硬幣翻轉',
  SLOTS: '幸運轉盤',
  MINES: '踩地雷',
  FISHING: '釣魚',
  DAILY: '每日獎勵',
  CONVERT: '貨幣兌換',
  ADMIN_ADD: '管理員新增',
  ADMIN_DELETE: '管理員刪除',
  ROD_PURCHASE: '釣竿購買',
  ANTI_MARTINGALE: '倍投法控管',
  SYSTEM: '系統'
};

function privatePayload(payload = {}) {
  return { ...payload, flags: MessageFlags.Ephemeral };
}

function isAdmin(userId) {
  return ADMIN_USER_IDS.includes(userId);
}

function formatTransactionAmount(tx) {
  const sign = tx.amount >= 0 ? '+' : '-';
  const abs = Math.abs(tx.amount);

  if (tx.currency === 'JK') {
    return `${sign}${formatJK(abs)}`;
  }

  return `${sign}${formatCoins(abs)}`;
}

function formatTransactionLine(tx, index) {
  const label = TYPE_LABELS[tx.type] || tx.type;
  const time = `<t:${Math.floor(tx.createdAt.getTime() / 1000)}:R>`;
  const reason = tx.reason ? `｜${tx.reason}` : '';

  return `**${index}.** ${time}｜${label}｜**${formatTransactionAmount(tx)}**｜餘額：${formatNumber(tx.balanceBefore)} ➜ ${formatNumber(tx.balanceAfter)}${reason}`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('history')
    .setDescription('查看最近的交易與金幣變動紀錄')
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('要查看紀錄的玩家；只有管理員可以查看其他玩家')
        .setRequired(false)
    )
    .addIntegerOption(option =>
      option
        .setName('limit')
        .setDescription('顯示幾筆紀錄，最少 5，最多 20')
        .setMinValue(5)
        .setMaxValue(20)
        .setRequired(false)
    ),

  async execute(interaction) {
    const target = interaction.options.getUser('user') || interaction.user;
    const limit = interaction.options.getInteger('limit') || 10;
    const viewingOtherUser = target.id !== interaction.user.id;

    if (viewingOtherUser && !isAdmin(interaction.user.id)) {
      return interaction.reply(privatePayload({ content: '你不能查看其他玩家的交易紀錄。' }));
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const user = await getOrCreateUser(target);
    const transactions = await prisma.transaction.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: limit
    });

    const totalCount = await prisma.transaction.count({ where: { userId: user.id } });

    const embed = new EmbedBuilder()
      .setColor(0x9b59b6)
      .setTitle('📜 交易紀錄')
      .setDescription([
        `玩家：<@${target.id}>`,
        `顯示最近：**${formatNumber(transactions.length)}** / **${formatNumber(totalCount)}** 筆`,
        '',
        transactions.length > 0
          ? transactions.map((tx, index) => formatTransactionLine(tx, index + 1)).join('\n')
          : '目前沒有任何交易紀錄。'
      ].join('\n'))
      .setFooter({ text: '此紀錄只會顯示給你。正數代表獲得，負數代表支出或扣除。' })
      .setTimestamp();

    return interaction.editReply({ embeds: [embed] });
  }
};
