const { SlashCommandBuilder, ChannelType, PermissionFlagsBits, EmbedBuilder, MessageFlags } = require('discord.js');
const { setBigWinChannel } = require('../systems/bigWinSystem');
const { formatCoins, formatJK } = require('../utils/format');

function privatePayload(payload = {}) {
  return { ...payload, flags: MessageFlags.Ephemeral };
}


module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup_bigwin')
    .setDescription('管理員專用：設定大獎公告頻道')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption(option =>
      option
        .setName('channel')
        .setDescription('要發送大獎公告的頻道')
        .setRequired(true)
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
    )
    .addIntegerOption(option =>
      option
        .setName('coin_threshold')
        .setDescription('金幣大獎公告門檻，預設 50,000 金幣')
        .setRequired(false)
        .setMinValue(1000)
        .setMaxValue(100000000)
    )
    .addIntegerOption(option =>
      option
        .setName('jk_threshold')
        .setDescription('JK餘額大獎公告門檻，預設 50 JK餘額')
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(1000000)
    ),

  async execute(interaction) {
    const channel = interaction.options.getChannel('channel');
    const coinThreshold = interaction.options.getInteger('coin_threshold') ?? 50000;
    const jkThreshold = interaction.options.getInteger('jk_threshold') ?? 50;

    await setBigWinChannel(interaction.guildId, channel.id, coinThreshold, jkThreshold);

    const embed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle('✅ 大獎公告頻道已設定')
      .setDescription([
        `公告頻道：${channel}`,
        `金幣公告門檻：**${formatCoins(coinThreshold)}**`,
        `JK餘額公告門檻：**${formatJK(jkThreshold)}**`,
        '',
        '之後只有 **大額獲勝** 或 **隱藏鑽石** 會公告在此頻道。',
        '一般小獎不會洗版公告。'
      ].join('\n'));

    return interaction.reply(privatePayload({ embeds: [embed] }));
  }
};
