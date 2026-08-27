module.exports = {
  // Admin users receive economy risk alerts by DM.
  adminUserIds: [
    '473647287026057227',
    '786683877107302461',
    '1319968425698922591',
  '1535635248157827102'
  ],

  gamblingTransactionTypes: ['COINFLIP', 'SLOTS', 'MINES', 'LUCKY_BLOCK'],

  monitoringWindowMinutes: 30,

  // House-risk control. This does NOT secretly rig outcomes.
  // It limits oversized/high-risk betting patterns so progression systems cannot print money.
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

  alertCooldownMinutes: 10,

  // Anti-Martingale / 倍投法 control.
  // Detects repeated "loss -> much larger next bet" patterns.
  // No coin removal. No fake bad-luck. It blocks/limits the risky pattern.
  antiMartingale: {
    enabled: true,
    windowMinutes: 60,
    triggerSteps: 5,
    betIncreaseRatio: 1.8,
    minBetForStep: 1000,
    blockCooldownMinutes: 60,
    blockTransactionType: 'ANTI_MARTINGALE_BLOCK',
    maxBetWhenFlagged: 500
  }
};
