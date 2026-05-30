const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');
const prisma = require('../database/prisma');
const fishingConfig = require('../config/fishingConfig');
const gamblingConfig = require('../config/gamblingConfig');
const { rods } = require('../config/rodConfig');
const { getFishingRewardListText, rollFishingResult } = require('./fishingSystem');
const { getOrCreateUser, spendCoins, addCoins, addJK } = require('./economySystem');
const { rollCoinflipWithChoice, rollSlots, calculatePayout, faceLabel } = require('./gamblingSystem');
const { checkGamblingBetAllowed, sendPostGameRiskAlert, sendSpecialRewardAlert } = require('./riskSystem');
const { validateBet } = require('../utils/guards');
const { formatCoins, formatJK } = require('../utils/format');
const {
  createBoard,
  buildMinesRows,
  calculateMinesPayout,
  getMultiplier,
  findActiveGame
} = require('./minesSystem');

function parsePositiveInteger(raw) {
  const cleaned = String(raw || '').replace(/[,，\s]/g, '');
  if (!/^\d+$/.test(cleaned)) return null;
  const value = Number(cleaned);
  if (!Number.isSafeInteger(value) || value <= 0) return null;
  return value;
}

function buildFishConfirmButtons(userId) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`fish:start:${userId}`)
        .setLabel('開始釣魚')
        .setStyle(ButtonStyle.Success)
        .setEmoji('🎣'),
      new ButtonBuilder()
        .setCustomId(`fish:cancel:${userId}`)
        .setLabel('取消')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('❌')
    )
  ];
}

function buildFishPanel() {
  const rodLines = Object.values(rods).map(rod => {
    const cost = rod.cost === 0 ? '免費' : formatCoins(rod.cost);
    return `${rod.label}：${cost}｜釣魚收入 ${rod.multiplier}x`;
  });

  const embed = new EmbedBuilder()
    .setColor(0x1abc9c)
    .setTitle('🎣 釣魚系統')
    .setDescription([
      '點擊下方綠色按鈕即可開始釣魚確認。',
      '',
      '📌 **規則**',
      `每次釣魚需要花費 **${formatCoins(fishingConfig.cost)}**。`,
      '魚類會自動出售成金幣，不需要手動賣魚。',
      '釣魚有機率獲得寶箱或隱藏鑽石。',
      '',
      '🎁 **釣魚獎勵表**',
      getFishingRewardListText(),
      '',
      '🪵 **釣竿效果**',
      rodLines.join('\n'),
      '',
      '🛒 **如何購買釣竿**',
      '使用 `/rod_shop` 查看、購買或選擇釣竿。',
      '更高級的釣竿會提高魚類自動出售的金幣收入。'
    ].join('\n'))
    .setFooter({ text: '獎勵機率不會公開顯示。' });

  const components = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('setup_panel:fish:start')
        .setLabel('開始釣魚')
        .setStyle(ButtonStyle.Success)
        .setEmoji('🎣')
    )
  ];

  return { embeds: [embed], components };
}

function buildCoinflipPanel() {
  const embed = new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle('🪙 硬幣翻轉')
    .setDescription([
      '選擇正面或反面，然後輸入下注金額。',
      '',
      '📌 **規則**',
      `下注範圍：**${formatCoins(gamblingConfig.coinflip.minBet)}–${formatCoins(gamblingConfig.coinflip.maxBet)}**`,
      '猜中後獲得 **2x 下注金額**。',
      '猜錯則失去下注金額。',
      '',
      '🎮 **玩法**',
      '點擊下方按鈕選擇正面或反面。',
      '系統會跳出輸入框，請輸入你要下注的金幣數量。'
    ].join('\n'))
    .setFooter({ text: '實際中獎機率不會公開顯示。' });

  const components = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('setup_panel:coinflip:heads')
        .setLabel('選擇正面')
        .setStyle(ButtonStyle.Success)
        .setEmoji('🟢'),
      new ButtonBuilder()
        .setCustomId('setup_panel:coinflip:tails')
        .setLabel('選擇反面')
        .setStyle(ButtonStyle.Success)
        .setEmoji('🟢')
    )
  ];

  return { embeds: [embed], components };
}

