import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "../theme";

const BG1_TOP = "#E8E0D0";
const BG1_MID = "#D4CDB8";
const BG1_BOT = "#C4B896";
const BG = "#F5F0E8";
const INK = "#2D2A26";
const MUTED = "#6B6560";
const ACCENT = "#7A8B5E";
const SOIL = "#8B7355";

function PlantMark({ big }) {
  const size = big ? 160 : 128;
  const iconSize = big ? 64 : 52;
  return (
    <View style={[styles.plantCircle, { width: size, height: size, borderRadius: size / 2, backgroundColor: big ? BG : "#EDE8DC" }]}>
      <View style={{ alignItems: "center" }}>
        <Ionicons name="leaf" size={iconSize} color={ACCENT} />
        <View style={[styles.soil, { width: big ? 64 : 48, height: big ? 24 : 20 }]} />
      </View>
    </View>
  );
}

export default function WelcomeScreen({ navigation }) {
  const [page, setPage] = useState(0);

  if (page === 0) {
    return (
      <View style={[styles.full, styles.gradWrap]}>
        <Pressable style={styles.fullCenter} onPress={() => setPage(1)}>
          <PlantMark big />
          <Text style={styles.brandOverline}>GOAL GROWER</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.full, { backgroundColor: BG, paddingHorizontal: 24, paddingVertical: 36 }]}>
      <View style={{ flex: 1 }} />
      <View style={{ alignItems: "center" }}>
        <PlantMark />
        <Text style={[styles.brandOverline, { marginTop: 12 }]}>GOAL GROWER</Text>

        <Text style={styles.welcomeTitle}>
          Welcome to{"\n"}
          <Text style={{ fontSize: 34 }}>Goal Grower</Text>
        </Text>

        <Text style={styles.welcomeBody}>
          Build healthy habits and watch your garden grow at your own pace.
        </Text>
      </View>
      <View style={{ flex: 1 }} />

      <View style={{ width: "100%", maxWidth: 320, alignSelf: "center", gap: 12 }}>
        <Pressable
          style={[styles.primaryBtn, { backgroundColor: ACCENT }]}
          onPress={() => navigation.replace("Tabs")}
        >
          <Text style={styles.primaryBtnText}>Get Started</Text>
        </Pressable>

        <Pressable
          style={[styles.primaryBtn, { backgroundColor: BG1_BOT }]}
          onPress={() => navigation.replace("Tabs")}
        >
          <Text style={[styles.primaryBtnText, { color: INK }]}>Sign In</Text>
        </Pressable>

        <Pressable onPress={() => navigation.replace("Tabs")} style={{ alignItems: "center", marginTop: 4 }}>
          <Text style={styles.guestLink}>Continue as Guest</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: theme.bg,
  },
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: "900",
    color: theme.text,
    marginBottom: 12,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 16,
    color: theme.accent,
    textAlign: "center",
    marginBottom: 32,
  },
  button: {
    backgroundColor: theme.surface,
    paddingVertical: 14,
    paddingHorizontal: 40,
    borderRadius: 10,
  },
  buttonText: {
    fontWeight: "800",
    color: theme.muted,
  },
  fullCenter: { flex: 1, alignItems: "center", justifyContent: "center", gap: 18, paddingHorizontal: 24 },
  plantCircle: { alignItems: "center", justifyContent: "center", shadowOpacity: 0.12, shadowRadius: 14, shadowOffset: { width: 0, height: 10 }, elevation: 8 },
  soil: { backgroundColor: SOIL, borderBottomLeftRadius: 999, borderBottomRightRadius: 999, marginTop: -6 },
  brandOverline: { fontSize: 12, fontWeight: "800", color: ACCENT, letterSpacing: 2, textTransform: "uppercase" },

  welcomeTitle: { marginTop: 10, fontSize: 26, fontWeight: "900", color: INK, textAlign: "center", lineHeight: 34 },
  welcomeBody: { marginTop: 10, fontSize: 14, fontWeight: "600", color: MUTED, textAlign: "center", lineHeight: 20, maxWidth: 270 },

  primaryBtn: { borderRadius: 14, paddingVertical: 14, alignItems: "center", justifyContent: "center", shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 6 }, elevation: 4 },
  primaryBtnText: { fontSize: 14, fontWeight: "900", color: "#fff" },

  guestLink: { fontSize: 12, fontWeight: "700", color: MUTED, textDecorationLine: "underline" },
});