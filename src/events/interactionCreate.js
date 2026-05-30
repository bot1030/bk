const { MessageFlags } = require('discord.js');
const { handlePanelButton, handlePanelModal, handlePanelSelect } = require('../systems/gamePanelSystem');

module.exports = {
  name: 'interactionCreate',
  async execute(interaction) {
    try {
      if (interaction.isChatInputCommand()) {
        const command = interaction.client.commands.get(interaction.commandName);
        if (!command) return;
        return command.execute(interaction);
      }

      if (interaction.isButton()) {
        if (interaction.customId.startsWith('setup_panel:')) {
          return handlePanelButton(interaction);
        }

        if (interaction.customId.startsWith('convert:')) {
          const command = interaction.client.commands.get('兌換');
          if (!command || !command.handleButton) return;
          return command.handleButton(interaction);
        }

        if (interaction.customId.startsWith('fish:')) {
          const command = interaction.client.commands.get('fish');
          if (!command || !command.handleButton) return;
          return command.handleButton(interaction);
        }

        if (interaction.customId.startsWith('mines_pick:')) {
          const command = interaction.client.commands.get('mines');
          if (!command || !command.handleButton) return;
          return command.handleButton(interaction);
        }

        if (interaction.customId.startsWith('mines_action:')) {
          const command = interaction.client.commands.get('mines');
          if (!command || !command.handleActionButton) return;
          return command.handleActionButton(interaction);
        }
      }

      if (interaction.isStringSelectMenu()) {
        if (interaction.customId.startsWith('setup_select:')) {
          return handlePanelSelect(interaction);
        }

        if (interaction.customId.startsWith('mines_select:')) {
          const command = interaction.client.commands.get('mines');
          if (!command || !command.handleSelect) return;
          return command.handleSelect(interaction);
        }
      }

      if (interaction.isModalSubmit()) {
        if (interaction.customId.startsWith('setup_modal:')) {
          return handlePanelModal(interaction);
        }
      }
    } catch (error) {
      // Do not crash the bot on expired/stale Discord interactions.
      if (error?.code === 10062 || error?.code === 'InteractionNotReplied') {
        console.warn('Ignored stale interaction:', error.message || error);
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
