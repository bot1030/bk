const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const prisma = require('../database/prisma');
const gamblingConfig = require('../config/gamblingConfig');
const { validateBet } = require('../utils/guards');
const { formatCoins } = require('../utils/format');
const { spendCoins, addCoins } = require('../systems/economySystem');
const { checkGamblingBetAllowed, sendPostGameRiskAlert } = require('../systems/riskSystem');
const { announceBigWin } = require('../systems/bigWinSystem');
const minesSystem = require('../systems/minesSystem');

const createBoard = minesSystem.createBoard;
const buildMinesBoardText = minesSystem.buildMinesBoardText;
const buildMinesComponents = minesSystem.buildMinesComponents;
const buildMinesControlComponents = minesSystem.buildMinesControlComponents;
const checkMinesHighBetStreak = minesSystem.checkMinesHighBetStreak;
const calculateMinesPayout = minesSystem.calculateMinesPayout;
const getMultiplier = minesSystem.getMultiplier;
const findActiveGame = minesSystem.findActiveGame;
const parseJsonArray = minesSystem.parseJsonArray;

function privatePayload(payload = {}) {
  return { ...payload, flags: MessageFlags.Ephemeral };
}

function replyPayload(payload = {}) {
  const clean = { ...payload };
  delete clean.flags;
  return clean;
}

async function ensurePrivateReply(interaction) {
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  }
}

async function sendOrEditPrivate(interaction, payload = {}) {
  if (interaction.deferred || interaction.replied) {
    return interaction.editReply(replyPayload(payload));
  }
  return interaction.reply(privatePayload(payload));
}

async function safeFollowUp(interaction, payload = {}) {
  return interaction.followUp(privatePayload(payload)).catch(() => null);
}

function buildMinesEmbed(game, title = '💣 踩地雷', revealAll = false) {
  const revealed = parseJsonArray(game.revealed);
  const safePicks = revealed.length;
  const multiplier = getMultiplier(game.mines, safePicks);
  const currentPayout = safePicks > 0 ? calculateMinesPayout(game.bet, game.mines, safePicks) : 0;
  const cappedNotice = safePicks >= gamblingConfig.mines.maxSafePicksForMultiplier
    ? `倍率已達本局上限：**${gamblingConfig.mines.maxSafePicksForMultiplier} 次安全點擊**。`
    : `倍率最多計算前 **${gamblingConfig.mines.maxSafePicksForMultiplier} 次安全點擊**。`;

  return new EmbedBuilder()
    .setColor(revealAll ? 0x95a5a6 : 0xf39c12)
    .setTitle(title)
    .setDescription([
      `投入金額：**${formatCoins(game.bet)}**`,
      `地雷數量：**${game.mines}**`,
      `安全點擊：**${safePicks}**`,
      `目前倍率：**${multiplier}x**`,
      `目前可提現：**${formatCoins(currentPayout)}**`,
      cappedNotice,
      '',
      '```',
      buildMinesBoardText(game, revealAll),
      '```',
      '直接點擊格子進行遊戲。提現 / 退出按鈕會顯示在下方控制列。'
    ].join('\n'));
}

async function startMinesGame(interaction, bet, mineCount) {
  await ensurePrivateReply(interaction);

  const existing = await findActiveGame(interaction.user.id);
  if (existing) {
    return sendOrEditPrivate(interaction, {
      content: '❌ 你已經有一場進行中的踩地雷遊戲。請先在原本的遊戲控制列點擊「提現」或「退出」。'
    });
  }

  const check = validateBet(bet, gamblingConfig.mines.minBet, gamblingConfig.mines.maxBet);
  if (!check.ok) return sendOrEditPrivate(interaction, { content: `❌ ${check.message}` });

  if (mineCount < gamblingConfig.mines.minMines || mineCount > gamblingConfig.mines.maxMines) {
    return sendOrEditPrivate(interaction, { content: `❌ 地雷數量必須是 ${gamblingConfig.mines.minMines}–${gamblingConfig.mines.maxMines} 顆。` });
  }

  const streakControl = await checkMinesHighBetStreak(interaction.user.id, bet);
  if (!streakControl.ok) {
    return sendOrEditPrivate(interaction, { content: streakControl.message });
  }

  const risk = await checkGamblingBetAllowed(interaction.user, bet);
  if (!risk.ok) return sendOrEditPrivate(interaction, { content: risk.message });

  const spent = await spendCoins(interaction.user, bet, 'MINES', '踩地雷投入');
  if (!spent.ok) return sendOrEditPrivate(interaction, { content: '❌ 你的金幣不足。' });

  const user = await prisma.user.findUnique({ where: { discordId: interaction.user.id } });

  const game = await prisma.minesGame.create({
    data: {
      userId: user.id,
      bet,
      mines: mineCount,
      board: createBoard(mineCount),
      revealed: [],
      status: 'ACTIVE'
    },
    include: { user: true }
  });

  await prisma.user.update({
    where: { discordId: interaction.user.id },
    data: { minesPlayed: { increment: 1 } }
  });

  const gameMessage = await sendOrEditPrivate(interaction, {
    embeds: [buildMinesEmbed(game)],
    components: buildMinesComponents(game)
  });

  await prisma.minesGame.update({
    where: { id: game.id },
    data: {
      messageId: gameMessage?.id || null,
      channelId: gameMessage?.channelId || null
    }
  }).catch(() => null);

  await interaction.followUp(privatePayload({
    content: '🎮 **踩地雷控制列**\n提現會領取目前獎勵；退出會退回本金，但不會獲得任何獎勵。',
    components: buildMinesControlComponents(game)
  })).catch(() => null);
}

