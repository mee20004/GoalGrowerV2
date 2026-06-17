import React, { useCallback } from "react";
import { Pressable } from "react-native";
import { HapticType, triggerHaptic } from "../utils/haptics";

/**
 * Drop-in Pressable that fires haptic feedback on press-in by default.
 * Pass haptic={false} to opt out, or haptic={HapticType.MEDIUM} for stronger feedback.
 */
export default function HapticPressable({
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
    <Pressable
      onPressIn={handlePressIn}
      onPress={onPress}
      disabled={disabled}
      {...props}
    >
      {children}
    </Pressable>
  );
}
