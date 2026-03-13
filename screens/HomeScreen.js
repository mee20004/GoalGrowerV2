import React, { useMemo } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Page from "../components/Page";
import { useGoals } from "../components/GoalsStore";

const BG = "#F5F0E8";
const INK = "#2D2A26";
const MUTED = "#6B6560";
const ACCENT = "#7A8B5E";
const BORDER = "#D4CDB8";
const SOFT = "#E8E0D0";
const CARD = "#FFFFFF";

export default function HomeScreen({ navigation }) {
  const store = useGoals();
  const selectedDateKey = store?.selectedDateKey;
  const goalsForDate = store?.getGoalsForDate ? store.getGoalsForDate(selectedDateKey) : (store?.goals ?? []);

  const completedCount = useMemo(() => {
    if (!store?.isGoalDone) return goalsForDate.filter((g) => !!g?.done).length;
    return goalsForDate.filter((g) => store.isGoalDone(g.id, selectedDateKey)).length;
  }, [goalsForDate, store, selectedDateKey]);

  const pct = goalsForDate.length ? (completedCount / goalsForDate.length) : 0;

  return (
    <Page>
      <View style={[styles.root, { backgroundColor: BG }]}>
        <View style={styles.header}>
          <Text style={styles.title}>Today</Text>
          <Pressable onPress={() => navigation.navigate("Settings")} style={styles.iconBtn}>
            <Ionicons name="settings-outline" size={22} color={MUTED} />
          </Pressable>
        </View>

        {/* Progress */}
        <View style={styles.progressRow}>
          <Text style={styles.progressText}>{completedCount}/{goalsForDate.length} completed</Text>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${pct * 100}%` }]} />
          </View>
        </View>

        {/* List */}
        {goalsForDate.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>Nothing scheduled yet</Text>
            <Pressable onPress={() => navigation.navigate("Add")} style={styles.plantBtn}>
              <Ionicons name="leaf" size={44} color="#C4B896" />
            </Pressable>
            <Text style={styles.emptyHint}>Add a goal</Text>
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            {goalsForDate.map((g) => {
              const done = store?.isGoalDone ? store.isGoalDone(g.id, selectedDateKey) : !!g?.done;
              return (
                <Pressable
                  key={g.id}
                  onPress={() => store?.toggleGoalCompletion?.(g.id, selectedDateKey)}
                  style={({ pressed }) => [
                    styles.row,
                    done ? styles.rowDone : styles.rowOpen,
                    pressed && { transform: [{ scale: 0.99 }] },
                  ]}
                >
                  <View style={[styles.leftBadge, done ? { backgroundColor: ACCENT } : { backgroundColor: "#EDE8DC" }]}>
                    {done ? (
                      <Ionicons name="checkmark" size={16} color="#fff" />
                    ) : (
                      <Ionicons name="leaf-outline" size={16} color={ACCENT} />
                    )}
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={[styles.name, done && { textDecorationLine: "line-through", color: MUTED }]} numberOfLines={1}>
                      {g.name}
                    </Text>
                    <Text style={styles.sub}>{g.frequencyLabel || "Schedule"}</Text>
                  </View>

                  <View style={[styles.checkRing, done && { backgroundColor: ACCENT, borderColor: ACCENT }]}>
                    {done && <Ionicons name="checkmark" size={12} color="#fff" />}
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}
      </View>
    </Page>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 16, paddingTop: 10 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  title: { fontSize: 20, fontWeight: "900", color: INK },
  iconBtn: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" },

  progressRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  progressText: { fontSize: 12, fontWeight: "800", color: MUTED },
  track: { flex: 1, height: 6, borderRadius: 999, backgroundColor: SOFT, overflow: "hidden" },
  fill: { height: "100%", borderRadius: 999, backgroundColor: ACCENT },

  row: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 14, borderWidth: 1 },
  rowOpen: { backgroundColor: CARD, borderColor: BORDER },
  rowDone: { backgroundColor: SOFT, borderColor: "#C4B896" },

  leftBadge: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  name: { fontSize: 14, fontWeight: "900", color: INK },
  sub: { marginTop: 2, fontSize: 10, fontWeight: "700", color: MUTED },

  checkRing: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: BORDER, alignItems: "center", justifyContent: "center" },

  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  emptyText: { fontSize: 14, fontWeight: "800", color: MUTED },
  plantBtn: { padding: 6 },
  emptyHint: { fontSize: 12, fontWeight: "700", color: MUTED },
});