async function getGameById(gameId) {
  return prisma.minesGame.findUnique({
    where: { id: gameId },
    include: { user: true }
  });
}

async function validateGameOwnership(interaction, game) {
  if (!game || game.status !== 'ACTIVE') {
    await safeFollowUp(interaction, { content: '❌ 這場遊戲已經結束。' });
    return false;
  }

  if (game.user.discordId !== interaction.user.id) {
    await safeFollowUp(interaction, { content: '❌ 這不是你的踩地雷遊戲。' });
    return false;
  }

  return true;
}

async function cashOutGame(interaction, game) {
  const revealed = parseJsonArray(game.revealed);

  if (revealed.length <= 0) {
    return interaction.editReply({
      content: '❌ 你至少需要先點擊 1 個安全格才能提現。',
      components: buildMinesControlComponents(game)
    });
  }

  const payout = calculateMinesPayout(game.bet, game.mines, revealed.length);
  await addCoins(interaction.user, payout, 'MINES', '踩地雷提現');

  await sendPostGameRiskAlert(interaction.client, interaction.user, '踩地雷', [
    `本局投入：**${formatCoins(game.bet)}**`,
    `地雷數量：**${game.mines}**`,
    `安全點擊：**${revealed.length}**`,
    `本局獲得：**${formatCoins(payout)}**`
  ]);

  await announceBigWin(interaction.client, interaction.guildId, {
    user: interaction.user,
    gameName: '踩地雷',
    coins: payout,
    detailLines: [
      `投入金額：**${formatCoins(game.bet)}**`,
      `地雷數量：**${game.mines}**`,
      `安全點擊：**${revealed.length}**`,
      '狀態：**提現成功**'
    ]
  });

  const updatedGame = await prisma.minesGame.update({
    where: { id: game.id },
    data: { status: 'CASHED_OUT', payout },
    include: { user: true }
  });

  const embed = new EmbedBuilder()
    .setColor(0x2ecc71)
    .setTitle('💰 提現成功')
    .setDescription([
      `安全點擊：**${revealed.length}**`,
      `你獲得了 **${formatCoins(payout)}**。`,
      '',
      '本局踩地雷已結束。'
    ].join('\n'));

  return interaction.editReply({
    content: null,
    embeds: [embed],
    components: buildMinesControlComponents(updatedGame, true)
  });
}

async function quitGame(interaction, game) {
  await addCoins(interaction.user, game.bet, 'MINES', '踩地雷退出退回本金');

  const updatedGame = await prisma.minesGame.update({
    where: { id: game.id },
    data: { status: 'QUIT', payout: 0 },
    include: { user: true }
  });

  const embed = new EmbedBuilder()
    .setColor(0x95a5a6)
    .setTitle('🚪 已退出踩地雷')
    .setDescription([
      `已退回本金：**${formatCoins(game.bet)}**`,
      '本局沒有獲得任何額外獎勵。'
    ].join('\n'));

  return interaction.editReply({
    content: null,
    embeds: [embed],
    components: buildMinesControlComponents(updatedGame, true)
  });
}


