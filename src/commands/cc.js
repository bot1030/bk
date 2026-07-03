const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const {
  ADMIN_USER_IDS,
  EXCLUDED_USER_IDS,
  getCasinoControlStats,
  buildGameFieldValue,
  formatCoins,
  formatEventCoins,
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
    .setDescription('查看遊戲中心控制資料'),

  async execute(interaction) {
    if (!isAdmin(interaction.user.id)) {
      return interaction.reply(privatePayload({ content: '你不能這麼做 作弊鬼' }));
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const stats = await getCasinoControlStats();

    const embed = new EmbedBuilder()
      .setColor(stats.totalCenterProfit >= 0 ? 0x2ecc71 : 0xe74c3c)
      .setTitle('📊 遊戲中心控制資料 / CC')
      .setDescription([
        `統計範圍：**全部資料**`,
        `排除使用者：**${EXCLUDED_USER_IDS.join(', ')}**`,
        `有效玩家數：**${formatNumber(stats.includedUserCount)}**`,
        `有效交易紀錄數：**${formatNumber(stats.totalTransactions)}**`,
        '',
        `正式金幣遊戲投入：**${formatCoins(stats.normalCoinsUsedInGames)}**`,
        `活動金幣遊戲投入：**${formatEventCoins(stats.eventCoinsUsedInGames)}**`,
        `目前活動金幣流通：**${formatEventCoins(stats.eventCoinsInCirculation)}**`,
        '',
        `遊戲與釣竿淨結果：**${formatCoins(stats.totalCenterProfitBeforeOperatingLosses)}**`,
        `硬幣翻轉扣稅收入：**+${formatCoins(stats.coinflipTaxCollected)}**（已包含在上方淨結果）`,
        `營運發放成本：**-${formatCoins(stats.operatingLosses.totalGrossLoss)}**`,
        `管理員刪除回收：**+${formatCoins(stats.operatingLosses.adminDeleteRecovery + stats.operatingLosses.adminEventDeleteRecovery)}**`,
        `遊戲中心總淨結果：**${formatCoins(stats.totalCenterProfit)}**`
      ].join('\n'))
      .setFooter({ text: '資料不包含管理員與指定排除使用者。活動金幣會獨立顯示並列入遊戲中心淨結果。' })
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
        name: '🏦 營運發放成本',
        value: [
          `新玩家起始金幣：**${formatNumber(stats.operatingLosses.startingBonusUsers)} 人 × ${formatCoins(stats.operatingLosses.startingBonusPerUser)} = ${formatCoins(stats.operatingLosses.startingBonusLoss)}**`,
          `每日獎勵發放：**${formatCoins(stats.operatingLosses.dailyLoss)}**`,
          `管理員新增金幣 / JK：**${formatCoins(stats.operatingLosses.adminGiveawayLoss)}**`,
          `管理員新增活動金幣：**${formatEventCoins(stats.operatingLosses.adminEventGiveawayLoss)}**`,
          `福袋發放金幣 / JK：**${formatCoins(stats.operatingLosses.redPacketLoss)}**`,
          `福袋發放活動金幣：**${formatEventCoins(stats.operatingLosses.redPacketEventLoss)}**`,
          `發放成本小計：**${formatCoins(stats.operatingLosses.totalGrossLoss)}**`,
          `管理員刪除金幣 / JK / 待結算 JK 回收：**-${formatCoins(stats.operatingLosses.adminDeleteRecovery)}**`,
          `管理員刪除活動金幣回收：**-${formatEventCoins(stats.operatingLosses.adminEventDeleteRecovery)}**`,
          `最終營運成本：**${formatCoins(stats.operatingLosses.totalLoss)}**`
        ].join('\n'),
        inline: false
      },
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
        name: '🧧 福袋發放',
        value: [
          `領取玩家：**${formatNumber(stats.redPackets.players)}**`,
          `領取筆數：**${formatNumber(stats.redPackets.entries)}**`,
          `金幣發放：**${formatCoins(stats.redPackets.coinsPaid)}**`,
          `活動金幣發放：**${formatEventCoins(stats.redPackets.eventCoinsPaid)}**`,
          `JK發放：**${formatJK(stats.redPackets.jkPaid)}**`,
          `折算總成本：**${formatCoins(stats.redPackets.coinValuePaid + stats.redPackets.eventCoinsPaid)}**`
        ].join('\n'),
        inline: false
      },
      {
        name: '🧾 硬幣翻轉稅收',
        value: [
          `扣稅收入：**${formatCoins(stats.coinflipTaxCollected)}**`,
          '此金額已經包含在硬幣翻轉與遊戲中心總淨結果內，不會重複加算。'
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
          `玩家花費：**${formatCoins(stats.rods.coinsSpent)}**`,
          `計入收入：**+${formatCoins(stats.rodCenterProfit)}**`
        ].join('\n'),
        inline: false
      },
      {
        name: '🛠️ 管理員新增發放',
        value: [
          `收到玩家：**${formatNumber(stats.adminGiveaways.players)}**`,
          `發放筆數：**${formatNumber(stats.adminGiveaways.entries)}**`,
          `金幣發放：**${formatCoins(stats.adminGiveaways.coinsPaid)}**`,
          `活動金幣發放：**${formatEventCoins(stats.adminGiveaways.eventCoinsPaid)}**`,
          `JK發放：**${formatJK(stats.adminGiveaways.jkPaid)}**`,
          `折算總成本：**${formatCoins(stats.adminGiveaways.coinValuePaid + stats.adminGiveaways.eventCoinsPaid)}**`
        ].join('\n'),
        inline: false
      },
      {
        name: '🗑️ 管理員刪除回收',
        value: [
          `被刪除玩家：**${formatNumber(stats.adminDeletes.players)}**`,
          `刪除筆數：**${formatNumber(stats.adminDeletes.entries)}**`,
          `金幣刪除：**${formatCoins(stats.adminDeletes.coinsRemoved)}**`,
          `活動金幣刪除：**${formatEventCoins(stats.adminDeletes.eventCoinsRemoved)}**`,
          `JK刪除：**${formatJK(stats.adminDeletes.jkRemoved)}**`,
          `待結算 JK刪除：**${formatJK(stats.adminDeletes.pendingJkRemoved || 0)}**`,
          `折算回收總額：**${formatCoins(stats.adminDeletes.coinValueRemoved + stats.adminDeletes.eventCoinsRemoved)}**`
        ].join('\n'),
        inline: false
      },
      {
        name: '⚠️ 風險控管',
        value: [
          `觸發玩家：**${formatNumber(stats.antiMartingale.players)}**`,
          `限制玩家：**${formatNumber(stats.antiMartingale.players)}**`,
          `限制紀錄：**${formatNumber(stats.antiMartingale.blocks)}**`
        ].join('\n'),
        inline: false
      }
    );

    return interaction.editReply({ embeds: [embed] });
  }
};
