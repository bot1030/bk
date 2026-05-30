const fishingConfig = require('../config/fishingConfig');
const { rods } = require('../config/rodConfig');
const { randomInt, rollChance, rollWeighted } = require('../utils/random');

function rollFishingResult(user) {
  const selectedRod = rods[user.selectedRod] || rods.basic;

  if (rollChance(fishingConfig.hiddenDiamond.chance)) {
    return {
      type: 'hidden_diamond',
      label: fishingConfig.hiddenDiamond.label,
      coins: 0,
      jk: fishingConfig.hiddenDiamond.jkReward,
      rod: selectedRod,
      treasure: null
    };
  }

  const fish = rollWeighted(fishingConfig.fishTable);
  const baseValue = randomInt(fish.min, fish.max);
  const finalCoins = Math.floor(baseValue * selectedRod.multiplier);

  let treasure = null;
  if (rollChance(fishingConfig.treasureChest.chance)) {
    treasure = rollWeighted(fishingConfig.treasureChest.rewards);
  }

  return {
    type: 'fish',
    label: fish.label,
    coins: finalCoins,
    jk: 0,
    baseValue,
    rod: selectedRod,
    treasure
  };
}

function getFishingRewardListText() {
  const fishLines = fishingConfig.fishTable.map(
    fish => `${fish.label}：${fish.min.toLocaleString('en-US')}–${fish.max.toLocaleString('en-US')} 金幣`
  );

  fishLines.push(`${fishingConfig.hiddenDiamond.label}：${fishingConfig.hiddenDiamond.jkReward} JK餘額`);

  return fishLines.join('\n');
}

module.exports = {
  rollFishingResult,
  getFishingRewardListText
};
