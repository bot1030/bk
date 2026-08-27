const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { sendDoneRatingPanel } = require('../systems/commentSystem');

const ADMIN_USER_IDS = [
  '473647287026057227',
  '786683877107302461',
  '1319968425698922591',
  '1535635248157827102'
];

const DONE_EXTRA_USER_IDS = [
  '1384104547554824213'
];

function privatePayload(payload = {}) {
  return { ...payload, flags: MessageFlags.Ephemeral };
}

function canUseDone(userId) {
  return ADMIN_USER_IDS.includes(userId) || DONE_EXTRA_USER_IDS.includes(userId);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('done')
    .setDescription('建立訂單完成評價按鈕'),

  async execute(interaction) {
    if (!canUseDone(interaction.user.id)) {
      return interaction.reply(privatePayload({ content: '你不能這麼做 作弊鬼' }));
    }

    return sendDoneRatingPanel(interaction);
  },

  canUseDone,
  ADMIN_USER_IDS,
  DONE_EXTRA_USER_IDS
};
