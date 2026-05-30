const prisma = require('../database/prisma');
const { JK_CONVERSION_RATE } = require('../config/economyConfig');

async function calculateRichLeaderboard() {
  const users = await prisma.user.findMany({
    select: {
      discordId: true,
      username: true,
      coins: true,
      jkBalance: true
    }
  });

  return users
    .map(user => ({
      ...user,
      totalWealth: user.coins + user.jkBalance * JK_CONVERSION_RATE
    }))
    .sort((a, b) => b.totalWealth - a.totalWealth)
    .slice(0, 10);
}

async function updateLeaderboardCache() {
  const data = await calculateRichLeaderboard();

  await prisma.leaderboardCache.upsert({
    where: { id: 1 },
    update: { data },
    create: { id: 1, data }
  });

  return data;
}

async function getLeaderboardCache() {
  const cache = await prisma.leaderboardCache.findUnique({ where: { id: 1 } });

  if (!cache) {
    const data = await updateLeaderboardCache();
    return { data, updatedAt: new Date() };
  }

  return cache;
}

module.exports = {
  calculateRichLeaderboard,
  updateLeaderboardCache,
  getLeaderboardCache
};
