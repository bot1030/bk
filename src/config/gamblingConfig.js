module.exports = {
  coinflip: {
    minBet: 100,
    maxBet: 100000,
    winChance: 0.45,
    payoutMultiplier: 2
  },

  slots: {
    minBet: 500,
    maxBet: 50000,
    results: [
      { id: 'nothing', label: '沒有中獎', chance: 78.0, multiplier: 0 },
      { id: 'pair', label: '一對', chance: 18.0, multiplier: 1.5 },
      { id: 'cherry', label: '三個 🍒', chance: 3.0, multiplier: 5, symbol: '🍒' },
      { id: 'diamond', label: '三個 💎', chance: 0.75, multiplier: 20, symbol: '💎' },
      { id: 'crown', label: '三個 👑', chance: 0.23, multiplier: 100, symbol: '👑' },
      { id: 'fire', label: '三個 🔥', chance: 0.02, multiplier: 500, symbol: '🔥' }
    ],
    displayPayouts: [
      { label: '沒有中獎', multiplier: '0x' },
      { label: '一對', multiplier: '1.5x' },
      { label: '三個 🍒', multiplier: '5x' },
      { label: '三個 💎', multiplier: '20x' },
      { label: '三個 👑', multiplier: '100x' },
      { label: '三個 🔥', multiplier: '500x' }
    ]
  },

  mines: {
    minBet: 100,
    maxBet: 100000,
    gridSize: 25,
    rowSize: 5,
    minMines: 5,
    maxMines: 15,
    maxSafePicksForMultiplier: 6,

    // Conservative multipliers. Mines is designed with house edge, so it cannot become a cash printer.
    multipliers: {
      5:  [1.02, 1.08, 1.18, 1.32, 1.50, 1.75],
      6:  [1.03, 1.11, 1.24, 1.42, 1.66, 1.95],
      7:  [1.05, 1.16, 1.33, 1.56, 1.88, 2.28],
      8:  [1.07, 1.22, 1.46, 1.78, 2.22, 2.82],
      9:  [1.10, 1.30, 1.62, 2.05, 2.65, 3.45],
      10: [1.14, 1.40, 1.82, 2.45, 3.35, 4.55],
      11: [1.18, 1.52, 2.08, 2.95, 4.25, 6.00],
      12: [1.23, 1.65, 2.38, 3.55, 5.25, 7.75],
      13: [1.28, 1.80, 2.72, 4.25, 6.45, 9.80],
      14: [1.32, 1.92, 2.95, 4.70, 7.35, 11.20],
      15: [1.35, 2.00, 3.00, 4.50, 6.50, 9.50]
    },

    // Transparent anti-abuse control. If a player repeatedly wins high-bet Mines,
    // the next high-bet Mines start is blocked temporarily instead of secretly rigging outcomes.
    highBetStreakControl: {
      enabled: true,
      minBet: 30000,
      maxBet: 100000,
      winCount: 3,
      windowMinutes: 30
    }
  }
};
