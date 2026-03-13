import React, { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  ScrollView,
  Alert,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Switch,
  Keyboard,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import * as LucideIcons from "lucide-react-native/icons";
import Page from "../components/Page";
import { theme } from "../theme";
import { useGoals, fromKey, toKey } from "../components/GoalsStore";
import { ACHIEVEMENTS } from "../AchievementsStore";
import { collection, doc, onSnapshot, deleteDoc, updateDoc, getDoc, getDocs, setDoc, arrayUnion, increment, deleteField, query, where, runTransaction } from "firebase/firestore";
import { auth, db } from "../firebaseConfig";
import { updateOverallScoresForSharedGardenMembers } from "../utils/scoreUtils";

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

const ICON_NAME_SET = new Set(pickerIconNames);
const dedupeIcons = (icons) => [...new Set(icons)];

const FEATURED_ICON_CANDIDATES = [
  "target", "user", "person-standing", "footprints", "activity",
  "dumbbell", "utensils", "apple", "pizza", "sandwich", "chef-hat",
  "briefcase", "book-open", "brain", "heart-pulse", "sprout",
  "bike", "clock-3",
];
const FEATURED_ICONS = FEATURED_ICON_CANDIDATES.filter((n) => ICON_NAME_SET.has(n));

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

const SUPPORTED_MCI_ICONS = new Set(["run-fast"]);
const isMciIconName = (name) => typeof name === "string" && name.startsWith("mci:");
const getMciName = (name) => String(name || "").slice(4);

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
const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

const CATEGORIES = ["Body", "Mind", "Spirit", "Work", "Custom"];
const STORAGE_PAGE_ID = "storage";
const STORAGE_SHELF_COUNT = 10;
const STORAGE_SHELF_SLOTS = 4;
const SHARED_GARDEN_DEFAULT_PAGE_ID = "default";
const SHARED_GARDEN_SHELVES = [
  { shelfName: "topShelf", slots: 3 },
  { shelfName: "middleShelf", slots: 3 },
  { shelfName: "bottomShelf", slots: 4 },
];

async function findFirstOpenSharedGardenSlot(gardenId, goalId) {
  if (!gardenId) return null;

  const layoutSnap = await getDocs(collection(db, "sharedGardens", gardenId, "layout"));
  const occupied = new Set();

  layoutSnap.forEach((layoutDoc) => {
    if (layoutDoc.id === goalId) return;

    const data = layoutDoc.data() || {};
    const shelfPosition = data.shelfPosition || (data.shelfName
      ? {
          pageId: data.pageId || SHARED_GARDEN_DEFAULT_PAGE_ID,
          shelfName: data.shelfName,
          slotIndex: Number(data.slotIndex) || 0,
        }
      : null);

    if (!shelfPosition) return;
    if ((shelfPosition.pageId || SHARED_GARDEN_DEFAULT_PAGE_ID) !== SHARED_GARDEN_DEFAULT_PAGE_ID) return;

    occupied.add(`${shelfPosition.shelfName}_${Number(shelfPosition.slotIndex) || 0}`);
  });

  for (const shelf of SHARED_GARDEN_SHELVES) {
    for (let slotIndex = 0; slotIndex < shelf.slots; slotIndex += 1) {
      const slotKey = `${shelf.shelfName}_${slotIndex}`;
      if (!occupied.has(slotKey)) {
        return {
          pageId: SHARED_GARDEN_DEFAULT_PAGE_ID,
          shelfName: shelf.shelfName,
          slotIndex,
        };
      }
    }
  }

  return null;
}

const clampNum = (n, min, max) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, v));
};

const toISODate = (date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const toStartOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

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

function formatScheduleLabel(schedule) {
  if (!schedule) return "No schedule";
  if (schedule.type === "everyday") return "Every day";
  if (schedule.type === "weekdays") return "Weekdays";
  if (schedule.type === "days") {
    const labels = (schedule.days || [])
      .slice()
      .sort((a, b) => a - b)
      .map((day) => DAYS.find((entry) => entry.day === day)?.label)
      .filter(Boolean);
    return labels.length ? labels.join(", ") : "Custom";
  }
  return "Custom";
}

function formatCompletionLabel(condition) {
  const type = condition?.type || "none";
  if (type === "none") return "No end";
  if (type === "date") return condition?.endDate ? `Ends on ${condition.endDate}` : "End date";
  if (type === "amount") return condition?.targetAmount ? `Ends at ${condition.targetAmount} ${condition?.unit || "times"}` : "End amount";
  if (type === "both") {
    const endDate = condition?.endDate || "an end date";
    const target = condition?.targetAmount ? `${condition.targetAmount} ${condition?.unit || "times"}` : "a target amount";
    return `${endDate} and ${target}`;
  }
  return "No end";
}

function healthLabel(level) {
  if ((Number(level) || 0) >= 3) return "Healthy";
  if ((Number(level) || 0) === 2) return "Dry";
  return "Dead";
}

function isGoalDoneForDate(goal, dateKey) {
  if (goal?.type === "completion") {
    const isSharedMultiUser = !!goal?.multiUserWateringEnabled && goal?.gardenType === "shared";
    if (isSharedMultiUser) {
      const usersMap = goal?.logs?.completion?.[dateKey]?.users || {};
      const uniqueCount = Object.keys(usersMap).filter((userId) => !!usersMap[userId]).length;
      const requiredContributors = Number(goal?.requiredContributors);
      const threshold = Number.isFinite(requiredContributors) && requiredContributors >= 2
        ? Math.floor(requiredContributors)
        : 2;
      return uniqueCount >= threshold;
    }
    return !!goal?.logs?.completion?.[dateKey]?.done;
  }
  return (goal?.logs?.quantity?.[dateKey]?.value ?? 0) >= (goal?.measurable?.target ?? 0);
}

function dateFromFirestoreValue(value) {
  if (!value) return null;
  if (typeof value?.toDate === "function") {
    const converted = value.toDate();
    return Number.isNaN(converted?.getTime?.()) ? null : converted;
  }
  if (typeof value?.seconds === "number") {
    const converted = new Date(value.seconds * 1000);
    return Number.isNaN(converted.getTime()) ? null : converted;
  }
  const converted = new Date(value);
  return Number.isNaN(converted.getTime()) ? null : converted;
}

function isGoalScheduledOnDate(goal, date) {
  const scheduleType = goal?.schedule?.type;
  const dayOfWeek = new Date(date).getDay();

  if (scheduleType === "everyday") return true;
  if (scheduleType === "weekdays") return dayOfWeek >= 1 && dayOfWeek <= 5;
  if (scheduleType === "days") return !!goal?.schedule?.days?.includes(dayOfWeek);

  if (Array.isArray(goal?.schedule?.days) && goal.schedule.days.length > 0) {
    return goal.schedule.days.includes(dayOfWeek);
  }

  return true;
}

function getPlantHealthState(goal, now = new Date()) {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  const storedHealthLevel = Number(goal?.healthLevel);
  if (goal?.shelfPosition?.pageId === STORAGE_PAGE_ID && storedHealthLevel >= 1 && storedHealthLevel <= 3) {
    if (storedHealthLevel === 2) return { healthLevel: 2, status: "dry" };
    if (storedHealthLevel === 1) return { healthLevel: 1, status: "dead" };
    return { healthLevel: 3, status: "alive" };
  }

  const createdAtDate = dateFromFirestoreValue(goal?.createdAt);
  const earliestDate = createdAtDate ? new Date(createdAtDate) : null;
  if (earliestDate) earliestDate.setHours(0, 0, 0, 0);

  const recentScheduledKeys = [];
  const cursor = new Date(today);
  for (let i = 0; i < 370 && recentScheduledKeys.length < 2; i += 1) {
    if (earliestDate && cursor.getTime() < earliestDate.getTime()) break;
    if (isGoalScheduledOnDate(goal, cursor)) {
      recentScheduledKeys.push(toKey(cursor));
    }
    cursor.setDate(cursor.getDate() - 1);
  }

  let derived = { healthLevel: 1, status: "dead" };

  if (recentScheduledKeys.length === 0) {
    derived = { healthLevel: 3, status: "alive" };
  } else if (isGoalDoneForDate(goal, recentScheduledKeys[0])) {
    derived = { healthLevel: 3, status: "alive" };
  } else if (recentScheduledKeys.length === 1 || isGoalDoneForDate(goal, recentScheduledKeys[1])) {
    derived = { healthLevel: 2, status: "dry" };
  }

  if (storedHealthLevel >= 1 && storedHealthLevel < derived.healthLevel) {
    if (storedHealthLevel === 2) return { healthLevel: 2, status: "dry" };
    return { healthLevel: 1, status: "dead" };
  }

  return derived;
}

async function findFirstOpenStorageSlot(uid, goalId) {
  const layoutSnap = await getDocs(collection(db, "users", uid, "gardenLayout"));
  const occupied = new Set();

  layoutSnap.forEach((layoutDoc) => {
    if (layoutDoc.id === goalId) return;
    const shelfPosition = layoutDoc.data()?.shelfPosition;
    if (shelfPosition?.pageId === STORAGE_PAGE_ID) {
      occupied.add(`${shelfPosition.shelfName}_${shelfPosition.slotIndex}`);
    }
  });

  for (let shelfIdx = 0; shelfIdx < STORAGE_SHELF_COUNT; shelfIdx += 1) {
    const shelfName = `storageShelf_${shelfIdx}`;
    for (let slotIndex = 0; slotIndex < STORAGE_SHELF_SLOTS; slotIndex += 1) {
      const key = `${shelfName}_${slotIndex}`;
      if (!occupied.has(key)) {
        return { pageId: STORAGE_PAGE_ID, shelfName, slotIndex };
      }
    }
  }

  return null;
}

async function findFirstOpenSharedStorageSlot(gardenId, goalId) {
  if (!gardenId) return null;

  const layoutSnap = await getDocs(collection(db, "sharedGardens", gardenId, "layout"));
  const occupied = new Set();

  layoutSnap.forEach((layoutDoc) => {
    if (layoutDoc.id === goalId) return;
    const shelfPosition = layoutDoc.data()?.shelfPosition;
    if (shelfPosition?.pageId === STORAGE_PAGE_ID) {
      occupied.add(`${shelfPosition.shelfName}_${shelfPosition.slotIndex}`);
    }
  });

  for (let shelfIdx = 0; shelfIdx < STORAGE_SHELF_COUNT; shelfIdx += 1) {
    const shelfName = `storageShelf_${shelfIdx}`;
    for (let slotIndex = 0; slotIndex < STORAGE_SHELF_SLOTS; slotIndex += 1) {
      const key = `${shelfName}_${slotIndex}`;
      if (!occupied.has(key)) {
        return { pageId: STORAGE_PAGE_ID, shelfName, slotIndex };
      }
    }
  }

  return null;
}

function Chip({ label, active, onPress }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

function Segmented({ left, right, value, onChange }) {
  return (
    <View style={styles.segmentWrap}>
      <Pressable onPress={() => onChange(left.value)} style={[styles.segment, value === left.value && styles.segmentActive]}>
        <Text style={[styles.segmentText, value === left.value && styles.segmentTextActive]}>{left.label}</Text>
      </Pressable>
      <Pressable onPress={() => onChange(right.value)} style={[styles.segment, value === right.value && styles.segmentActive]}>
        <Text style={[styles.segmentText, value === right.value && styles.segmentTextActive]}>{right.label}</Text>
      </Pressable>
    </View>
  );
}

function DetailRow({ label, value }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value || "—"}</Text>
    </View>
  );
}

