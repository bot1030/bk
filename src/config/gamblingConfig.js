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
    minMines: 7,
    maxMines: 10,
    maxSafePicksForMultiplier: 10,
    // Balanced multipliers. Minimum 7 mines keeps the game risky, and all tables are below fair odds.
    multipliers: {
      7:  [1.10, 1.45, 1.95, 2.70, 3.85, 5.60, 8.40, 13.00, 21.00, 36.00],
      8:  [1.15, 1.60, 2.25, 3.30, 5.00, 7.80, 12.50, 21.00, 38.00, 75.00],
      9:  [1.20, 1.80, 2.80, 4.40, 7.20, 12.30, 22.00, 42.00, 88.00, 190.00],
      10: [1.25, 2.00, 3.40, 6.00, 11.00, 22.00, 45.00, 95.00, 210.00, 480.00]
    }
  }
};
