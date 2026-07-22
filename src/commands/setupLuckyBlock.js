const { SlashCommandBuilder, ChannelType } = require('discord.js');
const { sendSetupLuckyBlockPanel } = require('../systems/luckyBlockSystem');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup_luckyblock')
    .setDescription('建立幸運方塊遊戲面板')
    .addChannelOption(option =>
      option
        .setName('channel')
        .setDescription('要發送幸運方塊面板的頻道')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(true)
    ),

  async execute(interaction) {
    return sendSetupLuckyBlockPanel(interaction);
  }
};
