import React, { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

export const PRO_BORDER_COLORS = ["#4F8FD9", "#6278D0", "#7B6BC8", "#5A9AE6", "#4F8FD9"];
export const PRO_CARD_BG = "#E4ECF8";
export const PRO_ACCENT = "#4A84D9";
export const PRO_ACCENT_SHADOW = "#3569B8";
export const PRO_TITLE = "#1E3264";
export const PRO_BODY = "#4A5F82";
export const PRO_BODY_MUTED = "#647A9C";
export const PRO_CHECK = "#5B8FD9";
export const PRO_MANAGE_BG = "#CEDCF0";
export const PRO_MANAGE_TEXT = "#2F5491";
export const PRO_CTA_TEXT = "#FFFFFF";

const DEFAULT_COLORS = PRO_BORDER_COLORS;

export default function RotatingGradientBorder({
  children,
  borderWidth = 5,
  borderRadius = 22,
  colors = DEFAULT_COLORS,
  innerBackgroundColor = PRO_CARD_BG,
  duration = 3600,
  style,
}) {
  const spin = useRef(new Animated.Value(0)).current;
  const innerRadius = Math.max(0, borderRadius - borderWidth);

  useEffect(() => {
    const animation = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    animation.start();
    return () => animation.stop();
  }, [duration, spin]);

  const rotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  return (
    <View
      style={[
        styles.shell,
        { borderRadius, padding: borderWidth },
        style,
      ]}
    >
      <View style={[styles.mask, { borderRadius }]}>
        <Animated.View style={[styles.spinner, { transform: [{ rotate }] }]}>
          <LinearGradient
            colors={colors}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.gradient}
          />
        </Animated.View>
      </View>
      <View
        style={[
          styles.inner,
          { borderRadius: innerRadius, backgroundColor: innerBackgroundColor },
        ]}
      >
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    position: "relative",
    overflow: "hidden",
  },
  mask: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
  },
  spinner: {
    position: "absolute",
    width: "220%",
    height: "220%",
    left: "-60%",
    top: "-60%",
  },
  gradient: {
    flex: 1,
  },
  inner: {
    overflow: "hidden",
  },
});
