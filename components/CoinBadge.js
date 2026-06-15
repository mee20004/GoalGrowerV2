import React from "react";
import { View, Text, StyleSheet } from "react-native";
import CoinIcon from "./CoinIcon";

const SIZES = {
  sm: { icon: 18, font: 14 },
  md: { icon: 28, font: 17 },
  lg: { icon: 32, font: 24 },
};

export default function CoinBadge({
  amount,
  size = "md",
  textColor = "#1f2937",
}) {
  const dims = SIZES[size] || SIZES.md;

  return (
    <View style={styles.wrap}>
      <CoinIcon size={dims.icon} />
      <Text style={[styles.amount, { fontSize: dims.font, color: textColor }]}>
        {Number(amount || 0).toLocaleString()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  amount: {
    fontFamily: "CeraRoundProDEMO-Black",
  },
});
