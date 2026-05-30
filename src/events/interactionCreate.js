const { handlePanelButton, handlePanelModal } = require('../systems/gamePanelSystem');

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
      }

      if (interaction.isModalSubmit()) {
        if (interaction.customId.startsWith('setup_modal:')) {
          return handlePanelModal(interaction);
        }
      }
    } catch (error) {
      console.error(error);

      const payload = {
        content: '❌ 發生錯誤，請稍後再試。'
      };

      if (interaction.replied || interaction.deferred) {
        return interaction.followUp(payload).catch(() => null);
      }

      return interaction.reply(payload).catch(() => null);
    }
  }
};
