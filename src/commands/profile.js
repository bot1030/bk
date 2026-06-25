const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const prisma = require('../database/prisma');
const { getOrCreateUser } = require('../systems/economySystem');
const { rods } = require('../config/rodConfig');
const { formatCoins, formatCoinsWithEvent, formatJK, formatNumber } = require('../utils/format');
const { getPendingJkSummaryByUserId } = require('../systems/pendingJkSystem');
const { getMemberRoleBenefits, formatBenefitLine } = require('../systems/roleBenefitSystem');

const JK_TO_COINS_RATE = 1000;
const GAME_TRANSACTION_TYPES = ['COINFLIP', 'SLOTS', 'MINES', 'FISHING'];

function isRefundTransaction(tx) {
  const reason = tx.reason || '';
  return reason.includes('退回') || reason.includes('退款') || reason.includes('退出') || reason.includes('本金');
}

function getPositiveGameTransactions(transactions, type, currency = 'COINS') {
  return transactions.filter(tx =>
    tx.type === type &&
    tx.currency === currency &&
    tx.amount > 0 &&
    !isRefundTransaction(tx)
  );
}

function countGameWins(transactions, type) {
  const coinWins = getPositiveGameTransactions(transactions, type, 'COINS').length;
  const jkWins = getPositiveGameTransactions(transactions, type, 'JK').length;
  return coinWins + jkWins;
}

function sumPositiveGameAmount(transactions, currency) {
  return transactions
    .filter(tx =>
      GAME_TRANSACTION_TYPES.includes(tx.type) &&
      tx.currency === currency &&
      tx.amount > 0 &&
      !isRefundTransaction(tx)
    )
    .reduce((sum, tx) => sum + tx.amount, 0);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('profile')
    .setDescription('查看玩家資料')
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('要查看資料的玩家，不填則查看自己')
        .setRequired(false)
    ),

  async execute(interaction) {
    await interaction.deferReply();

    const target = interaction.options.getUser('user') || interaction.user;
    const user = await getOrCreateUser(target);
    const pending = await getPendingJkSummaryByUserId(user.id);

    let targetMember = null;
    try {
      targetMember = await interaction.guild.members.fetch(target.id);
    } catch {
      targetMember = null;
    }

    const benefits = getMemberRoleBenefits(targetMember);

    const transactions = await prisma.transaction.findMany({
      where: { userId: user.id },
      select: {
        type: true,
        currency: true,
        amount: true,
        reason: true
      }
    });

    const selectedRod = rods[user.selectedRod] || rods.basic;
    const playableCoins = Number(user.coins || 0) + Number(user.eventCoins || 0);
    const totalWealth = user.coins + user.jkBalance * JK_TO_COINS_RATE + pending.pendingCoins;

    const coinflipWins = countGameWins(transactions, 'COINFLIP');
    const slotsWins = countGameWins(transactions, 'SLOTS');
    const minesWins = countGameWins(transactions, 'MINES');
    const fishingRewards = countGameWins(transactions, 'FISHING');

    const leisureGamesPlayed = user.coinflipPlayed + user.slotsPlayed + user.minesPlayed;
    const allGamesPlayed = leisureGamesPlayed + user.fishingCount;

    const totalGameWonCoins = sumPositiveGameAmount(transactions, 'COINS');
    const totalGameWonJk = sumPositiveGameAmount(transactions, 'JK');
    const totalGameWonEstimatedCoins = totalGameWonCoins + totalGameWonJk * JK_TO_COINS_RATE;

    const embed = new EmbedBuilder()
      .setColor(0x3498db)
      .setTitle('👤 玩家公開資料')
      .setDescription(`玩家：<@${target.id}>`)
      .addFields(
        {
          name: '💰 目前總資產',
          value: [
            `金幣：**${formatCoinsWithEvent(user.coins, user.eventCoins)}**`,
            `可用遊戲金幣：**${formatCoins(playableCoins)}**`,
            `正式 JK餘額：**${formatJK(user.jkBalance)}**`,
            `待結算 JK餘額：約 **${formatJK(Math.floor(pending.pendingCoins / JK_TO_COINS_RATE))}**`,
            `總資產估值：**${formatCoins(totalWealth)}**`
          ].join('\n'),
          inline: false
        },
        {
          name: '🎮 遊戲總覽',
          value: [
            `總遊玩次數：**${formatNumber(allGamesPlayed)}** 次`,
            `休閒遊戲次數：**${formatNumber(leisureGamesPlayed)}** 次`,
            `釣魚次數：**${formatNumber(user.fishingCount)}** 次`
          ].join('\n'),
          inline: false
        },
        {
          name: '🏆 各遊戲獲得次數',
          value: [
            `硬幣翻轉：**${formatNumber(coinflipWins)}** 次`,
            `幸運轉盤：**${formatNumber(slotsWins)}** 次`,
            `踩地雷成功領取：**${formatNumber(minesWins)}** 次`,
            `釣魚獲得獎勵：**${formatNumber(fishingRewards)}** 次`
          ].join('\n'),
          inline: false
        },
        {
          name: '💵 遊戲獲得總額',
          value: [
            `獲得金幣總額：**${formatCoins(totalGameWonCoins)}**`,
            `獲得 JK餘額總額：**${formatJK(totalGameWonJk)}**`,
            `遊戲獲得估值：**${formatCoins(totalGameWonEstimatedCoins)}**`
          ].join('\n'),
          inline: false
        },
        {
          name: '🎭 角色加成',
          value: [
            `目前加成：**${formatBenefitLine(benefits)}**`,
            `每日加成：**+${benefits.dailyBoostPercent}%**`,
            `釣魚冷卻：**-${benefits.fishingCooldownPercent}%**`,
            `幸運值：**+${benefits.luckPercent}%**`,
            benefits.ownsServerBooster ? 'Server Booster：**已啟用 +15% 每日加成**' : 'Server Booster：**未啟用**'
          ].join('\n'),
          inline: false
        },
        {
          name: '🎣 釣魚資料',
          value: `目前釣竿：**${selectedRod.label || selectedRod.name || user.selectedRod}**`,
          inline: false
        }
      )
      .setTimestamp();

    return interaction.editReply({ embeds: [embed] });
  }
};
