module.exports = {
  // Only these users receive economy risk alerts by DM.
  adminUserIds: [
    '473647287026057227',
    '786683877107302461'
  ],

  gamblingTransactionTypes: ['COINFLIP', 'SLOTS', 'MINES'],

  monitoringWindowMinutes: 30,

  // This does NOT rig outcomes. It limits oversized bets when a player is already
  // winning too much in a short time window.
  minGamesForWinRateCheck: 8,
  targetWinRate: 0.50,

  highProfitCoins: 100000,
  criticalProfitCoins: 300000,

  highWinRate: 0.65,
  criticalWinRate: 0.75,

  highTotalBetCoins: 150000,
  criticalTotalBetCoins: 350000,

  maxBetWhenHighRisk: 10000,
  maxBetWhenCriticalRisk: 5000,

  alertCooldownMinutes: 10
};