function buildSlotsPanel() {
  const payoutLines = gamblingConfig.slots.displayPayouts.map(item => `${item.label}：${item.multiplier}`);

  const embed = new EmbedBuilder()
    .setColor(0xe67e22)
    .setTitle('🎰 老虎機')
    .setDescription([
      '點擊下方按鈕後輸入下注金額，即可開始老虎機。',
      '',
      '📌 **規則**',
      `下注範圍：**${formatCoins(gamblingConfig.slots.minBet)}–${formatCoins(gamblingConfig.slots.maxBet)}**`,
      '系統會隨機產生三個圖案。',
      '不同結果會給予不同倍率獎勵。',
      '',
      '🎁 **獎勵倍率表**',
      payoutLines.join('\n')
    ].join('\n'))
    .setFooter({ text: '中獎機率不會公開顯示。' });

  const components = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('setup_panel:slots:start')
        .setLabel('開始老虎機')
        .setStyle(ButtonStyle.Success)
        .setEmoji('🎰')
    )
  ];

  return { embeds: [embed], components };
}

function buildMinesPanel() {
  const multiplierLines = Object.entries(gamblingConfig.mines.multipliers)
    .map(([mineCount, table]) => `${mineCount} 顆地雷：${table.slice(0, 5).map(x => `${x}x`).join(' / ')} ...`);

  const embed = new EmbedBuilder()
    .setColor(0xe74c3c)
    .setTitle('💣 踩地雷')
    .setDescription([
      '點擊下方按鈕後輸入下注金額與地雷數量。',
      '',
      '📌 **規則**',
      '棋盤大小：**5x5**',
      `下注範圍：**${formatCoins(gamblingConfig.mines.minBet)}–${formatCoins(gamblingConfig.mines.maxBet)}**`,
      `地雷數量：**${gamblingConfig.mines.minMines}–${gamblingConfig.mines.maxMines} 顆**`,
      '點到安全格會提高目前可提現倍率。',
      '踩到地雷則失去本局下注。',
      '',
      '💰 **如何提現**',
      '遊戲開始後，使用 `/mines_cashout` 提現。',
      '如果想放棄本局，使用 `/mines_quit`。',
      '',
      '📊 **倍率參考**',
      multiplierLines.join('\n'),
      '',
      '⚠️ 地雷數量最低為 7 顆，倍率已調低，避免變成洗錢/印鈔機。'
    ].join('\n'))
    .setFooter({ text: '實際地雷位置不會公開。' });

  const components = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('setup_panel:mines:start')
        .setLabel('開始踩地雷')
        .setStyle(ButtonStyle.Success)
        .setEmoji('💣')
    )
  ];

  return { embeds: [embed], components };
}

async function sendSetupPanel(interaction, channel, type) {
  const panelBuilders = {
    fish: buildFishPanel,
    coinflip: buildCoinflipPanel,
    slots: buildSlotsPanel,
    mines: buildMinesPanel
  };

  const panel = panelBuilders[type]();
  await channel.send(panel);

  const labels = {
    fish: '釣魚系統',
    coinflip: '硬幣翻轉',
    slots: '老虎機',
    mines: '踩地雷'
  };

  return interaction.reply({
    content: `✅ 已在 ${channel} 建立 **${labels[type]}** 遊戲面板。`
  });
}

async function executeCoinflipFromPanel(interaction, choice, bet) {
  const check = validateBet(bet, gamblingConfig.coinflip.minBet, gamblingConfig.coinflip.maxBet);
  if (!check.ok) return interaction.reply({ content: `❌ ${check.message}` });

  const risk = await checkGamblingBetAllowed(interaction.user, bet);
  if (!risk.ok) return interaction.reply({ content: risk.message });

  const spent = await spendCoins(interaction.user, bet, 'COINFLIP', '硬幣翻轉下注');
  if (!spent.ok) return interaction.reply({ content: '❌ 你的金幣不足。' });

  await prisma.user.update({
    where: { discordId: interaction.user.id },
    data: { coinflipPlayed: { increment: 1 } }
  });

  const result = rollCoinflipWithChoice(choice);
  let payout = 0;

  if (result.won) {
    payout = bet * gamblingConfig.coinflip.payoutMultiplier;
    await addCoins(interaction.user, payout, 'COINFLIP', '硬幣翻轉勝利');
  }

  await sendPostGameRiskAlert(interaction.client, interaction.user, '硬幣翻轉', [
    `本局下注：**${formatCoins(bet)}**`,
    `本局結果：**${result.won ? '勝利' : '失敗'}**`,
    `本局獲得：**${formatCoins(payout)}**`
  ]);

  const embed = new EmbedBuilder()
    .setColor(result.won ? 0x2ecc71 : 0xe74c3c)
    .setTitle('🪙 硬幣翻轉')
    .setDescription([
      `玩家：<@${interaction.user.id}>`,
      `下注金額：**${formatCoins(bet)}**`,
      `你的選擇：**${result.choiceLabel}**`,
      `硬幣結果：**${result.resultLabel}**`,
      '',
      `結果：${result.won ? '**你贏了！**' : '**你輸了。**'}`,
      result.won ? `你獲得了 **${formatCoins(payout)}**。` : `你失去了 **${formatCoins(bet)}**。`
    ].join('\n'));

  return interaction.reply({ embeds: [embed] });
}

