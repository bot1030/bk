const { MessageFlags } = require('discord.js');
const { handlePanelButton, handlePanelModal, handlePanelSelect } = require('../systems/gamePanelSystem');

module.exports = {
  name: 'interactionCreate',
  async execute(interaction) {
    try {
      if (interaction.isChatInputCommand()) {
        const command = interaction.client.commands.get(interaction.commandName);
        if (!command) return;
        return await command.execute(interaction);
      }

      if (interaction.isButton()) {
        if (interaction.customId.startsWith('setup_panel:')) {
          return await handlePanelButton(interaction);
        }

        if (interaction.customId.startsWith('convert:')) {
          const command = interaction.client.commands.get('兌換');
          if (!command || !command.handleButton) return;
          return await command.handleButton(interaction);
        }

        if (interaction.customId.startsWith('fish:')) {
          const command = interaction.client.commands.get('fish');
          if (!command || !command.handleButton) return;
          return await command.handleButton(interaction);
        }

        if (interaction.customId.startsWith('mines_pick:')) {
          const command = interaction.client.commands.get('mines');
          if (!command || !command.handleButton) return;
          return await command.handleButton(interaction);
        }

        if (interaction.customId.startsWith('mines_action:')) {
          const command = interaction.client.commands.get('mines');
          if (!command || !command.handleActionButton) return;
          return await command.handleActionButton(interaction);
        }
      }

      if (interaction.isStringSelectMenu()) {
        if (interaction.customId.startsWith('setup_panel_select:')) {
          return await handlePanelSelect(interaction);
        }
      }

      if (interaction.isModalSubmit()) {
        if (interaction.customId.startsWith('setup_modal:')) {
          return await handlePanelModal(interaction);
        }
      }
    } catch (error) {
      // 10062 normally means the interaction token already expired or another bot instance answered it.
      // Do not crash the bot for this; just log the concise reason.
      if (error?.code === 10062) {
        console.warn('⚠️ Discord interaction expired or was already handled. Avoid running Railway and local bot at the same time.');
        return;
      }

      console.error(error);

      const payload = {
        content: '❌ 發生錯誤，請稍後再試。',
        flags: MessageFlags.Ephemeral
      };

      if (interaction.replied || interaction.deferred) {
        return interaction.followUp(payload).catch(() => null);
      }

      return interaction.reply(payload).catch(() => null);
    }
  }
};
