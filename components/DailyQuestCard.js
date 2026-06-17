import React from "react";
import { View, Text, StyleSheet } from "react-native";
import QuestRow from "./QuestRow";
import theme from "../theme";

export default function DailyQuestCard({
  dailyQuests = [],
  weeklyQuests = [],
  loading = false,
  claimingKey,
  claimOriginRefs,
  onClaim,
  readOnly = false,
}) {
  const hasWeekly = weeklyQuests.length > 0;

  return (
    <View style={styles.card}>
      <Text style={styles.subtitle}>Small wins, daily coins</Text>

      {loading ? (
        <Text style={styles.helper}>Loading quests...</Text>
      ) : dailyQuests.length === 0 ? (
        <Text style={styles.helper}>
          {readOnly ? "No quests to show right now." : "No quests available right now. Add a goal to get started."}
        </Text>
      ) : (
        <View style={styles.questList}>
          {dailyQuests.map((quest) => (
            <QuestRow
              key={quest.claimKey}
              quest={quest}
              claimingKey={claimingKey}
              claimOriginRefs={claimOriginRefs}
              onClaim={onClaim}
              readOnly={readOnly}
            />
          ))}
        </View>
      )}

      {hasWeekly ? (
        <View style={styles.weeklySection}>
          <Text style={styles.weeklyLabel}>Weekly quest</Text>
          <View style={styles.questList}>
            {weeklyQuests.map((quest) => (
              <QuestRow
                key={quest.claimKey}
                quest={quest}
                claimingKey={claimingKey}
                claimOriginRefs={claimOriginRefs}
                onClaim={onClaim}
                readOnly={readOnly}
              />
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 28,
    paddingHorizontal: 14,
    paddingVertical: 14,
    shadowColor: "#cdcdcd",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 2,
  },
  subtitle: {
    fontSize: 11,
    fontWeight: "800",
    color: "#7d8a97",
    marginBottom: 10,
    fontFamily: "CeraRoundProDEMO-Black",
    letterSpacing: 0.1,
  },
  helper: {
    fontSize: 12,
    fontWeight: "800",
    color: "#7d8a97",
    marginBottom: 4,
    fontFamily: "CeraRoundProDEMO-Black",
    letterSpacing: 0.1,
  },
  weeklySection: {
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#e8e8e8",
    paddingTop: 8,
  },
  weeklyLabel: {
    fontSize: 12,
    fontWeight: "900",
    color: theme.text,
    marginBottom: 2,
    fontFamily: "CeraRoundProDEMO-Black",
    letterSpacing: 0.1,
  },
  questList: {
    gap: 0,
  },
});
