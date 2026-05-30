const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags
} = require('discord.js');
const { addCoins, spendCoins, addJK, spendJK, getBalance } = require('../systems/economySystem');
const { JK_CONVERSION_RATE } = require('../config/economyConfig');
const { formatCoins, formatJK } = require('../utils/format');

function privatePayload(payload = {}) {
  return { ...payload, flags: MessageFlags.Ephemeral };
}


const CURRENCIES = {
  coins: {
    label: '金幣',
    emoji: '🪙'
  },
  jk: {
    label: 'JK餘額',
    emoji: '💎'
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

function buildCustomId(action, userId, amount, from, to) {
  return `convert:${action}:${userId}:${amount}:${from}:${to}`;
}

function parseCustomId(customId) {
  const [, action, userId, amountRaw, from, to] = customId.split(':');
  return {
    action,
    userId,
    amount: Number(amountRaw),
    from,
    to
  };
}

function buildConvertEmbed({ amount, from, to, status = null, color = 0x3498db }) {
  const lines = [
    '請使用下方按鈕設定兌換方向。',
    '',
    '📦 **兌換數量**',
    `**${formatAmountByCurrency(from, amount)}**`,
    '',
    '🔁 **目前兌換方向**',
    `**${currencyName(from)} ➜ ${currencyName(to)}**`,
    '',
    '💱 **兌換比例**',
    `**${formatCoins(JK_CONVERSION_RATE)} = 1 JK餘額**`,
    `**1 JK餘額 = ${formatCoins(JK_CONVERSION_RATE)}**`,
    '',
    '✅ 確認前請看清楚方向，避免換錯貨幣。'
  ];

  if (status) {
    lines.push('', status);
  }

  return new EmbedBuilder()
    .setColor(color)
    .setTitle('🔁 貨幣兌換')
    .setDescription(lines.join('\n'))
    .setFooter({ text: '只有發起兌換的玩家可以操作此介面。' });
}

function buildComponents(userId, amount, from, to, disabled = false) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(buildCustomId('toggle_from', userId, amount, from, to))
        .setLabel(`把：${CURRENCIES[from].label}`)
        .setEmoji(CURRENCIES[from].emoji)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled),
      new ButtonBuilder()
        .setCustomId(buildCustomId('toggle_to', userId, amount, from, to))
        .setLabel(`換成：${CURRENCIES[to].label}`)
        .setEmoji(CURRENCIES[to].emoji)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled),
      new ButtonBuilder()
        .setCustomId(buildCustomId('confirm', userId, amount, from, to))
        .setLabel('確認兌換')
        .setEmoji('✅')
        .setStyle(ButtonStyle.Success)
        .setDisabled(disabled),
      new ButtonBuilder()
        .setCustomId(buildCustomId('cancel', userId, amount, from, to))
        .setLabel('取消')
        .setEmoji('❌')
        .setStyle(ButtonStyle.Danger)
        .setDisabled(disabled)
    )
  ];
}

function createConvertUi(userId, amount, from = 'coins', to = 'jk') {
  return {
    embeds: [buildConvertEmbed({ amount, from, to })],
    components: buildComponents(userId, amount, from, to)
  };
}

