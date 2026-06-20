const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const gamblingConfig = require('../config/gamblingConfig');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('slots_rewards')
    .setDescription('查看幸運轉盤獎勵表'),

  async execute(interaction) {
    const lines = gamblingConfig.slots.displayPayouts.map(item => `${item.label}：${item.multiplier}`);

    const embed = new EmbedBuilder()
      .setColor(0xf1c40f)
      .setTitle('🎰 幸運轉盤獎勵表')
      .setDescription(lines.join('\n'))
      .setFooter({ text: '獎勵機率不會公開顯示。' });

    await interaction.reply({ embeds: [embed] });
  }
};
