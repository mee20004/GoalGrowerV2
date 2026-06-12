import { StyleSheet } from "react-native";
import { theme } from "../../theme";

export const tutorialShadows = StyleSheet.create({
  card: {
    shadowColor: "#000",
    shadowOpacity: 0.14,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
    elevation: 9,
  },
  button: {
    shadowColor: "#2d6b1f",
    shadowOpacity: 0.28,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  gradientBox: {
    shadowColor: "#7ab8c8",
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  comparisonCard: {
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
});

export const tutorialCardStyles = StyleSheet.create({
  card: {
    backgroundColor: theme.surface,
    borderRadius: 16,
    padding: 20,
    ...tutorialShadows.card,
  },
  title: {
    fontSize: 22,
    fontWeight: "900",
    color: "#1a2b3c",
    marginBottom: 8,
    textAlign: "center",
  },
  description: {
    fontSize: 15,
    color: "#5a6b7a",
    lineHeight: 22,
    marginBottom: 16,
    textAlign: "center",
  },
  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    minHeight: 44,
  },
  skipLink: {
    paddingVertical: 10,
    paddingHorizontal: 4,
    minWidth: 44,
    justifyContent: "center",
  },
  skipLinkText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#9aa8b6",
  },
  primaryBtn: {
    minWidth: 108,
    backgroundColor: theme.accent,
    borderRadius: 999,
    paddingVertical: 12,
    paddingHorizontal: 22,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    ...tutorialShadows.button,
  },
  primaryText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 15,
  },
});
