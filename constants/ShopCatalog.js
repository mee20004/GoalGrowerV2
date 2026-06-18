import { PLANT_ASSETS } from "./PlantAssets";
import { POT_ASSETS } from "./PotAssets";
import { FAR_BG_ASSETS } from "./FarBGAssets";
import { WALLPAPER_ASSETS } from "./WallpaperAssets";
import { FRAME_ASSETS } from "./FrameAssets";
import { SHELF_COLOR_SCHEMES } from "./ShelfColors";

export const SHOP_CATEGORIES = {
  PLANTS: "plants",
  POTS: "pots",
  BACKGROUNDS: "backgrounds",
  WINDOWS: "windows",
  WALLS: "walls",
  SHELVES: "shelves",
  COINS: "coins",
};

export const DECOR_TYPES = {
  FARBG: "farbg",
  WINDOW: "window",
  WALL: "wall",
  SHELF: "shelf",
};

export const COIN_REWARDS = {
  STARTING_BALANCE: 100,
  GOAL_COMPLETION: 5,
  JOURNEY_GROWTH_GOAL: 25,
};

export const JOURNEY_ACHIEVEMENT_COINS = {
  create_1: 50,
  create_5: 100,
  complete_10: 75,
  streak_7: 80,
  score_250: 150,
};

/** Coins granted after a successful RevenueCat coin-pack purchase (by store product id). */
export const IAP_COIN_GRANTS = {
  coins: 500,
};

const SHELF_SHOP_META = [
  { description: "The original garden shelf style.", price: 0, starter: true },
  { description: "Light and airy shelf tones.", price: 90 },
  { description: "Rich dark wood for cozy gardens.", price: 140 },
  { description: "Warm honey-brown oak finish.", price: 170 },
  { description: "Golden maple with a sunny glow.", price: 190 },
  { description: "Deep reddish cherry wood.", price: 210 },
  { description: "Bold mahogany for a luxe look.", price: 230 },
  { description: "Natural pine with soft green undertones.", price: 250 },
  { description: "Golden teak with tropical warmth.", price: 270 },
  { description: "Deep espresso for a modern edge.", price: 290 },
  { description: "Rustic cedar with warm red tones.", price: 310 },
  { description: "Cool ash gray wood grain.", price: 330 },
  { description: "Plum-toned rosewood finish.", price: 350 },
  { description: "Weathered driftwood gray.", price: 370 },
  { description: "Soft sage green painted shelf.", price: 390 },
  { description: "Deep navy blue painted shelf.", price: 410 },
  { description: "Soft blush pink painted shelf.", price: 430 },
  { description: "Fresh mint green painted shelf.", price: 450 },
  { description: "Calm lavender painted shelf.", price: 470 },
  { description: "Sleek charcoal painted shelf.", price: 490 },
];

function buildShelfShopItems() {
  return SHELF_COLOR_SCHEMES.map((scheme, index) => {
    const meta = SHELF_SHOP_META[index] || {};
    const woodSuffix = index <= 12 ? " Wood" : "";
    return {
      id: `shelf_${index}`,
      category: SHOP_CATEGORIES.SHELVES,
      type: DECOR_TYPES.SHELF,
      assetIndex: index,
      assetKey: String(index),
      name: `${scheme.name}${woodSuffix}`,
      description: meta.description || `${scheme.name} shelf finish for your garden.`,
      price: meta.price ?? 90 + index * 30,
      ...(meta.starter ? { starter: true } : {}),
    };
  });
}

