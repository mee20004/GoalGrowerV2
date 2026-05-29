import React, { useEffect, useRef } from "react";
import {
  Animated,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { theme } from "../../theme";

export default function TutorialCompletionCard({
  title,
  description,
  imageSource = null,
  primaryLabel = "End Tutorial",
  onEndTutorial,
}) {
  const cardOpacity = useRef(new Animated.Value(0)).current;
  const cardScale = useRef(new Animated.Value(0.94)).current;
  const trophyScale = useRef(new Animated.Value(0.6)).current;
  const trophyOpacity = useRef(new Animated.Value(0)).current;
  const glowOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    cardOpacity.setValue(0);
    cardScale.setValue(0.94);
    trophyScale.setValue(0.6);
    trophyOpacity.setValue(0);
    glowOpacity.setValue(0);

    Animated.parallel([
      Animated.timing(cardOpacity, {
        toValue: 1,
        duration: 360,
        useNativeDriver: true,
      }),
      Animated.spring(cardScale, {
        toValue: 1,
        friction: 8,
        tension: 70,
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.delay(120),
        Animated.parallel([
          Animated.spring(trophyScale, {
            toValue: 1,
            friction: 6,
            tension: 80,
            useNativeDriver: true,
          }),
          Animated.timing(trophyOpacity, {
            toValue: 1,
            duration: 320,
            useNativeDriver: true,
          }),
          Animated.timing(glowOpacity, {
            toValue: 1,
            duration: 400,
            useNativeDriver: true,
          }),
        ]),
      ]),
    ]).start();
  }, [cardOpacity, cardScale, glowOpacity, title, trophyOpacity, trophyScale]);

  return (
    <View style={styles.centerWrap} pointerEvents="box-none">
      <Animated.View
        style={[
          styles.card,
          {
            opacity: cardOpacity,
            transform: [{ scale: cardScale }],
          },
        ]}
      >
        {imageSource ? (
          <View style={styles.trophyWrap}>
            <Animated.View style={[styles.trophyGlow, { opacity: glowOpacity }]} />
            <Animated.View
              style={{
                opacity: trophyOpacity,
                transform: [{ scale: trophyScale }],
              }}
            >
              <Image source={imageSource} style={styles.trophyImage} resizeMode="contain" />
            </Animated.View>
          </View>
        ) : null}

        <Text style={styles.badge}>Achievement unlocked</Text>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.description}>{description}</Text>

        <Pressable
          style={styles.primaryBtn}
          onPress={onEndTutorial}
          accessibilityRole="button"
          accessibilityLabel={primaryLabel}
        >
          <Text style={styles.primaryText}>{primaryLabel}</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  centerWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  card: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: theme.surface,
    borderRadius: theme.radius,
    padding: 24,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
    borderWidth: 1,
    borderColor: theme.outline,
  },
  trophyWrap: {
    width: 140,
    height: 140,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  trophyGlow: {
    position: "absolute",
    width: 130,
    height: 130,
    borderRadius: 999,
    backgroundColor: "rgba(40, 185, 0, 0.18)",
  },
  trophyImage: {
    width: 120,
    height: 120,
  },
  badge: {
    fontSize: 12,
    fontWeight: "800",
    color: theme.accent,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  title: {
    fontSize: 24,
    fontWeight: "900",
    color: theme.text,
    textAlign: "center",
    marginBottom: 10,
  },
  description: {
    fontSize: 15,
    color: theme.muted2,
    lineHeight: 22,
    textAlign: "center",
    marginBottom: 22,
  },
  primaryBtn: {
    width: "100%",
    backgroundColor: theme.accent,
    borderRadius: theme.radiusSm,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 16,
  },
});
