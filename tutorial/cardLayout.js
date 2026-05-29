import { isValidRect } from "./layout";

export const CARD_MAX_WIDTH = 360;
export const CARD_MIN_WIDTH = 280;
export const CARD_SCREEN_MARGIN = 16;
export const CARD_TARGET_GAP = 16;
export const ARROW_SIZE = 12;
export const TAB_BAR_CLEARANCE = 100;
export const TUTORIAL_PROGRESS_CLEARANCE = 48;
export const LARGE_TARGET_HEIGHT_RATIO = 0.42;

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

function cardRect(left, top, width, height) {
  return { x: left, y: top, width, height };
}

function rectsOverlap(a, b, gap = 0) {
  if (!a || !b) return false;
  return !(
    a.x + a.width + gap <= b.x ||
    b.x + b.width + gap <= a.x ||
    a.y + a.height + gap <= b.y ||
    b.y + b.height + gap <= a.y
  );
}

function buildCandidate(targetRect, cardWidth, cardHeight, placement) {
  const targetCenterX = targetRect.x + targetRect.width / 2;
  const targetCenterY = targetRect.y + targetRect.height / 2;

  switch (placement) {
    case "above":
      return {
        placement,
        arrow: "bottom",
        left: targetCenterX - cardWidth / 2,
        top: targetRect.y - cardHeight - CARD_TARGET_GAP - ARROW_SIZE,
      };
    case "left":
      return {
        placement,
        arrow: "right",
        left: targetRect.x - cardWidth - CARD_TARGET_GAP - ARROW_SIZE,
        top: targetCenterY - cardHeight / 2,
      };
    case "right":
      return {
        placement,
        arrow: "left",
        left: targetRect.x + targetRect.width + CARD_TARGET_GAP + ARROW_SIZE,
        top: targetCenterY - cardHeight / 2,
      };
    case "below":
    default:
      return {
        placement,
        arrow: "top",
        left: targetCenterX - cardWidth / 2,
        top: targetRect.y + targetRect.height + CARD_TARGET_GAP + ARROW_SIZE,
      };
  }
}

function getPlacementOrder(targetRect, screenWidth, screenHeight) {
  const centerX = targetRect.x + targetRect.width / 2;
  const centerY = targetRect.y + targetRect.height / 2;
  const nearBottom = centerY > screenHeight * 0.52;
  const nearTop = centerY < screenHeight * 0.4;
  const nearRight = centerX > screenWidth * 0.55;
  const nearLeft = centerX < screenWidth * 0.45;

  if (nearBottom && nearRight) {
    return ["above", "left", "below", "right"];
  }
  if (nearBottom && nearLeft) {
    return ["above", "right", "below", "left"];
  }
  if (nearBottom) {
    return ["above", "left", "right", "below"];
  }
  if (nearTop && nearRight) {
    return ["below", "left", "above", "right"];
  }
  if (nearTop) {
    return ["below", "left", "right", "above"];
  }
  if (nearRight) {
    return ["left", "above", "below", "right"];
  }
  if (nearLeft) {
    return ["right", "above", "below", "left"];
  }
  return ["below", "above", "left", "right"];
}

function resolveCandidate(candidate, targetRect, cardWidth, cardHeight, bounds) {
  const left = clamp(candidate.left, bounds.minLeft, bounds.maxRight - cardWidth);
  const top = clamp(candidate.top, bounds.minTop, bounds.maxBottom - cardHeight);
  const resolved = cardRect(left, top, cardWidth, cardHeight);

  if (!fitsOnScreen(left, top, cardWidth, cardHeight, bounds)) {
    return null;
  }
  if (rectsOverlap(resolved, targetRect, CARD_TARGET_GAP)) {
    return null;
  }

  return {
    left,
    top,
    arrow: candidate.arrow,
    width: cardWidth,
  };
}

