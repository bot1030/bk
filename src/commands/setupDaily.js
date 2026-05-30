const { SlashCommandBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const { sendSetupPanel } = require('../systems/gamePanelSystem');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup_daily')
    .setDescription('管理員專用：在指定頻道建立每日獎勵面板')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption(option =>
      option
        .setName('channel')
        .setDescription('要建立每日獎勵面板的頻道')
        .setRequired(true)
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
    ),

  async execute(interaction) {
    const channel = interaction.options.getChannel('channel');
    return sendSetupPanel(interaction, channel, 'daily');
  }
};
