import React from 'react';
import { View, StyleSheet } from 'react-native';
import { cardShadow } from '../utils/shadows';

export default function ShadowSurface({
  children,
  shadow = cardShadow,
  style,
  contentStyle,
  backgroundColor,
}) {
  const resolvedBackgroundColor =
    backgroundColor ??
    (Array.isArray(style)
      ? StyleSheet.flatten(style)?.backgroundColor
      : style?.backgroundColor);

  return (
    <View
      style={[
        styles.shadowWrap,
        shadow,
        resolvedBackgroundColor ? { backgroundColor: resolvedBackgroundColor } : null,
        style,
      ]}
    >
      <View style={[styles.content, contentStyle]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  shadowWrap: {},
  content: {
    overflow: 'hidden',
  },
});