export function computeTopDockedCardLayout({
  screenWidth,
  cardWidth,
  cardHeight,
  safeInsets = { top: 0, bottom: 0, left: 0, right: 0 },
}) {
  const width = Math.min(
    Math.max(cardWidth, CARD_MIN_WIDTH),
    CARD_MAX_WIDTH,
    screenWidth - CARD_SCREEN_MARGIN * 2
  );
  const height = cardHeight;
  const minLeft = CARD_SCREEN_MARGIN + safeInsets.left;
  const maxRight = screenWidth - CARD_SCREEN_MARGIN - safeInsets.right;

  return {
    left: clamp((screenWidth - width) / 2, minLeft, maxRight - width),
    top: safeInsets.top + TUTORIAL_PROGRESS_CLEARANCE,
    arrow: null,
    width,
  };
}

function isLargeTarget(targetRect, screenHeight) {
  return (
    isValidRect(targetRect) &&
    targetRect.height >= screenHeight * LARGE_TARGET_HEIGHT_RATIO
  );
}

export function shouldDockCardToTop({
  cardPlacement = null,
  targetRect = null,
  screenHeight = 0,
}) {
  if (cardPlacement === "top") return true;
  return isLargeTarget(targetRect, screenHeight);
}

export function computeTutorialCardLayout({
  screenWidth,
  screenHeight,
  cardWidth,
  cardHeight,
  targetRect = null,
  centered = false,
  cardPlacement = null,
  anchorPlacement = null,
  safeInsets = { top: 0, bottom: 0, left: 0, right: 0 },
}) {
  const width = Math.min(
    Math.max(cardWidth, CARD_MIN_WIDTH),
    CARD_MAX_WIDTH,
    screenWidth - CARD_SCREEN_MARGIN * 2
  );
  const height = cardHeight;

  if (
    shouldDockCardToTop({
      cardPlacement,
      targetRect,
      screenHeight,
    })
  ) {
    return computeTopDockedCardLayout({
      screenWidth,
      cardWidth: width,
      cardHeight: height,
      safeInsets,
    });
  }

  const bounds = {
    minLeft: CARD_SCREEN_MARGIN + safeInsets.left,
    minTop: CARD_SCREEN_MARGIN + safeInsets.top,
    maxRight: screenWidth - CARD_SCREEN_MARGIN - safeInsets.right,
    maxBottom:
      screenHeight -
      CARD_SCREEN_MARGIN -
      safeInsets.bottom -
      TAB_BAR_CLEARANCE,
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

  const defaultPlacements = getPlacementOrder(targetRect, screenWidth, screenHeight);
  const placements = anchorPlacement
    ? [
        anchorPlacement,
        ...defaultPlacements.filter((placement) => placement !== anchorPlacement),
      ]
    : defaultPlacements;

  for (let i = 0; i < placements.length; i += 1) {
    const candidate = buildCandidate(targetRect, width, height, placements[i]);
    const resolved = resolveCandidate(candidate, targetRect, width, height, bounds);
    if (resolved) return resolved;
  }

  const aboveCandidate = buildCandidate(targetRect, width, height, "above");
  const aboveResolved = resolveCandidate(
    aboveCandidate,
    targetRect,
    width,
    height,
    bounds
  );
  if (aboveResolved) return aboveResolved;

  const fallbackTop = clamp(
    targetRect.y - height - CARD_TARGET_GAP - ARROW_SIZE,
    bounds.minTop,
    bounds.maxBottom - height
  );
  const fallbackLeft = clamp(
    targetRect.x + targetRect.width / 2 - width / 2,
    bounds.minLeft,
    bounds.maxRight - width
  );
  const fallbackRect = cardRect(fallbackLeft, fallbackTop, width, height);

  if (!rectsOverlap(fallbackRect, targetRect, CARD_TARGET_GAP)) {
    return {
      left: fallbackLeft,
      top: fallbackTop,
      arrow: "bottom",
      width,
    };
  }

  return {
    left: clamp(bounds.minLeft, bounds.minLeft, bounds.maxRight - width),
    top: clamp(bounds.minTop, bounds.minTop, bounds.maxBottom - height),
    arrow: null,
    width,
  };
}
