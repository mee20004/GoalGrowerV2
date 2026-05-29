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

export default function TutorialWelcomeCard({
  title,
  description,
  imageSource = null,
  onSkip,
  onGetStarted,
}) {
  const cardOpacity = useRef(new Animated.Value(0)).current;
  const cardTranslateY = useRef(new Animated.Value(18)).current;
  const imageScale = useRef(new Animated.Value(0.88)).current;
  const imageOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    cardOpacity.setValue(0);
    cardTranslateY.setValue(18);
    imageScale.setValue(0.88);
    imageOpacity.setValue(0);

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
          Animated.spring(imageScale, {
            toValue: 1,
            friction: 8,
            tension: 65,
            useNativeDriver: true,
          }),
          Animated.timing(imageOpacity, {
            toValue: 1,
            duration: 280,
            useNativeDriver: true,
          }),
        ]),
      ]),
    ]).start();
  }, [cardOpacity, cardTranslateY, imageOpacity, imageScale, title]);

  return (
    <View style={styles.centerWrap} pointerEvents="box-none">
      <Animated.View
        style={[
          styles.card,
          {
            opacity: cardOpacity,
            transform: [{ translateY: cardTranslateY }],
          },
        ]}
      >
        {imageSource ? (
          <Animated.View
            style={[
              styles.imageWrap,
              {
                opacity: imageOpacity,
                transform: [{ scale: imageScale }],
              },
            ]}
          >
            <Image source={imageSource} style={styles.image} resizeMode="contain" />
          </Animated.View>
        ) : null}

        <Text style={styles.title}>{title}</Text>
        <Text style={styles.description}>{description}</Text>

        <View style={styles.actions}>
          <Pressable
            style={styles.secondaryBtn}
            onPress={onSkip}
            accessibilityRole="button"
            accessibilityLabel="Skip tutorial"
          >
            <Text style={styles.secondaryText}>Skip</Text>
          </Pressable>
          <Pressable
            style={styles.primaryBtn}
            onPress={onGetStarted}
            accessibilityRole="button"
            accessibilityLabel="Get Started"
          >
            <Text style={styles.primaryText}>Get Started</Text>
          </Pressable>
        </View>
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
    shadowColor: "#000",
    shadowOpacity: 0.14,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
    borderWidth: 1,
    borderColor: theme.outline,
  },
  imageWrap: {
    alignItems: "center",
    marginBottom: 8,
  },
  image: {
    width: 160,
    height: 160,
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
    marginBottom: 20,
  },
  actions: {
    flexDirection: "row",
    gap: 10,
  },
  primaryBtn: {
    flex: 1,
    backgroundColor: theme.accent,
    borderRadius: theme.radiusSm,
    paddingVertical: 13,
    alignItems: "center",
  },
  primaryText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 15,
  },
  secondaryBtn: {
    flex: 1,
    backgroundColor: theme.bg,
    borderRadius: theme.radiusSm,
    paddingVertical: 13,
    alignItems: "center",
    borderWidth: 1,
    borderColor: theme.outline,
  },
  secondaryText: {
    color: theme.text,
    fontWeight: "800",
    fontSize: 15,
  },
});
