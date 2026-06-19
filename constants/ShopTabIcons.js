import { SHOP_CATEGORIES } from "./ShopCatalog";

export const SHOP_TAB_ICONS = {
  [SHOP_CATEGORIES.PLANTS]: require("../assets/Icons/ShopIcons/plant_icon.png"),
  [SHOP_CATEGORIES.POTS]: require("../assets/Icons/ShopIcons/pot_icon.png"),
  [SHOP_CATEGORIES.BACKGROUNDS]: require("../assets/Icons/ShopIcons/background_icon.png"),
  [SHOP_CATEGORIES.WINDOWS]: require("../assets/Icons/ShopIcons/window_icon.png"),
  [SHOP_CATEGORIES.WALLS]: require("../assets/Icons/ShopIcons/walls_icon.png"),
  [SHOP_CATEGORIES.SHELVES]: require("../assets/Icons/ShopIcons/shelf_icon.png"),
};

export const SHOP_CATALOG_TABS = [
  { key: SHOP_CATEGORIES.PLANTS, label: "Plants" },
  { key: SHOP_CATEGORIES.POTS, label: "Pots" },
  { key: SHOP_CATEGORIES.BACKGROUNDS, label: "Backgrounds" },
  { key: SHOP_CATEGORIES.WINDOWS, label: "Windows" },
  { key: SHOP_CATEGORIES.WALLS, label: "Walls" },
  { key: SHOP_CATEGORIES.SHELVES, label: "Shelves" },
];
