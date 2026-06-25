function formatNumber(value) {
  return Number(value || 0).toLocaleString('en-US');
}

function formatCoins(value) {
  return `${formatNumber(value)} 金幣`;
}

function formatEventCoins(value) {
  return `${formatNumber(value)} 活動金幣`;
}

function formatCoinsWithEvent(coins, eventCoins = 0) {
  const normal = formatNumber(coins);
  const event = Number(eventCoins || 0);
  if (event <= 0) return `${normal} 金幣`;
  return `${normal} 金幣 (+${formatNumber(event)} 活動金幣)`;
}

function formatJK(value) {
  return `${formatNumber(value)} JK餘額`;
}

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours} 小時 ${minutes} 分鐘`;
  if (minutes > 0) return `${minutes} 分鐘 ${seconds} 秒`;
  return `${seconds} 秒`;
}

module.exports = {
  formatNumber,
  formatCoins,
  formatEventCoins,
  formatCoinsWithEvent,
  formatJK,
  formatDuration
};
