const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getLeaderboardCache } = require('../systems/leaderboardSystem');
const { formatCoins, formatJK, formatNumber } = require('../utils/format');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rich_leaderboard')
    .setDescription('查看全服最富有的前 10 名玩家'),

  async execute(interaction) {
    const cache = await getLeaderboardCache();
    const data = Array.isArray(cache.data) ? cache.data : [];

    const description = data.length === 0
      ? '目前還沒有排行榜資料。'
      : data.map((user, index) => {
          const medal = ['🥇', '🥈', '🥉'][index] || `#${index + 1}`;
          const name = user.username || `玩家 ${user.discordId}`;
          return `${medal} **${name}**\n金幣：${formatCoins(user.coins)}｜JK餘額：${formatJK(user.jkBalance)}｜總財富：${formatNumber(user.totalWealth)}`;
        }).join('\n\n');

    const embed = new EmbedBuilder()
      .setColor(0xf1c40f)
      .setTitle('🌍 全球富豪排行榜')
      .setDescription(description)
      .setFooter({ text: '排行榜每 30 分鐘自動更新一次。總財富 = 金幣 + JK餘額 × 1,000。' });

    await interaction.reply({ embeds: [embed] });
  }
};
