const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags
} = require('discord.js');
const fishingConfig = require('../config/fishingConfig');
const { getOrCreateUser, spendCoins, addCoins, addJK } = require('../systems/economySystem');
const { rollFishingResult, getRodEffectLabel } = require('../systems/fishingSystem');
const { formatCoins, formatJK } = require('../utils/format');
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
    )
  ];
}

async function executeFishing(interaction) {
  const spent = await spendCoins(interaction.user, fishingConfig.cost, 'FISHING', '釣魚成本');
  if (!spent.ok) {
    return interaction.editReply({
      content: '❌ 你的金幣不足，無法釣魚。',
      embeds: [],
      components: []
    });
  }

  const user = await getOrCreateUser(interaction.user);
  const result = rollFishingResult(user);

  await prisma.user.update({
    where: { discordId: interaction.user.id },
    data: { fishingCount: { increment: 1 } }
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
        `本次釣魚成本：**${formatCoins(fishingConfig.cost)}**`
      ]
    });

    const embed = new EmbedBuilder()
      .setColor(0x9b59b6)
      .setTitle('💎 隱藏鑽石！')
      .setDescription([
        '你發現了極其稀有的 **隱藏鑽石**！',
        `你獲得了 **${formatJK(result.jk)}**。`,
        '',
        `本次釣魚成本：${formatCoins(fishingConfig.cost)}`
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
    `釣竿效果：**${getRodEffectLabel(result.rod)}**`,
    `自動出售價格：**${formatCoins(result.coins)}**`,
    `成本：**${formatCoins(fishingConfig.cost)}**`,
    `淨收益：**${formatCoins(totalCoins - fishingConfig.cost)}**`
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
    .setDescription('花費 20 金幣釣魚並獲得隨機獎勵'),

  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setColor(0x3498db)
      .setTitle('🎣 釣魚確認')
      .setDescription(`每次釣魚需要花費 **${formatCoins(fishingConfig.cost)}**。\n魚類會自動出售成金幣。\n你確定要開始釣魚嗎？`);

    await interaction.reply(privatePayload({
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
  }
};
