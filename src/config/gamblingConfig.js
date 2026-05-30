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
    minMines: 1,
    maxMines: 10,
    maxSafePicksForMultiplier: 10,
    // Curated multipliers. More mines = higher risk and higher reward.
    multipliers: {
      1:  [1.05, 1.12, 1.20, 1.30, 1.42, 1.56, 1.72, 1.90, 2.12, 2.38],
      2:  [1.10, 1.25, 1.45, 1.70, 2.00, 2.40, 2.90, 3.50, 4.25, 5.20],
      3:  [1.15, 1.40, 1.75, 2.20, 2.80, 3.60, 4.70, 6.10, 8.00, 10.50],
      4:  [1.20, 1.55, 2.05, 2.75, 3.75, 5.20, 7.30, 10.40, 15.00, 22.00],
      5:  [1.25, 1.75, 2.50, 3.65, 5.40, 8.10, 12.30, 18.80, 29.00, 45.00],
      6:  [1.35, 2.00, 3.00, 4.65, 7.30, 11.60, 18.70, 30.50, 50.00, 80.00],
      7:  [1.45, 2.25, 3.70, 6.10, 10.20, 17.30, 29.70, 51.50, 90.00, 130.00],
      8:  [1.60, 2.65, 4.60, 8.10, 14.50, 26.50, 49.00, 90.00, 150.00, 220.00],
      9:  [1.80, 3.20, 6.00, 11.20, 21.20, 40.50, 78.00, 140.00, 230.00, 330.00],
      10: [2.00, 4.00, 8.00, 16.00, 32.00, 64.00, 120.00, 210.00, 340.00, 500.00]
    }
  }
};
