import React, { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Easing, Image, StyleSheet, View } from "react-native";

const GOLD_COIN = require("../assets/Icons/GoldCoin.png");
const SILVER_COIN = require("../assets/Icons/SilverCoin.png");

/** Duration for header balance count-up while coins fly in */
export const COIN_COUNT_UP_DURATION_MS = 1000;

/** First light haptic pulse after claim press (ms) */
export const CLAIM_HAPTIC_START_MS = 35;

function getCoinCount(amount) {
  const safeAmount = Math.max(1, Number(amount) || 0);
  return Math.min(14, Math.max(6, Math.ceil(safeAmount / 6)));
}

export function getCoinFlyCount(amount) {
  return getCoinCount(amount);
}

function buildCoinFlightSpecs(amount, start, end) {
  const count = getCoinCount(amount);

  return Array.from({ length: count }, (_, index) => {
    const goldFirst = index % 3 !== 1;
    const spread = 36;
    const startOffsetX = ((index % 5) - 2) * (spread * 0.35) + (index % 2 === 0 ? -6 : 6);
    const startOffsetY = ((index % 3) - 1) * 10;
    const endOffsetX = ((index % 4) - 1.5) * 6;
    const endOffsetY = ((index % 3) - 1) * 4;
    const size = 24 + (index % 3) * 4;

    return {
      id: `coin-${index}`,
      source: goldFirst ? GOLD_COIN : SILVER_COIN,
      size,
      delay: index * 32 + (index % 2) * 10,
      duration: 480 + (index % 4) * 45,
      startX: start.x + startOffsetX,
      startY: start.y + startOffsetY,
      endX: end.x + endOffsetX,
      endY: end.y + endOffsetY,
      arcLift: 28 + (index % 3) * 12,
      spin: index % 2 === 0 ? "18deg" : "-16deg",
    };
  });
}

function FlyingCoin({ spec, onDone }) {
  const progress = useRef(new Animated.Value(0)).current;
  const onDoneRef = useRef(onDone);

  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    progress.setValue(0);
    const animation = Animated.sequence([
      Animated.delay(spec.delay),
      Animated.timing(progress, {
        toValue: 1,
        duration: spec.duration,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]);

    animation.start(({ finished }) => {
      if (finished) onDoneRef.current?.();
    });

    return () => animation.stop();
  }, [spec.id, spec.delay, spec.duration, progress]);

  const translateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [spec.startX, spec.endX],
  });

  const translateY = progress.interpolate({
    inputRange: [0, 0.45, 1],
    outputRange: [spec.startY, spec.startY - spec.arcLift, spec.endY],
  });

  const scale = progress.interpolate({
    inputRange: [0, 0.12, 0.55, 1],
    outputRange: [0.2, 1.05, 0.95, 0.45],
  });

  const opacity = progress.interpolate({
    inputRange: [0, 0.06, 0.78, 1],
    outputRange: [0, 1, 1, 0],
  });

  const rotate = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", spec.spin],
  });

  return (
    <Animated.View
      style={[
        styles.coinWrap,
        {
          width: spec.size,
          height: spec.size,
          marginLeft: -spec.size / 2,
          marginTop: -spec.size / 2,
          opacity,
          transform: [{ translateX }, { translateY }, { scale }, { rotate }],
        },
      ]}
    >
      <Image source={spec.source} style={styles.coinImage} resizeMode="contain" />
    </Animated.View>
  );
}

export default function CoinFlyReward({ reward, onComplete }) {
  const [coins, setCoins] = useState([]);
  const completionRef = useRef({ total: 0, done: 0, onComplete });

  useEffect(() => {
    completionRef.current.onComplete = onComplete;
  }, [onComplete]);

  useEffect(() => {
    if (!reward) {
      setCoins([]);
      return undefined;
    }

    const specs = buildCoinFlightSpecs(reward.amount, reward.start, reward.end);
    completionRef.current = { total: specs.length, done: 0, onComplete };
    setCoins(specs);

    return undefined;
  }, [reward]);

  const handleCoinDone = useCallback(() => {
    const state = completionRef.current;
    state.done += 1;
    if (state.done >= state.total) {
      state.onComplete?.();
    }
  }, []);

  if (!reward || coins.length === 0) return null;

  return (
    <View pointerEvents="none" style={styles.overlay}>
      {coins.map((spec) => (
        <FlyingCoin key={spec.id} spec={spec} onDone={handleCoinDone} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 200,
    elevation: 200,
    overflow: "visible",
  },
  coinWrap: {
    position: "absolute",
    left: 0,
    top: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  coinImage: {
    width: "100%",
    height: "100%",
  },
});
