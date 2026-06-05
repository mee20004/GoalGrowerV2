import { Platform } from 'react-native';

// Returns a cross-platform shadow style. Keep existing iOS shadow props
// and ensure Android gets an appropriate `elevation` value.
export function cpShadow({ color = '#000', offset = { width: 0, height: 2 }, opacity = 0.2, radius = 4, elevation = 3 } = {}) {
  // On Android, `elevation` is required. Newer RN versions also accept
  // shadowColor/offset/opacity/radius, so return those as well to allow
  // tinting and finer control where supported.
  const base = {
    shadowColor: color,
    shadowOffset: offset,
    shadowOpacity: opacity,
    shadowRadius: radius,
    elevation,
  };

  if (Platform.OS === 'android') {
    return base;
  }

  return base;
}
