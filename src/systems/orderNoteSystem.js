const {
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags
} = require('discord.js');
const prisma = require('../database/prisma');

const ADMIN_USER_IDS = new Set([
  '473647287026057227',
  '786683877107302461',
  '1319968425698922591'
]);

const COMPLETED_CATEGORY_ID = '1532935027686641894';
const PERSONS = new Set(['林', '陳', '共']);
const MAX_RECENT_LINES = 10;

function privatePayload(payload = {}) {
  return { ...payload, flags: MessageFlags.Ephemeral };
}

function isAdmin(userId) {
  return ADMIN_USER_IDS.has(userId);
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString('en-US');
}

function formatMoneyFromCents(cents) {
  const value = Number(cents || 0) / 100;
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function parseMoneyToCents(raw) {
  const text = String(raw || '').trim().replace(/[$,，\s]/g, '');
  if (!text) return null;
  const value = Number(text);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}

function parsePositiveNumber(raw) {
  const text = String(raw || '').trim().replace(/[,，\s]/g, '');
  const value = Number(text);
  if (!Number.isFinite(value) || value < 0) return null;
  return value;
}

function parseGameCurrency(raw) {
  const value = parsePositiveNumber(raw);
  if (value === null || !Number.isInteger(value)) return null;
  return value;
}

function parseParties(raw) {
  const text = String(raw || '')
    .trim()
    .replace(/收款者?|收款|收入|付款者?|付成本|成本付款者?|成本付款|成本|payer|receiver|by|：|:/gi, '')
    .replace(/[\/|，、]+/g, ',')
    .replace(/\s+/g, ',')
    .replace(/,+/g, ',')
    .replace(/^,|,$/g, '');

  let parts = text.split(',').filter(Boolean);

  if (parts.length === 1 && parts[0].length === 2) {
    parts = [...parts[0]];
  }

  if (parts.length !== 2) return null;
  const [paymentReceiver, costPayer] = parts.map(part => part.trim());

  if (!PERSONS.has(paymentReceiver) || !PERSONS.has(costPayer)) return null;
  return { paymentReceiver, costPayer };
}

function parseDateAndNote(raw) {
  const text = String(raw || '').trim();
  const now = new Date();

  if (!text) {
    return { recordDate: now, note: null };
  }

  const dateMatch = text.match(/^(\d{4}-\d{2}-\d{2})(?:\s*[|｜,，-]\s*)?(.*)$/);
  if (dateMatch) {
    const [, dateText, rest] = dateMatch;
    const recordDate = new Date(`${dateText}T12:00:00.000Z`);
    if (!Number.isNaN(recordDate.getTime())) {
      return { recordDate, note: rest?.trim() || null };
    }
  }

  return { recordDate: now, note: text };
}

function formatDate(date) {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '未知日期';
  return d.toISOString().slice(0, 10);
}

function getDateRange(period, startText, endText) {
  const now = new Date();
  const start = new Date(now);
  const end = new Date(now);

  function startOfDay(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function endOfDay(date) {
    const d = new Date(date);
    d.setHours(23, 59, 59, 999);
    return d;
  }

  function parseDate(text, endOf = false) {
    if (!text) return null;
    const parsed = new Date(`${String(text).trim()}T12:00:00.000Z`);
    if (Number.isNaN(parsed.getTime())) return null;
    return endOf ? endOfDay(parsed) : startOfDay(parsed);
  }

  if (period === 'today') {
    return { start: startOfDay(now), end: endOfDay(now), label: '今天' };
  }

  if (period === 'week') {
    const day = start.getDay();
    const diffToMonday = (day + 6) % 7;
    start.setDate(start.getDate() - diffToMonday);
    return { start: startOfDay(start), end: endOfDay(end), label: '本週' };
  }

  if (period === 'month') {
    start.setDate(1);
    return { start: startOfDay(start), end: endOfDay(end), label: '本月' };
  }

  if (period === 'custom') {
    const customStart = parseDate(startText, false);
    const customEnd = parseDate(endText, true);
    if (!customStart || !customEnd || customStart > customEnd) {
      return { error: '自訂日期格式錯誤，請使用 YYYY-MM-DD，且開始日期不能晚於結束日期。' };
    }
    return {
      start: customStart,
      end: customEnd,
      label: `${formatDate(customStart)} 至 ${formatDate(customEnd)}`
    };
  }

  return { start: null, end: null, label: '全部時間' };
}

function calculateTopupSplit({ incomeCents, gameCurrencyAmount, unitCostRate, paymentReceiver, costPayer }) {
  const costCents = Math.round(gameCurrencyAmount * Number(unitCostRate) * 100);
  const netCents = incomeCents - costCents;
  const shareCents = Math.round(netCents / 2);

  let linActual = 0;
  if (paymentReceiver === '林') linActual += incomeCents;
  else if (paymentReceiver === '共') linActual += incomeCents / 2;

  if (costPayer === '林') linActual -= costCents;
  else if (costPayer === '共') linActual -= costCents / 2;

  const linOverTarget = linActual - netCents / 2;
  let transferDirection = 'SETTLED';
  let transferCents = 0;

  if (Math.abs(linOverTarget) >= 0.5) {
    if (linOverTarget > 0) {
      transferDirection = 'LIN_TO_CHEN';
      transferCents = Math.round(linOverTarget);
    } else {
      transferDirection = 'CHEN_TO_LIN';
      transferCents = Math.round(Math.abs(linOverTarget));
    }
  }

  return {
    costCents,
    netCents,
    shareCents,
    transferDirection,
    transferCents
  };
}

function formatTransfer(direction, cents) {
  const amount = formatMoneyFromCents(cents);
  if (!cents || direction === 'SETTLED') return '不需要轉帳';
  if (direction === 'LIN_TO_CHEN') return `林 需要轉帳 ${amount} 給 陳`;
  if (direction === 'CHEN_TO_LIN') return `陳 需要轉帳 ${amount} 給 林`;
  return '不需要轉帳';
}

function buildNoteSelectPanel() {
  const embed = new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle('🧾 訂單紀錄')
    .setDescription([
      '請選擇要記錄的訂單類型。',
      '',
      '💎 **代儲**：只記錄本次收到的金額。',
      '🎁 **贈禮**：記錄收入、遊戲幣數量、成本單價、收款者與成本付款者。'
    ].join('\n'));

  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('note_select:type')
      .setPlaceholder('選擇訂單類型')
      .addOptions(
        {
          label: '代儲',
          value: 'TOPUP',
          emoji: '💎',
          description: '只記錄收到的金額'
        },
        {
          label: '贈禮',
          value: 'GIFT',
          emoji: '🎁',
          description: '記錄收入、成本、分帳與轉帳結果'
        }
      )
  );

  return { embeds: [embed], components: [row] };
}

function buildTopupModal() {
  const modal = new ModalBuilder()
    .setCustomId('note_modal:TOPUP')
    .setTitle('記錄代儲訂單');

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('income')
        .setLabel('收到金額')
        .setPlaceholder('例如：500')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('dateNote')
        .setLabel('日期/備註（可空白）')
        .setPlaceholder('例如：2026-07-31 | 客人A')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
        .setMaxLength(800)
    )
  );

  return modal;
}

