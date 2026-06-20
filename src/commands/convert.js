const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags
} = require('discord.js');
const { addCoins, spendCoins, spendJK, getBalance } = require('../systems/economySystem');
const { createPendingJkConversion, getPendingJkSummaryByUserId } = require('../systems/pendingJkSystem');
const { JK_CONVERSION_RATE } = require('../config/economyConfig');
const { formatCoins, formatJK, formatDuration } = require('../utils/format');

function privatePayload(payload = {}) {
  return { ...payload, flags: MessageFlags.Ephemeral };
}

const CURRENCIES = {
  coins: {
    label: '金幣',
    emoji: '🪙',
    valueName: 'Coins'
  },
  jk: {
    label: 'JK餘額',
    emoji: '💎',
    valueName: 'JK餘額'
  }
};

function oppositeCurrency(currency) {
  return currency === 'coins' ? 'jk' : 'coins';
}

function currencyName(currency) {
  return `${CURRENCIES[currency].emoji} ${CURRENCIES[currency].label}`;
}

function formatAmountByCurrency(currency, amount) {
  return currency === 'coins' ? formatCoins(amount) : formatJK(amount);
}

function parsePositiveInteger(raw) {
  const cleaned = String(raw || '').replace(/[,，\s]/g, '');
  if (!/^\d+$/.test(cleaned)) return null;
  const value = Number(cleaned);
  if (!Number.isSafeInteger(value) || value <= 0) return null;
  return value;
}

function buildSelectCustomId(kind, userId, from, to) {
  return `convert_select:${kind}:${userId}:${from}:${to}`;
}

function buildButtonCustomId(action, userId, from, to) {
  return `convert_btn:${action}:${userId}:${from}:${to}`;
}

function buildModalCustomId(userId, from, to) {
  return `convert_modal:${userId}:${from}:${to}`;
}

function parseSelectCustomId(customId) {
  const [, kind, userId, from, to] = customId.split(':');
  return { kind, userId, from, to };
}

function parseButtonCustomId(customId) {
  const [, action, userId, from, to] = customId.split(':');
  return { action, userId, from, to };
}

function parseModalCustomId(customId) {
  const [, userId, from, to] = customId.split(':');
  return { userId, from, to };
}

function validateCurrency(value) {
  return value === 'coins' || value === 'jk';
}

function buildConvertSessionEmbed({ from = 'coins', to = 'jk', status = null, color = 0x3498db } = {}) {
  const lines = [
    '請先選擇兌換方向，再點擊 **開始兌換** 輸入數量。',
    '',
    `把：**${currencyName(from)}**`,
    `換成：**${currencyName(to)}**`,
    '',
    '💱 **兌換比例**',
    `**${formatCoins(JK_CONVERSION_RATE)} = 1 JK餘額**`,
    `**1 JK餘額 = ${formatCoins(JK_CONVERSION_RATE)}**`,
    '',
    '🕒 **金幣換成 JK餘額**',
    '會先進入 **待結算 JK餘額** 24 小時。',
    '待結算期間仍可被 **幻影怪盜** 偷竊。'
  ];

  if (status) lines.push('', status);

  return new EmbedBuilder()
    .setColor(color)
    .setTitle('🔁 兌換餘額')
    .setDescription(lines.join('\n'));
}

function currencyOption(value, currentValue) {
  return new StringSelectMenuOptionBuilder()
    .setLabel(CURRENCIES[value].label)
    .setValue(value)
    .setEmoji(CURRENCIES[value].emoji)
    .setDescription(value === 'coins' ? '使用金幣作為兌換來源或目標' : '使用 JK餘額作為兌換來源或目標')
    .setDefault(value === currentValue);
}

