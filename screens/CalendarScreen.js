import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, Dimensions } from "react-native";
import Page from "../components/Page";
import { theme } from "../theme";
import { useGoals, fromKey, toKey } from "../components/GoalsStore";
import { isScheduledOn, isWithinActiveRange } from "../components/GoalsStore";

const DAYS = ["sun","mon","tue","wed","thu","fri","sat"];

function isGoalDoneForDate(goal, dateKey) {
  if (!goal) return false;
  const completionLogs = goal?.logs?.completion?.[dateKey];
  if (goal?.type === "completion") return !!completionLogs?.done;
  if (goal?.type === "numeric") {
    const target = Number(goal?.measurable?.target || 1);
    const value = Number(goal?.logs?.quantity?.[dateKey]?.value || 0);
    return value >= target;
  }
  if (goal?.type === "timer") {
    const target = Number(goal?.timer?.targetSeconds || 600);
    const seconds = Number(goal?.logs?.timer?.[dateKey]?.seconds || 0);
    return seconds >= target;
  }
  if (goal?.type === "checklist") {
    const checked = goal?.logs?.checklist?.[dateKey]?.checkedIds || [];
    const items = goal?.checklist?.items || [];
    return Array.isArray(items) && items.length > 0 && checked.length >= items.length;
  }
  return false;
}

function getWeekDays(date) {
  const startOfWeek = new Date(date);
  startOfWeek.setDate(date.getDate() - date.getDay());

  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(startOfWeek);
    d.setDate(startOfWeek.getDate() + i);
    days.push({
      day: d.getDate(),
      faded: false,
      month: d.getMonth(),
      year: d.getFullYear(),
    });
  }
  return days;
}

function getMonthDays(year, month) {
  const first = new Date(year, month, 1);
  const startDay = first.getDay();

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevMonthDays = new Date(year, month, 0).getDate();

  const arr = [];

  for (let i = startDay - 1; i >= 0; i--) {
    const day = prevMonthDays - i;
    arr.push({ day, faded: true, month: month - 1, year: month === 0 ? year - 1 : year });
  }

  for (let i = 1; i <= daysInMonth; i++) {
    arr.push({ day: i, faded: false, month, year });
  }

  let nextMonthDay = 1;
  while (arr.length % 7 !== 0) {
    arr.push({ day: nextMonthDay++, faded: true, month: month + 1, year: month === 11 ? year + 1 : year });
  }

  return arr;
}

