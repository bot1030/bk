const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getBalance } = require('../systems/economySystem');
const { formatJK } = require('../utils/format');

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

    const embed = new EmbedBuilder()
      .setColor(0x3498db)
      .setTitle('💎 JK餘額')
      .setDescription([
        `玩家：<@${target.id}>`,
        `JK餘額：**${formatJK(user.jkBalance)}**`
      ].join('\n'));

    await interaction.reply({ embeds: [embed] });
  }
};
