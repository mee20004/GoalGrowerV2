import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { theme } from "../theme";

export default function ShopScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Shop</Text>
      <Text style={styles.subtitle}>Coming soon!</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 32,
    fontWeight: "bold",
    color: theme.text,
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 18,
    color: theme.muted2,
  },
});