module.exports = {
  createConvertUi,
  data: new SlashCommandBuilder()
    .setName('兌換')
    .setDescription('開啟金幣與 JK餘額的兌換介面')
    .addIntegerOption(option =>
      option
        .setName('amount')
        .setDescription('要兌換的數量，會依照你在介面選擇的來源貨幣計算')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(100000000)
    ),

  async execute(interaction) {
    const amount = interaction.options.getInteger('amount');
    const from = 'coins';
    const to = 'jk';

    const embed = buildConvertEmbed({ amount, from, to });
    const components = buildComponents(interaction.user.id, amount, from, to);

    return interaction.reply(privatePayload({ embeds: [embed], components }));
  },

  async handleButton(interaction) {
    const state = parseCustomId(interaction.customId);

    if (interaction.user.id !== state.userId) {
      return interaction.reply(privatePayload({
        content: '❌ 這不是你的兌換介面，請自己使用 /兌換 開啟新的介面。'
      })).catch(() => null);
    }

    let { amount, from, to } = state;

    if (!Number.isInteger(amount) || amount <= 0) {
      return interaction.reply(privatePayload({ content: '❌ 兌換數量錯誤，請重新使用 /兌換。' })).catch(() => null);
    }

    if (state.action === 'cancel') {
      const embed = buildConvertEmbed({
        amount,
        from,
        to,
        color: 0xe74c3c,
        status: '❌ **兌換已取消。**'
      });

      return interaction.update({ embeds: [embed], components: buildComponents(state.userId, amount, from, to, true) });
    }

    if (state.action === 'toggle_from') {
      from = oppositeCurrency(from);
      if (from === to) to = oppositeCurrency(from);

      const embed = buildConvertEmbed({ amount, from, to });
      return interaction.update({ embeds: [embed], components: buildComponents(state.userId, amount, from, to) });
    }

    if (state.action === 'toggle_to') {
      to = oppositeCurrency(to);
      if (from === to) from = oppositeCurrency(to);

      const embed = buildConvertEmbed({ amount, from, to });
      return interaction.update({ embeds: [embed], components: buildComponents(state.userId, amount, from, to) });
    }

    if (state.action !== 'confirm') {
      return interaction.reply(privatePayload({ content: '❌ 無效的兌換操作。' })).catch(() => null);
    }

    await interaction.deferUpdate();

    if (from === to) {
      const embed = buildConvertEmbed({
        amount,
        from,
        to,
        color: 0xe74c3c,
        status: '❌ **不能把同一種貨幣兌換成自己。**'
      });
      return interaction.editReply({ embeds: [embed], components: buildComponents(state.userId, amount, from, to) });
    }

    // 金幣 -> JK餘額
    if (from === 'coins' && to === 'jk') {
      if (amount % JK_CONVERSION_RATE !== 0) {
        const embed = buildConvertEmbed({
          amount,
          from,
          to,
          color: 0xe74c3c,
          status: `❌ **金幣兌換成 JK餘額時，金幣數量必須是 ${formatCoins(JK_CONVERSION_RATE)} 的倍數。**\n例如：1,000、2,000、10,000 金幣。`
        });
        return interaction.editReply({ embeds: [embed], components: buildComponents(state.userId, amount, from, to) });
      }

      const jkAmount = Math.floor(amount / JK_CONVERSION_RATE);
      const spent = await spendCoins(interaction.user, amount, 'CONVERT', '金幣兌換成 JK餘額');

      if (!spent.ok) {
        const embed = buildConvertEmbed({
          amount,
          from,
          to,
          color: 0xe74c3c,
          status: '❌ **你的金幣不足，無法完成兌換。**'
        });
        return interaction.editReply({ embeds: [embed], components: buildComponents(state.userId, amount, from, to) });
      }

      await addJK(interaction.user, jkAmount, 'CONVERT', '金幣兌換成 JK餘額');
      const updated = await getBalance(interaction.user);

      const embed = new EmbedBuilder()
        .setColor(0x2ecc71)
        .setTitle('✅ 兌換成功')
        .setDescription([
          '🔁 **兌換方向**',
          `**${currencyName(from)} ➜ ${currencyName(to)}**`,
          '',
          `你使用了：**${formatCoins(amount)}**`,
          `你獲得了：**${formatJK(jkAmount)}**`,
          '',
          `目前金幣：**${formatCoins(updated.coins)}**`,
          `目前 JK餘額：**${formatJK(updated.jkBalance)}**`
        ].join('\n'));

      return interaction.editReply({ embeds: [embed], components: [] });
    }

    // JK餘額 -> 金幣
    if (from === 'jk' && to === 'coins') {
      const coinsAmount = amount * JK_CONVERSION_RATE;
      const spent = await spendJK(interaction.user, amount, 'CONVERT', 'JK餘額兌換成金幣');

      if (!spent.ok) {
        const embed = buildConvertEmbed({
          amount,
          from,
          to,
          color: 0xe74c3c,
          status: '❌ **你的 JK餘額不足，無法完成兌換。**'
        });
        return interaction.editReply({ embeds: [embed], components: buildComponents(state.userId, amount, from, to) });
      }

      await addCoins(interaction.user, coinsAmount, 'CONVERT', 'JK餘額兌換成金幣');
      const updated = await getBalance(interaction.user);

      const embed = new EmbedBuilder()
        .setColor(0x2ecc71)
        .setTitle('✅ 兌換成功')
        .setDescription([
          '🔁 **兌換方向**',
          `**${currencyName(from)} ➜ ${currencyName(to)}**`,
          '',
          `你使用了：**${formatJK(amount)}**`,
          `你獲得了：**${formatCoins(coinsAmount)}**`,
          '',
          `目前金幣：**${formatCoins(updated.coins)}**`,
          `目前 JK餘額：**${formatJK(updated.jkBalance)}**`
        ].join('\n'));

      return interaction.editReply({ embeds: [embed], components: [] });
    }

    const embed = buildConvertEmbed({
      amount,
      from,
      to,
      color: 0xe74c3c,
      status: '❌ **兌換設定錯誤，請重新選擇貨幣。**'
    });
    return interaction.editReply({ embeds: [embed], components: buildComponents(state.userId, amount, from, to) });
  }
};
