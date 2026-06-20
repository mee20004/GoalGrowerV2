const COIN_REWARDS = {
  STARTING_BALANCE: 100,
  GOAL_COMPLETION: 5,
  JOURNEY_GROWTH_GOAL: 25,
};

const IAP_COIN_GRANTS = {
  coins: 500,
};

const PRO_MONTHLY_COIN_GRANT = 200;

const JOURNEY_ACHIEVEMENT_COINS = {
  create_1: 50,
  create_5: 100,
  complete_10: 75,
  streak_7: 80,
  score_250: 150,
};

const DECOR_TYPES = {
  FARBG: "farbg",
  WINDOW: "window",
  WALL: "wall",
  SHELF: "shelf",
};

const DEFAULT_OWNED_PLANTS = {
  fern: true,
  cactus: true,
  succulent: false,
  tulip: false,
};

const DEFAULT_OWNED_POTS = {
  default: true,
  bronze: false,
  silver: true,
  gold: false,
  platinum: false,
};

const DEFAULT_OWNED_FARBG = {
  0: true,
  1: true,
  2: false,
  3: false,
  4: false,
  5: false,
};

const DEFAULT_OWNED_WINDOW_FRAMES = {
  0: true,
  1: true,
  2: false,
  3: false,
};

const DEFAULT_OWNED_WALL_BG = {
  0: true, 1: true, 2: false, 3: false, 4: false, 5: false, 6: false,
};

const DEFAULT_OWNED_SHELF_COLORS = Object.fromEntries(
  Array.from({ length: 20 }, (_, index) => [String(index), index <= 1])
);

const SHELF_SHOP_META = [
  { price: 0, starter: true },
  { price: 90 },
  { price: 140 },
  { price: 170 },
  { price: 190 },
  { price: 210 },
  { price: 230 },
  { price: 250 },
  { price: 270 },
  { price: 290 },
  { price: 310 },
  { price: 330 },
  { price: 350 },
  { price: 370 },
  { price: 390 },
  { price: 410 },
  { price: 430 },
  { price: 450 },
  { price: 470 },
  { price: 490 },
];

function buildShelfShopItems() {
  return SHELF_SHOP_META.map((meta, index) => ({
    id: `shelf_${index}`,
    type: DECOR_TYPES.SHELF,
    assetIndex: index,
    assetKey: String(index),
    price: meta.price ?? 90 + index * 30,
  }));
}

const SHOP_ITEMS = [
  { id: "plant_fern", type: "plant", assetKey: "fern", price: 0 },
  { id: "plant_cactus", type: "plant", assetKey: "cactus", price: 120 },
  { id: "plant_succulent", type: "plant", assetKey: "succulent", price: 180 },
  { id: "plant_tulip", type: "plant", assetKey: "tulip", price: 220 },
  { id: "pot_default", type: "pot", assetKey: "default", price: 0 },
  { id: "pot_bronze", type: "pot", assetKey: "bronze", price: 80 },
  { id: "pot_silver", type: "pot", assetKey: "silver", price: 150 },
  { id: "pot_gold", type: "pot", assetKey: "gold", price: 280 },
  { id: "pot_platinum", type: "pot", assetKey: "platinum", price: 450 },
  { id: "farbg_0", type: DECOR_TYPES.FARBG, assetIndex: 0, assetKey: "0", price: 0 },
  { id: "farbg_1", type: DECOR_TYPES.FARBG, assetIndex: 1, assetKey: "1", price: 150 },
  { id: "farbg_2", type: DECOR_TYPES.FARBG, assetIndex: 2, assetKey: "2", price: 180 },
  { id: "farbg_3", type: DECOR_TYPES.FARBG, assetIndex: 3, assetKey: "3", price: 200 },
  { id: "farbg_4", type: DECOR_TYPES.FARBG, assetIndex: 4, assetKey: "4", price: 220 },
  { id: "farbg_5", type: DECOR_TYPES.FARBG, assetIndex: 5, assetKey: "5", price: 260 },
  { id: "window_0", type: DECOR_TYPES.WINDOW, assetIndex: 0, assetKey: "0", price: 0 },
  { id: "window_1", type: DECOR_TYPES.WINDOW, assetIndex: 1, assetKey: "1", price: 100 },
  { id: "window_2", type: DECOR_TYPES.WINDOW, assetIndex: 2, assetKey: "2", price: 130 },
  { id: "window_3", type: DECOR_TYPES.WINDOW, assetIndex: 3, assetKey: "3", price: 170 },
  { id: "wall_0", type: DECOR_TYPES.WALL, assetIndex: 0, assetKey: "0", price: 0 },
  { id: "wall_1", type: DECOR_TYPES.WALL, assetIndex: 1, assetKey: "1", price: 120 },
  { id: "wall_2", type: DECOR_TYPES.WALL, assetIndex: 2, assetKey: "2", price: 150 },
  { id: "wall_3", type: DECOR_TYPES.WALL, assetIndex: 3, assetKey: "3", price: 180 },
  { id: "wall_4", type: DECOR_TYPES.WALL, assetIndex: 4, assetKey: "4", price: 200 },
  { id: "wall_5", type: DECOR_TYPES.WALL, assetIndex: 5, assetKey: "5", price: 220 },
  { id: "wall_6", type: DECOR_TYPES.WALL, assetIndex: 6, assetKey: "6", price: 240 },
  ...buildShelfShopItems(),
];