function buildGiftModal() {
  const modal = new ModalBuilder()
    .setCustomId('note_modal:GIFT')
    .setTitle('記錄贈禮訂單');

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('income')
        .setLabel('Income 收入金額')
        .setPlaceholder('例如：1000')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('gameCurrency')
        .setLabel('Game currency spent 遊戲幣數量 R')
        .setPlaceholder('例如：2000')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('unitCostRate')
        .setLabel('成本單價')
        .setPlaceholder('例如：0.135 或 0.15')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('parties')
        .setLabel('收款者,付成本者（林/陳/共）')
        .setPlaceholder('例如：林,陳  或  林,共')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('dateNote')
        .setLabel('日期/備註（可空白）')
        .setPlaceholder('例如：2026-07-31 | 客人B')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
        .setMaxLength(800)
    )
  );

  return modal;
}

async function handleNoteSelect(interaction) {
  if (!interaction.customId.startsWith('note_select:type')) return null;

  if (!isAdmin(interaction.user.id)) {
    return interaction.reply(privatePayload({ content: '你不能這麼做 作弊鬼' }));
  }

  const type = interaction.values[0];
  if (type === 'TOPUP') return interaction.showModal(buildTopupModal());
  if (type === 'GIFT') return interaction.showModal(buildGiftModal());
  return interaction.reply(privatePayload({ content: '❌ 未知的訂單類型。' }));
}

