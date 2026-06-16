const { SlashCommandBuilder, ChannelType, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { setCommentChannel } = require('../systems/commentSystem');

const ADMIN_USER_IDS = [
  '473647287026057227',
  '786683877107302461',
  '1319968425698922591'
];

function isAdmin(userId) {
  return ADMIN_USER_IDS.includes(userId);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup_comment')
    .setDescription('管理員專用：設定客戶評價送出的頻道')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption(option =>
      option
        .setName('channel')
        .setDescription('客戶評價要送到哪個頻道')
        .setRequired(true)
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
    ),

  async execute(interaction) {
    if (!isAdmin(interaction.user.id)) {
      return interaction.reply({
        content: '你不能這麼做 作弊鬼',
        flags: MessageFlags.Ephemeral
      });
    }

    const channel = interaction.options.getChannel('channel');
    await setCommentChannel(interaction.guildId, channel.id);

    return interaction.reply({
      content: `✅ 評價頻道已設定為 ${channel}。`,
      flags: MessageFlags.Ephemeral
    });
  }
};
