const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getBalance } = require('../systems/economySystem');
const { getPendingJkSummaryByUserId } = require('../systems/pendingJkSystem');
const { rods } = require('../config/rodConfig');
const { formatCoins, formatCoinsWithEvent, formatJK } = require('../utils/format');

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
    const playableCoins = Number(user.coins || 0) + Number(user.eventCoins || 0);

    const embed = new EmbedBuilder()
      .setColor(0xf1c40f)
      .setTitle(isSelf ? '💰 個人餘額' : '💰 玩家餘額')
      .setDescription([
        `玩家：<@${target.id}>`,
        `金幣：**${formatCoinsWithEvent(user.coins, user.eventCoins)}**`,
        `可用遊戲金幣：**${formatCoins(playableCoins)}**`,
        `正式 JK餘額：**${formatJK(user.jkBalance)}**`,
        `待結算 JK餘額：約 **${formatJK(Math.floor(pending.pendingCoins / 1000))}**`,
        `目前釣竿：**${selectedRod.label}**`
      ].join('\n'))
      .setFooter({ text: '活動金幣不能兌換成 JK餘額，遊玩時會優先使用。' });

    await interaction.reply({ embeds: [embed] });
  }
};
