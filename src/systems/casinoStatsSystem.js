const prisma = require('../database/prisma');
const { STARTING_COINS } = require('../config/economyConfig');

const JK_TO_COINS_RATE = 1000;

const ADMIN_USER_IDS = [
  '473647287026057227',
  '786683877107302461',
  '1319968425698922591'
];

const EXTRA_EXCLUDED_USER_IDS = [
  '979514745109479444'
];

const EXCLUDED_USER_IDS = [
  ...ADMIN_USER_IDS,
  ...EXTRA_EXCLUDED_USER_IDS
];

const GAME_DEFINITIONS = [
  {
    key: 'coinflip',
    title: '🪙 硬幣翻轉',
    types: ['COINFLIP'],
    betLabel: '總下注金額'
  },
  {
    key: 'slots',
    title: '🎰 老虎機',
    types: ['SLOTS'],
    betLabel: '總下注金額'
  },
  {
    key: 'mines',
    title: '💣 踩地雷',
    types: ['MINES'],
    betLabel: '總下注金額'
  },
  {
    key: 'fishing',
    title: '🎣 釣魚',
    types: ['FISHING'],
    betLabel: '總花費金額'
  }
];

function formatNumber(value) {
  return Number(value || 0).toLocaleString('en-US');
}

function formatCoins(value) {
  return `${formatNumber(Math.round(value || 0))} 金幣`;
}

function formatJK(value) {
  return `${formatNumber(value || 0)} JK餘額`;
}

function toCoinValue(transaction) {
  const amount = Number(transaction.amount || 0);
  if (transaction.currency === 'JK') return amount * JK_TO_COINS_RATE;
  return amount;
}

function safePercent(numerator, denominator) {
  if (!denominator) return '0.00%';
  return `${((numerator / denominator) * 100).toFixed(2)}%`;
}

function makeBaseStats(title, betLabel = '總下注金額') {
  return {
    title,
    betLabel,
    players: new Set(),
    rounds: 0,
    payoutEvents: 0,
    totalNegativeCoinValue: 0,
    totalPositiveCoinValue: 0,
    jkPositive: 0,
    jkNegative: 0
  };
}

function finalizeGameStats(stats) {
  const totalBetOrCost = stats.totalNegativeCoinValue;
  const totalPaid = stats.totalPositiveCoinValue;
  const casinoProfit = totalBetOrCost - totalPaid;

  return {
    title: stats.title,
    betLabel: stats.betLabel,
    playerCount: stats.players.size,
    rounds: stats.rounds,
    payoutEvents: stats.payoutEvents,
    totalBetOrCost,
    totalPaid,
    casinoProfit,
    playerNet: totalPaid - totalBetOrCost,
    payoutRate: safePercent(totalPaid, totalBetOrCost),
    payoutEventRate: safePercent(stats.payoutEvents, stats.rounds),
    jkPositive: stats.jkPositive,
    jkNegative: stats.jkNegative
  };
}

function aggregateGameStats(transactions, definition) {
  const stats = makeBaseStats(definition.title, definition.betLabel);

  for (const tx of transactions) {
    if (!definition.types.includes(tx.type)) continue;

    const coinValue = toCoinValue(tx);
    const userId = tx.user?.discordId;
    if (userId) stats.players.add(userId);

    if (tx.currency === 'JK') {
      if (tx.amount > 0) stats.jkPositive += tx.amount;
      if (tx.amount < 0) stats.jkNegative += Math.abs(tx.amount);
    }

    if (coinValue < 0) {
      stats.rounds += 1;
      stats.totalNegativeCoinValue += Math.abs(coinValue);
    } else if (coinValue > 0) {
      stats.payoutEvents += 1;
      stats.totalPositiveCoinValue += coinValue;
    }
  }

  return finalizeGameStats(stats);
}

function aggregateDaily(transactions) {
  const players = new Set();
  let claims = 0;
  let coinsPaid = 0;

  for (const tx of transactions) {
    if (tx.type !== 'DAILY') continue;
    const userId = tx.user?.discordId;
    if (userId) players.add(userId);
    if (tx.amount > 0 && tx.currency === 'COINS') {
      claims += 1;
      coinsPaid += tx.amount;
    }
  }

  return { players: players.size, claims, coinsPaid };
}

function aggregateConvert(transactions) {
  const players = new Set();
  let coinSpent = 0;
  let coinReceived = 0;
  let jkSpent = 0;
  let jkReceived = 0;
  let entries = 0;

  for (const tx of transactions) {
    if (tx.type !== 'CONVERT') continue;
    entries += 1;
    const userId = tx.user?.discordId;
    if (userId) players.add(userId);

    if (tx.currency === 'COINS') {
      if (tx.amount < 0) coinSpent += Math.abs(tx.amount);
      if (tx.amount > 0) coinReceived += tx.amount;
    }

    if (tx.currency === 'JK') {
      if (tx.amount < 0) jkSpent += Math.abs(tx.amount);
      if (tx.amount > 0) jkReceived += tx.amount;
    }
  }

  return { players: players.size, entries, coinSpent, coinReceived, jkSpent, jkReceived };
}

