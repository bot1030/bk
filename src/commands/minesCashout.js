const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const prisma = require('../database/prisma');
const { addCoins } = require('../systems/economySystem');
const { findActiveGame, calculateMinesPayout, buildMinesRows } = require('../systems/minesSystem');
const { formatCoins } = require('../utils/format');
const { sendPostGameRiskAlert } = require('../systems/riskSystem');
const { announceBigWin } = require('../systems/bigWinSystem');

function privatePayload(payload = {}) {
  return { ...payload, flags: MessageFlags.Ephemeral };
}


module.exports = {
  data: new SlashCommandBuilder()
    .setName('mines_cashout')
    .setDescription('提現目前的踩地雷獎勵'),

  async execute(interaction) {
    const game = await findActiveGame(interaction.user.id);

    if (!game) {
      return interaction.reply(privatePayload({ content: '❌ 你目前沒有進行中的踩地雷遊戲。' }));
    }

    const revealed = Array.isArray(game.revealed) ? game.revealed : JSON.parse(game.revealed);

    if (revealed.length <= 0) {
      return interaction.reply(privatePayload({ content: '❌ 你至少需要先點擊 1 個安全格才能提現。' }));
    }

    const payout = calculateMinesPayout(game.bet, game.mines, revealed.length);
    await addCoins(interaction.user, payout, 'MINES', '踩地雷提現');

    await sendPostGameRiskAlert(interaction.client, interaction.user, '踩地雷', [
      `本局下注：**${formatCoins(game.bet)}**`,
      `安全點擊：**${revealed.length}**`,
      `本局獲得：**${formatCoins(payout)}**`
    ]);

    await announceBigWin(interaction.client, interaction.guildId, {
      user: interaction.user,
      gameName: '踩地雷',
      coins: payout,
      detailLines: [
        `下注金額：**${formatCoins(game.bet)}**`,
        `地雷數量：**${game.mines}**`,
        `安全點擊：**${revealed.length}**`,
        '狀態：**提現成功**'
      ]
    });

    const updatedGame = await prisma.minesGame.update({
      where: { id: game.id },
      data: { status: 'CASHED_OUT', payout }
    });

    const embed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle('💰 提現成功')
      .setDescription([
        `安全點擊：**${revealed.length}**`,
        `你獲得了 **${formatCoins(payout)}**。`
      ].join('\n'));

    if (game.channelId && game.messageId) {
      try {
        const channel = await interaction.client.channels.fetch(game.channelId);
        const message = await channel.messages.fetch(game.messageId);
        await message.edit({ embeds: [embed], components: buildMinesRows(updatedGame, true) });
      } catch {
        // If the old message cannot be edited, still pay the player and reply below.
      }
    }

    return interaction.reply(privatePayload({ embeds: [embed] }));
  }
};
