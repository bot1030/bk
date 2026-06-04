const { ROLE_SHOP } = require('../config/roleShopConfig');

function roleCollectionHas(member, roleId) {
  if (!member || !roleId) return false;

  if (member.roles?.cache?.has) {
    return member.roles.cache.has(roleId);
  }

  if (Array.isArray(member.roles)) {
    return member.roles.includes(roleId);
  }

  return false;
}

function clampPercent(value, min, max) {
  return Math.min(max, Math.max(min, Number(value) || 0));
}

function getOwnedBuffRoles(member) {
  return ROLE_SHOP.buffRoles.filter(role => roleCollectionHas(member, role.id));
}

function getOwnedCosmeticRoles(member) {
  return ROLE_SHOP.cosmeticRoles.filter(role => roleCollectionHas(member, role.id));
}

function getMemberRoleBenefits(member) {
  const ownedBuffRoles = getOwnedBuffRoles(member);
  const ownsServerBooster = roleCollectionHas(member, ROLE_SHOP.serverBoosterRole.id);

  const rawDailyBoost = ownedBuffRoles.reduce((sum, role) => sum + Number(role.dailyBoostPercent || 0), 0)
    + (ownsServerBooster ? ROLE_SHOP.serverBoosterRole.dailyBoostPercent : 0);

  const rawFishingCooldown = ownedBuffRoles.reduce((sum, role) => sum + Number(role.fishingCooldownPercent || 0), 0);
  const rawLuck = ownedBuffRoles.reduce((best, role) => Math.max(best, Number(role.luckPercent || 0)), 0);

  return {
    dailyBoostPercent: clampPercent(rawDailyBoost, 0, ROLE_SHOP.dailyBoostCapPercent),
    rawDailyBoostPercent: rawDailyBoost,
    fishingCooldownPercent: clampPercent(rawFishingCooldown, 0, ROLE_SHOP.fishingCooldownCapPercent),
    rawFishingCooldownPercent: rawFishingCooldown,
    luckPercent: clampPercent(rawLuck, 0, ROLE_SHOP.luckCapPercent),
    ownsServerBooster,
    ownedBuffRoles,
    ownedCosmeticRoles: getOwnedCosmeticRoles(member)
  };
}

function applyDailyBoost(baseReward, benefits) {
  const percent = Number(benefits?.dailyBoostPercent || 0);
  return Math.floor(baseReward * (1 + percent / 100));
}

function applyFishingCooldownReduction(baseCooldownMs, benefits) {
  const percent = Number(benefits?.fishingCooldownPercent || 0);
  return Math.max(60 * 1000, Math.round(baseCooldownMs * (1 - percent / 100)));
}

function formatBenefitLine(benefits) {
  const lines = [];

  if (benefits.dailyBoostPercent > 0) {
    lines.push(`每日獎勵 +${benefits.dailyBoostPercent}%`);
  }

  if (benefits.fishingCooldownPercent > 0) {
    lines.push(`釣魚冷卻 -${benefits.fishingCooldownPercent}%`);
  }

  if (benefits.luckPercent > 0) {
    lines.push(`幸運值 +${benefits.luckPercent}%`);
  }

  if (!lines.length) return '沒有啟用角色加成';
  return lines.join('｜');
}

module.exports = {
  roleCollectionHas,
  getOwnedBuffRoles,
  getOwnedCosmeticRoles,
  getMemberRoleBenefits,
  applyDailyBoost,
  applyFishingCooldownReduction,
  formatBenefitLine
};
