const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const prisma = require('../database/prisma');
const { getOrCreateUser, addCoins } = require('../systems/economySystem');
const { DAILY_REWARD_MIN, DAILY_REWARD_MAX, DAILY_COOLDOWN_MS } = require('../config/economyConfig');
const { randomInt } = require('../utils/random');
const { getRemainingCooldown } = require('../utils/cooldown');
const { formatCoins, formatDuration } = require('../utils/format');

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

    const reward = randomInt(DAILY_REWARD_MIN, DAILY_REWARD_MAX);
    await addCoins(interaction.user, reward, 'DAILY', '每日獎勵');

    await prisma.user.update({
      where: { discordId: interaction.user.id },
      data: { lastDaily: new Date() }
    });

    const embed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle('🎁 每日獎勵')
      .setDescription(`你獲得了 **${formatCoins(reward)}**！\n明天再回來領取獎勵。`);

    await interaction.reply({ embeds: [embed] });
  }
};
