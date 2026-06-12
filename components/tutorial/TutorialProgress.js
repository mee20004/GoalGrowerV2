import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";
import { theme } from "../../theme";

export default function TutorialProgress({
  currentIndex = 0,
  stepCount = 1,
  progress = 0,
}) {
  const fillAnim = useRef(new Animated.Value(progress)).current;

  useEffect(() => {
    Animated.timing(fillAnim, {
      toValue: progress,
      duration: 280,
      useNativeDriver: false,
    }).start();
  }, [fillAnim, progress]);

  const fillWidth = fillAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });

  return (
    <View
      style={styles.wrap}
      accessibilityRole="progressbar"
      accessibilityLabel={`Tutorial step ${currentIndex + 1} of ${stepCount}`}
      accessibilityValue={{
        min: 1,
        max: stepCount,
        now: currentIndex + 1,
      }}
    >
      <View style={styles.track}>
        <Animated.View style={[styles.fill, { width: fillWidth }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    top: 12,
    left: 24,
    right: 24,
    zIndex: 3,
    alignItems: "center",
  },
  track: {
    width: "72%",
    maxWidth: 220,
    height: 4,
    borderRadius: 999,
    backgroundColor: "rgba(0, 0, 0, 0.12)",
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: theme.accent,
  },
});
