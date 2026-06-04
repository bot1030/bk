const prisma = require('../database/prisma');
const { JK_CONVERSION_RATE } = require('../config/economyConfig');

const PENDING_STATUS = {
  PENDING: 'PENDING',
  SETTLED: 'SETTLED',
  STOLEN: 'STOLEN'
};

function availableAtFromNow(hours = 24) {
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

async function createPendingJkConversion(userId, coinAmount) {
  if (!Number.isInteger(coinAmount) || coinAmount <= 0) {
    throw new Error('coinAmount must be a positive integer.');
  }

  return prisma.pendingJkConversion.create({
    data: {
      userId,
      originalCoinAmount: coinAmount,
      coinAmount,
      availableAt: availableAtFromNow(24),
      status: PENDING_STATUS.PENDING
    }
  });
}

async function settleMaturePendingJkForUserId(userId) {
  const now = new Date();
  const matureRows = await prisma.pendingJkConversion.findMany({
    where: {
      userId,
      status: PENDING_STATUS.PENDING,
      availableAt: { lte: now },
      coinAmount: { gt: 0 }
    },
    orderBy: { createdAt: 'asc' }
  });

  if (!matureRows.length) {
    return prisma.user.findUnique({ where: { id: userId } });
  }

  return prisma.$transaction(async tx => {
    let user = await tx.user.findUnique({ where: { id: userId } });
    if (!user) return null;

    for (const row of matureRows) {
      const jkAmount = Math.floor(row.coinAmount / JK_CONVERSION_RATE);
      const remainderCoins = row.coinAmount % JK_CONVERSION_RATE;

      await tx.pendingJkConversion.update({
        where: { id: row.id },
        data: { status: PENDING_STATUS.SETTLED, coinAmount: 0 }
      });

      if (jkAmount > 0) {
        const before = user.jkBalance;
        user = await tx.user.update({
          where: { id: user.id },
          data: { jkBalance: { increment: jkAmount } }
        });

        await tx.transaction.create({
          data: {
            userId: user.id,
            type: 'CONVERT_SETTLE',
            currency: 'JK',
            amount: jkAmount,
            balanceBefore: before,
            balanceAfter: user.jkBalance,
            reason: '待結算 JK餘額轉為正式 JK餘額'
          }
        });
      }

      if (remainderCoins > 0) {
        const before = user.coins;
        user = await tx.user.update({
          where: { id: user.id },
          data: { coins: { increment: remainderCoins } }
        });

        await tx.transaction.create({
          data: {
            userId: user.id,
            type: 'CONVERT_SETTLE_REMAINDER',
            currency: 'COINS',
            amount: remainderCoins,
            balanceBefore: before,
            balanceAfter: user.coins,
            reason: '待結算 JK餘額剩餘不足 1 JK，退回金幣'
          }
        });
      }
    }

    return user;
  });
}

async function getPendingJkSummaryByUserId(userId) {
  await settleMaturePendingJkForUserId(userId);

  const rows = await prisma.pendingJkConversion.findMany({
    where: {
      userId,
      status: PENDING_STATUS.PENDING,
      coinAmount: { gt: 0 }
    },
    orderBy: { availableAt: 'asc' }
  });

  const pendingCoins = rows.reduce((sum, row) => sum + row.coinAmount, 0);
  return {
    rows,
    pendingCoins,
    pendingJkEquivalent: pendingCoins / JK_CONVERSION_RATE,
    nextAvailableAt: rows[0]?.availableAt || null
  };
}

async function getPendingStealableCoins(userId) {
  const summary = await getPendingJkSummaryByUserId(userId);
  return summary.pendingCoins;
}

module.exports = {
  PENDING_STATUS,
  createPendingJkConversion,
  settleMaturePendingJkForUserId,
  getPendingJkSummaryByUserId,
  getPendingStealableCoins
};