export const SHOP_ITEMS = [
  {
    id: "plant_fern",
    category: SHOP_CATEGORIES.PLANTS,
    type: "plant",
    assetKey: "fern",
    name: "Fern",
    description: "Soft leafy fronds for steady growers.",
    price: 0,
    starter: true,
  },
  {
    id: "plant_cactus",
    category: SHOP_CATEGORIES.PLANTS,
    type: "plant",
    assetKey: "cactus",
    name: "Cactus",
    description: "Low-maintenance desert vibes.",
    price: 120,
  },
  {
    id: "plant_succulent",
    category: SHOP_CATEGORIES.PLANTS,
    type: "plant",
    assetKey: "succulent",
    name: "Succulent",
    description: "Compact and cheerful on any shelf.",
    price: 180,
  },
  {
    id: "plant_tulip",
    category: SHOP_CATEGORIES.PLANTS,
    type: "plant",
    assetKey: "tulip",
    name: "Tulip",
    description: "Bright blooms for goals in full swing.",
    price: 220,
  },
  {
    id: "pot_default",
    category: SHOP_CATEGORIES.POTS,
    type: "pot",
    assetKey: "default",
    name: "Classic Pot",
    description: "The timeless starter planter.",
    price: 0,
    starter: true,
  },
  {
    id: "pot_bronze",
    category: SHOP_CATEGORIES.POTS,
    type: "pot",
    assetKey: "bronze",
    name: "Bronze Pot",
    description: "Warm metallic finish.",
    price: 80,
  },
  {
    id: "pot_silver",
    category: SHOP_CATEGORIES.POTS,
    type: "pot",
    assetKey: "silver",
    name: "Silver Pot",
    description: "Cool shine for tidy gardens.",
    price: 150,
  },
  {
    id: "pot_gold",
    category: SHOP_CATEGORIES.POTS,
    type: "pot",
    assetKey: "gold",
    name: "Gold Pot",
    description: "A little luxury for your goals.",
    price: 280,
  },
  {
    id: "pot_platinum",
    category: SHOP_CATEGORIES.POTS,
    type: "pot",
    assetKey: "platinum",
    name: "Platinum Pot",
    description: "The crown jewel of your garden.",
    price: 450,
  },
  {
    id: "farbg_0",
    category: SHOP_CATEGORIES.BACKGROUNDS,
    type: DECOR_TYPES.FARBG,
    assetIndex: 0,
    assetKey: "0",
    name: "Mountain View",
    description: "Peaceful peaks beyond your garden.",
    price: 0,
    starter: true,
  },
  {
    id: "farbg_1",
    category: SHOP_CATEGORIES.BACKGROUNDS,
    type: DECOR_TYPES.FARBG,
    assetIndex: 1,
    assetKey: "1",
    name: "Beach Horizon",
    description: "Sunny shores for a brighter room.",
    price: 150,
  },
  {
    id: "farbg_2",
    category: SHOP_CATEGORIES.BACKGROUNDS,
    type: DECOR_TYPES.FARBG,
    assetIndex: 2,
    assetKey: "2",
    name: "Countryside",
    description: "Rolling hills and a cozy cottage path.",
    price: 180,
  },
  {
    id: "farbg_3",
    category: SHOP_CATEGORIES.BACKGROUNDS,
    type: DECOR_TYPES.FARBG,
    assetIndex: 3,
    assetKey: "3",
    name: "Desert Dunes",
    description: "Warm sands and open sky beyond the window.",
    price: 200,
  },
  {
    id: "farbg_4",
    category: SHOP_CATEGORIES.BACKGROUNDS,
    type: DECOR_TYPES.FARBG,
    assetIndex: 4,
    assetKey: "4",
    name: "River Valley",
    description: "A peaceful river winding through the hills.",
    price: 220,
  },
  {
    id: "farbg_5",
    category: SHOP_CATEGORIES.BACKGROUNDS,
    type: DECOR_TYPES.FARBG,
    assetIndex: 5,
    assetKey: "5",
    name: "Lighthouse Coast",
    description: "Seaside cliffs with a guiding lighthouse.",
    price: 260,
  },
  {
    id: "window_0",
    category: SHOP_CATEGORIES.WINDOWS,
    type: DECOR_TYPES.WINDOW,
    assetIndex: 0,
    assetKey: "0",
    name: "White Frame",
    description: "Clean and bright window trim.",
    price: 0,
    starter: true,
  },
  {
    id: "window_1",
    category: SHOP_CATEGORIES.WINDOWS,
    type: DECOR_TYPES.WINDOW,
    assetIndex: 1,
    assetKey: "1",
    name: "Black Frame",
    description: "Bold contrast for modern gardens.",
    price: 100,
  },
  {
    id: "window_2",
    category: SHOP_CATEGORIES.WINDOWS,
    type: DECOR_TYPES.WINDOW,
    assetIndex: 2,
    assetKey: "2",
    name: "Vintage Bar",
    description: "Classic lattice trim with old-world charm.",
    price: 130,
  },
  {
    id: "window_3",
    category: SHOP_CATEGORIES.WINDOWS,
    type: DECOR_TYPES.WINDOW,
    assetIndex: 3,
    assetKey: "3",
    name: "Wood Blinds",
    description: "Cozy wooden slats for a softer look.",
    price: 170,
  },
  {
    id: "wall_0",
    category: SHOP_CATEGORIES.WALLS,
    type: DECOR_TYPES.WALL,
    assetIndex: 0,
    assetKey: "0",
    name: "Warm Tan",
    description: "Soft golden wallpaper.",
    price: 0,
    starter: true,
  },
  {
    id: "wall_1",
    category: SHOP_CATEGORIES.WALLS,
    type: DECOR_TYPES.WALL,
    assetIndex: 1,
    assetKey: "1",
    name: "Sky Blue",
    description: "Cool and calming wall color.",
    price: 120,
  },
  {
    id: "wall_2",
    category: SHOP_CATEGORIES.WALLS,
    type: DECOR_TYPES.WALL,
    assetIndex: 2,
    assetKey: "2",
    name: "Floral Bloom",
    description: "Soft petals scattered on cream wallpaper.",
    price: 150,
  },
  {
    id: "wall_3",
    category: SHOP_CATEGORIES.WALLS,
    type: DECOR_TYPES.WALL,
    assetIndex: 3,
    assetKey: "3",
    name: "Meadow Grass",
    description: "Gentle green waves with leafy accents.",
    price: 180,
  },
  ...buildShelfShopItems(),
];

