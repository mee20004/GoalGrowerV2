// screens/AddGoalScreen.js
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Modal,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import Page from "../components/Page";
import { theme } from "../theme";
import { useGoals, toKey } from "../components/GoalsStore";

/**
 * Goal Grower — Add Goal Wizard (non-scrolling, paged)
 * - Keeps dot progress UI
 * - Adapts questions based on goal type (HabitNow-like)
 * - Multi-select categories
 * - Checklist add/remove items
 * - Flexible "By deadline" goals with optional benchmarks
 * - Help/tutorial overlay that explains each page + highlights the section
 * - Safe bottom spacing so tab bar remains readable/usable on any device
 * - Draft restores only if < 5 minutes (handled by GoalsStore); clears after save
 * - Resets back to first page after a goal is planted
 */

const CATEGORY_CHOICES = ["Body", "Mind", "Spirit", "Work", "Custom"];

/**
 * Types:
 * - completion: done/not-done per day
 * - numeric: track value per day
 * - timer: track minutes per day
 * - checklist: complete multiple items per day
 * - flex: flexible progress until deadline (shows each day until finished)
 */
const TYPE_CARDS = [
  { key: "completion", title: "Check-off", desc: "Mark it done for the day." },
  { key: "numeric", title: "Number", desc: "Track a value (pages, cups, reps)." },
  { key: "timer", title: "Timer", desc: "Track minutes of effort." },
  { key: "checklist", title: "Checklist", desc: "Complete several items." },
  { key: "flex", title: "By deadline", desc: "Flexible progress until a due date." },
];

const WHEN_SUGGEST = ["Morning", "After class", "After lunch", "Evening", "Before bed"];
const WHERE_SUGGEST = ["Desk", "Home", "Gym", "Library", "Kitchen"];
const CUE_SUGGEST = ["After brushing teeth", "After scripture study", "After breakfast", "After shower"];
const REWARD_SUGGEST = ["Tea", "5-minute break", "Music", "Stretching"];

const DAY_LABELS = ["S", "M", "T", "W", "Th", "F", "Sa"];

function stableStringify(obj) {
  try {
    return JSON.stringify(obj);
  } catch {
    return "";
  }
}

function uid(prefix = "i") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function endOfWeekKey() {
  const now = new Date();
  const d = new Date(now);
  const day = d.getDay(); // 0..6
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + (6 - day));
  return toKey(d);
}

function endOfMonthKey() {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  end.setHours(0, 0, 0, 0);
  return toKey(end);
}

function isValidDateKey(s) {
  // YYYY-MM-DD
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return false;
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

function Pill({ label, active, onPress }) {
  return (
    <Pressable onPress={onPress} style={[styles.pill, active && styles.pillActive]}>
      <Text style={[styles.pillText, active && styles.pillTextActive]}>{label}</Text>
    </Pressable>
  );
}

function PrimaryButton({ label, onPress, disabled }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={[styles.primaryBtn, disabled && { opacity: 0.55 }]}>
      <Text style={styles.primaryBtnText}>{label}</Text>
    </Pressable>
  );
}

function GhostButton({ label, onPress, disabled }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={[styles.ghostBtn, disabled && { opacity: 0.55 }]}>
      <Text style={styles.ghostBtnText}>{label}</Text>
    </Pressable>
  );
}

function Dot({ state }) {
  return (
    <View
      style={[
        styles.dot,
        state === "active" && { backgroundColor: theme.accent, borderColor: theme.accent },
        state === "done" && { backgroundColor: theme.text2, borderColor: theme.text2 },
      ]}
    />
  );
}

function CoachMark({ visible, title, body, onClose }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.coachOverlay}>
        <Pressable style={styles.coachBackdrop} onPress={onClose} />
        <View style={styles.coachCard}>
          <Text style={styles.coachTitle}>{title}</Text>
          <Text style={styles.coachBody}>{body}</Text>
          <View style={{ height: 12 }} />
          <PrimaryButton label="Got it" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

