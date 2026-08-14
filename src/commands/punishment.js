const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const prisma = require('../database/prisma');
const {
  ACTION_CHOICES,
  isAdmin,
  privatePayload,
  parseTargetId,
  parseDuration,
  formatDateTime,
  getActionLabel,
  buildPunishmentEmbed
} = require('../systems/punishmentSystem');

function formatRecordLine(record) {
  return [
    `**${getActionLabel(record.action)}**｜<@${record.targetDiscordId}>`,
    `原因：${record.reason || '未提供原因'}`,
    `解除：${formatDateTime(record.expiresAt)}`,
    `ID：\`${record.id}\``
  ].join('\n');
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('punishment')
    .setDescription('管理玩家功能限制')
    .addSubcommand(subcommand =>
      subcommand
        .setName('add')
        .setDescription('限制玩家使用指定功能')
        .addStringOption(option =>
          option
            .setName('target_id')
            .setDescription('玩家 Discord ID，或直接貼上 @玩家')
            .setRequired(true)
        )
        .addStringOption(option =>
          option
            .setName('action')
            .setDescription('要限制的功能')
            .setRequired(true)
            .addChoices(...ACTION_CHOICES)
        )
        .addStringOption(option =>
          option
            .setName('duration')
            .setDescription('限制時間，例如 30m、12h、3d、1w、permanent')
            .setRequired(true)
        )
        .addStringOption(option =>
          option
            .setName('reason')
            .setDescription('玩家嘗試使用時會看到的原因')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('remove')
        .setDescription('解除玩家功能限制')
        .addStringOption(option =>
          option
            .setName('target_id')
            .setDescription('玩家 Discord ID，或直接貼上 @玩家')
            .setRequired(true)
        )
        .addStringOption(option =>
          option
            .setName('action')
            .setDescription('只解除指定功能；不選則解除該玩家全部限制')
            .setRequired(false)
            .addChoices(...ACTION_CHOICES)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('查看目前有效的功能限制')
        .addStringOption(option =>
          option
            .setName('target_id')
            .setDescription('可選：只查看指定玩家')
            .setRequired(false)
        )
    ),

  async execute(interaction) {
    if (!isAdmin(interaction.user.id)) {
      return interaction.reply(privatePayload({ content: '你不能這麼做 作弊鬼' }));
    }

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'add') {
      const targetId = parseTargetId(interaction.options.getString('target_id'));
      const action = interaction.options.getString('action');
      const durationRaw = interaction.options.getString('duration');
      const reason = interaction.options.getString('reason').trim();

      if (!targetId) {
        return interaction.reply(privatePayload({ content: '❌ 玩家 ID 格式錯誤。請輸入 Discord ID 或 @玩家。' }));
      }

      if (!reason || reason.length > 500) {
        return interaction.reply(privatePayload({ content: '❌ 原因不可空白，且最多 500 字。' }));
      }

      const duration = parseDuration(durationRaw);
      if (duration.error) {
        return interaction.reply(privatePayload({ content: `❌ ${duration.error}` }));
      }

      const member = await interaction.guild?.members.fetch(targetId).catch(() => null);
      const record = await prisma.punishment.create({
        data: {
          guildId: interaction.guildId,
          targetDiscordId: targetId,
          targetUsername: member?.user?.username || null,
          action,
          reason,
          createdByDiscordId: interaction.user.id,
          expiresAt: duration.expiresAt
        }
      });

      return interaction.reply(privatePayload({
        embeds: [buildPunishmentEmbed(record)]
      }));
    }

    if (subcommand === 'remove') {
      const targetId = parseTargetId(interaction.options.getString('target_id'));
      const action = interaction.options.getString('action');

      if (!targetId) {
        return interaction.reply(privatePayload({ content: '❌ 玩家 ID 格式錯誤。請輸入 Discord ID 或 @玩家。' }));
      }

      const where = {
        guildId: interaction.guildId,
        targetDiscordId: targetId,
        active: true
      };
      if (action) where.action = action;

      const result = await prisma.punishment.updateMany({
        where,
        data: {
          active: false,
          removedAt: new Date(),
          removedByDiscordId: interaction.user.id
        }
      });

      return interaction.reply(privatePayload({
        content: `✅ 已解除 **${result.count}** 筆限制。`
      }));
    }

    if (subcommand === 'list') {
      const rawTarget = interaction.options.getString('target_id');
      const targetId = rawTarget ? parseTargetId(rawTarget) : null;
      if (rawTarget && !targetId) {
        return interaction.reply(privatePayload({ content: '❌ 玩家 ID 格式錯誤。請輸入 Discord ID 或 @玩家。' }));
      }

      await prisma.punishment.updateMany({
        where: {
          active: true,
          expiresAt: { not: null, lte: new Date() }
        },
        data: { active: false }
      }).catch(() => null);

      const records = await prisma.punishment.findMany({
        where: {
          guildId: interaction.guildId,
          active: true,
          ...(targetId ? { targetDiscordId: targetId } : {}),
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: new Date() } }
          ]
        },
        orderBy: { createdAt: 'desc' },
        take: 15
      });

      if (!records.length) {
        return interaction.reply(privatePayload({ content: '目前沒有有效的功能限制。' }));
      }

      const embed = new EmbedBuilder()
        .setColor(0xf39c12)
        .setTitle('⛔ 功能限制清單')
        .setDescription(records.map(formatRecordLine).join('\n\n'))
        .setFooter({ text: '最多顯示最近 15 筆有效限制。' })
        .setTimestamp();

      return interaction.reply(privatePayload({ embeds: [embed] }));
    }

    return interaction.reply(privatePayload({ content: '❌ 未知操作。' }));
  }
};
