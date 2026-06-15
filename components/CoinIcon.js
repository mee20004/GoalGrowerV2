import React from "react";
import { Image, StyleSheet } from "react-native";

export const COIN_ICON = require("../assets/Icons/Coins.png");

export default function CoinIcon({ size = 24, style }) {
  return (
    <Image
      source={COIN_ICON}
      style={[styles.icon, { width: size, height: size }, style]}
      resizeMode="contain"
    />
  );
}

const styles = StyleSheet.create({
  icon: {
    aspectRatio: 1,
  },
});
