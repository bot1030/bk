module.exports = {
  cost: 0,
  cooldownMs: 90 * 60 * 1000,

  fishTable: [
    { id: 'common', label: '普通魚', chance: 60, min: 5, max: 10 },
    { id: 'uncommon', label: '罕見魚', chance: 25, min: 12, max: 25 },
    { id: 'rare', label: '稀有魚', chance: 10, min: 35, max: 75 },
    { id: 'epic', label: '史詩魚', chance: 4, min: 100, max: 220 },
    { id: 'legendary', label: '傳說魚', chance: 0.9, min: 500, max: 1200 },
    { id: 'mythic', label: '神話魚', chance: 0.1, min: 3000, max: 8000 }
  ],

  hiddenDiamond: {
    label: '隱藏鑽石',
    chance: 0.001,
    jkReward: 300
  },

  treasureChest: {
    chance: 2,
    rewards: [
      { label: '50 金幣', coins: 50, chance: 50 },
      { label: '100 金幣', coins: 100, chance: 30 },
      { label: '250 金幣', coins: 250, chance: 15 },
      { label: '1,000 金幣', coins: 1000, chance: 4.5 },
      { label: '5,000 金幣', coins: 5000, chance: 0.5 }
    ]
  }
};
