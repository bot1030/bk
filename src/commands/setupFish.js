const { SlashCommandBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const { sendSetupPanel } = require('../systems/gamePanelSystem');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup_fish')
    .setDescription('管理員專用：在指定頻道建立釣魚系統面板')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption(option =>
      option
        .setName('channel')
        .setDescription('要建立釣魚面板的頻道')
        .setRequired(true)
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
    ),

  async execute(interaction) {
    const channel = interaction.options.getChannel('channel');
    return sendSetupPanel(interaction, channel, 'fish');
  }
};
