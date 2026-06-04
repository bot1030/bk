const prisma = require('../database/prisma');
const { ROLE_SHOP } = require('../config/roleShopConfig');
const { getOrCreateUser } = require('./economySystem');
const { getPendingJkSummaryByUserId } = require('./pendingJkSystem');
const { randomInt, rollChance } = require('../utils/random');

function getTheftTier(stealableCoins) {
  return ROLE_SHOP.thief.tiers.find(tier => stealableCoins <= tier.maxCoins) || ROLE_SHOP.thief.tiers[ROLE_SHOP.thief.tiers.length - 1];
}

function randomPercent(min, max) {
  return min + Math.random() * (max - min);
}

function getCooldownRemaining(lastDate, cooldownMs) {
  if (!lastDate) return 0;
  const elapsed = Date.now() - new Date(lastDate).getTime();
  return Math.max(0, cooldownMs - elapsed);
}

async function getLastTheftAttempt(thiefId) {
  return prisma.theftAttempt.findFirst({
    where: { thiefId },
    orderBy: { createdAt: 'desc' }
  });
}

async function getRecentVictimSuccess(victimId) {
  const after = new Date(Date.now() - ROLE_SHOP.thief.victimProtectionMs);
  return prisma.theftAttempt.findFirst({
    where: {
      victimId,
      status: 'SUCCESS',
      createdAt: { gte: after }
    },
    orderBy: { createdAt: 'desc' }
  });
}

async function deductFromPendingRows(tx, victimId, amountToSteal) {
  if (amountToSteal <= 0) return 0;

  const rows = await tx.pendingJkConversion.findMany({
    where: {
      userId: victimId,
      status: 'PENDING',
      coinAmount: { gt: 0 }
    },
    orderBy: { createdAt: 'asc' }
  });

  let remaining = amountToSteal;
  let stolen = 0;

  for (const row of rows) {
    if (remaining <= 0) break;

    const take = Math.min(row.coinAmount, remaining);
    const newAmount = row.coinAmount - take;

    await tx.pendingJkConversion.update({
      where: { id: row.id },
      data: {
        coinAmount: newAmount,
        status: newAmount <= 0 ? 'STOLEN' : 'PENDING'
      }
    });

    stolen += take;
    remaining -= take;
  }

  return stolen;
}