export default function AddGoalScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const store = useGoals();

  // IMPORTANT: these are expected to exist in your GoalsStore (you already have them wired)
  const { addGoal, draft, draftLoaded, saveDraft, clearDraft } = store;

  // Steps: 0 seed, 1 track, 2 schedule, 3 plan(opt), 4 why(opt), 5 review
  const STEPS = useMemo(
    () => [
      {
        key: "seed",
        title: "Plant A Goal",
        subtitle: "Give your goal a clear name so it’s easy to recognize.",
      },
      {
        key: "track",
        title: "How will you measure growth?",
        subtitle: "Simple checkmark or a quantity you count.",
      },
      {
        key: "schedule",
        title: "When will you water it?",
        subtitle: "Pick the days this goal shows up.",
      },
      {
        key: "plan",
        title: "Make it easy",
        subtitle: "Attach it to a routine (optional, but powerful).",
        optional: true,
      },
      {
        key: "why",
        title: "Why does it matter?",
        subtitle: "A quick reason helps on low-motivation days (optional).",
        optional: true,
      },
      {
        key: "review",
        title: "Plant it",
        subtitle: "Review and save. You can refine later as it grows.",
      },
    ],
    []
  );

  const [step, setStep] = useState(0);

  // --- Core fields
  const [kind, setKind] = useState("completion");
  const [name, setName] = useState("");
  const [categories, setCategories] = useState(["Custom"]);

  // schedule: everyday | weekdays | custom
  const [scheduleMode, setScheduleMode] = useState("everyday");
  const [days, setDays] = useState([1, 2, 3, 4, 5]);

  // numeric
  const [target, setTarget] = useState("1");
  const [unit, setUnit] = useState("times");

  // timer
  const [minutes, setMinutes] = useState("10");

  // checklist
  const [checkItems, setCheckItems] = useState([
    { id: uid("c"), text: "" },
    { id: uid("c"), text: "" },
  ]);

  // plan (routine)
  const [whenStr, setWhenStr] = useState("");
  const [whereStr, setWhereStr] = useState("");
  const [cueStr, setCueStr] = useState("");
  const [rewardStr, setRewardStr] = useState("");
  const [whyStr, setWhyStr] = useState("");

  // flex
  const [flexTarget, setFlexTarget] = useState("5");
  const [flexUnit, setFlexUnit] = useState("pages");
  const [deadlinePreset, setDeadlinePreset] = useState("month"); // week | month | custom
  const [customDeadline, setCustomDeadline] = useState(endOfMonthKey());
  const [benchmarksEnabled, setBenchmarksEnabled] = useState(false);
  const [benchmarks, setBenchmarks] = useState([]);

  // help
  const [helpOpen, setHelpOpen] = useState(false);

  const deadlineKey = useMemo(() => {
    if (deadlinePreset === "week") return endOfWeekKey();
    if (deadlinePreset === "month") return endOfMonthKey();
    return customDeadline;
  }, [deadlinePreset, customDeadline]);

  const frequencyLabel = useMemo(() => {
    if (kind === "flex") return "By deadline";
    if (scheduleMode === "everyday") return "Everyday";
    if (scheduleMode === "weekdays") return "Weekdays";
    const map = { 0: "S", 1: "M", 2: "T", 3: "W", 4: "Th", 5: "F", 6: "Sa" };
    return [...days].sort((a, b) => a - b).map((d) => map[d]).join("");
  }, [kind, scheduleMode, days]);

  const typeTitle = useMemo(() => {
    const found = TYPE_CARDS.find((t) => t.key === kind);
    return found ? found.title : "Goal";
  }, [kind]);

  const toggleCategory = (c) => {
    setCategories((prev) => {
      const has = prev.includes(c);
      const next = has ? prev.filter((x) => x !== c) : [...prev, c];
      return next.length ? next : ["Custom"];
    });
  };

  const toggleDay = (d) => {
    setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  };

  const addChecklistItem = () => setCheckItems((prev) => [...prev, { id: uid("c"), text: "" }]);

  const removeChecklistItem = (id) => {
    setCheckItems((prev) => {
      const next = prev.filter((x) => x.id !== id);
      return next.length ? next : [{ id: uid("c"), text: "" }];
    });
  };

  const addBenchmark = () => {
    setBenchmarks((prev) => [
      ...prev,
      {
        id: uid("b"),
        amount: String(Math.max(1, Number(flexTarget) || 1)),
        dateKey: deadlineKey,
      },
    ]);
  };

  const removeBenchmark = (id) => setBenchmarks((prev) => prev.filter((b) => b.id !== id));

  const updateBenchmark = (id, patch) => {
    setBenchmarks((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  };

  const resetWizard = useCallback(() => {
    setStep(0);
    setKind("completion");
    setName("");
    setCategories(["Custom"]);
    setScheduleMode("everyday");
    setDays([1, 2, 3, 4, 5]);
    setTarget("1");
    setUnit("times");
    setMinutes("10");
    setCheckItems([
      { id: uid("c"), text: "" },
      { id: uid("c"), text: "" },
    ]);
    setWhenStr("");
    setWhereStr("");
    setCueStr("");
    setRewardStr("");
    setWhyStr("");
    setFlexTarget("5");
    setFlexUnit("pages");
    setDeadlinePreset("month");
    setCustomDeadline(endOfMonthKey());
    setBenchmarksEnabled(false);
    setBenchmarks([]);
    setHelpOpen(false);
  }, []);

  // --- Draft restore (GoalsStore handles 5-min staleness)
  const [restoredOnce, setRestoredOnce] = useState(false);
  const lastSavedRef = useRef("");
  const saveTimerRef = useRef(null);

  useEffect(() => {
    if (draftLoaded === false) return;
    if (restoredOnce) return;

    if (!draft?.data) {
      setRestoredOnce(true);
      return;
    }

    const d = draft.data;

    setStep(d.step ?? 0);
    setKind(d.kind ?? "completion");
    setName(d.name ?? "");
    setCategories(d.categories ?? (d.category ? [d.category] : ["Custom"]));

    setScheduleMode(d.scheduleMode ?? "everyday");
    setDays(d.days ?? [1, 2, 3, 4, 5]);

    setTarget(d.target ?? "1");
    setUnit(d.unit ?? "times");

    setMinutes(d.minutes ?? "10");

    setCheckItems(
      Array.isArray(d.checkItems) && d.checkItems.length
        ? d.checkItems
        : [
            { id: uid("c"), text: "" },
            { id: uid("c"), text: "" },
          ]
    );

    setWhenStr(d.whenStr ?? "");
    setWhereStr(d.whereStr ?? "");
    setCueStr(d.cueStr ?? "");
    setRewardStr(d.rewardStr ?? "");
    setWhyStr(d.whyStr ?? "");

    setFlexTarget(d.flexTarget ?? "5");
    setFlexUnit(d.flexUnit ?? "pages");
    setDeadlinePreset(d.deadlinePreset ?? "month");
    setCustomDeadline(d.customDeadline ?? endOfMonthKey());

    setBenchmarksEnabled(!!d.benchmarksEnabled);
    setBenchmarks(Array.isArray(d.benchmarks) ? d.benchmarks : []);

    setRestoredOnce(true);
  }, [draftLoaded, draft, restoredOnce]);

  const draftPayload = useMemo(
    () => ({
      step,
      kind,
      name,
      categories,
      scheduleMode,
      days,
      target,
      unit,
      minutes,
      checkItems,
      whenStr,
      whereStr,
      cueStr,
      rewardStr,
      whyStr,
      flexTarget,
      flexUnit,
      deadlinePreset,
      customDeadline,
      benchmarksEnabled,
      benchmarks,
    }),
    [
      step,
      kind,
      name,
      categories,
      scheduleMode,
      days,
      target,
      unit,
      minutes,
      checkItems,
      whenStr,
      whereStr,
      cueStr,
      rewardStr,
      whyStr,
      flexTarget,
      flexUnit,
      deadlinePreset,
      customDeadline,
      benchmarksEnabled,
      benchmarks,
    ]
  );

  useEffect(() => {
    if (draftLoaded === false) return;
    if (!restoredOnce) return;
    if (!saveDraft) return;

    const str = stableStringify(draftPayload);
    if (str === lastSavedRef.current) return;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

    saveTimerRef.current = setTimeout(() => {
      lastSavedRef.current = str;
      saveDraft(draftPayload);
    }, 300);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [draftPayload, draftLoaded, restoredOnce, saveDraft]);

  // When you return to this tab after planting, keep it clean
  const justPlantedRef = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (justPlantedRef.current) {
        justPlantedRef.current = false;
        resetWizard();
      }
      return () => {};
    }, [resetWizard])
  );

  // --- Step validation
  const stepValid = useMemo(() => {
    if (step === 0) return true;

    if (step === 1) {
      if (name.trim().length < 2) return false;
      if (!categories.length) return false;
      return true;
    }

    if (step === 2) {
      if (kind === "numeric") return Number(target) > 0 && unit.trim().length >= 1;
      if (kind === "timer") return Number(minutes) > 0;
      if (kind === "checklist") return checkItems.some((x) => x.text.trim().length >= 2);
      if (kind === "flex") return Number(flexTarget) > 0 && flexUnit.trim().length >= 1;
      return true;
    }

    if (step === 3) {
      if (kind === "flex") {
        if (!isValidDateKey(deadlineKey)) return false;
        if (benchmarksEnabled) {
          for (const b of benchmarks) {
            if (!(Number(b.amount) > 0)) return false;
            if (!isValidDateKey(b.dateKey)) return false;
          }
        }
        return true;
      }
      if (scheduleMode === "custom") return days.length >= 1;
      return true;
    }

    return true;
  }, [
    step,
    kind,
    name,
    categories,
    target,
    unit,
    minutes,
    checkItems,
    flexTarget,
    flexUnit,
    deadlineKey,
    scheduleMode,
    days,
    benchmarksEnabled,
    benchmarks,
  ]);

  const dots = useMemo(() => {
    return Array.from({ length: totalSteps }, (_, i) => {
      const state = i < step ? "done" : i === step ? "active" : "todo";
      return <Dot key={i} state={state} />;
    });
  }, [totalSteps, step]);

  const helpCopy = useMemo(() => {
    const common = "Tip: You can always edit later.";
    if (step === 0) return { title: "Choose a goal type", body: "Pick how you want to track it.\n\n" + common };
    if (step === 1) return { title: "Name + categories", body: "Short + clear.\n\n" + common };
    if (step === 2) return { title: "Set the target", body: "Define what “done” means.\n\n" + common };
    if (step === 3)
      return {
        title: kind === "flex" ? "Deadline + benchmarks" : "Schedule",
        body:
          (kind === "flex"
            ? "Deadline goals show daily until finished.\n\n"
            : "Choose the days it should appear.\n\n") + common,
      };
    if (step === 4) return { title: "Add a plan", body: "Optional structure helps.\n\n" + common };
    return { title: "Review + plant", body: "You’re ready.\n\n" + common };
  }, [step, kind]);

  const saveGoal = async () => {
    const category = categories[0] || "Custom";
    const base = {
      name: name.trim() || "New Goal",
      category,
      categories,
      kind,
      frequencyLabel,
      plan: {
        when: whenStr.trim(),
        where: whereStr.trim(),
        cue: cueStr.trim(),
        reward: rewardStr.trim(),
        why: whyStr.trim(),
      },
    };

    let payload = base;

    if (kind === "completion") {
      payload = { ...base, schedule: { mode: scheduleMode, days } };
    } else if (kind === "numeric") {
      payload = {
        ...base,
        schedule: { mode: scheduleMode, days },
        measurable: { target: Number(target), unit: unit.trim() },
      };
    } else if (kind === "timer") {
      payload = {
        ...base,
        schedule: { mode: scheduleMode, days },
        timer: { targetSeconds: Math.round(Number(minutes) * 60) },
      };
    } else if (kind === "checklist") {
      const cleanItems = checkItems
        .filter((x) => x.text.trim().length)
        .map((x, idx) => ({ id: x.id || uid(`c${idx}`), text: x.text.trim() }));
      payload = { ...base, schedule: { mode: scheduleMode, days }, checklist: { items: cleanItems } };
    } else if (kind === "flex") {
      const cleanBenchmarks = (benchmarksEnabled ? benchmarks : [])
        .filter((b) => Number(b.amount) > 0 && isValidDateKey(b.dateKey))
        .map((b) => ({ id: b.id || uid("b"), amount: Number(b.amount), dateKey: b.dateKey }));
      payload = {
        ...base,
        schedule: { mode: "floating" },
        flex: {
          target: Number(flexTarget),
          unit: flexUnit.trim(),
          deadlineKey,
          warnDays: [7, 3, 1],
          benchmarks: cleanBenchmarks,
        },
      };
    }

    const id = addGoal(payload);
    if (clearDraft) await clearDraft();
    justPlantedRef.current = true;
    navigation.navigate("Goals", { screen: "Goal", params: { goalId: id } });
  };

  const goNext = () => setStep((s) => Math.min(totalSteps - 1, s + 1));
  const goPrev = () => setStep((s) => Math.max(0, s - 1));
  const showSkip = step === 4;

  const bottomPad = Math.max(12, insets.bottom + 8);

  return (
    <Page>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} style={styles.headerBtn}>
            <Text style={styles.headerBtnText}>Cancel</Text>
          </Pressable>

          <View style={{ alignItems: "center" }}>
            <Text style={styles.headerTitle}>Plant a Goal</Text>
            <Text style={styles.headerSub}>{typeTitle}</Text>
          </View>

          <Pressable onPress={() => setHelpOpen(true)} style={styles.headerBtn}>
            <Text style={styles.headerBtnText}>Help</Text>
          </Pressable>
        </View>

        {/* Dots */}
        <View style={styles.dotsRow}>{dots}</View>

        {/* Content */}
        <View style={styles.content}>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingBottom: 12 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          >
            <View style={styles.card}>
              {/* STEP 0 — TYPE */}
              {step === 0 && (
                <View style={styles.stepBlock}>
                  <Text style={styles.title}>Choose what you’re growing</Text>
                  <Text style={styles.helper}>Pick one — the next pages adapt automatically.</Text>

                  <View style={styles.typeGrid}>
                    {TYPE_CARDS.map((t) => {
                      const active = kind === t.key;
                      return (
                        <Pressable
                          key={t.key}
                          onPress={() => setKind(t.key)}
                          style={[styles.typeCard, active && styles.typeCardActive]}
                        >
                          <Text style={[styles.typeTitle, active && styles.typeTitleActive]}>{t.title}</Text>
                          <Text style={[styles.typeDesc, active && styles.typeDescActive]}>{t.desc}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              )}

              {/* STEP 1 — BASICS */}
              {step === 1 && (
                <View style={styles.stepBlock}>
                  <Text style={styles.title}>Name your seed</Text>
                  <Text style={styles.helper}>Short, clear, and motivating.</Text>

                  <Text style={styles.label}>Goal name</Text>
                  <TextInput
                    value={name}
                    onChangeText={setName}
                    placeholder="Read 5 pages"
                    placeholderTextColor={theme.muted2}
                    style={styles.input}
                  />

                  <Text style={[styles.label, { marginTop: 14 }]}>Categories (choose any)</Text>
                  <Text style={styles.helperTiny}>Multi-select helps filtering + stats later.</Text>

                  <View style={styles.pillRow}>
                    {CATEGORY_CHOICES.map((c) => (
                      <Pill key={c} label={c} active={categories.includes(c)} onPress={() => toggleCategory(c)} />
                    ))}
                  </View>
                </View>
              )}

              {/* STEP 2 — CONFIG */}
              {step === 2 && (
                <View style={styles.stepBlock}>
                  {kind === "completion" && (
                    <>
                      <Text style={styles.title}>Check-off style</Text>
                      <Text style={styles.helper}>You’ll tap a checkmark to complete today.</Text>
                    </>
                  )}

                  {kind === "numeric" && (
                    <>
                      <Text style={styles.title}>Set a daily target</Text>
                      <Text style={styles.helper}>What number counts as “done”?</Text>

                      <View style={styles.twoCol}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.label}>Target</Text>
                          <TextInput
                            value={target}
                            onChangeText={setTarget}
                            keyboardType="numeric"
                            placeholder="5"
                            placeholderTextColor={theme.muted2}
                            style={styles.input}
                          />
                        </View>

                        <View style={{ width: 12 }} />

                        <View style={{ flex: 1 }}>
                          <Text style={styles.label}>Unit</Text>
                          <TextInput
                            value={unit}
                            onChangeText={setUnit}
                            placeholder="pages"
                            placeholderTextColor={theme.muted2}
                            style={styles.input}
                          />
                        </View>
                      </View>
                    </>
                  )}

                  {kind === "timer" && (
                    <>
                      <Text style={styles.title}>Set a time goal</Text>
                      <Text style={styles.helper}>How many minutes should count as done?</Text>

                      <Text style={styles.label}>Minutes</Text>
                      <TextInput
                        value={minutes}
                        onChangeText={setMinutes}
                        keyboardType="numeric"
                        placeholder="10"
                        placeholderTextColor={theme.muted2}
                        style={styles.input}
                      />
                    </>
                  )}

                  {kind === "checklist" && (
                    <>
                      <Text style={styles.title}>Checklist items</Text>
                      <Text style={styles.helper}>Add or remove items — keep it realistic.</Text>

                      {checkItems.slice(0, 8).map((it, idx) => (
                        <View key={it.id} style={{ marginTop: idx === 0 ? 12 : 10 }}>
                          <View style={styles.rowBetween}>
                            <Text style={styles.label}>Item {idx + 1}</Text>

                            <Pressable onPress={() => removeChecklistItem(it.id)} style={styles.smallBtn}>
                              <Text style={styles.smallBtnText}>Remove</Text>
                            </Pressable>
                          </View>

                          <TextInput
                            value={it.text}
                            onChangeText={(txt) =>
                              setCheckItems((prev) => prev.map((x) => (x.id === it.id ? { ...x, text: txt } : x)))
                            }
                            placeholder="Example: Stretch"
                            placeholderTextColor={theme.muted2}
                            style={styles.input}
                          />
                        </View>
                      ))}

                      <View style={{ marginTop: 12 }}>
                        <GhostButton label="+ Add checklist item" onPress={addChecklistItem} />
                      </View>
                    </>
                  )}

                  {kind === "flex" && (
                    <>
                      <Text style={styles.title}>Flexible progress</Text>
                      <Text style={styles.helper}>Shows daily until finished.</Text>

                      <View style={styles.twoCol}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.label}>Total target</Text>
                          <TextInput
                            value={flexTarget}
                            onChangeText={setFlexTarget}
                            keyboardType="numeric"
                            placeholder="30"
                            placeholderTextColor={theme.muted2}
                            style={styles.input}
                          />
                        </View>

                        <View style={{ width: 12 }} />

                        <View style={{ flex: 1 }}>
                          <Text style={styles.label}>Unit</Text>
                          <TextInput
                            value={flexUnit}
                            onChangeText={setFlexUnit}
                            placeholder="pages"
                            placeholderTextColor={theme.muted2}
                            style={styles.input}
                          />
                        </View>
                      </View>
                    </>
                  )}
                </View>
              )}

              {/* STEP 3 — SCHEDULE / DEADLINE */}
              {step === 3 && (
                <View style={styles.stepBlock}>
                  {kind === "flex" ? (
                    <>
                      <Text style={styles.title}>Choose a deadline</Text>
                      <Text style={styles.helper}>We’ll keep it visible each day until it’s complete.</Text>

                      <View style={styles.pillRow}>
                        <Pill label="End of week" active={deadlinePreset === "week"} onPress={() => setDeadlinePreset("week")} />
                        <Pill label="End of month" active={deadlinePreset === "month"} onPress={() => setDeadlinePreset("month")} />
                        <Pill label="Custom" active={deadlinePreset === "custom"} onPress={() => setDeadlinePreset("custom")} />
                      </View>

                      {deadlinePreset === "custom" && (
                        <>
                          <Text style={[styles.helperTiny, { marginTop: 10 }]}>Date (YYYY-MM-DD)</Text>
                          <TextInput
                            value={customDeadline}
                            onChangeText={setCustomDeadline}
                            placeholder="2026-03-28"
                            placeholderTextColor={theme.muted2}
                            style={styles.input}
                          />
                          {!isValidDateKey(customDeadline) && <Text style={styles.warnText}>Enter a valid date like 2026-03-28</Text>}
                        </>
                      )}

                      <View style={{ marginTop: 14 }}>
                        <View style={styles.rowBetween}>
                          <Text style={styles.label}>Benchmarks (optional)</Text>
                          <Pressable
                            onPress={() => setBenchmarksEnabled((v) => !v)}
                            style={[styles.smallToggle, benchmarksEnabled && styles.smallToggleActive]}
                          >
                            <Text style={[styles.smallToggleText, benchmarksEnabled && styles.smallToggleTextActive]}>
                              {benchmarksEnabled ? "On" : "Off"}
                            </Text>
                          </Pressable>
                        </View>

                        {benchmarksEnabled && (
                          <>
                            {benchmarks.map((b, idx) => (
                              <View key={b.id} style={{ marginTop: 10 }}>
                                <View style={styles.rowBetween}>
                                  <Text style={styles.helperTiny}>Benchmark {idx + 1}</Text>
                                  <Pressable onPress={() => removeBenchmark(b.id)} style={styles.smallBtn}>
                                    <Text style={styles.smallBtnText}>Remove</Text>
                                  </Pressable>
                                </View>

                                <View style={styles.twoCol}>
                                  <View style={{ flex: 1 }}>
                                    <Text style={styles.label}>Amount</Text>
                                    <TextInput
                                      value={String(b.amount ?? "")}
                                      onChangeText={(txt) => updateBenchmark(b.id, { amount: txt })}
                                      keyboardType="numeric"
                                      placeholder="10"
                                      placeholderTextColor={theme.muted2}
                                      style={styles.input}
                                    />
                                  </View>

                                  <View style={{ width: 12 }} />

                                  <View style={{ flex: 1 }}>
                                    <Text style={styles.label}>Date</Text>
                                    <TextInput
                                      value={String(b.dateKey ?? "")}
                                      onChangeText={(txt) => updateBenchmark(b.id, { dateKey: txt })}
                                      placeholder="2026-03-10"
                                      placeholderTextColor={theme.muted2}
                                      style={styles.input}
                                    />
                                  </View>
                                </View>

                                {(!isValidDateKey(b.dateKey) || !(Number(b.amount) > 0)) && (
                                  <Text style={styles.warnText}>Benchmark needs a valid date + amount.</Text>
                                )}
                              </View>
                            ))}

                            <View style={{ marginTop: 12 }}>
                              <GhostButton label="+ Add benchmark" onPress={addBenchmark} />
                            </View>
                          </>
                        )}
                      </View>
                    </>
                  ) : (
                    <>
                      <Text style={styles.title}>When should it appear?</Text>
                      <Text style={styles.helper}>Pick the days it should show up.</Text>

                      <View style={styles.pillRow}>
                        <Pill label="Everyday" active={scheduleMode === "everyday"} onPress={() => setScheduleMode("everyday")} />
                        <Pill label="Weekdays" active={scheduleMode === "weekdays"} onPress={() => setScheduleMode("weekdays")} />
                        <Pill label="Custom" active={scheduleMode === "custom"} onPress={() => setScheduleMode("custom")} />
                      </View>

                      {scheduleMode === "custom" && (
                        <View style={{ marginTop: 12 }}>
                          <Text style={styles.label}>Days</Text>
                          <View style={styles.daysRow}>
                            {DAY_LABELS.map((lbl, idx) => (
                              <Pill key={lbl} label={lbl} active={days.includes(idx)} onPress={() => toggleDay(idx)} />
                            ))}
                          </View>
                        </View>
                      )}
                    </>
                  )}
                </View>
              )}

              {/* STEP 4 — PLAN (optional / skippable) */}
              {step === 4 && (
                <View style={styles.stepBlock}>
                  <Text style={styles.title}>Add sunlight (optional)</Text>
                  <Text style={styles.helper}>A tiny plan makes this easier — you can skip.</Text>

                  <Text style={styles.label}>When</Text>
                  <TextInput
                    value={whenStr}
                    onChangeText={setWhenStr}
                    placeholder="Morning"
                    placeholderTextColor={theme.muted2}
                    style={styles.input}
                  />

                  <Text style={styles.label}>Where</Text>
                  <TextInput
                    value={whereStr}
                    onChangeText={setWhereStr}
                    placeholder="Desk"
                    placeholderTextColor={theme.muted2}
                    style={styles.input}
                  />

                  <Text style={styles.label}>Cue (optional)</Text>
                  <TextInput
                    value={cueStr}
                    onChangeText={setCueStr}
                    placeholder="After brushing teeth…"
                    placeholderTextColor={theme.muted2}
                    style={styles.input}
                  />

                  <Text style={styles.label}>Reward (optional)</Text>
                  <TextInput
                    value={rewardStr}
                    onChangeText={setRewardStr}
                    placeholder="Tea, 5-minute break…"
                    placeholderTextColor={theme.muted2}
                    style={styles.input}
                  />

                  <Text style={styles.label}>Why this matters (optional)</Text>
                  <TextInput
                    value={whyStr}
                    onChangeText={setWhyStr}
                    placeholder="Because I want to…"
                    placeholderTextColor={theme.muted2}
                    style={[styles.input, { height: 80 }]}
                    multiline
                  />
                </View>
              )}

              {/* STEP 5 — REVIEW */}
              {step === 5 && (
                <View style={styles.stepBlock}>
                  <Text style={styles.title}>Review</Text>
                  <Text style={styles.helper}>Everything looks good? Plant it.</Text>

                  <View style={{ height: 10 }} />

                  <Text style={styles.reviewLine}>
                    <Text style={styles.reviewLabel}>Goal:</Text> {name || "—"}
                  </Text>

                  <Text style={styles.reviewLine}>
                    <Text style={styles.reviewLabel}>Type:</Text> {typeTitle}
                  </Text>

                  <Text style={styles.reviewLine}>
                    <Text style={styles.reviewLabel}>Category:</Text> {categories?.length ? categories.join(", ") : "—"}
                  </Text>

                  <Text style={styles.reviewLine}>
                    <Text style={styles.reviewLabel}>Schedule:</Text> {frequencyLabel}
                  </Text>

                  {kind === "numeric" ? (
                    <Text style={styles.reviewLine}>
                      <Text style={styles.reviewLabel}>Target:</Text> {target} {unit}
                    </Text>
                  ) : null}

                  {kind === "timer" ? (
                    <Text style={styles.reviewLine}>
                      <Text style={styles.reviewLabel}>Time:</Text> {minutes} min
                    </Text>
                  ) : null}

                  {kind === "checklist" ? (
                    <View style={{ marginTop: 10 }}>
                      <Text style={styles.reviewLabel}>Checklist:</Text>
                      {checkItems
                        .filter((x) => x.text.trim().length)
                        .slice(0, 8)
                        .map((x) => (
                          <Text key={x.id} style={styles.reviewBullet}>
                            • {x.text.trim()}
                          </Text>
                        ))}
                    </View>
                  ) : null}

                  {kind === "flex" ? (
                    <Text style={styles.reviewLine}>
                      <Text style={styles.reviewLabel}>Deadline:</Text> {deadlineKey}
                    </Text>
                  ) : null}

                  {(whenStr || whereStr || cueStr || rewardStr) ? (
                    <View style={{ marginTop: 12 }}>
                      <Text style={styles.reviewLabel}>Plan:</Text>
                      <Text style={styles.reviewSmall}>
                        {[
                          whenStr && `When: ${whenStr}`,
                          whereStr && `Where: ${whereStr}`,
                          cueStr && `Cue: ${cueStr}`,
                          rewardStr && `Reward: ${rewardStr}`,
                        ]
                          .filter(Boolean)
                          .join(" • ")}
                      </Text>
                    </View>
                  ) : null}
                </View>
              )}
            </View>
          </ScrollView>

          {/* Buttons fixed below scroll, safely padded for tab bar */}
          <View style={[styles.footer, { paddingBottom: bottomPad }]}>
            <GhostButton
              label={step === 0 ? "Back" : "Previous"}
              onPress={() => (step === 0 ? navigation.goBack() : goPrev())}
            />

            {showSkip && <GhostButton label="Skip" onPress={() => setStep(5)} />}

            {step < totalSteps - 1 ? (
              <PrimaryButton label="Next" onPress={goNext} disabled={!stepValid} />
            ) : (
              <PrimaryButton label="Plant Goal" onPress={saveGoal} disabled={!stepValid} />
            )}
          </View>
        </View>

        {/* Help overlay */}
        <CoachMark visible={helpOpen} title={helpCopy.title} body={helpCopy.body} onClose={() => setHelpOpen(false)} />
      </KeyboardAvoidingView>
    </Page>
  );
}

