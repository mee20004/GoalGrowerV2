import React from 'react';
import { View, StyleSheet } from 'react-native';
import HapticPressable from './HapticPressable';
import { HapticType } from '../utils/haptics';

const PRESS_DEPTH = 4;

function resolveDimension(...candidates) {
  for (const value of candidates) {
    if (typeof value === 'number' && value > 0) {
      return value;
    }
  }
  return undefined;
}

/**
 * GoalActionButton
 * A reusable 3D/pressable button for goal actions, matching the style/behavior from GoalScreen.
 * Props:
 * - onPress: function
 * - disabled: boolean
 * - locked: boolean (static claimed pill — solid colors, no Pressable/opacity)
 * - children: node (button content)
 * - backgroundColor: string (button face color)
 * - shadowColor: string (button shadow color)
 * - style: object (optional extra styles)
 * - faceStyle: object (optional extra styles for face)
 */
export default function GoalActionButton({
  onPress,
  disabled,
  locked = false,
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
  const flatStyle = StyleSheet.flatten(style) || {};
  const flatFaceStyle = StyleSheet.flatten(faceStyle) || {};

  const faceWidth = resolveDimension(
    flatFaceStyle.width,
    flatFaceStyle.minWidth,
    flatStyle.width,
    flatStyle.minWidth,
    size
  );
  const faceHeight = resolveDimension(
    flatFaceStyle.height,
    flatStyle.height,
    size
  );

  const faceStyles = [
    styles.buttonFace,
    {
      width: faceWidth,
      height: faceHeight,
      borderRadius,
      backgroundColor,
    },
    faceStyle,
  ];

  const shadowStyles = [
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
  ];

  if (locked) {
    return (
      <View
        collapsable={false}
        style={[
          styles.buttonWrap,
          { width: faceWidth, height: faceHeight + PRESS_DEPTH },
          style,
        ]}
      >
        <View
          style={[
            styles.buttonLockedShell,
            {
              width: faceWidth,
              height: faceHeight + PRESS_DEPTH,
              borderRadius,
              backgroundColor: shadowColor,
            },
          ]}
        >
          <View
            style={[
              ...faceStyles,
              styles.buttonFaceLocked,
              {
                borderBottomLeftRadius: 0,
                borderBottomRightRadius: 0,
              },
            ]}
          >
            {children}
          </View>
        </View>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.buttonWrap,
        { width: faceWidth, height: faceHeight + PRESS_DEPTH },
        style,
      ]}
    >
      <View pointerEvents="none" style={shadowStyles} />
      <HapticPressable
        hitSlop={8}
        disabled={disabled}
        haptic={disabled ? false : haptic}
        onPress={onPress}
        android_ripple={disabled ? null : undefined}
        style={({ pressed }) => [
          ...faceStyles,
          {
            transform: [{ translateY: pressed && !disabled ? PRESS_DEPTH : 0 }],
          },
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
  buttonLockedShell: {
    overflow: 'hidden',
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
  buttonFaceLocked: {
    zIndex: 1,
  },
});
