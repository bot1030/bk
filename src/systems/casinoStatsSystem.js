const prisma = require('../database/prisma');
const { STARTING_COINS } = require('../config/economyConfig');

const JK_TO_COINS_RATE = 1000;

const ADMIN_USER_IDS = [
  '473647287026057227',
  '786683877107302461',
  '1319968425698922591'
];

const EXTRA_EXCLUDED_USER_IDS = [
  '979514745109479444',
  '1411064622794018866',
  '576599013671960576',
  '1114820292099969053'
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
    betLabel: '總投入金額'
  },
  {
    key: 'slots',
    title: '🎰 幸運轉盤',
    types: ['SLOTS'],
    betLabel: '總投入金額'
  },
  {
    key: 'mines',
    title: '💣 踩地雷',
    types: ['MINES'],
    betLabel: '總投入金額'
  },
  {
    key: 'fishing',
    title: '🎣 釣魚',
    types: ['FISHING'],
    betLabel: '總花費金額'
  },
  {
    key: 'luckyblock',
    title: '🎁 幸運方塊',
    types: ['LUCKY_BLOCK'],
    betLabel: '總投入金額'
  },
];

function formatNumber(value) {
  return Number(value || 0).toLocaleString('en-US');
}

function formatCoins(value) {
  return `${formatNumber(Math.round(value || 0))} 金幣`;
}

function formatEventCoins(value) {
  return `${formatNumber(Math.round(value || 0))} 活動金幣`;
}

function formatJK(value) {
  return `${formatNumber(value || 0)} JK餘額`;
}

function toCoinValue(transaction) {
  const amount = Number(transaction.amount || 0);
  if (transaction.currency === 'JK' || transaction.currency === 'PENDING_JK') return amount * JK_TO_COINS_RATE;
  return amount;
}

function safePercent(numerator, denominator) {
  if (!denominator) return '0.00%';
  return `${((numerator / denominator) * 100).toFixed(2)}%`;
}

function parseCoinflipTaxFromReason(reason) {
  const text = String(reason || '');
  const match = text.match(/稅金\s*([0-9,]+)/);
  if (!match) return 0;

  const value = Number(match[1].replace(/,/g, ''));
  if (!Number.isSafeInteger(value) || value <= 0) return 0;
  return value;
}

function parseSpendKey(tx) {
  const text = String(tx.reason || '');
  const match = text.match(/局號\s*([A-Za-z0-9_-]+)/);
  if (match) return `${tx.type}:${match[1]}`;
  return `${tx.type}:${tx.id}`;
}

function makeBaseStats(title, betLabel = '總投入金額') {
  return {
    title,
    betLabel,
    players: new Set(),
    roundKeys: new Set(),
    payoutEvents: 0,
    totalNegativeCoinValue: 0,
    totalNormalCoinSpent: 0,
    totalEventCoinSpent: 0,
    totalPositiveCoinValue: 0,
    jkPositive: 0,
    jkNegative: 0,
    taxCollected: 0,
    grossPayoutBeforeTax: 0
  };
}

