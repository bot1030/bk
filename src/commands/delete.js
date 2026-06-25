const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { spendCoins, spendEventCoins, spendJK, spendPendingJK, getBalance } = require('../systems/economySystem');
const { getPendingJkSummaryByUserId } = require('../systems/pendingJkSystem');
const { formatCoins, formatEventCoins, formatCoinsWithEvent, formatJK } = require('../utils/format');

const ALLOWED_USER_IDS = new Set([
  '473647287026057227',
  '786683877107302461',
  '1319968425698922591'
]);

module.exports = {
  data: new SlashCommandBuilder()
    .setName('delete')
    .setDescription('管理員專用：刪除玩家的金幣、活動金幣、JK餘額或待結算 JK餘額')
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('要刪除餘額的使用者')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('currency')
        .setDescription('選擇要刪除的貨幣')
        .setRequired(true)
        .addChoices(
          { name: '金幣', value: 'coins' },
          { name: '活動金幣', value: 'event_coins' },
          { name: 'JK餘額', value: 'jk' },
          { name: '待結算 JK餘額', value: 'pending_jk' }
        )
    )
    .addIntegerOption(option =>
      option
        .setName('amount')
        .setDescription('要刪除的數量')
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

    const current = await getBalance(target);

    let result;
    let formattedAmount;
    let currencyLabel;

    if (currency === 'jk') {
      if (current.jkBalance < amount) {
        return interaction.reply({
          content: `❌ 目標使用者的 JK餘額不足。\n目前 JK餘額：**${formatJK(current.jkBalance)}**\n嘗試刪除：**${formatJK(amount)}**`
        });
      }

      result = await spendJK(target, amount, 'ADMIN_DELETE', `管理員 ${interaction.user.tag} 刪除 JK餘額`);
      formattedAmount = formatJK(amount);
      currencyLabel = 'JK餘額';
    } else if (currency === 'pending_jk') {
      const pending = await getPendingJkSummaryByUserId(current.id);
      const currentPendingJk = Math.floor((pending.pendingCoins || 0) / 1000);

      if (currentPendingJk < amount) {
        return interaction.reply({
          content: `❌ 目標使用者的待結算 JK餘額不足。\n目前待結算 JK餘額：約 **${formatJK(currentPendingJk)}**\n嘗試刪除：**${formatJK(amount)}**`
        });
      }

      result = await spendPendingJK(target, amount, 'ADMIN_DELETE', `管理員 ${interaction.user.tag} 刪除待結算 JK餘額`);
      formattedAmount = formatJK(amount);
      currencyLabel = '待結算 JK餘額';
    } else if (currency === 'event_coins') {
      if ((current.eventCoins || 0) < amount) {
        return interaction.reply({
          content: `❌ 目標使用者的活動金幣不足。\n目前活動金幣：**${formatEventCoins(current.eventCoins || 0)}**\n嘗試刪除：**${formatEventCoins(amount)}**`
        });
      }

      result = await spendEventCoins(target, amount, 'ADMIN_DELETE', `管理員 ${interaction.user.tag} 刪除活動金幣`);
      formattedAmount = formatEventCoins(amount);
      currencyLabel = '活動金幣';
    } else {
      if (current.coins < amount) {
        return interaction.reply({
          content: `❌ 目標使用者的金幣不足。\n目前金幣：**${formatCoins(current.coins)}**\n嘗試刪除：**${formatCoins(amount)}**`
        });
      }

      result = await spendCoins(target, amount, 'ADMIN_DELETE', `管理員 ${interaction.user.tag} 刪除金幣`);
      formattedAmount = formatCoins(amount);
      currencyLabel = '金幣';
    }

    if (!result.ok) {
      return interaction.reply({ content: `❌ ${result.message}` });
    }

    const updated = result.user;

    const embed = new EmbedBuilder()
      .setColor(0xe74c3c)
      .setTitle('🗑️ 刪除成功')
      .setDescription([
        `執行者：<@${interaction.user.id}>`,
        `目標使用者：<@${target.id}>`,
        `刪除貨幣：**${currencyLabel}**`,
        `刪除數量：**${formattedAmount}**`,
        '',
        `目前金幣：**${formatCoinsWithEvent(updated.coins, updated.eventCoins)}**`,
        `目前 JK餘額：**${formatJK(updated.jkBalance)}**`,
        currency === 'pending_jk' ? `目前待結算 JK餘額：約 **${formatJK(result.pendingJkAfter || 0)}**` : null
      ].filter(Boolean).join('\n'));

    return interaction.reply({ embeds: [embed] });
  }
};
