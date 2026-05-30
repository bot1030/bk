module.exports = {
  rods: {
    basic: {
      id: 'basic',
      label: '基礎釣竿',
      cost: 0,
      multiplier: 1.0,
      rarityBoost: 0,
      treasureBonus: 0,
      effect: '標準獎勵機率'
    },
    wooden: {
      id: 'wooden',
      label: '木製釣竿',
      cost: 2000,
      multiplier: 1.0,
      rarityBoost: 0.08,
      treasureBonus: 0.1,
      effect: '小幅提高罕見以上魚類機率'
    },
    iron: {
      id: 'iron',
      label: '鐵製釣竿',
      cost: 5000,
      multiplier: 1.0,
      rarityBoost: 0.14,
      treasureBonus: 0.2,
      effect: '提高稀有魚類出現傾向'
    },
    golden: {
      id: 'golden',
      label: '黃金釣竿',
      cost: 15000,
      multiplier: 1.0,
      rarityBoost: 0.22,
      treasureBonus: 0.35,
      effect: '明顯提高高級魚類出現傾向'
    },
    diamond: {
      id: 'diamond',
      label: '鑽石釣竿',
      cost: 40000,
      multiplier: 1.0,
      rarityBoost: 0.30,
      treasureBonus: 0.5,
      effect: '大幅提高史詩以上魚類出現傾向'
    },
    mythic: {
      id: 'mythic',
      label: '神話釣竿',
      cost: 100000,
      multiplier: 1.0,
      rarityBoost: 0.38,
      treasureBonus: 0.75,
      effect: '最高級釣竿，最容易出現高價值魚類'
    }
  }
};
