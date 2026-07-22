const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags
} = require('discord.js');
const prisma = require('../database/prisma');
const luckyConfig = require('../config/luckyBlockConfig');
const { formatCoins, formatEventCoins, formatNumber } = require('../utils/format');
const { getOrCreateUser, spendCoins, addCoins } = require('./economySystem');
const { checkGamblingBetAllowed, sendPostGameRiskAlert } = require('./riskSystem');
const { announceBigWin } = require('./bigWinSystem');

const ADMIN_USER_IDS = [
  '473647287026057227',
  '786683877107302461',
  '1319968425698922591'
];

const GAME_LABEL = '幸運方塊';
const REVEAL_DELAY_MS = 650;

function privatePayload(payload = {}) {
  return { ...payload, flags: MessageFlags.Ephemeral };
}

function isAdmin(userId) {
  return ADMIN_USER_IDS.includes(userId);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getBoxConfig(boxCount) {
  return luckyConfig.boxes[String(boxCount)] || luckyConfig.boxes[boxCount];
}

function formatMultiplier(multiplier) {
  return `${Number(multiplier).toFixed(2).replace(/\.00$/, '')}x`;
}

function calculatePayout(bet, boxCount) {
  const cfg = getBoxConfig(boxCount);
  return Math.floor(bet * cfg.multiplier);
}

function randomIndex(max) {
  return Math.floor(Math.random() * max);
}

function formatSpendBreakdown(spent, fallbackAmount) {
  const normal = Number(spent?.spentCoins || 0);
  const event = Number(spent?.spentEventCoins || 0);
  const total = Number(spent?.totalSpent || fallbackAmount || 0);
  if (event <= 0) return formatCoins(total);
  if (normal <= 0) return `${formatCoins(total)}（${formatEventCoins(event)}）`;
  return `${formatCoins(total)}（${formatEventCoins(event)} + 金幣 ${formatNumber(normal)}）`;
}

function buildSetupEmbed() {
  const rows = Object.entries(luckyConfig.boxes)
    .map(([count, cfg]) => {
      const empty = Number(count) - 1;
      return `🎁 **${count} 方塊模式**｜1 個禮物、${empty} 個空箱｜獎勵 **${formatMultiplier(cfg.multiplier)}**｜${cfg.riskLabel}`;
    })
    .join('\n');

  return new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle('🎁✨ 幸運方塊 Lucky Block')
    .setDescription([
      '選擇方塊數量，再投入金幣開局。',
      '每局只有 **1 個 GIFT 方塊**，其他方塊都是空箱。',
      '選中 GIFT 就獲得獎勵，選到空箱就本局失敗。',
      '',
      '📦 **玩法模式**',
      rows,
      '',
      '💠 **規則**',
      `• 最少 ${luckyConfig.minBoxes} 個方塊，最多 ${luckyConfig.maxBoxes} 個方塊`,
      `• 單局投入：${formatCoins(luckyConfig.minBet)}–${formatCoins(luckyConfig.maxBet)}`,
      '• 活動金幣會優先消耗，不足才扣一般金幣',
      '• 獎勵一律發放為一般金幣',
      '• 方塊越多，獎勵倍率越高，但選中 GIFT 的機率越低',
      '',
      '按下下方按鈕開始挑戰。'
    ].join('\n'))
    .setFooter({ text: 'JK遊戲商城｜休閒遊戲中心' });
}

function buildStartButton() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('luckyblock:start')
        .setLabel('開始挑戰')
        .setEmoji('🎁')
        .setStyle(ButtonStyle.Primary)
    )
  ];
}

function buildBoxSelectEmbed() {
  return new EmbedBuilder()
    .setColor(0x9b59b6)
    .setTitle('🎁 選擇幸運方塊模式')
    .setDescription([
      '請先選擇你要開幾個方塊。',
      '',
      Object.entries(luckyConfig.boxes).map(([count, cfg]) => (
        `**${count} 個方塊**｜GIFT 機率 ${cfg.winChanceLabel}｜獎勵 ${formatMultiplier(cfg.multiplier)}`
      )).join('\n')
    ].join('\n'));
}

