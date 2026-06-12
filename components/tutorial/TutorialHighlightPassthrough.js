import React from "react";
import { Pressable, StyleSheet } from "react-native";
import { isValidRect } from "../../tutorial/layout";

export default function TutorialHighlightPassthrough({ rect, enabled = false, onPress }) {
  if (!enabled || !isValidRect(rect) || !onPress) {
    return null;
  }

  return (
    <Pressable
      style={[
        styles.hitArea,
        {
          left: rect.x,
          top: rect.y,
          width: rect.width,
          height: rect.height,
        },
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Tutorial highlighted action"
    />
  );
}

const styles = StyleSheet.create({
  hitArea: {
    position: "absolute",
    zIndex: 1002,
    backgroundColor: "transparent",
  },
});
