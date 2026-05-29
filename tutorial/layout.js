export const TUTORIAL_OVERLAY_COLOR = "rgba(0, 0, 0, 0.52)";
export const TUTORIAL_HIGHLIGHT_PADDING = 8;
export const TUTORIAL_HIGHLIGHT_RADIUS = 12;

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
