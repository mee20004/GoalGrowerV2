// screens/AddGoalScreen.js
import React, { useEffect, useMemo, useRef, useState, memo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  LayoutAnimation,
  KeyboardAvoidingView,
  Platform,
  Alert,
  UIManager,
  findNodeHandle,
  Dimensions,
  ScrollView,
  Switch,
  Modal,
  Keyboard,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import * as LucideIcons from "lucide-react-native/icons";
import Page from "../components/Page";
import { theme } from "../theme";
import { useGoals, fromKey } from "../components/GoalsStore";

// FIREBASE IMPORTS
import { collection, addDoc, serverTimestamp, onSnapshot, query, where, doc, setDoc } from "firebase/firestore";
import { auth, db } from "../firebaseConfig";

// --- 1. ICON CONSTANTS & HELPER ---
const RESERVED_LUCIDE_EXPORTS = new Set(["default", "Icon", "createLucideIcon"]);

const pascalToKebab = (value) =>
  value
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
    .toLowerCase();

const toPascalCase = (value) =>
  String(value || "")
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");

const allIconNames = Object.keys(LucideIcons)
  .filter((key) => !RESERVED_LUCIDE_EXPORTS.has(key) && /^[A-Z]/.test(key))
  .map(pascalToKebab)
  .sort();

const CUSTOM_PACK_ICONS = ["mci:run-fast"];
const pickerIconNames = [...new Set([...CUSTOM_PACK_ICONS, ...allIconNames])];

const SUPPORTED_MCI_ICONS = new Set(["run-fast"]);
const isMciIconName = (name) => typeof name === "string" && name.startsWith("mci:");
const getMciName = (name) => String(name || "").slice(4);

const ICON_NAME_SET = new Set(pickerIconNames);
const dedupeIcons = (icons) => [...new Set(icons)];

const FEATURED_ICON_CANDIDATES = [
  "target",
  "user",
  "person-standing",
  "footprints",
  "activity",
  "dumbbell",
  "utensils",
  "apple",
  "pizza",
  "sandwich",
  "chef-hat",
  "briefcase",
  "book-open",
  "brain",
  "heart-pulse",
  "sprout",
  "bike",
  "clock-3",
];

const FEATURED_ICONS = FEATURED_ICON_CANDIDATES.filter((name) => ICON_NAME_SET.has(name));

const ICON_SEARCH_SYNONYMS = {
  food: ["utensils", "apple", "pizza", "sandwich", "chef-hat"],
  eat: ["utensils", "apple", "sandwich"],
  meal: ["utensils", "pizza", "sandwich"],
  man: ["user", "person-standing"],
  person: ["user", "person-standing", "accessibility"],
  running: ["mci:run-fast", "footprints", "activity", "dumbbell", "bike"],
  run: ["mci:run-fast", "footprints", "activity"],
  workout: ["dumbbell", "activity", "bike"],
  exercise: ["dumbbell", "activity", "footprints"],
};

const LEGACY_ICON_TO_LUCIDE = {
  leaf: "sprout",
  "leaf-outline": "sprout",
  "code-slash": "code",
};

function normalizeGoalIconName(name, fallback = "target") {
  if (!name || typeof name !== "string") return fallback;
  if (isMciIconName(name) && SUPPORTED_MCI_ICONS.has(getMciName(name))) return name;
  const mapped = LEGACY_ICON_TO_LUCIDE[name] || name;
  return LucideIcons[toPascalCase(mapped)] ? mapped : fallback;
}

function GoalIcon({ name, size, color }) {
  const normalizedName = normalizeGoalIconName(name);
  if (isMciIconName(normalizedName)) {
    return <MaterialCommunityIcons name={getMciName(normalizedName)} size={size} color={color} />;
  }
  const IconComponent = LucideIcons[toPascalCase(normalizedName)] || LucideIcons.Target;
  return <IconComponent size={size} color={color} strokeWidth={2.2} />;
}

const DAYS = [
  { label: "Sun", day: 0 },
  { label: "Mon", day: 1 },
  { label: "Tue", day: 2 },
  { label: "Wed", day: 3 },
  { label: "Thu", day: 4 },
  { label: "Fri", day: 5 },
  { label: "Sat", day: 6 },
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

const toISODate = (date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const addDaysISO = (days) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return toISODate(date);
};

const addYearsISO = (years) => {
  const date = new Date();
  date.setFullYear(date.getFullYear() + years);
  return toISODate(date);
};

const formatDateInput = (text) => {
  const digits = text.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
};

const isValidISODate = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
};

const toStartOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

const monthLabel = (date) =>
  date.toLocaleDateString(undefined, { month: "long", year: "numeric" });

const buildMonthGrid = (monthDate) => {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstDayWeekIndex = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells = [];
  for (let i = 0; i < firstDayWeekIndex; i += 1) cells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) cells.push(day);
  while (cells.length < 42) cells.push(null);
  return cells;
};

