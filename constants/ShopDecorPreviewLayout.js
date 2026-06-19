import { DECOR_TYPES } from "./ShopCatalog";

/** Preview frame height in ShopItemCard — width follows the card column. */
export const SHOP_PREVIEW_FRAME_HEIGHT = 88;

/**
 * Shop decor preview layout — one config per decor type (not per item).
 *
 * width / height — image size (% of preview frame or px)
 * offsetX / offsetY — pan in px
 * left / top       — alias for offsetX / offsetY (px only)
 * scale            — multiplies resolved width/height
 * resizeMode       — React Native Image resizeMode
 */
export const SHOP_PREVIEW_TYPE_DEFAULTS = {
  [DECOR_TYPES.FARBG]: {
    width: "130%",
    height: "150%",
    offsetX: 0,
    offsetY: -0,
    resizeMode: "cover",
  },
  [DECOR_TYPES.WALL]: {
    width: "168%",
    height: "268%",
    offsetX: -14,
    offsetY: -25,
    resizeMode: "cover",
  },
  [DECOR_TYPES.WINDOW]: {
    width: 320,
    height: 320,
    offsetX: -110,
    offsetY: -140,
    resizeMode: "contain",
  },
  [DECOR_TYPES.SHELF]: {
    width: "100%",
    height: "100%",
    offsetX: 0,
    offsetY: 0,
  },
};

function readOffset(value, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function resolveAxisSize(value, axisSize) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.endsWith("%")) {
      const pct = Number.parseFloat(trimmed.slice(0, -1));
      if (Number.isFinite(pct)) {
        return (axisSize * pct) / 100;
      }
    }
  }

  return axisSize;
}

export function getShopDecorPreviewLayout(item) {
  if (!item?.type) return null;
  return SHOP_PREVIEW_TYPE_DEFAULTS[item.type] || null;
}

/** Resolve config to pixel styles once the preview clip rect has been measured. */
export function resolveDecorPreviewLayout(layout, stageSize) {
  if (!layout || !stageSize?.width || !stageSize?.height) {
    return null;
  }

  const { width: stageW, height: stageH } = stageSize;
  const scale = typeof layout.scale === "number" && layout.scale > 0 ? layout.scale : 1;
  const width = resolveAxisSize(layout.width ?? "100%", stageW) * scale;
  const height = resolveAxisSize(layout.height ?? "100%", stageH) * scale;

  return {
    width,
    height,
    left: readOffset(layout.offsetX, readOffset(layout.left)),
    top: readOffset(layout.offsetY, readOffset(layout.top)),
    resizeMode: layout.resizeMode ?? "cover",
  };
}
