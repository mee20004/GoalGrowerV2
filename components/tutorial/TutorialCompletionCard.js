import React, { useEffect, useRef } from "react";
import {
  Animated,
  Image,
  StyleSheet,
  Text,
  View,
} from "react-native";
import HapticPressable from "../HapticPressable";
import { theme } from "../../theme";
import { tutorialCardStyles, tutorialShadows } from "./tutorialStyles";

export default function TutorialCompletionCard({
  title,
  description,
  imageSource = null,
  primaryLabel = "Done",
  onEndTutorial,
}) {
  const cardOpacity = useRef(new Animated.Value(0)).current;
  const cardScale = useRef(new Animated.Value(0.94)).current;
  const trophyScale = useRef(new Animated.Value(0.6)).current;
  const trophyOpacity = useRef(new Animated.Value(0)).current;
  const glowOpacity = useRef(new Animated.Value(0)).current;
  const showRewardImage = Boolean(imageSource);

  useEffect(() => {
    cardOpacity.setValue(0);
    cardScale.setValue(0.94);
    trophyScale.setValue(0.6);
    trophyOpacity.setValue(0);
    glowOpacity.setValue(0);

    const cardAnimation = Animated.parallel([
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
    ]);

    if (!showRewardImage) {
      cardAnimation.start();
      return undefined;
    }

    Animated.parallel([
      cardAnimation,
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
  }, [cardOpacity, cardScale, glowOpacity, showRewardImage, title, trophyOpacity, trophyScale]);

  return (
    <View style={styles.centerWrap} pointerEvents="box-none">
      <Animated.View
        style={[
          styles.card,
          tutorialShadows.card,
          {
            opacity: cardOpacity,
            transform: [{ scale: cardScale }],
          },
        ]}
      >
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.description}>{description}</Text>

        {showRewardImage ? (
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

        <HapticPressable
          style={[tutorialCardStyles.primaryBtn, styles.endBtn]}
          onPress={onEndTutorial}
          accessibilityRole="button"
          accessibilityLabel={primaryLabel}
        >
          <Text style={tutorialCardStyles.primaryText}>{primaryLabel}</Text>
        </HapticPressable>
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
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
  },
  title: {
    fontSize: 24,
    fontWeight: "900",
    color: "#1a2b3c",
    textAlign: "center",
    marginBottom: 10,
  },
  description: {
    fontSize: 15,
    color: "#5a6b7a",
    lineHeight: 22,
    textAlign: "center",
    marginBottom: 16,
  },
  trophyWrap: {
    width: 140,
    height: 140,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  trophyGlow: {
    position: "absolute",
    width: 130,
    height: 130,
    borderRadius: 999,
    backgroundColor: "rgba(201, 162, 39, 0.2)",
  },
  trophyImage: {
    width: 120,
    height: 120,
  },
  endBtn: {
    alignSelf: "stretch",
    minWidth: undefined,
  },
});
