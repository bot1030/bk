const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags,
  StringSelectMenuBuilder
} = require('discord.js');
const prisma = require('../database/prisma');
const fishingConfig = require('../config/fishingConfig');
const gamblingConfig = require('../config/gamblingConfig');
const { rods } = require('../config/rodConfig');
const { DAILY_REWARD_MIN, DAILY_REWARD_MAX, DAILY_COOLDOWN_MS } = require('../config/economyConfig');
const { getMemberRoleBenefits, applyDailyBoost, applyFishingCooldownReduction, formatBenefitLine } = require('./roleBenefitSystem');
const { getFishingRewardListText, getRodEffectLabel } = require('./fishingSystem');
const { getOrCreateUser, spendCoins, addCoins } = require('./economySystem');
const { buyRod, selectRod, getRodShopText } = require('./rodSystem');
const { rollCoinflipWithChoice, rollSlots, calculatePayout, faceLabel } = require('./gamblingSystem');
const { checkGamblingBetAllowed, sendPostGameRiskAlert } = require('./riskSystem');
const { announceBigWin } = require('./bigWinSystem');
const { validateBet } = require('../utils/guards');
const { randomInt } = require('../utils/random');
const { getRemainingCooldown } = require('../utils/cooldown');
const { formatCoins, formatJK, formatDuration } = require('../utils/format');
const { createConvertUi } = require('../commands/convert');
const {
  createBoard,
  buildMinesComponents,
  buildMinesBoardText,
  calculateMinesPayout,
  getMultiplier,
  findActiveGame,
  parseJsonArray
} = require('./minesSystem');

function privatePayload(payload = {}) {
  return { ...payload, flags: MessageFlags.Ephemeral };
}

function replyPayload(payload = {}) {
  const clean = { ...payload };
  delete clean.flags;
  return clean;
}

async function deferPrivate(interaction) {
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  }
}

async function respondPrivate(interaction, payload = {}) {
  if (interaction.deferred || interaction.replied) {
    return interaction.editReply(replyPayload(payload));
  }

  return interaction.reply(privatePayload(payload));
}


const COINFLIP_TAX_RATE = 0.03;

function calculateCoinflipTax(grossPayout) {
  if (!grossPayout || grossPayout <= 0) {
    return { grossPayout: 0, taxRate: 0, taxAmount: 0, netPayout: 0 };
  }

  const taxRate = COINFLIP_TAX_RATE;
  const taxAmount = Math.ceil(grossPayout * taxRate);
  const netPayout = Math.max(0, grossPayout - taxAmount);

  return { grossPayout, taxRate, taxAmount, netPayout };
}

function formatTaxRate(rate) {
  return `${Math.round(rate * 100)}%`;
}

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
    return `${rod.label}：${cost}｜${getRodEffectLabel ? getRodEffectLabel(rod) : '提高高級魚類機率'}`;
  });

  const embed = new EmbedBuilder()
    .setColor(0x1abc9c)
    .setTitle('🎣 釣魚系統')
    .setDescription([
      '點擊下方綠色按鈕即可開始釣魚確認。',
      '',
      '📌 **規則**',
      '每次釣魚成本：**免費**',
      '基礎冷卻時間：**1 小時 30 分鐘**',
      '角色可降低釣魚冷卻，最高 **-25%**。',
      '魚類會自動出售成金幣，不需要手動賣魚。',
      '釣竿不會直接提高「一定賺錢」的機率，而是提高較高級魚類與寶箱的出現傾向。',
      '隱藏鑽石機率不受釣竿或角色幸運值影響，避免 JK餘額 被過度農出來。',
      '釣魚有機率獲得寶箱或隱藏鑽石。',
      '',
      '🎁 **釣魚獎勵表**',
      getFishingRewardListText(),
      '',
      '🪵 **釣竿效果**',
      rodLines.join('\n'),
      '',
      '🛒 **如何購買釣竿**',
      '請到釣竿商店面板選擇購買或裝備釣竿。',
      '管理員可使用 `/setup_fishrod` 建立釣竿商店面板。'
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

function buildDailyPanel() {
  const embed = new EmbedBuilder()
    .setColor(0x2ecc71)
    .setTitle('🎁 每日獎勵')
    .setDescription([
      '每天可以領取一次金幣獎勵。',
      '',
      '📌 **規則**',
      `基礎獎勵範圍：**${formatCoins(DAILY_REWARD_MIN)}–${formatCoins(DAILY_REWARD_MAX)}**`,
      '角色每日加成可疊加，最高 **+30%**。',
      'Server Booster 額外提供 **+15% 每日獎勵**，會列入 +30% 上限。',
      '冷卻時間：**24 小時**',
      '',
      '🎮 **玩法**',
      '點擊下方按鈕即可領取每日獎勵。',
      '領取結果只會顯示給你自己。'
    ].join('\n'));

  const components = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('setup_panel:daily:claim')
        .setLabel('領取每日獎勵')
        .setStyle(ButtonStyle.Success)
        .setEmoji('🎁')
    )
  ];

  return { embeds: [embed], components };
}

