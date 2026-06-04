const prisma = require('../database/prisma');
const { STARTING_COINS } = require('../config/economyConfig');
const { settleMaturePendingJkForUserId } = require('./pendingJkSystem');

async function getOrCreateUser(discordUser) {
  const user = await prisma.user.upsert({
    where: { discordId: discordUser.id },
    update: { username: discordUser.username },
    create: {
      discordId: discordUser.id,
      username: discordUser.username,
      coins: STARTING_COINS,
      jkBalance: 0,
      ownedRods: ['basic'],
      selectedRod: 'basic'
    }
  });

  return settleMaturePendingJkForUserId(user.id);
}

async function getBalance(discordUser) {
  return getOrCreateUser(discordUser);
}

async function addCoins(discordUser, amount, type = 'SYSTEM', reason = null) {
  const user = await getOrCreateUser(discordUser);
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { coins: { increment: amount } }
  });

  await prisma.transaction.create({
    data: {
      userId: user.id,
      type,
      currency: 'COINS',
      amount,
      balanceBefore: user.coins,
      balanceAfter: updated.coins,
      reason
    }
  });

  return updated;
}

async function spendCoins(discordUser, amount, type = 'SYSTEM', reason = null) {
  const user = await getOrCreateUser(discordUser);

  if (user.coins < amount) {
    return { ok: false, user, message: '金幣不足' };
  }

  const result = await prisma.user.updateMany({
    where: {
      id: user.id,
      coins: { gte: amount }
    },
    data: {
      coins: { decrement: amount }
    }
  });

  if (result.count === 0) {
    const freshUser = await prisma.user.findUnique({ where: { id: user.id } });
    return { ok: false, user: freshUser, message: '金幣不足' };
  }

  const updated = await prisma.user.findUnique({ where: { id: user.id } });

  await prisma.transaction.create({
    data: {
      userId: user.id,
      type,
      currency: 'COINS',
      amount: -amount,
      balanceBefore: user.coins,
      balanceAfter: updated.coins,
      reason
    }
  });

  return { ok: true, user: updated };
}

async function addJK(discordUser, amount, type = 'SYSTEM', reason = null) {
  const user = await getOrCreateUser(discordUser);
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { jkBalance: { increment: amount } }
  });

  await prisma.transaction.create({
    data: {
      userId: user.id,
      type,
      currency: 'JK',
      amount,
      balanceBefore: user.jkBalance,
      balanceAfter: updated.jkBalance,
      reason
    }
  });

  return updated;
}

async function spendJK(discordUser, amount, type = 'SYSTEM', reason = null) {
  const user = await getOrCreateUser(discordUser);

  if (user.jkBalance < amount) {
    return { ok: false, user, message: 'JK餘額不足' };
  }

  const result = await prisma.user.updateMany({
    where: {
      id: user.id,
      jkBalance: { gte: amount }
    },
    data: {
      jkBalance: { decrement: amount }
    }
  });

  if (result.count === 0) {
    const freshUser = await prisma.user.findUnique({ where: { id: user.id } });
    return { ok: false, user: freshUser, message: 'JK餘額不足' };
  }

  const updated = await prisma.user.findUnique({ where: { id: user.id } });

  await prisma.transaction.create({
    data: {
      userId: user.id,
      type,
      currency: 'JK',
      amount: -amount,
      balanceBefore: user.jkBalance,
      balanceAfter: updated.jkBalance,
      reason
    }
  });

  return { ok: true, user: updated };
}

module.exports = {
  getOrCreateUser,
  getBalance,
  addCoins,
  spendCoins,
  addJK,
  spendJK
};
