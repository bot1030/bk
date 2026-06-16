const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const prisma = require('../database/prisma');
const { getOrCreateUser, addCoins } = require('../systems/economySystem');
const { DAILY_COOLDOWN_MS } = require('../config/economyConfig');
const { getRemainingCooldown } = require('../utils/cooldown');
const { formatCoins, formatDuration } = require('../utils/format');
const { getMemberRoleBenefits, applyDailyBoost, formatBenefitLine } = require('../systems/roleBenefitSystem');
const { checkDailyFarmingWarning } = require('../systems/dailyFarmingMonitorSystem');
const { rollDailyBaseReward } = require('../systems/dailyRewardSystem');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('daily')
    .setDescription('領取你的每日獎勵'),

  async execute(interaction) {
    const user = await getOrCreateUser(interaction.user);
    const remaining = getRemainingCooldown(user.lastDaily, DAILY_COOLDOWN_MS);

    if (remaining > 0) {
      const embed = new EmbedBuilder()
        .setColor(0xe67e22)
        .setTitle('⏰ 每日獎勵冷卻中')
        .setDescription(`你已經領取過每日獎勵了。\n請在 **${formatDuration(remaining)}** 後再試一次。`);

      return interaction.reply({ embeds: [embed] });
    }

    const benefits = getMemberRoleBenefits(interaction.member);
    const baseReward = rollDailyBaseReward();
    const reward = applyDailyBoost(baseReward, benefits);

    const updatedUser = await addCoins(interaction.user, reward, 'DAILY', `每日獎勵｜基礎 ${baseReward}｜加成 +${benefits.dailyBoostPercent}%`);

    await prisma.user.update({
      where: { discordId: interaction.user.id },
      data: { lastDaily: new Date() }
    });

    const embed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle('🎁 每日獎勵')
      .setDescription([
        `基礎獎勵：**${formatCoins(baseReward)}**`,
        `角色加成：**+${benefits.dailyBoostPercent}%**`,
        `本次獲得：**${formatCoins(reward)}**`,
        `目前金幣：**${formatCoins(updatedUser.coins)}**`,
        '',
        `目前加成：${formatBenefitLine(benefits)}`,
        '明天再回來領取獎勵。'
      ].join('\n'));

    await interaction.reply({ embeds: [embed] });

    checkDailyFarmingWarning(interaction.client, interaction.guild, interaction.user)
      .catch(error => console.error('[dailyFarmingMonitor] Failed to check daily warning:', error));

    return null;
  }
};