export const DEFAULT_OWNED_PLANTS = {
  fern: true,
  cactus: false,
  succulent: false,
  tulip: false,
};

export const DEFAULT_OWNED_POTS = {
  default: true,
  bronze: false,
  silver: false,
  gold: false,
  platinum: false,
};

export const DEFAULT_OWNED_FARBG = {
  0: true,
  1: false,
  2: false,
  3: false,
  4: false,
  5: false,
};

export const DEFAULT_OWNED_WINDOW_FRAMES = {
  0: true,
  1: false,
  2: false,
  3: false,
};

export const DEFAULT_OWNED_WALL_BG = {
  0: true,
  1: false,
  2: false,
  3: false,
};

export const DEFAULT_OWNED_SHELF_COLORS = Object.fromEntries(
  SHELF_COLOR_SCHEMES.map((_, index) => [String(index), index === 0])
);

function parseDecorIndex(assetKey) {
  const index = Number(assetKey);
  return Number.isFinite(index) ? index : 0;
}

export function getPlantPreview(species) {
  return (
    PLANT_ASSETS?.[species]?.stage3?.alive ||
    PLANT_ASSETS?.[species]?.stage2?.alive ||
    PLANT_ASSETS?.[species]?.stage1?.alive ||
    null
  );
}

export function getPotPreview(potKey) {
  return POT_ASSETS?.[potKey] || POT_ASSETS.default;
}

export function getFarBgPreview(index) {
  return FAR_BG_ASSETS[index] ?? FAR_BG_ASSETS[0];
}

export function getWindowPreview(index) {
  return FRAME_ASSETS[index] ?? FRAME_ASSETS[0];
}

export function getWallPreview(index) {
  return WALLPAPER_ASSETS[index] ?? WALLPAPER_ASSETS[0];
}

export function getShelfPreview(index) {
  return SHELF_COLOR_SCHEMES[index] ?? SHELF_COLOR_SCHEMES[0];
}

export function getDecorPreview(item) {
  if (!item) return null;
  const index = item.assetIndex ?? parseDecorIndex(item.assetKey);

  switch (item.type) {
    case DECOR_TYPES.FARBG:
      return { kind: "image", source: getFarBgPreview(index), imageStyle: "cover" };
    case DECOR_TYPES.WINDOW:
      return { kind: "image", source: getWindowPreview(index), imageStyle: "contain" };
    case DECOR_TYPES.WALL:
      return { kind: "image", source: getWallPreview(index), imageStyle: "cover" };
    case DECOR_TYPES.SHELF:
      return { kind: "shelf", color: getShelfPreview(index)?.ledgeBg ?? "#FA6424" };
    default:
      return null;
  }
}

export function getShopItemsByCategory(category) {
  return SHOP_ITEMS.filter((item) => item.category === category);
}

export function getShopItemById(itemId) {
  return SHOP_ITEMS.find((item) => item.id === itemId) || null;
}

export function getOwnedDecorField(type) {
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
