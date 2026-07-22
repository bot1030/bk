const { MessageFlags } = require('discord.js');
const { handlePanelButton, handlePanelModal, handlePanelSelect } = require('../systems/gamePanelSystem');
const { handleRoleShopSelect } = require('../systems/roleShopPanelSystem');
const { handleCommentButton, handleCommentModal } = require('../systems/commentSystem');
const { handleRedPacketButton } = require('../systems/redPacketSystem');
const { handleLuckyBlockButton, handleLuckyBlockSelect, handleLuckyBlockModal } = require('../systems/luckyBlockSystem');

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

        if (interaction.customId.startsWith('convert_btn:')) {
          const command = interaction.client.commands.get('兌換');
          if (!command || !command.handleButton) return;
          return await command.handleButton(interaction);
        }

        // Backward compatibility for older convert buttons already posted before the dropdown update.
        if (interaction.customId.startsWith('convert:')) {
          const command = interaction.client.commands.get('兌換');
          if (!command || !command.execute) return;
          return await command.execute(interaction);
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

        if (interaction.customId.startsWith('history:')) {
          const command = interaction.client.commands.get('history');
          if (!command || !command.handleButton) return;
          return await command.handleButton(interaction);
        }

        if (interaction.customId.startsWith('comment:')) {
          return await handleCommentButton(interaction);
        }

        if (interaction.customId.startsWith('red_packet:')) {
          return await handleRedPacketButton(interaction);
        }

        if (interaction.customId.startsWith('luckyblock:')) {
          return await handleLuckyBlockButton(interaction);
        }
      }

      if (interaction.isStringSelectMenu()) {
        if (interaction.customId.startsWith('setup_panel_select:')) {
          return await handlePanelSelect(interaction);
        }

        if (interaction.customId.startsWith('role_shop_select:')) {
          return await handleRoleShopSelect(interaction);
        }

        if (interaction.customId.startsWith('convert_select:')) {
          const command = interaction.client.commands.get('兌換');
          if (!command || !command.handleSelect) return;
          return await command.handleSelect(interaction);
        }

        if (interaction.customId.startsWith('luckyblock_select:')) {
          return await handleLuckyBlockSelect(interaction);
        }
      }

      if (interaction.isModalSubmit()) {
        if (interaction.customId.startsWith('setup_modal:')) {
          return await handlePanelModal(interaction);
        }

        if (interaction.customId.startsWith('comment_modal:')) {
          return await handleCommentModal(interaction);
        }

        if (interaction.customId.startsWith('convert_modal:')) {
          const command = interaction.client.commands.get('兌換');
          if (!command || !command.handleModal) return;
          return await command.handleModal(interaction);
        }

        if (interaction.customId.startsWith('luckyblock_modal:')) {
          return await handleLuckyBlockModal(interaction);
        }
      }
    } catch (error) {
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
