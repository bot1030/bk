const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const prisma = require('../database/prisma');
const gamblingConfig = require('../config/gamblingConfig');
const { validateBet } = require('../utils/guards');
const { formatCoins } = require('../utils/format');
const { spendCoins, addCoins } = require('../systems/economySystem');
const { checkGamblingBetAllowed, sendPostGameRiskAlert } = require('../systems/riskSystem');
const { announceBigWin } = require('../systems/bigWinSystem');
const {
  createBoard,
  buildMinesRows,
  calculateMinesPayout,
  getMultiplier,
  findActiveGame
} = require('../systems/minesSystem');

function privatePayload(payload = {}) {
  return { ...payload, flags: MessageFlags.Ephemeral };
}


function buildMinesEmbed(game, title = '💣 踩地雷') {
  const revealed = Array.isArray(game.revealed) ? game.revealed : JSON.parse(game.revealed);
  const safePicks = revealed.length;
  const multiplier = getMultiplier(game.mines, safePicks);
  const currentPayout = safePicks > 0 ? calculateMinesPayout(game.bet, game.mines, safePicks) : 0;

  return new EmbedBuilder()
    .setColor(0xf39c12)
    .setTitle(title)
    .setDescription([
      `下注金額：**${formatCoins(game.bet)}**`,
      `地雷數量：**${game.mines}**`,
      `安全點擊：**${safePicks}**`,
      `目前倍率：**${multiplier}x**`,
      `目前可提現：**${formatCoins(currentPayout)}**`,
      '',
      '點擊格子繼續遊戲。若要提現，請使用 `/mines_cashout`。'
    ].join('\n'));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mines')
    .setDescription('遊玩 5x5 踩地雷遊戲，地雷數量限制為 7–10')
    .addIntegerOption(option =>
      option
        .setName('bet')
        .setDescription('下注金額：100–100,000 金幣')
        .setRequired(true)
        .setMinValue(gamblingConfig.mines.minBet)
        .setMaxValue(gamblingConfig.mines.maxBet)
    )
    .addIntegerOption(option =>
      option
        .setName('mines')
        .setDescription('地雷數量：7–10')
        .setRequired(true)
        .setMinValue(gamblingConfig.mines.minMines)
        .setMaxValue(gamblingConfig.mines.maxMines)
    ),

  async execute(interaction) {
    const bet = interaction.options.getInteger('bet');
    const mineCount = interaction.options.getInteger('mines');

    const existing = await findActiveGame(interaction.user.id);
    if (existing) {
      return interaction.reply(privatePayload({
        content: '❌ 你已經有一場進行中的踩地雷遊戲。請先使用 `/mines_cashout` 提現，或使用 `/mines_quit` 退出。'
      }));
    }

    const check = validateBet(bet, gamblingConfig.mines.minBet, gamblingConfig.mines.maxBet);
    if (!check.ok) {
      return interaction.reply(privatePayload({ content: `❌ ${check.message}` }));
    }

    const risk = await checkGamblingBetAllowed(interaction.user, bet);
    if (!risk.ok) {
      return interaction.reply(privatePayload({ content: risk.message }));
    }

    const spent = await spendCoins(interaction.user, bet, 'MINES', '踩地雷下注');
    if (!spent.ok) {
      return interaction.reply(privatePayload({ content: '❌ 你的金幣不足。' }));
    }

    const user = await prisma.user.findUnique({ where: { discordId: interaction.user.id } });

    const game = await prisma.minesGame.create({
      data: {
        userId: user.id,
        bet,
        mines: mineCount,
        board: createBoard(mineCount),
        revealed: [],
        status: 'ACTIVE'
      }
    });

    await prisma.user.update({
      where: { discordId: interaction.user.id },
      data: { minesPlayed: { increment: 1 } }
    });

    await interaction.reply(privatePayload({
      embeds: [buildMinesEmbed(game)],
      components: buildMinesRows(game)
    }));

    const message = await interaction.fetchReply();

    await prisma.minesGame.update({
      where: { id: game.id },
      data: {
        messageId: message.id,
        channelId: message.channelId
      }
    });
  },

  async handleButton(interaction) {
    const [, gameId, indexText] = interaction.customId.split(':');
    const index = Number(indexText);

    const game = await prisma.minesGame.findUnique({
      where: { id: gameId },
      include: { user: true }
    });

    if (!game || game.status !== 'ACTIVE') {
      return interaction.reply(privatePayload({ content: '❌ 這場遊戲已經結束。' }));
    }

    if (game.user.discordId !== interaction.user.id) {
      return interaction.reply(privatePayload({ content: '❌ 這不是你的踩地雷遊戲。' }));
    }

    const board = Array.isArray(game.board) ? game.board : JSON.parse(game.board);
    const revealed = Array.isArray(game.revealed) ? game.revealed : JSON.parse(game.revealed);

    if (revealed.includes(index)) {
      return interaction.reply(privatePayload({ content: '❌ 你已經點過這個格子。' }));
    }

    await interaction.deferUpdate();

    const cell = board[index];

    if (cell.mine) {
      const lostGame = await prisma.minesGame.update({
        where: { id: game.id },
        data: { status: 'LOST', payout: 0 }
      });

      const embed = new EmbedBuilder()
        .setColor(0xe74c3c)
        .setTitle('💥 你踩到地雷了！')
        .setDescription([
          `你失去了本次下注的 **${formatCoins(game.bet)}**。`,
          `地雷數量：**${game.mines}**`
        ].join('\n'));

      return interaction.editReply({
        embeds: [embed],
        components: buildMinesRows({ ...lostGame, board, revealed }, true)
      });
    }

    const newRevealed = [...revealed, index];
    const safeCells = gamblingConfig.mines.gridSize - game.mines;

    if (newRevealed.length >= safeCells) {
      const payout = calculateMinesPayout(game.bet, game.mines, gamblingConfig.mines.maxSafePicksForMultiplier);
      await addCoins(interaction.user, payout, 'MINES', '踩地雷全清勝利');

      await sendPostGameRiskAlert(interaction.client, interaction.user, '踩地雷', [
        `本局下注：**${formatCoins(game.bet)}**`,
        `本局地雷：**${game.mines}**`,
        `本局獲得：**${formatCoins(payout)}**`
      ]);

      await announceBigWin(interaction.client, interaction.guildId, {
        user: interaction.user,
        gameName: '踩地雷',
        coins: payout,
        detailLines: [
          `下注金額：**${formatCoins(game.bet)}**`,
          `地雷數量：**${game.mines}**`,
          '狀態：**全部安全格已清除**'
        ]
      });

      const wonGame = await prisma.minesGame.update({
        where: { id: game.id },
        data: { revealed: newRevealed, status: 'WON', payout }
      });

      const embed = new EmbedBuilder()
        .setColor(0x2ecc71)
        .setTitle('🏆 全部安全格已清除！')
        .setDescription(`你獲得了 **${formatCoins(payout)}**。`);

      return interaction.editReply({
        embeds: [embed],
        components: buildMinesRows(wonGame, true)
      });
    }

    const updatedGame = await prisma.minesGame.update({
      where: { id: game.id },
      data: { revealed: newRevealed }
    });

    return interaction.editReply({
      embeds: [buildMinesEmbed(updatedGame, '✅ 安全！')],
      components: buildMinesRows(updatedGame)
    });
  }
};