const mapDayShort = (d) => ["S", "M", "T", "W", "Th", "F", "Sa"][d] ?? "?";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// --- 2. OPTIMIZED ICON COMPONENT ---
const IconItem = memo(({ iconName, isActive, onSelect }) => (
  <Pressable 
    onPress={() => onSelect(iconName)} 
    style={[styles.iconBox, isActive && styles.iconBoxActive]}
  >
    {isActive && (
      <View style={styles.iconSelectedBadge}>
        <Ionicons name="checkmark" size={12} color="#FFFFFF" />
      </View>
    )}
    <GoalIcon name={iconName} size={45} color={isActive ? "#FFFFFF" : "#111111"} />
  </Pressable>
));

function measureRef(ref, cb) {
  const node = findNodeHandle(ref.current);
  if (!node) return cb(null);
  UIManager.measureInWindow(node, (x, y, width, height) => cb({ x, y, width, height }));
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
    <View style={styles.segmentWrap}>
      <Pressable
        onPress={() => onChange(left.value)}
        style={[styles.segment, value === left.value && styles.segmentActive]}
      >
        <Text style={[styles.segmentText, value === left.value && styles.segmentTextActive]}>{left.label}</Text>
      </Pressable>
      <Pressable
        onPress={() => onChange(right.value)}
        style={[styles.segment, value === right.value && styles.segmentActive]}
      >
        <Text style={[styles.segmentText, value === right.value && styles.segmentTextActive]}>{right.label}</Text>
      </Pressable>
    </View>
  );
}

function Dot({ state }) {
  return (
    <View style={styles.dotsRow} accessibilityRole="progressbar">
      {Array.from({ length: total }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.dot,
            !!done[i] && styles.dotDone,
            i === index && styles.dotActive,
          ]}
        />
      ))}
    </View>
  );
}

