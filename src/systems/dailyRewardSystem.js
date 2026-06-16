const { randomInt, rollWeighted } = require('../utils/random');

const DAILY_REWARD_TIERS = [
  { min: 800, max: 999, chance: 45 },
  { min: 1000, max: 1199, chance: 30 },
  { min: 1200, max: 1349, chance: 15 },
  { min: 1350, max: 1449, chance: 7 },
  { min: 1450, max: 1500, chance: 3 }
];

function rollDailyBaseReward() {
  const tier = rollWeighted(DAILY_REWARD_TIERS);
  return randomInt(tier.min, tier.max);
}

function getDailyRewardChanceText() {
  return '高額獎勵機率較低。';
}

module.exports = {
  DAILY_REWARD_TIERS,
  rollDailyBaseReward,
  getDailyRewardChanceText
};