function buildConvertSessionComponents(userId, from = 'coins', to = 'jk', disabled = false) {
  const fromMenu = new StringSelectMenuBuilder()
    .setCustomId(buildSelectCustomId('from', userId, from, to))
    .setPlaceholder(`把：${CURRENCIES[from].label}`)
    .setDisabled(disabled)
    .addOptions(currencyOption('coins', from), currencyOption('jk', from));

  const toMenu = new StringSelectMenuBuilder()
    .setCustomId(buildSelectCustomId('to', userId, from, to))
    .setPlaceholder(`換成：${CURRENCIES[to].label}`)
    .setDisabled(disabled)
    .addOptions(currencyOption('coins', to), currencyOption('jk', to));

  return [
    new ActionRowBuilder().addComponents(fromMenu),
    new ActionRowBuilder().addComponents(toMenu),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(buildButtonCustomId('start', userId, from, to))
        .setLabel('開始兌換')
        .setEmoji('✅')
        .setStyle(ButtonStyle.Success)
        .setDisabled(disabled || from === to),
      new ButtonBuilder()
        .setCustomId(buildButtonCustomId('cancel', userId, from, to))
        .setLabel('取消')
        .setEmoji('❌')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled)
    )
  ];
}

function createConvertSessionUi(userId, from = 'coins', to = 'jk', status = null) {
  return {
    embeds: [buildConvertSessionEmbed({ from, to, status })],
    components: buildConvertSessionComponents(userId, from, to)
  };
}

// Backward compatibility for older panel code. Amount is ignored because the new UI asks amount after direction selection.
function createConvertUi(userId) {
  return createConvertSessionUi(userId);
}

async function assertOwner(interaction, userId) {
  if (interaction.user.id !== userId) {
    await interaction.reply(privatePayload({
      content: '❌ 這不是你的兌換介面，請自己使用 /兌換 開啟新的介面。'
    })).catch(() => null);
    return false;
  }
  return true;
}

