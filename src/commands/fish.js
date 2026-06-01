const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags
} = require('discord.js');
const fishingConfig = require('../config/fishingConfig');
const { getOrCreateUser, addCoins, addJK } = require('../systems/economySystem');
const { rollFishingResult, getRodEffectLabel } = require('../systems/fishingSystem');
const { formatCoins, formatJK, formatDuration } = require('../utils/format');
const { getRemainingCooldown } = require('../utils/cooldown');
const prisma = require('../database/prisma');
const { sendSpecialRewardAlert } = require('../systems/riskSystem');
const { announceBigWin } = require('../systems/bigWinSystem');

function privatePayload(payload = {}) {
  return { ...payload, flags: MessageFlags.Ephemeral };
}

function buildConfirmButtons(userId) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`fish:start:${userId}`)
        .setLabel('開始釣魚')
        .setStyle(ButtonStyle.Success)
        .setEmoji('🎣'),
      new ButtonBuilder()
        .setCustomId(`fish:cancel:${userId}`)
        .setLabel('取消')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('❌')
    )
  ];
}

function getFishCooldownRemaining(user) {
  return getRemainingCooldown(user.lastFish, fishingConfig.cooldownMs);
}

async function executeFishing(interaction) {
  const userBefore = await getOrCreateUser(interaction.user);
  const remaining = getFishCooldownRemaining(userBefore);

  if (remaining > 0) {
    const embed = new EmbedBuilder()
      .setColor(0xe67e22)
      .setTitle('⏰ 釣魚冷卻中')
      .setDescription([
        '你剛剛已經釣過魚了。',
        `請在 **${formatDuration(remaining)}** 後再來釣魚。`,
        '',
        '每次釣魚是免費的，但冷卻時間為 **1 小時 30 分鐘**。'
      ].join('\n'));

    return interaction.editReply({ embeds: [embed], components: [], content: null });
  }

  const result = rollFishingResult(userBefore);

  await prisma.user.update({
    where: { discordId: interaction.user.id },
    data: {
      fishingCount: { increment: 1 },
      lastFish: new Date()
    }
  });

  if (result.type === 'hidden_diamond') {
    await addJK(interaction.user, result.jk, 'FISHING', '釣到隱藏鑽石');

    await sendSpecialRewardAlert(interaction.client, interaction.user, '特殊獎勵警報：隱藏鑽石', [
      `獎勵：**${formatJK(result.jk)}**`,
      '來源：釣魚系統'
    ]);

    await announceBigWin(interaction.client, interaction.guildId, {
      user: interaction.user,
      gameName: '釣魚系統',
      jk: result.jk,
      isHiddenDiamond: true,
      detailLines: [
        '玩家釣到了 **隱藏鑽石**！',
        '本次釣魚成本：**免費**'
      ]
    });

    const embed = new EmbedBuilder()
      .setColor(0x9b59b6)
      .setTitle('💎 隱藏鑽石！')
      .setDescription([
        '你發現了極其稀有的 **隱藏鑽石**！',
        `你獲得了 **${formatJK(result.jk)}**。`,
        '',
        '本次釣魚成本：**免費**',
        '下一次釣魚冷卻：**1 小時 30 分鐘**'
      ].join('\n'));

    return interaction.editReply({ embeds: [embed], components: [], content: null });
  }

  const treasureCoins = result.treasure ? result.treasure.coins : 0;
  const totalCoins = result.coins + treasureCoins;

  if (totalCoins > 0) {
    await addCoins(interaction.user, totalCoins, 'FISHING', `釣魚自動出售：${result.label}`);

    await announceBigWin(interaction.client, interaction.guildId, {
      user: interaction.user,
      gameName: '釣魚系統',
      coins: totalCoins,
      detailLines: [
        `魚類：**${result.label}**`,
        `使用釣竿：**${result.rod.label}**`,
        result.treasure ? `寶箱額外獎勵：**${formatCoins(treasureCoins)}**` : null
      ].filter(Boolean)
    });
  }

  const lines = [
    `你釣到了：**${result.label}**`,
    `使用釣竿：**${result.rod.label}**`,
    `釣竿效果：**${getRodEffectLabel ? getRodEffectLabel(result.rod) : '提高高級魚類機率'}**`,
    `自動出售價格：**${formatCoins(result.coins)}**`,
    '成本：**免費**',
    `本次獲得：**${formatCoins(totalCoins)}**`,
    '',
    '下一次釣魚冷卻：**1 小時 30 分鐘**'
  ];

  if (result.treasure) {
    lines.push('', `🎁 你發現了一個寶箱，額外獲得 **${formatCoins(treasureCoins)}**！`);
  }

  const embed = new EmbedBuilder()
    .setColor(0x1abc9c)
    .setTitle('🎣 釣魚結果')
    .setDescription(lines.join('\n'));

  return interaction.editReply({ embeds: [embed], components: [], content: null });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('fish')
    .setDescription('免費釣魚並獲得隨機獎勵，冷卻時間為 1 小時 30 分鐘'),

  async execute(interaction) {
    const user = await getOrCreateUser(interaction.user);
    const remaining = getFishCooldownRemaining(user);

    if (remaining > 0) {
      const embed = new EmbedBuilder()
        .setColor(0xe67e22)
        .setTitle('⏰ 釣魚冷卻中')
        .setDescription(`請在 **${formatDuration(remaining)}** 後再來釣魚。`);

      return interaction.reply(privatePayload({ embeds: [embed] }));
    }

    const embed = new EmbedBuilder()
      .setColor(0x3498db)
      .setTitle('🎣 釣魚確認')
      .setDescription([
        '本次釣魚成本：**免費**',
        '冷卻時間：**1 小時 30 分鐘**',
        '魚類會自動出售成金幣。',
        '',
        '你確定要開始釣魚嗎？'
      ].join('\n'));

    return interaction.reply(privatePayload({
      embeds: [embed],
      components: buildConfirmButtons(interaction.user.id)
    }));
  },

  async handleButton(interaction) {
    const [, action, userId] = interaction.customId.split(':');

    if (interaction.user.id !== userId) {
      return interaction.reply(privatePayload({ content: '❌ 這不是你的釣魚按鈕。' }));
    }

    if (action === 'cancel') {
      return interaction.update({
        content: '已取消釣魚。',
        embeds: [],
        components: []
      });
    }

    if (action === 'start') {
      await interaction.deferUpdate();
      return executeFishing(interaction);
    }
  },

  executeFishing
};
