import React from "react";
import { StyleSheet, Text, View } from "react-native";
import TutorialPlantInPot from "./TutorialPlantInPot";
import { tutorialShadows } from "./tutorialStyles";

export default function TutorialComparisonImages({
  leftSource,
  rightSource,
  leftLabel = "Healthy",
  rightLabel = "Wilting",
  variant = "default",
}) {
  if (!leftSource || !rightSource) return null;

  const isConsistency = variant === "consistency";

  return (
    <View style={styles.row}>
      <View
        style={[
          styles.item,
          isConsistency ? styles.itemHealthy : null,
          tutorialShadows.comparisonCard,
        ]}
      >
        <TutorialPlantInPot plantSource={leftSource} size={80} />
        <Text
          style={[
            styles.label,
            isConsistency ? styles.labelHealthy : null,
          ]}
        >
          {leftLabel}
        </Text>
      </View>
      <View
        style={[
          styles.item,
          isConsistency ? styles.itemWilting : null,
          tutorialShadows.comparisonCard,
        ]}
      >
        <TutorialPlantInPot plantSource={rightSource} size={80} />
        <Text
          style={[
            styles.label,
            isConsistency ? styles.labelWilting : null,
          ]}
        >
          {rightLabel}
        </Text>
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
    backgroundColor: "#f7f9fb",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  itemHealthy: {
    backgroundColor: "#e8f8ef",
  },
  itemWilting: {
    backgroundColor: "#fdeee8",
  },
  label: {
    fontSize: 12,
    fontWeight: "800",
    color: "#7a8a99",
    textAlign: "center",
    marginTop: 4,
  },
  labelHealthy: {
    color: "#28b900",
  },
  labelWilting: {
    color: "#c45c4a",
  },
});