module.exports = {
  createConvertUi,
  createConvertSessionUi,
  data: new SlashCommandBuilder()
    .setName('兌換')
    .setDescription('開啟金幣與 JK餘額的兌換介面'),

  async execute(interaction) {
    return interaction.reply(privatePayload(createConvertSessionUi(interaction.user.id)));
  },

  async handleSelect(interaction) {
    const state = parseSelectCustomId(interaction.customId);
    if (!(await assertOwner(interaction, state.userId))) return;

    let { from, to } = state;
    const selected = interaction.values?.[0];

    if (!validateCurrency(from) || !validateCurrency(to) || !validateCurrency(selected)) {
      return interaction.reply(privatePayload({ content: '❌ 兌換方向錯誤，請重新使用 /兌換。' })).catch(() => null);
    }

    if (state.kind === 'from') {
      from = selected;
      if (from === to) to = oppositeCurrency(from);
    } else if (state.kind === 'to') {
      to = selected;
      if (from === to) from = oppositeCurrency(to);
    } else {
      return interaction.reply(privatePayload({ content: '❌ 無效的兌換選單。' })).catch(() => null);
    }

    return interaction.update(createConvertSessionUi(state.userId, from, to));
  },

  async handleButton(interaction) {
    const state = parseButtonCustomId(interaction.customId);
    if (!(await assertOwner(interaction, state.userId))) return;

    let { from, to } = state;
    if (!validateCurrency(from) || !validateCurrency(to)) {
      return interaction.reply(privatePayload({ content: '❌ 兌換方向錯誤，請重新使用 /兌換。' })).catch(() => null);
    }

    if (state.action === 'cancel') {
      const embed = buildConvertSessionEmbed({
        from,
        to,
        color: 0xe74c3c,
        status: '❌ **兌換已取消。**'
      });
      return interaction.update({ embeds: [embed], components: buildConvertSessionComponents(state.userId, from, to, true) });
    }

    if (state.action !== 'start') {
      return interaction.reply(privatePayload({ content: '❌ 無效的兌換操作。' })).catch(() => null);
    }

    if (from === to) {
      return interaction.reply(privatePayload({ content: '❌ 不能把同一種貨幣兌換成自己。' })).catch(() => null);
    }

    const modal = new ModalBuilder()
      .setCustomId(buildModalCustomId(state.userId, from, to))
      .setTitle(`兌換餘額｜${CURRENCIES[from].label} → ${CURRENCIES[to].label}`);

    const amountInput = new TextInputBuilder()
      .setCustomId('amount')
      .setLabel(`請輸入要使用的${CURRENCIES[from].label}數量`)
      .setPlaceholder(from === 'coins' ? '例如：1000、5000、10000' : '例如：1、5、10')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(amountInput));
    return interaction.showModal(modal);
  },

  async handleModal(interaction) {
    const state = parseModalCustomId(interaction.customId);
    if (!(await assertOwner(interaction, state.userId))) return;

    const { from, to } = state;
    if (!validateCurrency(from) || !validateCurrency(to) || from === to) {
      return interaction.reply(privatePayload({ content: '❌ 兌換方向錯誤，請重新使用 /兌換。' })).catch(() => null);
    }

    const amount = parsePositiveInteger(interaction.fields.getTextInputValue('amount'));
    if (!amount) {
      return interaction.reply(privatePayload({ content: '❌ 請輸入有效的兌換數量。' })).catch(() => null);
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (from === 'coins' && to === 'jk') {
      if (amount % JK_CONVERSION_RATE !== 0) {
        return interaction.editReply({
          content: `❌ 金幣兌換成 JK餘額時，金幣數量必須是 ${formatCoins(JK_CONVERSION_RATE)} 的倍數。`
        });
      }

      const jkAmount = Math.floor(amount / JK_CONVERSION_RATE);
      const spent = await spendCoins(interaction.user, amount, 'CONVERT', '金幣兌換成待結算 JK餘額');

      if (!spent.ok) {
        return interaction.editReply({ content: '❌ 你的金幣不足，無法完成兌換。' });
      }

      const user = await getBalance(interaction.user);
      const pending = await createPendingJkConversion(user.id, amount);
      const pendingSummary = await getPendingJkSummaryByUserId(user.id);
      const updated = await getBalance(interaction.user);
      const remainingMs = pending.availableAt.getTime() - Date.now();

      const embed = new EmbedBuilder()
        .setColor(0x2ecc71)
        .setTitle('✅ 兌換成功｜待結算中')
        .setDescription([
          `把：**${currencyName(from)}**`,
          `換成：**待結算 JK餘額**`,
          '',
          `使用數量：**${formatCoins(amount)}**`,
          `待結算數量：**${formatJK(jkAmount)}**`,
          `結算時間：**${formatDuration(remainingMs)} 後**`,
          '',
          `目前金幣：**${formatCoins(updated.coins)}**`,
          `正式 JK餘額：**${formatJK(updated.jkBalance)}**`,
          `待結算 JK餘額：約 **${formatJK(Math.floor(pendingSummary.pendingCoins / JK_CONVERSION_RATE))}**`
        ].join('\n'));

      return interaction.editReply({ embeds: [embed] });
    }

    if (from === 'jk' && to === 'coins') {
      const coinsAmount = amount * JK_CONVERSION_RATE;
      const spent = await spendJK(interaction.user, amount, 'CONVERT', 'JK餘額兌換成金幣');

      if (!spent.ok) {
        return interaction.editReply({ content: '❌ 你的正式 JK餘額不足，無法完成兌換。待結算 JK餘額不能提前使用。' });
      }

      await addCoins(interaction.user, coinsAmount, 'CONVERT', 'JK餘額兌換成金幣');
      const updated = await getBalance(interaction.user);

      const embed = new EmbedBuilder()
        .setColor(0x2ecc71)
        .setTitle('✅ 兌換成功')
        .setDescription([
          `把：**${currencyName(from)}**`,
          `換成：**${currencyName(to)}**`,
          '',
          `使用數量：**${formatJK(amount)}**`,
          `獲得數量：**${formatCoins(coinsAmount)}**`,
          '',
          `目前金幣：**${formatCoins(updated.coins)}**`,
          `目前 JK餘額：**${formatJK(updated.jkBalance)}**`
        ].join('\n'));

      return interaction.editReply({ embeds: [embed] });
    }

    return interaction.editReply({ content: '❌ 兌換設定錯誤，請重新選擇貨幣。' });
  }
};
