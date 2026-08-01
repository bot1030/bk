const { SlashCommandBuilder } = require('discord.js');
const { isAdmin, privatePayload, buildNoteSelectPanel } = require('../systems/orderNoteSystem');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('note')
    .setDescription('管理員專用：記錄代儲或贈禮訂單'),

  async execute(interaction) {
    if (!isAdmin(interaction.user.id)) {
      return interaction.reply(privatePayload({ content: '你不能這麼做 作弊鬼' }));
    }

    return interaction.reply(privatePayload(buildNoteSelectPanel()));
  }
};
