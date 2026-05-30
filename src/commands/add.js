const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { addCoins, addJK } = require('../systems/economySystem');
const { formatCoins, formatJK } = require('../utils/format');

const ALLOWED_USER_IDS = new Set([
  '473647287026057227',
  '786683877107302461',
  '1319968425698922591'
]);

module.exports = {
  data: new SlashCommandBuilder()
    .setName('add')
    .setDescription('管理員專用：新增金幣或 JK餘額')
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('要新增餘額的使用者')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('currency')
        .setDescription('選擇要新增的貨幣')
        .setRequired(true)
        .addChoices(
          { name: '金幣', value: 'coins' },
          { name: 'JK餘額', value: 'jk' }
        )
    )
    .addIntegerOption(option =>
      option
        .setName('amount')
        .setDescription('要新增的數量')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(100000000)
    ),

  async execute(interaction) {
    if (!ALLOWED_USER_IDS.has(interaction.user.id)) {
      return interaction.reply({ content: '你不能這麼做 作弊鬼' });
    }

    const target = interaction.options.getUser('user');
    const currency = interaction.options.getString('currency');
    const amount = interaction.options.getInteger('amount');

    let updated;
    let formattedAmount;
    let currencyLabel;

    if (currency === 'jk') {
      updated = await addJK(target, amount, 'ADMIN_ADD', `管理員 ${interaction.user.tag} 新增 JK餘額`);
      formattedAmount = formatJK(amount);
      currencyLabel = 'JK餘額';
    } else {
      updated = await addCoins(target, amount, 'ADMIN_ADD', `管理員 ${interaction.user.tag} 新增金幣`);
      formattedAmount = formatCoins(amount);
      currencyLabel = '金幣';
    }

    const embed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle('✅ 新增成功')
      .setDescription([
        `執行者：<@${interaction.user.id}>`,
        `目標使用者：<@${target.id}>`,
        `新增貨幣：**${currencyLabel}**`,
        `新增數量：**${formattedAmount}**`,
        '',
        `目前金幣：**${formatCoins(updated.coins)}**`,
        `目前 JK餘額：**${formatJK(updated.jkBalance)}**`
      ].join('\n'));

    return interaction.reply({ embeds: [embed] });
  }
};
