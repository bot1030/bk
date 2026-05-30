const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { rods } = require('../config/rodConfig');
const { getOrCreateUser } = require('../systems/economySystem');
const { buyRod, selectRod, getRodShopText } = require('../systems/rodSystem');

function addRodChoices(option) {
  return option
    .setName('rod')
    .setDescription('選擇釣竿')
    .setRequired(false)
    .addChoices(
      ...Object.values(rods).map(rod => ({ name: rod.label, value: rod.id }))
    );
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rod_shop')
    .setDescription('查看、購買或選擇釣魚竿')
    .addStringOption(option =>
      option
        .setName('action')
        .setDescription('你想要執行的操作')
        .setRequired(true)
        .addChoices(
          { name: '查看商店', value: 'view' },
          { name: '購買釣竿', value: 'buy' },
          { name: '選擇釣竿', value: 'select' }
        )
    )
    .addStringOption(addRodChoices),

  async execute(interaction) {
    const action = interaction.options.getString('action');
    const rodId = interaction.options.getString('rod');
    const user = await getOrCreateUser(interaction.user);

    if (action === 'view') {
      const embed = new EmbedBuilder()
        .setColor(0x1abc9c)
        .setTitle('🎣 釣竿商店')
        .setDescription(getRodShopText(user))
        .setFooter({ text: '購買後會自動裝備該釣竿。' });

      return interaction.reply({ embeds: [embed] });
    }

    if (!rodId) {
      return interaction.reply({ content: '❌ 請選擇一個釣竿。' });
    }

    if (action === 'buy') {
      const result = await buyRod(interaction.user, rodId);
      if (!result.ok) return interaction.reply({ content: `❌ ${result.message}` });

      return interaction.reply({
        content: `✅ 你已購買並裝備 **${result.rod.label}**。`,
      });
    }

    if (action === 'select') {
      const result = await selectRod(interaction.user, rodId);
      if (!result.ok) return interaction.reply({ content: `❌ ${result.message}` });

      return interaction.reply({
        content: `✅ 你已裝備 **${result.rod.label}**。`,
      });
    }
  }
};
