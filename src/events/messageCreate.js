const { EmbedBuilder } = require('discord.js');

function parseRobuxMessage(content) {
  const trimmed = String(content || '').trim();
  const match = trimmed.match(/^r\$\s*([0-9][0-9,，]*)?$/i);
  if (!match) return null;

  if (!match[1]) return { type: 'help' };

  const cleaned = match[1].replace(/[,，]/g, '');
  const robux = Number(cleaned);

  if (!Number.isSafeInteger(robux) || robux <= 0) return { type: 'invalid' };
  return { type: 'calculate', robux };
}

function calculateNtd(robux) {
  // Boundary rule requested by user:
  // 150 still belongs to the old 65 NTD tier, but 160 moves to 75 NTD.
  // Same pattern: 250 -> 75, 260 -> 85, 350 -> 85, 360 -> 95, 450 -> 100.
  if (robux <= 150) return 65;
  if (robux <= 250) return 75;
  if (robux <= 350) return 85;
  if (robux <= 450) return 100;
  return Math.round(robux * 0.18);
}

function buildRateHelpEmbed() {
  return new EmbedBuilder()
    .setColor(0x00a2ff)
    .setTitle('💸 Robux 兌換台幣查詢')
    .setDescription([
      '輸入 `r$ 數量` 即可查詢 Robux 對台幣價格。',
      '',
      '📌 **價格規則**',
      '`r$ 150` 或以下：**65 NTD**',
      '`r$ 250` 或以下：**75 NTD**',
      '`r$ 350` 或以下：**85 NTD**',
      '`r$ 450` 或以下：**100 NTD**',
      '`r$ 451` 以上：**Robux × 0.18 = NTD**',
      '',
      '✅ **範例**',
      '`r$ 150` → **65 NTD**',
      '`r$ 160` → **75 NTD**',
      '`r$ 450` → **100 NTD**',
      '`r$ 5000` → **900 NTD**'
    ].join('\n'));
}

function buildRateResultEmbed(robux, ntd) {
  return new EmbedBuilder()
    .setColor(0x2ecc71)
    .setTitle('💸 Robux 價格查詢')
    .setDescription([
      `Robux 數量：**${robux.toLocaleString('en-US')} Robux**`,
      `台幣價格：**${ntd.toLocaleString('en-US')} NTD**`,
      '',
      `✅ **${robux.toLocaleString('en-US')} Robux = ${ntd.toLocaleString('en-US')} NTD**`
    ].join('\n'));
}

module.exports = {
  name: 'messageCreate',
  async execute(message) {
    if (!message.guild || message.author.bot) return;

    const parsed = parseRobuxMessage(message.content);
    if (!parsed) return;

    if (parsed.type === 'help') {
      return message.reply({ embeds: [buildRateHelpEmbed()], allowedMentions: { repliedUser: false } });
    }

    if (parsed.type === 'invalid') {
      return message.reply({ content: '❌ 請輸入正確的 Robux 數量，例如：`r$ 5000`。', allowedMentions: { repliedUser: false } });
    }

    const ntd = calculateNtd(parsed.robux);
    return message.reply({ embeds: [buildRateResultEmbed(parsed.robux, ntd)], allowedMentions: { repliedUser: false } });
  }
};

module.exports.calculateNtd = calculateNtd;