function finalizeGameStats(stats) {
  const totalBetOrCost = stats.totalNegativeCoinValue;
  const totalPaid = stats.totalPositiveCoinValue;
  const gameCenterProfit = totalBetOrCost - totalPaid;

  return {
    title: stats.title,
    betLabel: stats.betLabel,
    playerCount: stats.players.size,
    rounds: stats.roundKeys.size,
    payoutEvents: stats.payoutEvents,
    totalBetOrCost,
    totalNormalCoinSpent: stats.totalNormalCoinSpent,
    totalEventCoinSpent: stats.totalEventCoinSpent,
    totalPaid,
    gameCenterProfit,
    playerNet: totalPaid - totalBetOrCost,
    payoutRate: safePercent(totalPaid, totalBetOrCost),
    payoutEventRate: safePercent(stats.payoutEvents, stats.roundKeys.size),
    jkPositive: stats.jkPositive,
    jkNegative: stats.jkNegative,
    taxCollected: stats.taxCollected,
    grossPayoutBeforeTax: stats.grossPayoutBeforeTax
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
      stats.roundKeys.add(parseSpendKey(tx));
      stats.totalNegativeCoinValue += Math.abs(coinValue);

      if (tx.currency === 'EVENT_COINS') stats.totalEventCoinSpent += Math.abs(tx.amount);
      if (tx.currency === 'COINS') stats.totalNormalCoinSpent += Math.abs(tx.amount);
    } else if (coinValue > 0) {
      stats.payoutEvents += 1;
      stats.totalPositiveCoinValue += coinValue;

      if (tx.type === 'COINFLIP') {
        const tax = parseCoinflipTaxFromReason(tx.reason);
        stats.taxCollected += tax;
        stats.grossPayoutBeforeTax += coinValue + tax;
      }
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
    if (tx.type !== 'CONVERT' && tx.type !== 'CONVERT_SETTLE') continue;
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
  let eventCoinsPaid = 0;

  for (const tx of transactions) {
    if (tx.type !== 'ADMIN_ADD') continue;
    if (tx.amount <= 0) continue;

    const userId = tx.user?.discordId;
    if (userId) players.add(userId);

    entries += 1;

    if (tx.currency === 'COINS') {
      coinsPaid += tx.amount;
      coinValuePaid += tx.amount;
    }

    if (tx.currency === 'JK') {
      jkPaid += tx.amount;
      coinValuePaid += tx.amount * JK_TO_COINS_RATE;
    }

    if (tx.currency === 'EVENT_COINS') {
      eventCoinsPaid += tx.amount;
    }
  }

  return { players: players.size, entries, coinValuePaid, coinsPaid, jkPaid, eventCoinsPaid };
}

function aggregateRedPackets(transactions) {
  const players = new Set();
  let entries = 0;
  let coinValuePaid = 0;
  let coinsPaid = 0;
  let jkPaid = 0;
  let eventCoinsPaid = 0;

  for (const tx of transactions) {
    if (tx.type !== 'RED_PACKET') continue;
    if (tx.amount <= 0) continue;

    const userId = tx.user?.discordId;
    if (userId) players.add(userId);

    entries += 1;

    if (tx.currency === 'COINS') {
      coinsPaid += tx.amount;
      coinValuePaid += tx.amount;
    }

    if (tx.currency === 'JK') {
      jkPaid += tx.amount;
      coinValuePaid += tx.amount * JK_TO_COINS_RATE;
    }

    if (tx.currency === 'EVENT_COINS') {
      eventCoinsPaid += tx.amount;
    }
  }

  return { players: players.size, entries, coinValuePaid, coinsPaid, jkPaid, eventCoinsPaid };
}

function aggregateAdminDeletes(transactions) {
  const players = new Set();
  let entries = 0;
  let coinValueRemoved = 0;
  let coinsRemoved = 0;
  let jkRemoved = 0;
  let pendingJkRemoved = 0;
  let eventCoinsRemoved = 0;

  for (const tx of transactions) {
    if (tx.type !== 'ADMIN_DELETE') continue;
    if (tx.amount >= 0) continue;

    const userId = tx.user?.discordId;
    if (userId) players.add(userId);

    entries += 1;

    if (tx.currency === 'COINS') {
      coinsRemoved += Math.abs(tx.amount);
      coinValueRemoved += Math.abs(tx.amount);
    }

    if (tx.currency === 'JK') {
      jkRemoved += Math.abs(tx.amount);
      coinValueRemoved += Math.abs(tx.amount) * JK_TO_COINS_RATE;
    }

    if (tx.currency === 'PENDING_JK') {
      pendingJkRemoved += Math.abs(tx.amount);
      coinValueRemoved += Math.abs(tx.amount) * JK_TO_COINS_RATE;
    }

    if (tx.currency === 'EVENT_COINS') {
      eventCoinsRemoved += Math.abs(tx.amount);
    }
  }

  return { players: players.size, entries, coinValueRemoved, coinsRemoved, jkRemoved, pendingJkRemoved, eventCoinsRemoved };
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

async function getEventCoinsInCirculation() {
  const result = await prisma.user.aggregate({
    where: {
      discordId: {
        notIn: EXCLUDED_USER_IDS
      }
    },
    _sum: {
      eventCoins: true
    }
  });

  return result._sum.eventCoins || 0;
}

async function getCasinoControlStats() {
  const [transactions, includedUserCount, eventCoinsInCirculation] = await Promise.all([
    prisma.transaction.findMany({
      where: {
        user: {
          discordId: {
            notIn: EXCLUDED_USER_IDS
          }
        }
      },
      select: {
        id: true,
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
    getIncludedUserCount(),
    getEventCoinsInCirculation()
  ]);

  const gameStats = GAME_DEFINITIONS.map(definition => aggregateGameStats(transactions, definition));
  const daily = aggregateDaily(transactions);
  const convert = aggregateConvert(transactions);
  const rods = aggregateRodPurchases(transactions);
  const adminGiveaways = aggregateAdminGiveaways(transactions);
  const redPackets = aggregateRedPackets(transactions);
  const adminDeletes = aggregateAdminDeletes(transactions);
  const antiMartingale = aggregateAntiMartingale(transactions);

  const coinflipTaxCollected = gameStats.reduce((sum, game) => sum + (game.taxCollected || 0), 0);
  const eventCoinsUsedInGames = gameStats.reduce((sum, game) => sum + game.totalEventCoinSpent, 0);
  const normalCoinsUsedInGames = gameStats.reduce((sum, game) => sum + game.totalNormalCoinSpent, 0);
  const gameCenterProfit = gameStats.reduce((sum, game) => sum + game.gameCenterProfit, 0);
  const rodCenterProfit = rods.coinsSpent;
  const startingBonusLoss = includedUserCount * STARTING_COINS;

  const grossOperatingLoss =
    startingBonusLoss +
    daily.coinsPaid +
    adminGiveaways.coinValuePaid +
    adminGiveaways.eventCoinsPaid +
    redPackets.coinValuePaid +
    redPackets.eventCoinsPaid;

  const totalDeleteRecovery = adminDeletes.coinValueRemoved + adminDeletes.eventCoinsRemoved;

  const operatingLosses = {
    startingBonusUsers: includedUserCount,
    startingBonusPerUser: STARTING_COINS,
    startingBonusLoss,
    dailyLoss: daily.coinsPaid,
    adminGiveawayLoss: adminGiveaways.coinValuePaid,
    adminEventGiveawayLoss: adminGiveaways.eventCoinsPaid,
    redPacketLoss: redPackets.coinValuePaid,
    redPacketEventLoss: redPackets.eventCoinsPaid,
    adminDeleteRecovery: adminDeletes.coinValueRemoved,
    adminEventDeleteRecovery: adminDeletes.eventCoinsRemoved,
    totalGrossLoss: grossOperatingLoss,
    totalLoss: grossOperatingLoss - totalDeleteRecovery
  };

  const totalCenterProfitBeforeOperatingLosses = gameCenterProfit + rodCenterProfit;
  const totalCenterProfit = totalCenterProfitBeforeOperatingLosses - operatingLosses.totalLoss;

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
    gameCenterProfit,
    coinflipTaxCollected,
    rodCenterProfit,
    totalCenterProfitBeforeOperatingLosses,
    operatingLosses,
    totalCenterProfit,
    eventCoinsInCirculation,
    eventCoinsUsedInGames,
    normalCoinsUsedInGames,
    games: gameStats,
    daily,
    convert,
    rods,
    adminGiveaways,
    redPackets,
    adminDeletes,
    antiMartingale
  };
}

function buildGameFieldValue(game) {
  const lines = [
    `參與玩家：**${formatNumber(game.playerCount)}**`,
    `局數 / 次數：**${formatNumber(game.rounds)}**`,
    `${game.betLabel}：**${formatCoins(game.totalBetOrCost)}**`,
    `正式金幣投入：**${formatCoins(game.totalNormalCoinSpent)}**`,
    `活動金幣投入：**${formatEventCoins(game.totalEventCoinSpent)}**`,
    `玩家獲得總額：**${formatCoins(game.totalPaid)}**`,
    `遊戲中心淨結果：**${formatCoins(game.gameCenterProfit)}**`,
    `玩家淨結果：**${formatCoins(game.playerNet)}**`,
    game.taxCollected > 0 ? `扣稅收入：**+${formatCoins(game.taxCollected)}**（已包含在遊戲中心淨結果）` : null,
    game.grossPayoutBeforeTax > 0 ? `稅前獎金總額：**${formatCoins(game.grossPayoutBeforeTax)}**` : null,
    `返還率：**${game.payoutRate}**`,
    `獲獎筆數比例：**${game.payoutEventRate}**`
  ];

  if (game.jkPositive > 0 || game.jkNegative > 0) {
    lines.push(`JK變動：+${formatJK(game.jkPositive)} / -${formatJK(game.jkNegative)}`);
  }

  return lines.filter(Boolean).join('\n');
}

module.exports = {
  ADMIN_USER_IDS,
  EXCLUDED_USER_IDS,
  getCasinoControlStats,
  buildGameFieldValue,
  formatCoins,
  formatEventCoins,
  formatJK,
  formatNumber
};
