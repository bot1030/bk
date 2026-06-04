const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { ROLE_SHOP } = require('../config/roleShopConfig');
const { roleCollectionHas } = require('../systems/roleBenefitSystem');
const { attemptSteal } = require('../systems/theftSystem');
const { formatCoins, formatDuration } = require('../utils/format');

function privatePayload(payload = {}) {
  return { ...payload, flags: MessageFlags.Ephemeral };
}

function isProtectedTarget(user) {
  return user.bot || ROLE_SHOP.thief.protectedUserIds.includes(user.id);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('偷竊')
    .setDescription('幻影怪盜專用：每天嘗試偷竊其他玩家一次')
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('要偷竊的玩家')
        .setRequired(true)
    ),

  async execute(interaction) {
    const target = interaction.options.getUser('user');

    const member = await interaction.guild.members.fetch(interaction.user.id);

    if (!roleCollectionHas(member, ROLE_SHOP.thief.roleId)) {
      return interaction.reply(privatePayload({
        content: `❌ 你需要擁有 🕵️ **${ROLE_SHOP.thief.roleName}** 才能使用 /偷竊。`
      }));
    }

    if (target.id === interaction.user.id) {
      return interaction.reply(privatePayload({ content: '❌ 你不能偷竊自己。' }));
    }

    if (isProtectedTarget(target)) {
      return interaction.reply(privatePayload({
        content: '你不能偷竊這位玩家，因為他/她是受保護的對象。'
      }));
    }

    await interaction.deferReply();

    const result = await attemptSteal(interaction.user, target);

    if (!result.ok) {
      if (result.code === 'COOLDOWN') {
        return interaction.editReply({
          content: `⏰ 偷竊冷卻中，請在 **${formatDuration(result.cooldownRemaining)}** 後再試一次。`
        });
      }

      if (result.code === 'VICTIM_PROTECTED') {
        return interaction.editReply({
          content: '🛡️ 這位玩家 24 小時內已經被成功偷竊過，暫時受到保護。'
        });
      }

      if (result.code === 'NO_STEALABLE_MONEY') {
        return interaction.editReply({
          content: '❌ 這位玩家目前沒有可偷竊的金幣或待結算 JK餘額。'
        });
      }

      return interaction.editReply({ content: '❌ 偷竊失敗，請稍後再試。' });
    }

    if (!result.success) {
      const embed = new EmbedBuilder()
        .setColor(0xe74c3c)
        .setTitle('🚨 偷竊失敗')
        .setDescription([
          `<@${interaction.user.id}> 嘗試偷竊 <@${target.id}>，但是被發現了。`,
          `扣除罰金：**${formatCoins(result.penalty)}**`,
          `下次偷竊：**24 小時後**`
        ].join('\n'));

      return interaction.editReply({ embeds: [embed] });
    }

    const detailLines = [
      `<@${interaction.user.id}> 成功偷竊了 <@${target.id}>。`,
      `偷到金額：**${formatCoins(result.amount)}**`,
      `本次上限：**${formatCoins(ROLE_SHOP.thief.maxStealCoins)}**`,
      `下次偷竊：**24 小時後**`
    ];

    if (result.pendingPart > 0) {
      detailLines.splice(2, 0, `其中 **${formatCoins(result.pendingPart)}** 來自待結算 JK餘額。`);
    }

    const embed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle('🕵️ 偷竊成功')
      .setDescription(detailLines.join('\n'));

    return interaction.editReply({ embeds: [embed] });
  }
};