function aggregateRodPurchases(transactions) {
  const players = new Set();
  let purchases = 0;
  let coinsSpent = 0;

  for (const tx of transactions) {
    if (tx.type !== 'ROD_PURCHASE') continue;
    const userId = tx.user?.discordId;
    if (userId) players.add(userId);

    if (tx.currency === 'COINS' && tx.amount < 0) {
      purchases += 1;
      coinsSpent += Math.abs(tx.amount);
    }
  }

  return { players: players.size, purchases, coinsSpent };
}

function aggregateAdminGiveaways(transactions) {
  const players = new Set();
  let entries = 0;
  let coinValuePaid = 0;
  let coinsPaid = 0;
  let jkPaid = 0;

  for (const tx of transactions) {
    if (tx.type !== 'ADMIN_ADD') continue;
    if (tx.amount <= 0) continue;

    const userId = tx.user?.discordId;
    if (userId) players.add(userId);

    entries += 1;
    coinValuePaid += toCoinValue(tx);

    if (tx.currency === 'COINS') coinsPaid += tx.amount;
    if (tx.currency === 'JK') jkPaid += tx.amount;
  }

  return { players: players.size, entries, coinValuePaid, coinsPaid, jkPaid };
}

function aggregateAntiMartingale(transactions) {
  const players = new Set();
  let blocks = 0;

  for (const tx of transactions) {
    if (tx.type !== 'ANTI_MARTINGALE_BLOCK') continue;
    const userId = tx.user?.discordId;
    if (userId) players.add(userId);
    blocks += 1;
  }

  return { players: players.size, blocks };
}

async function getIncludedUserCount() {
  return prisma.user.count({
    where: {
      discordId: {
        notIn: EXCLUDED_USER_IDS
      }
    }
  });
}

async function getCasinoControlStats() {
  const [transactions, includedUserCount] = await Promise.all([
    prisma.transaction.findMany({
      where: {
        user: {
          discordId: {
            notIn: EXCLUDED_USER_IDS
          }
        }
      },
      select: {
        type: true,
        currency: true,
        amount: true,
        reason: true,
        createdAt: true,
        user: {
          select: {
            discordId: true,
            username: true
          }
        }
      },
      orderBy: { createdAt: 'asc' }
    }),
    getIncludedUserCount()
  ]);

  const gameStats = GAME_DEFINITIONS.map(definition => aggregateGameStats(transactions, definition));
  const daily = aggregateDaily(transactions);
  const convert = aggregateConvert(transactions);
  const rods = aggregateRodPurchases(transactions);
  const adminGiveaways = aggregateAdminGiveaways(transactions);
  const antiMartingale = aggregateAntiMartingale(transactions);

  const gameCasinoProfit = gameStats.reduce((sum, game) => sum + game.casinoProfit, 0);
  const rodCasinoProfit = rods.coinsSpent;
  const startingBonusLoss = includedUserCount * STARTING_COINS;

  const operatingLosses = {
    startingBonusUsers: includedUserCount,
    startingBonusPerUser: STARTING_COINS,
    startingBonusLoss,
    dailyLoss: daily.coinsPaid,
    adminGiveawayLoss: adminGiveaways.coinValuePaid,
    totalLoss: startingBonusLoss + daily.coinsPaid + adminGiveaways.coinValuePaid
  };

  const totalCasinoProfitBeforeOperatingLosses = gameCasinoProfit + rodCasinoProfit;
  const totalCasinoProfit = totalCasinoProfitBeforeOperatingLosses - operatingLosses.totalLoss;

  const totalPlayers = new Set();
  for (const tx of transactions) {
    if (tx.user?.discordId) totalPlayers.add(tx.user.discordId);
  }

  return {
    generatedAt: new Date(),
    excludedUserIds: EXCLUDED_USER_IDS,
    totalPlayers: totalPlayers.size,
    includedUserCount,
    totalTransactions: transactions.length,
    gameCasinoProfit,
    rodCasinoProfit,
    totalCasinoProfitBeforeOperatingLosses,
    operatingLosses,
    totalCasinoProfit,
    games: gameStats,
    daily,
    convert,
    rods,
    adminGiveaways,
    antiMartingale
  };
}

function buildGameFieldValue(game) {
  const lines = [
    `參與玩家：**${formatNumber(game.playerCount)}**`,
    `局數 / 次數：**${formatNumber(game.rounds)}**`,
    `${game.betLabel}：**${formatCoins(game.totalBetOrCost)}**`,
    `玩家獲得總額：**${formatCoins(game.totalPaid)}**`,
    `賭場淨利：**${formatCoins(game.casinoProfit)}**`,
    `玩家淨結果：**${formatCoins(game.playerNet)}**`,
    `返還率：**${game.payoutRate}**`,
    `獲獎筆數比例：**${game.payoutEventRate}**`
  ];

  if (game.jkPositive > 0 || game.jkNegative > 0) {
    lines.push(`JK變動：+${formatJK(game.jkPositive)} / -${formatJK(game.jkNegative)}`);
  }

  return lines.join('\n');
}

module.exports = {
  ADMIN_USER_IDS,
  EXCLUDED_USER_IDS,
  getCasinoControlStats,
  buildGameFieldValue,
  formatCoins,
  formatJK,
  formatNumber
};