async function refundAllActiveGames(interaction) {
  await ensurePrivateReply(interaction);

  const activeGames = await prisma.minesGame.findMany({
    where: {
      user: { discordId: interaction.user.id },
      status: 'ACTIVE'
    },
    include: { user: true },
    orderBy: { createdAt: 'desc' }
  });

  if (!activeGames.length) {
    return sendOrEditPrivate(interaction, {
      content: '❌ 你目前沒有正在進行中的踩地雷遊戲。'
    });
  }

  const totalRefund = activeGames.reduce((sum, game) => sum + Number(game.bet || 0), 0);
  const ids = activeGames.map(game => game.id);

  await prisma.minesGame.updateMany({
    where: { id: { in: ids } },
    data: { status: 'FORCE_REFUNDED', payout: 0 }
  });

  if (totalRefund > 0) {
    await addCoins(interaction.user, totalRefund, 'MINES', '強制結束所有踩地雷遊戲退回本金');
  }

  const embed = new EmbedBuilder()
    .setColor(0x95a5a6)
    .setTitle('🧯 已結束所有踩地雷遊戲')
    .setDescription([
      `已結束遊戲數量：**${activeGames.length}**`,
      `退回本金總額：**${formatCoins(totalRefund)}**`,
      '',
      '本操作只退回本金，不會給予任何額外獎勵。',
      '舊的踩地雷按鈕會自動失效。'
    ].join('\n'));

  return sendOrEditPrivate(interaction, {
    content: null,
    embeds: [embed],
    components: []
  });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mines')
    .setDescription('遊玩 5x5 踩地雷遊戲，地雷數量限制為 5–15')
    .addIntegerOption(option =>
      option
        .setName('bet')
        .setDescription('投入金額：100–100,000 金幣')
        .setRequired(true)
        .setMinValue(gamblingConfig.mines.minBet)
        .setMaxValue(gamblingConfig.mines.maxBet)
    )
    .addIntegerOption(option =>
      option
        .setName('mines')
        .setDescription('地雷數量：5–15')
        .setRequired(true)
        .setMinValue(gamblingConfig.mines.minMines)
        .setMaxValue(gamblingConfig.mines.maxMines)
    ),

  async execute(interaction) {
    const bet = interaction.options.getInteger('bet');
    const mineCount = interaction.options.getInteger('mines');
    return startMinesGame(interaction, bet, mineCount);
  },

  async handleButton(interaction) {
    await interaction.deferUpdate();

    const [, gameId, indexRaw] = interaction.customId.split(':');
    const index = Number(indexRaw);
    const game = await getGameById(gameId);
    if (!(await validateGameOwnership(interaction, game))) return;

    const board = parseJsonArray(game.board);
    const revealed = parseJsonArray(game.revealed);

    if (revealed.includes(index)) {
      return safeFollowUp(interaction, { content: '❌ 你已經點過這個格子。' });
    }

    const cell = board[index];

    if (cell.mine) {
      const lostGame = await prisma.minesGame.update({
        where: { id: game.id },
        data: { status: 'LOST', payout: 0 },
        include: { user: true }
      });

      const embed = new EmbedBuilder()
        .setColor(0xe74c3c)
        .setTitle('💥 你踩到地雷了！')
        .setDescription([
          `你失去了本次投入的 **${formatCoins(game.bet)}**。`,
          `地雷數量：**${game.mines}**`,
          '',
          '```',
          buildMinesBoardText({ ...lostGame, board, revealed }, true),
          '```'
        ].join('\n'));

      return interaction.editReply({
        embeds: [embed],
        components: buildMinesComponents({ ...lostGame, board, revealed }, true)
      });
    }

    const newRevealed = [...revealed, index];
    const safeCells = gamblingConfig.mines.gridSize - game.mines;

    if (newRevealed.length >= safeCells) {
      const payout = calculateMinesPayout(game.bet, game.mines, newRevealed.length);
      await addCoins(interaction.user, payout, 'MINES', '踩地雷全清勝利');

      await sendPostGameRiskAlert(interaction.client, interaction.user, '踩地雷', [
        `本局投入：**${formatCoins(game.bet)}**`,
        `本局地雷：**${game.mines}**`,
        `本局獲得：**${formatCoins(payout)}**`
      ]);

      await announceBigWin(interaction.client, interaction.guildId, {
        user: interaction.user,
        gameName: '踩地雷',
        coins: payout,
        detailLines: [
          `投入金額：**${formatCoins(game.bet)}**`,
          `地雷數量：**${game.mines}**`,
          '狀態：**全部安全格已清除**'
        ]
      });

      const wonGame = await prisma.minesGame.update({
        where: { id: game.id },
        data: { revealed: newRevealed, status: 'WON', payout },
        include: { user: true }
      });

      const embed = new EmbedBuilder()
        .setColor(0x2ecc71)
        .setTitle('🏆 全部安全格已清除！')
        .setDescription([
          `你獲得了 **${formatCoins(payout)}**。`,
          '',
          '```',
          buildMinesBoardText(wonGame, true),
          '```'
        ].join('\n'));

      return interaction.editReply({
        embeds: [embed],
        components: buildMinesComponents(wonGame, true)
      });
    }

    const updatedGame = await prisma.minesGame.update({
      where: { id: game.id },
      data: { revealed: newRevealed },
      include: { user: true }
    });

    return interaction.editReply({
      embeds: [buildMinesEmbed(updatedGame, '✅ 安全！')],
      components: buildMinesComponents(updatedGame)
    });
  },

  async handleSelect(interaction) {
    // Backward compatibility for the previous dropdown version. New UI uses direct grid buttons.
    await interaction.deferUpdate();
    return safeFollowUp(interaction, { content: '❌ 此舊版選單已停用，請使用新的踩地雷格子按鈕。' });
  },

  async handleActionButton(interaction) {
    // Control buttons are sent in a separate private follow-up message.
    // Using deferUpdate() here can fail on stale/ephemeral follow-up controls.
    // Use a fresh private reply so cashout/quit always has a valid reply to edit.
    await ensurePrivateReply(interaction);

    const [, action, gameId] = interaction.customId.split(':');
    const game = await getGameById(gameId);
    if (!(await validateGameOwnership(interaction, game))) return;

    if (action === 'force_all') return refundAllActiveGames(interaction);
    if (action === 'cashout') return cashOutGame(interaction, game);
    if (action === 'quit') return quitGame(interaction, game);

    return sendOrEditPrivate(interaction, { content: '❌ 無效的踩地雷操作。' });
  },

  startMinesGame,
  buildMinesEmbed,
  cashOutGame,
  quitGame,
  refundAllActiveGames
};
