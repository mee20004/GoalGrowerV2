// screens/AddGoalScreen.js
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Alert,
  UIManager,
  findNodeHandle,
  Dimensions,
} from "react-native";
import Page from "../components/Page";
import { theme } from "../theme";
import { useGoals, fromKey } from "../components/GoalsStore";

const DAYS = [
  { label: "Sun", day: 0 },
  { label: "Mon", day: 1 },
  { label: "Tue", day: 2 },
  { label: "Wed", day: 3 },
  { label: "Thu", day: 4 },
  { label: "Fri", day: 5 },
  { label: "Sat", day: 6 },
];

const CATEGORIES = ["Body", "Mind", "Spirit", "Work", "Custom"];

const clampNum = (n, min, max) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, v));
};

const mapDayShort = (d) => ["S", "M", "T", "W", "Th", "F", "Sa"][d] ?? "?";

function measureRef(ref, cb) {
  const node = findNodeHandle(ref.current);
  if (!node) return cb(null);
  UIManager.measureInWindow(node, (x, y, width, height) => cb({ x, y, width, height }));
}

function Button({ variant = "primary", label, onPress, disabled }) {
  const isPrimary = variant === "primary";
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [
        styles.btnBase,
        isPrimary ? styles.btnPrimary : styles.btnSecondary,
        disabled && { opacity: 0.5 },
        pressed && !disabled && { opacity: 0.9, transform: [{ scale: 0.99 }] },
      ]}
    >
      <Text style={[styles.btnTextBase, isPrimary ? styles.btnTextPrimary : styles.btnTextSecondary]}>
        {label}
      </Text>
    </Pressable>
  );
}