export default function AddGoalScreen({ navigation }) {
  const { selectedDateKey } = useGoals();
  const [isSaving, setIsSaving] = useState(false);
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [sharedGardens, setSharedGardens] = useState([]);
  const [selectedGardenId, setSelectedGardenId] = useState("personal");

  const selectedDate = fromKey(selectedDateKey);
  const selectedDay = selectedDate.getDay();
  const uid = auth.currentUser?.uid;

  // Form State
  const [name, setName] = useState("");
  const [category, setCategory] = useState("Custom");
  const [isPrivate, setIsPrivate] = useState(false);
  const [selectedIcon, setSelectedIcon] = useState("target");
  const [searchTerm, setSearchTerm] = useState("");
  const [type, setType] = useState("completion");
  const [target, setTarget] = useState("1");
  const [unit, setUnit] = useState("times");
  const [mode, setMode] = useState("days");
  const [days, setDays] = useState([selectedDay]);
  const [whenStr, setWhenStr] = useState("");
  const [whereStr, setWhereStr] = useState("");
  const [whyStr, setWhyStr] = useState("");
  const [completionMode, setCompletionMode] = useState("none");
  const [completionEndDate, setCompletionEndDate] = useState("");
  const [completionEndAmount, setCompletionEndAmount] = useState("");
  const [completionEndUnit, setCompletionEndUnit] = useState("times");
  const [multiUserWateringEnabled, setMultiUserWateringEnabled] = useState(false);
  const [requiredContributors, setRequiredContributors] = useState("2");
  const [calendarMonth, setCalendarMonth] = useState(toStartOfDay(new Date()));
  const [calendarWidth, setCalendarWidth] = useState(0);
  const calendarPagerRef = useRef(null);

  // Filtered Icons Logic
  const filteredIcons = useMemo(() => {
    const cleanSearch = searchTerm.toLowerCase().trim();
    if (!cleanSearch) {
      return dedupeIcons([...FEATURED_ICONS, ...pickerIconNames]).slice(0, 500);
    }

    const directMatches = pickerIconNames.filter((name) => name.includes(cleanSearch));
    const synonymMatches = Object.entries(ICON_SEARCH_SYNONYMS)
      .filter(([keyword]) => cleanSearch.includes(keyword))
      .flatMap(([, icons]) => icons)
      .filter((name) => ICON_NAME_SET.has(name));

    return dedupeIcons([...synonymMatches, ...directMatches]).slice(0, 500);
  }, [searchTerm]);

  const scheduleDays = useMemo(() => {
    if (mode === "everyday") return [0, 1, 2, 3, 4, 5, 6];
    if (mode === "weekdays") return [1, 2, 3, 4, 5];
    return days.length ? days : [selectedDay];
  }, [mode, days, selectedDay]);

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

  const completionCondition = useMemo(() => {
    if (completionMode === "date" && isValidISODate(completionEndDate.trim())) {
      return { type: "date", endDate: completionEndDate.trim() };
    }
    if (completionMode === "amount" && Number(completionEndAmount) > 0) {
      return {
        type: "amount",
        targetAmount: clampNum(completionEndAmount, 1, 999999),
        unit: completionEndUnit.trim() || "times",
      };
    }
    if (
      completionMode === "both" &&
      isValidISODate(completionEndDate.trim()) &&
      Number(completionEndAmount) > 0
    ) {
      return {
        type: "both",
        endDate: completionEndDate.trim(),
        targetAmount: clampNum(completionEndAmount, 1, 999999),
        unit: completionEndUnit.trim() || "times",
      };
    }
    return { type: "none" };
  }, [completionMode, completionEndDate, completionEndAmount, completionEndUnit]);

  const completionDateMeta = useMemo(() => {
    if (!isValidISODate(completionEndDate.trim())) return null;
    const [year, month, day] = completionEndDate.trim().split("-").map(Number);
    const endDate = new Date(year, month - 1, day);
    const today = toStartOfDay(new Date());
    const endStart = toStartOfDay(endDate);
    const daysLeft = Math.round((endStart.getTime() - today.getTime()) / 86400000);

    return {
      readable: endDate.toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
      daysLeft,
    };
  }, [completionEndDate]);

  useEffect(() => {
    if (!uid) {
      setSharedGardens([]);
      setSelectedGardenId("personal");
      return undefined;
    }

    const unsubscribe = onSnapshot(
      query(collection(db, "sharedGardens"), where("memberIds", "array-contains", uid)),
      (snap) => {
        const docs = snap.docs.map((gardenDoc) => ({ id: gardenDoc.id, ...gardenDoc.data() }));
        setSharedGardens(docs);
        setSelectedGardenId((prev) => {
          if (prev === "personal") return prev;
          return docs.some((garden) => garden.id === prev) ? prev : "personal";
        });
      },
      () => {
        setSharedGardens([]);
        setSelectedGardenId("personal");
      }
    );

    return () => unsubscribe();
  }, [uid]);

  const selectedGardenName = useMemo(() => {
    if (selectedGardenId === "personal") return "Personal Garden";
    return sharedGardens.find((garden) => garden.id === selectedGardenId)?.name || "Shared Garden";
  }, [selectedGardenId, sharedGardens]);

  const calendarCells = useMemo(() => buildMonthGrid(calendarMonth), [calendarMonth]);

  const prevMonth = useMemo(
    () => new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1),
    [calendarMonth]
  );
  const nextMonth = useMemo(
    () => new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1),
    [calendarMonth]
  );
  const prevMonthCells = useMemo(() => buildMonthGrid(prevMonth), [prevMonth]);
  const nextMonthCells = useMemo(() => buildMonthGrid(nextMonth), [nextMonth]);

  useEffect(() => {
    if (isValidISODate(completionEndDate.trim())) {
      const [year, month] = completionEndDate.trim().split("-").map(Number);
      setCalendarMonth(new Date(year, month - 1, 1));
    }
  }, [completionEndDate]);

  useEffect(() => {
    if (!calendarWidth || !calendarPagerRef.current) return;
    calendarPagerRef.current.scrollTo({ x: calendarWidth, animated: false });
  }, [calendarWidth, calendarMonth]);

  const selectCalendarDay = (day) => {
    if (!day) return;
    const date = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), day);
    setCompletionEndDate(toISODate(date));
  };

  const goPrevMonth = () => {
    setCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const goNextMonth = () => {
    setCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  const changeCompletionMode = (nextMode) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setCompletionMode(nextMode);
  };

  const handleCalendarScrollEnd = (event) => {
    if (!calendarWidth) return;
    const offsetX = event.nativeEvent.contentOffset.x;
    const pageIndex = Math.round(offsetX / calendarWidth);
    if (pageIndex === 0) {
      goPrevMonth();
    } else if (pageIndex === 2) {
      goNextMonth();
    }
  };

  const toggleDay = (d) => setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));

  const formError = useMemo(() => {
    if (name.trim().length < 3) return "Give it a short name (at least 3 characters).";
    if (!selectedIcon) return "Please select an icon.";
    if (type === "quantity" && (!(Number(target) > 0) || unit.trim().length < 1)) return "Quantity needs a number + unit.";
    if (!scheduleDays.length) return "Pick at least one day.";
    if ((completionMode === "date" || completionMode === "both") && !isValidISODate(completionEndDate.trim())) {
      return "Enter a valid end date (YYYY-MM-DD).";
    }
    if ((completionMode === "date" || completionMode === "both") && completionDateMeta && completionDateMeta.daysLeft < 0) {
      return "End date cannot be in the past.";
    }
    if ((completionMode === "amount" || completionMode === "both") && !(Number(completionEndAmount) > 0)) {
      return "End amount must be greater than 0.";
    }
    if (
      selectedGardenId !== "personal" &&
      multiUserWateringEnabled &&
      !(Number(requiredContributors) >= 2)
    ) {
      return "Required contributors must be at least 2.";
    }
    return "";
  }, [
    completionDateMeta,
    completionEndAmount,
    completionEndDate,
    completionMode,
    multiUserWateringEnabled,
    name,
    requiredContributors,
    scheduleDays,
    selectedGardenId,
    selectedIcon,
    target,
    type,
    unit,
  ]);

  const canSave = !formError;

  const save = async () => {
    if (!auth.currentUser || isSaving || !canSave) return;
    setIsSaving(true);
    try {
      const goalData = {
        name: name.trim(),
        category,
        isPrivate,
        icon: selectedIcon,
        gardenId: selectedGardenId,
        gardenType: selectedGardenId === "personal" ? "personal" : "shared",
        sharedGardenId: selectedGardenId === "personal" ? null : selectedGardenId,
        multiUserWateringEnabled: selectedGardenId !== "personal" ? !!multiUserWateringEnabled : false,
        requiredContributors:
          selectedGardenId !== "personal" && multiUserWateringEnabled
            ? Math.max(2, Math.floor(Number(requiredContributors) || 2))
            : 1,
        type,
        measurable: measurableForType,
        schedule: { type: mode, days: scheduleDays },
        frequencyLabel,
        completionCondition,
        plan: { when: whenStr.trim(), where: whereStr.trim() },
        why: whyStr.trim(),
        createdAt: serverTimestamp(),
        currentStreak: 0,
        longestStreak: 0,
        healthLevel: 3,
        species: "fern"
      };

      const userGoalsRef = collection(db, "users", auth.currentUser.uid, "goals");
      const docRef = await addDoc(userGoalsRef, goalData);

      if (selectedGardenId !== "personal") {
        await setDoc(
          doc(db, "sharedGardens", selectedGardenId, "layout", docRef.id),
          {
            ...goalData,
            ownerId: auth.currentUser.uid,
            sourceGoalId: docRef.id,
            shelfPosition: null,
            pageId: null,
            shelfName: null,
            slotIndex: null,
          },
          { merge: true }
        );
      }

      navigation.navigate("Goals", { screen: "Goal", params: { goalId: docRef.id, source: "goals" } });
    } catch (error) {
      Alert.alert("Error", "Could not save your goal.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Page>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.hTitle}>Plant a goal</Text>
            <Text style={styles.hSub}>Fill out your goal details below.</Text>
          </View>
        </View>

        <ScrollView style={styles.contentArea} contentContainerStyle={styles.formScrollContent} keyboardShouldPersistTaps="handled" onScroll={() => Keyboard.dismiss()}>
          <View style={styles.card}>
            <Text style={styles.sectionLabel}>Goal name</Text>
            <TextInput value={name} onChangeText={setName} placeholder="Example: Read" placeholderTextColor={theme.muted2} style={styles.input} />
            <View style={styles.gap16} />
            <Text style={styles.sectionLabel}>Category</Text>
            <View style={styles.chipWrap}>
              {CATEGORIES.map((c) => (
                <Chip key={c} label={c} active={category === c} onPress={() => setCategory(c)} />
              ))}
            </View>
            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>Private goal</Text>
              <Switch value={isPrivate} onValueChange={setIsPrivate} trackColor={{ false: theme.outline, true: theme.accent }} />
            </View>

            <View style={styles.gap16} />
            <Text style={styles.sectionLabel}>Garden</Text>
            <View style={styles.chipWrap}>
              <Chip
                label="Personal"
                active={selectedGardenId === "personal"}
                onPress={() => setSelectedGardenId("personal")}
              />
              {sharedGardens.map((garden) => (
                <Chip
                  key={garden.id}
                  label={garden.name || "Shared Garden"}
                  active={selectedGardenId === garden.id}
                  onPress={() => setSelectedGardenId(garden.id)}
                />
              ))}
            </View>
            <Text style={[styles.helperText, { marginTop: 10, marginBottom: 0 }]}>Defaults to your personal garden.</Text>

            {selectedGardenId !== "personal" && (
              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>Multi-user watering</Text>
                <Switch
                  value={multiUserWateringEnabled}
                  onValueChange={setMultiUserWateringEnabled}
                  trackColor={{ false: theme.outline, true: theme.accent }}
                />
              </View>
            )}

            {selectedGardenId !== "personal" && multiUserWateringEnabled && (
              <View style={styles.contributorRow}>
                <Text style={styles.switchLabel}>Required contributors</Text>
                <TextInput
                  value={requiredContributors}
                  onChangeText={setRequiredContributors}
                  keyboardType="number-pad"
                  style={[styles.input, styles.contributorInput]}
                  placeholder="2"
                  placeholderTextColor={theme.muted2}
                />
              </View>
            )}
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionLabel}>Icon</Text>
            <Pressable style={styles.iconPickerButton} onPress={() => setShowIconPicker(true)}>
              <View style={styles.iconPickerButtonLeft}>
                <View style={styles.iconPickerPreview}>
                  <GoalIcon name={selectedIcon} size={24} color={theme.accent} />
                </View>
                <View style={styles.iconPickerTextWrap}>
                  <Text style={styles.iconPickerTitle}>Choose icon</Text>
                  <Text style={styles.iconPickerSubtitle} numberOfLines={1}>{selectedIcon}</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={20} color={theme.muted} />
            </Pressable>
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionLabel}>Tracking</Text>
            <Segmented left={{ label: "Checkmark", value: "completion" }} right={{ label: "Quantity", value: "quantity" }} value={type} onChange={setType} />
            {type === "quantity" && (
              <View style={styles.row}>
                <TextInput value={target} onChangeText={setTarget} keyboardType="numeric" style={[styles.input, { flex: 1, marginRight: 10 }]} />
                <TextInput value={unit} onChangeText={setUnit} placeholder="minutes" style={[styles.input, { flex: 1 }]} />
              </View>
            )}
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionLabel}>Schedule</Text>
            <View style={styles.row}>
              <Chip label="Every day" active={mode === "everyday"} onPress={() => setMode("everyday")} />
              <Chip label="Weekdays" active={mode === "weekdays"} onPress={() => setMode("weekdays")} />
              <Chip label="Custom" active={mode === "days"} onPress={() => setMode("days")} />
            </View>
            {mode === "days" && (
              <View style={styles.daysGrid}>
                {DAYS.map((d) => (
                  <Pressable key={d.label} onPress={() => toggleDay(d.day)} style={[styles.dayPill, days.includes(d.day) && styles.dayPillActive]}>
                    <Text style={[styles.dayText, days.includes(d.day) && styles.dayTextActive]}>{d.label}</Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionLabel}>Plan (optional)</Text>
            <TextInput value={whenStr} onChangeText={setWhenStr} placeholder="After breakfast..." style={styles.input} />
            <View style={styles.gap16} />
            <TextInput value={whereStr} onChangeText={setWhereStr} placeholder="At home..." style={styles.input} />
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionLabel}>Why (optional)</Text>
            <TextInput value={whyStr} onChangeText={setWhyStr} placeholder="One sentence..." style={[styles.input, styles.textArea]} multiline />
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionLabel}>Goal completion</Text>
            <View style={styles.completionModeRow}>
              <Chip label="No end" active={completionMode === "none"} onPress={() => changeCompletionMode("none")} />
              <Chip label="End date" active={completionMode === "date"} onPress={() => changeCompletionMode("date")} />
              <Chip label="End amount" active={completionMode === "amount"} onPress={() => changeCompletionMode("amount")} />
              <Chip label="Both" active={completionMode === "both"} onPress={() => changeCompletionMode("both")} />
            </View>

            {(completionMode === "date" || completionMode === "both") && (
              <>
                <Text style={styles.helperText}>Swipe the calendar left/right to move by month.</Text>
                <View style={styles.calendarCard}>
                  <ScrollView
                    ref={calendarPagerRef}
                    horizontal
                    pagingEnabled
                    showsHorizontalScrollIndicator={false}
                    bounces={false}
                    onLayout={(e) => setCalendarWidth(e.nativeEvent.layout.width)}
                    onMomentumScrollEnd={handleCalendarScrollEnd}
                    scrollEventThrottle={16}
                  >
                    {[{ month: prevMonth, cells: prevMonthCells }, { month: calendarMonth, cells: calendarCells }, { month: nextMonth, cells: nextMonthCells }].map((entry, pageIdx) => (
                      <View key={`${entry.month.getFullYear()}-${entry.month.getMonth()}-${pageIdx}`} style={[styles.calendarPage, { width: calendarWidth || undefined }]}> 
                        <View style={styles.calendarHeader}>
                          <Text style={styles.calendarHeaderText}>{monthLabel(entry.month)}</Text>
                        </View>

                        <View style={styles.calendarWeekHeader}>
                          {WEEKDAY_LABELS.map((label, idx) => (
                            <Text key={`${label}-${idx}`} style={styles.calendarWeekHeaderText}>{label}</Text>
                          ))}
                        </View>

                        <View style={styles.calendarGrid}>
                          {entry.cells.map((day, idx) => {
                            const dayDate = day
                              ? new Date(entry.month.getFullYear(), entry.month.getMonth(), day)
                              : null;
                            const todayStart = toStartOfDay(new Date());
                            const isToday = !!dayDate && toStartOfDay(dayDate).getTime() === todayStart.getTime();
                            const isPast = !!dayDate && toStartOfDay(dayDate).getTime() < todayStart.getTime();
                            const isSelected =
                              !!day &&
                              completionEndDate ===
                                toISODate(new Date(entry.month.getFullYear(), entry.month.getMonth(), day));

                            return (
                              <Pressable
                                key={`${pageIdx}-${idx}-${day || "blank"}`}
                                onPress={() => day && setCompletionEndDate(toISODate(new Date(entry.month.getFullYear(), entry.month.getMonth(), day)))}
                                disabled={!day}
                                style={[
                                  styles.calendarCell,
                                  isPast && styles.calendarCellPast,
                                  isToday && styles.calendarCellToday,
                                  isSelected && styles.calendarCellSelected,
                                  !day && styles.calendarCellEmpty,
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.calendarCellText,
                                    isPast && styles.calendarCellTextPast,
                                    isSelected && styles.calendarCellTextSelected,
                                  ]}
                                >
                                  {day || ""}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      </View>
                    ))}
                  </ScrollView>
                </View>

                <TextInput
                  value={completionEndDate}
                  onChangeText={(text) => setCompletionEndDate(formatDateInput(text))}
                  placeholder="YYYY-MM-DD"
                  keyboardType="number-pad"
                  maxLength={10}
                  style={[styles.input, styles.completionInput]}
                />
                {!!completionDateMeta && (
                  <View style={styles.datePreviewBox}>
                    <Text style={styles.datePreviewText}>
                      Ends {completionDateMeta.readable}
                      {completionDateMeta.daysLeft === 0
                        ? " (today)"
                        : completionDateMeta.daysLeft > 0
                        ? ` (${completionDateMeta.daysLeft} days left)`
                        : ` (${Math.abs(completionDateMeta.daysLeft)} days ago)`}
                    </Text>
                  </View>
                )}
              </>
            )}

            {(completionMode === "amount" || completionMode === "both") && (
              <View style={styles.row}>
                <TextInput
                  value={completionEndAmount}
                  onChangeText={setCompletionEndAmount}
                  keyboardType="numeric"
                  placeholder="Total amount"
                  style={[styles.input, styles.completionInput, { flex: 1, marginRight: 10 }]}
                />
                <TextInput
                  value={completionEndUnit}
                  onChangeText={setCompletionEndUnit}
                  placeholder="times"
                  style={[styles.input, styles.completionInput, { flex: 1 }]}
                />
              </View>
            )}
          </View>

          <View style={styles.card}>
            <View style={styles.reviewRow}><Text style={styles.reviewLabel}>Icon</Text><GoalIcon name={selectedIcon} size={22} color={theme.accent} /></View>
            <View style={styles.reviewRow}><Text style={styles.reviewLabel}>Name</Text><Text style={styles.reviewValue}>{name || "—"}</Text></View>
            <View style={styles.reviewRow}><Text style={styles.reviewLabel}>Schedule</Text><Text style={styles.reviewValue}>{frequencyLabel}</Text></View>
            <View style={styles.reviewRow}><Text style={styles.reviewLabel}>Garden</Text><Text style={styles.reviewValue}>{selectedGardenName}</Text></View>
            {selectedGardenId !== "personal" && (
              <View style={styles.reviewRow}><Text style={styles.reviewLabel}>Multi-user</Text><Text style={styles.reviewValue}>{multiUserWateringEnabled ? "Enabled" : "Disabled"}</Text></View>
            )}
            {selectedGardenId !== "personal" && multiUserWateringEnabled && (
              <View style={styles.reviewRow}><Text style={styles.reviewLabel}>Required users</Text><Text style={styles.reviewValue}>{Math.max(2, Math.floor(Number(requiredContributors) || 2))}</Text></View>
            )}
          </View>

          {!!formError && (
            <View style={styles.errorInline}>
              <Text style={styles.errorInlineText}>{formError}</Text>
            </View>
          )}
        </ScrollView>

        <View style={styles.footer}>
          <Button variant="secondary" label="Cancel" onPress={() => navigation.goBack()} disabled={isSaving} />
          <View style={{ width: 10 }} />
          <Button
            variant="primary"
            label={isSaving ? "Saving..." : "Save Goal"}
            onPress={save}
            disabled={isSaving || !canSave}
          />
        </View>

        <Modal visible={showIconPicker} animationType="slide" presentationStyle="fullScreen">
          <View style={styles.iconModalScreen}>
            <View style={styles.iconModalHeader}>
              <Pressable onPress={() => setShowIconPicker(false)} style={styles.iconModalHeaderBtn}>
                <Ionicons name="close" size={22} color={theme.text} />
              </Pressable>
              <View style={styles.iconModalHeaderCenter}>
                <Text style={styles.iconModalTitle}>Choose an icon</Text>
                <Text style={styles.iconModalSubTitle}>{filteredIcons.length} icons</Text>
              </View>
              <Pressable onPress={() => setShowIconPicker(false)} style={styles.iconModalDoneBtn}>
                <Text style={styles.iconModalDoneText}>Done</Text>
              </Pressable>
            </View>

            <View style={styles.iconModalSearchWrap}>
              <View style={[styles.searchBar, styles.iconModalSearchBar]}>
                <Ionicons name="search" size={18} color={theme.muted} />
                <TextInput
                  value={searchTerm}
                  onChangeText={setSearchTerm}
                  placeholder="Search icons..."
                  placeholderTextColor={theme.muted2}
                  style={styles.searchInput}
                  autoCapitalize="none"
                  autoFocus
                />
                {!!searchTerm && (
                  <Pressable onPress={() => setSearchTerm("")} hitSlop={8}>
                    <Ionicons name="close-circle" size={18} color={theme.muted} />
                  </Pressable>
                )}
              </View>
              <View style={styles.iconSelectedRow}>
                <Text style={styles.iconSelectedRowLabel}>Selected</Text>
                <View style={styles.iconSelectedPill}>
                  <GoalIcon name={selectedIcon} size={14} color="#FFFFFF" />
                  <Text style={styles.iconSelectedPillText}>{selectedIcon}</Text>
                </View>
              </View>
            </View>

            <ScrollView
              style={styles.iconModalList}
              contentContainerStyle={styles.iconGrid}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              onScroll={() => Keyboard.dismiss()}
            >
              <View style={styles.iconGridWrap}>
                {filteredIcons.map((item) => (
                  <IconItem
                    key={item}
                    iconName={item}
                    isActive={selectedIcon === item}
                    onSelect={(iconName) => {
                      setSelectedIcon(iconName);
                      setShowIconPicker(false);
                    }}
                  />
                ))}
              </View>
            </ScrollView>
          </View>
        </View>

        {/* Help overlay */}
        <CoachMark visible={helpOpen} title={helpCopy.title} body={helpCopy.body} onClose={() => setHelpOpen(false)} />
      </KeyboardAvoidingView>
    </Page>
  );
}

const styles = StyleSheet.create({
  btnBase: {
    height: 50,
    borderRadius: theme.radius,
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
    borderWidth: 1,
    borderColor: "transparent",
  },
  btnPrimary: {
    backgroundColor: theme.text,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
    elevation: 3,
  },
  btnSecondary: { backgroundColor: theme.surface, borderColor: theme.outline },
  btnTextBase: { fontSize: 16, fontWeight: "800" },
  btnTextPrimary: { color: theme.bg },
  btnTextSecondary: { color: theme.text },
  headerRow: { flexDirection: "row", marginBottom: 10 },
  hTitle: { fontSize: 20, fontWeight: "800", color: theme.text },
  hSub: { marginTop: 4, fontSize: 12, fontWeight: "600", color: theme.muted },
  dotsRow: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: theme.outline, marginRight: 8 },
  dotDone: { backgroundColor: theme.text2 },
  dotActive: { backgroundColor: theme.accent },
  contentArea: { flex: 1 },
  formScrollContent: { paddingBottom: 12 },
  card: { backgroundColor: theme.surface, borderRadius: theme.radius, padding: 16, marginBottom: 10 },
  footer: { flexDirection: "row", paddingTop: 10, paddingBottom: 8 },
  sectionLabel: { fontSize: 13, fontWeight: "800", color: theme.text, marginBottom: 6 },
  switchRow: { marginTop: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  contributorRow: { marginTop: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  switchLabel: { fontSize: 13, fontWeight: "700", color: theme.text },
  helperText: { fontSize: 12, color: theme.muted, marginBottom: 8 },
  completionModeRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 8, marginBottom: 10 },
  calendarCard: {
    backgroundColor: theme.surface2,
    borderRadius: theme.radius,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: theme.outline,
  },
  calendarHeader: {
    alignItems: "center",
    marginBottom: 10,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: theme.outline,
  },
  calendarHeaderText: { fontSize: 15, fontWeight: "800", color: theme.text },
  calendarWeekHeader: { flexDirection: "row", marginBottom: 8 },
  calendarWeekHeaderText: { flex: 1, textAlign: "center", fontSize: 11, color: theme.muted, fontWeight: "700" },
  calendarPage: { paddingHorizontal: 2, minHeight: 318 },
  calendarGrid: { flexDirection: "row", flexWrap: "wrap" },
  calendarCell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    marginBottom: 6,
  },
  calendarCellEmpty: { opacity: 0 },
  calendarCellPast: { opacity: 0.55 },
  calendarCellToday: { borderWidth: 1, borderColor: theme.accent },
  calendarCellSelected: { backgroundColor: theme.accent, borderWidth: 0 },
  calendarCellText: { fontSize: 12, color: theme.text, fontWeight: "700" },
  calendarCellTextPast: { color: theme.muted },
  calendarCellTextSelected: { color: theme.bg },
  calendarQuickActions: { flexDirection: "row", flexWrap: "wrap", marginTop: 10, gap: 10 },
  datePreviewBox: { marginTop: 10, backgroundColor: theme.surface2, borderRadius: theme.radius, padding: 10 },
  datePreviewText: { fontSize: 12, color: theme.text, fontWeight: "700" },
  completionInput: { marginTop: 2 },
  input: { backgroundColor: theme.surface2, borderRadius: theme.radius, paddingHorizontal: 14, height: 46, fontSize: 14, color: theme.text },
  contributorInput: { width: 82, textAlign: "center", paddingHorizontal: 8 },
  textArea: { height: 96, paddingTop: 12, textAlignVertical: "top" },
  gap16: { height: 16 },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", marginTop: 10, gap: 10 },
  chip: { height: 34, paddingHorizontal: 12, borderRadius: theme.radius, backgroundColor: theme.surface2, justifyContent: "center" },
  chipActive: { backgroundColor: theme.accent },
  chipText: { fontSize: 12, fontWeight: "700", color: theme.text },
  chipTextActive: { color: theme.bg },
  segmentWrap: { flexDirection: "row", backgroundColor: theme.surface2, borderRadius: theme.radius, padding: 4, marginTop: 10 },
  segment: { flex: 1, height: 40, borderRadius: theme.radius, alignItems: "center", justifyContent: "center" },
  segmentActive: { backgroundColor: theme.accent },
  segmentText: { fontSize: 12, fontWeight: "700", color: theme.text },
  segmentTextActive: { color: theme.bg },
  row: { flexDirection: "row", marginTop: 10 },
  daysGrid: { flexDirection: "row", flexWrap: "wrap", marginTop: 10, gap: 10 },
  dayPill: { minWidth: 92, height: 40, borderRadius: theme.radiusSm, backgroundColor: theme.surface2, alignItems: "center", justifyContent: "center" },
  dayPillActive: { backgroundColor: theme.accent },
  dayText: { fontSize: 12, fontWeight: "700", color: theme.text },
  dayTextActive: { color: theme.bg },
  iconPickerButton: {
    marginTop: 6,
    minHeight: 68,
    borderRadius: theme.radius,
    backgroundColor: theme.surface2,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  iconPickerButtonLeft: { flexDirection: "row", alignItems: "center", flex: 1 },
  iconPickerPreview: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  iconPickerTextWrap: { flex: 1 },
  iconPickerTitle: { fontSize: 14, fontWeight: "800", color: theme.text },
  iconPickerSubtitle: { fontSize: 12, fontWeight: "600", color: theme.muted, marginTop: 3 },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.surface2, borderRadius: 12, paddingHorizontal: 12, height: 45, marginBottom: 10 },
  searchInput: { flex: 1, marginLeft: 8, fontSize: 14, color: theme.text },
  iconList: { maxHeight: 260 },
  iconGrid: { paddingBottom: 20 },
  iconGridWrap: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  iconBox: {
    width: '23.5%',
    height: 84,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#111111',
    marginBottom: 10,
    paddingTop: 10,
    paddingHorizontal: 6,
  },
  iconBoxActive: { backgroundColor: '#111111', borderColor: '#111111', elevation: 4 },
  iconSelectedBadge: {
    position: 'absolute',
    right: 6,
    top: 6,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#111111',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconModalScreen: { flex: 1, backgroundColor: theme.bg },
  iconModalHeader: {
    paddingTop: Platform.OS === "ios" ? 58 : 28,
    paddingHorizontal: 16,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: theme.outline,
  },
  iconModalHeaderBtn: { minWidth: 40, height: 36, alignItems: 'center', justifyContent: 'center' },
  iconModalHeaderCenter: { flex: 1, alignItems: 'center' },
  iconModalTitle: { fontSize: 18, fontWeight: "900", color: theme.text },
  iconModalSubTitle: { marginTop: 2, fontSize: 12, fontWeight: '600', color: theme.muted },
  iconModalDoneBtn: {
    minWidth: 56,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#111111',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconModalDoneText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  iconModalSearchWrap: { paddingHorizontal: 16, paddingTop: 14 },
  iconModalSearchBar: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#111111',
    marginBottom: 8,
  },
  iconSelectedRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  iconSelectedRowLabel: { fontSize: 12, fontWeight: '700', color: theme.muted },
  iconSelectedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111111',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    gap: 6,
  },
  iconSelectedPillText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
  iconModalList: { flex: 1, paddingHorizontal: 12, paddingTop: 4 },
  reviewRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: theme.surface2 },
  reviewLabel: { fontSize: 13, fontWeight: "700", color: theme.muted },
  reviewValue: { fontSize: 13, fontWeight: "800", color: theme.text },
  skipRow: { flexDirection: "row", marginTop: 12, gap: 10 },
  skipToggle: { flex: 1, height: 36, borderRadius: theme.radius, backgroundColor: theme.surface2, alignItems: "center", justifyContent: "center" },
  skipToggleOn: { backgroundColor: theme.accent },
  skipText: { fontSize: 12, fontWeight: "700", color: theme.text },
  skipTextOn: { color: theme.bg },
  inlineLink: { marginTop: 8, alignSelf: "flex-start" },
  inlineLinkText: { fontSize: 12, fontWeight: "700", color: theme.muted, textDecorationLine: "underline" },
  errorInline: { marginTop: 10, backgroundColor: theme.dangerBg, borderRadius: theme.radius, padding: 12 },
  errorInlineText: { color: theme.dangerText, fontSize: 12, fontWeight: "700" },
});
