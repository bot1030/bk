const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const gamblingConfig = require('../config/gamblingConfig');
const { validateBet } = require('../utils/guards');
const { formatCoins } = require('../utils/format');
const { spendCoins, addCoins } = require('../systems/economySystem');
const { rollCoinflipWithChoice } = require('../systems/gamblingSystem');
const { getMemberRoleBenefits, formatBenefitLine } = require('../systems/roleBenefitSystem');
const { checkGamblingBetAllowed, sendPostGameRiskAlert } = require('../systems/riskSystem');
const { announceBigWin } = require('../systems/bigWinSystem');
const prisma = require('../database/prisma');

function privatePayload(payload = {}) {
  return { ...payload, flags: MessageFlags.Ephemeral };
}

const COINFLIP_TAX_RATE = 0.03;

function calculateCoinflipTax(grossPayout) {
  if (!grossPayout || grossPayout <= 0) {
    return { grossPayout: 0, taxRate: 0, taxAmount: 0, netPayout: 0 };
  }

  const taxRate = COINFLIP_TAX_RATE;
  const taxAmount = Math.ceil(grossPayout * taxRate);
  const netPayout = Math.max(0, grossPayout - taxAmount);

  return { grossPayout, taxRate, taxAmount, netPayout };
}

function formatTaxRate(rate) {
  return `${Math.round(rate * 100)}%`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('coinflip')
    .setDescription('投下注碼並選擇硬幣正面或反面')
    .addIntegerOption(option =>
      option
        .setName('bet')
        .setDescription('下注金額：100–100,000 金幣')
        .setRequired(true)
        .setMinValue(gamblingConfig.coinflip.minBet)
        .setMaxValue(gamblingConfig.coinflip.maxBet)
    )
    .addStringOption(option =>
      option
        .setName('choice')
        .setDescription('選擇正面或反面')
        .setRequired(true)
        .addChoices(
          { name: '正面', value: 'heads' },
          { name: '反面', value: 'tails' }
        )
    ),

  async execute(interaction) {
    const bet = interaction.options.getInteger('bet');
    const choice = interaction.options.getString('choice');
    const check = validateBet(bet, gamblingConfig.coinflip.minBet, gamblingConfig.coinflip.maxBet);

    if (!check.ok) {
      return interaction.reply(privatePayload({ content: `❌ ${check.message}` }));
    }

    const risk = await checkGamblingBetAllowed(interaction.user, bet);
    if (!risk.ok) {
      return interaction.reply(privatePayload({ content: risk.message }));
    }

    const spent = await spendCoins(interaction.user, bet, 'COINFLIP', '硬幣翻轉下注');
    if (!spent.ok) {
      return interaction.reply(privatePayload({ content: '❌ 你的金幣不足。' }));
    }

    await prisma.user.update({
      where: { discordId: interaction.user.id },
      data: { coinflipPlayed: { increment: 1 } }
    });

    const benefits = getMemberRoleBenefits(interaction.member);
    const result = rollCoinflipWithChoice(choice, benefits.luckPercent);
    let grossPayout = 0;
    let taxRate = 0;
    let taxAmount = 0;
    let payout = 0;

    if (result.won) {
      grossPayout = bet * gamblingConfig.coinflip.payoutMultiplier;
      const tax = calculateCoinflipTax(grossPayout);
      taxRate = tax.taxRate;
      taxAmount = tax.taxAmount;
      payout = tax.netPayout;
      await addCoins(interaction.user, payout, 'COINFLIP', `硬幣翻轉勝利｜稅前 ${grossPayout}｜稅金 ${taxAmount}`);
    }

    await sendPostGameRiskAlert(interaction.client, interaction.user, '硬幣翻轉', [
      `本局下注：**${formatCoins(bet)}**`,
      `本局結果：**${result.won ? '勝利' : '失敗'}**`,
      result.won ? `稅前獎金：**${formatCoins(grossPayout)}**` : `本局獲得：**${formatCoins(0)}**`,
      result.won ? `扣稅：**${formatCoins(taxAmount)}**（${formatTaxRate(taxRate)}）` : null,
      result.won ? `實收獎金：**${formatCoins(payout)}**` : null,
      benefits.luckPercent > 0 ? `角色幸運值：**+${benefits.luckPercent}%**` : null
    ].filter(Boolean));

    if (result.won && payout > 0) {
      await announceBigWin(interaction.client, interaction.guildId, {
        user: interaction.user,
        gameName: '硬幣翻轉',
        coins: payout,
        detailLines: [
          `下注金額：**${formatCoins(bet)}**`,
          `玩家選擇：**${result.choiceLabel}**`,
          `硬幣結果：**${result.resultLabel}**`,
          `稅前獎金：**${formatCoins(grossPayout)}**`,
          `扣稅：**${formatCoins(taxAmount)}**（${formatTaxRate(taxRate)}）`,
          `實收獎金：**${formatCoins(payout)}**`,
          benefits.luckPercent > 0 ? `角色幸運值：**+${benefits.luckPercent}%**` : null
        ].filter(Boolean)
      });
    }

    const embed = new EmbedBuilder()
      .setColor(result.won ? 0x2ecc71 : 0xe74c3c)
      .setTitle('🪙 硬幣翻轉')
      .setDescription([
        `下注金額：**${formatCoins(bet)}**`,
        `你的選擇：**${result.choiceLabel}**`,
        `硬幣結果：**${result.resultLabel}**`,
        benefits.luckPercent > 0 ? `角色加成：**${formatBenefitLine(benefits)}**` : null,
        '',
        `結果：${result.won ? '**你贏了！**' : '**你輸了。**'}`,
        result.won
          ? [
              `稅前獎金：**${formatCoins(grossPayout)}**`,
              `扣稅：**${formatCoins(taxAmount)}**（${formatTaxRate(taxRate)}）`,
              `實收獎金：**${formatCoins(payout)}**。`
            ].join('\n')
          : `你失去了 **${formatCoins(bet)}**。`
      ].filter(line => line !== null).join('\n'));

    return interaction.reply(privatePayload({ embeds: [embed] }));
  },

  calculateCoinflipTax,
  formatTaxRate
};
