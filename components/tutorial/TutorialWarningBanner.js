import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";

export default function TutorialWarningBanner({ text }) {
  if (!text) return null;

  return (
    <View style={styles.wrap}>
      <Ionicons name="warning" size={16} color="#c9a227" style={styles.icon} />
      <Text style={styles.text}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginBottom: 14,
    paddingHorizontal: 2,
  },
  icon: {
    marginTop: 2,
  },
  text: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: "#5a6b7a",
    textAlign: "center",
  },
});