const styles = StyleSheet.create({
  // Header hierarchy
  headerRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 10 },
  hTitle: { fontSize: 25, fontWeight: "800", color: theme.text },
  hSub: { marginTop: 8, fontSize: 15, fontWeight: "600", color: theme.muted2, lineHeight: 16 },

  helpBtn: {
    height: 36,
    paddingHorizontal: 12,
    borderRadius: theme.radius,
    backgroundColor: theme.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  helpBtnText: { fontSize: 12, fontWeight: "700", color: theme.muted },

  // Progress dots
  dotsRow: { flexDirection: "row", alignItems: "center", marginBottom: 12, marginTop: 15 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: theme.outline, marginRight: 8 },
  dotDone: { backgroundColor: theme.text2 },
  dotActive: { backgroundColor: theme.accent },

  content: { flex: 1, minHeight: 0 },

  // Card holds page content, footer sits under it with breathing room
  card: { backgroundColor: theme.surface, borderRadius: theme.radius, padding: 16 },
  stepBlock: { gap: 0 },

  // Type scale
  sectionLabel: { fontSize: 22, fontWeight: "800", color: theme.muted, marginBottom: 6 },
  sectionHelper: { fontSize: 13, fontWeight: "600", color: theme.card, lineHeight: 16},

  input: {
    marginTop: 8,
    height: 52,
    borderRadius: theme.radius,
    backgroundColor: theme.surface2,
    paddingHorizontal: 16,
    fontSize: 16,
    fontWeight: "800",
    color: theme.text,
    marginTop: 12
  },

  warnText: { marginTop: 6, fontSize: 11, fontWeight: "900", color: theme.dangerText },

  pillRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 10 },
  pill: { height: 38, paddingHorizontal: 14, borderRadius: theme.radius, backgroundColor: theme.surface2, alignItems: "center", justifyContent: "center" },
  pillActive: { backgroundColor: theme.accent },
  pillText: { fontSize: 14, fontWeight: "800", color: theme.text },
  pillTextActive: { color: theme.bg },

  typeGrid: { marginTop: 12, gap: 10 },
  typeCard: { backgroundColor: theme.surface2, borderRadius: theme.radius, padding: 12 },
  typeCardActive: { backgroundColor: theme.accent },
  typeTitle: { fontSize: 15, fontWeight: "900", color: theme.text },
  typeTitleActive: { color: theme.bg },
  typeDesc: { marginTop: 6, fontSize: 14, fontWeight: "700", color: theme.muted, lineHeight: 20 },
  typeDescActive: { color: theme.bg },

  twoCol: { flexDirection: "row", marginTop: 8 },
  daysRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },

  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },

  previewRow: {
    marginTop: 14,
    backgroundColor: theme.surface2,
    borderRadius: theme.radius,
    paddingHorizontal: 14,
    height: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  previewLabel: { fontSize: 12, fontWeight: "700", color: theme.text },
  previewValue: { fontSize: 12, fontWeight: "700", color: theme.accent },

  smallToggle: { height: 30, paddingHorizontal: 10, borderRadius: theme.radiusSm, backgroundColor: theme.surface2, alignItems: "center", justifyContent: "center" },
  smallToggleActive: { backgroundColor: theme.accent },
  smallToggleText: { fontSize: 12, fontWeight: "900", color: theme.muted },
  smallToggleTextActive: { color: theme.bg },

  inlineLink: { marginTop: 8, alignSelf: "flex-start" },
  inlineLinkText: { fontSize: 12, fontWeight: "700", color: theme.muted, textDecorationLine: "underline" },

  // Errors
  errorInline: {
    marginTop: 10,
    backgroundColor: theme.dangerBg,
    borderRadius: theme.radius,
    padding: 12,
  },
  errorInlineText: { color: theme.dangerText, fontSize: 12, fontWeight: "700", lineHeight: 16 },

  errorBox: { backgroundColor: theme.dangerBg, borderRadius: theme.radius, padding: 12 },
  errorTitle: { fontWeight: "800", color: theme.dangerText },
  errorText: { marginTop: 6, fontWeight: "700", color: theme.dangerText, lineHeight: 16 },

  // Buttons
  btnBase: { flex: 1, height: 48, borderRadius: theme.radius, alignItems: "center", justifyContent: "center" },
  btnPrimary: { backgroundColor: theme.accent },
  btnSecondary: { backgroundColor: theme.surface },
  btnTextBase: { fontSize: 14 },
  btnTextPrimary: { color: theme.bg, fontWeight: "800" },
  btnTextSecondary: { color: theme.muted, fontWeight: "800" },

  cancelBtn: {
    marginTop: 10,
    height: 46,
    borderRadius: theme.radius,
    backgroundColor: theme.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelText: { color: theme.muted, fontWeight: "800", fontSize: 14 },

  // Review
  reviewRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: theme.surface2 },
  reviewLabel: { fontSize: 16, fontWeight: "700", color: theme.muted },
  reviewValue: { fontSize: 15, fontWeight: "800", color: theme.card, maxWidth: "66%", textAlign: "right" },

  coachOverlay: { flex: 1, justifyContent: "flex-end" },
  coachBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.35)" },
  coachCard: { margin: 14, padding: 14, borderRadius: theme.radius, backgroundColor: theme.surface },
  coachTitle: { fontSize: 14, fontWeight: "900", color: theme.text },
  coachBody: { marginTop: 8, fontSize: 12, fontWeight: "800", color: theme.muted, lineHeight: 16 },
});