export default function CalendarScreen() {
  const [mode, setMode] = useState("month");
  const { selectedDateKey, setSelectedDateKey } = useGoals();
  const date = fromKey(selectedDateKey);

  const year = date.getFullYear();
  const month = date.getMonth();

  const today = new Date();
  const isCurrentMonth =
    today.getFullYear() === year &&
    today.getMonth() === month;
  const todayDay = today.getDate();

  const days = useMemo(() => {
    if (mode === "month") return getMonthDays(year, month);
    if (mode === "week") return getWeekDays(date);
    return [];
  }, [mode, year, month, date]);

  const calendarRows = useMemo(() => {
    const rows = [];
    for (let i = 0; i < days.length; i += 7) {
      rows.push(days.slice(i, i + 7));
    }
    return rows;
  }, [days]);

  const { goals } = useGoals();

  const todaysGoals = useMemo(() => {
    const dateKey = toKey(date);
    return goals
      .filter((g) => isWithinActiveRange(g, date))
      .filter((g) => isScheduledOn(g, date))
      .map((g) => ({ ...g, done: isGoalDoneForDate(g, dateKey) }));
  }, [goals, selectedDateKey, date]);

  const monthLabel = date.toLocaleString("default", { month: "long" });

  const changeDay = (dir) => {
    const newDate = new Date(date);
    newDate.setDate(date.getDate() + dir);
    setSelectedDateKey(toKey(newDate));
};

  const changeWeek = (dir) => {
    const newDate = new Date(date);
    newDate.setDate(date.getDate() + dir * 7);
    setSelectedDateKey(toKey(newDate));
};

  const changeMonth = (dir) => {
    const newDate = new Date(date);
    newDate.setMonth(date.getMonth() + dir);
    setSelectedDateKey(toKey(newDate));
};

  const weekLabel = () => {
  const start = new Date(date);
  start.setDate(date.getDate() - date.getDay());

  const end = new Date(start);
  end.setDate(start.getDate() + 6);

  return `${start.toLocaleDateString("default", {
    month: "short",
    day: "numeric"
  })} - ${end.toLocaleDateString("default", {
    month: "short",
    day: "numeric"
  })}`;
  };

  return (
    <Page>

      {/* TOP SEGMENT */}
      <View style={styles.segmentRow}>
        {["today","week","month"].map(m => {
          const active = mode === m;
          return (
            <Pressable
              key={m}
              onPress={() => setMode(m)}
              style={[styles.segmentBtn, active && styles.segmentActive]}
            >
              <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                {m.charAt(0).toUpperCase() + m.slice(1)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* CARD */}
      <View style={styles.card}>

        {/* HEADER */}
        <View style={styles.monthRow}>
         <Pressable
            onPress={() => {
              if (mode === "today") changeDay(-1);
              else if (mode === "week") changeWeek(-1);
              else changeMonth(-1);
          }}
          >
            <Text style={styles.arrow}>‹</Text>
          </Pressable>

          <Text style={styles.month}>
            {mode === "today"
              ? date.toLocaleDateString("default", {
                  weekday: "long",
                  month: "long",
                  day: "numeric"
                })
              : mode === "week"
              ? weekLabel()
              : monthLabel}
          </Text>

          <Pressable
            onPress={() => {
              if (mode === "today") changeDay(1);
              else if (mode === "week") changeWeek(1);
              else changeMonth(1);
          }}
          >
            <Text style={styles.arrow}>›</Text>
          </Pressable>
        </View>

        {/* WEEK DAYS */}
        {mode !== "today" && (
          <View style={styles.weekRow}>
            {DAYS.map((d,i) => (
              <View key={d} style={[styles.weekPill,(i+1)%7===0 && { marginRight:0 }]}>
                <Text style={styles.weekText}>{d}</Text>
              </View>
            ))}
          </View>
        )}

        {/* GRID */}
        {mode !== "today" && (
          <View style={styles.grid}>
            {calendarRows.map((row, rowIndex) => (
              <View key={`row-${rowIndex}`} style={styles.weekRowLayout}>
                {row.map((d, i) => {
                  const dayDate = new Date(
                    d.year ?? date.getFullYear(),
                    d.month ?? date.getMonth(),
                    d.day
                  );

                  const isSelected = toKey(dayDate) === selectedDateKey;
                  const isToday =
                    dayDate.getFullYear() === today.getFullYear() &&
                    dayDate.getMonth() === today.getMonth() &&
                    dayDate.getDate() === today.getDate();

                  const dayKey = toKey(dayDate);
                  const dayGoalsCount = goals.filter((g) => isWithinActiveRange(g, dayDate) && isScheduledOn(g, dayDate)).length;

                  return (
                    <Pressable
                      key={`${rowIndex}-${i}`}
                      onPress={() => setSelectedDateKey(toKey(dayDate))}
                      style={[
                        styles.dayBox,
                        d.faded && styles.dayFaded,
                        isSelected && styles.todayBox,
                      ]}
                    >
                      <Text
                        style={[
                          styles.dayText,
                          d.faded && { opacity: 0.4 },
                          isSelected && styles.todayText,
                          isToday && !isSelected && styles.todayTextLight,
                        ]}
                      >
                        {d.day}
                      </Text>
                      {dayGoalsCount > 0 && (
                        <View style={[styles.dot, isSelected ? styles.dotSelected : styles.dotDefault]} />
                      )}
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>
        )}

        {/* GOALS FOR SELECTED DAY */}
        <>
          <View style={styles.divider} />
          <Text style={styles.subHeader}>Scheduled goals for {date.toLocaleDateString()}</Text>

          {todaysGoals.map((g) => (
            <View key={g.id} style={styles.goalRow}>
              <View style={[styles.goalIcon, g.done ? styles.goalIconDone : styles.goalIconPending]} />
              <Text style={[styles.goalText, g.done ? styles.goalTextDone : null]}>{g.name}</Text>
              <Text style={[styles.check, g.done ? styles.checkDone : styles.checkPending]}>
                {g.done ? "✓" : "○"}
              </Text>
            </View>
          ))}

          {todaysGoals.length === 0 && (
            <Text style={styles.emptyText}>No goals scheduled for this day</Text>
          )}
        </>

      </View>
    </Page>
  );
}

const GRID_GAP = 8;
const SCREEN_WIDTH = Dimensions.get("window").width;
const CARD_PADDING = 32;
const CARD_INNER = SCREEN_WIDTH - 32 - 32;
const BOX_SIZE = (CARD_INNER - GRID_GAP * 6) / 7;

const styles = StyleSheet.create({
  segmentRow: { flexDirection: "row", backgroundColor: theme.surface, borderRadius: 999, padding: 4, marginBottom: 12, borderWidth: 1, borderColor: theme.outline },
  segmentBtn: { flex: 1, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 999 },
  segmentActive: { backgroundColor: theme.accent },
  segmentText: { fontWeight: "900", color: theme.text },
  segmentTextActive: { color: theme.bg },

  card: { backgroundColor: theme.surface2, borderRadius: 24, padding: 16, borderWidth: 1, borderColor: theme.outline },

  monthRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  month: { fontSize: 18, fontWeight: "900", color: theme.title },
  arrow: { fontSize: 22, fontWeight: "900", color: theme.title },

  weekRow: { flexDirection: "row", marginBottom: 10, justifyContent: "space-between" },
  weekRowLayout: { flexDirection: "row", justifyContent: "space-between", width: "100%" },

  weekPill: {
    width: BOX_SIZE,
    marginRight: GRID_GAP,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.surface2,
    borderRadius: 6,
    paddingVertical: 4,
  },
  weekText: { color: theme.text, fontWeight: "900", fontSize: 12 },

  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },

  dayBox: {
    width: BOX_SIZE,
    height: BOX_SIZE,
    marginBottom: GRID_GAP,
    backgroundColor: theme.surface,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: theme.outline,
  },

  dayFaded: { opacity: 0.45, backgroundColor: theme.surface2 },

  dayText: { fontWeight: "800", textAlign: "center", includeFontPadding: false, lineHeight: 16, color: theme.text },

  todayBox: { backgroundColor: theme.accent, borderColor: theme.accent, borderWidth: 1 },
  todayText: { color: theme.bg },
  todayTextLight: { color: theme.accent },

  dot: { width: 6, height: 6, borderRadius: 3, marginTop: 4 },
  dotDefault: { backgroundColor: theme.accent },
  dotSelected: { backgroundColor: theme.bg },

  divider: { height: 1, backgroundColor: theme.line, marginVertical: 16 },

  subHeader: { fontSize: 13, fontWeight: "700", color: theme.text2, marginBottom: 8 },
  emptyText: { textAlign: "center", opacity: 0.8, marginTop: 10, color: theme.text2 },

  goalRow: { flexDirection: "row", alignItems: "center", marginBottom: 14, backgroundColor: theme.surface2, borderRadius: 10, padding: 8 },
  goalIcon: { width: 10, height: 10, borderRadius: 5, backgroundColor: theme.accent, marginRight: 12 },
  goalIconDone: { backgroundColor: "#1F9C4B" },
  goalIconPending: { backgroundColor: theme.outline },
  goalText: { flex: 1, fontSize: 14, fontWeight: "800", color: theme.text },
  goalTextDone: { color: "#1F9C4B" },
  check: { fontSize: 16, marginLeft: 8 },
  checkDone: { color: "#1F9C4B" },
  checkPending: { color: theme.muted },
});