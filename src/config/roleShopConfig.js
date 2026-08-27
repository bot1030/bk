const ROLE_SHOP = {
  dailyBoostCapPercent: 30,
  fishingCooldownCapPercent: 25,
  luckCapPercent: 1.25,

  serverBoosterRole: {
    id: '1243185020219297822',
    name: 'Server Booster',
    emoji: '🚀',
    dailyBoostPercent: 15,
    purchasable: false
  },

  buffRoles: [
    {
      key: 'e_hunter',
      id: '1511908354455240844',
      name: 'E級獵人',
      emoji: '🗡️',
      price: 30000,
      dailyBoostPercent: 5,
      fishingCooldownPercent: 0,
      luckPercent: 0
    },
    {
      key: 'reincarnation_apprentice',
      id: '1511908410864697525',
      name: '輪迴見習者',
      emoji: '🔁',
      price: 75000,
      dailyBoostPercent: 8,
      fishingCooldownPercent: 5,
      luckPercent: 0
    },
    {
      key: 'special_grade_student',
      id: '1511908462639186062',
      name: '咒術特級生',
      emoji: '🌀',
      price: 150000,
      dailyBoostPercent: 0,
      fishingCooldownPercent: 10,
      luckPercent: 0.25
    },
    {
      key: 'millennium_mage',
      id: '1511908521107652770',
      name: '千年魔法使',
      emoji: '🧙',
      price: 300000,
      dailyBoostPercent: 10,
      fishingCooldownPercent: 8,
      luckPercent: 0.35
    },
    {
      key: 'shadow_ruler',
      id: '1511908570067763330',
      name: '影之支配者',
      emoji: '🌑',
      price: 600000,
      dailyBoostPercent: 20,
      fishingCooldownPercent: 0,
      luckPercent: 0.75
    },
    {
      key: 'divine_domain_monarch',
      id: '1511908623801127083',
      name: '神域君主',
      emoji: '👑',
      price: 1200000,
      dailyBoostPercent: 25,
      fishingCooldownPercent: 20,
      luckPercent: 1.25
    }
  ],

  specialRoles: [
    {
      key: 'phantom_thief',
      id: '1511908692973322432',
      name: '幻影怪盜',
      emoji: '🕵️',
      price: 300000,
      ability: '解鎖 /偷竊'
    }
  ],

  cosmeticRoles: [
    {
      key: 'rich_flex',
      id: '1511909271523299399',
      name: '老子就是有錢',
      emoji: '💸',
      price: 50000,
      benefit: '純炫耀稱號'
    },
    {
      key: 'big_boss',
      id: '1511909543712526336',
      name: '大老闆',
      emoji: '🏦',
      price: 100000,
      benefit: '高級炫耀稱號'
    }
  ],

  thief: {
    roleId: '1511908692973322432',
    roleName: '幻影怪盜',
    cooldownMs: 24 * 60 * 60 * 1000,
    victimProtectionMs: 24 * 60 * 60 * 1000,
    failPenaltyCoins: 1000,
    maxStealCoins: 25000,
    protectedUserIds: [
      '473647287026057227',
      '786683877107302461',
      '1319968425698922591',
  '1535635248157827102',
      '979514745109479444',
      '1411064622794018866',
      '576599013671960576',
      '1114820292099969053',
  '1233249447782256650'
    ],
    tiers: [
      { maxCoins: 49999, minPercent: 1, maxPercent: 5, successChancePercent: 60 },
      { maxCoins: 299999, minPercent: 1, maxPercent: 4, successChancePercent: 45 },
      { maxCoins: 1499999, minPercent: 0.75, maxPercent: 3, successChancePercent: 30 },
      { maxCoins: Infinity, minPercent: 0.5, maxPercent: 2, successChancePercent: 18 }
    ]
  }
};

function getAllPurchasableRoles() {
  return [
    ...ROLE_SHOP.buffRoles.map(role => ({ ...role, category: 'buff' })),
    ...ROLE_SHOP.specialRoles.map(role => ({ ...role, category: 'special' })),
    ...ROLE_SHOP.cosmeticRoles.map(role => ({ ...role, category: 'cosmetic' }))
  ];
}

function getPurchasableRoleByKey(key) {
  return getAllPurchasableRoles().find(role => role.key === key) || null;
}

module.exports = {
  ROLE_SHOP,
  getAllPurchasableRoles,
  getPurchasableRoleByKey
};