const IconItem = memo(({ iconName, isActive, onSelect }) => (
  <Pressable onPress={() => onSelect(iconName)} style={[styles.iconBox, isActive && styles.iconBoxActive]}>
    {isActive && (
      <View style={styles.iconSelectedBadge}>
        <Ionicons name="checkmark" size={12} color="#FFFFFF" />
      </View>
    )}
    <GoalIcon name={iconName} size={45} color={isActive ? "#FFFFFF" : "#111111"} />
  </Pressable>
));

function SwipeCalendar({ month, setMonth, selectedDate, onSelectDate }) {
  const [calendarWidth, setCalendarWidth] = useState(0);
  const calendarPagerRef = useRef(null);

  const calendarCells = useMemo(() => buildMonthGrid(month), [month]);
  const prevMonth = useMemo(() => new Date(month.getFullYear(), month.getMonth() - 1, 1), [month]);
  const nextMonth = useMemo(() => new Date(month.getFullYear(), month.getMonth() + 1, 1), [month]);
  const prevMonthCells = useMemo(() => buildMonthGrid(prevMonth), [prevMonth]);
  const nextMonthCells = useMemo(() => buildMonthGrid(nextMonth), [nextMonth]);

  useEffect(() => {
    if (!calendarWidth || !calendarPagerRef.current) return;
    calendarPagerRef.current.scrollTo({ x: calendarWidth, animated: false });
  }, [calendarWidth, month]);

  const handleCalendarScrollEnd = (event) => {
    if (!calendarWidth) return;
    const offsetX = event.nativeEvent.contentOffset.x;
    const pageIndex = Math.round(offsetX / calendarWidth);
    if (pageIndex === 0) {
      setMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
    } else if (pageIndex === 2) {
      setMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
    }
  };

  const todayStart = toStartOfDay(new Date());

  return (
    <View style={styles.calendarCard}>
      <Text style={styles.helperText}>Swipe the calendar left/right to move by month.</Text>
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
        {[{ month: prevMonth, cells: prevMonthCells }, { month, cells: calendarCells }, { month: nextMonth, cells: nextMonthCells }].map((entry, pageIdx) => (
          <View key={`${entry.month.getFullYear()}-${entry.month.getMonth()}-${pageIdx}`} style={[styles.calendarPage, { width: calendarWidth || undefined }]}> 
            <View style={styles.calendarHeader}>
              <Text style={styles.calendarHeaderText}>{monthLabel(entry.month)}</Text>
            </View>

            <View style={styles.calendarWeekHeader}>
              {WEEKDAY_LABELS.map((label, idx) => (
                <Text key={`${label}-${idx}`} style={styles.calendarWeekHeaderText}>{label}</Text>
              ))}
            </View>

            <View style={styles.calendarGridFull}>
              {entry.cells.map((day, idx) => {
                const dayDate = day ? new Date(entry.month.getFullYear(), entry.month.getMonth(), day) : null;
                const isToday = !!dayDate && toStartOfDay(dayDate).getTime() === todayStart.getTime();
                const isPast = !!dayDate && toStartOfDay(dayDate).getTime() < todayStart.getTime();
                const iso = day ? toISODate(new Date(entry.month.getFullYear(), entry.month.getMonth(), day)) : "";
                const isSelected = !!day && selectedDate === iso;

                return (
                  <Pressable
                    key={`${pageIdx}-${idx}-${day || "blank"}`}
                    onPress={() => day && onSelectDate(iso)}
                    disabled={!day}
                    style={[
                      styles.calendarCell,
                      isPast && styles.calendarCellPast,
                      isToday && styles.calendarCellToday,
                      isSelected && styles.calendarCellSelected,
                      !day && styles.calendarCellEmpty,
                    ]}
                  >
                    <Text style={[styles.calendarCellText, isPast && styles.calendarCellTextPast, isSelected && styles.calendarCellTextSelected]}>
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
  );
}

export default function GoalScreen({ route, navigation }) {
  const MODAL_SWAP_DELAY = 180;
  const { goalId, source, sharedGardenId: routeSharedGardenId } = route.params || {};
  const isSharedGoalView = Boolean(routeSharedGardenId);
  const { selectedDateKey } = useGoals();

  const [goal, setGoal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showIconModal, setShowIconModal] = useState(false);
  const [editView, setEditView] = useState("form"); // "form" | "icons"
  const [iconSearch, setIconSearch] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isCompletingToTrophy, setIsCompletingToTrophy] = useState(false);
  const [shelfPosition, setShelfPosition] = useState(null);
  const [showReturnDateModal, setShowReturnDateModal] = useState(false);
  const [returnEndDateInput, setReturnEndDateInput] = useState("");
  const [returnCalendarMonth, setReturnCalendarMonth] = useState(toStartOfDay(new Date()));
  const [showPostponeDateModal, setShowPostponeDateModal] = useState(false);
  const [postponeEndDateInput, setPostponeEndDateInput] = useState("");
  const [postponeCalendarMonth, setPostponeCalendarMonth] = useState(toStartOfDay(new Date()));
  const modalSwapTimeoutRef = useRef(null);
  const [sharedGardens, setSharedGardens] = useState([]);
  const [selectedGardenId, setSelectedGardenId] = useState("personal");

  const [name, setName] = useState("");
  const [category, setCategory] = useState("Custom");
  const [isPrivate, setIsPrivate] = useState(false);
  const [selectedIcon, setSelectedIcon] = useState("target");
  const [type, setType] = useState("completion");
  const [target, setTarget] = useState("1");
  const [unit, setUnit] = useState("times");
  const [mode, setMode] = useState("days");
  const [days, setDays] = useState([]);
  const [whenStr, setWhenStr] = useState("");
  const [whereStr, setWhereStr] = useState("");
  const [whyStr, setWhyStr] = useState("");
  const [completionMode, setCompletionMode] = useState("none");
  const [completionEndDate, setCompletionEndDate] = useState("");
  const [completionEndAmount, setCompletionEndAmount] = useState("");
  const [completionEndUnit, setCompletionEndUnit] = useState("times");
  const [multiUserWateringEnabled, setMultiUserWateringEnabled] = useState(false);
  const [requiredContributors, setRequiredContributors] = useState("2");
  const [editCalendarMonth, setEditCalendarMonth] = useState(toStartOfDay(new Date()));
  const uid = auth.currentUser?.uid;

  useEffect(() => {
    if (!goalId) {
      setGoal(null);
      setLoading(false);
      return;
    }

    if (isSharedGoalView) {
      setLoading(true);
      const sharedGoalRef = doc(db, "sharedGardens", routeSharedGardenId, "layout", goalId);
      const unsubscribe = onSnapshot(
        sharedGoalRef,
        (docSnap) => {
          if (docSnap.exists()) {
            setGoal({
              id: docSnap.id,
              ...docSnap.data(),
              gardenType: "shared",
              sharedGardenId: routeSharedGardenId,
              gardenId: routeSharedGardenId,
            });
          } else {
            setGoal(null);
          }
          setLoading(false);
        },
        (error) => {
          if (error?.code !== "permission-denied") {
            console.error("Error fetching shared goal:", error);
          }
          setGoal(null);
          setLoading(false);
        }
      );

      return () => unsubscribe();
    }

    if (!uid) {
      setGoal(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const goalRef = doc(db, "users", uid, "goals", goalId);
    const unsubscribe = onSnapshot(
      goalRef,
      (docSnap) => {
        if (docSnap.exists()) {
          setGoal({ id: docSnap.id, ...docSnap.data() });
        } else {
          setGoal(null);
        }
        setLoading(false);
      },
      (error) => {
        if (error?.code !== "permission-denied" || auth.currentUser?.uid === uid) {
          console.error("Error fetching goal:", error);
        }
        setGoal(null);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [goalId, isSharedGoalView, routeSharedGardenId, uid]);

  useEffect(() => {
    if (isSharedGoalView) {
      setShelfPosition(goal?.shelfPosition || null);
      return;
    }

    if (!uid || !goalId) {
      setShelfPosition(null);
      return;
    }

    const layoutRef = doc(db, "users", uid, "gardenLayout", goalId);
    const unsubscribeLayout = onSnapshot(
      layoutRef,
      (layoutSnap) => {
        setShelfPosition(layoutSnap.exists() ? (layoutSnap.data()?.shelfPosition || null) : null);
      },
      (error) => {
        if (error?.code !== "permission-denied" || auth.currentUser?.uid === uid) {
          console.error("Error fetching goal layout:", error);
        }
        setShelfPosition(null);
      }
    );

    return () => unsubscribeLayout();
  }, [goal?.shelfPosition, goalId, isSharedGoalView, uid]);

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

  useEffect(() => {
    if (!goal) return;
    setName(goal.name || "");
    setCategory(goal.category || "Custom");
    setIsPrivate(!!goal.isPrivate);
    setSelectedIcon(normalizeGoalIconName(goal.icon, "target"));
    setType(goal.type || "completion");
    setTarget(String(goal?.measurable?.target ?? 1));
    setUnit(goal?.measurable?.unit || "times");
    setMode(goal?.schedule?.type || "days");
    setDays(goal?.schedule?.days || []);
    setWhenStr(goal?.plan?.when || "");
    setWhereStr(goal?.plan?.where || "");
    setWhyStr(goal?.why || "");
    setCompletionMode(goal?.completionCondition?.type || "none");
    setCompletionEndDate(goal?.completionCondition?.endDate || "");
    setCompletionEndAmount(goal?.completionCondition?.targetAmount ? String(goal.completionCondition.targetAmount) : "");
    setCompletionEndUnit(goal?.completionCondition?.unit || "times");
    setSelectedGardenId(goal?.sharedGardenId || goal?.gardenId || "personal");
    setMultiUserWateringEnabled(!!goal?.multiUserWateringEnabled);
    setRequiredContributors(String(Math.max(2, Math.floor(Number(goal?.requiredContributors) || 2))));
    setEditCalendarMonth(monthFromISOOrToday(goal?.completionCondition?.endDate || ""));
  }, [goal]);

  const handleBack = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }

    const parentNav = navigation.getParent?.();
    if (source === "shared-garden") {
      const sharedGardenName = route?.params?.gardenName || "Shared Garden";
      if (parentNav) {
        parentNav.navigate("Garden", {
          screen: "SharedGarden",
          params: {
            gardenId: routeSharedGardenId,
            sharedGardenId: routeSharedGardenId,
            gardenName: sharedGardenName,
          },
        });
      } else {
        navigation.navigate("SharedGarden", {
          gardenId: routeSharedGardenId,
          sharedGardenId: routeSharedGardenId,
          gardenName: sharedGardenName,
        });
      }
      return;
    }
    if (source === "garden") {
      if (parentNav) {
        parentNav.navigate("Garden", { screen: "GardenHome" });
      } else {
        navigation.navigate("GardenHome");
      }
      return;
    }
    if (parentNav) {
      parentNav.navigate("Goals", { screen: "GoalsHome" });
    } else {
      navigation.navigate("GoalsHome");
    }
  };

  const confirmDelete = () => {
    Alert.alert("Delete Goal", "Are you sure? This will remove all progress and history for this plant.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: deleteGoal },
    ]);
  };

  const deleteGoal = async () => {
    try {
      const assignedSharedGardenId = goal?.sharedGardenId || (goal?.gardenType === "shared" ? goal?.gardenId : null);
      if (assignedSharedGardenId) {
        await deleteDoc(doc(db, "sharedGardens", assignedSharedGardenId, "layout", goalId));
      }
      await deleteDoc(doc(db, "users", auth.currentUser.uid, "goals", goalId));
      handleBack();
    } catch (e) {
      Alert.alert("Error", "Could not delete goal.");
    }
  };

  const scheduleDays = useMemo(() => {
    if (mode === "everyday") return [0, 1, 2, 3, 4, 5, 6];
    if (mode === "weekdays") return [1, 2, 3, 4, 5];
    return days;
  }, [days, mode]);

  const frequencyLabel = useMemo(() => formatScheduleLabel({ type: mode, days: scheduleDays }), [mode, scheduleDays]);

  const selectedGardenName = useMemo(() => {
    if (selectedGardenId === "personal") return "Personal Garden";
    return sharedGardens.find((garden) => garden.id === selectedGardenId)?.name || "Shared Garden";
  }, [selectedGardenId, sharedGardens]);

  const measurableForType = useMemo(() => {
    if (type === "completion") return { target: 1, unit: "times" };
    return { target: clampNum(target, 1, 9999), unit: unit.trim() || "units" };
  }, [target, type, unit]);

  const completionCondition = useMemo(() => {
    if (completionMode === "date" && completionEndDate.trim()) {
      return { type: "date", endDate: completionEndDate.trim() };
    }
    if (completionMode === "amount" && Number(completionEndAmount) > 0) {
      return { type: "amount", targetAmount: clampNum(completionEndAmount, 1, 999999), unit: completionEndUnit.trim() || "times" };
    }
    if (completionMode === "both" && completionEndDate.trim() && Number(completionEndAmount) > 0) {
      return {
        type: "both",
        endDate: completionEndDate.trim(),
        targetAmount: clampNum(completionEndAmount, 1, 999999),
        unit: completionEndUnit.trim() || "times",
      };
    }
    return { type: "none" };
  }, [completionEndAmount, completionEndDate, completionEndUnit, completionMode]);

  const filteredIcons = useMemo(() => {
    const cleanSearch = iconSearch.toLowerCase().trim();
    if (!cleanSearch) {
      return dedupeIcons([...FEATURED_ICONS, ...pickerIconNames]).slice(0, 120);
    }
    const directMatches = pickerIconNames.filter((n) => n.includes(cleanSearch));
    const synonymMatches = Object.entries(ICON_SEARCH_SYNONYMS)
      .filter(([key]) => key.includes(cleanSearch) || cleanSearch.includes(key))
      .flatMap(([, icons]) => icons)
      .filter((n) => ICON_NAME_SET.has(n));
    return dedupeIcons([...synonymMatches, ...directMatches]).slice(0, 180);
  }, [iconSearch]);

  const formError = useMemo(() => {
    if (name.trim().length < 3) return "Give it a short name (at least 3 characters).";
    if (!selectedIcon) return "Please select an icon.";
    if (type === "quantity" && (!(Number(target) > 0) || unit.trim().length < 1)) return "Quantity needs a number and unit.";
    if (!scheduleDays.length) return "Pick at least one day.";
    if ((completionMode === "date" || completionMode === "both") && !completionEndDate.trim()) return "Enter an end date.";
    if ((completionMode === "amount" || completionMode === "both") && !(Number(completionEndAmount) > 0)) return "End amount must be greater than 0.";
    if (selectedGardenId !== "personal" && multiUserWateringEnabled && !(Number(requiredContributors) >= 2)) return "Required contributors must be at least 2.";
    return "";
  }, [completionEndAmount, completionEndDate, completionMode, multiUserWateringEnabled, name, requiredContributors, scheduleDays.length, selectedGardenId, selectedIcon, target, type, unit]);

  const toggleDay = (day) => setDays((prev) => (prev.includes(day) ? prev.filter((item) => item !== day) : [...prev, day]));

  useEffect(() => {
    return () => {
      if (modalSwapTimeoutRef.current) {
        clearTimeout(modalSwapTimeoutRef.current);
      }
    };
  }, []);

  const queueModalSwap = (callback) => {
    if (modalSwapTimeoutRef.current) {
      clearTimeout(modalSwapTimeoutRef.current);
    }
    modalSwapTimeoutRef.current = setTimeout(() => {
      modalSwapTimeoutRef.current = null;
      callback();
    }, MODAL_SWAP_DELAY);
  };

  const openEditModal = () => {
    if (modalSwapTimeoutRef.current) {
      clearTimeout(modalSwapTimeoutRef.current);
      modalSwapTimeoutRef.current = null;
    }
    setShowIconModal(false);
    setEditView("form");
    setIconSearch("");
    setShowEditModal(true);
  };

  const openIconModal = () => {
    setShowEditModal(false);
    setEditView("icons");
    queueModalSwap(() => setShowIconModal(true));
  };

  const closeIconModal = () => {
    setShowIconModal(false);
    setIconSearch("");
    setEditView("form");
    queueModalSwap(() => setShowEditModal(true));
  };

  const saveEdits = async () => {
    if (!auth.currentUser || !goal || formError || isSaving) return;
    setIsSaving(true);
    try {
      const currentGardenId = goal?.sharedGardenId || goal?.gardenId || "personal";
      const nextSharedGardenId = selectedGardenId === "personal" ? null : selectedGardenId;
      const wasSharedGardenId = goal?.sharedGardenId || (goal?.gardenType === "shared" ? goal?.gardenId : null);
      const isGardenChanged = selectedGardenId !== currentGardenId;
      const nextGardenPayload = {
        gardenId: selectedGardenId,
        gardenType: nextSharedGardenId ? "shared" : "personal",
        sharedGardenId: nextSharedGardenId,
        multiUserWateringEnabled: nextSharedGardenId ? !!multiUserWateringEnabled : false,
        requiredContributors:
          nextSharedGardenId && multiUserWateringEnabled
            ? Math.max(2, Math.floor(Number(requiredContributors) || 2))
            : 1,
      };

      const updatedGoalData = {
        name: name.trim(),
        category,
        isPrivate,
        icon: selectedIcon,
        type,
        measurable: measurableForType,
        schedule: { type: mode, days: scheduleDays },
        frequencyLabel,
        completionCondition,
        plan: { when: whenStr.trim(), where: whereStr.trim() },
        why: whyStr.trim(),
        ...nextGardenPayload,
      };

      await updateDoc(doc(db, "users", auth.currentUser.uid, "goals", goal.id), updatedGoalData);

      if (nextSharedGardenId) {
        const sharedLayoutRef = doc(db, "sharedGardens", nextSharedGardenId, "layout", goal.id);
        const sharedPayload = {
          ...goal,
          ...updatedGoalData,
          ownerId: auth.currentUser.uid,
          sourceGoalId: goal.id,
        };

        if (isGardenChanged) {
          sharedPayload.shelfPosition = null;
          sharedPayload.pageId = null;
          sharedPayload.shelfName = null;
          sharedPayload.slotIndex = null;
        }

        await setDoc(sharedLayoutRef, sharedPayload, { merge: true });
      }

      if (isGardenChanged && !nextSharedGardenId) {
        await setDoc(
          doc(db, "users", auth.currentUser.uid, "gardenLayout", goal.id),
          { shelfPosition: null },
          { merge: true }
        );
      }

      if (wasSharedGardenId && wasSharedGardenId !== nextSharedGardenId) {
        await deleteDoc(doc(db, "sharedGardens", wasSharedGardenId, "layout", goal.id));
      }

      setShowEditModal(false);
    } catch (error) {
      Alert.alert("Error", "Could not update goal.");
    } finally {
      setIsSaving(false);
    }
  };

  const calculateStreak = (goalData, newLogs) => {
    let current = 0;
    let longest = goalData.longestStreak || 0;
    const checkDateBase = fromKey(selectedDateKey);
    const checkToday = new Date(checkDateBase);
    checkToday.setHours(0, 0, 0, 0);
    let checkDate = new Date(checkToday);

    for (let i = 0; i < 365; i += 1) {
      const dateKey = toKey(checkDate);
      const dayOfWeek = checkDate.getDay();
      const isScheduled = goalData.schedule?.type === "everyday"
        || (goalData.schedule?.type === "weekdays" && dayOfWeek >= 1 && dayOfWeek <= 5)
        || (goalData.schedule?.type === "days" && goalData.schedule?.days?.includes(dayOfWeek));

      if (isScheduled) {
        const isDoneOnDate = goalData.type === "completion"
          ? !!newLogs?.completion?.[dateKey]?.done
          : (newLogs?.quantity?.[dateKey]?.value ?? 0) >= (goalData.measurable?.target ?? 0);

        if (isDoneOnDate) current += 1;
        else if (dateKey !== toKey(checkToday)) break;
      }
      checkDate.setDate(checkDate.getDate() - 1);
    }

    if (current > longest) longest = current;
    return { currentStreak: current, longestStreak: longest };
  };

  const updateOverallAppStreak = async () => {
    if (!auth.currentUser) return 0;
    const now = new Date();
    const todayStr = toKey(now);
    const yesterdayDate = new Date(now);
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterdayStr = toKey(yesterdayDate);

    try {
      const userRef = doc(db, "users", auth.currentUser.uid);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        const userData = userSnap.data();
        let currentAppStreak = userData.streakCount || 0;
        if (userData.lastActiveDate === todayStr) return currentAppStreak;
        currentAppStreak = userData.lastActiveDate === yesterdayStr ? currentAppStreak + 1 : 1;
        await updateDoc(userRef, { streakCount: currentAppStreak, lastActiveDate: todayStr });
        return currentAppStreak;
      }
    } catch (error) {
      console.error(error);
    }
    return 0;
  };

  const checkAchievements = async (currentAppStreak) => {
    if (!auth.currentUser) return;
    try {
      const userRef = doc(db, "users", auth.currentUser.uid);
      const userSnap = await getDoc(userRef);
      if (!userSnap.exists()) return;
      const userData = userSnap.data();
      const unlockedIds = userData.unlockedAchievements || [];
      const currentStats = { appStreak: currentAppStreak, overallScore: userData.overallScore || 0 };
      const newlyUnlocked = ACHIEVEMENTS.filter((ach) => !unlockedIds.includes(ach.id) && ach.check(currentStats));

      if (newlyUnlocked.length > 0) {
        const newIds = newlyUnlocked.map((ach) => ach.id);
        const newTitles = newlyUnlocked.map((ach) => `${ach.icon} ${ach.title}`);
        await updateDoc(userRef, { unlockedAchievements: arrayUnion(...newIds) });
        Alert.alert("🏆 Achievement Unlocked!", `Great job! You just earned:\n\n${newTitles.join("\n")}`);
      }
    } catch (error) {
      console.error(error);
    }
  };

  const performToggleComplete = async ({ archiveToStorage = false } = {}) => {
    if (!auth.currentUser || !goal || shelfPosition?.pageId === STORAGE_PAGE_ID) return;

    try {
      const isCurrentlyDone = isGoalDoneForDate(goal, selectedDateKey);
      const isSelectedToday = selectedDateKey === toKey(new Date());
      const currentUserId = auth.currentUser.uid;
      const isSharedMultiUser = isSharedGoalView && goal?.type === "completion" && !!goal?.multiUserWateringEnabled;

      if (isSharedMultiUser) {
        const sharedRef = doc(db, "sharedGardens", routeSharedGardenId, "layout", goal.id);
        let transactionUpdate = null;
        let ownerIdForSync = null;
        let sourceGoalIdForSync = null;

        await runTransaction(db, async (tx) => {
          const snap = await tx.get(sharedRef);
          if (!snap.exists()) return;

          const latestGoal = { id: snap.id, ...snap.data(), gardenType: "shared" };
          ownerIdForSync = latestGoal?.ownerId || null;
          sourceGoalIdForSync = latestGoal?.sourceGoalId || null;

          if (latestGoal?.shelfPosition?.pageId === STORAGE_PAGE_ID) return;

          const latestLogs = JSON.parse(JSON.stringify(latestGoal.logs || {}));
          if (!latestLogs.completion) latestLogs.completion = {};

          const existingEntry = latestLogs.completion[selectedDateKey] || {};
          const existingUsers = existingEntry.users || {};
          const hasUserContribution = !!existingUsers[currentUserId];

          const wasDone = isGoalDoneForDate(latestGoal, selectedDateKey);
          const nextUsers = { ...existingUsers };
          if (hasUserContribution) {
            delete nextUsers[currentUserId];
          } else {
            nextUsers[currentUserId] = true;
          }
          const uniqueCount = Object.keys(nextUsers).filter((userId) => !!nextUsers[userId]).length;
          const requiredContributors = Math.max(2, Math.floor(Number(latestGoal?.requiredContributors) || 2));
          const isNowDone = uniqueCount >= requiredContributors;

          const nextEntry = { ...existingEntry, users: nextUsers, done: isNowDone };
          latestLogs.completion[selectedDateKey] = nextEntry;

          const txUpdateData = {
            [`logs.completion.${selectedDateKey}`]: nextEntry,
          };

          if (isNowDone !== wasDone) {
            const nextGoalState = { ...latestGoal, logs: latestLogs };
            const { currentStreak, longestStreak } = calculateStreak(nextGoalState, latestLogs);
            const currentPlantHealth = getPlantHealthState(latestGoal, fromKey(selectedDateKey)).healthLevel;
            txUpdateData.currentStreak = currentStreak;
            txUpdateData.longestStreak = longestStreak;
            txUpdateData.totalCompletions = increment(isNowDone ? 1 : -1);
            txUpdateData.healthLevel = isNowDone ? (currentPlantHealth <= 1 ? 2 : 3) : 2;
          }

          tx.update(sharedRef, txUpdateData);
          transactionUpdate = txUpdateData;
        });

        if (!transactionUpdate) return;

        if (ownerIdForSync && sourceGoalIdForSync) {
          try {
            await updateDoc(doc(db, "users", ownerIdForSync, "goals", sourceGoalIdForSync), transactionUpdate);
          } catch (syncError) {
            if (syncError?.code !== "permission-denied") {
              console.error("Error syncing shared goal progress:", syncError);
            }
          }
        }

        await updateOverallScoresForSharedGardenMembers(routeSharedGardenId);

        return;
      }

      const goalRef = isSharedGoalView
        ? doc(db, "sharedGardens", routeSharedGardenId, "layout", goal.id)
        : doc(db, "users", auth.currentUser.uid, "goals", goal.id);
      const updatedLogs = JSON.parse(JSON.stringify(goal.logs || {}));
      const updateData = {};
      let shouldAwardCompletion = false;

      if (goal.type === "completion") {
        if (!updatedLogs.completion) updatedLogs.completion = {};

        if (isSharedMultiUser) {
          const existingEntry = updatedLogs.completion[selectedDateKey] || {};
          const existingUsers = existingEntry.users || {};
          if (existingUsers[currentUserId]) return;

          const nextUsers = { ...existingUsers, [currentUserId]: true };
          const uniqueCount = Object.keys(nextUsers).filter((userId) => !!nextUsers[userId]).length;
          const requiredContributors = Math.max(2, Math.floor(Number(goal?.requiredContributors) || 2));
          const isNowDone = uniqueCount >= requiredContributors;
          updatedLogs.completion[selectedDateKey] = { ...existingEntry, users: nextUsers, done: isNowDone };
          updateData[`logs.completion.${selectedDateKey}`] = updatedLogs.completion[selectedDateKey];
          shouldAwardCompletion = isNowDone && !isCurrentlyDone;
        } else {
          updatedLogs.completion[selectedDateKey] = { done: !isCurrentlyDone };
          updateData[`logs.completion.${selectedDateKey}.done`] = !isCurrentlyDone;
          shouldAwardCompletion = !isCurrentlyDone;
        }
      } else {
        if (!updatedLogs.quantity) updatedLogs.quantity = {};
        const targetValue = goal.measurable?.target || 1;
        updatedLogs.quantity[selectedDateKey] = { value: isCurrentlyDone ? 0 : targetValue };
        updateData[`logs.quantity.${selectedDateKey}.value`] = isCurrentlyDone ? 0 : targetValue;
        shouldAwardCompletion = !isCurrentlyDone;
      }

      if (shouldAwardCompletion || (!isSharedGoalView && isCurrentlyDone)) {
        const growthChange = isCurrentlyDone ? -1 : 1;
        const { currentStreak, longestStreak } = calculateStreak(goal, updatedLogs);
        const currentPlantHealth = getPlantHealthState(goal, fromKey(selectedDateKey)).healthLevel;
        updateData.currentStreak = currentStreak;
        updateData.longestStreak = longestStreak;
        updateData.totalCompletions = increment(growthChange);
        updateData.healthLevel = isCurrentlyDone ? 2 : currentPlantHealth <= 1 ? 2 : 3;
      }

      await updateDoc(goalRef, updateData);

      if (isSharedGoalView && goal?.ownerId && goal?.sourceGoalId) {
        try {
          await updateDoc(doc(db, "users", goal.ownerId, "goals", goal.sourceGoalId), updateData);
        } catch (syncError) {
          if (syncError?.code !== "permission-denied") {
            console.error("Error syncing shared goal progress:", syncError);
          }
        }
      }

      if (isSharedGoalView) {
        await updateOverallScoresForSharedGardenMembers(routeSharedGardenId);
      }

      if (!isSharedGoalView && archiveToStorage && !isCurrentlyDone) {
        const storageSlot = await findFirstOpenStorageSlot(auth.currentUser.uid, goal.id);
        if (storageSlot) {
          await setDoc(
            doc(db, "users", auth.currentUser.uid, "gardenLayout", goal.id),
            { shelfPosition: storageSlot },
            { merge: true }
          );
        }
      }

      if (!isSharedGoalView && shouldAwardCompletion && isSelectedToday) {
        const newAppStreak = await updateOverallAppStreak();
        await checkAchievements(newAppStreak);
      }
    } catch (error) {
      console.error("Error toggling goal status:", error);
      Alert.alert("Error", "Could not update goal progress.");
    }
  };

  const handleToggleComplete = async () => {
    if (!goal || shelfPosition?.pageId === STORAGE_PAGE_ID) return;

    if (isSharedGoalView) {
      await performToggleComplete({ archiveToStorage: false });
      return;
    }

    const isCurrentlyDone = isGoalDoneForDate(goal, selectedDateKey);
    const willBeDone = !isCurrentlyDone;
    const endDate = goal?.completionCondition?.endDate;
    const hasDateBound = goal?.completionCondition?.type === "date" || goal?.completionCondition?.type === "both";
    const isLastDay = hasDateBound && !!endDate && endDate === selectedDateKey;

    if (willBeDone && isLastDay) {
      Alert.alert(
        "Last Day Reached",
        "This is the goal’s end date. Turn it into a trophy or postpone the end date?",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Make Trophy", style: "default", onPress: completeGoalToTrophy },
          {
            text: "Postpone End Date",
            style: "default",
            onPress: () => {
              setPostponeEndDateInput(endDate || "");
              setPostponeCalendarMonth(monthFromISOOrToday(endDate || ""));
              setShowPostponeDateModal(true);
            },
          },
        ]
      );
      return;
    }

    await performToggleComplete({ archiveToStorage: false });
  };

  const completeGoalToTrophy = async () => {
    if (!auth.currentUser || !goal || isCompletingToTrophy) return;

    setIsCompletingToTrophy(true);
    try {
      const goalRef = isSharedGoalView
        ? doc(db, "sharedGardens", routeSharedGardenId, "layout", goal.id)
        : doc(db, "users", auth.currentUser.uid, "goals", goal.id);
      const isCurrentlyDone = isGoalDoneForDate(goal, selectedDateKey);
      const updatedLogs = JSON.parse(JSON.stringify(goal.logs || {}));

      if (goal.type === "completion") {
        if (!updatedLogs.completion) updatedLogs.completion = {};
        updatedLogs.completion[selectedDateKey] = { done: true };
      } else {
        if (!updatedLogs.quantity) updatedLogs.quantity = {};
        const targetValue = goal.measurable?.target || 1;
        updatedLogs.quantity[selectedDateKey] = { value: targetValue };
      }

      const { currentStreak, longestStreak } = calculateStreak(goal, updatedLogs);
      const updateData = {
        currentStreak,
        longestStreak,
        healthLevel: 3,
      };

      if (!isCurrentlyDone) {
        updateData.totalCompletions = increment(1);
      }

      if (goal.type === "completion") {
        updateData[`logs.completion.${selectedDateKey}.done`] = true;
      } else {
        const targetValue = goal.measurable?.target || 1;
        updateData[`logs.quantity.${selectedDateKey}.value`] = targetValue;
      }

      await updateDoc(goalRef, updateData);

      if (isSharedGoalView && goal?.ownerId && goal?.sourceGoalId) {
        try {
          await updateDoc(doc(db, "users", goal.ownerId, "goals", goal.sourceGoalId), updateData);
        } catch (syncError) {
          if (syncError?.code !== "permission-denied") {
            console.error("Error syncing shared goal progress:", syncError);
          }
        }
      }

      if (isSharedGoalView) {
        await updateOverallScoresForSharedGardenMembers(routeSharedGardenId);
      }

      const storageSlot = isSharedGoalView
        ? await findFirstOpenSharedStorageSlot(routeSharedGardenId, goal.id)
        : await findFirstOpenStorageSlot(auth.currentUser.uid, goal.id);
      if (storageSlot) {
        await setDoc(
          isSharedGoalView
            ? doc(db, "sharedGardens", routeSharedGardenId, "layout", goal.id)
            : doc(db, "users", auth.currentUser.uid, "gardenLayout", goal.id),
          { shelfPosition: storageSlot },
          { merge: true }
        );
      }

      Alert.alert("🏆 Goal Completed", "This goal is now in the trophy collection.");
    } catch (error) {
      console.error("Error completing goal to trophy:", error);
      Alert.alert("Error", "Could not complete goal.");
    } finally {
      setIsCompletingToTrophy(false);
    }
  };

  const isValidISODate = (value) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(year, month - 1, day);
    if (Number.isNaN(date.getTime())) return false;
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
  };

  const monthFromISOOrToday = (value) => {
    if (!isValidISODate(value || "")) return toStartOfDay(new Date());
    const [year, month] = value.split("-").map(Number);
    return new Date(year, month - 1, 1);
  };

  const returnGoalFromTrophy = async (nextCompletionCondition) => {
    if (!auth.currentUser || !goal || isCompletingToTrophy) return;

    setIsCompletingToTrophy(true);
    try {
      const layoutRef = isSharedGoalView
        ? doc(db, "sharedGardens", routeSharedGardenId, "layout", goal.id)
        : doc(db, "users", auth.currentUser.uid, "gardenLayout", goal.id);
      const goalRef = isSharedGoalView
        ? doc(db, "sharedGardens", routeSharedGardenId, "layout", goal.id)
        : doc(db, "users", auth.currentUser.uid, "goals", goal.id);

      await updateDoc(goalRef, {
        completionCondition: nextCompletionCondition,
      });

      if (isSharedGoalView && goal?.ownerId && goal?.sourceGoalId) {
        try {
          await updateDoc(doc(db, "users", goal.ownerId, "goals", goal.sourceGoalId), {
            completionCondition: nextCompletionCondition,
          });
        } catch (syncError) {
          if (syncError?.code !== "permission-denied") {
            console.error("Error syncing shared goal completion condition:", syncError);
          }
        }
      }

      await setDoc(layoutRef, { shelfPosition: null }, { merge: true });
      await updateDoc(layoutRef, { shelfPosition: deleteField() });
      setShowReturnDateModal(false);
      Alert.alert("Returned", "This trophy has been moved back to active goals.");
    } catch (error) {
      console.error("Error returning goal from trophy:", error);
      Alert.alert("Error", "Could not return this goal from trophy state.");
    } finally {
      setIsCompletingToTrophy(false);
    }
  };

  const confirmCompleteToTrophy = () => {
    Alert.alert(
      "Complete Goal",
      "Mark this goal as complete and move its plant into trophy storage?",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Complete", style: "default", onPress: completeGoalToTrophy },
      ]
    );
  };

  const confirmReturnFromTrophy = () => {
    Alert.alert(
      "Return Goal",
      "Set a new end date for this goal?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Set End Date",
          style: "default",
          onPress: () => {
            setReturnEndDateInput("");
            setReturnCalendarMonth(toStartOfDay(new Date()));
            setShowReturnDateModal(true);
          },
        },
        {
          text: "No End Date",
          style: "default",
          onPress: () => returnGoalFromTrophy({ type: "none" }),
        },
      ]
    );
  };

  const submitReturnWithEndDate = async () => {
    const trimmed = returnEndDateInput.trim();
    if (!isValidISODate(trimmed)) {
      Alert.alert("Invalid Date", "Enter a valid date in YYYY-MM-DD format.");
      return;
    }
    await returnGoalFromTrophy({ type: "date", endDate: trimmed });
  };

  const submitPostponedEndDate = async () => {
    if (!auth.currentUser || !goal || isCompletingToTrophy) return;

    const trimmed = postponeEndDateInput.trim();
    if (!isValidISODate(trimmed)) {
      Alert.alert("Invalid Date", "Enter a valid date in YYYY-MM-DD format.");
      return;
    }

    const currentEndDate = goal?.completionCondition?.endDate;
    if (currentEndDate && trimmed <= currentEndDate) {
      Alert.alert("Choose a Later Date", "Postponed end date must be later than the current end date.");
      return;
    }

    try {
      const goalRef = doc(db, "users", auth.currentUser.uid, "goals", goal.id);
      const existing = goal?.completionCondition || { type: "none" };
      const nextCompletionCondition = existing.type === "both"
        ? {
            type: "both",
            endDate: trimmed,
            targetAmount: existing.targetAmount,
            unit: existing.unit,
          }
        : { type: "date", endDate: trimmed };

      await updateDoc(goalRef, {
        completionCondition: nextCompletionCondition,
      });

      setShowPostponeDateModal(false);
      await performToggleComplete({ archiveToStorage: false });
    } catch (error) {
      console.error("Error postponing end date:", error);
      Alert.alert("Error", "Could not postpone the end date.");
    }
  };

  if (loading) return <Page><View style={styles.centerWrap}><ActivityIndicator size="large" color={theme.accent} /></View></Page>;
  if (!goal) return <Page><View style={styles.centerWrap}><Text style={styles.empty}>Goal not found</Text><Pressable onPress={handleBack}><Text style={styles.backLink}>Go Back</Text></Pressable></View></Page>;

  const isCompletion = goal.type === "completion";
  const isSharedMultiUserCompletion = isSharedGoalView && isCompletion && !!goal?.multiUserWateringEnabled;
  const currentWaterUsers = isSharedMultiUserCompletion
    ? Object.keys(goal?.logs?.completion?.[selectedDateKey]?.users || {}).filter((userId) => !!goal?.logs?.completion?.[selectedDateKey]?.users?.[userId]).length
    : 0;
  const currentUserId = auth.currentUser?.uid;
  const currentUserClicked = isSharedMultiUserCompletion
    ? !!(goal?.logs?.completion?.[selectedDateKey]?.users?.[currentUserId])
    : false;
  const requiredSharedContributors = isSharedMultiUserCompletion
    ? Math.max(2, Math.floor(Number(goal?.requiredContributors) || 2))
    : 1;
  const contributorProgressLabel = `${Math.min(currentWaterUsers, requiredSharedContributors)}/${requiredSharedContributors}`;
  const currentValue = isCompletion
    ? (isSharedMultiUserCompletion ? currentWaterUsers : (goal.logs?.completion?.[selectedDateKey]?.done ? 1 : 0))
    : (goal.logs?.quantity?.[selectedDateKey]?.value ?? 0);
  const targetValue = isCompletion ? (isSharedMultiUserCompletion ? requiredSharedContributors : 1) : (goal.measurable?.target ?? 0);
  const isDone = currentValue >= targetValue && targetValue > 0;
  const isTrophy = shelfPosition?.pageId === STORAGE_PAGE_ID;
  const displayHealthState = getPlantHealthState(goal, fromKey(selectedDateKey));
  const showReviveHeart = isDone && displayHealthState.healthLevel === 2;
  const selectedDateLabel = fromKey(selectedDateKey).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const progressUnitLabel = isSharedMultiUserCompletion ? "users" : (goal.measurable?.unit || "");

  return (
    <Page>
      <View style={styles.headerRow}>
        <Pressable onPress={handleBack} hitSlop={20} style={styles.headerBtn}>
          <Ionicons name="chevron-back" size={28} color={theme.accent} />
        </Pressable>
        <Text style={styles.headerTitle}>Goal Details</Text>
        <View style={styles.headerActions}>
          <Pressable onPress={openEditModal} hitSlop={20} style={styles.headerBtn}>
            <Ionicons name="create-outline" size={22} color={theme.accent} />
          </Pressable>
          <Pressable onPress={confirmDelete} hitSlop={20} style={styles.headerBtn}>
            <Ionicons name="trash-outline" size={22} color={theme.dangerText || "#ff4444"} />
          </Pressable>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={styles.heroCard}>
          <View style={styles.heroIconWrap}>
            <GoalIcon name={normalizeGoalIconName(goal.icon, "target")} size={42} color="#FFF" />
          </View>
          <Text style={styles.heroTitle}>{goal.name}</Text>
          <Text style={styles.heroSub}>{goal.frequencyLabel || formatScheduleLabel(goal.schedule)}</Text>
          <View style={styles.heroBadgeRow}>
            <View style={styles.heroBadge}><Text style={styles.heroBadgeText}>{goal.category || "Custom"}</Text></View>
            <View style={styles.heroBadge}><Text style={styles.heroBadgeText}>{healthLabel(goal.healthLevel)}</Text></View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Today</Text>
          <View style={styles.progressCard}>
            <View>
              <Text style={styles.progressDate}>{selectedDateLabel}</Text>
              <Text style={styles.progressValue}>{currentValue} / {targetValue} {progressUnitLabel}</Text>
              <Text style={styles.progressStatus}>{isTrophy ? "Frozen in trophy storage 🏆" : (isDone ? "Goal reached ✨" : "In progress")}</Text>
            </View>
            <Pressable disabled={isTrophy} onPress={handleToggleComplete} style={[styles.toggleButton, isDone && styles.toggleButtonDone, isTrophy && styles.toggleButtonDisabled]}>
              {showReviveHeart && <Ionicons name="heart" size={15} color="#FF6B8A" style={styles.toggleHeart} />}
              <View style={[
                styles.statusCircle,
                isSharedMultiUserCompletion && !isDone && currentUserClicked && styles.statusCircleSelf,
                isDone && styles.statusCircleDone,
                isTrophy && styles.statusCircleFrozen,
              ]}>
                {isSharedMultiUserCompletion ? (
                  <Text style={[styles.statusCircleCount, isDone && styles.statusCircleCountDone]}>{contributorProgressLabel}</Text>
                ) : isDone ? (
                  <Ionicons name="checkmark" size={20} color="#FFF" />
                ) : null}
              </View>
            </Pressable>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Stats</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statBox}><Text style={styles.statLabel}>Current streak</Text><Text style={styles.statValue}>{goal.currentStreak || 0}</Text></View>
            <View style={styles.statBox}><Text style={styles.statLabel}>Longest streak</Text><Text style={styles.statValue}>{goal.longestStreak || 0}</Text></View>
            <View style={styles.statBox}><Text style={styles.statLabel}>Total logs</Text><Text style={styles.statValue}>{goal.totalCompletions || 0}</Text></View>
            <View style={styles.statBox}><Text style={styles.statLabel}>Health</Text><Text style={styles.statValue}>{goal.healthLevel || 3}/3</Text></View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Goal info</Text>
          <View style={styles.infoCard}>
            <DetailRow label="Category" value={goal.category} />
            <DetailRow label="Garden" value={selectedGardenName} />
            {goal?.gardenType === "shared" && (
              <DetailRow label="Multi-user" value={goal?.multiUserWateringEnabled ? "Enabled" : "Disabled"} />
            )}
            {goal?.gardenType === "shared" && goal?.multiUserWateringEnabled && (
              <DetailRow label="Required users" value={String(Math.max(2, Math.floor(Number(goal?.requiredContributors) || 2)))} />
            )}
            <DetailRow label="Tracking" value={goal.type === "completion" ? "Checkmark" : `${goal.measurable?.target || 0} ${goal.measurable?.unit || "units"}`} />
            <DetailRow label="Schedule" value={goal.frequencyLabel || formatScheduleLabel(goal.schedule)} />
            <DetailRow label="Completion" value={formatCompletionLabel(goal.completionCondition)} />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Plan</Text>
          <View style={styles.infoCard}>
            <DetailRow label="When" value={goal.plan?.when} />
            <DetailRow label="Where" value={goal.plan?.where} />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Why</Text>
          <View style={styles.whyCard}>
            <Text style={styles.whyText}>{goal.why?.trim() || "No reason added yet."}</Text>
          </View>
        </View>

        <Pressable
          onPress={isTrophy ? confirmReturnFromTrophy : confirmCompleteToTrophy}
          disabled={isCompletingToTrophy}
          style={[styles.completeGoalButton, isCompletingToTrophy && styles.completeGoalButtonDisabled]}
        >
          <Ionicons name={isTrophy ? "arrow-undo" : "trophy"} size={18} color="#FFF" />
          <Text style={styles.completeGoalButtonText}>
            {isCompletingToTrophy ? (isTrophy ? "Returning..." : "Completing...") : (isTrophy ? "Return To Goal" : "Complete Goal")}
          </Text>
        </Pressable>
      </ScrollView>

      <Modal visible={showEditModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          {editView === "form" && (
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalKeyboard}>
            <View style={styles.modalSheet}>
              <View style={styles.modalHeader}>
                <Pressable onPress={() => { setShowIconModal(false); setShowEditModal(false); setEditView("form"); setIconSearch(""); }}><Text style={styles.modalAction}>Cancel</Text></Pressable>
                <Text style={styles.modalTitle}>Edit Goal</Text>
                <Pressable onPress={saveEdits} disabled={!!formError || isSaving}><Text style={[styles.modalAction, (!!formError || isSaving) && styles.modalActionDisabled]}>{isSaving ? "Saving" : "Save"}</Text></Pressable>
              </View>

              <ScrollView contentContainerStyle={styles.editContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} onScroll={() => Keyboard.dismiss()}>
                <View style={styles.editCard}>
                  <Text style={styles.editLabel}>Goal name</Text>
                  <TextInput value={name} onChangeText={setName} style={styles.input} placeholder="Goal name" placeholderTextColor={theme.muted2} />
                  <Text style={styles.editLabel}>Category</Text>
                  <View style={styles.chipWrap}>
                    {CATEGORIES.map((item) => (
                      <Chip key={item} label={item} active={category === item} onPress={() => setCategory(item)} />
                    ))}
                  </View>
                  <View style={styles.switchRow}>
                    <Text style={styles.switchLabel}>Private goal</Text>
                    <Switch value={isPrivate} onValueChange={setIsPrivate} trackColor={{ false: theme.outline, true: theme.accent }} />
                  </View>

                  <Text style={[styles.editLabel, styles.topGap]}>Garden</Text>
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
                    <View style={styles.switchRow}>
                      <Text style={styles.switchLabel}>Required contributors</Text>
                      <TextInput
                        value={requiredContributors}
                        onChangeText={setRequiredContributors}
                        keyboardType="number-pad"
                        style={[styles.input, styles.requiredInput]}
                        placeholder="2"
                        placeholderTextColor={theme.muted2}
                      />
                    </View>
                  )}
                </View>

                <View style={styles.editCard}>
                  <Text style={styles.editLabel}>Icon</Text>
                  <Pressable style={styles.iconPickerButton} onPress={openIconModal}>
                    <View style={styles.iconPickerButtonLeft}>
                      <View style={styles.iconPickerPreview}>
                        <GoalIcon name={selectedIcon} size={24} color={theme.accent} />
                      </View>
                      <View style={styles.iconPickerTextWrap}>
                        <Text style={styles.iconPickerTitle}>Choose icon</Text>
                        <Text style={styles.iconPickerSubtitle} numberOfLines={1}>{selectedIcon}</Text>
                      </View>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={theme.muted} />
                  </Pressable>
                </View>

                <View style={styles.editCard}>
                  <Text style={styles.editLabel}>Tracking</Text>
                  <Segmented left={{ label: "Checkmark", value: "completion" }} right={{ label: "Quantity", value: "quantity" }} value={type} onChange={setType} />
                  {type === "quantity" && (
                    <View style={styles.row}>
                      <TextInput value={target} onChangeText={setTarget} keyboardType="numeric" style={[styles.input, styles.rowInput]} placeholder="Target" placeholderTextColor={theme.muted2} />
                      <TextInput value={unit} onChangeText={setUnit} style={[styles.input, styles.rowInput]} placeholder="minutes" placeholderTextColor={theme.muted2} />
                    </View>
                  )}
                </View>

                <View style={styles.editCard}>
                  <Text style={styles.editLabel}>Schedule</Text>
                  <View style={styles.chipWrap}>
                    <Chip label="Every day" active={mode === "everyday"} onPress={() => setMode("everyday")} />
                    <Chip label="Weekdays" active={mode === "weekdays"} onPress={() => setMode("weekdays")} />
                    <Chip label="Custom" active={mode === "days"} onPress={() => setMode("days")} />
                  </View>
                  {mode === "days" && (
                    <View style={styles.daysGrid}>
                      {DAYS.map((item) => (
                        <Chip key={item.day} label={item.label} active={days.includes(item.day)} onPress={() => toggleDay(item.day)} />
                      ))}
                    </View>
                  )}
                </View>

                <View style={styles.editCard}>
                  <Text style={styles.editLabel}>Completion</Text>
                  <View style={styles.chipWrap}>
                    <Chip label="No end" active={completionMode === "none"} onPress={() => setCompletionMode("none")} />
                    <Chip label="End date" active={completionMode === "date"} onPress={() => setCompletionMode("date")} />
                    <Chip label="End amount" active={completionMode === "amount"} onPress={() => setCompletionMode("amount")} />
                    <Chip label="Both" active={completionMode === "both"} onPress={() => setCompletionMode("both")} />
                  </View>
                  {(completionMode === "date" || completionMode === "both") && (
                    <View style={styles.topGap}>
                      <SwipeCalendar
                        month={editCalendarMonth}
                        setMonth={setEditCalendarMonth}
                        selectedDate={completionEndDate}
                        onSelectDate={setCompletionEndDate}
                      />
                    </View>
                  )}
                  {(completionMode === "amount" || completionMode === "both") && (
                    <View style={styles.row}>
                      <TextInput value={completionEndAmount} onChangeText={setCompletionEndAmount} keyboardType="numeric" style={[styles.input, styles.rowInput]} placeholder="Total amount" placeholderTextColor={theme.muted2} />
                      <TextInput value={completionEndUnit} onChangeText={setCompletionEndUnit} style={[styles.input, styles.rowInput]} placeholder="times" placeholderTextColor={theme.muted2} />
                    </View>
                  )}
                </View>

                <View style={styles.editCard}>
                  <Text style={styles.editLabel}>Plan</Text>
                  <TextInput value={whenStr} onChangeText={setWhenStr} style={styles.input} placeholder="When" placeholderTextColor={theme.muted2} />
                  <TextInput value={whereStr} onChangeText={setWhereStr} style={[styles.input, styles.topGap]} placeholder="Where" placeholderTextColor={theme.muted2} />
                </View>

                <View style={styles.editCard}>
                  <Text style={styles.editLabel}>Why</Text>
                  <TextInput value={whyStr} onChangeText={setWhyStr} style={[styles.input, styles.textArea]} placeholder="Why does this matter?" placeholderTextColor={theme.muted2} multiline />
                </View>

                {!!formError && <View style={styles.errorInline}><Text style={styles.errorInlineText}>{formError}</Text></View>}
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
          )}
        </View>
      </Modal>

      <Modal
        visible={showIconModal}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={closeIconModal}
      >
        <View style={styles.iconModalScreen}>
          <View style={styles.iconModalHeader}>
            <Pressable onPress={closeIconModal} style={styles.iconModalHeaderBtn}>
              <Ionicons name="arrow-back" size={22} color={theme.text} />
            </Pressable>
            <View style={styles.iconModalHeaderCenter}>
              <Text style={styles.iconModalTitle}>Choose an icon</Text>
              <Text style={styles.iconModalSubTitle}>{filteredIcons.length} icons</Text>
            </View>
            <Pressable onPress={closeIconModal} style={styles.iconModalDoneBtn}>
              <Text style={styles.iconModalDoneText}>Done</Text>
            </Pressable>
          </View>
          <View style={styles.iconModalSearchWrap}>
            <View style={styles.iconModalSearchBar}>
              <Ionicons name="search" size={18} color={theme.muted} />
              <TextInput
                value={iconSearch}
                onChangeText={setIconSearch}
                placeholder="Search icons..."
                placeholderTextColor={theme.muted2}
                style={styles.iconModalSearchInput}
                autoCapitalize="none"
              />
              {!!iconSearch && (
                <Pressable onPress={() => setIconSearch("")} hitSlop={8}>
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
                  onSelect={(icon) => {
                    setSelectedIcon(icon);
                  }}
                />
              ))}
            </View>
          </ScrollView>
        </View>
      </Modal>

      <Modal visible={showReturnDateModal} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.returnDateModalCard}>
            <Text style={styles.returnDateTitle}>New End Date</Text>
            <Text style={styles.returnDateHint}>Pick a date from the calendar</Text>
            <SwipeCalendar
              month={returnCalendarMonth}
              setMonth={setReturnCalendarMonth}
              selectedDate={returnEndDateInput}
              onSelectDate={setReturnEndDateInput}
            />
            <View style={styles.returnDateActions}>
              <Pressable onPress={() => setShowReturnDateModal(false)} style={styles.returnDateBtnSecondary}>
                <Text style={styles.returnDateBtnSecondaryText}>Cancel</Text>
              </Pressable>
              <Pressable onPress={submitReturnWithEndDate} style={styles.returnDateBtnPrimary}>
                <Text style={styles.returnDateBtnPrimaryText}>{isCompletingToTrophy ? "Returning..." : "Return"}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showPostponeDateModal} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.returnDateModalCard}>
            <Text style={styles.returnDateTitle}>Postpone End Date</Text>
            <Text style={styles.returnDateHint}>Pick a later date from the calendar</Text>
            <SwipeCalendar
              month={postponeCalendarMonth}
              setMonth={setPostponeCalendarMonth}
              selectedDate={postponeEndDateInput}
              onSelectDate={setPostponeEndDateInput}
            />
            <View style={styles.returnDateActions}>
              <Pressable onPress={() => setShowPostponeDateModal(false)} style={styles.returnDateBtnSecondary}>
                <Text style={styles.returnDateBtnSecondaryText}>Cancel</Text>
              </Pressable>
              <Pressable onPress={submitPostponedEndDate} style={styles.returnDateBtnPrimary}>
                <Text style={styles.returnDateBtnPrimaryText}>Save & Check Off</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>


    </Page>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
  headerBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 18, fontWeight: "900", color: theme.title },
  headerActions: { flexDirection: "row", alignItems: "center" },
  centerWrap: { flex: 1, justifyContent: "center", alignItems: "center" },
  empty: { fontSize: 18, fontWeight: "900", color: theme.title },
  backLink: { marginTop: 12, color: theme.accent, fontWeight: "800" },
  scrollContent: { paddingBottom: 40 },
  heroCard: { backgroundColor: theme.surface, borderRadius: theme.radius, padding: 24, alignItems: "center", marginBottom: 18 },
  heroIconWrap: { width: 84, height: 84, borderRadius: 42, backgroundColor: "rgba(255,255,255,0.16)", alignItems: "center", justifyContent: "center", marginBottom: 14 },
  heroTitle: { fontSize: 24, fontWeight: "900", color: theme.title2 },
  heroSub: { fontSize: 14, fontWeight: "700", color: theme.muted, marginTop: 4 },
  heroBadgeRow: { flexDirection: "row", gap: 8, marginTop: 14 },
  heroBadge: { backgroundColor: "rgba(255,255,255,0.14)", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  heroBadgeText: { color: theme.title2, fontSize: 12, fontWeight: "800" },
  section: { marginBottom: 18 },
  sectionTitle: { fontSize: 12, fontWeight: "900", color: theme.text2, marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 },
  progressCard: { backgroundColor: theme.surface2, borderRadius: theme.radius, padding: 18, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  progressDate: { fontSize: 12, fontWeight: "800", color: theme.text2, marginBottom: 6 },
  progressValue: { fontSize: 22, fontWeight: "900", color: theme.title },
  progressStatus: { fontSize: 14, fontWeight: "700", color: theme.text2, marginTop: 4 },
  statusCircle: { width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: theme.accent, alignItems: "center", justifyContent: "center", overflow: "hidden", position: "relative" },
  statusCircleDone: { backgroundColor: theme.accent },
  statusCircleSelf: { backgroundColor: "rgba(167, 152, 125, 0.52)" },
  statusCircleCount: { fontSize: 10, fontWeight: "900", color: "#FFF" },
  statusCircleCountDone: { color: theme.bg },
  toggleButton: { alignItems: "center", gap: 8 },
  toggleButtonDisabled: { opacity: 0.45 },
  toggleHeart: { marginBottom: -2 },
  toggleButtonDone: { opacity: 0.95 },
  toggleButtonText: { fontSize: 12, fontWeight: "900", color: theme.accent },
  toggleButtonTextDone: { color: theme.title },
  statusCircleFrozen: { borderColor: theme.muted, backgroundColor: "rgba(255,255,255,0.08)" },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  statBox: { width: "48%", backgroundColor: theme.surface2, borderRadius: theme.radius, padding: 16 },
  statLabel: { fontSize: 12, fontWeight: "700", color: theme.text2, marginBottom: 6 },
  statValue: { fontSize: 18, fontWeight: "900", color: theme.title },
  infoCard: { backgroundColor: theme.surface2, borderRadius: theme.radius, paddingHorizontal: 16 },
  detailRow: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: theme.outline },
  detailLabel: { fontSize: 12, fontWeight: "800", color: theme.text2, marginBottom: 4 },
  detailValue: { fontSize: 15, fontWeight: "800", color: theme.title },
  whyCard: { backgroundColor: theme.surface2, borderRadius: theme.radius, padding: 16 },
  whyText: { fontSize: 15, lineHeight: 22, color: theme.title, fontWeight: "700" },
  completeGoalButton: {
    marginTop: 8,
    marginBottom: 8,
    height: 52,
    borderRadius: theme.radius,
    backgroundColor: theme.accent,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  completeGoalButtonDisabled: { opacity: 0.6 },
  completeGoalButtonText: { color: "#FFF", fontSize: 15, fontWeight: "900" },
  returnDateModalCard: {
    backgroundColor: theme.bg,
    borderRadius: theme.radius,
    padding: 16,
    marginHorizontal: 18,
    marginBottom: 40,
  },
  returnDateTitle: { fontSize: 18, fontWeight: "900", color: theme.title, marginBottom: 6 },
  returnDateHint: { fontSize: 13, fontWeight: "700", color: theme.text2, marginBottom: 12 },
  helperText: { fontSize: 12, color: theme.muted, marginBottom: 8 },
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
  calendarGridFull: { flexDirection: "row", flexWrap: "wrap" },
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
  calendarCardCompact: {
    borderWidth: 1,
    borderColor: theme.outline,
    borderRadius: theme.radius,
    padding: 10,
    backgroundColor: theme.surface2,
  },
  calendarHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  calendarNavBtn: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: theme.bg },
  calendarMonthText: { fontSize: 14, fontWeight: "800", color: theme.title },
  calendarWeekdayRow: { flexDirection: "row", marginBottom: 6 },
  calendarWeekdayText: { flex: 1, textAlign: "center", fontSize: 11, fontWeight: "800", color: theme.text2 },
  calendarGrid: { flexDirection: "row", flexWrap: "wrap" },
  calendarDayCell: { width: "14.2857%", aspectRatio: 1, alignItems: "center", justifyContent: "center", borderRadius: 8 },
  calendarDayCellEmpty: { opacity: 0 },
  calendarDayCellSelected: { backgroundColor: theme.accent },
  calendarDayText: { fontSize: 12, fontWeight: "800", color: theme.title },
  calendarDayTextEmpty: { color: "transparent" },
  calendarDayTextSelected: { color: "#FFF" },
  returnDateActions: { flexDirection: "row", justifyContent: "flex-end", marginTop: 12, gap: 10 },
  returnDateBtnSecondary: {
    height: 40,
    paddingHorizontal: 14,
    borderRadius: theme.radiusSm,
    borderWidth: 1,
    borderColor: theme.outline,
    justifyContent: "center",
  },
  returnDateBtnSecondaryText: { fontSize: 13, fontWeight: "800", color: theme.title },
  returnDateBtnPrimary: {
    height: 40,
    paddingHorizontal: 14,
    borderRadius: theme.radiusSm,
    backgroundColor: theme.accent,
    justifyContent: "center",
  },
  returnDateBtnPrimaryText: { fontSize: 13, fontWeight: "900", color: "#FFF" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  modalKeyboard: { maxHeight: "94%" },
  modalSheet: { backgroundColor: theme.bg, borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 18, minHeight: "75%" },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  modalTitle: { fontSize: 18, fontWeight: "900", color: theme.title },
  modalAction: { color: theme.accent, fontWeight: "900", fontSize: 15 },
  modalActionDisabled: { opacity: 0.45 },
  editContent: { paddingBottom: 30 },
  editCard: { backgroundColor: theme.surface2, borderRadius: theme.radius, padding: 16, marginBottom: 12 },
  editLabel: { fontSize: 13, fontWeight: "900", color: theme.title, marginBottom: 8 },
  switchRow: { marginTop: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  switchLabel: { fontSize: 13, fontWeight: "700", color: theme.title },
  input: { backgroundColor: theme.bg, borderRadius: theme.radius, paddingHorizontal: 14, height: 46, fontSize: 14, color: theme.title, borderWidth: 1, borderColor: theme.outline },
  topGap: { marginTop: 10 },
  row: { flexDirection: "row", gap: 10, marginTop: 10 },
  rowInput: { flex: 1 },
  requiredInput: { width: 84, textAlign: "center", paddingHorizontal: 8 },
  textArea: { height: 100, paddingTop: 12, textAlignVertical: "top" },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  chip: { minHeight: 34, paddingHorizontal: 12, borderRadius: theme.radiusSm, backgroundColor: theme.bg, borderWidth: 1, borderColor: theme.outline, justifyContent: "center" },
  chipActive: { backgroundColor: theme.accent, borderColor: theme.accent },
  chipText: { fontSize: 12, fontWeight: "800", color: theme.title },
  chipTextActive: { color: "#FFF" },
  segmentWrap: { flexDirection: "row", backgroundColor: theme.bg, borderRadius: theme.radius, padding: 4, borderWidth: 1, borderColor: theme.outline },
  segment: { flex: 1, height: 40, borderRadius: theme.radiusSm, alignItems: "center", justifyContent: "center" },
  segmentActive: { backgroundColor: theme.accent },
  segmentText: { fontSize: 12, fontWeight: "800", color: theme.title },
  segmentTextActive: { color: "#FFF" },
  daysGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  iconPickerButton: { height: 60, borderRadius: theme.radius, backgroundColor: theme.bg, borderWidth: 1, borderColor: theme.outline, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14 },
  iconPickerButtonLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
  iconPickerPreview: { width: 40, height: 40, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center" },
  iconPickerTextWrap: { flex: 1 },
  iconPickerTitle: { fontSize: 14, fontWeight: "800", color: theme.text },
  iconPickerSubtitle: { fontSize: 12, fontWeight: "600", color: theme.muted, marginTop: 2 },
  iconGridWrap: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  iconGrid: { paddingBottom: 20 },
  iconBox: { width: "23.5%", height: 84, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#111111", marginBottom: 10, paddingTop: 10, paddingHorizontal: 6 },
  iconBoxActive: { backgroundColor: "#111111", borderColor: "#111111", elevation: 4 },
  iconSelectedBadge: { position: "absolute", right: 6, top: 6, width: 18, height: 18, borderRadius: 9, backgroundColor: "#111111", alignItems: "center", justifyContent: "center" },
  iconModalScreen: { ...StyleSheet.absoluteFillObject, backgroundColor: theme.bg, zIndex: 20 },
  iconModalHeader: { paddingTop: Platform.OS === "ios" ? 58 : 28, paddingHorizontal: 16, paddingBottom: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: theme.outline },
  iconModalHeaderBtn: { minWidth: 40, height: 36, alignItems: "center", justifyContent: "center" },
  iconModalHeaderCenter: { flex: 1, alignItems: "center" },
  iconModalTitle: { fontSize: 18, fontWeight: "900", color: theme.text },
  iconModalSubTitle: { marginTop: 2, fontSize: 12, fontWeight: "600", color: theme.muted },
  iconModalDoneBtn: { minWidth: 56, height: 34, borderRadius: 17, backgroundColor: "#111111", alignItems: "center", justifyContent: "center" },
  iconModalDoneText: { color: "#FFFFFF", fontSize: 13, fontWeight: "800" },
  iconModalSearchWrap: { paddingHorizontal: 16, paddingTop: 14 },
  iconModalSearchBar: { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#111111", flexDirection: "row", alignItems: "center", borderRadius: 12, paddingHorizontal: 12, height: 45, marginBottom: 8 },
  iconModalSearchInput: { flex: 1, marginLeft: 8, fontSize: 14, color: theme.text },
  iconSelectedRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  iconSelectedRowLabel: { fontSize: 12, fontWeight: "700", color: theme.muted },
  iconSelectedPill: { flexDirection: "row", alignItems: "center", backgroundColor: "#111111", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, gap: 6 },
  iconSelectedPillText: { color: "#FFFFFF", fontSize: 11, fontWeight: "700" },
  iconModalList: { flex: 1, paddingHorizontal: 12, paddingTop: 4 },
  errorInline: { backgroundColor: theme.dangerBg, borderRadius: theme.radius, padding: 12 },
  errorInlineText: { color: theme.dangerText, fontSize: 12, fontWeight: "800" },
});