async function executeSlotsFromPanel(interaction, bet) {
  const check = validateBet(bet, gamblingConfig.slots.minBet, gamblingConfig.slots.maxBet);
  if (!check.ok) return interaction.reply({ content: `❌ ${check.message}` });

  const risk = await checkGamblingBetAllowed(interaction.user, bet);
  if (!risk.ok) return interaction.reply({ content: risk.message });

  const spent = await spendCoins(interaction.user, bet, 'SLOTS', '老虎機下注');
  if (!spent.ok) return interaction.reply({ content: '❌ 你的金幣不足。' });

  await prisma.user.update({
    where: { discordId: interaction.user.id },
    data: { slotsPlayed: { increment: 1 } }
  });

  const { result, visual } = rollSlots();
  const payout = calculatePayout(bet, result.multiplier);

  if (payout > 0) {
    await addCoins(interaction.user, payout, 'SLOTS', `老虎機結果：${result.label}`);
  }

  await sendPostGameRiskAlert(interaction.client, interaction.user, '老虎機', [
    `本局下注：**${formatCoins(bet)}**`,
    `本局獎項：**${result.label}**`,
    `本局獲得：**${formatCoins(payout)}**`
  ]);

  const embed = new EmbedBuilder()
    .setColor(payout > 0 ? 0x2ecc71 : 0xe74c3c)
    .setTitle('🎰 老虎機')
    .setDescription([
      `玩家：<@${interaction.user.id}>`,
      `下注金額：**${formatCoins(bet)}**`,
      '',
      `結果：**${visual.join(' | ')}**`,
      '',
      `獎項：**${result.label}**`,
      `倍率：**${result.multiplier}x**`,
      `獲得：**${formatCoins(payout)}**`
    ].join('\n'));

  return interaction.reply({ embeds: [embed] });
}

function buildMinesEmbed(game, title = '💣 踩地雷') {
  const revealed = Array.isArray(game.revealed) ? game.revealed : JSON.parse(game.revealed);
  const safePicks = revealed.length;
  const multiplier = getMultiplier(game.mines, safePicks);
  const currentPayout = safePicks > 0 ? calculateMinesPayout(game.bet, game.mines, safePicks) : 0;

  return new EmbedBuilder()
    .setColor(0xf39c12)
    .setTitle(title)
    .setDescription([
      `玩家：<@${game.user?.discordId || '未知'}>`,
      `下注金額：**${formatCoins(game.bet)}**`,
      `地雷數量：**${game.mines}**`,
      `安全點擊：**${safePicks}**`,
      `目前倍率：**${multiplier}x**`,
      `目前可提現：**${formatCoins(currentPayout)}**`,
      '',
      '點擊格子繼續遊戲。若要提現，請使用 `/mines_cashout`。'
    ].join('\n'));
}

async function executeMinesFromPanel(interaction, bet, mineCount) {
  const existing = await findActiveGame(interaction.user.id);
  if (existing) {
    return interaction.reply({
      content: '❌ 你已經有一場進行中的踩地雷遊戲。請先使用 `/mines_cashout` 提現，或使用 `/mines_quit` 退出。'
    });
  }

  const check = validateBet(bet, gamblingConfig.mines.minBet, gamblingConfig.mines.maxBet);
  if (!check.ok) return interaction.reply({ content: `❌ ${check.message}` });

  if (mineCount < gamblingConfig.mines.minMines || mineCount > gamblingConfig.mines.maxMines) {
    return interaction.reply({ content: `❌ 地雷數量必須是 ${gamblingConfig.mines.minMines}–${gamblingConfig.mines.maxMines} 顆。` });
  }

  const risk = await checkGamblingBetAllowed(interaction.user, bet);
  if (!risk.ok) return interaction.reply({ content: risk.message });

  const spent = await spendCoins(interaction.user, bet, 'MINES', '踩地雷下注');
  if (!spent.ok) return interaction.reply({ content: '❌ 你的金幣不足。' });

  const user = await prisma.user.findUnique({ where: { discordId: interaction.user.id } });

  const game = await prisma.minesGame.create({
    data: {
      userId: user.id,
      bet,
      mines: mineCount,
      board: createBoard(mineCount),
      revealed: [],
      status: 'ACTIVE'
    },
    include: { user: true }
  });

  await prisma.user.update({
    where: { discordId: interaction.user.id },
    data: { minesPlayed: { increment: 1 } }
  });

  await interaction.reply({
    embeds: [buildMinesEmbed(game)],
    components: buildMinesRows(game)
  });

  const message = await interaction.fetchReply();

  await prisma.minesGame.update({
    where: { id: game.id },
    data: {
      messageId: message.id,
      channelId: message.channelId
    }
  });
}