function buildBoxSelectComponents() {
  const select = new StringSelectMenuBuilder()
    .setCustomId('luckyblock_select:boxes')
    .setPlaceholder('選擇方塊數量')
    .addOptions(Object.entries(luckyConfig.boxes).map(([count, cfg]) => ({
      label: `${count} 個方塊`,
      description: `1 個 GIFT｜獎勵 ${formatMultiplier(cfg.multiplier)}｜${cfg.riskLabel}`,
      value: String(count),
      emoji: count === '3' ? '🎁' : count === '4' ? '💫' : '🌌'
    })));

  return [new ActionRowBuilder().addComponents(select)];
}

function buildSelectedBoxCountEmbed(boxCount) {
  const cfg = getBoxConfig(boxCount);
  return new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle('🎁 模式已選擇')
    .setDescription([
      `方塊數量：**${boxCount} 個**`,
      `GIFT 機率：**${cfg.winChanceLabel}**`,
      `獎勵倍率：**${formatMultiplier(cfg.multiplier)}**`,
      '',
      '點擊下方按鈕輸入本局投入金額。'
    ].join('\n'));
}

function buildOpenBetButton(boxCount) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`luckyblock:bet:${boxCount}`)
        .setLabel('輸入投入金額')
        .setEmoji('💰')
        .setStyle(ButtonStyle.Success)
    )
  ];
}

function buildBetModal(boxCount) {
  const modal = new ModalBuilder()
    .setCustomId(`luckyblock_modal:bet:${boxCount}`)
    .setTitle('幸運方塊｜投入金額');

  const amountInput = new TextInputBuilder()
    .setCustomId('amount')
    .setLabel(`輸入投入金額 ${luckyConfig.minBet}–${luckyConfig.maxBet}`)
    .setPlaceholder('例如：1000')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMinLength(1)
    .setMaxLength(8);

  modal.addComponents(new ActionRowBuilder().addComponents(amountInput));
  return modal;
}

function buildGameButtons(game, selectedIndex = null, disabled = false) {
  const buttons = [];
  for (let i = 0; i < game.boxCount; i += 1) {
    const isSelected = selectedIndex === i;
    const isGift = game.winningIndex === i;

    let emoji = '📦';
    let label = `方塊 ${i + 1}`;
    let style = ButtonStyle.Secondary;

    if (disabled) {
      if (isGift) {
        emoji = '🎁';
        label = 'GIFT';
        style = ButtonStyle.Success;
      } else if (isSelected) {
        emoji = '💨';
        label = '空箱';
        style = ButtonStyle.Danger;
      } else {
        emoji = '⬛';
        label = '空箱';
      }
    }

    buttons.push(
      new ButtonBuilder()
        .setCustomId(`luckyblock:pick:${game.id}:${i}`)
        .setLabel(label)
        .setEmoji(emoji)
        .setStyle(style)
        .setDisabled(disabled)
    );
  }

  return [new ActionRowBuilder().addComponents(buttons)];
}


function buildRevealPendingButtons(game, selectedIndex) {
  const buttons = [];
  for (let i = 0; i < game.boxCount; i += 1) {
    const isSelected = selectedIndex === i;

    buttons.push(
      new ButtonBuilder()
        .setCustomId(`luckyblock:pick:${game.id}:${i}`)
        .setLabel(isSelected ? '開啟中...' : `方塊 ${i + 1}`)
        .setEmoji(isSelected ? '✨' : '📦')
        .setStyle(isSelected ? ButtonStyle.Primary : ButtonStyle.Secondary)
        .setDisabled(true)
    );
  }

  return [new ActionRowBuilder().addComponents(buttons)];
}

function buildActiveGameEmbed(game, spentLabel) {
  const cfg = getBoxConfig(game.boxCount);
  return new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle('🎁 幸運方塊開始閃爍...')
    .setDescription([
      `投入金額：**${spentLabel}**`,
      `方塊數量：**${game.boxCount} 個**`,
      `獎勵倍率：**${formatMultiplier(cfg.multiplier)}**`,
      '',
      '✨ 選一個方塊。',
      '🎁 選中 GIFT 就獲得獎勵。',
      '📦 選到空箱就本局失敗。'
    ].join('\n'));
}

function buildRevealLoadingEmbed(game) {
  return new EmbedBuilder()
    .setColor(0xf39c12)
    .setTitle('✨ 方塊正在打開...')
    .setDescription([
      '光芒正在聚集。',
      '命運方塊即將揭曉...'
    ].join('\n'));
}

