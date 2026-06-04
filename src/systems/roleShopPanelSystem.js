const {
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  MessageFlags
} = require('discord.js');
const { ROLE_SHOP, getAllPurchasableRoles, getPurchasableRoleByKey } = require('../config/roleShopConfig');
const { getOrCreateUser, spendCoins } = require('./economySystem');
const { formatCoins } = require('../utils/format');
const { getMemberRoleBenefits, formatBenefitLine, roleCollectionHas } = require('./roleBenefitSystem');

function privatePayload(payload = {}) {
  return { ...payload, flags: MessageFlags.Ephemeral };
}

function mentionRole(id) {
  return `<@&${id}>`;
}

function formatBuffs(role) {
  const parts = [];
  if (role.dailyBoostPercent) parts.push(`每日 +${role.dailyBoostPercent}%`);
  if (role.fishingCooldownPercent) parts.push(`釣魚冷卻 -${role.fishingCooldownPercent}%`);
  if (role.luckPercent) parts.push(`幸運 +${role.luckPercent}%`);
  if (role.ability) parts.push(role.ability);
  if (role.benefit) parts.push(role.benefit);
  return parts.length ? parts.join('｜') : '無能力加成';
}

function buildRoleLine(role) {
  return `${role.emoji} ${mentionRole(role.id)}｜**${formatCoins(role.price)}**｜${formatBuffs(role)}`;
}

function buildRoleShopPanel() {
  const buffLines = ROLE_SHOP.buffRoles.map(buildRoleLine);
  const specialLines = ROLE_SHOP.specialRoles.map(buildRoleLine);
  const cosmeticLines = ROLE_SHOP.cosmeticRoles.map(buildRoleLine);

  const embed = new EmbedBuilder()
    .setColor(0x9b59b6)
    .setTitle('🎭 動漫角色商店')
    .setDescription([
      '使用下方選單購買角色。購買後系統會扣除金幣並給你 Discord 身分組。',
      '',
      '⚔️ **能力角色**',
      ...buffLines,
      '',
      '🕵️ **特殊職業**',
      ...specialLines,
      '',
      '💎 **炫耀稱號**',
      ...cosmeticLines,
      '',
      '🚀 **Server Booster 加成**',
      `${ROLE_SHOP.serverBoosterRole.emoji} ${mentionRole(ROLE_SHOP.serverBoosterRole.id)}｜不可購買｜每日 +${ROLE_SHOP.serverBoosterRole.dailyBoostPercent}%`,
      '',
      '📌 **加成規則**',
      `每日獎勵可疊加，Server Booster 的 +${ROLE_SHOP.serverBoosterRole.dailyBoostPercent}% 也會一起計算，但最高仍然只有 **+${ROLE_SHOP.dailyBoostCapPercent}%**。`,
      `釣魚冷卻可疊加，最高 **-${ROLE_SHOP.fishingCooldownCapPercent}%**。`,
      `幸運值不可疊加，只套用最高值，最高 **+${ROLE_SHOP.luckCapPercent}%**。`,
      '隱藏鑽石不受幸運值影響。',
      '炫耀稱號最多只有這 2 個，沒有能力加成。'
    ].join('\n'))
    .setFooter({ text: '購買前請確認價格。角色購買後不自動退款。' });

  const options = getAllPurchasableRoles().map(role => ({
    label: role.name,
    value: role.key,
    emoji: role.emoji,
    description: `${role.price.toLocaleString('en-US')} 金幣｜${formatBuffs(role)}`.slice(0, 100)
  }));

  const menu = new StringSelectMenuBuilder()
    .setCustomId('role_shop_select:buy')
    .setPlaceholder('選擇你要購買的角色')
    .addOptions(options);

  return {
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(menu)]
  };
}

async function sendRoleShopPanel(interaction, channel) {
  await channel.send(buildRoleShopPanel());
  return interaction.reply(privatePayload({ content: `✅ 已在 ${channel} 建立 **角色商店** 面板。` }));
}

async function handleRoleShopSelect(interaction) {
  const [, action] = interaction.customId.split(':');
  if (action !== 'buy') return;

  const roleKey = interaction.values[0];
  const role = getPurchasableRoleByKey(roleKey);
  if (!role) {
    return interaction.reply(privatePayload({ content: '❌ 找不到這個角色。' }));
  }

  const member = await interaction.guild.members.fetch(interaction.user.id);
  if (roleCollectionHas(member, role.id)) {
    return interaction.reply(privatePayload({ content: `❌ 你已經擁有 ${role.emoji} **${role.name}**。` }));
  }

  if (role.category === 'cosmetic') {
    const ownedCosmetics = ROLE_SHOP.cosmeticRoles.filter(item => roleCollectionHas(member, item.id));
    if (ownedCosmetics.length >= ROLE_SHOP.cosmeticRoles.length) {
      return interaction.reply(privatePayload({ content: '❌ 你已經擁有所有炫耀稱號。' }));
    }
  }

  const user = await getOrCreateUser(interaction.user);
  if (user.coins < role.price) {
    return interaction.reply(privatePayload({
      content: `❌ 你的金幣不足。需要 **${formatCoins(role.price)}**，你目前只有 **${formatCoins(user.coins)}**。`
    }));
  }

  try {
    await member.roles.add(role.id, `購買角色商店角色：${role.name}`);
  } catch (error) {
    console.error(error);
    return interaction.reply(privatePayload({
      content: '❌ 無法給你這個身分組。請確認機器人的身分組權限比商店角色更高，並且有「管理身分組」權限。'
    }));
  }

  const spent = await spendCoins(interaction.user, role.price, 'ROLE_SHOP', `購買角色：${role.name}`);
  if (!spent.ok) {
    await member.roles.remove(role.id, '購買角色扣款失敗，自動移除').catch(() => null);
    return interaction.reply(privatePayload({ content: '❌ 扣款失敗，角色已取消。請稍後再試。' }));
  }

  const benefits = getMemberRoleBenefits(member);

  const embed = new EmbedBuilder()
    .setColor(0x2ecc71)
    .setTitle('✅ 角色購買成功')
    .setDescription([
      `你購買了：${role.emoji} **${role.name}**`,
      `花費：**${formatCoins(role.price)}**`,
      `效果：**${formatBuffs(role)}**`,
      '',
      `目前角色加成：**${formatBenefitLine(benefits)}**`,
      `剩餘金幣：**${formatCoins(spent.user.coins)}**`
    ].join('\n'));

  return interaction.reply(privatePayload({ embeds: [embed] }));
}

module.exports = {
  buildRoleShopPanel,
  sendRoleShopPanel,
  handleRoleShopSelect,
  formatBuffs
};
