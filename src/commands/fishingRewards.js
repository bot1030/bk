const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getFishingRewardListText } = require('../systems/fishingSystem');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('fish_rewards')
    .setDescription('查看釣魚獎勵表'),

  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setColor(0x1abc9c)
      .setTitle('🎣 釣魚獎勵表')
      .setDescription(getFishingRewardListText())
      .setFooter({ text: '獎勵機率不會公開顯示。魚類會自動出售成金幣。' });

    await interaction.reply({ embeds: [embed] });
  }
};
