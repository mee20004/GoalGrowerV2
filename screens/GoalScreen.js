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
  Image,
  Animated,
  Easing,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import Ionicons from "@expo/vector-icons/Ionicons";
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import * as solidIcons from '@fortawesome/free-solid-svg-icons';
import Page from "../components/Page";
import EditButtonRestriction from "./EditButtonRestriction";
import { theme } from "../theme";
import { PLANT_ASSETS } from "../constants/PlantAssets";
import { POT_ASSETS } from "../constants/PotAssets";
import { WALLPAPER_OPTIONS } from "../constants/WallpaperAssets";
import { useGoals, fromKey, toKey } from "../components/GoalsStore";
import { subscribePersonalCustomizations, subscribeSharedCustomizations } from "../utils/customizationFirestore";
import { ACHIEVEMENTS } from "../AchievementsStore";
import { collection, doc, onSnapshot, deleteDoc, updateDoc, getDoc, getDocs, setDoc, arrayUnion, increment, deleteField, query, where, runTransaction } from "firebase/firestore";
import { toggleGoalTransaction } from "../utils/goalToggleTransaction";
import { auth, db } from "../firebaseConfig";
import { updateOverallScoresForSharedGardenMembers } from "../utils/scoreUtils";
import {
  getNotificationSettings,
  getGoalNotificationSettings,
  saveGoalNotificationSettings,
} from "../utils/notifications";
import {
  calculateGoalStreak,
  countCompletedDates,
  getGrowthStage,
  getPlantHealthState,
  isGoalDoneForDate,
  isGoalScheduledOnDate,
  migrateLogsForTrackingType,
  updateTrophyFreezeState,
  dateFromFirestoreValue,
} from "../utils/goalState";
import { getBadgeImageForTrophyKey } from "./badgeImages";

// Consistent frozen day blue color for streak and health bar
const FROZEN_DAY_BLUE = '#a6e6ff';


// --- FONT AWESOME ICONS ---

// --- FONT AWESOME ICON PICKER LOGIC (from AddGoalScreen) ---
const FONT_AWESOME_ICONS = Object.entries(solidIcons)
  .filter(([key, value]) => key.startsWith('fa') && value.iconName)
  .reduce((acc, [key, value]) => {
    acc[value.iconName] = value;
    return acc;
  }, {});
const pickerIconNames = Object.keys(FONT_AWESOME_ICONS);
const dedupeIcons = (icons) => [...new Set(icons)];
const FEATURED_ICONS = pickerIconNames.slice(0, 10);

function GoalIcon({ name, size, color }) {
  const iconDef = FONT_AWESOME_ICONS[name] || FONT_AWESOME_ICONS['star'];
  return <FontAwesomeIcon icon={iconDef} size={size} color={color} />;
}

const FIRE_STREAK_ICON = require("../assets/Icons/icons8-fire-64.png");
const DEFAULT_PLANT_PREVIEW_COLOR = "#EEF6FF";

const TROPHY_ROADMAP = [
  { key: "bronze", label: "Bronze", streak: 0, health: 1, color: "#c98b4b", tint: "#f7e7da" },
  { key: "silver", label: "Silver", streak: 7, health: 3, color: "#7d98c7", tint: "#eaf1ff" },
  { key: "gold", label: "Gold", streak: 18, health: 4, color: "#dca32e", tint: "#fff5da" },
  { key: "platinum", label: "Platinum", streak: 24, health: 5, color: "#54bceb", tint: "#e7f7ff" },
];

const TROPHY_PROGRESS_STYLE = {
  bronze: { track: "#f2ddca", gradient: ["#e09e5f", "#c98b4b"] },
  silver: { track: "#deebff", gradient: ["#9bb8ef", "#7d98c7"] },
  gold: { track: "#ffefc9", gradient: ["#f5be4f", "#dca32e"] },
  platinum: { track: "#def4ff", gradient: ["#78d4ff", "#54bceb"] },
};

const getPreviewTrophyRating = (longestStreak = 0, healthLevel = 1) => {
  const streak = Number(longestStreak) || 0;
  const health = Number(healthLevel) || 1;

  if (streak >= 24 && health >= 5) return "platinum";
  if (streak >= 18 && health >= 4) return "gold";
  if (streak >= 7 && health >= 3) return "silver";
  return "bronze";
};

