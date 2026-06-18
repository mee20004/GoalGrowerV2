import React, { useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import HapticPressable from "../components/HapticPressable";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "../theme";
import { cardShadow, subtleBorderShadow, cpShadow } from "../utils/shadows";

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

export default function WelcomeScreen({ navigation, onContinue, onLogin }) {
  const [page, setPage] = useState(1);

  const handleContinue = () => {
    if (onContinue) {
      onContinue();
      return;
    }
    navigation.replace("Tabs");
  };

  const handleLogin = () => {
    if (onLogin) {
      onLogin();
      return;
    }
    navigation.replace("Login");
  };

  if (page === 0) {
    return (
      <View style={[styles.full, styles.gradWrap]}>
        <HapticPressable style={styles.fullCenter} onPress={() => setPage(1)}>
          <PlantMark big />
          <Text style={styles.brandOverline}>GOAL GROWER</Text>
        </HapticPressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}></Text>
        <View style={styles.card}>
          <Text style={styles.welcomeTitle}>Welcome to Goal Grower</Text>
          <Text style={styles.welcomeBody}>

          </Text>
        </View>
      </View>

      <View style={styles.ctaBlock}>
        <Text style={styles.ctaPrompt}>Already have an account?</Text>
        <View style={styles.actionButtonWrap}>
          <View pointerEvents="none" style={[styles.actionButtonShadow, styles.actionButtonShadowSecondary]} />
          <HapticPressable
            style={({ pressed }) => [
              styles.actionButtonFace,
              styles.secondaryBtn,
              pressed && styles.actionButtonPressed,
            ]}
            onPress={handleLogin}
          >
            <Text style={styles.secondaryBtnText}>Log in</Text>
          </HapticPressable>
        </View>
      </View>

      <View style={styles.ctaDivider} />

      <View style={styles.ctaBlock}>
        <Text style={styles.ctaPrompt}>New to Goal Grower?</Text>
        <View style={styles.actionButtonWrap}>
          <View pointerEvents="none" style={[styles.actionButtonShadow, styles.actionButtonShadowPrimary]} />
          <HapticPressable
            style={({ pressed }) => [
              styles.actionButtonFace,
              styles.primaryBtn,
              pressed && styles.actionButtonPressed,
            ]}
            onPress={handleContinue}
          >
            <Text style={styles.primaryBtnText}>Get Started</Text>
          </HapticPressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  full: { flex: 1 },
  container: { flex: 1, backgroundColor: theme.bg, paddingHorizontal: 16 },
  headerTopSpacer: { height: 65 },
  headerWrapper: {
    backgroundColor: "rgba(255,255,255,0.96)",
    borderRadius: 24,
    ...cardShadow,
    marginTop: 8,
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 10,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "900",
    color: theme.text,
    flexShrink: 1,
    fontFamily: "CeraRoundProDEMO-Black",
  },
  headerBtnPlaceholder: { width: 42, height: 42 },
  section: { marginBottom: 40 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "900",
    color: "#000000",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 1,
    fontFamily: "CeraRoundProDEMO-Black",
  },
  card: {
    borderRadius: 24,
    padding: 16,
    backgroundColor: "#ffffff",
    ...cardShadow,
    alignItems: "center",
  },
  heroIconWrap: {
    width: 86,
    height: 86,
    borderRadius: 43,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f7fafc",
    borderWidth: 1.5,
    borderColor: "#d9e6f4",
    marginBottom: 12,
  },
  gradWrap: {
    backgroundColor: BG1_TOP,
  },
  fullCenter: { flex: 1, alignItems: "center", justifyContent: "center", gap: 18, paddingHorizontal: 24 },
  plantCircle: {
    alignItems: "center",
    justifyContent: "center",
    ...cpShadow({ color: "#000", offset: { width: 0, height: 10 }, opacity: 0.12, radius: 14, elevation: 8 }),
  },
  soil: { backgroundColor: SOIL, borderBottomLeftRadius: 999, borderBottomRightRadius: 999, marginTop: -6 },
  brandOverline: { fontSize: 12, fontWeight: "800", color: ACCENT, letterSpacing: 2, textTransform: "uppercase" },

  welcomeTitle: {
    marginTop: 150,
    fontSize: 36,
    fontWeight: "900",
    color: INK,
    textAlign: "center",
    lineHeight: 42,
    fontFamily: "CeraRoundProDEMO-Black",
  },
  welcomeBody: {
    marginTop: 10,
    fontSize: 18,
    fontWeight: "700",
    color: MUTED,
    textAlign: "center",
    lineHeight: 26,
    maxWidth: 320,
    fontFamily: "CeraRoundProDEMO-Black",
  },

  ctaBlock: {
    marginBottom: 22,
  },
  ctaDivider: {
    height: 3,
    backgroundColor: "#cfcfcf",
    marginTop: 10,
    marginBottom: 30,
    marginHorizontal: 14,
    borderRadius: 100,
  },
  actionButtonWrap: {
    height: 56,
    position: "relative",
  },
  ctaPrompt: {
    fontSize: 18,
    fontWeight: "900",
    color: "#363636",
    marginBottom: 14,
    textAlign: "center",
    fontFamily: "CeraRoundProDEMO-Black",
  },
  actionButtonShadow: {
    position: "absolute",
    top: 4,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 20,
  },
  actionButtonShadowPrimary: {
    backgroundColor: "#bebebe",
  },
  actionButtonShadowSecondary: {
    backgroundColor: "#509a18",
  },
  actionButtonFace: {
    height: 52,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  actionButtonPressed: {
    transform: [{ translateY: 4 }],
  },
  primaryBtn: { backgroundColor: "#ffffff" },
  secondaryBtn: { backgroundColor: "#58cc02" },
  primaryBtnText: {
    fontSize: 19,
    fontWeight: "800",
    color: "#3d3d3d",
    textAlign: "center",
    fontFamily: "CeraRoundProDEMO-Black",
  },
  secondaryBtnText: {
    fontSize: 19,
    fontWeight: "800",
    color: "#ffffff",
    textAlign: "center",
    fontFamily: "CeraRoundProDEMO-Black",
  },

  guestLink: { fontSize: 12, fontWeight: "700", color: MUTED, textDecorationLine: "underline" },
});