function Chip({ label, active, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      style={({ pressed }) => [
        styles.chip,
        active && styles.chipActive,
        pressed && { opacity: 0.92 },
      ]}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

function Segmented({ left, right, value, onChange }) {
  return (
    <View style={styles.segmentWrap}>
      <Pressable
        onPress={() => onChange(left.value)}
        style={({ pressed }) => [
          styles.segment,
          value === left.value && styles.segmentActive,
          pressed && { opacity: 0.92 },
        ]}
      >
        <Text style={[styles.segmentText, value === left.value && styles.segmentTextActive]}>{left.label}</Text>
      </Pressable>

      <Pressable
        onPress={() => onChange(right.value)}
        style={({ pressed }) => [
          styles.segment,
          value === right.value && styles.segmentActive,
          pressed && { opacity: 0.92 },
        ]}
      >
        <Text style={[styles.segmentText, value === right.value && styles.segmentTextActive]}>{right.label}</Text>
      </Pressable>
    </View>
  );
}

function ProgressDots({ total, index, done }) {
  return (
    <View style={styles.dotsRow} accessibilityRole="progressbar">
      {Array.from({ length: total }).map((_, i) => {
        const active = i === index;
        const complete = !!done[i];
        return (
          <View
            key={i}
            style={[
              styles.dot,
              complete && styles.dotDone,
              active && styles.dotActive,
            ]}
          />
        );
      })}
    </View>
  );
}

export default function AddGoalScreen({ navigation }) {
  const { addGoal, selectedDateKey } = useGoals();

  // Date context (defaults schedule to selected day)
  const selectedDate = fromKey(selectedDateKey);
  const selectedDay = selectedDate.getDay();

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

  // Form
  const [name, setName] = useState("");
  const [category, setCategory] = useState("Custom");

  const [type, setType] = useState("completion"); // completion | quantity
  const [target, setTarget] = useState("1");
  const [unit, setUnit] = useState("times");

  const [mode, setMode] = useState("days"); // everyday | weekdays | days
  const [days, setDays] = useState([selectedDay]);

  const [whenStr, setWhenStr] = useState("");
  const [whereStr, setWhereStr] = useState("");

  const [whyStr, setWhyStr] = useState("");

  // Optional step skip toggles
  const [skipPlan, setSkipPlan] = useState(false);
  const [skipWhy, setSkipWhy] = useState(false);

  // Help modal
  const [helpOpen, setHelpOpen] = useState(false);

  // Tutorial coach marks
  const [tutorialOn, setTutorialOn] = useState(false);
  const [tutorialIndex, setTutorialIndex] = useState(0);
  const [spot, setSpot] = useState(null);

  // Highlight refs for coach marks
  const seedRef = useRef(null);
  const trackRef = useRef(null);
  const scheduleRef = useRef(null);
  const planRef = useRef(null);
  const whyRef = useRef(null);
  const reviewRef = useRef(null);

  const tutorialSteps = useMemo(
    () => [
      {
        title: "Start with a clear name",
        body: "Short and recognizable. You’ll see it often, so make it obvious.",
        ref: seedRef,
        goToStep: 0,
      },
      {
        title: "Choose how you’ll track it",
        body: "Completion is yes/no. Quantity is counting something (minutes, cups, pages).",
        ref: trackRef,
        goToStep: 1,
      },
      {
        title: "Pick realistic days",
        body: "Consistency grows faster than intensity. Choose days you can actually do.",
        ref: scheduleRef,
        goToStep: 2,
      },
      {
        title: "Routine anchors make goals stick",
        body: "“After breakfast” is better than “sometime today”. Optional, but effective.",
        ref: planRef,
        goToStep: 3,
      },
      {
        title: "A tiny ‘why’ keeps it alive",
        body: "One sentence is enough. Optional.",
        ref: whyRef,
        goToStep: 4,
      },
      {
        title: "Plant it",
        body: "Review and save. You can adjust later—growth is iterative.",
        ref: reviewRef,
        goToStep: 5,
      },
    ],
    []
  );

  const { width: W, height: H } = Dimensions.get("window");

  const scheduleDays = useMemo(() => {
    if (mode === "everyday") return [0, 1, 2, 3, 4, 5, 6];
    if (mode === "weekdays") return [1, 2, 3, 4, 5];
    return days.length ? days : [selectedDay];
  }, [mode, days, selectedDay]);

  const frequencyLabel = useMemo(() => {
    if (mode === "everyday") return "Every day";
    if (mode === "weekdays") return "Weekdays";
    return [...scheduleDays].sort((a, b) => a - b).map(mapDayShort).join(" ");
  }, [mode, scheduleDays]);

  const measurableForType = useMemo(() => {
    if (type === "completion") return { target: 1, unit: "times" };
    return { target: clampNum(target, 1, 9999), unit: unit.trim() || "units" };
  }, [type, target, unit]);

  const toggleDay = (d) => {
    setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  };

  // Completion map for dots
  const done = useMemo(() => {
    const m = {};
    m[0] = name.trim().length >= 3;
    m[1] = type === "completion" || (Number(target) > 0 && unit.trim().length > 0);
    m[2] = scheduleDays.length > 0;
    m[3] = skipPlan || whenStr.trim().length >= 2;
    m[4] = skipWhy || whyStr.trim().length >= 4;
    m[5] = false;
    return m;
  }, [name, type, target, unit, scheduleDays, skipPlan, whenStr, skipWhy, whyStr]);

  // Step-specific error (inline, near content)
  const stepError = useMemo(() => {
    if (step === 0) {
      if (name.trim().length < 3) return "Give it a short name (at least 3 characters).";
      return "";
    }
    if (step === 1) {
      if (type === "quantity" && (!(Number(target) > 0) || unit.trim().length < 1)) {
        return "Quantity needs a number + unit (ex: 10 minutes).";
      }
      return "";
    }
    if (step === 2) {
      if (!scheduleDays.length) return "Pick at least one day.";
      return "";
    }
    if (step === 3) {
      if (skipPlan) return "";
      if (whenStr.trim().length < 2) return "Add a time anchor (ex: After breakfast).";
      return "";
    }
    if (step === 4) {
      if (skipWhy) return "";
      if (whyStr.trim().length < 4) return "Add a short reason (one sentence).";
      return "";
    }
    return "";
  }, [step, name, type, target, unit, scheduleDays, skipPlan, whenStr, skipWhy, whyStr]);

  const canNext = !stepError;

  const goNext = () => {
    if (!canNext) return;

    // Respect skip jumps for optional steps
    if (step === 2 && skipPlan) return setStep(4);
    if (step === 3 && skipWhy) return setStep(5);

    setStep((s) => Math.min(STEPS.length - 1, s + 1));
  };

  const goBack = () => {
    if (step === 4 && skipPlan) return setStep(2);
    setStep((s) => Math.max(0, s - 1));
  };

  // Help content (contextual)
  const helpContent = useMemo(() => {
    const k = STEPS[step]?.key;
    if (k === "seed") {
      return {
        title: "Naming a goal",
        body: "Make it short and specific. A good name fits on one line and is easy to scan.",
      };
    }
    if (k === "track") {
      return {
        title: "Tracking options",
        body: "Completion = checkmark. Quantity = a number you count (minutes, pages, cups).",
      };
    }
    if (k === "schedule") {
      return {
        title: "Schedules",
        body: "Choose days you can realistically do. Consistency grows faster than intensity.",
      };
    }
    if (k === "plan") {
      return {
        title: "Time anchors",
        body: "Anchors attach your goal to an existing routine: “After breakfast”, “After class”.",
      };
    }
    if (k === "why") {
      return {
        title: "Your ‘why’",
        body: "Optional, but helpful. One sentence keeps you consistent on hard days.",
      };
    }
    return {
      title: "Saving",
      body: "Review your goal, then plant it. You can refine it later—growth is iterative.",
    };
  }, [step, STEPS]);

  const contactSupport = () => {
    setHelpOpen(false);
    Alert.alert("Support", "Hook this up to email/chat/form in your support flow.");
  };

  // Tutorial: keep aligned with target step + measure highlight
  useEffect(() => {
    if (!tutorialOn) return;
    const t = tutorialSteps[tutorialIndex];
    if (!t) return;

    if (step !== t.goToStep) setStep(t.goToStep);

    const timer = setTimeout(() => measureRef(t.ref, setSpot), 120);
    return () => clearTimeout(timer);
  }, [tutorialOn, tutorialIndex, tutorialSteps, step]);

  const startTutorial = () => {
    setTutorialIndex(0);
    setSpot(null);
    setTutorialOn(true);
  };

  const endTutorial = () => {
    setTutorialOn(false);
    setSpot(null);
  };

  const nextTutorial = () => {
    if (tutorialIndex >= tutorialSteps.length - 1) return endTutorial();
    setTutorialIndex((i) => i + 1);
  };

  const smart = useMemo(() => {
    const measurable =
      type === "completion" ? "Complete it" : `${measurableForType.target} ${measurableForType.unit}`;
    return {
      specific: `I will ${name.trim()}`.trim(),
      measurable,
      achievable: "Start small and grow over time.",
      relevant: (skipWhy ? "" : whyStr.trim()) || "Helps me grow.",
      timeBound: "Ongoing",
    };
  }, [name, type, measurableForType, whyStr, skipWhy]);

  const save = () => {
    if (name.trim().length < 3) return;
    if (type === "quantity" && (!(Number(target) > 0) || unit.trim().length < 1)) return;
    if (!scheduleDays.length) return;
    if (!skipPlan && whenStr.trim().length < 2) return;
    if (!skipWhy && whyStr.trim().length < 4) return;

    const id = addGoal({
      name: name.trim(),
      category,
      type,
      measurable: measurableForType,
      schedule: { type: mode, days: scheduleDays },
      frequencyLabel,
      smart,
      plan: { when: skipPlan ? "" : whenStr.trim(), where: whereStr.trim(), cue: "", reward: "" },
      timeBound: { enabled: false, startDate: null, endDate: null },
    });

    navigation.navigate("Goals", { screen: "Goal", params: { goalId: id } });
  };

  const isLast = step === STEPS.length - 1;

  return (
    <Page>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        {/* Header */}
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.hTitle}>{STEPS[step].title}</Text>
            <Text style={styles.hSub}>{STEPS[step].subtitle}</Text>
          </View>

          <Pressable style={styles.helpBtn} onPress={() => setHelpOpen(true)}>
            <Text style={styles.helpBtnText}>Help</Text>
          </Pressable>
        </View>

        <ProgressDots total={STEPS.length} index={step} done={done} />

        {/* Fixed content area (no scroll) */}
        <View style={styles.contentArea}>
          {/* STEP 0 */}
          {step === 0 && (
            <View ref={seedRef} collapsable={false} style={styles.card}>
              <Text style={styles.sectionLabel}>Goal name</Text>
              <Text style={styles.sectionHelper}>Short and clear. You’ll see it often.</Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Example: Read"
                placeholderTextColor={theme.muted2}
                style={styles.input}
              />

              <View style={styles.gap16} />

              <Text style={styles.sectionLabel}>Category</Text>
              <Text style={styles.sectionHelper}>Optional organization for your garden.</Text>

              <View style={styles.chipWrap}>
                {CATEGORIES.map((c) => (
                  <Chip key={c} label={c} active={category === c} onPress={() => setCategory(c)} />
                ))}
              </View>
            </View>
          )}

          {/* STEP 1 */}
          {step === 1 && (
            <View ref={trackRef} collapsable={false} style={styles.card}>
              <Text style={styles.sectionLabel}>Tracking</Text>
              <Text style={styles.sectionHelper}>Pick what “progress” looks like.</Text>

              <Segmented
                left={{ label: "Checkmark", value: "completion" }}
                right={{ label: "Quantity", value: "quantity" }}
                value={type}
                onChange={setType}
              />

              {type === "quantity" && (
                <>
                  <View style={styles.gap16} />
                  <Text style={styles.sectionLabel}>Target</Text>
                  <Text style={styles.sectionHelper}>Example: 10 minutes, 8 cups, 3 pages.</Text>

                  <View style={styles.row}>
                    <TextInput
                      value={target}
                      onChangeText={setTarget}
                      keyboardType="numeric"
                      placeholder="10"
                      placeholderTextColor={theme.muted2}
                      style={[styles.input, { flex: 1, marginRight: 10 }]}
                    />
                    <TextInput
                      value={unit}
                      onChangeText={setUnit}
                      placeholder="minutes"
                      placeholderTextColor={theme.muted2}
                      style={[styles.input, { flex: 1 }]}
                    />
                  </View>
                </>
              )}

              <View style={styles.previewRow}>
                <Text style={styles.previewLabel}>Preview</Text>
                <Text style={styles.previewValue}>
                  {type === "completion" ? "Checkmark" : `${measurableForType.target} ${measurableForType.unit}`}
                </Text>
              </View>
            </View>
          )}

          {/* STEP 2 */}
          {step === 2 && (
            <View ref={scheduleRef} collapsable={false} style={styles.card}>
              <Text style={styles.sectionLabel}>Schedule</Text>
              <Text style={styles.sectionHelper}>Choose days you can realistically do.</Text>

              <View style={styles.row}>
                <Chip label="Every day" active={mode === "everyday"} onPress={() => setMode("everyday")} />
                <Chip label="Weekdays" active={mode === "weekdays"} onPress={() => setMode("weekdays")} />
                <Chip label="Custom" active={mode === "days"} onPress={() => setMode("days")} />
              </View>

              {mode === "days" && (
                <>
                  <View style={styles.gap12} />
                  <Text style={styles.sectionLabel}>Pick days</Text>

                  <View style={styles.daysGrid}>
                    {DAYS.map((d) => {
                      const active = days.includes(d.day);
                      return (
                        <Pressable
                          key={d.label}
                          onPress={() => toggleDay(d.day)}
                          style={({ pressed }) => [
                            styles.dayPill,
                            active && styles.dayPillActive,
                            pressed && { opacity: 0.92 },
                          ]}
                        >
                          <Text style={[styles.dayText, active && styles.dayTextActive]}>{d.label}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </>
              )}

              <View style={styles.previewRow}>
                <Text style={styles.previewLabel}>Preview</Text>
                <Text style={styles.previewValue}>{frequencyLabel}</Text>
              </View>

              <View style={styles.gap12} />

              <View style={styles.skipRow}>
                <Pressable
                  onPress={() => setSkipPlan((v) => !v)}
                  style={[styles.skipToggle, skipPlan && styles.skipToggleOn]}
                >
                  <Text style={[styles.skipText, skipPlan && styles.skipTextOn]}>
                    {skipPlan ? "Plan skipped" : "Skip plan step"}
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => setSkipWhy((v) => !v)}
                  style={[styles.skipToggle, skipWhy && styles.skipToggleOn]}
                >
                  <Text style={[styles.skipText, skipWhy && styles.skipTextOn]}>
                    {skipWhy ? "Why skipped" : "Skip why step"}
                  </Text>
                </Pressable>
              </View>
            </View>
          )}

          {/* STEP 3 */}
          {step === 3 && (
            <View ref={planRef} collapsable={false} style={styles.card}>
              <Text style={styles.sectionLabel}>Time anchor</Text>
              <Text style={styles.sectionHelper}>
                Example: After breakfast / After class / Before bed
              </Text>

              <TextInput
                value={whenStr}
                onChangeText={setWhenStr}
                placeholder="When will you do it?"
                placeholderTextColor={theme.muted2}
                style={styles.input}
              />

              <View style={styles.gap16} />

              <Text style={styles.sectionLabel}>Place (optional)</Text>
              <TextInput
                value={whereStr}
                onChangeText={setWhereStr}
                placeholder="Desk, gym, library…"
                placeholderTextColor={theme.muted2}
                style={styles.input}
              />

              <View style={styles.gap12} />
              <Pressable onPress={() => { setSkipPlan(true); setStep(4); }} style={styles.inlineLink}>
                <Text style={styles.inlineLinkText}>Skip this step</Text>
              </Pressable>
            </View>
          )}

          {/* STEP 4 */}
          {step === 4 && (
            <View ref={whyRef} collapsable={false} style={styles.card}>
              <Text style={styles.sectionLabel}>Your reason</Text>
              <Text style={styles.sectionHelper}>Optional. One sentence is enough.</Text>

              <TextInput
                value={whyStr}
                onChangeText={setWhyStr}
                placeholder="Example: I want more energy and focus."
                placeholderTextColor={theme.muted2}
                style={[styles.input, styles.textArea]}
                multiline
              />

              <View style={styles.gap12} />
              <Pressable onPress={() => { setSkipWhy(true); setStep(5); }} style={styles.inlineLink}>
                <Text style={styles.inlineLinkText}>Skip this step</Text>
              </Pressable>
            </View>
          )}

          {/* STEP 5 */}
          {step === 5 && (
            <View ref={reviewRef} collapsable={false} style={styles.card}>
              <Text style={styles.sectionLabel}>Review</Text>

              <View style={styles.reviewRow}>
                <Text style={styles.reviewLabel}>Name</Text>
                <Text style={styles.reviewValue}>{name.trim() || "—"}</Text>
              </View>
              <View style={styles.reviewRow}>
                <Text style={styles.reviewLabel}>Category</Text>
                <Text style={styles.reviewValue}>{category}</Text>
              </View>
              <View style={styles.reviewRow}>
                <Text style={styles.reviewLabel}>Tracking</Text>
                <Text style={styles.reviewValue}>
                  {type === "completion" ? "Checkmark" : `${measurableForType.target} ${measurableForType.unit}`}
                </Text>
              </View>
              <View style={styles.reviewRow}>
                <Text style={styles.reviewLabel}>Schedule</Text>
                <Text style={styles.reviewValue}>{frequencyLabel}</Text>
              </View>
              {!skipPlan && (
                <View style={styles.reviewRow}>
                  <Text style={styles.reviewLabel}>When</Text>
                  <Text style={styles.reviewValue}>{whenStr.trim() || "—"}</Text>
                </View>
              )}
              {!!whereStr.trim() && (
                <View style={styles.reviewRow}>
                  <Text style={styles.reviewLabel}>Where</Text>
                  <Text style={styles.reviewValue}>{whereStr.trim()}</Text>
                </View>
              )}
              {!skipWhy && !!whyStr.trim() && (
                <View style={styles.reviewRow}>
                  <Text style={styles.reviewLabel}>Why</Text>
                  <Text style={styles.reviewValue}>{whyStr.trim()}</Text>
                </View>
              )}

              {!!stepError && (
                <View style={[styles.errorBox, { marginTop: 12 }]}>
                  <Text style={styles.errorTitle}>Almost there</Text>
                  <Text style={styles.errorText}>{stepError}</Text>
                </View>
              )}

              <View style={styles.gap12} />
              <Button variant="primary" label="Plant this goal" onPress={save} disabled={!!stepError} />
              <Pressable onPress={() => navigation.goBack()} style={styles.cancelBtn}>
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
            </View>
          )}

          {!!stepError && step !== 5 && (
            <View style={styles.errorInline}>
              <Text style={styles.errorInlineText}>{stepError}</Text>
            </View>
          )}
        </View>

        {/* Footer nav */}
        <View style={styles.footer}>
          <Button variant="secondary" label="Back" onPress={goBack} disabled={step === 0} />
          <View style={{ width: 10 }} />
          <Button
            variant="primary"
            label={isLast ? "Save" : "Next"}
            onPress={isLast ? save : goNext}
            disabled={isLast ? !!stepError : !canNext}
          />
        </View>

        {/* Help modal */}
        <Modal visible={helpOpen} transparent animationType="fade" onRequestClose={() => setHelpOpen(false)}>
          <Pressable style={styles.modalBackdrop} onPress={() => setHelpOpen(false)} />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{helpContent.title}</Text>
            <Text style={styles.modalBody}>{helpContent.body}</Text>

            <View style={styles.gap12} />
            <Button
              variant="primary"
              label="Start tutorial"
              onPress={() => {
                setHelpOpen(false);
                startTutorial();
              }}
            />
            <View style={styles.gap10} />
            <Button variant="secondary" label="Contact support" onPress={contactSupport} />
            <View style={styles.gap10} />
            <Button variant="secondary" label="Close" onPress={() => setHelpOpen(false)} />
          </View>
        </Modal>

        {/* Tutorial overlay */}
        <Modal visible={tutorialOn} transparent animationType="fade" onRequestClose={endTutorial}>
          <View style={styles.tutorialOverlay}>
            <Pressable style={StyleSheet.absoluteFillObject} onPress={nextTutorial} />

            {spot && (
              <View
                pointerEvents="none"
                style={[
                  styles.highlight,
                  {
                    left: Math.max(12, spot.x - 8),
                    top: Math.max(12, spot.y - 8),
                    width: Math.min(W - 24, spot.width + 16),
                    height: Math.min(H - 24, spot.height + 16),
                  },
                ]}
              />
            )}

            <View style={styles.tooltip}>
              <Text style={styles.tooltipTitle}>{tutorialSteps[tutorialIndex]?.title}</Text>
              <Text style={styles.tooltipBody}>{tutorialSteps[tutorialIndex]?.body}</Text>

              <View style={styles.gap12} />
              <View style={{ flexDirection: "row" }}>
                <Button variant="secondary" label="Skip" onPress={endTutorial} />
                <View style={{ width: 10 }} />
                <Button
                  variant="primary"
                  label={tutorialIndex === tutorialSteps.length - 1 ? "Done" : "Next"}
                  onPress={nextTutorial}
                />
              </View>
            </View>
          </View>
        </Modal>
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
    marginLeft: 12,
  },
  helpBtnText: { fontSize: 12, fontWeight: "700", color: theme.muted },

  // Progress dots
  dotsRow: { flexDirection: "row", alignItems: "center", marginBottom: 12, marginTop: 15 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: theme.outline, marginRight: 8 },
  dotDone: { backgroundColor: theme.text2 },
  dotActive: { backgroundColor: theme.accent },

  // Layout
  contentArea: { flex: 1 },
  card: { backgroundColor: theme.surface, borderRadius: theme.radius, padding: 16 },
  footer: { flexDirection: "row", paddingTop: 10, paddingBottom: 6 },

  // Type scale
  sectionLabel: { fontSize: 22, fontWeight: "800", color: theme.muted, marginBottom: 6 },
  sectionHelper: { fontSize: 13, fontWeight: "600", color: theme.card, lineHeight: 16},

  // Inputs
  input: {
    backgroundColor: theme.surface2,
    borderRadius: theme.radius,
    paddingHorizontal: 14,
    height: 46,
    fontSize: 14,
    fontWeight: "600",
    color: theme.text,
    marginTop: 12
  },
  textArea: { height: 96, paddingTop: 12, textAlignVertical: "top" },

  // Spacing tokens
  gap10: { height: 10 },
  gap12: { height: 12 },
  gap16: { height: 16 },

  // Chips
  chipWrap: { flexDirection: "row", flexWrap: "wrap", marginTop: 10, gap: 10 },
  chip: {
    height: 34,
    paddingHorizontal: 12,
    borderRadius: theme.radius,
    backgroundColor: theme.surface2,
    alignItems: "center",
    justifyContent: "center",
  },
  chipActive: { backgroundColor: theme.accent },
  chipText: { fontSize: 12, fontWeight: "700", color: theme.text },
  chipTextActive: { color: theme.bg },

  // Segmented control
  segmentWrap: { flexDirection: "row", backgroundColor: theme.surface2, borderRadius: theme.radius, padding: 4, marginTop: 10 },
  segment: { flex: 1, height: 40, borderRadius: theme.radius, alignItems: "center", justifyContent: "center" },
  segmentActive: { backgroundColor: theme.accent },
  segmentText: { fontSize: 12, fontWeight: "700", color: theme.text },
  segmentTextActive: { color: theme.bg },

  row: { flexDirection: "row", marginTop: 10 },

  // Days grid (consistent spacing, no space-between weirdness)
  daysGrid: { flexDirection: "row", flexWrap: "wrap", marginTop: 10, gap: 10 },
  dayPill: {
    minWidth: 92,
    height: 40,
    paddingHorizontal: 12,
    borderRadius: theme.radiusSm,
    backgroundColor: theme.surface2,
    alignItems: "center",
    justifyContent: "center",
  },
  dayPillActive: { backgroundColor: theme.accent },
  dayText: { fontSize: 12, fontWeight: "700", color: theme.text },
  dayTextActive: { color: theme.bg },

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

  // Skip toggles
  skipRow: { flexDirection: "row", marginTop: 12, gap: 10 },
  skipToggle: {
    flex: 1,
    height: 36,
    borderRadius: theme.radius,
    backgroundColor: theme.surface2,
    alignItems: "center",
    justifyContent: "center",
  },
  skipToggleOn: { backgroundColor: theme.accent },
  skipText: { fontSize: 12, fontWeight: "700", color: theme.text },
  skipTextOn: { color: theme.bg },

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
  btnTextBase: { fontSize: 12 },
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

  // Modal
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.35)" },
  modalCard: {
    position: "absolute",
    left: 18,
    right: 18,
    top: 110,
    backgroundColor: theme.surface,
    borderRadius: theme.radius,
    padding: 16,
  },
  modalTitle: { fontSize: 16, fontWeight: "800", color: theme.text, marginBottom: 6 },
  modalBody: { fontSize: 12, fontWeight: "600", color: theme.muted, lineHeight: 16 },

  // Tutorial overlay
  tutorialOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "flex-end", padding: 16 },
  highlight: {
    position: "absolute",
    borderRadius: 14,
    borderWidth: 2,
    borderColor: theme.accent,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  tooltip: { backgroundColor: theme.surface, borderRadius: theme.radius, padding: 14 },
  tooltipTitle: { fontSize: 14, fontWeight: "800", color: theme.text, marginBottom: 6 },
  tooltipBody: { fontSize: 12, fontWeight: "600", color: theme.muted, lineHeight: 16 },
});