function buildConvertPanel() {
  const embed = new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle('🔁 貨幣兌換')
    .setDescription([
      '在金幣與 JK餘額之間進行兌換。',
      '',
      '💱 **兌換比例**',
      '**1,000 金幣 = 1 JK餘額**',
      '**1 JK餘額 = 1,000 金幣**',
      '',
      '🎮 **玩法**',
      '點擊下方按鈕後，輸入你要兌換的數量。',
      '系統會開啟私人兌換介面，讓你選擇「把什麼貨幣」換成「什麼貨幣」。',
      '',
      '⚠️ 金幣換成 JK餘額時，金幣數量必須是 1,000 的倍數。',
      '金幣換成 JK餘額後會先進入 **待結算 JK餘額** 24 小時。',
      '待結算期間仍可被 **幻影怪盜** 偷竊；正式結算後才受保護。'
    ].join('\n'));

  const components = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('setup_panel:convert:start')
        .setLabel('開始兌換')
        .setStyle(ButtonStyle.Success)
        .setEmoji('🔁')
    )
  ];

  return { embeds: [embed], components };
}

function buildFishrodPanel() {
  const buyMenu = new StringSelectMenuBuilder()
    .setCustomId('setup_panel_select:fishrod:buy')
    .setPlaceholder('選擇要購買的釣竿')
    .addOptions(
      Object.values(rods).map(rod => ({
        label: rod.label,
        value: rod.id,
        description: `${rod.cost === 0 ? '免費' : `${rod.cost.toLocaleString('en-US')} 金幣`}｜提高高級魚傾向`
      }))
    );

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('setup_panel_select:fishrod:select')
    .setPlaceholder('選擇要裝備的釣竿')
    .addOptions(
      Object.values(rods).map(rod => ({
        label: rod.label,
        value: rod.id,
        description: `裝備後提高高級魚類出現傾向`
      }))
    );

  const embed = new EmbedBuilder()
    .setColor(0x1abc9c)
    .setTitle('🪵 釣竿商店')
    .setDescription([
      '使用下方選單購買或裝備釣竿。',
      '',
      '🛒 **釣竿價格與效果**',
      getRodShopText(),
      '',
      '📌 **規則**',
      '購買釣竿後會自動裝備。',
      '更高級的釣竿不會直接提高每次釣魚的成功率。',
      '它會提高較高級魚類與寶箱的出現傾向。',
      '隱藏鑽石機率不受釣竿影響。',
      '購買與裝備結果只會顯示給你自己。'
    ].join('\n'));

  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(buyMenu),
      new ActionRowBuilder().addComponents(selectMenu)
    ]
  };
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
      '猜中後獲得 **2x 下注金額**，但會先扣除硬幣翻轉稅。',
      '所有中獎獎金固定扣除 **3% 稅**。',
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
    .map(([mineCount, table]) => `${mineCount} 顆地雷：${table.map(x => `${x}x`).join(' / ')}`);

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
      '💰 **如何提現 / 退出**',
      '遊戲開始後，遊戲介面內會有「提現」與「退出」按鈕。',
      '不需要再另外輸入 `/mines_cashout` 或 `/mines_quit`。',
      '如果玩家卡住或想停止所有局，可以點擊「結束我的遊戲並退回本金」。',
      '',
      '📊 **倍率參考**',
      multiplierLines.join('\n'),
      '',
      `⚠️ 倍率最多計算前 ${gamblingConfig.mines.maxSafePicksForMultiplier} 次安全點擊，避免變成印鈔機。`
    ].join('\n'))
    .setFooter({ text: '實際地雷位置不會公開。' });

  const components = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('setup_panel:mines:start')
        .setLabel('開始踩地雷')
        .setStyle(ButtonStyle.Success)
        .setEmoji('💣'),
      new ButtonBuilder()
        .setCustomId('setup_panel:mines:force_end_all')
        .setLabel('結束我的遊戲並退回本金')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('🧯')
    )
  ];

  return { embeds: [embed], components };
}

