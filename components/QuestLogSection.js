import React, { useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import QuestRow from "./QuestRow";
import HapticPressable from "./HapticPressable";
import GoalActionButton from "./GoalActionButton";
import { HapticType } from "../utils/haptics";
import { QUEST_ORANGE, QUEST_ORANGE_SHADOW } from "../constants/QuestTheme";
import theme from "../theme";
import { cpShadow } from "../utils/shadows";

function MilestoneRow({ milestone, claimingKey, claimOriginRefs, onClaimMilestone, readOnly = false }) {
  const isClaiming = claimingKey === milestone.claimKey;
  const isDone = milestone.isClaimed;

  return (
    <View style={[styles.milestoneRow, isDone && styles.milestoneRowDone]}>
      <View style={styles.milestoneBody}>
        <Text style={styles.milestoneTitle}>Complete {milestone.target} quests</Text>
        <Text style={styles.milestoneMeta}>
          {milestone.progress}/{milestone.target}
        </Text>
        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              { width: `${Math.min(100, (milestone.progress / milestone.target) * 100)}%` },
            ]}
          />
        </View>
      </View>
      {readOnly ? (
        isDone ? (
          <Ionicons name="checkmark-circle" size={22} color="#7d8a97" />
        ) : milestone.isComplete ? (
          <Text style={styles.readOnlyStatus}>Complete</Text>
        ) : null
      ) : milestone.canClaim ? (
        <View
          collapsable={false}
          ref={(node) => {
            if (claimOriginRefs) claimOriginRefs.current[milestone.claimKey] = node;
          }}
        >
          <GoalActionButton
            onPress={() => onClaimMilestone?.(milestone)}
            disabled={isClaiming}
            haptic={HapticType.MEDIUM}
            backgroundColor={QUEST_ORANGE}
            shadowColor={QUEST_ORANGE_SHADOW}
            borderRadius={12}
            size={30}
            style={styles.milestoneClaimWrap}
            faceStyle={styles.milestoneClaimButton}
          >
            <Text style={styles.milestoneClaimText}>{isClaiming ? "..." : "Claim"}</Text>
          </GoalActionButton>
        </View>
      ) : isDone ? (
        <Ionicons name="checkmark-circle" size={22} color="#7d8a97" />
      ) : null}
    </View>
  );
}

