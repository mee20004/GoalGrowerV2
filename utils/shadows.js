/**
 * Cross-platform shadows via React Native boxShadow (New Architecture).
 *
 * Rules:
 * - Apply shadow on a View that has backgroundColor (or wrap with ShadowSurface).
 * - Do not combine overflow: 'hidden' and shadow on the same View.
 * - Prefer cpShadow / presets over inline shadowColor + elevation.
 * - 3D pressable buttons can keep the offset-View pattern (GoalActionButton).
 * - offset follows iOS shadowOffset: positive height = shadow below the view.
 * - Do not combine cpShadow with legacy shadow* props or elevation on the same View.
 */

function expandHex(hex) {
  if (hex.length === 3) {
    return hex
      .split('')
      .map((char) => char + char)
      .join('');
  }
  return hex;
}

export function toRgba(color = '#000', opacity = 1) {
  if (!color || typeof color !== 'string') {
    return `rgba(0, 0, 0, ${opacity})`;
  }

  const trimmed = color.trim();

  if (trimmed.startsWith('rgba(') || trimmed.startsWith('rgb(')) {
    return trimmed;
  }

  if (trimmed.startsWith('#')) {
    let hex = expandHex(trimmed.slice(1));

    if (hex.length === 8) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      const a = parseInt(hex.slice(6, 8), 16) / 255;
      return `rgba(${r}, ${g}, ${b}, ${a})`;
    }

    if (hex.length === 6) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      return `rgba(${r}, ${g}, ${b}, ${opacity})`;
    }
  }

  return trimmed;
}

export function cpShadow({
  color = '#000',
  offset = { width: 0, height: 2 },
  opacity = 0.2,
  radius = 4,
  spread = 0,
  inset = false,
} = {}) {
  const offsetX = offset?.width ?? 0;
  const offsetY = offset?.height ?? 0;

  return {
    boxShadow: [
      {
        offsetX,
        offsetY,
        blurRadius: radius,
        spreadDistance: spread,
        color: toRgba(color, opacity),
        inset,
      },
    ],
  };
}

export function cpShadowLegacy({
  color = '#000',
  offset = { width: 0, height: 2 },
  opacity = 0.2,
  radius = 4,
  elevation = 3,
} = {}) {
  return {
    shadowColor: color,
    shadowOffset: offset,
    shadowOpacity: opacity,
    shadowRadius: radius,
    elevation,
  };
}

export const cardShadow = cpShadow({
  color: '#4c6782',
  offset: { width: 0, height: 6 },
  opacity: 0.16,
  radius: 0,
});

export const headerShadow = cardShadow;

export const panelShadow = cpShadow({
  color: '#000000',
  offset: { width: 0, height: 6 },
  opacity: 0.16,
  radius: 0,
});

export const hardDropShadow = cpShadow({
  color: '#cdcdcd',
  offset: { width: 0, height: 6 },
  opacity: 1,
  radius: 0,
});

export const hardDropShadowSm = cpShadow({
  color: '#cdcdcd',
  offset: { width: 0, height: 5 },
  opacity: 1,
  radius: 0,
});

export const subtleBorderShadow = cpShadow({
  color: '#c3cfdb',
  offset: { width: 0, height: 4 },
  opacity: 1,
  radius: 0,
});

export const softCardShadow = cpShadow({
  color: '#000',
  offset: { width: 0, height: 5 },
  opacity: 0.14,
  radius: 14,
});

export const accentButtonShadow = cpShadow({
  color: '#2d6b1f',
  offset: { width: 0, height: 4 },
  opacity: 0.28,
  radius: 8,
});
