const { updateLeaderboardCache } = require('../systems/leaderboardSystem');
const { startLeaderboardJob } = require('../jobs/leaderboardJob');

module.exports = {
  name: 'ready',
  once: true,
  async execute(client) {
    console.log(`✅ Logged in as ${client.user.tag}`);

    try {
      await updateLeaderboardCache();
      startLeaderboardJob();
      console.log('✅ Leaderboard updater started.');
    } catch (error) {
      console.error('❌ Failed to start leaderboard updater:', error);
    }
  }
};