function buildResultEmbed({ game, selectedIndex, won, payout, spentLabel }) {
  const cfg = getBoxConfig(game.boxCount);
  return new EmbedBuilder()
    .setColor(won ? 0x2ecc71 : 0xe74c3c)
    .setTitle(won ? '🎁 GIFT！你抽中了幸運方塊！' : '💨 空箱。這次沒有禮物。')
    .setDescription([
      `你的選擇：**方塊 ${selectedIndex + 1}**`,
      `GIFT 位置：**方塊 ${game.winningIndex + 1}**`,
      `投入金額：**${spentLabel}**`,
      `模式：**${game.boxCount} 方塊｜${formatMultiplier(cfg.multiplier)}**`,
      '',
      won
        ? `獲得：**${formatCoins(payout)}**`
        : `本局結果：**沒有獲得獎勵**`
    ].join('\n'))
    .setFooter({ text: '獎勵以一般金幣發放。活動金幣只會作為遊戲投入使用。' });
}

function parseAmount(raw) {
  const normalized = String(raw || '').replace(/,/g, '').trim();
  const amount = Number(normalized);
  if (!Number.isInteger(amount)) return null;
  return amount;
}

async function sendSetupLuckyBlockPanel(interaction) {
  if (!isAdmin(interaction.user.id)) {
    return interaction.reply(privatePayload({ content: '你不能這麼做 作弊鬼' }));
  }

  const channel = interaction.options.getChannel('channel') || interaction.channel;
  if (!channel || !channel.isTextBased()) {
    return interaction.reply(privatePayload({ content: '❌ 請選擇可以發送訊息的頻道。' }));
  }

  await channel.send({ embeds: [buildSetupEmbed()], components: buildStartButton() });
  return interaction.reply(privatePayload({ content: `✅ 已發送幸運方塊面板到 ${channel}。` }));
}

async function handleLuckyBlockButton(interaction) {
  const parts = interaction.customId.split(':');
  const action = parts[1];

  if (action === 'start') {
    // Acknowledge immediately so Discord never shows "The application didn't respond"
    // while the private mode-select UI is being prepared.
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    return interaction.editReply({ embeds: [buildBoxSelectEmbed()], components: buildBoxSelectComponents() });
  }

  if (action === 'bet') {
    const boxCount = Number(parts[2]);
    if (!getBoxConfig(boxCount)) {
      return interaction.reply(privatePayload({ content: '❌ 方塊模式錯誤，請重新開始。' }));
    }
    return interaction.showModal(buildBetModal(boxCount));
  }

  if (action === 'pick') {
    const gameId = parts[2];
    const selectedIndex = Number(parts[3]);
    return handleLuckyBlockPick(interaction, gameId, selectedIndex);
  }

  return null;
}

async function handleLuckyBlockSelect(interaction) {
  if (interaction.customId !== 'luckyblock_select:boxes') return null;

  const boxCount = Number(interaction.values[0]);
  if (!getBoxConfig(boxCount)) {
    return interaction.update({ content: '❌ 方塊模式錯誤，請重新開始。', embeds: [], components: [] });
  }

  return interaction.update({
    embeds: [buildSelectedBoxCountEmbed(boxCount)],
    components: buildOpenBetButton(boxCount)
  });
}

async function handleLuckyBlockModal(interaction) {
  if (!interaction.customId.startsWith('luckyblock_modal:bet:')) return null;

  // Modal submits can timeout if database calls take too long.
  // Acknowledge immediately, then edit the private reply after checks finish.
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const boxCount = Number(interaction.customId.split(':')[2]);
  const amount = parseAmount(interaction.fields.getTextInputValue('amount'));

  if (!getBoxConfig(boxCount)) {
    return interaction.editReply({ content: '❌ 方塊模式錯誤，請重新開始。', embeds: [], components: [] });
  }

  if (!amount || amount < luckyConfig.minBet || amount > luckyConfig.maxBet) {
    return interaction.editReply({ content: `❌ 投入金額必須是 ${formatCoins(luckyConfig.minBet)}–${formatCoins(luckyConfig.maxBet)}。`, embeds: [], components: [] });
  }

  const risk = await checkGamblingBetAllowed(interaction.user, amount);
  if (!risk.ok) {
    return interaction.editReply({ content: risk.message, embeds: [], components: [] });
  }

  const spent = await spendCoins(interaction.user, amount, 'LUCKY_BLOCK', '幸運方塊投入');
  if (!spent.ok) {
    return interaction.editReply({ content: '❌ 你的金幣不足。', embeds: [], components: [] });
  }

  const user = await getOrCreateUser(interaction.user);
  const winningIndex = randomIndex(boxCount);

  const game = await prisma.luckyBlockGame.create({
    data: {
      userId: user.id,
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      bet: amount,
      normalCoinStake: Number(spent.spentCoins || 0),
      eventCoinStake: Number(spent.spentEventCoins || 0),
      boxCount,
      winningIndex,
      status: 'ACTIVE'
    }
  });

  await prisma.user.update({
    where: { discordId: interaction.user.id },
    data: { luckyBlockPlayed: { increment: 1 } }
  }).catch(() => null);

  const spentLabel = formatSpendBreakdown(spent, amount);
  return interaction.editReply({
    content: null,
    embeds: [buildActiveGameEmbed(game, spentLabel)],
    components: buildGameButtons(game)
  });
}