async function sendSetupPanel(interaction, channel, type) {
  const panelBuilders = {
    fish: buildFishPanel,
    daily: buildDailyPanel,
    convert: buildConvertPanel,
    fishrod: buildFishrodPanel,
    coinflip: buildCoinflipPanel,
    slots: buildSlotsPanel,
    mines: buildMinesPanel
  };

  const panelBuilder = panelBuilders[type];
  if (!panelBuilder) return interaction.reply(privatePayload({ content: '❌ 無效的面板類型。' }));

  const panel = panelBuilder();
  await channel.send(panel);

  const labels = {
    fish: '釣魚系統',
    daily: '每日獎勵',
    convert: '貨幣兌換',
    fishrod: '釣竿商店',
    coinflip: '硬幣翻轉',
    slots: '老虎機',
    mines: '踩地雷'
  };

  return interaction.reply(privatePayload({
    content: `✅ 已在 ${channel} 建立 **${labels[type]}** 面板。`
  }));
}

async function claimDailyFromPanel(interaction) {
  const user = await getOrCreateUser(interaction.user);
  const remaining = getRemainingCooldown(user.lastDaily, DAILY_COOLDOWN_MS);

  if (remaining > 0) {
    const embed = new EmbedBuilder()
      .setColor(0xe67e22)
      .setTitle('⏰ 每日獎勵冷卻中')
      .setDescription(`你已經領取過每日獎勵了。\n請在 **${formatDuration(remaining)}** 後再試一次。`);

    return interaction.reply(privatePayload({ embeds: [embed] }));
  }

  const benefits = getMemberRoleBenefits(interaction.member);
  const baseReward = randomInt(DAILY_REWARD_MIN, DAILY_REWARD_MAX);
  const reward = applyDailyBoost(baseReward, benefits);
  await addCoins(interaction.user, reward, 'DAILY', `每日獎勵｜基礎 ${baseReward}｜加成 +${benefits.dailyBoostPercent}%`);

  await prisma.user.update({
    where: { discordId: interaction.user.id },
    data: { lastDaily: new Date() }
  });

  const embed = new EmbedBuilder()
    .setColor(0x2ecc71)
    .setTitle('🎁 每日獎勵')
    .setDescription([
      `基礎獎勵：**${formatCoins(baseReward)}**`,
      `角色加成：**+${benefits.dailyBoostPercent}%**`,
      `本次獲得：**${formatCoins(reward)}**`,
      '',
      `目前加成：${formatBenefitLine(benefits)}`,
      '明天再回來領取獎勵。'
    ].join('\n'));

  return interaction.reply(privatePayload({ embeds: [embed] }));
}

