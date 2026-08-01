const { SlashCommandBuilder } = require('discord.js');
const { isAdmin, privatePayload, buildShownoteEmbed } = require('../systems/orderNoteSystem');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('shownote')
    .setDescription('管理員專用：查看訂單紀錄與分帳統計')
    .addStringOption(option =>
      option
        .setName('period')
        .setDescription('選擇統計範圍')
        .setRequired(false)
        .addChoices(
          { name: '今天', value: 'today' },
          { name: '本週', value: 'week' },
          { name: '本月', value: 'month' },
          { name: '全部時間', value: 'all' },
          { name: '自訂日期', value: 'custom' }
        )
    )
    .addStringOption(option =>
      option
        .setName('type')
        .setDescription('篩選訂單類型')
        .setRequired(false)
        .addChoices(
          { name: '全部', value: 'all' },
          { name: '代儲', value: 'TOPUP' },
          { name: '贈禮', value: 'GIFT' }
        )
    )
    .addStringOption(option =>
      option
        .setName('start')
        .setDescription('自訂開始日期 YYYY-MM-DD')
        .setRequired(false)
    )
    .addStringOption(option =>
      option
        .setName('end')
        .setDescription('自訂結束日期 YYYY-MM-DD')
        .setRequired(false)
    ),

  async execute(interaction) {
    if (!isAdmin(interaction.user.id)) {
      return interaction.reply(privatePayload({ content: '你不能這麼做 作弊鬼' }));
    }

    await interaction.deferReply();

    const response = await buildShownoteEmbed({
      period: interaction.options.getString('period') || 'all',
      type: interaction.options.getString('type') || 'all',
      start: interaction.options.getString('start'),
      end: interaction.options.getString('end')
    });

    if (response.error) {
      return interaction.editReply({ content: `❌ ${response.error}` });
    }

    return interaction.editReply(response);
  }
};
