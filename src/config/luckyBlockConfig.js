module.exports = {
  minBet: 500,
  maxBet: 50000,
  minBoxes: 3,
  maxBoxes: 5,
  meaningfulGameMinSpend: 1000,
  boxes: {
    3: {
      label: '3 個方塊',
      winChanceLabel: '1 / 3',
      multiplier: 2.55,
      riskLabel: '標準風險'
    },
    4: {
      label: '4 個方塊',
      winChanceLabel: '1 / 4',
      multiplier: 3.40,
      riskLabel: '高風險'
    },
    5: {
      label: '5 個方塊',
      winChanceLabel: '1 / 5',
      multiplier: 4.20,
      riskLabel: '極高風險'
    }
  }
};