async function executeCoinflipFromPanel(interaction, choice, bet) {
  await deferPrivate(interaction);

  const check = validateBet(bet, gamblingConfig.coinflip.minBet, gamblingConfig.coinflip.maxBet);
  if (!check.ok) return respondPrivate(interaction, { content: `❌ ${check.message}` });

  const risk = await checkGamblingBetAllowed(interaction.user, bet);
  if (!risk.ok) return respondPrivate(interaction, { content: risk.message });

  const spent = await spendCoins(interaction.user, bet, 'COINFLIP', '硬幣翻轉下注');
  if (!spent.ok) return respondPrivate(interaction, { content: '❌ 你的金幣不足。' });

  await prisma.user.update({
    where: { discordId: interaction.user.id },
    data: { coinflipPlayed: { increment: 1 } }
  });

  const benefits = getMemberRoleBenefits(interaction.member);
  const result = rollCoinflipWithChoice(choice, benefits.luckPercent);
  let grossPayout = 0;
  let taxRate = 0;
  let taxAmount = 0;
  let payout = 0;

  if (result.won) {
    grossPayout = bet * gamblingConfig.coinflip.payoutMultiplier;
    const tax = calculateCoinflipTax(grossPayout);
    taxRate = tax.taxRate;
    taxAmount = tax.taxAmount;
    payout = tax.netPayout;
    await addCoins(interaction.user, payout, 'COINFLIP', `硬幣翻轉勝利｜稅前 ${grossPayout}｜稅金 ${taxAmount}`);
  }

  await sendPostGameRiskAlert(interaction.client, interaction.user, '硬幣翻轉', [
    `本局下注：**${formatCoins(bet)}**`,
    `本局結果：**${result.won ? '勝利' : '失敗'}**`,
    result.won ? `稅前獎金：**${formatCoins(grossPayout)}**` : `本局獲得：**${formatCoins(0)}**`,
    result.won ? `扣稅：**${formatCoins(taxAmount)}**（${formatTaxRate(taxRate)}）` : null,
    result.won ? `實收獎金：**${formatCoins(payout)}**` : null,
    benefits.luckPercent > 0 ? `角色幸運值：**+${benefits.luckPercent}%**` : null
  ].filter(Boolean));

  if (result.won && payout > 0) {
    await announceBigWin(interaction.client, interaction.guildId, {
      user: interaction.user,
      gameName: '硬幣翻轉',
      coins: payout,
      detailLines: [
        `下注金額：**${formatCoins(bet)}**`,
        `玩家選擇：**${result.choiceLabel}**`,
        `硬幣結果：**${result.resultLabel}**`,
        `稅前獎金：**${formatCoins(grossPayout)}**`,
        `扣稅：**${formatCoins(taxAmount)}**（${formatTaxRate(taxRate)}）`,
        `實收獎金：**${formatCoins(payout)}**`,
        benefits.luckPercent > 0 ? `角色幸運值：**+${benefits.luckPercent}%**` : null
      ].filter(Boolean)
    });
  }

  const embed = new EmbedBuilder()
    .setColor(result.won ? 0x2ecc71 : 0xe74c3c)
    .setTitle('🪙 硬幣翻轉')
    .setDescription([
      `下注金額：**${formatCoins(bet)}**`,
      `你的選擇：**${result.choiceLabel}**`,
      `硬幣結果：**${result.resultLabel}**`,
      benefits.luckPercent > 0 ? `角色加成：**${formatBenefitLine(benefits)}**` : null,
      '',
      `結果：${result.won ? '**你贏了！**' : '**你輸了。**'}`,
      result.won
        ? [
            `稅前獎金：**${formatCoins(grossPayout)}**`,
            `扣稅：**${formatCoins(taxAmount)}**（${formatTaxRate(taxRate)}）`,
            `實收獎金：**${formatCoins(payout)}**。`
          ].join('\n')
        : `你失去了 **${formatCoins(bet)}**。`
    ].filter(line => line !== null).join('\n'));

  return respondPrivate(interaction, { embeds: [embed] });
}

