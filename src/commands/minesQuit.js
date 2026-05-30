const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const prisma = require('../database/prisma');
const { findActiveGame, buildMinesRows } = require('../systems/minesSystem');
const { formatCoins } = require('../utils/format');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mines_quit')
    .setDescription('退出目前的踩地雷遊戲，不會獲得獎勵'),

  async execute(interaction) {
    const game = await findActiveGame(interaction.user.id);

    if (!game) {
      return interaction.reply({ content: '❌ 你目前沒有進行中的踩地雷遊戲。' });
    }

    const updatedGame = await prisma.minesGame.update({
      where: { id: game.id },
      data: { status: 'QUIT', payout: 0 }
    });

    const embed = new EmbedBuilder()
      .setColor(0x95a5a6)
      .setTitle('🚪 已退出踩地雷')
      .setDescription(`你放棄了本局遊戲，下注的 **${formatCoins(game.bet)}** 不會退回。`);

    if (game.channelId && game.messageId) {
      try {
        const channel = await interaction.client.channels.fetch(game.channelId);
        const message = await channel.messages.fetch(game.messageId);
        await message.edit({ embeds: [embed], components: buildMinesRows(updatedGame, true) });
      } catch {
        // Ignore message edit failure.
      }
    }

    return interaction.reply({ embeds: [embed] });
  }
};