function GoalPlantPreview({ goal, getPlantHealthState, backdropColor = DEFAULT_PLANT_PREVIEW_COLOR, variant = "card" }) {
  const stage = getGrowthStage(goal?.totalCompletions);

  const { status } = getPlantHealthState(goal);
  const species = goal?.plantSpecies || ((goal?.type !== "completion" && goal?.type !== "quantity") ? goal?.type : "fern");
  const speciesAssets = PLANT_ASSETS[species] || PLANT_ASSETS.fern;
  const plantSource =
    speciesAssets?.[stage]?.[status]
    || speciesAssets?.[stage]?.alive
    || PLANT_ASSETS.fern?.stage1?.alive;
  const selectedPotKey = goal?.potType || goal?.potStyle || "default";
  const potSource = POT_ASSETS[selectedPotKey] || POT_ASSETS.default;

  const [displayedPlantSource, setDisplayedPlantSource] = useState(plantSource);
  const swapScaleAnim = useRef(new Animated.Value(1)).current;
  const swayAnim = useRef(new Animated.Value(0)).current;
  const previousSourceRef = useRef(plantSource);
  const isHero = variant === "hero";

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(swayAnim, { toValue: 1, duration: 600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(swayAnim, { toValue: -1, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(swayAnim, { toValue: 0, duration: 1200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    const timer = setTimeout(() => loop.start(), Math.random() * 1500);
    return () => {
      clearTimeout(timer);
      loop.stop();
      swayAnim.setValue(0);
    };
  }, [swayAnim]);

  useEffect(() => {
    if (previousSourceRef.current === plantSource) return;

    let cancelled = false;
    previousSourceRef.current = plantSource;
    swapScaleAnim.stopAnimation();

    Animated.timing(swapScaleAnim, {
      toValue: 0.2,
      duration: 170,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished || cancelled) return;

      setDisplayedPlantSource(plantSource);

      Animated.sequence([
        Animated.timing(swapScaleAnim, {
          toValue: 1.3,
          duration: 55,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(swapScaleAnim, {
          toValue: 1,
          duration: 75,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start();
    });

    return () => {
      cancelled = true;
    };
  }, [plantSource, swapScaleAnim]);

  return (
    <View
      style={[
        styles.goalPlantPreviewWrap,
        isHero && styles.goalPlantPreviewWrapHero,
        { backgroundColor: backdropColor },
      ]}
    >
      <Animated.Image
        source={displayedPlantSource}
        style={[
          styles.goalPlantImage,
          isHero && styles.goalPlantImageHero,
          {
            transform: [
              { translateY: isHero ? 22 : 18 },
              { rotate: swayAnim.interpolate({ inputRange: [-1, 1], outputRange: ["-4deg", "6deg"] }) },
              { scale: swapScaleAnim },
              { translateY: isHero ? -22 : -18 },
            ],
          },
        ]}
        resizeMode="contain"
      />
      <Image source={potSource} style={[styles.goalPlantPot, isHero && styles.goalPlantPotHero]} resizeMode="contain" />
    </View>
  );
}

function AnimatedTodayHealthBar({ healthLevel, color }) {
  const clampedLevel = Math.max(1, Math.min(5, Number(healthLevel) || 1));
  const targetRatio = clampedLevel / 5;
  const progress = useRef(new Animated.Value(targetRatio)).current;
  const [trackWidth, setTrackWidth] = useState(0);

  useEffect(() => {
    Animated.timing(progress, {
      toValue: targetRatio,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [progress, targetRatio]);

  const animatedWidth = trackWidth > 0
    ? progress.interpolate({ inputRange: [0, 1], outputRange: [0, trackWidth] })
    : 0;

  return (
    <View style={styles.todayHealthTrack} onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)}>
      <Animated.View
        style={[
          styles.todayHealthFill,
          {
            width: animatedWidth,
            backgroundColor: color,
          },
        ]}
      />
    </View>
  );
}

function AnimatedWeeklyHealthBar({ healthLevel, color }) {
  const clampedLevel = Math.max(1, Math.min(5, Number(healthLevel) || 1));
  const targetRatio = clampedLevel / 5;
  const progress = useRef(new Animated.Value(targetRatio)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: targetRatio,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [progress, targetRatio]);

  const animatedHeight = progress.interpolate({ inputRange: [0, 1], outputRange: [0, 56] });

  return (
    <View style={styles.growthMiniTrack}>
      <Animated.View
        style={[
          styles.growthMiniFill,
          {
            height: animatedHeight,
            backgroundColor: color,
          },
        ]}
      />
    </View>
  );
}

function AnimatedGrowthStageBar({ progressPercent, color = "#59d700", showGoldStripes = false }) {
  const clampedPercent = Math.max(0, Math.min(100, Number(progressPercent) || 0));
  const targetRatio = clampedPercent / 100;
  const progress = useRef(new Animated.Value(targetRatio)).current;
  const [trackWidth, setTrackWidth] = useState(0);

  useEffect(() => {
    Animated.timing(progress, {
      toValue: targetRatio,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [progress, targetRatio]);

  const animatedWidth = trackWidth > 0
    ? progress.interpolate({ inputRange: [0, 1], outputRange: [0, trackWidth] })
    : 0;

  return (
    <View style={styles.growthStageTrack} onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)}>
      <Animated.View
        style={[
          styles.growthStageFill,
          {
            width: animatedWidth,
            backgroundColor: color,
          },
        ]}
      >
        {showGoldStripes && (
          <View pointerEvents="none" style={styles.growthStageStripeLayer}>
            {Array.from({ length: 12 }).map((_, index) => (
              <View key={`growth-stripe-${index}`} style={[styles.growthStageStripe, { left: index * 14 - 20 }]} />
            ))}
          </View>
        )}
      </Animated.View>
    </View>
  );
}

function AnimatedRewardProgressBar({ progressPercent, trackColor, gradientColors }) {
  const clampedPercent = Math.max(0, Math.min(100, Number(progressPercent) || 0));
  const targetRatio = Math.max(0.1, clampedPercent / 100);
  const progress = useRef(new Animated.Value(targetRatio)).current;
  const [trackWidth, setTrackWidth] = useState(0);

  useEffect(() => {
    Animated.timing(progress, {
      toValue: targetRatio,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [progress, targetRatio]);

  const animatedWidth = trackWidth > 0
    ? progress.interpolate({ inputRange: [0, 1], outputRange: [0, trackWidth] })
    : 0;

  return (
    <View style={[styles.nextLevelTrack, { backgroundColor: trackColor }]} onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)}>
      <Animated.View
        style={[
          styles.nextLevelFillWrap,
          {
            width: animatedWidth,
          },
        ]}
      >
        <LinearGradient
          colors={gradientColors}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={styles.nextLevelFill}
        />
      </Animated.View>
    </View>
  );
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

const MAX_QUANTITY_TARGET = 6;

const normalizeQuantityTargetInput = (value) => {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  return String(clampNum(Number(digits), 1, MAX_QUANTITY_TARGET));
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
  if ((Number(level) || 0) >= 5) return "Healthy";
  if ((Number(level) || 0) === 4) return "Day";
  if ((Number(level) || 0) === 3) return "Dry";
  if ((Number(level) || 0) === 2) return "Dying";
  return "Dead";
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
  <Pressable
    onPress={() => {
      Haptics.selectionAsync?.().catch(() => {});
      onSelect(iconName);
    }}
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
                    onPress={() => day && !isPast && onSelectDate(iso)}
                    disabled={!day || isPast}
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
  // --- ICON PICKER STATE (ported from AddGoalScreen) ---
  const [iconSearch, setIconSearch] = useState("");
  const [visibleIconCount, setVisibleIconCount] = useState(120);
  // Filtered Icons Logic
  const allSelectableIcons = useMemo(() => {
    const uniqueFeatured = FEATURED_ICONS.filter((icon) => !pickerIconNames.includes(icon));
    return dedupeIcons([...uniqueFeatured, ...pickerIconNames]);
  }, []);
  const filteredIcons = useMemo(() => {
    const cleanSearch = (iconSearch || "").toLowerCase().trim();
    if (!cleanSearch) {
      return allSelectableIcons.slice(0, visibleIconCount);
    }
    const directMatches = pickerIconNames.filter((name) => name.includes(cleanSearch));
    return dedupeIcons(directMatches).slice(0, 180);
  }, [allSelectableIcons, iconSearch, visibleIconCount]);
  const hasMoreIcons = !(iconSearch || "").trim() && filteredIcons.length < allSelectableIcons.length;
  const MODAL_SWAP_DELAY = 180;
  const { goalId, source, sharedGardenId: routeSharedGardenId, ownerId: paramOwnerId, sourceGoalId: paramSourceGoalId } = route.params || {};
  const isSharedGoalView = Boolean(routeSharedGardenId);
  const { selectedDateKey } = useGoals();

  const [goal, setGoal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showIconModal, setShowIconModal] = useState(false);
  const [editView, setEditView] = useState("form"); // "form" | "icons"
  const [isSaving, setIsSaving] = useState(false);
  const [isCompletingToTrophy, setIsCompletingToTrophy] = useState(false);
  const [isTapCoolingDown, setIsTapCoolingDown] = useState(false);
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
  const [personalCustomizations, setPersonalCustomizations] = useState({});
  const [sharedCustomizationsByGarden, setSharedCustomizationsByGarden] = useState({});
  const [optimisticProgress, setOptimisticProgress] = useState(null);
  const optimisticProgressRef = useRef(null);
  const optimisticResetTimerRef = useRef(null);
  const tapCooldownRef = useRef(false);
  const tapCooldownTimerRef = useRef(null);

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
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [goalNotificationEnabled, setGoalNotificationEnabled] = useState(false);
  const [originalGoalNotificationEnabled, setOriginalGoalNotificationEnabled] = useState(false);
  const [goalNotificationTime, setGoalNotificationTime] = useState(9);
  const [goalNotificationTimeMinute, setGoalNotificationTimeMinute] = useState(0);
  const [showGoalTimeModal, setShowGoalTimeModal] = useState(false);
  const [hasUnsavedNotificationChanges, setHasUnsavedNotificationChanges] = useState(false);
  const uid = auth.currentUser?.uid;

  const setLocalOptimisticProgress = (nextStateOrUpdater) => {
    if (optimisticResetTimerRef.current) {
      clearTimeout(optimisticResetTimerRef.current);
    }
    setOptimisticProgress((prev) => {
      const next = typeof nextStateOrUpdater === "function" ? nextStateOrUpdater(prev) : nextStateOrUpdater;
      optimisticProgressRef.current = next;
      return next;
    });
    optimisticResetTimerRef.current = setTimeout(() => {
      optimisticProgressRef.current = null;
      setOptimisticProgress(null);
      optimisticResetTimerRef.current = null;
    }, 1800);
  };

  const clearLocalOptimisticProgress = () => {
    if (optimisticResetTimerRef.current) {
      clearTimeout(optimisticResetTimerRef.current);
      optimisticResetTimerRef.current = null;
    }
    optimisticProgressRef.current = null;
    setOptimisticProgress(null);
  };

  const startTapCooldown = (duration = 210) => {
    if (tapCooldownTimerRef.current) {
      clearTimeout(tapCooldownTimerRef.current);
      tapCooldownTimerRef.current = null;
    }
    tapCooldownRef.current = true;
    setIsTapCoolingDown(true);
    tapCooldownTimerRef.current = setTimeout(() => {
      tapCooldownRef.current = false;
      setIsTapCoolingDown(false);
      tapCooldownTimerRef.current = null;
    }, duration);
  };

  useEffect(() => {
    return () => {
      if (optimisticResetTimerRef.current) {
        clearTimeout(optimisticResetTimerRef.current);
      }
      if (tapCooldownTimerRef.current) {
        clearTimeout(tapCooldownTimerRef.current);
      }
      optimisticProgressRef.current = null;
      tapCooldownRef.current = false;
      setIsTapCoolingDown(false);
    };
  }, []);

  // Load notification settings when edit modal opens
  useEffect(() => {
    if (!showEditModal) return;

    const loadNotificationSettings = async () => {
      try {
        // Check if notifications are globally enabled
        const settings = await getNotificationSettings();
        setNotificationsEnabled(settings.notificationsEnabled);

        // Load goal-specific notification settings
        if (goal?.id) {
          const goalSettings = await getGoalNotificationSettings(goal.id);
          setGoalNotificationEnabled(goalSettings.enabled);
          setOriginalGoalNotificationEnabled(goalSettings.enabled);
          setGoalNotificationTime(goalSettings.time || 9);
          setGoalNotificationTimeMinute(goalSettings.timeMinute || 0);
          setHasUnsavedNotificationChanges(false);
        }
      } catch (error) {
        console.error('Error loading notification settings:', error);
      }
    };

    loadNotificationSettings();
  }, [showEditModal, goal?.id]);

  // Track unsaved notification changes
  useEffect(() => {
    if (!showEditModal) return;

    const hasChanges =
      goalNotificationEnabled !== originalGoalNotificationEnabled ||
      (goalNotificationEnabled &&
        (goalNotificationTime !== (goal?.notificationTime || 9) ||
          goalNotificationTimeMinute !== (goal?.notificationTimeMinute || 0)));

    setHasUnsavedNotificationChanges(hasChanges);
  }, [goalNotificationEnabled, goalNotificationTime, goalNotificationTimeMinute, originalGoalNotificationEnabled, showEditModal, goal]);

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
              // Fallback to navigation params if missing
              ownerId: docSnap.data().ownerId || paramOwnerId || null,
              sourceGoalId: docSnap.data().sourceGoalId || paramSourceGoalId || null,
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
      async (snap) => {
        let docs = snap.docs.map((gardenDoc) => ({ id: gardenDoc.id, ...gardenDoc.data() }));
        // Filter out gardens where restrictEditPlants is true and user is not owner
        docs = await Promise.all(docs.map(async (g) => {
          if (!g.id) return null;
          const snap = await getDoc(doc(db, "sharedGardens", g.id));
          const data = snap.data() || {};
          const isOwner = data.ownerId && auth.currentUser && data.ownerId === auth.currentUser.uid;
          if (!isOwner && data.restrictEditPlants) return null;
          return { ...g, ...data };
        }));
        docs = docs.filter(Boolean);
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
    if (!uid) return undefined;
    const unsubscribe = subscribePersonalCustomizations(uid, setPersonalCustomizations);
    return () => unsubscribe && unsubscribe();
  }, [uid]);

  useEffect(() => {
    if (!routeSharedGardenId) return undefined;
    const unsubscribe = subscribeSharedCustomizations(routeSharedGardenId, (nextCustomizations) => {
      setSharedCustomizationsByGarden((prev) => ({
        ...prev,
        [routeSharedGardenId]: nextCustomizations,
      }));
    });
    return () => unsubscribe && unsubscribe();
  }, [routeSharedGardenId]);

  useEffect(() => {
    if (!goal) return;
    setName(goal.name || "");
    setCategory(goal.category || "Custom");
    setIsPrivate(!!goal.isPrivate);
    setSelectedIcon(goal.icon || "target");
    setType(goal.type || "completion");
    setTarget(String(clampNum(goal?.measurable?.target ?? 1, 1, MAX_QUANTITY_TARGET)));
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
      const ownerId = goal?.ownerId;
      const currentUserId = auth.currentUser?.uid;
      if (assignedSharedGardenId) {
        await deleteDoc(doc(db, "sharedGardens", assignedSharedGardenId, "layout", goalId));
      }
      // Always delete from current user's goals
      await deleteDoc(doc(db, "users", currentUserId, "goals", goalId));
      // If the current user is not the owner, also delete from owner's goals
      if (ownerId && ownerId !== currentUserId) {
        await deleteDoc(doc(db, "users", ownerId, "goals", goalId));
      }
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
    return { target: clampNum(target, 1, MAX_QUANTITY_TARGET), unit: unit.trim() || "units" };
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



  const formError = useMemo(() => {
    if (name.trim().length < 3) return "Give it a short name (at least 3 characters).";
    if (!selectedIcon) return "Please select an icon.";
    if (type === "quantity" && (!(Number(target) > 0) || unit.trim().length < 1)) return "Quantity needs a number and unit.";
    if (type === "quantity" && Number(target) > MAX_QUANTITY_TARGET) return `Quantity max is ${MAX_QUANTITY_TARGET}.`;
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
    setHasUnsavedNotificationChanges(false);
    setShowEditModal(true);
  };

  const openIconModal = () => {
    setShowEditModal(false);
    setEditView("icons");
    queueModalSwap(() => setShowIconModal(true));
  };

  const handleCancelEdit = () => {
    if (hasUnsavedNotificationChanges) {
      Alert.alert(
        "Unsaved Changes",
        "You have unsaved notification changes. Are you sure you want to cancel without saving?",
        [
          { text: "Keep Editing", onPress: () => {} },
          {
            text: "Discard Changes",
            onPress: () => {
              setShowIconModal(false);
              setShowEditModal(false);
              setEditView("form");
              setIconSearch("");
              setHasUnsavedNotificationChanges(false);
            },
            style: "destructive",
          },
        ]
      );
    } else {
      setShowIconModal(false);
      setShowEditModal(false);
      setEditView("form");
      setIconSearch("");
    }
  };

  const closeIconModal = () => {
    setShowIconModal(false);
    setIconSearch("");
    setEditView("form");
    queueModalSwap(() => setShowEditModal(true));
  };

  const saveEdits = async () => {
    console.log('[DEBUG] saveEdits called');
    if (!auth.currentUser || !goal || formError || isSaving) return;
    setIsSaving(true);

    try {
      const currentTrackingType = goal?.type || goal?.kind || "completion";
      const typeChanged = currentTrackingType !== type;
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

      // Unfreeze trophy state if moving out of storage
      let updatedGoalData = {
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

      // If moving to a different garden, always unfreeze trophy state

      // If moving to a different garden, always unfreeze trophy state
      // If unfreezing, also set resumeFromTrophyDate and resumeFromTrophyHealth
      const prevWasFrozen = !!goal.isFrozenTrophyState;
      const prevFrozenHealth = Number(goal.frozenHealthLevel) || 5;
      const prevTrophyDate = goal.trophyDate;
      updatedGoalData = updateTrophyFreezeState({ ...goal, ...updatedGoalData });
      if (prevWasFrozen && !updatedGoalData.isFrozenTrophyState) {
        // Just unfroze, so set resume fields
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        let resumeFromTrophyDate = prevTrophyDate ? fromKey(prevTrophyDate) : today;
        resumeFromTrophyDate.setDate(resumeFromTrophyDate.getDate() + 1); // day after trophy
        const resumeFromTrophyDateKey = toKey(resumeFromTrophyDate);
        updatedGoalData.resumeFromTrophyDate = resumeFromTrophyDateKey;
        updatedGoalData.resumeFromTrophyHealth = prevFrozenHealth;
      }

      if (typeChanged) {
        const migratedLogs = migrateLogsForTrackingType(goal, type, measurableForType);
        const derivedGoalData = {
          ...goal,
          ...updatedGoalData,
          type,
          measurable: measurableForType,
          logs: migratedLogs,
        };
        const { currentStreak, longestStreak } = calculateGoalStreak(derivedGoalData, migratedLogs, selectedDateKey);

        updatedGoalData.logs = migratedLogs;
        updatedGoalData.currentStreak = currentStreak;
        updatedGoalData.longestStreak = longestStreak;
        updatedGoalData.totalCompletions = countCompletedDates(derivedGoalData, migratedLogs);
        updatedGoalData.healthLevel = getPlantHealthState(derivedGoalData, fromKey(selectedDateKey)).healthLevel;
      }



      // Debug: print the data being sent to Firestore (plain log for Metro/Expo)
      console.log('[DEBUG] updateGoal updatedGoalData:', updatedGoalData);

      await setDoc(doc(db, "users", auth.currentUser.uid, "goals", goal.id), updatedGoalData, { merge: true });

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

      // Save notification settings for this goal
      if (goalNotificationEnabled) {
        await saveGoalNotificationSettings(goal.id, {
          enabled: true,
          time: goalNotificationTime,
          timeMinute: goalNotificationTimeMinute,
        });
      } else {
        await saveGoalNotificationSettings(goal.id, {
          enabled: false,
        });
      }

      setShowEditModal(false);
      setHasUnsavedNotificationChanges(false);
    } catch (error) {
      console.log('[DEBUG] updateGoal error:', error);
      Alert.alert("Error", "Could not update goal.");
    } finally {
      setIsSaving(false);
    }
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
    // Block completion if selected date is not a scheduled day
    const selectedDateObj = fromKey(selectedDateKey);
    if (!isGoalScheduledOnDate(goal, selectedDateObj)) {
      Alert.alert(
        "Not Scheduled Today",
        "You can't complete this goal on this date because it is not scheduled."
      );
      return;
    }
    try {
      if (tapCooldownRef.current) return;
      startTapCooldown();
      await toggleGoalTransaction({
        goal,
        selectedDateKey,
        isSharedGoalView,
        routeSharedGardenId,
        shelfPosition,
        archiveToStorage,
        findFirstOpenStorageSlot,
        clearLocalOptimisticProgress,
      });
    } catch (error) {
      clearLocalOptimisticProgress();
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

    const activeOptimistic = optimisticProgressRef.current;
    const isCurrentlyDone = activeOptimistic?.isDone ?? isGoalDoneForDate(goal, selectedDateKey);
    const goalType = goal.type || goal.kind;
    const quantityTarget = Math.max(1, Math.floor(Number(goal?.measurable?.target) || 1));
    const currentQuantityValue = Math.max(
      0,
      Math.min(
        Number(activeOptimistic?.currentValue ?? goal?.logs?.quantity?.[selectedDateKey]?.value) || 0,
        quantityTarget
      )
    );
    const nextQuantityValue = goalType === "quantity"
      ? (isCurrentlyDone
        ? 0
        : Math.min(currentQuantityValue + 1, quantityTarget))
      : null;
    const willCompleteSelectedDay = goalType === "quantity"
      ? nextQuantityValue >= quantityTarget
      : !isCurrentlyDone;
    const completionCondition = goal?.completionCondition || { type: "none" };
    const endDate = completionCondition.endDate;
    const hasDateBound = completionCondition.type === "date" || completionCondition.type === "both";
    const isLastDay = hasDateBound && !!endDate && endDate === selectedDateKey;
    // Check for amount-based completion
    const isAmountBound = completionCondition.type === "amount" || completionCondition.type === "both";
    let willReachAmount = false;
    if (isAmountBound) {
      const targetAmount = Number(completionCondition.targetAmount) || 1;
      let total = 0;
      if (goal?.logs?.quantity) {
        total = Object.values(goal.logs.quantity).reduce((sum, entry) => sum + (Number(entry.value) || 0), 0);
      }
      // If this completion will reach or exceed the target amount
      if (total + 1 >= targetAmount) {
        willReachAmount = true;
      }
    }

    if ((isLastDay && willCompleteSelectedDay) || (willReachAmount && !isCurrentlyDone)) {
      Alert.alert(
        "Goal Complete",
        "Do you want to move this goal to the trophy collection or cancel?",
        [
          { text: "Cancel", style: "destructive" }, // red
          { text: "Make Trophy", style: "default", onPress: completeGoalToTrophy }, // blue
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

      // Freeze health/streaks as they are now (do NOT mark today as done)
      const preCompleteLogs = JSON.parse(JSON.stringify(goal.logs || {}));
      const { currentStreak: frozenCurrentStreak, longestStreak: frozenLongestStreak } = calculateGoalStreak(goal, preCompleteLogs, selectedDateKey);
      const frozenHealthLevel = getPlantHealthState({ ...goal, logs: preCompleteLogs }).healthLevel;
      const todayTrophyDate = toKey(new Date());
      let updateData = {
        // Do not update logs or mark today as done
        isFrozenTrophyState: true,
        frozenHealthLevel,
        frozenCurrentStreak,
        frozenLongestStreak,
        trophyDate: todayTrophyDate,
      };
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

      // Unfreeze trophy state: explicitly delete frozen fields in Firestore
      // and store resumeFromTrophyDate and resumeFromTrophyHealth
      const { isFrozenTrophyState, frozenHealthLevel, frozenCurrentStreak, frozenLongestStreak, trophyDate, ...restGoal } = goal;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const resumeFromTrophyDate = trophyDate ? fromKey(trophyDate) : today;
      resumeFromTrophyDate.setDate(resumeFromTrophyDate.getDate() + 1); // day after trophy
      const resumeFromTrophyDateKey = toKey(resumeFromTrophyDate);
      await updateDoc(goalRef, {
        ...restGoal,
        completionCondition: nextCompletionCondition,
        isFrozenTrophyState: deleteField(),
        frozenHealthLevel: deleteField(),
        frozenCurrentStreak: deleteField(),
        frozenLongestStreak: deleteField(),
        resumeFromTrophyDate: resumeFromTrophyDateKey,
        resumeFromTrophyHealth: Number(frozenHealthLevel) || 5,
      });

      if (isSharedGoalView && goal?.ownerId && goal?.sourceGoalId) {
        try {
          await updateDoc(doc(db, "users", goal.ownerId, "goals", goal.sourceGoalId), {
            ...restGoal,
            completionCondition: nextCompletionCondition,
            isFrozenTrophyState: deleteField(),
            frozenHealthLevel: deleteField(),
            frozenCurrentStreak: deleteField(),
            frozenLongestStreak: deleteField(),
            resumeFromTrophyDate: resumeFromTrophyDateKey,
            resumeFromTrophyHealth: Number(frozenHealthLevel) || 5,
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
      Alert.alert("Error", "Could not return goal from trophy.");
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

  // --- Robust shared multi-user quantity goal logic ---
  const isCompletion = goal.type === "completion";
  const isQuantity = goal.type === "quantity";
  const isSharedMultiUserCompletion = isSharedGoalView && isCompletion && !!goal?.multiUserWateringEnabled;
  const isSharedMultiUserQuantity = isSharedGoalView && isQuantity && !!goal?.multiUserWateringEnabled;
  const currentUserId = auth.currentUser?.uid;
  const requiredSharedContributors = (isSharedMultiUserCompletion || isSharedMultiUserQuantity)
    ? Math.max(2, Math.floor(Number(goal?.requiredContributors) || 2))
    : 1;

  // --- Contributor count for shared multi-user quantity ---
  // Always use Firestore logs, only count users who reached the target for the day
  const quantityTargetValue = isQuantity ? (goal.measurable?.target ?? 1) : 1;
  let firestoreQuantityLogs = {};
  if (
    goal &&
    goal.logs &&
    goal.logs.quantity &&
    goal.logs.quantity[selectedDateKey] &&
    typeof goal.logs.quantity[selectedDateKey].users === 'object' &&
    goal.logs.quantity[selectedDateKey].users !== null
  ) {
    firestoreQuantityLogs = goal.logs.quantity[selectedDateKey].users;
  }
  let contributorQuantityCount = 0;
  if (isSharedMultiUserQuantity) {
    // Defensive: use contributors list if present, else all user keys in logs
    const allContributors = Array.isArray(goal.contributors)
      ? goal.contributors
      : Object.keys(firestoreQuantityLogs);
    contributorQuantityCount = allContributors.filter((userId) => Number(firestoreQuantityLogs[userId]) >= quantityTargetValue).length;
  }
  // For completion: count users who marked done
  const currentWaterUsers = isSharedMultiUserCompletion
    ? Object.keys(goal?.logs?.completion?.[selectedDateKey]?.users || {}).filter((userId) => !!goal?.logs?.completion?.[selectedDateKey]?.users?.[userId]).length
    : 0;
  const currentUserClicked = isSharedMultiUserCompletion
    ? !!(goal?.logs?.completion?.[selectedDateKey]?.users?.[currentUserId])
    : false;
  // Contributor progress label
  const contributorProgressLabel = isSharedMultiUserQuantity
    ? `${Math.min(contributorQuantityCount, requiredSharedContributors)}/${requiredSharedContributors}`
    : `${Math.min(currentWaterUsers, requiredSharedContributors)}/${requiredSharedContributors}`;

  // --- Per-user progress for quantity goals ---
  // For shared multi-user quantity, only show optimistic progress for the current user's segment
  let quantityLogs = firestoreQuantityLogs;
  const firestoreUserValue = Number(firestoreQuantityLogs[currentUserId]) || 0;
  if (isSharedMultiUserQuantity && optimisticProgress && typeof optimisticProgress.currentValue === 'number') {
    // Only show optimistic value for the current user's segment
    quantityLogs = { ...firestoreQuantityLogs, [currentUserId]: optimisticProgress.currentValue };
  }
  // For single-user, fallback to value
  const baseCurrentValue = isCompletion
    ? (isSharedMultiUserCompletion ? currentWaterUsers : (goal.logs?.completion?.[selectedDateKey]?.done ? 1 : 0))
    : (goal.logs?.quantity?.[selectedDateKey]?.value ?? 0);
  const targetValue = isCompletion ? (isSharedMultiUserCompletion ? requiredSharedContributors : 1) : (goal.measurable?.target ?? 0);
  // For shared multi-user quantity, show current user's optimistic progress if available
  // For shared multi-user quantity, always use the current user's value (optimistic if available, else Firestore)
  const currentUserQuantityValue = isSharedMultiUserQuantity
    ? (optimisticProgress && typeof optimisticProgress.currentValue === 'number'
        ? optimisticProgress.currentValue
        : firestoreUserValue)
    : null;
  const currentValue = isSharedMultiUserQuantity
    ? currentUserQuantityValue
    : (!isSharedMultiUserCompletion && optimisticProgress)
      ? optimisticProgress.currentValue
      : baseCurrentValue;

  // --- Group-level completion, health, streak, trophy logic ---
  // Always use isGoalDoneForDate in group mode (no currentUserId) for shared multi-user quantity
  const isDone = isSharedMultiUserQuantity
    ? isGoalDoneForDate(goal, selectedDateKey)
    : (!isSharedMultiUserCompletion && optimisticProgress)
      ? optimisticProgress.isDone
      : (currentValue >= targetValue && targetValue > 0);

  // Only use optimistic progress for current user's segments, not for group completion/health
  // For shared multi-user quantity, always derive totalCompletions from logs
  const goalForDerivedState = (() => {
    if (!goal) return goal;

    // For shared multi-user quantity, recalculate totalCompletions from logs
    if (isSharedMultiUserQuantity) {
      // Defensive: use contributors list if present, else all user keys in logs
      const quantityLogs = goal.logs?.quantity || {};
      const contributors = Array.isArray(goal.contributors)
        ? goal.contributors
        : Object.values(quantityLogs).reduce((acc, entry) => {
            if (entry && typeof entry.users === 'object' && entry.users !== null) {
              Object.keys(entry.users).forEach((uid) => {
                if (!acc.includes(uid)) acc.push(uid);
              });
            }
            return acc;
          }, []);
      const targetValue = goal.measurable?.target ?? 1;
      const requiredContributors = Math.max(2, Math.floor(Number(goal?.requiredContributors) || 2));
      // Count days where group completion was achieved
      const groupDoneDates = Object.entries(quantityLogs).filter(([dateKey, entry]) => {
        if (!entry || typeof entry.users !== 'object' || entry.users === null) return false;
        const userDoneCount = contributors.filter((userId) => Number(entry.users[userId]) >= targetValue).length;
        return userDoneCount >= requiredContributors;
      });
      const derivedTotalCompletions = groupDoneDates.length;
      return {
        ...goal,
        totalCompletions: derivedTotalCompletions,
      };
    }

    // For shared multi-user completion, recalculate totalCompletions from logs
    if (isSharedMultiUserCompletion) {
      const completionLogs = goal.logs?.completion || {};
      const requiredContributors = Math.max(2, Math.floor(Number(goal?.requiredContributors) || 2));
      const groupDoneDates = Object.entries(completionLogs).filter(([dateKey, entry]) => {
        if (!entry || typeof entry.users !== 'object' || entry.users === null) return false;
        const uniqueCount = Object.keys(entry.users).filter((userId) => !!entry.users[userId]).length;
        return uniqueCount >= requiredContributors;
      });
      const derivedTotalCompletions = groupDoneDates.length;
      return {
        ...goal,
        totalCompletions: derivedTotalCompletions,
      };
    }

    // For optimistic progress (single-user), update logs for UI
    if (!isSharedMultiUserCompletion && !isSharedMultiUserQuantity && optimisticProgress) {
      const nextLogs = JSON.parse(JSON.stringify(goal.logs || {}));
      if (isCompletion) {
        if (!nextLogs.completion) nextLogs.completion = {};
        nextLogs.completion[selectedDateKey] = {
          ...(nextLogs.completion[selectedDateKey] || {}),
          done: !!optimisticProgress.isDone,
        };
      } else {
        if (!nextLogs.quantity) nextLogs.quantity = {};
        nextLogs.quantity[selectedDateKey] = {
          ...(nextLogs.quantity[selectedDateKey] || {}),
          value: Number(currentValue) || 0,
        };
      }
      return {
        ...goal,
        logs: nextLogs,
      };
    }
    return goal;
  })();
  const isTrophy = shelfPosition?.pageId === STORAGE_PAGE_ID;
  // If goal is a trophy or was a trophy and frozen, use frozen values for streak, health, rewards
  const isFrozenTrophy = goal?.isFrozenTrophyState;
  // Always use real current date for health bar, not selected date
  const displayHealthState = getPlantHealthState(goalForDerivedState, new Date());

  // Find the date the plant became a trophy
  const trophyDate = goal?.trophyDate || null;
  const showReviveHeart = isDone && displayHealthState.healthLevel === 3;
  const selectedDateLabel = fromKey(selectedDateKey).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const progressUnitLabel = isSharedMultiUserCompletion ? "users" : (goal.measurable?.unit || "");
  const topSummary = [
    goal.frequencyLabel || formatScheduleLabel(goal.schedule),
    goal.category || "Custom",
  ].filter(Boolean).join(" • ");
  const todayKey = toKey(new Date());
  const anchor = fromKey(todayKey);
  anchor.setHours(0, 0, 0, 0);
  const recentHistory = [];

  for (let offset = 6; offset >= 0; offset -= 1) {
    const date = new Date(anchor);
    date.setDate(anchor.getDate() - offset);
    const dateKey = toKey(date);
    const scheduled = isGoalScheduledOnDate(goalForDerivedState, date);
    // For group-level history, use group mode for shared multi-user quantity
    const doneForDate = scheduled && (isSharedMultiUserQuantity
      ? isGoalDoneForDate(goal, dateKey)
      : isGoalDoneForDate(goalForDerivedState, dateKey, currentUserId)
    );
    const isTodayDate = dateKey === todayKey;
    const isPastDay = date.getTime() < anchor.getTime();

    // Trophy logic: freeze stats from trophyDate forward, including today if goal is a trophy
    let isFrozenDay = false;
    if (trophyDate && dateKey >= trophyDate && (isTrophy || !isTodayDate)) {
      isFrozenDay = true;
    }


    let healthLevel;
    if (isFrozenDay) {
      healthLevel = Number(goal?.frozenHealthLevel) || 5;
    } else if (typeof goal?.logs?.healthHistory?.[dateKey] === 'number') {
      healthLevel = goal.logs.healthHistory[dateKey];
    } else {
      // Fallback: simulate health for this day if not present in healthHistory
      healthLevel = getPlantHealthState(goalForDerivedState, date).healthLevel;
    }

    recentHistory.push({
      dateKey,
      dayLabel: date.toLocaleDateString(undefined, { weekday: "short" }).slice(0, 2),
      dayNumber: date.getDate(),
      scheduled,
      done: doneForDate,
      missed: scheduled && !doneForDate && isPastDay,
      pending: scheduled && !doneForDate && isTodayDate,
      isToday: isTodayDate,
      healthLevel,
      isFrozenDay,
    });
  }
  // DEBUG: Print recentHistory for weekly bars
  if (goal?.name === "Grumble") {
    console.log("[DEBUG][GoalScreen][Grumble] recentHistory:", recentHistory);
  }
  const progressStatusText = isSharedMultiUserCompletion
    ? `${contributorProgressLabel} contributors`
    : (isTrophy ? "Stored in trophy collection" : null);
  const showQuantitySegments = isQuantity && Number(targetValue) > 0;
  const quantitySegmentCount = showQuantitySegments ? Math.max(1, Math.min(Math.floor(Number(targetValue) || 1), 6)) : 0;
  const safeQuantityCurrent = showQuantitySegments
    ? Math.max(0, Math.min(Number(currentValue) || 0, Number(targetValue) || 1))
    : 0;
  const filledQuantitySegments = showQuantitySegments
    ? Math.min(quantitySegmentCount, Math.ceil((safeQuantityCurrent / (Number(targetValue) || 1)) * quantitySegmentCount))
    : 0;
  // Use frozen streaks for trophy/frozen
  const rewardStreakState = (isTrophy || isFrozenTrophy)
    ? { currentStreak: goal?.frozenCurrentStreak ?? goal.currentStreak ?? 0, longestStreak: goal?.frozenLongestStreak ?? goal.longestStreak ?? 0 }
    : calculateGoalStreak(
        goalForDerivedState,
        goalForDerivedState?.logs || {},
        selectedDateKey
      );
  const currentRewardStreak = Number(rewardStreakState?.currentStreak) || Number(goalForDerivedState?.currentStreak) || 0;
  // Use frozen health for trophy/frozen
  const currentHealthLevel = (isTrophy || isFrozenTrophy)
    ? Number(goal?.frozenHealthLevel) || 5
    : Number(displayHealthState.healthLevel) || 1;
  const trophyPreviewKey = getPreviewTrophyRating(currentRewardStreak, currentHealthLevel);
  const trophyPreview = TROPHY_ROADMAP.find((item) => item.key === trophyPreviewKey) || TROPHY_ROADMAP[0];
  const trophyPreviewIndex = TROPHY_ROADMAP.findIndex((item) => item.key === trophyPreview.key);
  const currentTierBase = TROPHY_ROADMAP[Math.max(0, trophyPreviewIndex)] || TROPHY_ROADMAP[0];
  const nextTrophy = TROPHY_ROADMAP[trophyPreviewIndex + 1] || null;
  const streakGap = nextTrophy ? Math.max(0, nextTrophy.streak - currentRewardStreak) : 0;
  const progressDenominator = nextTrophy
    ? Math.max(1, nextTrophy.streak - currentTierBase.streak)
    : 1;
  const progressNumerator = nextTrophy
    ? Math.max(0, Math.min(currentRewardStreak - currentTierBase.streak, progressDenominator))
    : 1;
  const nextLevelProgress = nextTrophy ? (progressNumerator / progressDenominator) * 100 : 100;
  const progressStageKey = (nextTrophy || trophyPreview).key;
  const progressStageStyle = TROPHY_PROGRESS_STYLE[progressStageKey] || TROPHY_PROGRESS_STYLE.bronze;
  const nextTrophyHint = nextTrophy
    ? `${streakGap > 0 ? `${streakGap} more streak day${streakGap === 1 ? "" : "s"}` : "Streak ready"}${currentHealthLevel < nextTrophy.health ? ` • health ${nextTrophy.health}/5 needed` : ""}`
    : "Top trophy tier reached.";
  // Use frozen health for health bar if trophy/frozen
  const healthLevelValue = (isTrophy || isFrozenTrophy)
    ? Number(goal?.frozenHealthLevel) || 5
    : Math.max(1, Math.min(5, Number(displayHealthState.healthLevel) || 1));

  // DEBUG: Print health bar calculation for this goal
  if (goal?.name === "Grumble") {
    console.log("[DEBUG][GoalScreen][Grumble] goalForDerivedState:", goalForDerivedState);
    console.log("[DEBUG][GoalScreen][Grumble] displayHealthState:", displayHealthState);
    console.log("[DEBUG][GoalScreen][Grumble] healthLevelValue:", healthLevelValue);
  }
  const HEALTH_BLUE_BY_LEVEL = {
    1: "#8ea5bf",
    2: "#789fc6",
    3: "#5f9bce",
    4: "#4a9bd8",
    5: "#3497e6",
  };
  const getHealthBlue = (level) => HEALTH_BLUE_BY_LEVEL[Math.max(1, Math.min(5, Number(level) || 1))] || "#4a9bd8";
  const healthBarColor = getHealthBlue(healthLevelValue);
  const totalCompletionsValue = Math.max(0, Number(goalForDerivedState?.totalCompletions) || 0);
  const growthMilestones = [
    { stage: "Stage 1", start: 0, nextStart: 6 },
    { stage: "Stage 2", start: 6, nextStart: 16 },
    { stage: "Stage 3", start: 16, nextStart: 31 },
    { stage: "Stage 4", start: 31, nextStart: null },
  ];
  const activeGrowthMilestone = growthMilestones.find((item, index) => {
    const next = growthMilestones[index + 1];
    if (!next) return totalCompletionsValue >= item.start;
    return totalCompletionsValue >= item.start && totalCompletionsValue < next.start;
  }) || growthMilestones[growthMilestones.length - 1];
  const growthStageCompletions = Math.max(0, totalCompletionsValue - activeGrowthMilestone.start);
  const growthStageNeeded = activeGrowthMilestone.nextStart
    ? Math.max(1, activeGrowthMilestone.nextStart - activeGrowthMilestone.start)
    : 0;
  const growthToNextPercent = activeGrowthMilestone.nextStart
    ? Math.max(
        0,
        Math.min(
          100,
          (growthStageCompletions / growthStageNeeded) * 100
        )
      )
    : 100;

  const getGoalPreviewBackdropColor = (goalData) => {
    const isSharedGoal = !!routeSharedGardenId || !!goalData?.sharedGardenId || goalData?.gardenType === "shared";
    const resolvedPageId = shelfPosition?.pageId || goalData?.shelfPosition?.pageId || "default";
    const sharedGardenKey = goalData?.sharedGardenId || goalData?.gardenId || routeSharedGardenId;

    const pageCustomizations = isSharedGoal
      ? (
          sharedCustomizationsByGarden?.[sharedGardenKey]?.[resolvedPageId]
          || sharedCustomizationsByGarden?.[sharedGardenKey]?.default
        )
      : (personalCustomizations?.[resolvedPageId] || personalCustomizations?.default);

    const wallBgIndex = Number(pageCustomizations?.wallBg ?? 0);
    return WALLPAPER_OPTIONS[wallBgIndex]?.previewColor || DEFAULT_PLANT_PREVIEW_COLOR;
  };

  const previewBackdropColor = getGoalPreviewBackdropColor(goal);

  const triggerDetailHaptic = (style = Haptics.ImpactFeedbackStyle.Medium) => {
    Haptics.impactAsync(style).catch(() => {});
  };

  let statusButtonBgColor = "#f1f1f1";
  let statusButtonShadowColor = "#d6d6d6";
  let statusButtonIconColor = "#58cc02";

  if (isTrophy) {
    statusButtonBgColor = "#d9dde3";
    statusButtonShadowColor = "#b7c0c9";
    statusButtonIconColor = "#7b8794";
  } else if (isDone) {
    statusButtonBgColor = "#59d700";
    statusButtonShadowColor = "#4aa93a";
    statusButtonIconColor = "#ffffff";
  } else if (isSharedMultiUserCompletion && currentUserClicked) {
    statusButtonBgColor = "#8ef148";
    statusButtonShadowColor = "#73cf39";
    statusButtonIconColor = "#ffffff";
  } else if (isSharedMultiUserQuantity && isDone) {
    statusButtonBgColor = "#59d700";
    statusButtonShadowColor = "#4aa93a";
    statusButtonIconColor = "#ffffff";
  } else if (isQuantity && Number(currentValue) >= (quantityTargetValue || 1)) {
    statusButtonBgColor = "#8ef148";
    statusButtonShadowColor = "#73cf39";
    statusButtonIconColor = "#ffffff";
  } else if (isQuantity && Number(currentValue) >= (quantityTargetValue || 1)) {
    statusButtonBgColor = "#eef6e8";
    statusButtonShadowColor = "#c6d6b9";
    statusButtonIconColor = "#2f7d12";
  }

  const primaryActionBgColor = isTrophy ? "#6d9eff" : "#59d700";
  const primaryActionShadowColor = isTrophy ? "#4e79cf" : "#4aa93a";

  return (
    <Page>
      <View style={styles.headerWrapper}>
        <View style={styles.headerRow}>
          <Pressable
            onPress={handleBack}
            onPressIn={() => triggerDetailHaptic(Haptics.ImpactFeedbackStyle.Light)}
            hitSlop={20}
            style={styles.headerBtn}
          >
            <Ionicons name="chevron-back" size={26} color={theme.accent} />
          </Pressable>
          <Text style={styles.headerTitle}>Goal Details</Text>
          <View style={styles.headerActions}>
            <View style={styles.headerBtn}>
              <EditButtonRestriction
                goal={goal}
                sharedGardens={sharedGardens}
                openEditModal={openEditModal}
              />
            </View>
            <Pressable
              onPress={confirmDelete}
              onPressIn={() => triggerDetailHaptic(Haptics.ImpactFeedbackStyle.Light)}
              hitSlop={20}
              style={[styles.headerBtn, styles.headerBtnDanger]}
            >
              <Ionicons name="trash-outline" size={20} color={theme.dangerText || "#ff4444"} />
            </Pressable>
          </View>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={styles.heroCard}>
          <GoalPlantPreview
            goal={goalForDerivedState}
            getPlantHealthState={getPlantHealthState}
            backdropColor={previewBackdropColor}
            variant="hero"
          />
          <View style={styles.heroTextWrap}>
            <Text style={styles.heroTitle} numberOfLines={2}>{goal.name}</Text>
            <Text style={styles.heroSub}>{topSummary}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Today</Text>
          <View style={styles.progressCard}>
            <View style={styles.progressContent}>
              <Text style={styles.progressDate}>
                {selectedDateLabel} • {isTrophy ? "Trophy" : (isDone ? "Complete" : "Active")}
              </Text>
              <Text style={styles.progressValue}>{currentValue} / {targetValue}{progressUnitLabel ? ` ${progressUnitLabel}` : ""}</Text>
              {progressStatusText ? <Text style={styles.progressStatus}>{progressStatusText}</Text> : null}
            </View>

            <View style={[styles.goalStatusButton, { width: 58, height: 62 }]}> 
              <View
                pointerEvents="none"
                style={[
                  styles.goalStatusButtonShadow,
                  {
                    borderRadius: 22,
                    backgroundColor: statusButtonShadowColor,
                  },
                ]}
              />
              <Pressable
                hitSlop={8}
                disabled={isTrophy || isTapCoolingDown}
                onPressIn={() => {
                  if (!isTrophy) triggerDetailHaptic();
                }}
                onPress={handleToggleComplete}
                style={({ pressed }) => [
                  styles.goalStatusButtonFace,
                  {
                    width: 58,
                    height: 58,
                    borderRadius: 22,
                    backgroundColor: statusButtonBgColor,
                    transform: [{ translateY: pressed && !isTapCoolingDown ? 4 : 0 }],
                  },
                  isTrophy && styles.goalStatusButtonDisabled,
                ]}
              >
                {isSharedMultiUserQuantity ? (
                  <View style={styles.quantityButtonContent}>
                    <Text
                      style={[
                        styles.sharedQuantityProgressLabel,
                        { color: (Number(currentValue) >= quantityTargetValue) ? '#fff' : '#58cc02' },
                      ]}
                    >
                      {`${Math.min(Object.values(quantityLogs).filter(v => Number(v) >= quantityTargetValue).length, requiredSharedContributors)}/${requiredSharedContributors}`}
                    </Text>
                    <View style={styles.quantitySegmentRow}>
                      {Array.from({ length: quantitySegmentCount }).map((_, index) => {
                        const userValue = Math.max(0, Math.min(Number(currentValue) || 0, quantityTargetValue));
                        const filled = Math.min(quantitySegmentCount, Math.ceil((userValue / (Number(quantityTargetValue) || 1)) * quantitySegmentCount));
                        // For shared multi-user quantity: segments are white if user has completed their part
                        const userDone = userValue >= quantityTargetValue;
                        return (
                          <View
                            key={`goal-quantity-segment-${index}`}
                            style={[
                              styles.quantitySegment,
                              index < filled
                                ? (userDone ? styles.quantitySegmentDone : styles.quantitySegmentFilled)
                                : styles.quantitySegmentEmpty,
                            ]}
                          />
                        );
                      })}
                    </View>
                  </View>
                ) : isQuantity ? (
                  <View style={styles.quantityButtonContent}>
                    <View style={styles.quantitySegmentRow}>
                      {Array.from({ length: quantitySegmentCount }).map((_, index) => (
                        <View
                          key={`goal-quantity-segment-${index}`}
                          style={[
                            styles.quantitySegment,
                            index < filledQuantitySegments
                              ? (isDone ? styles.quantitySegmentDone : styles.quantitySegmentFilled)
                              : styles.quantitySegmentEmpty,
                          ]}
                        />
                      ))}
                    </View>
                  </View>
                ) : isSharedMultiUserCompletion ? (
                  <Text
                    style={[
                      styles.statusCircleCount,
                      { color: (isDone || currentUserClicked) ? "#ffffff" : statusButtonIconColor },
                    ]}
                  >
                    {contributorProgressLabel}
                  </Text>
                ) : (
                  <Ionicons name={isDone ? "close" : "checkmark"} size={30} color={statusButtonIconColor} />
                )}
              </Pressable>
            </View>
          </View>
          <View style={styles.todayHealthCard}>
            <View style={styles.todayHealthHeader}>
              <Text style={styles.todayHealthTitle}>Plant health</Text>
              <Text style={styles.todayHealthValue}>{healthLevelValue}/5 • {healthLabel(healthLevelValue)}</Text>
            </View>
            <AnimatedTodayHealthBar healthLevel={healthLevelValue} color={healthBarColor} />
            <View style={styles.growthStageWrap}>
              <View style={styles.growthStageHeader}>
                <Text style={styles.growthStageTitle}>Progress to next stage</Text>
                <Text style={styles.growthStageValue}>
                  {activeGrowthMilestone.nextStart
                    ? `${Math.min(growthStageCompletions, growthStageNeeded)}/${growthStageNeeded}`
                    : "Final"}
                </Text>
              </View>
              <AnimatedGrowthStageBar
                progressPercent={growthToNextPercent}
                color={activeGrowthMilestone.nextStart ? "#59d700" : "#ffd454"}
                showGoldStripes={!activeGrowthMilestone.nextStart}
              />
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Weekly streak</Text>
          <View style={styles.historyCardDuolingo}>
            <View style={styles.historyTopRowSimple}>
              <Text style={styles.historyHeadline}>This week</Text>
              <View style={styles.historyStreakBadge}>
                <Image source={FIRE_STREAK_ICON} style={styles.historyStreakIcon} resizeMode="contain" />
                <Text style={styles.historyStreakValue}>
                  {goal.currentStreak || 0} day streak
                </Text>
              </View>
            </View>

            <View style={styles.duolingoRow}>
              {recentHistory.map((entry) => {
                // Show badge image for all frozen days, regardless of done status
                return (
                  <View key={entry.dateKey} style={styles.duolingoDayWrap}>
                    <Text style={[
                      styles.duolingoDayLabel,
                      entry.isToday && styles.duolingoDayLabelToday,
                      entry.isFrozenDay && { color: trophyPreview.color },
                    ]}>{entry.dayLabel}</Text>
                    {entry.isFrozenDay ? (
                      <Image
                        source={getBadgeImageForTrophyKey(trophyPreview.key)}
                        style={styles.duolingoBadgeImage}
                        resizeMode="contain"
                      />
                    ) : entry.done ? (
                      <View
                        style={[
                          styles.duolingoBubble,
                          styles.duolingoBubbleDone,
                          entry.isToday && styles.duolingoBubbleToday,
                        ]}
                      >
                        <FontAwesomeIcon icon={FONT_AWESOME_ICONS["check"]} size={20} color="#ffffff" />
                      </View>
                    ) : (
                      <View
                        style={[
                          styles.duolingoBubble,
                          entry.missed
                            ? styles.duolingoBubbleMissed
                            : styles.duolingoBubbleIdle,
                          entry.isToday && styles.duolingoBubbleToday,
                        ]}
                      />
                    )}
                  </View>
                );
              })}
            </View>

            <View style={styles.healthTrendWrap}>
              <Text style={styles.healthTrendLabel}>Plant health</Text>
              <View style={styles.healthGraphRow}>
                {recentHistory.map((entry) => (
                  <View key={`${entry.dateKey}-health`} style={styles.duolingoDayWrap}>
                    <View style={styles.growthMiniWrap}>
                      <AnimatedWeeklyHealthBar
                        healthLevel={entry.healthLevel}
                        color={entry.isFrozenDay ? trophyPreview.color : getHealthBlue(entry.healthLevel)}
                      />
                    </View>
                  </View>
                ))}
              </View>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Rewards</Text>
          <View style={styles.rewardCard}>
            <View style={styles.rewardTopRow}>
              <View style={[styles.rewardTrophyIconWrap, { backgroundColor: trophyPreview.tint }]}>
                <Ionicons name="trophy" size={24} color={trophyPreview.color} />
              </View>
              <View style={styles.rewardTopText}>
                <Text style={styles.rewardHeadline}>{isTrophy ? "Current trophy" : "Trophy on completion"}</Text>
                <Text style={[styles.rewardTitle, { color: trophyPreview.color }]}>{trophyPreview.label} trophy</Text>
                <Text style={styles.rewardSub}>Based on your current streak and current health.</Text>
              </View>
            </View>

            <View style={styles.nextLevelCard}>
              <View style={styles.nextLevelRow}>
                <Text style={styles.nextLevelLabel}>
                  {nextTrophy ? `Progress to ${nextTrophy.label}` : 'Progress complete'}
                </Text>
                <Text style={styles.nextLevelMeta}>
                  {nextTrophy ? `${currentRewardStreak}/${nextTrophy.streak} days` : 'Max'}
                </Text>
              </View>

              <AnimatedRewardProgressBar
                progressPercent={nextLevelProgress}
                trackColor={progressStageStyle.track}
                gradientColors={progressStageStyle.gradient}
              />

              <View style={styles.nextLevelFooter}>
                <Text style={styles.nextLevelCurrent}>{trophyPreview.label}</Text>
                <Text style={styles.nextLevelTarget}>{nextTrophy ? nextTrophy.label : 'Complete'}</Text>
              </View>
            </View>

            <Text style={styles.rewardHint}>{nextTrophyHint}</Text>
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

        <View style={styles.completeGoalButtonWrap}>
          <View
            pointerEvents="none"
            style={[
              styles.completeGoalButtonShadow,
              { backgroundColor: primaryActionShadowColor },
            ]}
          />
          <Pressable
            onPress={isTrophy ? confirmReturnFromTrophy : confirmCompleteToTrophy}
            onPressIn={() => triggerDetailHaptic()}
            disabled={isCompletingToTrophy}
            style={({ pressed }) => [
              styles.completeGoalButton,
              { backgroundColor: primaryActionBgColor, transform: [{ translateY: pressed ? 4 : 0 }] },
              isCompletingToTrophy && styles.completeGoalButtonDisabled,
            ]}
          >
            <Ionicons name={isTrophy ? "arrow-undo" : "trophy"} size={18} color="#FFF" />
            <Text style={styles.completeGoalButtonText}>
              {isCompletingToTrophy ? (isTrophy ? "Returning..." : "Completing...") : (isTrophy ? "Return To Goal" : "Complete Goal")}
            </Text>
          </Pressable>
        </View>
      </ScrollView>

      <Modal visible={showEditModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          {editView === "form" && (
          <View style={styles.modalKeyboard}>
            <View style={styles.modalSheet}>
              <View style={styles.modalHeader}>
                <View style={styles.modalHeaderSide}>
                  <Pressable
                    onPress={handleCancelEdit}
                    onPressIn={() => triggerDetailHaptic(Haptics.ImpactFeedbackStyle.Light)}
                    style={({ pressed }) => [
                      styles.modalHeaderButton,
                      styles.modalHeaderButtonSecondary,
                      pressed && styles.modalHeaderButtonPressed,
                    ]}
                  >
                    <Text style={[styles.modalHeaderButtonText, styles.modalHeaderButtonTextSecondary]}>Cancel</Text>
                  </Pressable>
                </View>
                <Text style={styles.modalTitle}>Edit Goal</Text>
                <View style={[styles.modalHeaderSide, styles.modalHeaderSideRight]}>
                  <Pressable
                    onPress={saveEdits}
                    onPressIn={() => {
                      if (!formError && !isSaving) triggerDetailHaptic(Haptics.ImpactFeedbackStyle.Light);
                    }}
                    disabled={!!formError || isSaving}
                    style={({ pressed }) => [
                      styles.modalHeaderButton,
                      styles.modalHeaderButtonPrimary,
                      pressed && !formError && !isSaving && styles.modalHeaderButtonPressed,
                      (!!formError || isSaving) && styles.modalHeaderButtonDisabled,
                    ]}
                  >
                    <Text style={[styles.modalHeaderButtonText, styles.modalHeaderButtonTextPrimary]}>{isSaving ? "Saving" : "Save"}</Text>
                  </Pressable>
                </View>
              </View>

              <ScrollView
                contentContainerStyle={styles.editContent}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
                automaticallyAdjustKeyboardInsets={true}
                showsVerticalScrollIndicator={false}
              >
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
                      <TextInput value={target} onChangeText={(value) => setTarget(normalizeQuantityTargetInput(value))} keyboardType="numeric" style={[styles.input, styles.rowInput]} placeholder="Target (max 6)" placeholderTextColor={theme.muted2} />
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
                    <Chip label="End date" active={completionMode === "date" || completionMode === "both"} onPress={() => setCompletionMode("date")} />
                    <Chip label="End amount" active={completionMode === "amount" || completionMode === "both"} onPress={() => setCompletionMode("amount")} />
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
                  <Text style={styles.editLabel}>Notifications</Text>
                  
                  {!notificationsEnabled && (
                    <View style={styles.notificationWarning}>
                      <Ionicons name="warning" size={18} color="#EF6B6B" />
                      <Text style={styles.notificationWarningText}>
                        Notifications are disabled in settings. Enable them first.
                      </Text>
                    </View>
                  )}

                  <View style={[styles.switchRow, { marginTop: notificationsEnabled ? 0 : 12 }]}>
                    <View style={styles.switchTextWrap}>
                      <Text style={styles.switchLabel}>Goal Notification</Text>
                      <Text style={styles.switchHint}>Get a reminder for this goal</Text>
                    </View>
                    <Switch
                      value={goalNotificationEnabled}
                      onValueChange={(value) => {
                        setGoalNotificationEnabled(value);
                        if (value) {
                          setHasUnsavedNotificationChanges(true);
                        }
                      }}
                      disabled={!notificationsEnabled}
                      trackColor={{ false: theme.outline, true: theme.accent }}
                    />
                  </View>

                  {goalNotificationEnabled && notificationsEnabled && (
                    <>
                      <Pressable 
                        onPress={() => setShowGoalTimeModal(true)} 
                        style={styles.goalTimePickerButton}
                      >
                        <Text style={styles.timePickerLabel}>Reminder time</Text>
                        <View style={styles.timeDisplay}>
                          <Text style={styles.timeText}>
                            {String(goalNotificationTime).padStart(2, '0')}:{String(goalNotificationTimeMinute).padStart(2, '0')}
                          </Text>
                          <Ionicons name="chevron-forward" size={16} color={theme.accent} />
                        </View>
                      </Pressable>

                      {hasUnsavedNotificationChanges && (
                        <View style={styles.unsavedIndicator}>
                          <Ionicons name="alert-circle" size={16} color="#F39C12" />
                          <Text style={styles.unsavedText}>Press Save to apply changes</Text>
                        </View>
                      )}
                    </>
                  )}
                </View>

                {!!formError && <View style={styles.errorInline}><Text style={styles.errorInlineText}>{formError}</Text></View>}
              </ScrollView>
            </View>
          </View>
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
              <Text style={styles.iconModalCount}>{filteredIcons.length} icons</Text>
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
            keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.iconGridWrap}>
              {filteredIcons.map((item) => (
                <IconItem
                  key={item}
                  iconName={item}
                  isActive={selectedIcon === item}
                  onSelect={setSelectedIcon}
                />
              ))}
            </View>
            {!iconSearch.trim() && (
              <Text style={styles.iconLoadHint}>Showing popular icons first for faster loading.</Text>
            )}
            {hasMoreIcons && (
              <Pressable
                style={styles.loadMoreIconsBtn}
                onPress={() => {
                  Haptics.selectionAsync?.().catch(() => {});
                  setVisibleIconCount((prev) => prev + 120);
                }}
              >
                <Text style={styles.loadMoreIconsText}>Show more icons</Text>
              </Pressable>
            )}
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

      <Modal
        visible={showGoalTimeModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowGoalTimeModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.goalTimeModalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Set Goal Reminder Time</Text>
              <Pressable onPress={() => setShowGoalTimeModal(false)}>
                <Ionicons name="close" size={28} color={theme.text} />
              </Pressable>
            </View>

            <View style={styles.timePickerContainer}>
              <View style={styles.timeColumn}>
                <Text style={styles.timeLabel}>Hour</Text>
                <ScrollView style={styles.hourScroll} scrollEventThrottle={16}>
                  {Array.from({ length: 24 }, (_, i) => (
                    <Pressable
                      key={i}
                      onPress={() => {
                        setGoalNotificationTime(i);
                        setHasUnsavedNotificationChanges(true);
                      }}
                      style={[
                        styles.hourOption,
                        goalNotificationTime === i && styles.selectedHour,
                      ]}
                    >
                      <Text
                        style={[
                          styles.hourOptionText,
                          goalNotificationTime === i && styles.selectedHourText,
                        ]}
                      >
                        {String(i).padStart(2, '0')}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>

              <View style={styles.timeColumn}>
                <Text style={styles.timeLabel}>Minute</Text>
                <ScrollView style={styles.minuteScroll} scrollEventThrottle={16}>
                  {Array.from({ length: 60 }, (_, i) => (
                    <Pressable
                      key={i}
                      onPress={() => {
                        setGoalNotificationTimeMinute(i);
                        setHasUnsavedNotificationChanges(true);
                      }}
                      style={[
                        styles.minuteOption,
                        goalNotificationTimeMinute === i && styles.selectedMinute,
                      ]}
                    >
                      <Text
                        style={[
                          styles.minuteOptionText,
                          goalNotificationTimeMinute === i && styles.selectedMinuteText,
                        ]}
                      >
                        {String(i).padStart(2, '0')}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            </View>

            <View style={styles.modalButtons}>
              <Pressable
                onPress={() => setShowGoalTimeModal(false)}
                style={[styles.modalButton, styles.cancelButton]}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => setShowGoalTimeModal(false)}
                style={[styles.modalButton, styles.confirmButton]}
              >
                <Text style={styles.confirmButtonText}>Done</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>


    </Page>
  );
}

const styles = StyleSheet.create({
  headerWrapper: {
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: 24,
    borderWidth: 0,
    borderColor: '#d9e6f4',
    shadowColor: '#4c6782',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.16,
    shadowRadius: 0,
    elevation: 3,
    marginTop: 8,
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 10,
  },
  headerBtn: {
    width: 42,
    height: 42,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: '#e7edf5',
    shadowColor: '#c3cfdb',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 1,
  },
  headerBtnDanger: {
    backgroundColor: '#fde6e3',
  },
  headerTitle: { fontSize: 22, fontWeight: "900", color: theme.text, flexShrink: 1, fontFamily: 'CeraRoundProDEMO-Black', letterSpacing: 0.1 },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  centerWrap: { flex: 1, justifyContent: "center", alignItems: "center" },
  empty: { fontSize: 18, fontWeight: "900", color: theme.title, fontFamily: 'CeraRoundProDEMO-Black', letterSpacing: 0.1 },
  backLink: { marginTop: 12, color: theme.accent, fontWeight: "800", fontFamily: 'CeraRoundProDEMO-Black', letterSpacing: 0.1 },
  scrollContent: { paddingBottom: 110 },
  heroCard: {
    backgroundColor: '#ffffff',
    borderRadius: 28,
    paddingVertical: 14,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: "center",
    marginBottom: 18,
    shadowColor: '#cdcdcd',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 2,
  },
  goalPlantPreviewWrap: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'flex-end',
    position: 'relative',
    borderRadius: 16,
    paddingBottom: 2,
  },
  goalPlantPreviewWrapHero: {
    width: 86,
    height: 86,
    borderRadius: 24,
    paddingBottom: 4,
    marginBottom: 0,
    marginRight: 14,
    flexShrink: 0,
  },
  goalPlantImage: {
    position: 'absolute',
    bottom: 20,
    width: 30,
    height: 36,
    zIndex: 2,
    elevation: 2,
  },
  goalPlantImageHero: {
    bottom: 27,
    width: 46,
    height: 56,
  },
  goalPlantPot: {
    width: 34,
    height: 22,
    zIndex: 1,
  },
  goalPlantPotHero: {
    width: 50,
    height: 30,
  },
  heroTextWrap: {
    flex: 1,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  heroTitle: { fontSize: 22, fontWeight: "900", color: theme.text, textAlign: 'left', fontFamily: 'CeraRoundProDEMO-Black', letterSpacing: 0.1 },
  heroSub: { fontSize: 13, fontWeight: "800", color: theme.text2, marginTop: 4, textAlign: 'left', fontFamily: 'CeraRoundProDEMO-Black', letterSpacing: 0.1 },
  heroBadgeRow: { flexDirection: "row", gap: 8, marginTop: 14, flexWrap: 'wrap', justifyContent: 'center' },
  heroBadge: { backgroundColor: '#7b92a8', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 6 },
  heroBadgeText: { color: '#ffffff', fontSize: 12, fontWeight: "900", fontFamily: 'CeraRoundProDEMO-Black', letterSpacing: 0.1 },
  section: { marginBottom: 18 },
  sectionTitle: { fontSize: 12, fontWeight: "900", color: '#111111', marginBottom: 8, textTransform: "uppercase", letterSpacing: 1, fontFamily: 'CeraRoundProDEMO-Black' },
  progressCard: {
    backgroundColor: '#ffffff',
    borderRadius: 28,
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    shadowColor: '#cdcdcd',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 2,
  },
  progressContent: { flex: 1, paddingRight: 10 },
  progressDate: { fontSize: 12, fontWeight: "900", color: theme.text2, marginBottom: 4, fontFamily: 'CeraRoundProDEMO-Black', letterSpacing: 0.1 },
  progressValue: { fontSize: 20, fontWeight: "900", color: theme.text, fontFamily: 'CeraRoundProDEMO-Black', letterSpacing: 0.1 },
  progressStatus: { fontSize: 12, fontWeight: "800", color: theme.text2, marginTop: 3, fontFamily: 'CeraRoundProDEMO-Black', letterSpacing: 0.1 },
  todayHealthCard: {
    backgroundColor: '#ffffff',
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 10,
    shadowColor: '#cdcdcd',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 2,
  },
  todayHealthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  todayHealthTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: theme.text,
    fontFamily: 'CeraRoundProDEMO-Black',
    letterSpacing: 0.1,
  },
  todayHealthValue: {
    fontSize: 11,
    fontWeight: '900',
    color: '#7d8a97',
    fontFamily: 'CeraRoundProDEMO-Black',
    letterSpacing: 0.1,
  },
  todayHealthTrack: {
    height: 18,
    borderRadius: 999,
    backgroundColor: '#e5edf5',
    overflow: 'hidden',
  },
  todayHealthFill: {
    height: '100%',
    borderRadius: 999,
  },
  growthStageWrap: {
    marginTop: 10,
  },
  growthStageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  growthStageTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: theme.text,
  },
  growthStageValue: {
    fontSize: 11,
    fontWeight: '900',
    color: '#7d8a97',
  },
  growthStageTrack: {
    height: 12,
    borderRadius: 999,
    backgroundColor: '#e5edf5',
    overflow: 'hidden',
  },
  growthStageFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#59d700',
    overflow: 'hidden',
  },
  growthStageStripeLayer: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  growthStageStripe: {
    position: 'absolute',
    top: -12,
    bottom: -12,
    width:10,
    backgroundColor: '#ffd454',
    transform: [{ rotate: '45deg' }],
  },
  growthStageHint: {
    marginTop: 6,
    fontSize: 11,
    fontWeight: '800',
    color: '#7d8a97',
  },
  weeklyStreakTitle: {
    color: '#ffffff',
  },
  goalStatusButton: {
    marginLeft: 8,
    alignSelf: 'center',
    position: 'relative',
  },
  goalStatusButtonShadow: {
    position: 'absolute',
    top: 4,
    left: 0,
    right: 0,
    bottom: 0,
  },
  goalStatusButtonFace: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  goalStatusButtonDisabled: { opacity: 0.6 },
  quantityButtonContent: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  quantitySegmentRow: {
    flexDirection: 'row',
    width: '100%',
    gap: 3,
    justifyContent: 'center',
  },
  quantitySegment: {
    flex: 1,
    height: 6,
    borderRadius: 999,
    minWidth: 4,
  },
  quantitySegmentFilled: {
    backgroundColor: '#58cc02',
  },
  quantitySegmentDone: {
    backgroundColor: 'rgba(255,255,255,0.95)',
  },
  quantitySegmentEmpty: {
    backgroundColor: 'rgba(122,154,93,0.10)',
  },
  sharedQuantityProgressLabel: {
    fontSize: 11,
    fontWeight: '900',
    marginBottom: 2,
    alignSelf: 'center',
  },
  statusCircle: { width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: theme.accent, alignItems: "center", justifyContent: "center", overflow: "hidden", position: "relative" },
  statusCircleDone: { backgroundColor: theme.accent },
  statusCircleSelf: { backgroundColor: "rgba(167, 152, 125, 0.52)" },
  statusCircleCount: { fontSize: 11, fontWeight: "900" },
  statusCircleCountDone: { color: theme.bg },
  toggleButton: { alignItems: "center", gap: 8 },
  toggleButtonDisabled: { opacity: 0.45 },
  toggleHeart: { marginBottom: -2 },
  toggleButtonDone: { opacity: 0.95 },
  toggleButtonText: { fontSize: 12, fontWeight: "900", color: theme.accent },
  toggleButtonTextDone: { color: theme.title },
  statusCircleFrozen: { borderColor: theme.muted, backgroundColor: "rgba(255,255,255,0.08)" },
  rewardCard: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 14,
    shadowColor: '#cdcdcd',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 2,
  },
  rewardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rewardTrophyIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  rewardTopText: {
    flex: 1,
  },
  rewardHeadline: { fontSize: 12, fontWeight: '800', color: theme.text2, marginBottom: 2, fontFamily: 'CeraRoundProDEMO-Black', letterSpacing: 0.1 },
  rewardTitle: { fontSize: 20, fontWeight: '900', fontFamily: 'CeraRoundProDEMO-Black', letterSpacing: 0.1 },
  rewardSub: { fontSize: 12, fontWeight: '700', color: '#7d8a97', marginTop: 2, fontFamily: 'CeraRoundProDEMO-Black', letterSpacing: 0.1 },
  nextLevelCard: {
    marginTop: 12,
    backgroundColor: '#f5f8fb',
    borderRadius: 18,
    padding: 12,
  },
  nextLevelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  nextLevelLabel: { fontSize: 12, fontWeight: '900', color: theme.text, fontFamily: 'CeraRoundProDEMO-Black', letterSpacing: 0.1 },
  nextLevelMeta: { fontSize: 11, fontWeight: '800', color: '#7d8a97', fontFamily: 'CeraRoundProDEMO-Black', letterSpacing: 0.1 },
  nextLevelTrack: {
    height: 10,
    borderRadius: 999,
    backgroundColor: '#dde7f1',
    overflow: 'hidden',
  },
  nextLevelFillWrap: {
    height: '100%',
    borderRadius: 999,
    overflow: 'hidden',
  },
  nextLevelFill: {
    height: '100%',
    borderRadius: 999,
  },
  nextLevelFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  nextLevelCurrent: { fontSize: 11, fontWeight: '900', color: '#7d8a97', fontFamily: 'CeraRoundProDEMO-Black', letterSpacing: 0.1 },
  nextLevelTarget: { fontSize: 11, fontWeight: '900', color: '#3b5176', fontFamily: 'CeraRoundProDEMO-Black', letterSpacing: 0.1 },
  rewardHint: { fontSize: 12, fontWeight: '900', color: '#3b5176', marginTop: 12, fontFamily: 'CeraRoundProDEMO-Black', letterSpacing: 0.1 },
  historyCardDuolingo: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 14,
    shadowColor: '#cdcdcd',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 2,
  },
  historyTopRowSimple: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  historyHeadline: { fontSize: 15, fontWeight: '900', color: theme.text, fontFamily: 'CeraRoundProDEMO-Black', letterSpacing: 0.1 },
  historyStreakBadge: {
    backgroundColor: '#fcae49',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#f38a00',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 2,
  },
  historyStreakIcon: {
    width: 18,
    height: 18,
    marginRight: 7,
  },
  historyStreakValue: {
    fontSize: 13,
    fontWeight: '900',
    color: '#ffffff',
    fontFamily: 'CeraRoundProDEMO-Black',
    letterSpacing: 0.1,
  },
  duolingoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 4,
  },
  duolingoDayWrap: {
    flex: 1,
    alignItems: 'center',
  },
  growthMiniWrap: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 0,
  },
  healthTrendWrap: {
    marginTop: 12,
  },
  healthTrendLabel: {
    fontSize: 11,
    fontWeight: '900',
    color: '#7d8a97',
    marginBottom: 8,
    fontFamily: 'CeraRoundProDEMO-Black',
    letterSpacing: 0.1,
  },
  healthGraphRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    gap: 4,
  },
  growthMiniTrack: {
    width: 16,
    height: 56,
    borderRadius: 999,
    backgroundColor: '#e4ebf2',
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  growthMiniFill: {
    width: '100%',
    borderRadius: 999,
    minHeight: 12,
  },
  duolingoDayLabel: {
    fontSize: 11,
    fontWeight: '900',
    color: '#9b9b9b',
    marginBottom: 8,
    fontFamily: 'CeraRoundProDEMO-Black',
    letterSpacing: 0.1,
  },
  duolingoDayLabelToday: {
    color: '#f38a00',
  },
  duolingoBubble: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  duolingoBubbleDone: {
    backgroundColor: '#f38a00',
  },
  duolingoBubbleMissed: {
    backgroundColor: '#bdbdbd',
  },
  duolingoBubbleIdle: {
    backgroundColor: '#e9e9e9',
  },
  duolingoBubbleToday: {},

  duolingoBubbleFrozen: {
    // backgroundColor is now set dynamically for trophy color
    borderWidth: 0,
    // borderColor removed for trophy color consistency
  },
  duolingoBadgeImage: {
    width: 80,
    height: 80,
    top: -35,
    alignSelf: 'center',
    marginVertical: 0,
  },
  duolingoBubbleInner: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: 'rgba(255,255,255,0.42)',
  },
  infoCard: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    paddingHorizontal: 16,
    shadowColor: '#cdcdcd',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 2,
  },
  detailRow: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#edf2f6' },
  detailLabel: { fontSize: 12, fontWeight: "800", color: theme.text2, marginBottom: 4, fontFamily: 'CeraRoundProDEMO-Black', letterSpacing: 0.1 },
  detailValue: { fontSize: 15, fontWeight: "800", color: theme.text, fontFamily: 'CeraRoundProDEMO-Black', letterSpacing: 0.1 },
  whyCard: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 16,
    shadowColor: '#cdcdcd',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 2,
  },
  whyText: { fontSize: 15, lineHeight: 22, color: theme.text, fontWeight: "700" },
  completeGoalButtonWrap: {
    marginTop: 8,
    marginBottom: 8,
    height: 56,
    position: 'relative',
  },
  completeGoalButtonShadow: {
    position: 'absolute',
    top: 4,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 20,
  },
  completeGoalButton: {
    height: 52,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  completeGoalButtonDisabled: { opacity: 0.6 },
  completeGoalButtonText: { color: "#FFF", fontSize: 15, fontWeight: "900", fontFamily: 'CeraRoundProDEMO-Black', letterSpacing: 0.1 },
  returnDateModalCard: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 16,
    marginHorizontal: 18,
    marginBottom: 40,
    shadowColor: '#cdcdcd',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 2,
  },
  returnDateTitle: { fontSize: 18, fontWeight: "900", color: theme.text, marginBottom: 6 },
  returnDateHint: { fontSize: 13, fontWeight: "700", color: theme.text2, marginBottom: 12 },
  helperText: { fontSize: 12, color: theme.muted, marginBottom: 8 },
  calendarCard: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 12,
    marginBottom: 10,
    borderWidth: 0,
    borderColor: theme.outline,
    shadowColor: '#cdcdcd',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 2,
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
    borderWidth: 0,
    borderColor: theme.outline,
    borderRadius: 22,
    padding: 10,
    backgroundColor: '#ffffff',
    shadowColor: '#cdcdcd',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 2,
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
  modalKeyboard: { width: "100%", maxHeight: "94%", justifyContent: "flex-end" },
  modalSheet: {
    backgroundColor: '#e5edf7',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    padding: 18,
    maxHeight: "100%",
  },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14, gap: 10 },
  modalHeaderSide: { width: 88 },
  modalHeaderSideRight: { alignItems: "flex-end" },
  modalTitle: { flex: 1, fontSize: 18, fontWeight: "900", color: theme.text, textAlign: "center" },
  modalHeaderButton: {
    minWidth: 78,
    height: 40,
    paddingHorizontal: 14,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 1,
  },
  modalHeaderButtonSecondary: {
    backgroundColor: '#ffffff',
    shadowColor: '#c3cfdb',
  },
  modalHeaderButtonPrimary: {
    backgroundColor: '#59d700',
    shadowColor: '#4aa93a',
  },
  modalHeaderButtonPressed: { transform: [{ translateY: 2 }] },
  modalHeaderButtonDisabled: { opacity: 0.5 },
  modalHeaderButtonText: { fontSize: 14, fontWeight: "900" },
  modalHeaderButtonTextSecondary: { color: theme.accent },
  modalHeaderButtonTextPrimary: { color: '#FFFFFF' },
  editContent: { paddingBottom: 160 },
  editCard: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#dbe8f6',
    shadowColor: '#c9d9ea',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 2,
  },
  editLabel: { fontSize: 13, fontWeight: "900", color: theme.text, marginBottom: 8 },
  switchRow: { marginTop: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  switchLabel: { fontSize: 13, fontWeight: "700", color: theme.text },
  input: { backgroundColor: '#f9fbfd', borderRadius: 16, paddingHorizontal: 14, height: 46, fontSize: 14, color: theme.text, borderWidth: 1, borderColor: '#d9e6f4' },
  topGap: { marginTop: 10 },
  row: { flexDirection: "row", gap: 10, marginTop: 10 },
  rowInput: { flex: 1 },
  requiredInput: { width: 84, textAlign: "center", paddingHorizontal: 8 },
  textArea: { height: 100, paddingTop: 12, textAlignVertical: "top" },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  chip: { minHeight: 34, paddingHorizontal: 12, borderRadius: 14, backgroundColor: '#edf3f9', borderWidth: 1, borderColor: '#d6e1ec', justifyContent: "center" },
  chipActive: { backgroundColor: '#28b900', borderColor: theme.accent },
  chipText: { fontSize: 12, fontWeight: "800", color: '#4c5f75', fontFamily: 'CeraRoundProDEMO-Black', letterSpacing: 0.1 },
  chipTextActive: { color: "#FFF" },
  segmentWrap: { flexDirection: "row", backgroundColor: '#edf3f9', borderRadius: 18, padding: 4, borderWidth: 1, borderColor: '#d6e1ec' },
  segment: { flex: 1, height: 40, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  segmentActive: { backgroundColor: '#28b900' },
  segmentText: { fontSize: 12, fontWeight: "800", color: '#4c5f75', fontFamily: 'CeraRoundProDEMO-Black', letterSpacing: 0.1 },
  segmentTextActive: { color: "#FFF" },
  daysGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  iconPickerButton: { height: 64, borderRadius: 18, backgroundColor: '#f7fbff', borderWidth: 1, borderColor: '#d6e4f2', flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14 },
  iconPickerButtonLeft: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  iconPickerPreview: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#eaf4ff', borderWidth: 1, borderColor: '#d2e3f5', alignItems: "center", justifyContent: "center" },
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

  // Notification Styles
  notificationWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FDE6E3',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  notificationWarningText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#EF6B6B',
    flex: 1,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  switchLabel: {
    fontSize: 13,
    fontWeight: '900',
    color: theme.text2,
    marginBottom: 2,
  },
  switchHint: {
    fontSize: 12,
    color: theme.muted,
    fontWeight: '700',
    marginTop: 2,
  },
  switchTextWrap: {
    flex: 1,
    paddingRight: 12,
  },
  goalTimePickerButton: {
    marginTop: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    paddingTop: 14,
  },
  timePickerLabel: {
    fontSize: 13,
    fontWeight: '900',
    color: theme.text2,
  },
  timeDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#f7fafc',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  timeText: {
    fontSize: 16,
    fontWeight: '900',
    color: theme.accent,
  },
  unsavedIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFF3E0',
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
  },
  unsavedText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#F39C12',
    flex: 1,
  },
  goalTimeModalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 24,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: theme.text,
  },
  timePickerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 20,
    height: 200,
  },
  timeColumn: {
    flex: 1,
    alignItems: 'center',
  },
  timeLabel: {
    fontSize: 12,
    fontWeight: '900',
    color: theme.text2,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  hourScroll: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: '#f7fafc',
    paddingVertical: 8,
  },
  minuteScroll: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: '#f7fafc',
    paddingVertical: 8,
  },
  hourOption: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  minuteOption: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  selectedHour: {
    backgroundColor: theme.accent,
    borderRadius: 8,
  },
  selectedMinute: {
    backgroundColor: theme.accent,
    borderRadius: 8,
  },
  hourOptionText: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.text2,
  },
  minuteOptionText: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.text2,
  },
  selectedHourText: {
    color: '#fff',
    fontWeight: '900',
  },
  selectedMinuteText: {
    color: '#fff',
    fontWeight: '900',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    backgroundColor: '#f0f0f0',
  },
  confirmButton: {
    backgroundColor: theme.accent,
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '800',
    color: theme.text,
  },
  confirmButtonText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#fff',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
});