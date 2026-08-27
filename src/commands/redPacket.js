const { SlashCommandBuilder, ChannelType, MessageFlags } = require('discord.js');
const { createRedPacketPanel } = require('../systems/redPacketSystem');
const { formatCoins, formatEventCoins, formatJK } = require('../utils/format');

const ADMIN_USER_IDS = [
  '473647287026057227',
  '786683877107302461',
  '1319968425698922591',
  '1535635248157827102'
];

function privatePayload(payload = {}) {
  return { ...payload, flags: MessageFlags.Ephemeral };
}

function isAdmin(userId) {
  return ADMIN_USER_IDS.includes(userId);
}

function formatByCurrency(currency, amount) {
  if (currency === 'jk') return formatJK(amount);
  if (currency === 'event_coins') return formatEventCoins(amount);
  return formatCoins(amount);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('發福袋')
    .setDescription('管理員專用：發送限量福袋獎勵')
    .addChannelOption(option =>
      option
        .setName('channel')
        .setDescription('要發送福袋的頻道')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('currency')
        .setDescription('要發放的貨幣')
        .setRequired(true)
        .addChoices(
          { name: '金幣', value: 'coins' },
          { name: '活動金幣', value: 'event_coins' },
          { name: 'JK餘額', value: 'jk' }
        )
    )
    .addIntegerOption(option =>
      option
        .setName('amount')
        .setDescription('福袋總金額')
        .setMinValue(1)
        .setMaxValue(100000000)
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName('players')
        .setDescription('最多可以幾個玩家領取')
        .setMinValue(1)
        .setMaxValue(100)
        .setRequired(true)
    ),

  async execute(interaction) {
    if (!isAdmin(interaction.user.id)) {
      return interaction.reply(privatePayload({ content: '你不能這麼做 作弊鬼' }));
    }

    const channel = interaction.options.getChannel('channel');
    const currency = interaction.options.getString('currency');
    const amount = interaction.options.getInteger('amount');
    const playerLimit = interaction.options.getInteger('players');

    if (!channel || !channel.isTextBased()) {
      return interaction.reply(privatePayload({ content: '❌ 請選擇可以發送訊息的文字頻道。' }));
    }

    if (amount < playerLimit) {
      return interaction.reply(privatePayload({ content: '❌ 福袋總金額必須至少等於可領人數，才能保證每人至少拿到 1。' }));
    }

    await createRedPacketPanel({
      interaction,
      channel,
      currency,
      totalAmount: amount,
      playerLimit
    });

    return interaction.reply(privatePayload({
      content: `✅ 已在 ${channel} 發送福袋：**${formatByCurrency(currency, amount)}** / **${playerLimit} 人**。`
    }));
  }
};
