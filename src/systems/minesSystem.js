const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');
const prisma = require('../database/prisma');
const gamblingConfig = require('../config/gamblingConfig');
const { shuffle } = require('../utils/random');

function parseJsonArray(value, fallback = []) {
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

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
  const table = gamblingConfig.mines.multipliers[mineCount] || gamblingConfig.mines.multipliers[5];
  const cappedSafePicks = Math.min(safePicks, gamblingConfig.mines.maxSafePicksForMultiplier, table.length);
  return table[cappedSafePicks - 1];
}

function calculateMinesPayout(bet, mineCount, safePicks) {
  const multiplier = getMultiplier(mineCount, safePicks);
  return Math.floor(bet * multiplier);
}

function buildMinesBoardText(game, revealAll = false) {
  const board = parseJsonArray(game.board);
  const revealed = parseJsonArray(game.revealed);
  const lines = [];

  for (let row = 0; row < 5; row++) {
    const cells = [];

    for (let col = 0; col < 5; col++) {
      const index = row * 5 + col;
      const cell = board[index];
      const isRevealed = revealed.includes(index);

      if (isRevealed) {
        cells.push('✅');
      } else if (revealAll && cell?.mine) {
        cells.push('💣');
      } else {
        cells.push(String(index + 1).padStart(2, '0'));
      }
    }

    lines.push(cells.join('  '));
  }

  return lines.join('\n');
}

function buildMinesComponents(game, revealAll = false) {
  const board = parseJsonArray(game.board);
  const revealed = parseJsonArray(game.revealed);
  const active = game.status === 'ACTIVE' && !revealAll;
  const rows = [];

  for (let row = 0; row < 5; row++) {
    const actionRow = new ActionRowBuilder();

    for (let col = 0; col < 5; col++) {
      const index = row * 5 + col;
      const cell = board[index];
      const isRevealed = revealed.includes(index);

      let label = String(index + 1);
      let emoji = undefined;
      let style = ButtonStyle.Secondary;

      if (isRevealed) {
        label = '安全';
        emoji = '✅';
        style = ButtonStyle.Success;
      } else if (revealAll && cell?.mine) {
        label = '地雷';
        emoji = '💣';
        style = ButtonStyle.Danger;
      } else if (revealAll) {
        label = String(index + 1);
        emoji = '⬜';
        style = ButtonStyle.Secondary;
      }

      const button = new ButtonBuilder()
        .setCustomId(`mines_pick:${game.id}:${index}`)
        .setLabel(label)
        .setStyle(style)
        .setDisabled(!active || isRevealed);

      if (emoji) {
        button.setEmoji(emoji);
      }

      actionRow.addComponents(button);
    }

    rows.push(actionRow);
  }

  return rows;
}

function buildMinesControlComponents(game, forceDisabled = false) {
  const revealed = parseJsonArray(game.revealed);
  const active = game.status === 'ACTIVE' && !forceDisabled;

  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`mines_action:cashout:${game.id}`)
        .setLabel('提現')
        .setEmoji('💰')
        .setStyle(ButtonStyle.Success)
        .setDisabled(!active),
      new ButtonBuilder()
        .setCustomId(`mines_action:quit:${game.id}`)
        .setLabel('退出並退回本金')
        .setEmoji('🚪')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!active),
      new ButtonBuilder()
        .setCustomId(`mines_action:force_all:${game.id}`)
        .setLabel('結束所有遊戲並退回本金')
        .setEmoji('🧯')
        .setStyle(ButtonStyle.Danger)
        .setDisabled(!active)
    )
  ];
}

function minutesAgo(minutes) {
  return new Date(Date.now() - minutes * 60 * 1000);
}

async function checkMinesHighBetStreak(discordId, requestedBet) {
  const cfg = gamblingConfig.mines.highBetStreakControl;
  if (!cfg?.enabled) return { ok: true };

  if (requestedBet < cfg.minBet || requestedBet > cfg.maxBet) {
    return { ok: true };
  }

  const games = await prisma.minesGame.findMany({
    where: {
      user: { discordId },
      status: { in: ['CASHED_OUT', 'WON'] },
      bet: { gte: cfg.minBet, lte: cfg.maxBet },
      payout: { gt: 0 },
      createdAt: { gte: minutesAgo(cfg.windowMinutes) }
    },
    orderBy: { createdAt: 'desc' },
    take: cfg.winCount
  });

  const profitableWins = games.filter(game => game.payout > game.bet);

  if (profitableWins.length >= cfg.winCount) {
    return {
      ok: false,
      message: [
        '⚠️ 風險控管啟動',
        '',
        `你最近在高額踩地雷中連續獲利，系統暫時限制你繼續使用 **${cfg.minBet.toLocaleString()}–${cfg.maxBet.toLocaleString()} 金幣** 的高額下注。`,
        `請等待一段時間，或改用較低下注金額。`
      ].join('\n')
    };
  }

  return { ok: true };
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
  buildMinesBoardText,
  buildMinesComponents,
  buildMinesControlComponents,
  checkMinesHighBetStreak,
  findActiveGame,
  parseJsonArray
};
