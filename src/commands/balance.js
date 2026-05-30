const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getBalance } = require('../systems/economySystem');
const { rods } = require('../config/rodConfig');
const { formatCoins, formatJK } = require('../utils/format');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('餘額')
    .setDescription('查看自己或其他玩家的金幣與 JK餘額')
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('要查看餘額的玩家，不填則查看自己')
        .setRequired(false)
    ),

  async execute(interaction) {
    const target = interaction.options.getUser('user') || interaction.user;
    const user = await getBalance(target);
    const selectedRod = rods[user.selectedRod] || rods.basic;

    const isSelf = target.id === interaction.user.id;

    const embed = new EmbedBuilder()
      .setColor(0xf1c40f)
      .setTitle(isSelf ? '💰 個人餘額' : '💰 玩家餘額')
      .setDescription([
        `玩家：<@${target.id}>`,
        `金幣：**${formatCoins(user.coins)}**`,
        `JK餘額：**${formatJK(user.jkBalance)}**`,
        `目前釣竿：**${selectedRod.label}**`
      ].join('\n'))
      .setFooter({ text: '1,000 金幣 = 1 JK餘額' });

    await interaction.reply({ embeds: [embed] });
  }
};