export default function QuestLogSection({
  questHistory = [],
  milestones = [],
  questMilestones = [],
  totalCompleted = 0,
  claimingKey,
  claimOriginRefs,
  onClaimQuest,
  onClaimMilestone,
  readOnly = false,
}) {
  const [expanded, setExpanded] = useState(false);
  const nextQuestMilestone = questMilestones.find((m) => !m.isClaimed);
  const claimableMilestones = milestones.filter((m) => m.canClaim);
  const recentHistory = questHistory.slice(0, 7);

  return (
    <View style={styles.card}>
      <HapticPressable style={styles.headerRow} onPress={() => setExpanded((v) => !v)}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Quest log</Text>
          <Text style={styles.subtitle}>
            {totalCompleted} completed
            {nextQuestMilestone ? ` · Next bonus at ${nextQuestMilestone.target}` : ""}
          </Text>
        </View>
        <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={20} color={theme.muted} />
      </HapticPressable>

      {readOnly ? null : claimableMilestones.length > 0 ? (
        <View style={styles.claimableBanner}>
          <Text style={styles.claimableText}>
            {claimableMilestones.length} milestone{claimableMilestones.length === 1 ? "" : "s"} ready to claim
          </Text>
        </View>
      ) : null}

      {expanded ? (
        <View style={styles.expandedBody}>
          {questMilestones.length > 0 ? (
            <View style={styles.sectionBlock}>
              <Text style={styles.sectionLabel}>Quest milestones</Text>
              {questMilestones.map((milestone) => (
                <MilestoneRow
                  key={milestone.claimKey}
                  milestone={milestone}
                  claimingKey={claimingKey}
                  claimOriginRefs={claimOriginRefs}
                  onClaimMilestone={onClaimMilestone}
                  readOnly={readOnly}
                />
              ))}
            </View>
          ) : null}

          {milestones.length > 0 ? (
            <View style={styles.sectionBlock}>
              <Text style={styles.sectionLabel}>Lifetime milestones</Text>
              {milestones.map((quest) => (
                <QuestRow
                  key={quest.claimKey}
                  quest={quest}
                  claimingKey={claimingKey}
                  claimOriginRefs={claimOriginRefs}
                  onClaim={onClaimQuest}
                  compact
                  readOnly={readOnly}
                />
              ))}
            </View>
          ) : null}

          <View style={styles.sectionBlock}>
            <Text style={styles.sectionLabel}>Recent quests</Text>
            {recentHistory.length === 0 ? (
              <Text style={styles.emptyHistory}>Completed quests will show up here.</Text>
            ) : (
              recentHistory.map((entry, index) => (
                <View key={`${entry.questId}-${entry.periodKey}-${index}`} style={styles.historyRow}>
                  <Ionicons name="checkmark-circle-outline" size={16} color="#7d8a97" />
                  <Text style={styles.historyTitle} numberOfLines={1}>{entry.title}</Text>
                  <Text style={styles.historyReward}>+{entry.coinReward}</Text>
                </View>
              ))
            )}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "rgba(255,255,255,0.96)",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 12,
    ...cpShadow({ color: "#4c6782", offset: { width: 0, height: 6 }, opacity: 0.12, radius: 0, elevation: 2 }),
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: "900",
    color: theme.text,
    fontFamily: "CeraRoundProDEMO-Black",
  },
  subtitle: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: "700",
    color: theme.text2,
    fontFamily: "CeraRoundProDEMO-Black",
  },
  claimableBanner: {
    marginTop: 10,
    backgroundColor: "#fff7df",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  claimableText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#8a6418",
    fontFamily: "CeraRoundProDEMO-Black",
  },
  expandedBody: {
    marginTop: 10,
  },
  sectionBlock: {
    marginBottom: 12,
  },
  sectionLabel: {
    marginBottom: 4,
    fontSize: 11,
    fontWeight: "900",
    color: theme.muted,
    fontFamily: "CeraRoundProDEMO-Black",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  emptyHistory: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.muted,
    fontFamily: "CeraRoundProDEMO-Black",
    paddingVertical: 6,
  },
  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#edf2f7",
  },
  historyTitle: {
    flex: 1,
    fontSize: 13,
    fontWeight: "700",
    color: theme.text,
    fontFamily: "CeraRoundProDEMO-Black",
  },
  historyReward: {
    fontSize: 12,
    fontWeight: "900",
    color: "#3b5176",
    fontFamily: "CeraRoundProDEMO-Black",
  },
  milestoneRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#edf2f7",
  },
  milestoneRowDone: {
    opacity: 0.65,
  },
  milestoneBody: {
    flex: 1,
  },
  milestoneTitle: {
    fontSize: 13,
    fontWeight: "900",
    color: theme.text,
    fontFamily: "CeraRoundProDEMO-Black",
  },
  milestoneMeta: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: "800",
    color: theme.muted,
    fontFamily: "CeraRoundProDEMO-Black",
  },
  progressTrack: {
    marginTop: 6,
    height: 7,
    borderRadius: 999,
    backgroundColor: "#e0e0e0",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: QUEST_ORANGE,
  },
  milestoneClaimWrap: {
    minWidth: 76,
  },
  milestoneClaimButton: {
    minWidth: 76,
    paddingHorizontal: 10,
  },
  milestoneClaimText: {
    color: "#FFF",
    fontSize: 13,
    fontWeight: "900",
    fontFamily: "CeraRoundProDEMO-Black",
  },
  readOnlyStatus: {
    fontSize: 11,
    fontWeight: "800",
    color: "#7d8a97",
    fontFamily: "CeraRoundProDEMO-Black",
  },
});
