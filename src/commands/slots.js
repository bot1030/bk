const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const gamblingConfig = require('../config/gamblingConfig');
const { validateBet } = require('../utils/guards');
const { formatCoins } = require('../utils/format');
const { spendCoins, addCoins } = require('../systems/economySystem');
const { rollSlots, calculatePayout } = require('../systems/gamblingSystem');
const { checkGamblingBetAllowed, sendPostGameRiskAlert } = require('../systems/riskSystem');
const { announceBigWin } = require('../systems/bigWinSystem');
const prisma = require('../database/prisma');

function privatePayload(payload = {}) {
  return { ...payload, flags: MessageFlags.Ephemeral };
}


module.exports = {
  data: new SlashCommandBuilder()
    .setName('slots')
    .setDescription('遊玩幸運轉盤並嘗試贏得大獎')
    .addIntegerOption(option =>
      option
        .setName('bet')
        .setDescription('投入金額：500–50,000 金幣')
        .setRequired(true)
        .setMinValue(gamblingConfig.slots.minBet)
        .setMaxValue(gamblingConfig.slots.maxBet)
    ),

  async execute(interaction) {
    const bet = interaction.options.getInteger('bet');
    const check = validateBet(bet, gamblingConfig.slots.minBet, gamblingConfig.slots.maxBet);

    if (!check.ok) {
      return interaction.reply(privatePayload({ content: `❌ ${check.message}` }));
    }

    const risk = await checkGamblingBetAllowed(interaction.user, bet);
    if (!risk.ok) {
      return interaction.reply(privatePayload({ content: risk.message }));
    }

    const spent = await spendCoins(interaction.user, bet, 'SLOTS', '幸運轉盤投入');
    if (!spent.ok) {
      return interaction.reply(privatePayload({ content: '❌ 你的金幣不足。' }));
    }

    await prisma.user.update({
      where: { discordId: interaction.user.id },
      data: { slotsPlayed: { increment: 1 } }
    });

    const { result, visual } = rollSlots();
    const payout = calculatePayout(bet, result.multiplier);

    if (payout > 0) {
      await addCoins(interaction.user, payout, 'SLOTS', `幸運轉盤結果：${result.label}`);
    }

    await sendPostGameRiskAlert(interaction.client, interaction.user, '幸運轉盤', [
      `本局投入：**${formatCoins(bet)}**`,
      `本局獎項：**${result.label}**`,
      `本局獲得：**${formatCoins(payout)}**`
    ]);

    if (payout > 0) {
      await announceBigWin(interaction.client, interaction.guildId, {
        user: interaction.user,
        gameName: '幸運轉盤',
        coins: payout,
        detailLines: [
          `投入金額：**${formatCoins(bet)}**`,
          `結果：**${visual.join(' | ')}**`,
          `獎項：**${result.label}**`,
          `倍率：**${result.multiplier}x**`
        ]
      });
    }

    const embed = new EmbedBuilder()
      .setColor(payout > 0 ? 0x2ecc71 : 0xe74c3c)
      .setTitle('🎰 幸運轉盤')
      .setDescription([
        `投入金額：**${formatCoins(bet)}**`,
        '',
        `結果：**${visual.join(' | ')}**`,
        '',
        `獎項：**${result.label}**`,
        `倍率：**${result.multiplier}x**`,
        `獲得：**${formatCoins(payout)}**`
      ].join('\n'));

    return interaction.reply(privatePayload({ embeds: [embed] }));
  }
};
