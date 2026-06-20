function validateBet(amount, min, max) {
  if (!Number.isInteger(amount) || amount <= 0) {
    return { ok: false, message: '請輸入有效的投入金額。' };
  }

  if (amount < min) {
    return { ok: false, message: `最低投入金額為 ${min.toLocaleString('en-US')} 金幣。` };
  }

  if (amount > max) {
    return { ok: false, message: `最高投入金額為 ${max.toLocaleString('en-US')} 金幣。` };
  }

  return { ok: true };
}

module.exports = {
  validateBet
};
