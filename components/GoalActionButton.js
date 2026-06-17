import React from 'react';
import { View, StyleSheet, Text } from 'react-native';
import HapticPressable from './HapticPressable';
import { HapticType } from '../utils/haptics';

/**
 * GoalActionButton
 * A reusable 3D/pressable button for goal actions, matching the style/behavior from GoalScreen.
 * Props:
 * - onPress: function
 * - disabled: boolean
 * - children: node (button content)
 * - backgroundColor: string (button face color)
 * - shadowColor: string (button shadow color)
 * - style: object (optional extra styles)
 * - faceStyle: object (optional extra styles for face)
 */
export default function GoalActionButton({
  onPress,
  disabled,
  children,
  backgroundColor = '#0bd700',
  shadowColor = '#9aa3ad',
  style,
  faceStyle,
  borderRadius = 22,
  size = 58,
  haptic = HapticType.LIGHT,
  ...props
}) {
  return (
    <View style={[styles.buttonWrap, { width: size, height: size + 4 }, style]}>
      <View
        pointerEvents="none"
        style={[
          styles.buttonShadow,
          {
            borderRadius,
            backgroundColor: shadowColor,
            shadowColor,
            top: 8,
            left: 0,
            right: 0,
            bottom: -1,
          },
        ]}
      />
      <HapticPressable
        hitSlop={8}
        disabled={disabled}
        haptic={disabled ? false : haptic}
        onPress={onPress}
        style={({ pressed }) => [
          styles.buttonFace,
          {
            width: size,
            height: size,
            borderRadius,
            backgroundColor,
            transform: [{ translateY: pressed && !disabled ? 4 : 0 }],
            // Remove opacity change for disabled state; only color should indicate disabled
          },
          faceStyle,
        ]}
        {...props}
      >
        {children}
      </HapticPressable>
    </View>
  );
}

const styles = StyleSheet.create({
  buttonWrap: {
    marginLeft: 8,
    alignSelf: 'center',
    position: 'relative',
  },
  buttonShadow: {
    position: 'absolute',
    zIndex: 0,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 4,
  },
  buttonFace: {
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
});
