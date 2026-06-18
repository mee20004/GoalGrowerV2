import { StyleSheet } from "react-native";
import { theme } from "../../theme";
import {
  softCardShadow,
  accentButtonShadow,
  cpShadow,
} from "../../utils/shadows";

export const tutorialShadows = StyleSheet.create({
  card: softCardShadow,
  button: accentButtonShadow,
  gradientBox: cpShadow({
    color: "#7ab8c8",
    offset: { width: 0, height: 4 },
    opacity: 0.22,
    radius: 10,
    elevation: 5,
  }),
  comparisonCard: cpShadow({
    color: "#000",
    offset: { width: 0, height: 3 },
    opacity: 0.1,
    radius: 8,
    elevation: 4,
  }),
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
    ...tutorialShadows.button,
  },
  primaryBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "800",
  },
});