async function moveChannelToCompletedCategory(channel) {
  if (!channel || !channel.guild || typeof channel.setParent !== 'function') return false;
  if (channel.parentId === COMPLETED_CATEGORY_ID) return true;

  await channel.setParent(COMPLETED_CATEGORY_ID, {
    lockPermissions: false,
    reason: '訂單已記錄'
  });

  return true;
}

async function handleNoteModal(interaction) {
  if (!interaction.customId.startsWith('note_modal:')) return null;

  if (!isAdmin(interaction.user.id)) {
    return interaction.reply(privatePayload({ content: '你不能這麼做 作弊鬼' }));
  }

  const type = interaction.customId.split(':')[1];
  const incomeCents = parseMoneyToCents(interaction.fields.getTextInputValue('income'));
  if (incomeCents === null) {
    return interaction.reply(privatePayload({ content: '❌ 收入金額格式錯誤。' }));
  }

  const { recordDate, note } = parseDateAndNote(interaction.fields.getTextInputValue('dateNote'));

  let data;
  if (type === 'TOPUP') {
    data = {
      type: 'TOPUP',
      incomeCents,
      note,
      recordDate,
      submittedByDiscordId: interaction.user.id
    };
  } else if (type === 'GIFT') {
    const gameCurrencyAmount = parseGameCurrency(interaction.fields.getTextInputValue('gameCurrency'));
    const unitCostRate = parsePositiveNumber(interaction.fields.getTextInputValue('unitCostRate'));
    const parties = parseParties(interaction.fields.getTextInputValue('parties'));

    if (gameCurrencyAmount === null) {
      return interaction.reply(privatePayload({ content: '❌ 遊戲幣數量 R 必須是 0 或正整數。' }));
    }

    if (unitCostRate === null) {
      return interaction.reply(privatePayload({ content: '❌ 成本單價格式錯誤，例如：0.135。' }));
    }

    if (!parties) {
      return interaction.reply(privatePayload({ content: '❌ 收款者/付成本者格式錯誤，請輸入：林,陳、林,共、共,陳 等。' }));
    }

    const split = calculateTopupSplit({
      incomeCents,
      gameCurrencyAmount,
      unitCostRate,
      paymentReceiver: parties.paymentReceiver,
      costPayer: parties.costPayer
    });

    data = {
      type: 'GIFT',
      incomeCents,
      gameCurrencyAmount,
      unitCostRate: String(unitCostRate),
      costCents: split.costCents,
      netCents: split.netCents,
      shareCents: split.shareCents,
      paymentReceiver: parties.paymentReceiver,
      costPayer: parties.costPayer,
      transferDirection: split.transferDirection,
      transferCents: split.transferCents,
      note,
      recordDate,
      submittedByDiscordId: interaction.user.id
    };
  } else {
    return interaction.reply(privatePayload({ content: '❌ 未知的訂單類型。' }));
  }

  await interaction.deferReply();

  await prisma.orderNote.create({ data });

  await moveChannelToCompletedCategory(interaction.channel).catch(error => {
    console.warn('[note] Failed to move channel:', error?.message || error);
  });

  return interaction.editReply({ content: '✅ 訂單已記錄 請不要重複紀錄' });
}

