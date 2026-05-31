const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const {
  ADMIN_USER_IDS,
  EXCLUDED_USER_IDS,
  getCasinoControlStats,
  buildGameFieldValue,
  formatCoins,
  formatJK,
  formatNumber
} = require('../systems/casinoStatsSystem');

function privatePayload(payload = {}) {
  return { ...payload, flags: MessageFlags.Ephemeral };
}

function isAdmin(userId) {
  return ADMIN_USER_IDS.includes(userId);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('cc')
    .setDescription('查看賭場控制中心統計資料'),

  async execute(interaction) {
    if (!isAdmin(interaction.user.id)) {
      return interaction.reply(privatePayload({ content: '你不能這麼做 作弊鬼' }));
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const stats = await getCasinoControlStats();

    const embed = new EmbedBuilder()
      .setColor(stats.totalCasinoProfit >= 0 ? 0x2ecc71 : 0xe74c3c)
      .setTitle('📊 賭場控制中心 / CC')
      .setDescription([
        `統計範圍：**全部資料**`,
        `排除使用者：**${EXCLUDED_USER_IDS.join(', ')}**`,
        `有效玩家數：**${formatNumber(stats.totalPlayers)}**`,
        `交易紀錄數：**${formatNumber(stats.totalTransactions)}**`,
        `賭場總淨利：**${formatCoins(stats.totalCasinoProfit)}**`
      ].join('\n'))
      .setFooter({ text: '資料不包含管理員與指定排除使用者。正數代表賭場賺，負數代表玩家整體賺。' })
      .setTimestamp(stats.generatedAt);

    for (const game of stats.games) {
      embed.addFields({
        name: game.title,
        value: buildGameFieldValue(game),
        inline: false
      });
    }

    embed.addFields(
      {
        name: '🎁 每日獎勵',
        value: [
          `領取玩家：**${formatNumber(stats.daily.players)}**`,
          `領取次數：**${formatNumber(stats.daily.claims)}**`,
          `發放金幣：**${formatCoins(stats.daily.coinsPaid)}**`
        ].join('\n'),
        inline: false
      },
      {
        name: '🔁 貨幣兌換',
        value: [
          `使用玩家：**${formatNumber(stats.convert.players)}**`,
          `交易筆數：**${formatNumber(stats.convert.entries)}**`,
          `金幣支出：**${formatCoins(stats.convert.coinSpent)}**`,
          `金幣獲得：**${formatCoins(stats.convert.coinReceived)}**`,
          `JK支出：**${formatJK(stats.convert.jkSpent)}**`,
          `JK獲得：**${formatJK(stats.convert.jkReceived)}**`
        ].join('\n'),
        inline: false
      },
      {
        name: '🎣 釣竿購買',
        value: [
          `購買玩家：**${formatNumber(stats.rods.players)}**`,
          `購買次數：**${formatNumber(stats.rods.purchases)}**`,
          `玩家花費：**${formatCoins(stats.rods.coinsSpent)}**`
        ].join('\n'),
        inline: false
      },

      {
        name: '⚠️ 倍投法風險控管',
        value: [
          `觸發玩家：**${formatNumber(stats.antiMartingale.players)}**`,
          `限制玩家：**${formatNumber(stats.antiMartingale.players)}**`,
          `限制紀錄：**${formatNumber(stats.antiMartingale.blocks)}**`,
          `限制紀錄：**0 金幣**`
        ].join('\n'),
        inline: false
      }
    );

    return interaction.editReply({ embeds: [embed] });
  }
};
