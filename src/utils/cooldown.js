function getRemainingCooldown(lastDate, cooldownMs) {
  if (!lastDate) return 0;

  const lastTime = new Date(lastDate).getTime();
  const now = Date.now();
  const remaining = lastTime + cooldownMs - now;

  return Math.max(0, remaining);
}

module.exports = {
  getRemainingCooldown
};
