import React from "react";
import { Image, StyleSheet, View } from "react-native";
import { POT_ASSETS } from "../../constants/PotAssets";

export default function TutorialPlantInPot({
  plantSource,
  potKey = "default",
  size = 72,
  style,
}) {
  if (!plantSource) return null;

  const potSource = POT_ASSETS[potKey] || POT_ASSETS.default;
  const plantHeight = size * 0.72;
  const potHeight = size * 0.42;

  return (
    <View style={[styles.wrap, { width: size, height: size }, style]}>
      <Image
        source={plantSource}
        style={[styles.plant, { height: plantHeight, bottom: potHeight * 0.55 }]}
        resizeMode="contain"
      />
      <Image
        source={potSource}
        style={[styles.pot, { height: potHeight }]}
        resizeMode="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "flex-end",
  },
  plant: {
    position: "absolute",
    width: "88%",
    zIndex: 1,
  },
  pot: {
    width: "72%",
    zIndex: 2,
  },
});
