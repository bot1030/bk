const prisma = require('../database/prisma');
const { STARTING_COINS } = require('../config/economyConfig');
const { settleMaturePendingJkForUserId, deletePendingJkForUserId } = require('./pendingJkSystem');

const GAME_SPEND_TYPES = new Set(['COINFLIP', 'SLOTS', 'MINES', 'FISHING']);

function shouldUseEventCoins(type) {
  return GAME_SPEND_TYPES.has(String(type || '').toUpperCase());
}

function makeSpendId() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function appendSpendId(reason, spendId) {
  const base = reason || '遊戲投入';
  return `${base}｜活動金幣優先｜局號 ${spendId}`;
}

async function getOrCreateUser(discordUser) {
  const user = await prisma.user.upsert({
    where: { discordId: discordUser.id },
    update: { username: discordUser.username },
    create: {
      discordId: discordUser.id,
      username: discordUser.username,
      coins: STARTING_COINS,
      eventCoins: 0,
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

async function addEventCoins(discordUser, amount, type = 'SYSTEM', reason = null) {
  const user = await getOrCreateUser(discordUser);
  const before = Number(user.eventCoins || 0);
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { eventCoins: { increment: amount } }
  });

  await prisma.transaction.create({
    data: {
      userId: user.id,
      type,
      currency: 'EVENT_COINS',
      amount,
      balanceBefore: before,
      balanceAfter: Number(updated.eventCoins || 0),
      reason
    }
  });

  return updated;
}

async function spendPlayableCoins(discordUser, amount, type = 'SYSTEM', reason = null) {
  const user = await getOrCreateUser(discordUser);
  const currentCoins = Number(user.coins || 0);
  const currentEventCoins = Number(user.eventCoins || 0);
  const totalPlayable = currentCoins + currentEventCoins;

  if (totalPlayable < amount) {
    return { ok: false, user, message: '金幣不足', spentCoins: 0, spentEventCoins: 0 };
  }

  const eventToSpend = Math.min(currentEventCoins, amount);
  const normalToSpend = amount - eventToSpend;
  const spendId = makeSpendId();

  const result = await prisma.user.updateMany({
    where: {
      id: user.id,
      coins: { gte: normalToSpend },
      eventCoins: { gte: eventToSpend }
    },
    data: {
      coins: { decrement: normalToSpend },
      eventCoins: { decrement: eventToSpend }
    }
  });

  if (result.count === 0) {
    const freshUser = await prisma.user.findUnique({ where: { id: user.id } });
    return { ok: false, user: freshUser, message: '金幣不足', spentCoins: 0, spentEventCoins: 0 };
  }

  const updated = await prisma.user.findUnique({ where: { id: user.id } });
  const txReason = appendSpendId(reason, spendId);

  const txData = [];

  if (eventToSpend > 0) {
    txData.push({
      userId: user.id,
      type,
      currency: 'EVENT_COINS',
      amount: -eventToSpend,
      balanceBefore: currentEventCoins,
      balanceAfter: currentEventCoins - eventToSpend,
      reason: `${txReason}｜活動金幣 ${eventToSpend}`
    });
  }

  if (normalToSpend > 0) {
    txData.push({
      userId: user.id,
      type,
      currency: 'COINS',
      amount: -normalToSpend,
      balanceBefore: currentCoins,
      balanceAfter: currentCoins - normalToSpend,
      reason: `${txReason}｜正式金幣 ${normalToSpend}`
    });
  }

  if (txData.length > 0) {
    await prisma.transaction.createMany({ data: txData });
  }

  return {
    ok: true,
    user: updated,
    spentCoins: normalToSpend,
    spentEventCoins: eventToSpend,
    totalSpent: amount,
    spendId
  };
}

async function spendCoins(discordUser, amount, type = 'SYSTEM', reason = null) {
  if (shouldUseEventCoins(type)) {
    return spendPlayableCoins(discordUser, amount, type, reason);
  }

  const user = await getOrCreateUser(discordUser);

  if (user.coins < amount) {
    return { ok: false, user, message: '金幣不足', spentCoins: 0, spentEventCoins: 0 };
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
    return { ok: false, user: freshUser, message: '金幣不足', spentCoins: 0, spentEventCoins: 0 };
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

  return { ok: true, user: updated, spentCoins: amount, spentEventCoins: 0, totalSpent: amount };
}

async function spendEventCoins(discordUser, amount, type = 'SYSTEM', reason = null) {
  const user = await getOrCreateUser(discordUser);
  const before = Number(user.eventCoins || 0);

  if (before < amount) {
    return { ok: false, user, message: '活動金幣不足' };
  }

  const result = await prisma.user.updateMany({
    where: {
      id: user.id,
      eventCoins: { gte: amount }
    },
    data: {
      eventCoins: { decrement: amount }
    }
  });

  if (result.count === 0) {
    const freshUser = await prisma.user.findUnique({ where: { id: user.id } });
    return { ok: false, user: freshUser, message: '活動金幣不足' };
  }

  const updated = await prisma.user.findUnique({ where: { id: user.id } });

  await prisma.transaction.create({
    data: {
      userId: user.id,
      type,
      currency: 'EVENT_COINS',
      amount: -amount,
      balanceBefore: before,
      balanceAfter: Number(updated.eventCoins || 0),
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


async function spendPendingJK(discordUser, amount, type = 'ADMIN_DELETE', reason = null) {
  const user = await getOrCreateUser(discordUser);
  return deletePendingJkForUserId(user.id, amount, type, reason);
}

module.exports = {
  GAME_SPEND_TYPES,
  getOrCreateUser,
  getBalance,
  addCoins,
  addEventCoins,
  spendCoins,
  spendPlayableCoins,
  spendEventCoins,
  addJK,
  spendJK,
  spendPendingJK
};
