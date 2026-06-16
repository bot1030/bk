const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags
} = require('discord.js');
const prisma = require('../database/prisma');

function privatePayload(payload = {}) {
  return { ...payload, flags: MessageFlags.Ephemeral };
}

function buildStars(rating) {
  const safeRating = Math.max(1, Math.min(5, Number(rating) || 1));
  return '⭐'.repeat(safeRating) + '☆'.repeat(5 - safeRating);
}

async function setCommentChannel(guildId, channelId) {
  return prisma.guildConfig.upsert({
    where: { guildId },
    update: { commentChannelId: channelId },
    create: { guildId, commentChannelId: channelId }
  });
}

async function getCommentChannelId(guildId) {
  const config = await prisma.guildConfig.findUnique({ where: { guildId } });
  return config?.commentChannelId || null;
}

function buildDoneRatingPanel() {
  const embed = new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle('✅ 【出貨完成通知】')
    .setDescription([
      '親愛的買家您好 ❤️',
      '您購買的商品已成功發送完畢！📦✨',
      '👉 已完成贈送 / 已成功入帳',
      '歡迎登入遊戲確認您的物品 👀',
      '',
      '若有任何問題都可以隨時私訊我～',
      '感謝支持 JK遊戲商城，期待下次再為您服務！🛒💙',
      '（方便的話麻煩幫我們JK商城發誠文）',
      '',
      '請點擊下方按鈕留下評價。'
    ].join('\n'));

  const components = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('comment:open')
        .setLabel('留下評價')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('⭐')
    )
  ];

  return { embeds: [embed], components };
}

async function sendDoneRatingPanel(interaction) {
  const commentChannelId = await getCommentChannelId(interaction.guildId);

  if (!commentChannelId) {
    return interaction.reply(privatePayload({ content: '❌ 請先使用 `/setup_comment` 設定評價頻道。' }));
  }

  await interaction.channel.send(buildDoneRatingPanel());
  return interaction.reply(privatePayload({ content: '✅ 已建立評價按鈕。' }));
}

async function handleCommentButton(interaction) {
  if (interaction.customId !== 'comment:open') return null;

  const modal = new ModalBuilder()
    .setCustomId('comment_modal:submit')
    .setTitle('留下評價');

  const ratingInput = new TextInputBuilder()
    .setCustomId('rating')
    .setLabel('請輸入評分 1–5')
    .setPlaceholder('例如：5')
    .setStyle(TextInputStyle.Short)
    .setMinLength(1)
    .setMaxLength(1)
    .setRequired(true);

  const commentInput = new TextInputBuilder()
    .setCustomId('comment')
    .setLabel('留言')
    .setPlaceholder('寫下你的評價')
    .setStyle(TextInputStyle.Paragraph)
    .setMaxLength(1000)
    .setRequired(false);

  modal.addComponents(
    new ActionRowBuilder().addComponents(ratingInput),
    new ActionRowBuilder().addComponents(commentInput)
  );

  return interaction.showModal(modal);
}

async function handleCommentModal(interaction) {
  if (interaction.customId !== 'comment_modal:submit') return null;

  const rawRating = interaction.fields.getTextInputValue('rating').trim();
  const rating = Number(rawRating);

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return interaction.reply(privatePayload({ content: '❌ 評分只能輸入 1 到 5。' }));
  }

  const comment = interaction.fields.getTextInputValue('comment')?.trim() || '未填寫';
  const commentChannelId = await getCommentChannelId(interaction.guildId);

  if (!commentChannelId) {
    return interaction.reply(privatePayload({ content: '❌ 評價頻道尚未設定，請聯絡管理員。' }));
  }

  const channel = await interaction.client.channels.fetch(commentChannelId).catch(() => null);
  if (!channel || !channel.isTextBased()) {
    return interaction.reply(privatePayload({ content: '❌ 找不到評價頻道，請聯絡管理員重新設定。' }));
  }

  const embed = new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle('⭐ 新客戶評價')
    .setDescription([
      `客戶：<@${interaction.user.id}>`,
      `評分：**${buildStars(rating)} ${rating}/5**`,
      '',
      `留言：\n${comment}`
    ].join('\n'))
    .setTimestamp();

  await channel.send({ embeds: [embed] });

  return interaction.reply(privatePayload({ content: '✅ 感謝你的評價。' }));
}

module.exports = {
  setCommentChannel,
  getCommentChannelId,
  buildDoneRatingPanel,
  sendDoneRatingPanel,
  handleCommentButton,
  handleCommentModal,
  buildStars
};
