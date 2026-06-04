const fishingConfig = require('../config/fishingConfig');
const { rods } = require('../config/rodConfig');
const { randomInt, rollChance, rollWeighted } = require('../utils/random');

function normalizeLuckPercent(luckPercent = 0) {
  const value = Number(luckPercent) || 0;
  return Math.min(1.25, Math.max(0, value));
}

function getAdjustedFishTable(rod, luckPercent = 0) {
  const boost = Number(rod.rarityBoost || 0);
  const luck = normalizeLuckPercent(luckPercent);

  // Luck gives a very small rarity tilt. Hidden Diamond is handled separately and is never affected.
  const luckTilt = 1 + luck * 0.08;

  const rarityMultipliers = {
    common: Math.max(0.1, 1 - boost * 0.45 - luck * 0.01),
    uncommon: Math.max(0.1, 1 - boost * 0.2),
    rare: (1 + boost * 0.8) * luckTilt,
    epic: (1 + boost * 1.4) * luckTilt,
    legendary: (1 + boost * 2.2) * luckTilt,
    mythic: (1 + boost * 3.5) * luckTilt
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

function rollFishingResult(user, luckPercent = 0) {
  const selectedRod = rods[user.selectedRod] || rods.basic;
  const luck = normalizeLuckPercent(luckPercent);

  // 隱藏鑽石是特殊超稀有獎勵，不受釣竿或角色幸運值加成影響，避免 JK餘額 被過度農出來。
  if (rollChance(fishingConfig.hiddenDiamond.chance)) {
    return {
      type: 'hidden_diamond',
      label: fishingConfig.hiddenDiamond.label,
      coins: 0,
      jk: fishingConfig.hiddenDiamond.jkReward,
      rod: selectedRod,
      treasure: null,
      luckPercent: luck
    };
  }

  // 釣竿與角色幸運值不會直接保證賺錢，只會把普通獎勵微幅往高稀有度 / 寶箱偏移。
  const adjustedFishTable = getAdjustedFishTable(selectedRod, luck);
  const fish = rollWeighted(adjustedFishTable);
  const baseValue = randomInt(fish.min, fish.max);
  const finalCoins = baseValue;

  let treasure = null;
  const treasureChance = fishingConfig.treasureChest.chance + Number(selectedRod.treasureBonus || 0) + luck;
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
    adjustedFishTable,
    luckPercent: luck
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
