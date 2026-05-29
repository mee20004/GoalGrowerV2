import React from "react";
import { StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import TutorialPlantInPot from "./TutorialPlantInPot";
import { tutorialShadows } from "./tutorialStyles";

export default function TutorialGrowthStages({ stages = [] }) {
  if (!stages.length) return null;

  return (
    <LinearGradient
      colors={["#d9f4fc", "#e8f8ef"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.wrap, tutorialShadows.gradientBox]}
    >
      <View style={styles.row}>
        {stages.map((plantSource, index) => (
          <TutorialPlantInPot
            key={`growth-stage-${index}`}
            plantSource={plantSource}
            size={64}
            style={styles.stage}
          />
        ))}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 10,
    marginBottom: 14,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 4,
  },
  stage: {
    flex: 1,
    maxWidth: 72,
  },
});