const QUEST_COIN_REWARDS = {
  daily_complete_1: 10,
  daily_complete_2: 15,
  daily_complete_3: 20,
  daily_complete_all: 25,
  daily_half_done: 12,
  daily_visit_garden: 10,
  daily_open_journey: 8,
  daily_streak_alive: 12,
  daily_create_goal: 15,
  daily_early_bird: 15,
  daily_goals_tab: 8,
  daily_app_streak_3: 18,
  daily_silver_hunter: 14,
  daily_completion_push: 16,
  daily_no_zeros: 10,
  weekly_5_goal_days: 40,
  weekly_10_goal_days: 60,
  weekly_garden_3: 35,
  weekly_streak_5: 45,
  weekly_create_goal: 30,
  milestone_create_1: 50,
  milestone_create_5: 100,
  milestone_complete_10: 75,
  milestone_streak_3: 40,
  milestone_streak_7: 80,
  milestone_score_100: 60,
  milestone_score_250: 150,
  quest_milestone_10: 50,
  quest_milestone_30: 100,
  quest_milestone_50: 150,
};

const CREDIT_SOURCES = {
  goal_completion: COIN_REWARDS.GOAL_COMPLETION,
  iap_coins: IAP_COIN_GRANTS.coins,
  pro_monthly: PRO_MONTHLY_COIN_GRANT,
};

function getShopItemById(itemId) {
  return SHOP_ITEMS.find((item) => item.id === itemId) || null;
}

function getOwnedDecorField(type) {
  switch (type) {
    case DECOR_TYPES.FARBG:
      return "ownedFarBg";
    case DECOR_TYPES.WINDOW:
      return "ownedWindowFrames";
    case DECOR_TYPES.WALL:
      return "ownedWallBg";
    case DECOR_TYPES.SHELF:
      return "ownedShelfColors";
    default:
      return null;
  }
}

function normalizeOwnedMap(map, defaults) {
  const normalized = { ...defaults, ...(map || {}) };
  Object.keys(defaults).forEach((key) => {
    const numericKey = Number(key);
    if (Number.isFinite(numericKey) && map?.[numericKey] !== undefined) {
      normalized[key] = map[numericKey];
    }
  });
  return normalized;
}

function resolveClaimAmount(claimKey) {
  if (!claimKey || typeof claimKey !== "string") return null;

  if (claimKey.startsWith("growth:")) {
    return COIN_REWARDS.JOURNEY_GROWTH_GOAL;
  }

  if (claimKey.startsWith("achievement:")) {
    const achievementId = claimKey.slice("achievement:".length);
    return JOURNEY_ACHIEVEMENT_COINS[achievementId] ?? null;
  }

  if (claimKey.startsWith("quest:")) {
    const parts = claimKey.split(":");
    const questId = parts[1];
    return QUEST_COIN_REWARDS[questId] ?? null;
  }

  return null;
}

function getDefaultShopPayload(existingData = {}) {
  return {
    coinBalance:
      typeof existingData.coinBalance === "number"
        ? existingData.coinBalance
        : COIN_REWARDS.STARTING_BALANCE,
    ownedPlants: normalizeOwnedMap(existingData.ownedPlants, DEFAULT_OWNED_PLANTS),
    ownedPots: normalizeOwnedMap(existingData.ownedPots, DEFAULT_OWNED_POTS),
    ownedFarBg: normalizeOwnedMap(existingData.ownedFarBg, DEFAULT_OWNED_FARBG),
    ownedWindowFrames: normalizeOwnedMap(existingData.ownedWindowFrames, DEFAULT_OWNED_WINDOW_FRAMES),
    ownedWallBg: normalizeOwnedMap(existingData.ownedWallBg, DEFAULT_OWNED_WALL_BG),
    ownedShelfColors: normalizeOwnedMap(existingData.ownedShelfColors, DEFAULT_OWNED_SHELF_COLORS),
    shopInitialized: true,
    shopInitializedAt: new Date(),
  };
}

function isShopItemOwned(data, item) {
  if (!data || !item) return false;
  const ownedKey = String(item.assetIndex ?? item.assetKey);

  if (item.type === "plant") {
    return !!normalizeOwnedMap(data.ownedPlants, DEFAULT_OWNED_PLANTS)[item.assetKey];
  }
  if (item.type === "pot") {
    return !!normalizeOwnedMap(data.ownedPots, DEFAULT_OWNED_POTS)[item.assetKey];
  }

  const field = getOwnedDecorField(item.type);
  if (!field) return false;
  const defaults = {
    ownedFarBg: DEFAULT_OWNED_FARBG,
    ownedWindowFrames: DEFAULT_OWNED_WINDOW_FRAMES,
    ownedWallBg: DEFAULT_OWNED_WALL_BG,
    ownedShelfColors: DEFAULT_OWNED_SHELF_COLORS,
  }[field];
  return !!normalizeOwnedMap(data[field], defaults)[ownedKey];
}

module.exports = {
  COIN_REWARDS,
  PRO_MONTHLY_COIN_GRANT,
  CREDIT_SOURCES,
  DEFAULT_OWNED_PLANTS,
  DEFAULT_OWNED_POTS,
  DEFAULT_OWNED_FARBG,
  DEFAULT_OWNED_WINDOW_FRAMES,
  DEFAULT_OWNED_WALL_BG,
  DEFAULT_OWNED_SHELF_COLORS,
  getShopItemById,
  getOwnedDecorField,
  normalizeOwnedMap,
  resolveClaimAmount,
  getDefaultShopPayload,
  isShopItemOwned,
};
