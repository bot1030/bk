const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { findActiveGame } = require('../systems/minesSystem');
const { quitGame } = require('./mines');

function privatePayload(payload = {}) {
  return { ...payload, flags: MessageFlags.Ephemeral };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mines_quit')
    .setDescription('退出目前的踩地雷遊戲；建議直接使用遊戲介面的退出按鈕'),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const game = await findActiveGame(interaction.user.id);

    if (!game) {
      return interaction.editReply({ content: '❌ 你目前沒有進行中的踩地雷遊戲。' });
    }

    return quitGame(interaction, game);
  }
};
