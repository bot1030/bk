const { rollWeighted } = require('../utils/random');
const gamblingConfig = require('../config/gamblingConfig');

function oppositeFace(face) {
  return face === 'heads' ? 'tails' : 'heads';
}

function faceLabel(face) {
  return face === 'heads' ? '正面' : '反面';
}

function rollCoinflip() {
  return Math.random() < gamblingConfig.coinflip.winChance;
}

function rollCoinflipWithChoice(choice) {
  const won = rollCoinflip();
  const resultFace = won ? choice : oppositeFace(choice);

  return {
    won,
    resultFace,
    resultLabel: faceLabel(resultFace),
    choiceLabel: faceLabel(choice)
  };
}

function buildSlotVisual(result) {
  const symbols = ['🍒', '🍋', '🍇', '💎', '👑', '🔥'];

  if (result.id === 'nothing') {
    return ['🍒', '🍋', '🍇'].sort(() => Math.random() - 0.5);
  }

  if (result.id === 'pair') {
    const pairSymbol = symbols[Math.floor(Math.random() * symbols.length)];
    let thirdSymbol = symbols[Math.floor(Math.random() * symbols.length)];
    while (thirdSymbol === pairSymbol) {
      thirdSymbol = symbols[Math.floor(Math.random() * symbols.length)];
    }
    return [pairSymbol, pairSymbol, thirdSymbol].sort(() => Math.random() - 0.5);
  }

  return [result.symbol, result.symbol, result.symbol];
}

function rollSlots() {
  const result = rollWeighted(gamblingConfig.slots.results);
  const visual = buildSlotVisual(result);
  return { result, visual };
}

function calculatePayout(bet, multiplier) {
  return Math.floor(bet * multiplier);
}

module.exports = {
  rollCoinflip,
  rollCoinflipWithChoice,
  rollSlots,
  calculatePayout,
  faceLabel
};
