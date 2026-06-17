import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

export const HapticType = {
  SELECTION: "selection",
  LIGHT: "light",
  MEDIUM: "medium",
  HEAVY: "heavy",
  SUCCESS: "success",
  WARNING: "warning",
  ERROR: "error",
};

async function runHaptic(type = HapticType.SELECTION) {
  if (Platform.OS === "web") return;

  try {
    switch (type) {
      case HapticType.LIGHT:
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        break;
      case HapticType.MEDIUM:
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        break;
      case HapticType.HEAVY:
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        break;
      case HapticType.SUCCESS:
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        break;
      case HapticType.WARNING:
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        break;
      case HapticType.ERROR:
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        break;
      case HapticType.SELECTION:
      default:
        await Haptics.selectionAsync();
        break;
    }
  } catch {
    // Haptics are best-effort; never block UI.
  }
}

/** Standard tap — tabs, toggles, list rows, chips */
export function triggerSelectionHaptic() {
  runHaptic(HapticType.SELECTION);
}

/** Buttons, cards, primary actions */
export function triggerLightHaptic() {
  runHaptic(HapticType.LIGHT);
}

/** Claim, complete, meaningful confirmations */
export function triggerMediumHaptic() {
  runHaptic(HapticType.MEDIUM);
}

/** Destructive or high-stakes actions */
export function triggerHeavyHaptic() {
  runHaptic(HapticType.HEAVY);
}

export function triggerSuccessHaptic() {
  runHaptic(HapticType.SUCCESS);
}

export function triggerHaptic(type = HapticType.SELECTION) {
  runHaptic(type);
}

/** Wrap any handler to fire selection haptic first (e.g. Switch, Picker). */
export function withSelectionHaptic(handler) {
  return (...args) => {
    triggerSelectionHaptic();
    return handler?.(...args);
  };
}
