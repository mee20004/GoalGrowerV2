import React from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { theme } from "../../theme";

export default function TutorialComparisonImages({
  leftSource,
  rightSource,
  leftLabel = "Healthy",
  rightLabel = "Wilting",
}) {
  if (!leftSource || !rightSource) return null;

  return (
    <View style={styles.row}>
      <View style={styles.item}>
        <Image source={leftSource} style={styles.image} resizeMode="contain" />
        <Text style={styles.label}>{leftLabel}</Text>
      </View>
      <View style={styles.item}>
        <Image source={rightSource} style={styles.image} resizeMode="contain" />
        <Text style={styles.label}>{rightLabel}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 14,
  },
  item: {
    flex: 1,
    alignItems: "center",
    backgroundColor: theme.bg,
    borderRadius: theme.radiusSm,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: theme.outline,
  },
  image: {
    width: 72,
    height: 72,
    marginBottom: 6,
  },
  label: {
    fontSize: 12,
    fontWeight: "800",
    color: theme.muted2,
    textAlign: "center",
  },
});