function summarizeNotes(records) {
  const summary = {
    topupCount: 0,
    topupIncomeCents: 0,
    giftCount: 0,
    giftIncomeCents: 0,
    giftGameCurrencyAmount: 0,
    giftCostCents: 0,
    giftNetCents: 0,
    giftShareCents: 0,
    linToChenCents: 0,
    chenToLinCents: 0,
    totalEarningCents: 0
  };

  for (const record of records) {
    if (record.type === 'TOPUP') {
      summary.topupCount += 1;
      summary.topupIncomeCents += record.incomeCents;
      continue;
    }

    if (record.type === 'GIFT') {
      summary.giftCount += 1;
      summary.giftIncomeCents += record.incomeCents;
      summary.giftGameCurrencyAmount += record.gameCurrencyAmount;
      summary.giftCostCents += record.costCents;
      summary.giftNetCents += record.netCents;
      summary.giftShareCents += record.shareCents;

      if (record.transferDirection === 'LIN_TO_CHEN') summary.linToChenCents += record.transferCents;
      if (record.transferDirection === 'CHEN_TO_LIN') summary.chenToLinCents += record.transferCents;
    }
  }

  summary.totalEarningCents = summary.topupIncomeCents + summary.giftNetCents;

  return summary;
}

function formatFinalSettlement(summary) {
  const net = summary.linToChenCents - summary.chenToLinCents;
  if (net > 0) return `林 需要轉帳 ${formatMoneyFromCents(net)} 給 陳`;
  if (net < 0) return `陳 需要轉帳 ${formatMoneyFromCents(Math.abs(net))} 給 林`;
  return '目前全部結清';
}

function formatRecentRecord(record) {
  const shortId = record.id.slice(0, 8);
  const date = formatDate(record.recordDate);
  const noteText = record.note ? `｜${record.note}` : '';

  if (record.type === 'TOPUP') {
    return `💎 **${shortId}**｜${date}｜代儲收入 ${formatMoneyFromCents(record.incomeCents)}${noteText}`;
  }

  return [
    `🎁 **${shortId}**｜${date}｜贈禮`,
    `收入 ${formatMoneyFromCents(record.incomeCents)}｜R ${formatNumber(record.gameCurrencyAmount)}｜成本 ${formatMoneyFromCents(record.costCents)}｜淨利 ${formatMoneyFromCents(record.netCents)}`,
    `收款：${record.paymentReceiver}｜付成本：${record.costPayer}｜結果：${formatTransfer(record.transferDirection, record.transferCents)}${noteText}`
  ].join('\n');
}

async function buildShownoteEmbed({ period = 'all', start, end, type = 'all' }) {
  const range = getDateRange(period, start, end);
  if (range.error) return { error: range.error };

  const where = {};
  if (type && type !== 'all') where.type = type.toUpperCase();
  if (range.start && range.end) {
    where.recordDate = { gte: range.start, lte: range.end };
  }

  const records = await prisma.orderNote.findMany({
    where,
    orderBy: { recordDate: 'desc' }
  });

  if (records.length === 0) {
    return {
      embeds: [
        new EmbedBuilder()
          .setColor(0x95a5a6)
          .setTitle('🧾 訂單紀錄總覽')
          .setDescription('沒有已記錄的訂單')
      ]
    };
  }

  const summary = summarizeNotes(records);
  const recent = records.slice(0, MAX_RECENT_LINES).map(formatRecentRecord).join('\n\n');

  const embed = new EmbedBuilder()
    .setColor(0x2ecc71)
    .setTitle('🧾 訂單紀錄總覽')
    .setDescription([
      `📅 範圍：**${range.label}**`,
      `📌 紀錄數量：**${formatNumber(records.length)}** 筆`,
      '',
      `💰 **TOTAL 總收益：${formatMoneyFromCents(summary.totalEarningCents)}**`
    ].join('\n'))
    .addFields(
      {
        name: '💎 代儲收益',
        value: [
          `總收益：**${formatMoneyFromCents(summary.topupIncomeCents)}**`,
          `訂單數：**${formatNumber(summary.topupCount)}** 筆`
        ].join('\n'),
        inline: true
      },
      {
        name: '🎁 贈禮收益',
        value: [
          `總收益：**${formatMoneyFromCents(summary.giftNetCents)}**`,
          `總收入：${formatMoneyFromCents(summary.giftIncomeCents)}`,
          `總成本：${formatMoneyFromCents(summary.giftCostCents)}`,
          `訂單數：**${formatNumber(summary.giftCount)}** 筆`
        ].join('\n'),
        inline: true
      },
      {
        name: '📊 贈禮資料',
        value: [
          `遊戲幣總量：**${formatNumber(summary.giftGameCurrencyAmount)} R**`,
          `每人分潤合計：**${formatMoneyFromCents(summary.giftShareCents)}**`,
          `最終對帳：**${formatFinalSettlement(summary)}**`
        ].join('\n'),
        inline: false
      },
      {
        name: `🧾 最近紀錄${records.length > MAX_RECENT_LINES ? `（顯示最近 ${MAX_RECENT_LINES} 筆）` : ''}`,
        value: recent || '沒有最近紀錄',
        inline: false
      }
    )
    .setFooter({ text: 'JK遊戲商城 訂單紀錄' })
    .setTimestamp();

  return { embeds: [embed] };
}

