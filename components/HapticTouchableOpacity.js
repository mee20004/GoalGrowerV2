import React, { useCallback } from "react";
import { TouchableOpacity } from "react-native";
import { HapticType, triggerHaptic } from "../utils/haptics";

/**
 * Drop-in TouchableOpacity that fires haptic feedback on press-in by default.
 */
export default function HapticTouchableOpacity({
  onPressIn,
  onPress,
  disabled,
  haptic = HapticType.SELECTION,
  children,
  ...props
}) {
  const handlePressIn = useCallback((event) => {
    if (!disabled && haptic) {
      triggerHaptic(haptic);
    }
    onPressIn?.(event);
  }, [disabled, haptic, onPressIn]);

  return (
    <TouchableOpacity
      onPressIn={handlePressIn}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={props.activeOpacity ?? 0.7}
      {...props}
    >
      {children}
    </TouchableOpacity>
  );
}
