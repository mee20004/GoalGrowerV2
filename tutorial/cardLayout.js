import { isValidRect } from "./layout";

export const CARD_MAX_WIDTH = 360;
export const CARD_MIN_WIDTH = 280;
export const CARD_SCREEN_MARGIN = 16;
export const CARD_TARGET_GAP = 12;
export const ARROW_SIZE = 12;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function fitsOnScreen(left, top, width, height, bounds) {
  return (
    left >= bounds.minLeft &&
    top >= bounds.minTop &&
    left + width <= bounds.maxRight &&
    top + height <= bounds.maxBottom
  );
}

export function computeTutorialCardLayout({
  screenWidth,
  screenHeight,
  cardWidth,
  cardHeight,
  targetRect = null,
  centered = false,
  safeInsets = { top: 0, bottom: 0, left: 0, right: 0 },
}) {
  const width = Math.min(
    Math.max(cardWidth, CARD_MIN_WIDTH),
    CARD_MAX_WIDTH,
    screenWidth - CARD_SCREEN_MARGIN * 2
  );
  const height = cardHeight;

  const bounds = {
    minLeft: CARD_SCREEN_MARGIN + safeInsets.left,
    minTop: CARD_SCREEN_MARGIN + safeInsets.top,
    maxRight: screenWidth - CARD_SCREEN_MARGIN - safeInsets.right,
    maxBottom: screenHeight - CARD_SCREEN_MARGIN - safeInsets.bottom,
  };

  const centerPosition = () => ({
    left: clamp(
      (screenWidth - width) / 2,
      bounds.minLeft,
      bounds.maxRight - width
    ),
    top: clamp(
      (screenHeight - height) / 2,
      bounds.minTop,
      bounds.maxBottom - height
    ),
    arrow: null,
    width,
  });

  if (centered || !isValidRect(targetRect)) {
    return centerPosition();
  }

  const targetCenterX = targetRect.x + targetRect.width / 2;
  const targetCenterY = targetRect.y + targetRect.height / 2;

  const candidates = [
    {
      arrow: "top",
      left: targetCenterX - width / 2,
      top: targetRect.y + targetRect.height + CARD_TARGET_GAP + ARROW_SIZE,
    },
    {
      arrow: "bottom",
      left: targetCenterX - width / 2,
      top: targetRect.y - height - CARD_TARGET_GAP - ARROW_SIZE,
    },
    {
      arrow: "left",
      left: targetRect.x + targetRect.width + CARD_TARGET_GAP + ARROW_SIZE,
      top: targetCenterY - height / 2,
    },
    {
      arrow: "right",
      left: targetRect.x - width - CARD_TARGET_GAP - ARROW_SIZE,
      top: targetCenterY - height / 2,
    },
  ];

  for (let i = 0; i < candidates.length; i += 1) {
    const candidate = candidates[i];
    const left = clamp(candidate.left, bounds.minLeft, bounds.maxRight - width);
    const top = clamp(candidate.top, bounds.minTop, bounds.maxBottom - height);
    if (fitsOnScreen(left, top, width, height, bounds)) {
      return { left, top, arrow: candidate.arrow, width };
    }
  }

  const fallback = candidates[0];
  return {
    left: clamp(fallback.left, bounds.minLeft, bounds.maxRight - width),
    top: clamp(fallback.top, bounds.minTop, bounds.maxBottom - height),
    arrow: fallback.arrow,
    width,
  };
}
