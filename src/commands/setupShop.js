const { SlashCommandBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const { sendRoleShopPanel } = require('../systems/roleShopPanelSystem');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup_shop')
    .setDescription('管理員專用：在指定頻道建立角色商店面板')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption(option =>
      option
        .setName('channel')
        .setDescription('要建立角色商店面板的頻道')
        .setRequired(true)
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
    ),

  async execute(interaction) {
    const channel = interaction.options.getChannel('channel');
    return sendRoleShopPanel(interaction, channel);
  }
};
