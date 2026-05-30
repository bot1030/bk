const fishingConfig = require('../config/fishingConfig');
const { rods } = require('../config/rodConfig');
const { randomInt, rollChance, rollWeighted } = require('../utils/random');

function getAdjustedFishTable(rod) {
  const boost = Number(rod.rarityBoost || 0);

  const rarityMultipliers = {
    common: Math.max(0.1, 1 - boost * 0.45),
    uncommon: Math.max(0.1, 1 - boost * 0.2),
    rare: 1 + boost * 0.8,
    epic: 1 + boost * 1.4,
    legendary: 1 + boost * 2.2,
    mythic: 1 + boost * 3.5
  };

  return fishingConfig.fishTable.map(fish => ({
    ...fish,
    chance: fish.chance * (rarityMultipliers[fish.id] || 1)
  }));
}

function getRodEffectLabel(rod) {
  const boostPercent = Math.round((rod.rarityBoost || 0) * 100);
  const treasureText = rod.treasureBonus ? `｜寶箱機率 +${rod.treasureBonus}%` : '';
  if (boostPercent <= 0) return `${rod.effect || '標準獎勵機率'}${treasureText}`;
  return `${rod.effect || '提高高級魚類機率'}｜高級魚傾向 +${boostPercent}%${treasureText}`;
}

function rollFishingResult(user) {
  const selectedRod = rods[user.selectedRod] || rods.basic;

  // 隱藏鑽石是特殊超稀有獎勵，不受釣竿加成影響，避免 JK餘額 被過度農出來。
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

  // 釣竿不會直接提高「一定賺錢」的機率，而是把魚類結果稍微往更高稀有度偏移。
  const adjustedFishTable = getAdjustedFishTable(selectedRod);
  const fish = rollWeighted(adjustedFishTable);
  const baseValue = randomInt(fish.min, fish.max);
  const finalCoins = baseValue;

  let treasure = null;
  const treasureChance = fishingConfig.treasureChest.chance + Number(selectedRod.treasureBonus || 0);
  if (rollChance(treasureChance)) {
    treasure = rollWeighted(fishingConfig.treasureChest.rewards);
  }

  return {
    type: 'fish',
    label: fish.label,
    coins: finalCoins,
    jk: 0,
    baseValue,
    rod: selectedRod,
    treasure,
    adjustedFishTable
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
  getFishingRewardListText,
  getAdjustedFishTable,
  getRodEffectLabel
};