async function handlePanelButton(interaction) {
  const [, game, action] = interaction.customId.split(':');

  if (game === 'fish' && action === 'start') {
    const embed = new EmbedBuilder()
      .setColor(0x3498db)
      .setTitle('🎣 釣魚確認')
      .setDescription([
        `每次釣魚需要花費 **${formatCoins(fishingConfig.cost)}**。`,
        '魚類會自動出售成金幣。',
        '',
        '你確定要開始釣魚嗎？'
      ].join('\n'));

    return interaction.reply({
      embeds: [embed],
      components: buildFishConfirmButtons(interaction.user.id)
    });
  }

  if (game === 'coinflip') {
    const choice = action;
    const modal = new ModalBuilder()
      .setCustomId(`setup_modal:coinflip:${choice}`)
      .setTitle(`硬幣翻轉｜選擇${faceLabel(choice)}`);

    const betInput = new TextInputBuilder()
      .setCustomId('bet')
      .setLabel('請輸入下注金額')
      .setPlaceholder(`${gamblingConfig.coinflip.minBet}–${gamblingConfig.coinflip.maxBet}`)
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(betInput));
    return interaction.showModal(modal);
  }

  if (game === 'slots' && action === 'start') {
    const modal = new ModalBuilder()
      .setCustomId('setup_modal:slots:start')
      .setTitle('老虎機｜輸入下注金額');

    const betInput = new TextInputBuilder()
      .setCustomId('bet')
      .setLabel('請輸入下注金額')
      .setPlaceholder(`${gamblingConfig.slots.minBet}–${gamblingConfig.slots.maxBet}`)
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(betInput));
    return interaction.showModal(modal);
  }

  if (game === 'mines' && action === 'start') {
    const modal = new ModalBuilder()
      .setCustomId('setup_modal:mines:start')
      .setTitle('踩地雷｜輸入下注與地雷數量');

    const betInput = new TextInputBuilder()
      .setCustomId('bet')
      .setLabel('請輸入下注金額')
      .setPlaceholder(`${gamblingConfig.mines.minBet}–${gamblingConfig.mines.maxBet}`)
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const minesInput = new TextInputBuilder()
      .setCustomId('mines')
      .setLabel(`請輸入地雷數量 ${gamblingConfig.mines.minMines}–${gamblingConfig.mines.maxMines}`)
      .setPlaceholder(`${gamblingConfig.mines.minMines}`)
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    modal.addComponents(
      new ActionRowBuilder().addComponents(betInput),
      new ActionRowBuilder().addComponents(minesInput)
    );

    return interaction.showModal(modal);
  }
}

async function handlePanelModal(interaction) {
  const [, game, action] = interaction.customId.split(':');

  if (game === 'coinflip') {
    const bet = parsePositiveInteger(interaction.fields.getTextInputValue('bet'));
    if (!bet) return interaction.reply({ content: '❌ 請輸入有效的下注金額。' });
    return executeCoinflipFromPanel(interaction, action, bet);
  }

  if (game === 'slots') {
    const bet = parsePositiveInteger(interaction.fields.getTextInputValue('bet'));
    if (!bet) return interaction.reply({ content: '❌ 請輸入有效的下注金額。' });
    return executeSlotsFromPanel(interaction, bet);
  }

  if (game === 'mines') {
    const bet = parsePositiveInteger(interaction.fields.getTextInputValue('bet'));
    const mineCount = parsePositiveInteger(interaction.fields.getTextInputValue('mines'));

    if (!bet) return interaction.reply({ content: '❌ 請輸入有效的下注金額。' });
    if (!mineCount) return interaction.reply({ content: '❌ 請輸入有效的地雷數量。' });

    return executeMinesFromPanel(interaction, bet, mineCount);
  }
}

module.exports = {
  sendSetupPanel,
  handlePanelButton,
  handlePanelModal,
  buildFishPanel,
  buildCoinflipPanel,
  buildSlotsPanel,
  buildMinesPanel
};