async function executeSlotsFromPanel(interaction, bet) {
  await deferPrivate(interaction);

  const check = validateBet(bet, gamblingConfig.slots.minBet, gamblingConfig.slots.maxBet);
  if (!check.ok) return respondPrivate(interaction, { content: `❌ ${check.message}` });

  const risk = await checkGamblingBetAllowed(interaction.user, bet);
  if (!risk.ok) return respondPrivate(interaction, { content: risk.message });

  const spent = await spendCoins(interaction.user, bet, 'SLOTS', '老虎機下注');
  if (!spent.ok) return respondPrivate(interaction, { content: '❌ 你的金幣不足。' });

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

  if (payout > 0) {
    await announceBigWin(interaction.client, interaction.guildId, {
      user: interaction.user,
      gameName: '老虎機',
      coins: payout,
      detailLines: [
        `下注金額：**${formatCoins(bet)}**`,
        `結果：**${visual.join(' | ')}**`,
        `獎項：**${result.label}**`,
        `倍率：**${result.multiplier}x**`
      ]
    });
  }

  const embed = new EmbedBuilder()
    .setColor(payout > 0 ? 0x2ecc71 : 0xe74c3c)
    .setTitle('🎰 老虎機')
    .setDescription([
      `下注金額：**${formatCoins(bet)}**`,
      '',
      `結果：**${visual.join(' | ')}**`,
      '',
      `獎項：**${result.label}**`,
      `倍率：**${result.multiplier}x**`,
      `獲得：**${formatCoins(payout)}**`
    ].join('\n'));

  return respondPrivate(interaction, { embeds: [embed] });
}

function buildMinesEmbed(game, title = '💣 踩地雷') {
  const revealed = parseJsonArray(game.revealed);
  const safePicks = revealed.length;
  const multiplier = getMultiplier(game.mines, safePicks);
  const currentPayout = safePicks > 0 ? calculateMinesPayout(game.bet, game.mines, safePicks) : 0;

  return new EmbedBuilder()
    .setColor(0xf39c12)
    .setTitle(title)
    .setDescription([
      `下注金額：**${formatCoins(game.bet)}**`,
      `地雷數量：**${game.mines}**`,
      `安全點擊：**${safePicks}**`,
      `目前倍率：**${multiplier}x**`,
      `目前可提現：**${formatCoins(currentPayout)}**`,
      `倍率最多計算前 **${gamblingConfig.mines.maxSafePicksForMultiplier} 次安全點擊**。`,
      '',
      '```',
      buildMinesBoardText(game),
      '```',
      '直接點擊格子進行遊戲。提現 / 退出按鈕會顯示在下方控制列。'
    ].join('\n'));
}

async function executeMinesFromPanel(interaction, bet, mineCount) {
  // Use the real Mines command engine so panel-started games and /mines games behave exactly the same.
  // This avoids duplicated logic and prevents Unknown Interaction errors by deferring immediately inside startMinesGame().
  const minesCommand = require('../commands/mines');
  return minesCommand.startMinesGame(interaction, bet, mineCount);
}

