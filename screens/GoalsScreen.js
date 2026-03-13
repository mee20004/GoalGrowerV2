// screens/GoalsScreen.js
import React, { useMemo } from "react";
import { View, Text, StyleSheet, Pressable, FlatList } from "react-native";
import Page from "../components/Page";
import { theme } from "../theme";
import { useGoals, fromKey, toKey, isScheduledOn, isWithinActiveRange } from "../components/GoalsStore";

const DAYS = [
  { label: "SUN", day: 0 },
  { label: "MON", day: 1 },
  { label: "TUE", day: 2 },
  { label: "WED", day: 3 },
  { label: "THU", day: 4 },
  { label: "FRI", day: 5 },
  { label: "SAT", day: 6 },
];

function startOfWeek(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d;
}
function weekDates(date = new Date()) {
  const start = startOfWeek(date);
  return Array.from({ length: 7 }, (_, i) => {
    const x = new Date(start);
    x.setDate(start.getDate() + i);
    return x;
  });
}

function Droplet({ filled }) {
  return <View style={[styles.droplet, filled ? styles.dropletFilled : styles.dropletOutline]} />;
}

export default function GoalsScreen({ navigation }) {
  const { goals, selectedDateKey, setSelectedDateKey } = useGoals();

  const selectedDate = fromKey(selectedDateKey);
  const week = useMemo(() => weekDates(selectedDate), [selectedDateKey]);

  const today = new Date();
  const todayKey = toKey(today);

  const filtered = useMemo(() => {
    return goals
      .filter((g) => isWithinActiveRange(g, selectedDate))
      .filter((g) => isScheduledOn(g, selectedDate));
  }, [goals, selectedDateKey]);

  return (
    <Page>
      <View style={styles.headerRow}>
        <Text style={styles.headerTitle}>Goals</Text>
        <View style={styles.headerIcons}>
          <View style={styles.headerIcon} />
          <View style={styles.headerIcon} />
        </View>
      </View>

      <View style={styles.dayStrip}>
        {DAYS.map((d, idx) => {
          const dateObj = week[idx];
          const key = toKey(dateObj);
          const isSelected = key === selectedDateKey;
          const isToday = key === todayKey;

          return (
            <Pressable
              key={key}
              onPress={() => setSelectedDateKey(key)}
              style={[styles.dayPill, isSelected && styles.dayPillActive, isToday && styles.dayPillTodayOutline]}
              android_ripple={{ color: "#00000012", borderless: false }}
              hitSlop={10}
            >
              <Text style={[styles.dayLabel, isSelected && styles.dayLabelActive]}>{d.label}</Text>
              <Text style={[styles.dayNum, isSelected && styles.dayNumActive]}>{dateObj.getDate()}</Text>
            </Pressable>
          );
        })}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: 24 }}
        renderItem={({ item }) => {
          const done =
            item.type === "completion"
              ? !!item.logs?.completion?.[selectedDateKey]?.done
              : (item.logs?.quantity?.[selectedDateKey]?.value ?? 0) >= (item.measurable?.target ?? 0);

          const subtitle =
            item.type === "quantity"
              ? `${item.frequencyLabel} • ${item.measurable.target} ${item.measurable.unit}`
              : `${item.frequencyLabel} • Completion`;

          return (
            <Pressable
              style={styles.goalCard}
              onPress={() => navigation.navigate("Goal", { goalId: item.id })}
              android_ripple={{ color: "#00000010" }}
              hitSlop={8}
            >
              <View style={styles.leftIcon} />
              <View style={styles.textWrap}>
                <Text style={styles.title} numberOfLines={1}>{item.name}</Text>
                <Text style={styles.sub} numberOfLines={1}>{subtitle}</Text>
                {!!item.plan?.when && (
                  <Text style={styles.micro} numberOfLines={1}>
                    Plan: {item.plan.when}{item.plan.where ? ` • ${item.plan.where}` : ""}
                  </Text>
                )}
              </View>

              <View style={styles.rightWrap}>
                <Droplet filled={done} />
              </View>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <View style={{ marginTop: 26 }}>
            <Text style={styles.empty}>Nothing Scheduled Yet</Text>
            <Text style={styles.emptySub}>Add a goal that fits this day.</Text>
          </View>
        }
      />
    </Page>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  headerTitle: { fontSize: 20, fontWeight: "900", color: theme.title },
  headerIcons: { flexDirection: "row" },
  headerIcon: { width: 18, height: 18, borderRadius: 6, backgroundColor: theme.surface, marginLeft: 10 },

  dayStrip: { flexDirection: "row", justifyContent: "space-between", marginBottom: 14 },
  dayPill: {
    width: 42,
    height: 46,
    borderRadius: theme.radiusSm,
    backgroundColor: theme.surface,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 6,
    overflow: "hidden",
  },
  dayPillActive: { backgroundColor: theme.accent },
  dayPillTodayOutline: { borderWidth: 2, borderColor: theme.outline },

  dayLabel: { fontSize: 10, fontWeight: "900", color: theme.muted, lineHeight: 12 },
  dayNum: { marginTop: 2, fontSize: 12, fontWeight: "900", color: theme.muted, lineHeight: 14 },
  dayLabelActive: { color: theme.bg },
  dayNumActive: { color: theme.bg },

  goalCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.card,
    borderRadius: theme.radius,
    paddingHorizontal: 12,
    height: 74,
    marginBottom: 12,
    overflow: "hidden",
  },
  leftIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: theme.accent, marginRight: 12 },
  textWrap: { flex: 1, paddingRight: 8 },
  title: { fontSize: 14, fontWeight: "900", color: theme.text, lineHeight: 18 },
  sub: { marginTop: 2, fontSize: 12, fontWeight: "800", color: theme.text2 },
  micro: { marginTop: 3, fontSize: 11, fontWeight: "800", color: theme.accent },

  rightWrap: { width: 44, alignItems: "flex-end", justifyContent: "center" },

  droplet: { width: 20, height: 20, borderRadius: 10, transform: [{ rotate: "20deg" }] },
  dropletOutline: { borderWidth: 2, borderColor: theme.accent, backgroundColor: "transparent" },
  dropletFilled: { backgroundColor: theme.accent },

  empty: { textAlign: "center", color: theme.surface, fontWeight: "900" },
  emptySub: { marginTop: 6, textAlign: "center", color: theme.muted2, fontWeight: "800" },
});
