// screens/GoalScreen.js
import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, TextInput, Modal } from "react-native";
import Page from "../components/Page";
import { theme } from "../theme";
import { useGoals, fromKey, toKey, addDaysKey, isValidDateKey } from "../components/GoalsStore";

function fmtDate(key) {
  const d = fromKey(key);
  const weekday = d.toLocaleDateString(undefined, { weekday: "short" });
  const month = d.toLocaleDateString(undefined, { month: "short" });
  return `${weekday}, ${month} ${d.getDate()}`;
}

function StatPill({ label, value }) {
  return (
    <View style={styles.statPill}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

function Chip({ label, active, onPress }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

export default function GoalScreen({ navigation, route }) {
  const { goalId } = route.params;

  const {
    getGoal,
    updateGoal,
    selectedDateKey,
    setSelectedDateKey,
    toggleCompletion,
    setNumeric,
    addTimerSeconds,
    toggleChecklistItem,
    addFlexProgress,
    isDoneForDay,
    flexWarning,
    getLast7Keys,
    getStreak,
  } = useGoals();

  const goal = getGoal(goalId);
  const dateKey = selectedDateKey;

  const [dateModal, setDateModal] = useState(false);
  const [dateInput, setDateInput] = useState(dateKey);

  // edit fields (local, then save)
  const [name, setName] = useState(goal?.name ?? "");
  const [categories, setCategories] = useState(goal?.categories ?? (goal?.category ? [goal.category] : ["Custom"]));

  const doneToday = goal ? isDoneForDay(goal, dateKey) : false;

  const todayNumeric = goal?.logs?.numeric?.[dateKey]?.value ?? 0;
  const todaySeconds = goal?.logs?.timer?.[dateKey]?.seconds ?? 0;
  const todayChecked = new Set(goal?.logs?.checklist?.[dateKey]?.checkedIds || []);
  const flexTotal = goal?.logs?.flex?.total ?? 0;

  const warning = goal ? flexWarning?.(goal, dateKey) : null;

  const weeklyStats = useMemo(() => {
    if (!goal || typeof getLast7Keys !== "function") return { doneCount: 0, totalDays: 7 };
    const keys = getLast7Keys(dateKey);
    const doneCount = keys.reduce((acc, k) => acc + (isDoneForDay(goal, k) ? 1 : 0), 0);
    return { doneCount, totalDays: 7 };
  }, [goal, dateKey, getLast7Keys, isDoneForDay]);

  const streak = useMemo(() => {
    if (!goal || typeof getStreak !== "function") return 0;
    return getStreak(goal, dateKey);
  }, [goal, dateKey, getStreak]);

  if (!goal) {
    return (
      <Page>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: theme.muted, fontWeight: "900" }}>Goal not found.</Text>
        </View>
      </Page>
    );
  }

  const toggleCategory = (c) => {
    setCategories((prev) => {
      const set = new Set(prev || []);
      if (set.has(c)) set.delete(c);
      else set.add(c);
      const next = [...set];
      return next.length ? next : ["Custom"];
    });
  };

  const saveEdits = () => {
    const cleanName = name.trim() || goal.name;
    const cleanCats = (categories || []).filter(Boolean);
    updateGoal(goalId, {
      name: cleanName,
      categories: cleanCats,
      category: cleanCats[0] || "Custom",
    });
  };

  return (
    <Page>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.headerBtn}>
          <Text style={styles.headerBtnText}>Back</Text>
        </Pressable>

        <Pressable onPress={() => { setDateInput(dateKey); setDateModal(true); }} style={styles.dateBtn}>
          <Text style={styles.dateBtnText}>{fmtDate(dateKey)}</Text>
        </Pressable>

        <Pressable onPress={saveEdits} style={[styles.headerBtn, { backgroundColor: theme.accent }]}>
          <Text style={[styles.headerBtnText, { color: theme.bg }]}>Save</Text>
        </Pressable>
      </View>

      {/* Overview card */}
      <View style={styles.card}>
        <Text style={styles.title}>{goal.name}</Text>
        <Text style={styles.sub}>
          {goal.kind === "flex" ? "Flexible by deadline" : goal.frequencyLabel} • {goal.kind}
        </Text>

        <View style={styles.rowWrap}>
          <StatPill label="This week" value={`${weeklyStats.doneCount}/${weeklyStats.totalDays}`} />
          <StatPill label="Streak" value={`${streak}`} />
          <StatPill label="Today" value={doneToday ? "Done" : "Not yet"} />
        </View>

        {!!warning && (
          <View style={styles.warnBox}>
            <Text style={styles.warnTitle}>Deadline coming up</Text>
            <Text style={styles.warnText}>
              {warning.daysLeft <= 0 ? "Due now." : `${warning.daysLeft} days left.`} Remaining: {warning.remaining}{" "}
              {goal.flex?.unit ?? ""}
            </Text>
          </View>
        )}
      </View>

      {/* Mark complete / log progress */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Today</Text>

        <View style={styles.todayRow}>
          <View style={[styles.bigCheck, doneToday && { backgroundColor: theme.accent, borderColor: theme.accent }]}>
            <Text style={[styles.bigCheckText, doneToday && { color: theme.bg }]}>{doneToday ? "✓" : ""}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.helper}>
              {goal.kind === "completion"
                ? "Tap the button to mark today complete."
                : goal.kind === "numeric"
                ? "Enter today’s value."
                : goal.kind === "timer"
                ? "Add time you did today."
                : goal.kind === "checklist"
                ? "Check items you did today."
                : "Add progress toward your deadline."}
            </Text>
          </View>
        </View>

        {/* Completion */}
        {goal.kind === "completion" && (
          <Pressable
            onPress={() => toggleCompletion(goalId, dateKey)}
            style={[styles.actionBtn, doneToday && { backgroundColor: theme.surface2 }]}
          >
            <Text style={[styles.actionText, doneToday && { color: theme.text }]}>
              {doneToday ? "Undo for today" : "Mark complete for today"}
            </Text>
          </Pressable>
        )}

        {/* Numeric */}
        {goal.kind === "numeric" && (
          <>
            <Text style={[styles.label, { marginTop: 10 }]}>
              Target: {goal.measurable?.target ?? 1} {goal.measurable?.unit ?? "times"}
            </Text>
            <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
              <TextInput
                value={String(todayNumeric)}
                onChangeText={(t) => setNumeric(goalId, t, dateKey)}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor={theme.muted2}
                style={[styles.input, { flex: 1 }]}
              />
              <Pressable onPress={() => setNumeric(goalId, 0, dateKey)} style={styles.smallBtn}>
                <Text style={styles.smallBtnText}>Reset</Text>
              </Pressable>
            </View>
          </>
        )}

        {/* Timer */}
        {goal.kind === "timer" && (
          <>
            <Text style={[styles.label, { marginTop: 10 }]}>
              Target: {Math.round((goal.timer?.targetSeconds ?? 600) / 60)} minutes
            </Text>
            <Text style={[styles.helper, { marginTop: 6 }]}>
              Today: {Math.round(todaySeconds / 60)} min
            </Text>

            <View style={styles.rowWrap}>
              <Pressable onPress={() => addTimerSeconds(goalId, 60, dateKey)} style={styles.smallBtn}>
                <Text style={styles.smallBtnText}>+1m</Text>
              </Pressable>
              <Pressable onPress={() => addTimerSeconds(goalId, 5 * 60, dateKey)} style={styles.smallBtn}>
                <Text style={styles.smallBtnText}>+5m</Text>
              </Pressable>
              <Pressable onPress={() => addTimerSeconds(goalId, 10 * 60, dateKey)} style={styles.smallBtn}>
                <Text style={styles.smallBtnText}>+10m</Text>
              </Pressable>
            </View>
          </>
        )}

        {/* Checklist */}
        {goal.kind === "checklist" && (
          <>
            <Text style={[styles.helper, { marginTop: 10 }]}>Tap items to check/uncheck:</Text>
            <View style={{ marginTop: 10, gap: 8 }}>
              {(goal.checklist?.items || []).map((it) => {
                const on = todayChecked.has(it.id);
                return (
                  <Pressable
                    key={it.id}
                    onPress={() => toggleChecklistItem(goalId, it.id, dateKey)}
                    style={[styles.checkRow, on && styles.checkRowOn]}
                  >
                    <Text style={[styles.checkBox, on && { color: theme.bg }]}>{on ? "✓" : " "}</Text>
                    <Text style={[styles.checkText, on && { color: theme.bg }]} numberOfLines={1}>
                      {it.text}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        )}

        {/* Flex (deadline) */}
        {goal.kind === "flex" && (
          <>
            <Text style={[styles.label, { marginTop: 10 }]}>
              Goal: {goal.flex?.target ?? 1} {goal.flex?.unit ?? "units"} by {goal.flex?.deadlineKey ?? ""}
            </Text>
            <Text style={[styles.helper, { marginTop: 6 }]}>
              Total progress: {flexTotal}/{goal.flex?.target ?? 1}
            </Text>

            <View style={styles.rowWrap}>
              <Pressable onPress={() => addFlexProgress(goalId, 1, dateKey)} style={styles.smallBtn}>
                <Text style={styles.smallBtnText}>+1</Text>
              </Pressable>
              <Pressable onPress={() => addFlexProgress(goalId, 5, dateKey)} style={styles.smallBtn}>
                <Text style={styles.smallBtnText}>+5</Text>
              </Pressable>
              <Pressable onPress={() => addFlexProgress(goalId, 10, dateKey)} style={styles.smallBtn}>
                <Text style={styles.smallBtnText}>+10</Text>
              </Pressable>
              <Pressable onPress={() => addFlexProgress(goalId, -1, dateKey)} style={styles.smallBtn}>
                <Text style={styles.smallBtnText}>-1</Text>
              </Pressable>
            </View>
          </>
        )}
      </View>

      {/* Edit card */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Edit</Text>

        <Text style={styles.label}>Name</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Goal name"
          placeholderTextColor={theme.muted2}
          style={styles.input}
        />

        <Text style={[styles.label, { marginTop: 12 }]}>Categories</Text>
        <View style={styles.rowWrap}>
          {["Body", "Mind", "Spirit", "Work", "Custom"].map((c) => (
            <Chip key={c} label={c} active={(categories || []).includes(c)} onPress={() => toggleCategory(c)} />
          ))}
        </View>

        <Pressable onPress={saveEdits} style={[styles.actionBtn, { marginTop: 12 }]}>
          <Text style={styles.actionText}>Save changes</Text>
        </Pressable>
      </View>

      {/* Date chooser modal */}
      <Modal visible={dateModal} transparent animationType="fade" onRequestClose={() => setDateModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Choose date</Text>
            <Text style={styles.modalHint}>Type YYYY-MM-DD</Text>

            <TextInput
              value={dateInput}
              onChangeText={setDateInput}
              placeholder="2026-03-28"
              placeholderTextColor={theme.muted2}
              style={styles.input}
            />

            {!isValidDateKey(dateInput) && <Text style={styles.modalWarn}>Enter a valid date like 2026-03-28</Text>}

            <View style={styles.rowWrap}>
              <Pressable onPress={() => setSelectedDateKey(toKey(new Date()))} style={styles.smallBtn}>
                <Text style={styles.smallBtnText}>Today</Text>
              </Pressable>
              <Pressable onPress={() => setSelectedDateKey(addDaysKey(dateKey, -1))} style={styles.smallBtn}>
                <Text style={styles.smallBtnText}>Prev</Text>
              </Pressable>
              <Pressable onPress={() => setSelectedDateKey(addDaysKey(dateKey, 1))} style={styles.smallBtn}>
                <Text style={styles.smallBtnText}>Next</Text>
              </Pressable>
            </View>

            <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
              <Pressable onPress={() => setDateModal(false)} style={[styles.headerBtn, { flex: 1 }]}>
                <Text style={styles.headerBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  if (!isValidDateKey(dateInput)) return;
                  setSelectedDateKey(dateInput);
                  setDateModal(false);
                }}
                style={[styles.headerBtn, { flex: 1, backgroundColor: theme.accent }]}
              >
                <Text style={[styles.headerBtnText, { color: theme.bg }]}>Set</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </Page>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  headerTitle: { fontSize: 20, fontWeight: "900", color: theme.text },
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

  dayLabel: { fontSize: 10, fontWeight: "900", color: theme.text, lineHeight: 12 },
  dayNum: { marginTop: 2, fontSize: 12, fontWeight: "900", color: theme.text, lineHeight: 14 },
  dayLabelActive: { color: theme.bg },
  dayNumActive: { color: theme.bg },

  goalCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  dateBtnText: { fontWeight: "900", color: theme.text, fontSize: 12 },

  card: { backgroundColor: theme.surface, borderRadius: theme.radius, padding: 16, marginBottom: 12 },
  title: { fontSize: 16, fontWeight: "900", color: theme.text },
  sub: { marginTop: 4, fontSize: 12, fontWeight: "800", color: theme.muted },

  sectionTitle: { fontSize: 13, fontWeight: "900", color: theme.text, marginBottom: 10 },
  label: { fontSize: 12, fontWeight: "900", color: theme.text, marginBottom: 8 },
  helper: { fontSize: 12, fontWeight: "800", color: theme.muted, lineHeight: 16 },

  rowWrap: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 10 },

  statPill: {
    backgroundColor: theme.surface2,
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
  micro: { marginTop: 3, fontSize: 11, fontWeight: "800", color: theme.muted },

  rightWrap: { width: 44, alignItems: "flex-end", justifyContent: "center" },

  droplet: { width: 20, height: 20, borderRadius: 10, transform: [{ rotate: "20deg" }] },
  dropletOutline: { borderWidth: 2, borderColor: theme.accent, backgroundColor: "transparent" },
  dropletFilled: { backgroundColor: theme.accent },

  empty: { textAlign: "center", color: theme.muted, fontWeight: "900" },
  emptySub: { marginTop: 6, textAlign: "center", color: theme.muted2, fontWeight: "800" },
});