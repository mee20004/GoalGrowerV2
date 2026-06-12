export const TUTORIAL_OVERLAY_COLOR = "rgba(0, 0, 0, 0.52)";
export const TUTORIAL_HIGHLIGHT_PADDING = 8;
export const TUTORIAL_HIGHLIGHT_RADIUS = 12;

export function getHighlightBorderRadius(rect) {
  if (!rect) return TUTORIAL_HIGHLIGHT_RADIUS;
  return Math.min(rect.width / 2, rect.height / 2);
}

export function buildHighlightCutoutPath(screenWidth, screenHeight, rect) {
  if (!rect) return "";
  const r = getHighlightBorderRadius(rect);
  const { x, y, width: w, height: h } = rect;

  return [
    `M 0 0 H ${screenWidth} V ${screenHeight} H 0 Z`,
    `M ${x + r} ${y}`,
    `H ${x + w - r}`,
    `A ${r} ${r} 0 0 1 ${x + w} ${y + r}`,
    `V ${y + h - r}`,
    `A ${r} ${r} 0 0 1 ${x + w - r} ${y + h}`,
    `H ${x + r}`,
    `A ${r} ${r} 0 0 1 ${x} ${y + h - r}`,
    `V ${y + r}`,
    `A ${r} ${r} 0 0 1 ${x + r} ${y}`,
    "Z",
  ].join(" ");
}

export function expandRect(rect, padding = TUTORIAL_HIGHLIGHT_PADDING) {
  if (!rect) return null;
  return {
    x: rect.x - padding,
    y: rect.y - padding,
    width: rect.width + padding * 2,
    height: rect.height + padding * 2,
  };
}

export function isValidRect(rect) {
  return Boolean(rect && rect.width > 0 && rect.height > 0);
}

export function rectsEqual(a, b) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return (
    a.x === b.x &&
    a.y === b.y &&
    a.width === b.width &&
    a.height === b.height
  );
}