function buildCleanConfirmPanel(userId) {
  const embed = new EmbedBuilder()
    .setColor(0xe74c3c)
    .setTitle('⚠️ 確認清除訂單紀錄')
    .setDescription('此操作會清除所有 `/note` 已記錄的訂單資料。\n請確認是否繼續。');

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`note_clean:confirm:${userId}`)
      .setLabel('確認清除')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('🗑️'),
    new ButtonBuilder()
      .setCustomId(`note_clean:cancel:${userId}`)
      .setLabel('取消')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('✖️')
  );

  return privatePayload({ embeds: [embed], components: [row] });
}

async function handleCleanNoteButton(interaction) {
  if (!interaction.customId.startsWith('note_clean:')) return null;

  const [, action, ownerId] = interaction.customId.split(':');
  if (interaction.user.id !== ownerId) {
    return interaction.reply(privatePayload({ content: '這不是你的確認按鈕。' }));
  }

  if (!isAdmin(interaction.user.id)) {
    return interaction.reply(privatePayload({ content: '你不能這麼做 作弊鬼' }));
  }

  if (action === 'cancel') {
    return interaction.update({ content: '已取消清除。', embeds: [], components: [] });
  }

  if (action === 'confirm') {
    const result = await prisma.orderNote.deleteMany({});
    return interaction.update({
      content: `✅ 已清除 ${formatNumber(result.count)} 筆訂單紀錄。`,
      embeds: [],
      components: []
    });
  }

  return null;
}

function runCalculationSelfTest() {
  const examples = [
    { incomeCents: 0, gameCurrencyAmount: 400, unitCostRate: 0.135, paymentReceiver: '林', costPayer: '林', expected: ['CHEN_TO_LIN', 2700] },
    { incomeCents: 0, gameCurrencyAmount: 400, unitCostRate: 0.135, paymentReceiver: '陳', costPayer: '陳', expected: ['LIN_TO_CHEN', 2700] },
    { incomeCents: 100000, gameCurrencyAmount: 2000, unitCostRate: 0.135, paymentReceiver: '林', costPayer: '林', expected: ['LIN_TO_CHEN', 36500] },
    { incomeCents: 100000, gameCurrencyAmount: 2000, unitCostRate: 0.135, paymentReceiver: '林', costPayer: '陳', expected: ['LIN_TO_CHEN', 63500] },
    { incomeCents: 100000, gameCurrencyAmount: 2000, unitCostRate: 0.135, paymentReceiver: '陳', costPayer: '林', expected: ['CHEN_TO_LIN', 63500] },
    { incomeCents: 100000, gameCurrencyAmount: 2000, unitCostRate: 0.135, paymentReceiver: '林', costPayer: '共', expected: ['LIN_TO_CHEN', 50000] },
    { incomeCents: 0, gameCurrencyAmount: 400, unitCostRate: 0.135, paymentReceiver: '林', costPayer: '共', expected: ['SETTLED', 0] }
  ];

  return examples.every(example => {
    const result = calculateTopupSplit(example);
    return result.transferDirection === example.expected[0] && result.transferCents === example.expected[1];
  });
}

module.exports = {
  ADMIN_USER_IDS,
  COMPLETED_CATEGORY_ID,
  isAdmin,
  privatePayload,
  buildNoteSelectPanel,
  handleNoteSelect,
  handleNoteModal,
  buildShownoteEmbed,
  buildCleanConfirmPanel,
  handleCleanNoteButton,
  calculateTopupSplit,
  runCalculationSelfTest,
  formatMoneyFromCents
};
