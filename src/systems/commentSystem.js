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

const AUTO_COMMENT_DELAY_MS = 2 * 24 * 60 * 60 * 1000;
const AUTO_COMMENT_SCAN_LIMIT = 20;

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

function buildDoneRatingPanel(requestId, disabled = false) {
  const embed = new EmbedBuilder()
    .setColor(disabled ? 0x95a5a6 : 0xf1c40f)
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
      disabled ? '此評價已完成。' : '請點擊下方按鈕留下評價。'
    ].join('\n'));

  const components = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`comment:open:${requestId}`)
        .setLabel(disabled ? '評價已完成' : '留下評價')
        .setStyle(disabled ? ButtonStyle.Secondary : ButtonStyle.Primary)
        .setEmoji('⭐')
        .setDisabled(disabled)
    )
  ];

  return { embeds: [embed], components };
}

function buildReviewEmbed({ userId, rating, comment, auto = false }) {
  return new EmbedBuilder()
    .setColor(auto ? 0x95a5a6 : 0xf1c40f)
    .setTitle(auto ? '⭐ 自動客戶評價' : '⭐ 新客戶評價')
    .setDescription([
      `客戶：${userId ? `<@${userId}>` : '未提交'}`,
      `評分：**${buildStars(rating)} ${rating}/5**`,
      '',
      `留言：\n${comment}`
    ].join('\n'))
    .setTimestamp();
}

async function disableOriginalRatingButton(client, request) {
  if (!request?.sourceChannelId || !request?.sourceMessageId) return;

  const channel = await client.channels.fetch(request.sourceChannelId).catch(() => null);
  if (!channel || !channel.isTextBased()) return;

  const message = await channel.messages.fetch(request.sourceMessageId).catch(() => null);
  if (!message) return;

  await message.edit(buildDoneRatingPanel(request.id, true)).catch(() => null);
}

async function sendDoneRatingPanel(interaction) {
  const commentChannelId = await getCommentChannelId(interaction.guildId);

  if (!commentChannelId) {
    return interaction.reply(privatePayload({ content: '❌ 請先使用 `/setup_comment` 設定評價頻道。' }));
  }

  const request = await prisma.doneRatingRequest.create({
    data: {
      guildId: interaction.guildId,
      sourceChannelId: interaction.channelId,
      commentChannelId,
      createdByDiscordId: interaction.user.id,
      expiresAt: new Date(Date.now() + AUTO_COMMENT_DELAY_MS)
    }
  });

  const message = await interaction.channel.send(buildDoneRatingPanel(request.id, false));

  await prisma.doneRatingRequest.update({
    where: { id: request.id },
    data: { sourceMessageId: message.id }
  });

  return interaction.reply(privatePayload({ content: '✅ 已建立評價按鈕。' }));
}

async function handleCommentButton(interaction) {
  if (!interaction.customId.startsWith('comment:open:')) return null;

  const requestId = interaction.customId.split(':')[2];
  const request = await prisma.doneRatingRequest.findUnique({ where: { id: requestId } });

  if (!request || request.status !== 'PENDING') {
    return interaction.reply(privatePayload({ content: '此評價已完成或已過期。' }));
  }

  const modal = new ModalBuilder()
    .setCustomId(`comment_modal:submit:${requestId}`)
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
  if (!interaction.customId.startsWith('comment_modal:submit:')) return null;

  const requestId = interaction.customId.split(':')[2];
  const rawRating = interaction.fields.getTextInputValue('rating').trim();
  const rating = Number(rawRating);

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return interaction.reply(privatePayload({ content: '❌ 評分只能輸入 1 到 5。' }));
  }

  const comment = interaction.fields.getTextInputValue('comment')?.trim() || '未填寫';
  const request = await prisma.doneRatingRequest.findUnique({ where: { id: requestId } });

  if (!request || request.status !== 'PENDING') {
    return interaction.reply(privatePayload({ content: '此評價已完成或已過期。' }));
  }

  const channel = await interaction.client.channels.fetch(request.commentChannelId).catch(() => null);
  if (!channel || !channel.isTextBased()) {
    return interaction.reply(privatePayload({ content: '❌ 找不到評價頻道，請聯絡管理員重新設定。' }));
  }

  const updated = await prisma.doneRatingRequest.updateMany({
    where: { id: requestId, status: 'PENDING' },
    data: {
      status: 'COMPLETED',
      reviewerDiscordId: interaction.user.id,
      rating,
      comment,
      completedAt: new Date()
    }
  });

  if (updated.count === 0) {
    return interaction.reply(privatePayload({ content: '此評價已完成或已過期。' }));
  }

  await channel.send({ embeds: [buildReviewEmbed({ userId: interaction.user.id, rating, comment })] });
  await disableOriginalRatingButton(interaction.client, request);

  return interaction.reply(privatePayload({ content: '✅ 感謝你的評價。' }));
}

async function processExpiredDoneRatingRequests(client) {
  const expired = await prisma.doneRatingRequest.findMany({
    where: {
      status: 'PENDING',
      expiresAt: { lte: new Date() }
    },
    orderBy: { expiresAt: 'asc' },
    take: AUTO_COMMENT_SCAN_LIMIT
  });

  for (const request of expired) {
    const updated = await prisma.doneRatingRequest.updateMany({
      where: { id: request.id, status: 'PENDING' },
      data: {
        status: 'AUTO_COMPLETED',
        rating: 5,
        comment: '超時自動評價',
        completedAt: new Date()
      }
    });

    if (updated.count === 0) continue;

    const channel = await client.channels.fetch(request.commentChannelId).catch(() => null);
    if (channel && channel.isTextBased()) {
      await channel.send({
        embeds: [buildReviewEmbed({ userId: null, rating: 5, comment: '超時自動評價', auto: true })]
      }).catch(() => null);
    }

    await disableOriginalRatingButton(client, request);
  }

  return expired.length;
}

function startDoneAutoCommentJob(client) {
  const run = () => {
    processExpiredDoneRatingRequests(client)
      .catch(error => console.error('[doneAutoComment] Failed:', error));
  };

  run();
  return setInterval(run, 60 * 60 * 1000);
}

module.exports = {
  AUTO_COMMENT_DELAY_MS,
  setCommentChannel,
  getCommentChannelId,
  buildDoneRatingPanel,
  sendDoneRatingPanel,
  handleCommentButton,
  handleCommentModal,
  processExpiredDoneRatingRequests,
  startDoneAutoCommentJob,
  buildStars
};
