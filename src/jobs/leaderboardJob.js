const { updateLeaderboardCache } = require('../systems/leaderboardSystem');

let interval = null;

function startLeaderboardJob() {
  if (interval) return;

  interval = setInterval(async () => {
    try {
      await updateLeaderboardCache();
      console.log('✅ Rich leaderboard cache updated.');
    } catch (error) {
      console.error('❌ Failed to update leaderboard cache:', error);
    }
  }, 30 * 60 * 1000);
}

module.exports = {
  startLeaderboardJob
};
