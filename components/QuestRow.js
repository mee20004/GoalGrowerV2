import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import GoalActionButton from "./GoalActionButton";
import { HapticType } from "../utils/haptics";
import { QUEST_ORANGE, QUEST_ORANGE_SHADOW } from "../constants/QuestTheme";
import theme from "../theme";

export default function QuestRow({
  quest,
  claimingKey,
  claimOriginRefs,
  onClaim,
  compact = false,
  readOnly = false,
}) {
  if (!quest) return null;

  const isClaiming = claimingKey === quest.claimKey;
  const isClaimed = quest.isClaimed;
  const canClaim = quest.canClaim;
  const progressPct = quest.target > 0
    ? Math.min(100, Math.round((quest.progress / quest.target) * 100))
    : 0;

  const buttonLabel = isClaimed ? "Claimed" : isClaiming ? "..." : "Claim";

  return (
    <View style={[styles.cardWrap, isClaimed && styles.cardWrapDone]}>
      <View style={styles.row}>
        <View style={styles.content}>
          <View style={styles.titleRow}>
            <Text style={[styles.title, isClaimed && styles.titleDone]} numberOfLines={2}>
              {quest.title}
            </Text>
            <Text style={styles.value}>
              {quest.progress}/{quest.target}
            </Text>
          </View>

          {quest.description ? (
            <Text style={styles.desc}>{quest.description}</Text>
          ) : null}

          <View style={styles.miniTrackOuter}>
            <View style={styles.miniTrack}>
              <View style={[styles.miniFill, { width: `${progressPct}%` }]} />
            </View>
          </View>
        </View>

        {readOnly ? (
          isClaimed ? (
            <Ionicons name="checkmark-circle" size={22} color="#7d8a97" style={styles.readOnlyStatusIcon} />
          ) : quest.isComplete ? (
            <Text style={styles.readOnlyStatus}>Complete</Text>
          ) : null
        ) : (
          <View
            collapsable={false}
            ref={(node) => {
              if (claimOriginRefs) claimOriginRefs.current[quest.claimKey] = node;
            }}
            style={styles.claimButtonAnchor}
          >
            <GoalActionButton
              onPress={() => onClaim?.(quest)}
              disabled={!canClaim || isClaiming}
              haptic={canClaim ? HapticType.MEDIUM : false}
              backgroundColor={canClaim ? QUEST_ORANGE : "#b7c0c9"}
              shadowColor={canClaim ? QUEST_ORANGE_SHADOW : "#9aa3ad"}
              borderRadius={14}
              size={compact ? 36 : 40}
              style={styles.claimButtonWrap}
              faceStyle={styles.claimButton}
            >
              <Text style={styles.claimButtonText}>{buttonLabel}</Text>
            </GoalActionButton>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cardWrap: {
    backgroundColor: "#f5f5f5",
    borderRadius: 28,
    marginBottom: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    shadowColor: "#cdcdcd",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 2,
  },
  cardWrapDone: {
    opacity: 0.55,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    backgroundColor: "transparent",
    borderRadius: 12,
    paddingLeft: 8,
    paddingVertical: 6,
  },
  content: {
    flex: 1,
    flexDirection: "column",
    justifyContent: "center",
    minWidth: 0,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 2,
  },
  title: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    fontWeight: "900",
    color: "#000000",
    paddingBottom: 2,
    paddingRight: 8,
    fontFamily: "CeraRoundProDEMO-Black",
    letterSpacing: 0.1,
  },
  titleDone: {
    color: theme.text2,
  },
  value: {
    fontSize: 10,
    fontWeight: "900",
    color: "#000000",
    paddingRight: 10,
    paddingTop: 1,
    flexShrink: 0,
    fontFamily: "CeraRoundProDEMO-Black",
    letterSpacing: 0.1,
  },
  desc: {
    marginTop: 0,
    marginBottom: 4,
    marginRight: 10,
    fontSize: 11,
    fontWeight: "700",
    color: theme.text2,
    fontFamily: "CeraRoundProDEMO-Black",
    lineHeight: 15,
  },
  miniTrackOuter: {
    marginTop: 2,
    marginBottom: 0,
    marginRight: 10,
  },
  miniTrack: {
    width: "100%",
    height: 6,
    borderRadius: 999,
    backgroundColor: "#e0e0e0",
    overflow: "hidden",
  },
  miniFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: QUEST_ORANGE,
  },
  claimButtonAnchor: {
    alignSelf: "center",
    flexShrink: 0,
  },
  claimButtonWrap: {
    minWidth: 90,
    position: "relative",
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 8,
    flexShrink: 0,
  },
  claimButton: {
    height: 36,
    minWidth: 90,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 0,
  },
  claimButtonText: {
    color: "#FFF",
    fontSize: 15,
    fontWeight: "900",
    fontFamily: "CeraRoundProDEMO-Black",
    letterSpacing: 0.1,
  },
  readOnlyStatusIcon: {
    alignSelf: "center",
    marginLeft: 8,
    flexShrink: 0,
  },
  readOnlyStatus: {
    alignSelf: "center",
    marginLeft: 8,
    fontSize: 11,
    fontWeight: "800",
    color: "#7d8a97",
    fontFamily: "CeraRoundProDEMO-Black",
    flexShrink: 0,
  },
});
