// components/GoalsStore.js
import React, { createContext, useContext, useMemo, useState, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

export function toKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function fromKey(key) {
  const [y, m, d] = key.split("-").map((n) => Number(n));
  return new Date(y, (m || 1) - 1, d || 1);
}

export function isValidDateKey(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s))) return false;
  const [y, m, d] = String(s).split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

function uid() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

function daysBetween(aDate, bDate) {
  const a = new Date(aDate); a.setHours(0,0,0,0);
  const b = new Date(bDate); b.setHours(0,0,0,0);
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

export function addDaysKey(dateKey, deltaDays) {
  const d = fromKey(dateKey);
  d.setDate(d.getDate() + deltaDays);
  return toKey(d);
}

/**
 * Goal Types (kind)
 * - completion: tap = done/undone for the day
 * - numeric: store value for day; done if value >= target
 * - timer: store seconds for day; done if seconds >= targetSeconds
 * - checklist: store checkedIds for day; done if all checked
 * - flex: “by deadline” goal (weekly/monthly/custom deadline), shows daily until complete,
 *         supports partial progress entries, warns near deadline, doesn’t show in past unless progress happened that day.
 */

export function isWithinActiveRange(goal, dateOrKey) {
  const tb = goal?.timeBound;
  if (!tb?.enabled) return true;

  const date = typeof dateOrKey === "string" ? fromKey(dateOrKey) : dateOrKey;
  const start = tb.startDate ? fromKey(tb.startDate) : null;
  const end = tb.endDate ? fromKey(tb.endDate) : null;

  if (start && date < start) return false;
  if (end && date > end) return false;
  return true;
}

export function isScheduledOn(goal, dateOrKey) {
  const date = typeof dateOrKey === "string" ? fromKey(dateOrKey) : dateOrKey;
  const day = date.getDay(); // 0..6
  const sched = goal?.schedule;

  if (!sched) return true;
  if (sched.mode === "floating") return true; // handled separately
  if (sched.mode === "everyday") return true;
  if (sched.mode === "weekdays") return [1,2,3,4,5].includes(day);
  if (sched.mode === "custom") return Array.isArray(sched.days) ? sched.days.includes(day) : true;
  return true;
}

const DRAFT_KEY = "goalGrower:addGoalDraft:v1";
const DRAFT_TTL_MS = 5 * 60 * 1000;
const LAST_SAVED_KEY = "goalGrower:lastGoalSavedAt:v1";

const GoalsContext = createContext(null);

function baseLogs() {
  return {
    completion: {},
    numeric: {},
    timer: {},
    checklist: {},
    flex: { total: 0, entries: [] },
  };
}

function normalizeDraftForGoal(goalDraft) {
  const kind = goalDraft.kind || goalDraft.type || "completion";

  const base = {
    name: goalDraft.name || "New Goal",
    category: goalDraft.category || (Array.isArray(goalDraft.categories) ? goalDraft.categories[0] : "Custom") || "Custom",
    categories: Array.isArray(goalDraft.categories) ? goalDraft.categories : [goalDraft.category || "Custom"],
    kind,
    schedule: goalDraft.schedule || { mode: "everyday" },
    frequencyLabel: goalDraft.frequencyLabel || "Everyday",
    plan: goalDraft.plan || { when: "", where: "", cue: "", reward: "" },
    timeBound: goalDraft.timeBound || { enabled: false, startDate: null, endDate: null },
  };

  if (kind === "numeric") {
    return {
      ...base,
      measurable: {
        target: Number(goalDraft.measurable?.target ?? goalDraft.target ?? 1) || 1,
        unit: String(goalDraft.measurable?.unit ?? goalDraft.unit ?? "times"),
      },
    };
  }

  if (kind === "timer") {
    return {
      ...base,
      timer: { targetSeconds: Math.max(0, Number(goalDraft.timer?.targetSeconds ?? 600) || 600) },
    };
  }

  if (kind === "checklist") {
    const items = (goalDraft.checklist?.items || goalDraft.items || []).map((it, idx) => ({
      id: it.id || `item_${idx}_${uid()}`,
      text: String(it.text || "").trim(),
    })).filter((x) => x.text.length > 0);

    return {
      ...base,
      checklist: { items },
    };
  }

  if (kind === "flex") {
    const deadlineKey = goalDraft.flex?.deadlineKey || goalDraft.deadlineKey || toKey(new Date());
    return {
      ...base,
      schedule: { mode: "floating" },
      flex: {
        target: Number(goalDraft.flex?.target ?? goalDraft.target ?? 1) || 1,
        unit: String(goalDraft.flex?.unit ?? goalDraft.unit ?? "pages"),
        deadlineKey: isValidDateKey(deadlineKey) ? deadlineKey : toKey(new Date()),
        warnDays: goalDraft.flex?.warnDays ?? [7, 3, 1],
        benchmarks: Array.isArray(goalDraft.flex?.benchmarks) ? goalDraft.flex.benchmarks : [],
      },
    };
  }

  // completion default
  return base;
}

export function GoalsProvider({ children }) {
  const todayKey = useMemo(() => toKey(new Date()), []);
  const [selectedDateKey, setSelectedDateKey] = useState(todayKey);

  const [goals, setGoals] = useState([]);

  // --- Add Goal draft persistence (only keep < 5 minutes) ---
  const [draft, setDraft] = useState(null);
  const [draftLoaded, setDraftLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(DRAFT_KEY);
        if (!raw) { setDraftLoaded(true); return; }
        const parsed = JSON.parse(raw);
        const age = Date.now() - (parsed?.ts || 0);
        if (age > DRAFT_TTL_MS) {
          await AsyncStorage.removeItem(DRAFT_KEY);
          setDraft(null);
        } else {
          setDraft(parsed);
        }
      } catch {
        setDraft(null);
      } finally {
        setDraftLoaded(true);
      }
    })();
  }, []);

  const saveDraft = async (data) => {
    const payload = { ts: Date.now(), data };
    setDraft(payload);
    try { await AsyncStorage.setItem(DRAFT_KEY, JSON.stringify(payload)); } catch {}
  };

  const clearDraft = async () => {
    setDraft(null);
    try { await AsyncStorage.removeItem(DRAFT_KEY); } catch {}
  };

  const markJustSaved = async () => {
    try { await AsyncStorage.setItem(LAST_SAVED_KEY, String(Date.now())); } catch {}
  };

  const getLastSavedAt = async () => {
    try {
      const v = await AsyncStorage.getItem(LAST_SAVED_KEY);
      return Number(v) || 0;
    } catch {
      return 0;
    }
  };

  // --- Goal CRUD ---
  const addGoal = (goalDraft) => {
    const id = uid();
    const now = Date.now();

    const normalized = normalizeDraftForGoal(goalDraft);

    const goal = {
      id,
      createdAt: now,
      logs: baseLogs(),
      ...normalized,
    };

    setGoals((prev) => [goal, ...prev]);
    return id;
  };

  const updateGoal = (goalId, patch) => {
    setGoals((prev) =>
      prev.map((g) => {
        if (g.id !== goalId) return g;
        return { ...g, ...patch };
      })
    );
  };

  const saveGoalEdits = (goalId, goalDraft) => {
    setGoals((prev) =>
      prev.map((g) => {
        if (g.id !== goalId) return g;

        const next = normalizeDraftForGoal(goalDraft);

        // If kind changes, reset logs to avoid invalid “done” math
        const kindChanged = (next.kind || "completion") !== (g.kind || "completion");
        const logs = kindChanged ? baseLogs() : (g.logs || baseLogs());

        // Preserve flex progress if still flex
        if (!kindChanged && g.kind === "flex" && next.kind === "flex") {
          const existingFlex = g.logs?.flex || { total: 0, entries: [] };
          return { ...g, ...next, logs: { ...logs, flex: existingFlex } };
        }

        return { ...g, ...next, logs };
      })
    );
  };

  const getGoal = (goalId) => goals.find((g) => g.id === goalId);

  // --- Completion helpers ---
  const toggleCompletion = (goalId, dateKey = selectedDateKey) => {
    setGoals((prev) =>
      prev.map((g) => {
        if (g.id !== goalId) return g;
        const completion = { ...(g.logs?.completion || {}) };
        const cur = completion?.[dateKey]?.done === true;
        if (cur) {
          const next = { ...completion };
          delete next[dateKey];
          return { ...g, logs: { ...g.logs, completion: next } };
        }
        return { ...g, logs: { ...g.logs, completion: { ...completion, [dateKey]: { done: true } } } };
      })
    );
  };

  const setNumeric = (goalId, value, dateKey = selectedDateKey) => {
    const v = Number(value);
    const safe = Number.isFinite(v) ? v : 0;
    setGoals((prev) =>
      prev.map((g) => {
        if (g.id !== goalId) return g;
        const numeric = { ...(g.logs?.numeric || {}) };
        return { ...g, logs: { ...g.logs, numeric: { ...numeric, [dateKey]: { value: safe } } } };
      })
    );
  };

  const addTimerSeconds = (goalId, secondsToAdd, dateKey = selectedDateKey) => {
    const add = Math.max(0, Number(secondsToAdd) || 0);
    setGoals((prev) =>
      prev.map((g) => {
        if (g.id !== goalId) return g;
        const timer = { ...(g.logs?.timer || {}) };
        const cur = timer?.[dateKey]?.seconds ?? 0;
        return { ...g, logs: { ...g.logs, timer: { ...timer, [dateKey]: { seconds: cur + add } } } };
      })
    );
  };

  const toggleChecklistItem = (goalId, itemId, dateKey = selectedDateKey) => {
    setGoals((prev) =>
      prev.map((g) => {
        if (g.id !== goalId) return g;
        const checklist = { ...(g.logs?.checklist || {}) };
        const cur = new Set(checklist?.[dateKey]?.checkedIds || []);
        if (cur.has(itemId)) cur.delete(itemId);
        else cur.add(itemId);
        return { ...g, logs: { ...g.logs, checklist: { ...checklist, [dateKey]: { checkedIds: [...cur] } } } };
      })
    );
  };

  // --- Flexible deadline goals ---
  const addFlexProgress = (goalId, delta, dateKey = selectedDateKey) => {
    const d = Number(delta);
    const safe = Number.isFinite(d) ? d : 0;
    if (safe === 0) return;

    setGoals((prev) =>
      prev.map((g) => {
        if (g.id !== goalId) return g;
        if (g.kind !== "flex") return g;

        const flexLog = g.logs?.flex || { total: 0, entries: [] };
        const nextTotal = Math.max(0, (flexLog.total || 0) + safe);
        const nextEntries = [...(flexLog.entries || []), { dateKey, delta: safe }];

        return { ...g, logs: { ...g.logs, flex: { total: nextTotal, entries: nextEntries } } };
      })
    );
  };

  const flexIsComplete = (g) => {
    if (g.kind !== "flex") return false;
    const total = g.logs?.flex?.total ?? 0;
    const target = g.flex?.target ?? 0;
    return total >= target && target > 0;
  };

  const flexVisibleOnDate = (g, dateKey, todayKeyLocal) => {
    // Past dates: only show if progress entry exists that day
    if (dateKey < todayKeyLocal) {
      return (g.logs?.flex?.entries || []).some((e) => e.dateKey === dateKey);
    }
    // Today/future: show until complete, within active range and before deadline
    const deadlineKey = g.flex?.deadlineKey;
    if (deadlineKey && dateKey > deadlineKey) return false;
    if (flexIsComplete(g)) return false;
    return true;
  };

  const flexWarning = (g, dateKey) => {
    if (g.kind !== "flex") return null;
    if (flexIsComplete(g)) return null;

    const deadlineKey = g.flex?.deadlineKey;
    if (!deadlineKey) return null;

    const d0 = fromKey(dateKey);
    const dl = fromKey(deadlineKey);
    const left = daysBetween(d0, dl);

    const warnDays = g.flex?.warnDays || [7, 3, 1];
    const shouldWarn = warnDays.includes(left) || left <= 0;
    if (!shouldWarn) return null;

    const remaining = Math.max(0, (g.flex?.target ?? 0) - (g.logs?.flex?.total ?? 0));
    return { daysLeft: left, remaining };
  };

  // --- Derived list for the selected day ---
  const getGoalsForDate = (dateKey = selectedDateKey) => {
    const date = fromKey(dateKey);
    const todayK = toKey(new Date());

    const scheduled = goals
      .filter((g) => g.schedule?.mode !== "floating")
      .filter((g) => isWithinActiveRange(g, date))
      .filter((g) => isScheduledOn(g, date));

    const floating = goals
      .filter((g) => g.schedule?.mode === "floating" && g.kind === "flex")
      .filter((g) => isWithinActiveRange(g, date))
      .filter((g) => flexVisibleOnDate(g, dateKey, todayK));

    return { scheduled, floating };
  };

  // --- Day done logic (for list droplet fill) ---
  const isDoneForDay = (g, dateKey = selectedDateKey) => {
    if (g.kind === "completion") return !!g.logs?.completion?.[dateKey]?.done;
    if (g.kind === "numeric") return (g.logs?.numeric?.[dateKey]?.value ?? 0) >= (g.measurable?.target ?? 0);
    if (g.kind === "timer") return (g.logs?.timer?.[dateKey]?.seconds ?? 0) >= (g.timer?.targetSeconds ?? 0);
    if (g.kind === "checklist") {
      const ids = g.checklist?.items?.map((x) => x.id) || [];
      if (!ids.length) return false;
      const checked = new Set(g.logs?.checklist?.[dateKey]?.checkedIds || []);
      return ids.every((id) => checked.has(id));
    }
    if (g.kind === "flex") return flexIsComplete(g);
    return false;
  };

  // --- Simple stats helpers (7-day done count + streak) ---
  const getLast7Keys = (dateKey = selectedDateKey) =>
    Array.from({ length: 7 }, (_, i) => addDaysKey(dateKey, -(6 - i)));

  const getStreak = (g, dateKey = selectedDateKey) => {
    let streak = 0;
    let k = dateKey;
    for (let i = 0; i < 365; i++) {
      if (!isDoneForDay(g, k)) break;
      streak += 1;
      k = addDaysKey(k, -1);
    }
    return streak;
  };

  // --- Add flow reset helpers (after saving) ---
  const resetAddFlow = async () => {
    await clearDraft();
    await markJustSaved();
  };

  const value = useMemo(
    () => ({
      goals,
      getGoal,
      selectedDateKey,
      setSelectedDateKey,

      addGoal,
      updateGoal,
      saveGoalEdits,

      // actions
      toggleCompletion,
      setNumeric,
      addTimerSeconds,
      toggleChecklistItem,
      addFlexProgress,

      // helpers
      getGoalsForDate,
      isDoneForDay,
      flexWarning,
      getLast7Keys,
      getStreak,
      addDaysKey,

      // draft
      draft,
      draftLoaded,
      saveDraft,
      clearDraft,
      resetAddFlow,
      getLastSavedAt,
    }),
    [goals, selectedDateKey, draft, draftLoaded]
  );

  return <GoalsContext.Provider value={value}>{children}</GoalsContext.Provider>;
}

export function useGoals() {
  const ctx = useContext(GoalsContext);
  if (!ctx) throw new Error("useGoals must be used inside GoalsProvider");
  return ctx;
}