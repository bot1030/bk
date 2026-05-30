const prisma = require('../database/prisma');
const { rods } = require('../config/rodConfig');
const { getRodEffectLabel } = require('./fishingSystem');
const { getOrCreateUser, spendCoins } = require('./economySystem');

function normalizeOwnedRods(ownedRods) {
  if (Array.isArray(ownedRods)) return ownedRods;
  try {
    const parsed = JSON.parse(ownedRods);
    return Array.isArray(parsed) ? parsed : ['basic'];
  } catch {
    return ['basic'];
  }
}

async function buyRod(discordUser, rodId) {
  const rod = rods[rodId];
  if (!rod) return { ok: false, message: '找不到這個釣竿。' };

  const user = await getOrCreateUser(discordUser);
  const owned = normalizeOwnedRods(user.ownedRods);

  if (owned.includes(rodId)) {
    return { ok: false, message: `你已經擁有 ${rod.label}。` };
  }

  const paid = await spendCoins(discordUser, rod.cost, 'ROD_PURCHASE', `購買 ${rod.label}`);
  if (!paid.ok) {
    return { ok: false, message: `你的金幣不足。需要 ${rod.cost.toLocaleString('en-US')} 金幣。` };
  }

  const updatedOwned = [...owned, rodId];
  const updated = await prisma.user.update({
    where: { discordId: discordUser.id },
    data: {
      ownedRods: updatedOwned,
      selectedRod: rodId
    }
  });

  return { ok: true, rod, user: updated };
}

async function selectRod(discordUser, rodId) {
  const rod = rods[rodId];
  if (!rod) return { ok: false, message: '找不到這個釣竿。' };

  const user = await getOrCreateUser(discordUser);
  const owned = normalizeOwnedRods(user.ownedRods);

  if (!owned.includes(rodId)) {
    return { ok: false, message: `你尚未擁有 ${rod.label}。` };
  }

  const updated = await prisma.user.update({
    where: { discordId: discordUser.id },
    data: { selectedRod: rodId }
  });

  return { ok: true, rod, user: updated };
}

function getRodShopText(user = null) {
  const owned = user ? normalizeOwnedRods(user.ownedRods) : [];

  return Object.values(rods)
    .map(rod => {
      const ownedMark = owned.includes(rod.id) ? ' ✅' : '';
      const price = rod.cost === 0 ? '免費' : `${rod.cost.toLocaleString('en-US')} 金幣`;
      return `${rod.label}：${price}｜${getRodEffectLabel(rod)}${ownedMark}`;
    })
    .join('\n');
}

module.exports = {
  buyRod,
  selectRod,
  getRodShopText,
  normalizeOwnedRods
};
