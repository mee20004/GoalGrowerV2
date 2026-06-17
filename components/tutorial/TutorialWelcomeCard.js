import React, { useEffect, useRef } from "react";
import {
  Animated,
  StyleSheet,
  Text,
  View,
} from "react-native";
import HapticPressable from "../HapticPressable";
import { LinearGradient } from "expo-linear-gradient";
import { theme } from "../../theme";
import TutorialPlantInPot from "./TutorialPlantInPot";
import { tutorialCardStyles, tutorialShadows } from "./tutorialStyles";

export default function TutorialWelcomeCard({
  titleLine1 = "Welcome to",
  titleLine2 = "GoalGrower!",
  heroCaptionLine1 = "Grow your goals,",
  heroCaptionLine2 = "one step at a time",
  description,
  plantSource = null,
  onGetStarted,
}) {
  const cardOpacity = useRef(new Animated.Value(0)).current;
  const cardTranslateY = useRef(new Animated.Value(18)).current;
  const heroScale = useRef(new Animated.Value(0.92)).current;
  const heroOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    cardOpacity.setValue(0);
    cardTranslateY.setValue(18);
    heroScale.setValue(0.92);
    heroOpacity.setValue(0);

    Animated.parallel([
      Animated.timing(cardOpacity, {
        toValue: 1,
        duration: 340,
        useNativeDriver: true,
      }),
      Animated.spring(cardTranslateY, {
        toValue: 0,
        friction: 9,
        tension: 70,
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.delay(80),
        Animated.parallel([
          Animated.spring(heroScale, {
            toValue: 1,
            friction: 8,
            tension: 65,
            useNativeDriver: true,
          }),
          Animated.timing(heroOpacity, {
            toValue: 1,
            duration: 280,
            useNativeDriver: true,
          }),
        ]),
      ]),
    ]).start();
  }, [cardOpacity, cardTranslateY, heroOpacity, heroScale, titleLine2]);

  return (
    <View style={styles.centerWrap} pointerEvents="box-none">
      <Animated.View
        style={[
          styles.card,
          tutorialShadows.card,
          {
            opacity: cardOpacity,
            transform: [{ translateY: cardTranslateY }],
          },
        ]}
      >
        <Text style={styles.titleLine1}>{titleLine1}</Text>
        <Text style={styles.titleLine2}>{titleLine2}</Text>

        <Animated.View
          style={{
            opacity: heroOpacity,
            transform: [{ scale: heroScale }],
            width: "100%",
          }}
        >
          <LinearGradient
            colors={["#d9f4fc", "#f4fbff"]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={[styles.heroCard, tutorialShadows.gradientBox]}
          >
            {plantSource ? (
              <TutorialPlantInPot plantSource={plantSource} size={120} />
            ) : null}
            <Text style={styles.heroCaptionLine1}>{heroCaptionLine1}</Text>
            <Text style={styles.heroCaptionLine2}>{heroCaptionLine2}</Text>
          </LinearGradient>
        </Animated.View>

        <Text style={styles.description}>{description}</Text>

        <HapticPressable
          style={[tutorialCardStyles.primaryBtn, styles.getStartedBtn]}
          onPress={onGetStarted}
          accessibilityRole="button"
          accessibilityLabel="Get Started"
        >
          <Text style={tutorialCardStyles.primaryText}>Get Started</Text>
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
  },
  titleLine1: {
    fontSize: 16,
    fontWeight: "600",
    color: "#7a8a99",
    textAlign: "center",
    marginBottom: 2,
  },
  titleLine2: {
    fontSize: 28,
    fontWeight: "900",
    color: "#1a2b3c",
    textAlign: "center",
    marginBottom: 16,
  },
  heroCard: {
    borderRadius: 14,
    paddingVertical: 18,
    paddingHorizontal: 16,
    alignItems: "center",
    marginBottom: 16,
  },
  heroCaptionLine1: {
    fontSize: 14,
    fontWeight: "700",
    color: "#3d5a6e",
    textAlign: "center",
    lineHeight: 20,
    marginTop: 4,
  },
  heroCaptionLine2: {
    fontSize: 14,
    fontWeight: "700",
    color: "#3d5a6e",
    textAlign: "center",
    lineHeight: 20,
  },
  description: {
    fontSize: 15,
    color: "#5a6b7a",
    lineHeight: 22,
    textAlign: "center",
    marginBottom: 20,
  },
  getStartedBtn: {
    alignSelf: "stretch",
    minWidth: undefined,
  },
});
