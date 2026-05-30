const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const prisma = require('../database/prisma');
const gamblingConfig = require('../config/gamblingConfig');
const { shuffle } = require('../utils/random');

function createBoard(mineCount) {
  const cells = Array.from({ length: gamblingConfig.mines.gridSize }, (_, index) => ({
    index,
    mine: false
  }));

  const mineIndexes = shuffle([...Array(gamblingConfig.mines.gridSize).keys()]).slice(0, mineCount);
  for (const index of mineIndexes) {
    cells[index].mine = true;
  }

  return cells;
}

function getMultiplier(mineCount, safePicks) {
  if (safePicks <= 0) return 1;
  const table = gamblingConfig.mines.multipliers[mineCount] || gamblingConfig.mines.multipliers[3];
  const index = Math.min(safePicks, table.length) - 1;
  return table[index];
}

function calculateMinesPayout(bet, mineCount, safePicks) {
  const multiplier = getMultiplier(mineCount, safePicks);
  return Math.floor(bet * multiplier);
}

function buildMinesRows(game, revealAll = false) {
  const board = Array.isArray(game.board) ? game.board : JSON.parse(game.board);
  const revealed = Array.isArray(game.revealed) ? game.revealed : JSON.parse(game.revealed);
  const rows = [];

  for (let row = 0; row < 5; row++) {
    const actionRow = new ActionRowBuilder();

    for (let col = 0; col < 5; col++) {
      const index = row * 5 + col;
      const cell = board[index];
      const isRevealed = revealed.includes(index);
      const shouldRevealMine = revealAll && cell.mine;

      let label = `${index + 1}`;
      let style = ButtonStyle.Secondary;
      let disabled = game.status !== 'ACTIVE';

      if (isRevealed) {
        label = '✅';
        style = ButtonStyle.Success;
        disabled = true;
      }

      if (shouldRevealMine) {
        label = '💣';
        style = ButtonStyle.Danger;
        disabled = true;
      }

      actionRow.addComponents(
        new ButtonBuilder()
          .setCustomId(`mines_pick:${game.id}:${index}`)
          .setLabel(label)
          .setStyle(style)
          .setDisabled(disabled)
      );
    }

    rows.push(actionRow);
  }

  return rows;
}

async function findActiveGame(discordId) {
  return prisma.minesGame.findFirst({
    where: {
      user: { discordId },
      status: 'ACTIVE'
    },
    include: { user: true },
    orderBy: { createdAt: 'desc' }
  });
}

module.exports = {
  createBoard,
  getMultiplier,
  calculateMinesPayout,
  buildMinesRows,
  findActiveGame
};