async function handlePanelButton(interaction) {
  const [, game, action] = interaction.customId.split(':');

  if (game === 'daily' && action === 'claim') {
    return claimDailyFromPanel(interaction);
  }

  if (game === 'convert' && action === 'start') {
    const modal = new ModalBuilder()
      .setCustomId('setup_modal:convert:start')
      .setTitle('貨幣兌換｜輸入兌換數量');

    const amountInput = new TextInputBuilder()
      .setCustomId('amount')
      .setLabel('請輸入要兌換的數量')
      .setPlaceholder('例如：1000 或 5')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(amountInput));
    return interaction.showModal(modal);
  }

  if (game === 'fish' && action === 'start') {
    const benefits = getMemberRoleBenefits(interaction.member);
    const effectiveCooldownMs = applyFishingCooldownReduction(fishingConfig.cooldownMs, benefits);

    const embed = new EmbedBuilder()
      .setColor(0x3498db)
      .setTitle('🎣 釣魚確認')
      .setDescription([
        '本次釣魚成本：**免費**',
        `目前冷卻時間：**${formatDuration(effectiveCooldownMs)}**`,
        `角色加成：**${formatBenefitLine(benefits)}**`,
        '魚類會自動出售成金幣。',
        '隱藏鑽石不受角色幸運值影響。',
        '',
        '你確定要開始釣魚嗎？'
      ].join('\n'));

    return interaction.reply(privatePayload({
      embeds: [embed],
      components: buildFishConfirmButtons(interaction.user.id)
    }));
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

  if (game === 'mines' && action === 'force_end_all') {
    const minesCommand = require('../commands/mines');
    return minesCommand.refundAllActiveGames(interaction);
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

async function handlePanelSelect(interaction) {
  const [, game, action] = interaction.customId.split(':');

  if (game !== 'fishrod') return;

  const rodId = interaction.values[0];

  if (action === 'buy') {
    const result = await buyRod(interaction.user, rodId);
    if (!result.ok) return interaction.reply(privatePayload({ content: `❌ ${result.message}` }));

    return interaction.reply(privatePayload({
      content: `✅ 你已購買並裝備 **${result.rod.label}**。\n效果：**${getRodEffectLabel(result.rod)}**`
    }));
  }

  if (action === 'select') {
    const result = await selectRod(interaction.user, rodId);
    if (!result.ok) return interaction.reply(privatePayload({ content: `❌ ${result.message}` }));

    return interaction.reply(privatePayload({
      content: `✅ 你已裝備 **${result.rod.label}**。\n效果：**${getRodEffectLabel(result.rod)}**`
    }));
  }
}

async function handlePanelModal(interaction) {
  const [, game, action] = interaction.customId.split(':');

  if (game === 'convert') {
    const amount = parsePositiveInteger(interaction.fields.getTextInputValue('amount'));
    if (!amount) return interaction.reply(privatePayload({ content: '❌ 請輸入有效的兌換數量。' }));

    const ui = createConvertUi(interaction.user.id, amount);
    return interaction.reply(privatePayload(ui));
  }

  if (game === 'coinflip') {
    const bet = parsePositiveInteger(interaction.fields.getTextInputValue('bet'));
    if (!bet) return interaction.reply(privatePayload({ content: '❌ 請輸入有效的下注金額。' }));
    return executeCoinflipFromPanel(interaction, action, bet);
  }

  if (game === 'slots') {
    const bet = parsePositiveInteger(interaction.fields.getTextInputValue('bet'));
    if (!bet) return interaction.reply(privatePayload({ content: '❌ 請輸入有效的下注金額。' }));
    return executeSlotsFromPanel(interaction, bet);
  }

  if (game === 'mines') {
    const bet = parsePositiveInteger(interaction.fields.getTextInputValue('bet'));
    const mineCount = parsePositiveInteger(interaction.fields.getTextInputValue('mines'));

    if (!bet) return interaction.reply(privatePayload({ content: '❌ 請輸入有效的下注金額。' }));
    if (!mineCount) return interaction.reply(privatePayload({ content: '❌ 請輸入有效的地雷數量。' }));

    return executeMinesFromPanel(interaction, bet, mineCount);
  }
}

module.exports = {
  sendSetupPanel,
  handlePanelButton,
  handlePanelSelect,
  handlePanelModal,
  buildFishPanel,
  buildDailyPanel,
  buildConvertPanel,
  buildFishrodPanel,
  buildCoinflipPanel,
  buildSlotsPanel,
  buildMinesPanel
};
