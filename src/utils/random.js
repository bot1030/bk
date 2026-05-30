function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function rollChance(percent) {
  return Math.random() * 100 < percent;
}

function rollWeighted(items) {
  const total = items.reduce((sum, item) => sum + item.chance, 0);
  let roll = Math.random() * total;

  for (const item of items) {
    roll -= item.chance;
    if (roll <= 0) return item;
  }

  return items[items.length - 1];
}

function shuffle(array) {
  const cloned = [...array];
  for (let i = cloned.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cloned[i], cloned[j]] = [cloned[j], cloned[i]];
  }
  return cloned;
}

module.exports = {
  randomInt,
  rollChance,
  rollWeighted,
  shuffle
};
