const { updateLeaderboardCache } = require('../systems/leaderboardSystem');
const { startLeaderboardJob } = require('../jobs/leaderboardJob');
const { startDoneAutoCommentJob } = require('../systems/commentSystem');

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

    try {
      startDoneAutoCommentJob(client);
      console.log('✅ Done auto-comment job started.');
    } catch (error) {
      console.error('❌ Failed to start done auto-comment job:', error);
    }
  }
};
