const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getBalance } = require('../systems/economySystem');
const { getPendingJkSummaryByUserId } = require('../systems/pendingJkSystem');
const { rods } = require('../config/rodConfig');
const { formatCoins, formatJK } = require('../utils/format');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('餘額')
    .setDescription('查看自己或其他玩家的金幣與 JK餘額')
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('要查看餘額的玩家，不填則查看自己')
        .setRequired(false)
    ),

  async execute(interaction) {
    const target = interaction.options.getUser('user') || interaction.user;
    const user = await getBalance(target);
    const pending = await getPendingJkSummaryByUserId(user.id);
    const selectedRod = rods[user.selectedRod] || rods.basic;

    const isSelf = target.id === interaction.user.id;

    const embed = new EmbedBuilder()
      .setColor(0xf1c40f)
      .setTitle(isSelf ? '💰 個人餘額' : '💰 玩家餘額')
      .setDescription([
        `玩家：<@${target.id}>`,
        `金幣：**${formatCoins(user.coins)}**`,
        `正式 JK餘額：**${formatJK(user.jkBalance)}**`,
        `待結算 JK餘額：約 **${formatJK(Math.floor(pending.pendingCoins / 1000))}**`,
        `目前釣竿：**${selectedRod.label}**`
      ].join('\n'))
      .setFooter({ text: '1,000 金幣 = 1 JK餘額｜待結算 JK餘額 24 小時後才轉為正式 JK餘額' });

    await interaction.reply({ embeds: [embed] });
  }
};
