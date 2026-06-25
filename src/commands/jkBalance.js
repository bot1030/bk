const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getBalance } = require('../systems/economySystem');
const { getPendingJkSummaryByUserId } = require('../systems/pendingJkSystem');
const { formatCoinsWithEvent, formatJK } = require('../utils/format');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('jk餘額')
    .setDescription('查看自己或其他玩家的 JK餘額')
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('要查看 JK餘額的玩家，不填則查看自己')
        .setRequired(false)
    ),

  async execute(interaction) {
    const target = interaction.options.getUser('user') || interaction.user;
    const user = await getBalance(target);
    const pending = await getPendingJkSummaryByUserId(user.id);

    const embed = new EmbedBuilder()
      .setColor(0x3498db)
      .setTitle('💎 JK餘額')
      .setDescription([
        `玩家：<@${target.id}>`,
        `金幣：**${formatCoinsWithEvent(user.coins, user.eventCoins)}**`,
        `正式 JK餘額：**${formatJK(user.jkBalance)}**`,
        `待結算 JK餘額：約 **${formatJK(Math.floor(pending.pendingCoins / 1000))}**`
      ].join('\n'));

    await interaction.reply({ embeds: [embed] });
  }
};