async function handleLuckyBlockPick(interaction, gameId, selectedIndex) {
  // Acknowledge immediately so Discord does not show "Something went wrong"
  // while Prisma updates the round result.
  await interaction.deferUpdate();

  const game = await prisma.luckyBlockGame.findUnique({
    where: { id: gameId },
    include: { user: true }
  });

  if (!game || game.status !== 'ACTIVE') {
    return interaction.editReply({ content: '此局遊戲已結束。', embeds: [], components: [] });
  }

  if (game.user.discordId !== interaction.user.id) {
    return interaction.editReply({ content: '這不是你的幸運方塊。', embeds: [], components: [] });
  }

  if (!Number.isInteger(selectedIndex) || selectedIndex < 0 || selectedIndex >= game.boxCount) {
    return interaction.editReply({ content: '❌ 方塊選擇錯誤。', embeds: [], components: [] });
  }

  const won = selectedIndex === game.winningIndex;
  const payout = won ? calculatePayout(game.bet, game.boxCount) : 0;

  const locked = await prisma.luckyBlockGame.updateMany({
    where: { id: game.id, status: 'ACTIVE' },
    data: {
      status: won ? 'WON' : 'LOST',
      selectedIndex,
      payout
    }
  });

  if (locked.count === 0) {
    return interaction.editReply({ content: '此局遊戲已結束。', embeds: [], components: [] });
  }

  await interaction.editReply({ content: null, embeds: [buildRevealLoadingEmbed(game)], components: buildRevealPendingButtons(game, selectedIndex) });
  await sleep(REVEAL_DELAY_MS);

  if (won && payout > 0) {
    await addCoins(interaction.user, payout, 'LUCKY_BLOCK', `幸運方塊勝利｜${game.boxCount} 方塊｜倍率 ${formatMultiplier(getBoxConfig(game.boxCount).multiplier)}`);
  }

  const spentLabel = formatSpendBreakdown({
    spentCoins: game.normalCoinStake,
    spentEventCoins: game.eventCoinStake,
    totalSpent: game.bet
  }, game.bet);

  await sendPostGameRiskAlert(interaction.client, interaction.user, GAME_LABEL, [
    `本局投入：**${spentLabel}**`,
    `方塊數量：**${game.boxCount}**`,
    `本局結果：**${won ? '抽中 GIFT' : '空箱'}**`,
    `本局獲得：**${formatCoins(payout)}**`
  ]);

  if (won && payout > 0) {
    await announceBigWin(interaction.client, interaction.guildId, {
      user: interaction.user,
      gameName: GAME_LABEL,
      coins: payout,
      detailLines: [
        `投入金額：**${spentLabel}**`,
        `方塊模式：**${game.boxCount} 方塊**`,
        `選擇方塊：**${selectedIndex + 1}**`,
        `獎勵倍率：**${formatMultiplier(getBoxConfig(game.boxCount).multiplier)}**`
      ]
    });
  }

  return interaction.editReply({
    content: null,
    embeds: [buildResultEmbed({ game, selectedIndex, won, payout, spentLabel })],
    components: buildGameButtons(game, selectedIndex, true)
  });
}

module.exports = {
  ADMIN_USER_IDS,
  GAME_LABEL,
  isAdmin,
  buildSetupEmbed,
  sendSetupLuckyBlockPanel,
  handleLuckyBlockButton,
  handleLuckyBlockSelect,
  handleLuckyBlockModal,
  calculatePayout
};