async function attemptSteal(thiefDiscordUser, victimDiscordUser) {
  const thief = await getOrCreateUser(thiefDiscordUser);
  const victim = await getOrCreateUser(victimDiscordUser);

  const lastAttempt = await getLastTheftAttempt(thief.id);
  const cooldownRemaining = getCooldownRemaining(lastAttempt?.createdAt, ROLE_SHOP.thief.cooldownMs);
  if (cooldownRemaining > 0) {
    return { ok: false, code: 'COOLDOWN', cooldownRemaining };
  }

  const victimSuccess = await getRecentVictimSuccess(victim.id);
  if (victimSuccess) {
    return { ok: false, code: 'VICTIM_PROTECTED' };
  }

  const pendingSummary = await getPendingJkSummaryByUserId(victim.id);
  const stealableCoins = victim.coins + pendingSummary.pendingCoins;

  if (stealableCoins <= 0) {
    await prisma.theftAttempt.create({
      data: {
        thiefId: thief.id,
        victimId: victim.id,
        status: 'NO_STEALABLE_MONEY',
        amount: 0
      }
    });
    return { ok: false, code: 'NO_STEALABLE_MONEY' };
  }

  const tier = getTheftTier(stealableCoins);
  const success = rollChance(tier.successChancePercent);

  if (!success) {
    const penalty = Math.min(ROLE_SHOP.thief.failPenaltyCoins, thief.coins);

    const updatedThief = await prisma.$transaction(async tx => {
      let newThief = thief;

      if (penalty > 0) {
        newThief = await tx.user.update({
          where: { id: thief.id },
          data: { coins: { decrement: penalty } }
        });

        await tx.transaction.create({
          data: {
            userId: thief.id,
            type: 'STEAL_FAIL',
            currency: 'COINS',
            amount: -penalty,
            balanceBefore: thief.coins,
            balanceAfter: newThief.coins,
            reason: `偷竊 <@${victimDiscordUser.id}> 失敗罰金`
          }
        });
      }

      await tx.theftAttempt.create({
        data: {
          thiefId: thief.id,
          victimId: victim.id,
          status: 'FAILED',
          amount: penalty
        }
      });

      return newThief;
    });

    return {
      ok: true,
      success: false,
      penalty,
      tier,
      thief: updatedThief
    };
  }

  const percent = randomPercent(tier.minPercent, tier.maxPercent);
  const desiredAmount = Math.max(1, Math.floor(stealableCoins * (percent / 100)));
  const cappedDesired = Math.min(desiredAmount, ROLE_SHOP.thief.maxStealCoins, stealableCoins);

  const result = await prisma.$transaction(async tx => {
    const freshVictim = await tx.user.findUnique({ where: { id: victim.id } });
    const freshThief = await tx.user.findUnique({ where: { id: thief.id } });

    const coinPart = Math.min(freshVictim.coins, cappedDesired);
    const pendingPartWanted = cappedDesired - coinPart;
    const pendingPart = await deductFromPendingRows(tx, victim.id, pendingPartWanted);
    const finalAmount = coinPart + pendingPart;

    if (finalAmount <= 0) {
      await tx.theftAttempt.create({
        data: {
          thiefId: thief.id,
          victimId: victim.id,
          status: 'NO_STEALABLE_MONEY',
          amount: 0
        }
      });
      return { finalAmount: 0, coinPart: 0, pendingPart: 0, updatedThief: freshThief, updatedVictim: freshVictim };
    }

    let updatedVictim = freshVictim;
    if (coinPart > 0) {
      updatedVictim = await tx.user.update({
        where: { id: victim.id },
        data: { coins: { decrement: coinPart } }
      });

      await tx.transaction.create({
        data: {
          userId: victim.id,
          type: 'STEAL',
          currency: 'COINS',
          amount: -coinPart,
          balanceBefore: freshVictim.coins,
          balanceAfter: updatedVictim.coins,
          reason: `被 <@${thiefDiscordUser.id}> 偷竊金幣`
        }
      });
    }

    if (pendingPart > 0) {
      await tx.transaction.create({
        data: {
          userId: victim.id,
          type: 'STEAL_PENDING_JK',
          currency: 'PENDING_JK_COINS',
          amount: -pendingPart,
          balanceBefore: pendingSummary.pendingCoins,
          balanceAfter: Math.max(0, pendingSummary.pendingCoins - pendingPart),
          reason: `被 <@${thiefDiscordUser.id}> 偷竊待結算 JK餘額`
        }
      });
    }

    const updatedThief = await tx.user.update({
      where: { id: thief.id },
      data: { coins: { increment: finalAmount } }
    });

    await tx.transaction.create({
      data: {
        userId: thief.id,
        type: 'STEAL',
        currency: 'COINS',
        amount: finalAmount,
        balanceBefore: freshThief.coins,
        balanceAfter: updatedThief.coins,
        reason: `成功偷竊 <@${victimDiscordUser.id}>`
      }
    });

    await tx.theftAttempt.create({
      data: {
        thiefId: thief.id,
        victimId: victim.id,
        status: 'SUCCESS',
        amount: finalAmount
      }
    });

    return { finalAmount, coinPart, pendingPart, updatedThief, updatedVictim };
  });

  if (result.finalAmount <= 0) {
    return { ok: false, code: 'NO_STEALABLE_MONEY' };
  }

  return {
    ok: true,
    success: true,
    amount: result.finalAmount,
    coinPart: result.coinPart,
    pendingPart: result.pendingPart,
    percent,
    tier,
    thief: result.updatedThief,
    victim: result.updatedVictim
  };
}

module.exports = {
  attemptSteal,
  getTheftTier
};
