const { SlashCommandBuilder } = require('discord.js');
const { isAdmin, privatePayload, buildCleanConfirmPanel } = require('../systems/orderNoteSystem');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('cleannote')
    .setDescription('管理員專用：清除所有訂單紀錄'),

  async execute(interaction) {
    if (!isAdmin(interaction.user.id)) {
      return interaction.reply(privatePayload({ content: '你不能這麼做 作弊鬼' }));
    }

    return interaction.reply(buildCleanConfirmPanel(interaction.user.id));
  }
};
