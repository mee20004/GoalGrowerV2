// Utility to clamp a number between min and max
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
// screens/AddGoalScreen.js
import React, { useCallback, useEffect, useMemo, useRef, useState, memo } from "react";
import { useFonts } from 'expo-font';
import {
    ActivityIndicator,
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  LayoutAnimation,
  KeyboardAvoidingView,
  Platform,
  Alert,
  UIManager,
  findNodeHandle,
  ScrollView,
  FlatList,
  Switch,
  Modal,
  Keyboard,
  Animated,
  Easing,
  Image,
  BackHandler,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import * as solidIcons from '@fortawesome/free-solid-svg-icons';
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Page from "../components/Page";
import theme, { useTheme } from "../theme";
import { useGoals, fromKey } from "../components/GoalsStore";
import { PLANT_ASSETS } from "../constants/PlantAssets";
import { POT_ASSETS } from "../constants/PotAssets";
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { setAddGoalDirty } from '../utils/addGoalGuard';
import SwipeCalendar from '../components/SwipeCalendar';
import { formatISOToDisplay, parseDisplayToISO, getDateFormatSync, formatPartialDisplay, formatPartialFromDigits, getWeekStartSync } from '../utils/dateFormat';

// FIREBASE IMPORTS
import { collection, addDoc, serverTimestamp, onSnapshot, query, where, doc, setDoc, getDoc } from "firebase/firestore";
import { auth, db } from "../firebaseConfig";

// --- 1. FONT AWESOME ICONS ---
// Dynamically get all free solid icons
const FONT_AWESOME_ICONS = Object.entries(solidIcons)
  .filter(([key, value]) => key.startsWith('fa') && value.iconName)
  .reduce((acc, [key, value]) => {
    acc[value.iconName] = value;
    return acc;
  }, {});
const pickerIconNames = Object.keys(FONT_AWESOME_ICONS);
const ICON_NAME_SET = new Set(pickerIconNames);
const dedupeIcons = (icons) => [...new Set(icons)];
const FEATURED_ICONS = pickerIconNames.slice(0, 10);

function GoalIcon({ name, size, color }) {
  const iconDef = FONT_AWESOME_ICONS[name] || FONT_AWESOME_ICONS['star'];
  return <FontAwesomeIcon icon={iconDef} size={size} color={color} />;
}

const triggerSelectionHaptic = () => {
  Haptics.selectionAsync().catch(() => {});
};

const triggerButtonHaptic = () => {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
};

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

const getScheduleDays = () => {
  const weekStart = getWeekStartSync();
  return [...DAYS.slice(weekStart), ...DAYS.slice(0, weekStart)];
};

function Chip({ label, active, onPress, variant = "default", accent }) {
  const isFilter = variant === "filter";

  return (
    <Pressable
      onPress={() => {
        triggerSelectionHaptic();
        onPress?.();
      }}
      style={[
        styles.chip,
        isFilter && styles.filterStyleChip,
        active && [styles.chipActive, { backgroundColor: accent, borderColor: accent }],
        active && isFilter && [styles.filterStyleChipActive, { backgroundColor: accent, borderColor: accent }],
      ]}
    >
      <Text
        style={[
          styles.chipText,
          isFilter && styles.filterStyleChipText,
          active && styles.chipTextActive,
          active && isFilter && styles.filterStyleChipTextActive,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function Segmented({ left, right, value, onChange, accent }) {
  return (
    <View style={styles.segmentWrap}>
      <Pressable
        onPress={() => {
          triggerSelectionHaptic();
          onChange(left.value);
        }}
        style={[styles.segment, value === left.value && [styles.segmentActive, { backgroundColor: accent, borderColor: accent }]]}
      >
        <Text style={[styles.segmentText, value === left.value && styles.segmentTextActive]}>{left.label}</Text>
      </Pressable>
      <Pressable
        onPress={() => {
          triggerSelectionHaptic();
          onChange(right.value);
        }}
        style={[styles.segment, value === right.value && [styles.segmentActive, { backgroundColor: accent, borderColor: accent }]]}
      >
        <Text style={[styles.segmentText, value === right.value && styles.segmentTextActive]}>{right.label}</Text>
      </Pressable>
    </View>
  );
}

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
    onPress={() => {
      triggerSelectionHaptic();
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

const ASSET_CAROUSEL_ITEM_SIZE = 76;


// --- Move CenteredAssetCarousel to top level to avoid hook order issues ---
const CenteredAssetCarousel = memo(function CenteredAssetCarousel({
  carouselKey,
  title,
  data,
  selectedIndex,
  onSelectIndex,
  renderPreview,
  itemSize = ASSET_CAROUSEL_ITEM_SIZE,
  showTitle = true,
  showCenterRing = true,
  sectionStyle,
  wrapStyle,
  itemStyle,
  activeItemStyle,
}) {
  const listRef = useRef(null);
  const [carouselWidth, setCarouselWidth] = useState(0);
  const isMomentumScrollingRef = useRef(false);
  const lastOffsetRef = useRef(0);
  const selectedIndexRef = useRef(selectedIndex);

  const sidePadding = Math.max(0, (carouselWidth - itemSize) / 2);

  useEffect(() => {
    selectedIndexRef.current = selectedIndex;
  }, [selectedIndex]);

  const settleToNearestItem = (offsetX, animateToCenter = false) => {
    const nextIndex = Math.round(offsetX / itemSize);
    const safeIndex = Math.max(0, Math.min(data.length - 1, nextIndex));
    if (safeIndex !== selectedIndexRef.current) {
      triggerSelectionHaptic();
      onSelectIndex(safeIndex);
    }
    listRef.current?.scrollToOffset({
      offset: safeIndex * itemSize,
      animated: animateToCenter,
    });
  };

  useEffect(() => {
    if (!listRef.current || !carouselWidth || !data.length) return;
    listRef.current.scrollToOffset({
      offset: Math.max(0, Math.min(data.length - 1, selectedIndex)) * itemSize,
      animated: false,
    });
  }, [carouselWidth, data.length, itemSize, selectedIndex]);

  if (!data.length) return null;

  return (
    <View style={[styles.assetCarouselSection, sectionStyle]}>
      {showTitle ? <Text style={styles.assetCarouselTitle}>{title}</Text> : null}
      <View
        style={[styles.assetCarouselWrap, wrapStyle]}
        onLayout={(event) => setCarouselWidth(event.nativeEvent.layout.width)}
      >
        <FlatList
          ref={listRef}
          data={data}
          horizontal
          scrollEventThrottle={16}
          removeClippedSubviews={false}
          keyExtractor={(item, index) => `${carouselKey || title}-${item?.key || item?.species || index}`}
          showsHorizontalScrollIndicator={false}
          bounces={false}
          snapToInterval={itemSize}
          snapToAlignment="start"
          decelerationRate="normal"
          contentContainerStyle={{ paddingHorizontal: sidePadding }}
          getItemLayout={(_, index) => ({
            length: itemSize,
            offset: itemSize * index,
            index,
          })}
          renderItem={({ item, index }) => {
            const isActive = index === selectedIndex;
            return (
              <Pressable
                onPress={() => {
                  triggerSelectionHaptic();
                  onSelectIndex(index);
                  listRef.current?.scrollToOffset({
                    offset: index * itemSize,
                    animated: true,
                  });
                }}
                style={[
                  styles.assetCarouselItem,
                  itemStyle,
                  isActive && styles.assetCarouselItemActive,
                  isActive && activeItemStyle,
                ]}
              >
                {renderPreview(item, isActive)}
              </Pressable>
            );
          }}
          onScroll={(event) => {
            lastOffsetRef.current = event.nativeEvent.contentOffset.x;
          }}
          onMomentumScrollBegin={() => {
            isMomentumScrollingRef.current = true;
          }}
          onMomentumScrollEnd={(event) => {
            isMomentumScrollingRef.current = false;
            const offsetX = event.nativeEvent.contentOffset.x;
            lastOffsetRef.current = offsetX;
            settleToNearestItem(offsetX, false);
          }}
          onScrollEndDrag={(event) => {
            const offsetX = event.nativeEvent.contentOffset.x;
            lastOffsetRef.current = offsetX;
            requestAnimationFrame(() => {
              if (!isMomentumScrollingRef.current) {
                settleToNearestItem(lastOffsetRef.current, true);
              }
            });
          }}
        />
        {showCenterRing ? <View pointerEvents="none" style={[styles.assetCarouselCenterRing, { width: itemSize }]} /> : null}
      </View>
    </View>
  );
});

function measureRef(ref, cb) {
  const node = findNodeHandle(ref.current);
  if (!node) return cb(null);
  UIManager.measureInWindow(node, (x, y, width, height) => cb({ x, y, width, height }));
}

function Pill({ label, active, onPress }) {
  return (
    <Pressable
      onPress={() => {
        triggerSelectionHaptic();
        onPress?.();
      }}
      style={[styles.pill, active && styles.pillActive]}
    >
     <Text style={[styles.pillText, active && styles.pillTextActive, { fontFamily: 'CeraRoundProDEMO-Black' }]}>{label}</Text>
    </Pressable>
  );
}

function PrimaryButton({ label, onPress, disabled, style, accent }) {
  return (
    <View style={[styles.actionButtonWrap, style]}>
      <View pointerEvents="none" style={[styles.actionButtonShadow, { backgroundColor: accent }]} />
      <Pressable
        onPress={() => {
          if (disabled) return;
          triggerButtonHaptic();
          onPress?.();
        }}
        disabled={disabled}
        style={({ pressed }) => [
          styles.actionButtonFace,
          styles.actionButtonPrimary,
          { backgroundColor: accent },
          pressed && styles.actionButtonPressed,
          disabled && styles.actionButtonPrimaryDisabled,
        ]}
      >
       <Text style={[styles.actionButtonText, styles.actionButtonTextPrimary, disabled && styles.actionButtonTextDisabled, { fontFamily: 'CeraRoundProDEMO-Black' }]}>{label}</Text>
      </Pressable>
    </View>
  );
}

function GhostButton({ label, onPress, disabled, style, accent }) {
  return (
    <View style={[styles.actionButtonWrap, style]}>
      <View pointerEvents="none" style={[styles.actionButtonShadow, styles.actionButtonShadowSecondary]} />
      <Pressable
        onPress={() => {
          if (disabled) return;
          triggerButtonHaptic();
          onPress?.();
        }}
        disabled={disabled}
        style={({ pressed }) => [
          styles.actionButtonFace,
          styles.actionButtonSecondary,
          pressed && styles.actionButtonPressed,
          disabled && styles.actionButtonSecondaryDisabled,
        ]}
      >
        <Text style={[styles.actionButtonText, styles.actionButtonTextSecondary, { color: accent }, disabled && styles.actionButtonTextDisabled]}>{label}</Text>
      </Pressable>
    </View>
  );
}

function Button({ variant = "primary", label, onPress, disabled, style, accent }) {
  if (variant === "secondary") {
    return <GhostButton label={label} onPress={onPress} disabled={disabled} style={style} accent={accent} />;
  }
  return <PrimaryButton label={label} onPress={onPress} disabled={disabled} style={style} accent={accent} />;
}

function CoachMark({ visible, title, body, onClose }) {
  if (!visible) return null;
  return (
    <Modal transparent visible={visible} animationType="fade">
      <Pressable style={styles.coachOverlay} onPress={onClose}>
        <View style={styles.coachBox}>
          <Text style={styles.coachTitle}>{title}</Text>
          <Text style={styles.coachBody}>{body}</Text>
          <Pressable style={styles.coachCloseBtn} onPress={onClose}>
           <Text style={[styles.coachCloseText, { fontFamily: 'CeraRoundProDEMO-Black' }]}>Close</Text>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

function StepProgressBar({ total = 1, index = 0, accent }) {
  const progress = Math.min(1, Math.max(0, (index + 1) / Math.max(total, 1)));
  const animatedProgress = useRef(new Animated.Value(progress)).current;

  useEffect(() => {
    Animated.timing(animatedProgress, {
      toValue: progress,
      duration: 280,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [animatedProgress, progress]);

  const animatedWidth = animatedProgress.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });

  return (
    <View
      style={styles.progressBarTrack}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: total, now: index + 1 }}
    >
       <Animated.View style={[styles.progressBarFill, { width: animatedWidth, backgroundColor: accent, fontFamily: 'CeraRoundProDEMO-Black' }]} />
    </View>
  );
}

  export default function AddGoalScreen({
    navigation,
    onGoalSaved,
    onBack,
    onSkipOnboarding,
    onboardingMode = false,
  }) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  // Load the Cera Round Pro DEMO font only for this screen
  const [fontsLoaded] = useFonts({
    'CeraRoundProDEMO-Black': require('../assets/fonts/CeraRoundProDEMOBlack.otf'),
  });

  // Step state for multi-step form
  const [step, setStep] = useState(0);
  // Early return after all hooks
  if (!fontsLoaded) {
    return <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}><ActivityIndicator size="large" /></View>;
  }

  const [sharedGardenSettings, setSharedGardenSettings] = useState({
    restrictAddPeople: false,
    restrictCustomize: false,
    restrictEditPlants: false,
    ownerId: null,
  });
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const { selectedDateKey } = useGoals();
  const [isSaving, setIsSaving] = useState(false);
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [sharedGardens, setSharedGardens] = useState([]);
  const [selectedGardenId, setSelectedGardenId] = useState("personal");

  const selectedDate = fromKey(selectedDateKey);
  const selectedDay = selectedDate.getDay();
  const uid = auth.currentUser?.uid;
  const [helpOpen, setHelpOpen] = useState(false);
  const [helpCopy] = useState({ title: "Help", body: "Use this screen to define your goal details." });

  // Form State
  const [name, setName] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [selectedIcon, setSelectedIcon] = useState("target");
  const [selectedPlantSpecies, setSelectedPlantSpecies] = useState("fern");
  const [selectedPotType, setSelectedPotType] = useState("default");
  const [searchTerm, setSearchTerm] = useState("");
  const [visibleIconCount, setVisibleIconCount] = useState(120);
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
  const [completionEndDisplay, setCompletionEndDisplay] = useState("");
  const prevDigitsRef = useRef("");
  const lastKeyRef = useRef(null);
  const lastTextInputAtRef = useRef(0);
  const pendingNavigationRef = useRef(null);
  const isLeavingAfterSaveRef = useRef(false);
  const isFocused = useIsFocused();

  const promptDiscard = useCallback(() => {
  Alert.alert(
    "Leave add goal?",
    "Your goal is not saved yet. Do you want to leave and lose your progress?",
    [
      {
        text: "Keep editing",
        style: "cancel",
        onPress: () => {
          pendingNavigationRef.current = null;
        },
      },
      {
        text: "Leave",
        style: "destructive",
        onPress: () => {
          const leaveAction = pendingNavigationRef.current;
          pendingNavigationRef.current = null;

          setAddGoalDirty(false);
          isLeavingAfterSaveRef.current = true;

          if (typeof leaveAction === "function") {
            leaveAction();
          } else {
            navigation.goBack();
          }
        },
      },
    ]
  );
}, [navigation]);

  const handleInsertDigits = (insertedRaw) => {
    const now = Date.now();
    lastTextInputAtRef.current = now;
    const insertedDigits = String(insertedRaw || '').replace(/\D/g, '').slice(0, 8);

    let digitsToUse = prevDigitsRef.current || '';
    if (!insertedDigits) {
      // nothing to add
    } else if (insertedDigits.length === 1) {
      digitsToUse = (digitsToUse + insertedDigits).slice(0, 8);
    } else {
      // multi-char insertion (paste or autofill)
      // If it contains separators (likely paste), accept all digits from it
      if (/[^0-9]/.test(insertedRaw)) {
        digitsToUse = (digitsToUse + insertedDigits).slice(0, 8);
      } else {
        // likely autofill: append only the last char so user can continue typing
        digitsToUse = (digitsToUse + insertedDigits.slice(-1)).slice(0, 8);
      }
    }
    prevDigitsRef.current = digitsToUse;
    const formatted = formatPartialFromDigits(digitsToUse);
    setCompletionEndDisplay(formatted);
    const iso = parseDisplayToISO(formatted);
    if (isValidISODate(iso)) setCompletionEndDate(iso);
  };
  const [completionEndAmount, setCompletionEndAmount] = useState("");
  const [completionEndUnit, setCompletionEndUnit] = useState("times");
  const [multiUserWateringEnabled, setMultiUserWateringEnabled] = useState(false);
  const [requiredContributors, setRequiredContributors] = useState("2");
  const [calendarMonth, setCalendarMonth] = useState(toStartOfDay(new Date()));
  const [scrollViewHeight, setScrollViewHeight] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);


  // Reset form state on screen focus
        isLeavingAfterSaveRef.current = false;

        
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      setStep(0);
      setName("");
      setIsPrivate(false);
      setSelectedIcon("target");
      setSelectedPlantSpecies("fern");
      setSelectedPotType("default");
      setSearchTerm("");
      setVisibleIconCount(120);
      setType("completion");
      setTarget("1");
      setUnit("times");
      setMode("days");
      setDays([selectedDay]);
      setWhenStr("");
      setWhereStr("");
      setWhyStr("");
      setCompletionMode("none");
      setCompletionEndDate("");
      setCompletionEndAmount("");
      setCompletionEndUnit("times");
      setMultiUserWateringEnabled(false);
      setRequiredContributors("2");
      setCalendarMonth(toStartOfDay(new Date()));
      // calendarWidth and calendarPagerRef do not need reset
    });
    return unsubscribe;
  }, [navigation, selectedDay]);

  // Warn on navigation if the form has unsaved changes
  const isFormDirty = () => {
    if (isLeavingAfterSaveRef.current) return false;
    if (name.trim()) return true;
    if (isPrivate) return true;
    if (selectedIcon !== 'target') return true;
    if (selectedPlantSpecies !== 'fern') return true;
    if (selectedPotType !== 'default') return true;
    if (type !== 'completion') return true;
    if (target && target !== '1') return true;
    if (unit && unit !== 'times') return true;
    if (mode !== 'days' && !(mode === 'days' && days.length === 1 && days[0] === selectedDay)) return mode !== 'days';
    if (whenStr.trim()) return true;
    if (whereStr.trim()) return true;
    if (whyStr.trim()) return true;
    if (completionMode !== 'none') return true;
    if (completionEndDate.trim()) return true;
    if (completionEndAmount.trim()) return true;
    if (completionEndUnit && completionEndUnit !== 'times') return true;
    if (multiUserWateringEnabled) return true;
    if (requiredContributors && requiredContributors !== '2') return true;
    if (selectedGardenId && selectedGardenId !== 'personal') return true;
    return false;
  };

  useEffect(() => {
    if (!isFocused) {
      setAddGoalDirty(false);
      return;
    }
    setAddGoalDirty(isFormDirty());
    return () => setAddGoalDirty(false);
  }, [
    isFocused,
    name,
    isPrivate,
    selectedIcon,
    selectedPlantSpecies,
    selectedPotType,
    type,
    target,
    unit,
    mode,
    days,
    whenStr,
    whereStr,
    whyStr,
    completionMode,
    completionEndDate,
    completionEndAmount,
    completionEndUnit,
    multiUserWateringEnabled,
    requiredContributors,
    selectedGardenId,
    selectedDay,
  ]);

  useFocusEffect(
  useCallback(() => {
    const blockIfDirty = (leaveAction) => {
      if (!isFormDirty()) return false;

      pendingNavigationRef.current = leaveAction;
      promptDiscard();
      return true;
    };

    const beforeRemoveSub = navigation.addListener("beforeRemove", (e) => {
      if (!isFormDirty()) return;

      e.preventDefault();
      blockIfDirty(() => navigation.dispatch(e.data.action));
    });

    const parentSubs = [];
    let parent = navigation.getParent?.();

    while (parent) {
      const currentParent = parent;

      if (typeof currentParent.addListener === "function") {
        parentSubs.push(
          currentParent.addListener("tabPress", (e) => {
            if (!isFormDirty()) return;

            e.preventDefault();

            const state = currentParent.getState?.();
            const route = state?.routes?.find((r) => r.key === e.target);

            blockIfDirty(() => {
              if (route?.name) currentParent.navigate(route.name);
            });
          })
        );

        parentSubs.push(
          currentParent.addListener("drawerItemPress", (e) => {
            if (!isFormDirty()) return;

            e.preventDefault();

            const state = currentParent.getState?.();
            const route = state?.routes?.find((r) => r.key === e.target);

            blockIfDirty(() => {
              if (route?.name) currentParent.navigate(route.name);
            });
          })
        );
      }

      parent = currentParent.getParent?.();
    }

    const androidBackSub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (!isFormDirty()) return false;

      blockIfDirty(() => navigation.goBack());
      return true;
    });

    return () => {
      beforeRemoveSub?.();
      parentSubs.forEach((sub) => sub?.());
      androidBackSub?.remove();
    };
  }, [
    navigation,
    promptDiscard,
    name,
    isPrivate,
    selectedIcon,
    selectedPlantSpecies,
    selectedPotType,
    type,
    target,
    unit,
    mode,
    days,
    whenStr,
    whereStr,
    whyStr,
    completionMode,
    completionEndDate,
    completionEndAmount,
    completionEndUnit,
    multiUserWateringEnabled,
    requiredContributors,
    selectedGardenId,
  ])
);

  // Filtered Icons Logic
  // Ensure FEATURED_ICONS are not repeated if already in pickerIconNames
  const allSelectableIcons = useMemo(() => {
    const uniqueFeatured = FEATURED_ICONS.filter((icon) => !pickerIconNames.includes(icon));
    return dedupeIcons([...uniqueFeatured, ...pickerIconNames]);
  }, []);

  const filteredIcons = useMemo(() => {
    const cleanSearch = searchTerm.toLowerCase().trim();
    if (!cleanSearch) {
      return allSelectableIcons.slice(0, visibleIconCount);
    }

    const directMatches = pickerIconNames.filter((name) => name.includes(cleanSearch));
    return dedupeIcons(directMatches).slice(0, 180);
  }, [allSelectableIcons, searchTerm, visibleIconCount]);

  const hasMoreIcons = !searchTerm.trim() && filteredIcons.length < allSelectableIcons.length;

  const scheduleDays = useMemo(() => {
    if (mode === "everyday") return [0, 1, 2, 3, 4, 5, 6];
    if (mode === "weekdays") return [1, 2, 3, 4, 5];
    return days.length ? days : [selectedDay];
  }, [mode, days, selectedDay]);

  const stepLabels = ["Details", "Plant & Pot", "Icon", "Tracking", "Schedule", "Completion", "Review"];

  const plantOptions = useMemo(() => {
    const validSpecies = Object.keys(PLANT_ASSETS || {}).filter((species) => {
      return (
        PLANT_ASSETS?.[species]?.stage4?.alive ||
        PLANT_ASSETS?.[species]?.stage3?.alive ||
        PLANT_ASSETS?.[species]?.stage2?.alive ||
        PLANT_ASSETS?.[species]?.stage1?.alive
      );
    });

    return validSpecies.map((species) => ({
      species,
      label: species.charAt(0).toUpperCase() + species.slice(1),
      preview:
        PLANT_ASSETS?.[species]?.stage4?.alive ||
        PLANT_ASSETS?.[species]?.stage3?.alive ||
        PLANT_ASSETS?.[species]?.stage2?.alive ||
        PLANT_ASSETS?.[species]?.stage1?.alive,
    }));
  }, []);

  const selectedPlantIndex = useMemo(
    () => Math.max(0, plantOptions.findIndex((option) => option.species === selectedPlantSpecies)),
    [plantOptions, selectedPlantSpecies]
  );

  const selectedPlantPreview = useMemo(
    () => plantOptions[selectedPlantIndex]?.preview || plantOptions[0]?.preview || null,
    [plantOptions, selectedPlantIndex]
  );

  const potOptions = useMemo(() => {
    return Object.entries(POT_ASSETS || {})
      .map(([key, preview]) => ({
        key,
        label: key.charAt(0).toUpperCase() + key.slice(1),
        preview,
      }))
      .filter((option) => !!option.preview);
  }, []);

  const selectedPotIndex = useMemo(
    () => Math.max(0, potOptions.findIndex((option) => option.key === selectedPotType)),
    [potOptions, selectedPotType]
  );

  const selectPlantByIndex = (index) => {
    const option = plantOptions[index];
    if (!option) return;
    setSelectedPlantSpecies(option.species);
  };

  const selectPotByIndex = (index) => {
    const option = potOptions[index];
    if (!option) return;
    setSelectedPotType(option.key);
  };

  const measurableForType = useMemo(() => {
    if (type === "quantity") {
      return { target: clampNum(target, 1, MAX_QUANTITY_TARGET), unit: unit.trim() || "times" };
    }
    return { target: 1, unit: "times" };
  }, [type, target, unit]);

  const frequencyLabel = useMemo(() => {
    if (type === "flex") return "By deadline";
    if (mode === "everyday") return "Everyday";
    if (mode === "weekdays") return "Weekdays";
    const map = { 0: "S", 1: "M", 2: "T", 3: "W", 4: "Th", 5: "F", 6: "Sa" };
    return [...days].sort((a, b) => a - b).map((d) => map[d]).join("");
  }, [type, mode, days]);

  const typeTitle = useMemo(() => {
    if (type === "quantity") return "Quantity Goal";
    if (type === "completion") return "Goal";
    return "Goal";
  }, [type]);

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
      setSettingsLoaded(false);
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
        // Fetch settings for selected garden
        const selected = docs.find((g) => g.id === selectedGardenId) || docs[0];
        if (selected) {
          getDoc(doc(db, "sharedGardens", selected.id)).then((snap) => {
            const data = snap.data() || {};
            setSharedGardenSettings({
              restrictAddPeople: !!data.restrictAddPeople,
              restrictCustomize: !!data.restrictCustomize,
              restrictEditPlants: !!data.restrictEditPlants,
              ownerId: data.ownerId || null,
            });
            setSettingsLoaded(true);
          });
        } else {
          setSharedGardenSettings({ restrictAddPeople: false, restrictCustomize: false, restrictEditPlants: false, ownerId: null });
          setSettingsLoaded(true);
        }
      },
      () => {
        setSharedGardens([]);
        setSelectedGardenId("personal");
        setSettingsLoaded(false);
      }
    );

    return () => unsubscribe();
  }, [uid, selectedGardenId]);

  const selectedGardenName = useMemo(() => {
    if (selectedGardenId === "personal") return "Personal Garden";
    return sharedGardens.find((garden) => garden.id === selectedGardenId)?.name || "Shared Garden";
  }, [selectedGardenId, sharedGardens]);

  const calendarCells = useMemo(() => buildMonthGrid(calendarMonth), [calendarMonth]);

  useEffect(() => {
    if (isValidISODate(completionEndDate.trim())) {
      const [year, month] = completionEndDate.trim().split("-").map(Number);
      setCalendarMonth(new Date(year, month - 1, 1));
    }
    // keep displayed input synced to ISO and chosen format
    setCompletionEndDisplay(formatISOToDisplay(completionEndDate));
  }, [completionEndDate]);

  const changeCompletionMode = (nextMode) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setCompletionMode(nextMode);
  };

  const getScheduleModeFromDays = (dayList) => {
    const uniqueDays = [...new Set(dayList)].sort((a, b) => a - b);
    if (uniqueDays.length === 7) return 'everyday';
    const weekdays = [1, 2, 3, 4, 5];
    if (uniqueDays.length === 5 && weekdays.every((day, idx) => day === uniqueDays[idx])) return 'weekdays';
    return 'days';
  };

  const handleDayPress = (d) => {
    // Behavior:
    // - In 'everyday': pressing a day deselects it and switches to custom with all days except that one
    // - In 'weekdays': pressing a weekend day adds it and switches to custom; pressing a weekday removes it and switches to custom
    // - In 'days': toggle the day and auto-upgrade to weekdays/everyday when the set matches
    triggerSelectionHaptic();
    if (mode === 'everyday') {
      const all = [0,1,2,3,4,5,6];
      const newDays = all.filter((x) => x !== d);
      const nextMode = getScheduleModeFromDays(newDays);
      setDays(newDays);
      setMode(nextMode);
      return;
    }
    if (mode === 'weekdays') {
      const weekdays = [1,2,3,4,5];
      let newDays;
      if (d >= 1 && d <= 5) {
        newDays = weekdays.filter((x) => x !== d);
      } else {
        newDays = [...weekdays, d].sort();
      }
      const nextMode = getScheduleModeFromDays(newDays);
      setDays(newDays);
      setMode(nextMode);
      return;
    }
    // custom
    setDays((prev) => {
      const newDays = prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d];
      const nextMode = getScheduleModeFromDays(newDays);
      setMode(nextMode);
      return newDays;
    });
  };

  const formError = useMemo(() => {
    if (name.trim().length < 3) return "Give it a short name (at least 3 characters).";
    if (!selectedIcon) return "Please select an icon.";
    if (type === "quantity" && (!(Number(target) > 0) || unit.trim().length < 1)) return "Quantity needs a number + unit.";
    if (type === "quantity" && Number(target) > MAX_QUANTITY_TARGET) return `Quantity max is ${MAX_QUANTITY_TARGET}.`;
    if ((mode === "days" && !days.length) || !scheduleDays.length) return "Pick at least one day.";
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
  const shouldEnableScroll = contentHeight > scrollViewHeight + 8;

  const renderStepContent = () => {
    if (step === 0) {
      return (
        <>
          <View style={[styles.card, styles.nameSectionCard]}>
          <View style={styles.nameInlineRow}>
            <Text style={styles.nameInlineLabel}>Name:</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholderTextColor={theme.muted2}
              style={[styles.input, styles.nameInlineInput]}
            />
          </View>
          </View>

          <View style={styles.sectionGap} />

          <View style={[styles.card, styles.privateSectionCard]}>
            <View style={[styles.switchRow, styles.privateSectionTopRow]}>
              <Text style={styles.switchLabel}>Private goal</Text>
              <Switch
                value={isPrivate}
                onValueChange={(value) => {
                  triggerSelectionHaptic();
                  setIsPrivate(value);
                }}
                trackColor={{ false: theme.outline, true: theme.accent }}
              />
            </View>
            <View style={styles.privateSectionGap} />
            <Text style={styles.sectionLabel}>Garden</Text>
            <View style={[styles.chipWrap, styles.gardenChipWrap]}>
              <Chip
                label="Personal"
                variant="filter"
                active={selectedGardenId === "personal"}
                accent={theme.accent}
                onPress={() => setSelectedGardenId("personal")}
              />
              {sharedGardens.map((garden) => (
                <Chip
                  key={garden.id}
                  label={garden.name || "Shared Garden"}
                  variant="filter"
                  active={selectedGardenId === garden.id}
                  accent={theme.accent}
                  onPress={() => setSelectedGardenId(garden.id)}
                />
              ))}
            </View>
            {selectedGardenId !== "personal" && (
              <View style={[styles.switchRow, styles.privateSectionRow]}>
                <Text style={styles.switchLabel}>Multi-user watering</Text>
                <Switch
                  value={multiUserWateringEnabled}
                  onValueChange={(value) => {
                    triggerSelectionHaptic();
                    setMultiUserWateringEnabled(value);
                  }}
                  trackColor={{ false: theme.outline, true: theme.accent }}
                />
              </View>
            )}
            {selectedGardenId !== "personal" && multiUserWateringEnabled && (
              <View style={[styles.contributorRow, styles.privateSectionRow]}>
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
        </>
      );
    }
    if (step === 1) {
      return (
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>Plant and Pot</Text>

          <View style={styles.livePreviewCard}>
            <CenteredAssetCarousel
              carouselKey="visible-plant-options"
              title="Plant options"
              data={plantOptions}
              selectedIndex={selectedPlantIndex}
              onSelectIndex={selectPlantByIndex}
              itemSize={92}
              showTitle={false}
              showCenterRing={false}
              sectionStyle={styles.plantOptionsSection}
              wrapStyle={styles.plantOptionsWrap}
              itemStyle={styles.plantOptionsItem}
              activeItemStyle={styles.plantOptionsItemActive}
              renderPreview={(item, isActive) => (
                <Image
                  source={item.preview}
                  resizeMode="contain"
                  style={[styles.plantOptionsImage, isActive && styles.plantOptionsImageActive]}
                />
              )}
            />

            <CenteredAssetCarousel
              carouselKey="visible-pot-options"
              title="Pot options"
              data={potOptions}
              selectedIndex={selectedPotIndex}
              onSelectIndex={selectPotByIndex}
              itemSize={92}
              showTitle={false}
              showCenterRing={false}
              sectionStyle={styles.potOptionsSection}
              wrapStyle={styles.potOptionsWrap}
              itemStyle={styles.potOptionsItem}
              activeItemStyle={styles.potOptionsItemActive}
              renderPreview={(item, isActive) => (
                <Image
                  source={item.preview}
                  resizeMode="contain"
                  style={[styles.potOptionsImage, isActive && styles.potOptionsImageActive]}
                />
              )}
            />
          </View>
        </View>
      );
    }
    if (step === 2) {
      return (
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>Icon</Text>
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
              />
              {!!searchTerm && (
                <Pressable
                  onPress={() => {
                    triggerSelectionHaptic();
                    setSearchTerm("");
                  }}
                  hitSlop={8}
                >
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
                  onSelect={setSelectedIcon}
                />
              ))}
            </View>
            {!searchTerm.trim() && (
              <Text style={styles.iconLoadHint}>Showing popular icons first for faster loading.</Text>
            )}
            {hasMoreIcons && (
              <Pressable
                style={styles.loadMoreIconsBtn}
                onPress={() => {
                  triggerSelectionHaptic();
                  setVisibleIconCount((prev) => prev + 120);
                }}
              >
                <Text style={styles.loadMoreIconsText}>Show more icons</Text>
              </Pressable>
            )}
          </ScrollView>
        </View>
      );
    }
    if (step === 3) {
      return (
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>Tracking</Text>
          <Segmented left={{ label: "Checkmark", value: "completion" }} right={{ label: "Quantity", value: "quantity" }} value={type} onChange={setType} accent={theme.accent} />
          {type === "quantity" && (
            <View style={styles.row}>
              <TextInput value={target} onChangeText={(value) => setTarget(normalizeQuantityTargetInput(value))} keyboardType="numeric" style={[styles.input, { flex: 1, marginRight: 10 }]} placeholder="Target (max 6)" placeholderTextColor={theme.muted2} />
              <TextInput value={unit} onChangeText={setUnit} placeholder="minutes" style={[styles.input, { flex: 1 }]} />
            </View>
          )}
        </View>
      );
    }
    if (step === 4) {
      return (
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>Schedule</Text>
          <View style={styles.row}>
            <Chip
              label="Every day"
              variant="filter"
              active={mode === "everyday"}
              accent={theme.accent}
              onPress={() => {
                setMode("everyday");
                setDays([0,1,2,3,4,5,6]);
              }}
            />
            <Chip
              label="Weekdays"
              variant="filter"
              active={mode === "weekdays"}
              accent={theme.accent}
              onPress={() => {
                setMode("weekdays");
                setDays([1,2,3,4,5]);
              }}
            />
            <Chip label="Custom" variant="filter" active={mode === "days"} accent={theme.accent} onPress={() => setMode("days")} />
          </View>
          <View style={styles.daysGrid}>
            {getScheduleDays().map((d) => {
              const isSelected = mode === 'everyday' ? true : mode === 'weekdays' ? (d.day >= 1 && d.day <= 5) : days.includes(d.day);
              return (
                <Pressable
                  key={d.label}
                  onPress={() => handleDayPress(d.day)}
                  style={[styles.dayPill, isSelected && [styles.dayPillActive, { backgroundColor: theme.accent, borderColor: theme.accent }]]}
                >
                  <Text style={[styles.dayText, isSelected && styles.dayTextActive]}>{d.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      );
    }
    if (step === 5) {
      return (
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>Goal completion</Text>
          <View style={styles.completionModeRow}>
            <Chip label="No end" variant="filter" accent={theme.accent} active={completionMode === "none"} onPress={() => changeCompletionMode("none")} />
            <Chip label="End date" variant="filter" accent={theme.accent} active={completionMode === "date"} onPress={() => changeCompletionMode("date")} />
            <Chip label="End amount" variant="filter" accent={theme.accent} active={completionMode === "amount"} onPress={() => changeCompletionMode("amount")} />
          </View>
          {completionMode === "date" && (
            <>
              <TextInput
                value={completionEndDisplay}
                onKeyPress={({ nativeEvent }) => {
                  const k = nativeEvent && nativeEvent.key;
                  if (/^\d$/.test(k)) lastKeyRef.current = k;
                  else lastKeyRef.current = null;
                }}
                onTextInput={(e) => {
                  const inserted = e?.nativeEvent?.text || '';
                  if (!inserted) return;
                  handleInsertDigits(inserted);
                }}
                onChangeText={(text) => {
                  // Fallback for platforms that may not fire onTextInput consistently (or for paste)
                  const timeSince = Date.now() - (lastTextInputAtRef.current || 0);
                  // If an onTextInput was just handled, ignore this onChangeText to avoid double-processing
                  if (timeSince < 30) return;
                  // Otherwise, reconstruct from full text
                  const digits = String(text).replace(/\D/g, '').slice(0, 8);
                  const prev = prevDigitsRef.current || '';
                  let digitsToUse = digits;
                  // If a large auto-insert happened but the previous buffer was very short,
                  // assume autofill and only append the last digit so the user can continue typing.
                  if (digits.length - prev.length > 1 && prev.length < 2) {
                    digitsToUse = (prev + digits.slice(-1)).slice(0, 8);
                  }
                  prevDigitsRef.current = digitsToUse;
                  const formatted = formatPartialFromDigits(digitsToUse);
                  setCompletionEndDisplay(formatted);
                  const iso = parseDisplayToISO(formatted);
                  if (isValidISODate(iso)) setCompletionEndDate(iso);
                }}
                onBlur={() => setCompletionEndDisplay(formatISOToDisplay(completionEndDate))}
                placeholder={getDateFormatSync()}
                keyboardType={Platform.OS === 'ios' ? 'number-pad' : 'numeric'}
                autoCorrect={false}
                autoComplete={"off"}
                spellCheck={false}
                textContentType="none"
                importantForAutofill="no"
                maxLength={10}
                style={[styles.input, styles.completionInput]}
              />
              {completionDateMeta && completionDateMeta.daysLeft < 0 && (
                <View style={[styles.errorInline, { marginTop: 8 }]}>
                  <Text style={styles.errorInlineText}>End date cannot be in the past.</Text>
                </View>
              )}
              <View style={{ marginTop: 8 }}>
                <SwipeCalendar
                  month={calendarMonth}
                  setMonth={setCalendarMonth}
                  selectedDate={completionEndDate}
                  onSelectDate={setCompletionEndDate}
                />
              </View>
              {!!completionDateMeta && <Text style={styles.helperText}>Ends {completionDateMeta.readable}</Text>}
            </>
          )}
          {completionMode === "amount" && (
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
      );
    }
    return (
      <View style={styles.card}>
        <Text style={styles.sectionLabel}>Review</Text>
        <View style={styles.reviewRow}><Text style={styles.reviewLabel}>Name</Text><Text style={styles.reviewValue}>{name || "—"}</Text></View>
        <View style={styles.reviewRow}><Text style={styles.reviewLabel}>Schedule</Text><Text style={styles.reviewValue}>{frequencyLabel}</Text></View>
        <View style={styles.reviewRow}><Text style={styles.reviewLabel}>Garden</Text><Text style={styles.reviewValue}>{selectedGardenName}</Text></View>
      </View>
    );
  };

  const goNextStep = () => setStep((prev) => Math.min(prev + 1, stepLabels.length - 1));
  const goBackStep = () => {
    if (step === 0) {
      if (typeof onBack === "function") {
        onBack();
      } else {
        navigation.goBack();
      }
    } else {
      setStep((prev) => Math.max(prev - 1, 0));
    }
  };

  const isOwner = selectedGardenId !== "personal" && sharedGardenSettings.ownerId && auth.currentUser && sharedGardenSettings.ownerId === auth.currentUser.uid;
  const canEditPlants = selectedGardenId === "personal" || isOwner || !sharedGardenSettings.restrictEditPlants;

   const save = async () => {
    if (!auth.currentUser || isSaving || !canSave) return;
    if (selectedGardenId !== "personal" && !canEditPlants) {
      Alert.alert("Restricted", "Only the owner can add goals to this shared garden.");
      return;
    }
    
    setIsSaving(true);
    try {
      const goalData = {
        name: name.trim(),
        category: "Other",
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
        healthLevel: 5,
        species: selectedPlantSpecies,
        plantSpecies: selectedPlantSpecies,
        potType: selectedPotType,
        potStyle: selectedPotType,
      };

      const userGoalsRef = collection(db, "users", auth.currentUser.uid, "goals");
      const docRef = await addDoc(userGoalsRef, goalData);

      // Initialize health log for today (like EnterScreen)
      try {
        const { logHealthForDay } = require('../utils/logHealthForDay');
        const todayKey = require('../components/GoalsStore').toKey(new Date());
        await logHealthForDay(auth.currentUser.uid, docRef.id, todayKey, 4, false, false);
      } catch (err) {
        console.warn('[AddGoalScreen] Failed to initialize health log for new goal:', err);
      }

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

      if (typeof onGoalSaved === "function") {
        onGoalSaved(docRef.id);
      } else {
        navigation.navigate("Goals", { screen: "Goal", params: { goalId: docRef.id, source: "goals" } });
      }
    } catch (error) {
      Alert.alert("Error", "Could not save your goal.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Page>
      <View style={styles.screenWrap}>
        <KeyboardAvoidingView
          style={styles.keyboardArea}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
        >
          <View style={styles.headerWrapper}>
            <View style={styles.headerContent}>
              <View style={styles.headerRow}>
                <Text style={styles.headerTitle}>Add Goal</Text>
              </View>
            </View>
          </View>

          <ScrollView
            style={styles.contentArea}
            contentContainerStyle={[styles.formScrollContent, { paddingBottom: Math.max(24, insets.bottom + 240) }]}
            keyboardShouldPersistTaps="handled"
            onScroll={() => Keyboard.dismiss()}
            onLayout={(event) => setScrollViewHeight(event.nativeEvent.layout.height)}
            onContentSizeChange={(_, height) => setContentHeight(height)}
            scrollEnabled={shouldEnableScroll}
            bounces={shouldEnableScroll}
            alwaysBounceVertical={shouldEnableScroll}
          >
            {renderStepContent()}

            {!!formError && !(completionDateMeta && completionDateMeta.daysLeft < 0) && (
              <View style={styles.errorInline}>
                <Text style={styles.errorInlineText}>{formError}</Text>
              </View>
            )}
          </ScrollView>
        </KeyboardAvoidingView>

        <View
          style={[
            styles.stepFooterRow,
            onboardingMode && styles.stepFooterRowOnboarding,
            onboardingMode && { paddingBottom: insets.bottom + 8 },
          ]}
        >
          {onboardingMode && typeof onSkipOnboarding === "function" && (
            <View style={styles.onboardingSkipRow}>
              <View style={styles.onboardingSkipButtonWrap}>
                <View
                  pointerEvents="none"
                  style={[
                    styles.onboardingSkipButtonShadow,
                    styles.onboardingSkipButtonShadowColor,
                  ]}
                />
                <Pressable
                  onPress={onSkipOnboarding}
                  disabled={isSaving}
                  style={({ pressed }) => [
                    styles.onboardingSkipButtonFace,
                    styles.onboardingSkipButtonFaceColor,
                    isSaving && styles.onboardingSkipButtonFaceDisabled,
                    pressed && !isSaving && styles.actionButtonPressed,
                  ]}
                >
                  <Text
                    style={[
                      styles.onboardingSkipBtnText,
                      isSaving && styles.onboardingSkipBtnTextDisabled,
                    ]}
                  >
                    Skip
                  </Text>
                </Pressable>
              </View>
            </View>
          )}

          <View
            style={[
              styles.footerProgressWrap,
              onboardingMode && styles.footerProgressWrapOnboarding,
            ]}
          >
            <StepProgressBar
              total={stepLabels.length}
              index={step}
              accent={theme.accent}
            />
          </View>
          <View style={[styles.stepButtonGroup, onboardingMode && styles.stepButtonGroupOnboarding]}>
            <Button
              variant="secondary"
              label="Back"
              onPress={goBackStep}
              disabled={isSaving}
              style={styles.stepButton}
              accent={theme.accent}
            />
            {step < stepLabels.length - 1 ? (
              <Button
                variant="primary"
                label="Next"
                onPress={goNextStep}
                disabled={isSaving || (step === 0 && name.trim().length < 3)}
                style={styles.stepButton}
                accent={theme.accent}
              />
            ) : (
              <Button variant="primary" accent={theme.accent} label={isSaving ? "Saving..." : "Save Goal"} onPress={save} disabled={isSaving || !canSave || (selectedGardenId !== "personal" && !canEditPlants)} style={styles.stepButton} />
            )}
          </View>
        </View>

        {/* Icon picker modal removed; now inline in step 1 */}

        {/* Help overlay */}
        <CoachMark visible={helpOpen} title={helpCopy.title} body={helpCopy.body} onClose={() => setHelpOpen(false)} />
      </View>
    </Page>
  );
}

const styles = StyleSheet.create({
  screenWrap: { flex: 1 },
  keyboardArea: { flex: 1 },
  actionButtonWrap: {
    flex: 1,
    height: 56,
    position: "relative",
  },
  actionButtonShadow: {
    position: "absolute",
    top: 4,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 20,
  },
  actionButtonShadowPrimary: { backgroundColor: "#c3cfdb" },
  actionButtonShadowSecondary: { backgroundColor: "#c3cfdb" },
  actionButtonFace: {
    height: 52,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  actionButtonPrimary: { backgroundColor: theme.accent },
  actionButtonSecondary: { backgroundColor: "#e7edf5" },
  actionButtonPrimaryDisabled: { backgroundColor: "#c3cfdb" },
  actionButtonSecondaryDisabled: { backgroundColor: "#dde3ea" },
  actionButtonPressed: { transform: [{ translateY: 4 }] },
  actionButtonText: { fontSize: 15, fontFamily: 'CeraRoundProDEMO-Black' },
  actionButtonTextPrimary: { color: "#FFFFFF", fontFamily: 'CeraRoundProDEMO-Black' },
  actionButtonTextSecondary: { color: theme.accent, fontFamily: 'CeraRoundProDEMO-Black' },
  actionButtonTextDisabled: { color: "#f7fbf3", fontFamily: 'CeraRoundProDEMO-Black' },
  headerWrapper: {
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: 24,
    shadowColor: theme.accent,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.16,
    shadowRadius: 0,
    elevation: 3,
    marginTop: 8,
    marginBottom: 12,
  },
  headerContent: {
    paddingVertical: 0,
    paddingHorizontal: 0,
    paddingLeft: 16,
    alignItems: 'stretch',
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    minHeight: 44,
  },
  headerTitle: { fontSize: 22, color: theme.text, fontFamily: 'CeraRoundProDEMO-Black' },
  progressBarTrack: {
    height: 10,
    borderRadius: 999,
    backgroundColor: "#d7e1eb",
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: theme.accent,
  },
  contentArea: { flex: 1 },
  formScrollContent: { paddingBottom: 20 },
  stepIntroCard: {
    backgroundColor: "#ffffff",
    borderRadius: 22,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#e3edf7",
    shadowColor: "#cdcdcd",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 2,
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 24,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#dbe8f6",
    shadowColor: "#c9d9ea",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 2,
  },
  nameSectionCard: {
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  privateSectionCard: {
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  privateSectionTopRow: {
    marginTop: 0,
  },
  privateSectionRow: {
    marginTop: 8,
  },
  privateSectionGap: { height: 8 },
  footer: { flexDirection: "row", paddingTop: 10, paddingBottom: 8 },
  stepFooterRow: { paddingTop: 8, paddingBottom: 12, paddingHorizontal: 2 },
  stepFooterRowOnboarding: { paddingBottom: 4 },
  footerProgressWrap: { marginBottom: 12 },
  footerProgressWrapOnboarding: { marginBottom: 8 },
  stepButtonGroup: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
    gap: 12,
  },
  stepButtonGroupOnboarding: {
    marginBottom: 0,
  },
  onboardingSkipRow: {
    alignSelf: "flex-end",
    marginBottom: 10,
  },
  onboardingSkipButtonWrap: {
    height: 44,
    position: "relative",
    minWidth: 88,
  },
  onboardingSkipButtonShadow: {
    position: "absolute",
    top: 3,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 16,
  },
  onboardingSkipButtonShadowColor: {
    backgroundColor: "#bebebe",
  },
  onboardingSkipButtonFace: {
    height: 40,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  onboardingSkipButtonFaceColor: {
    backgroundColor: "#ffffff",
  },
  onboardingSkipButtonFaceDisabled: {
    backgroundColor: "#f0f0f0",
  },
  onboardingSkipBtnText: {
    fontSize: 13,
    fontFamily: "CeraRoundProDEMO-Black",
    color: "#3d3d3d",
    fontWeight: "900",
    letterSpacing: 0.1,
  },
  onboardingSkipBtnTextDisabled: {
    color: "#b0b0b0",
  },
  stepButton: { flex: 1 },
  sectionLabel: { fontSize: 13, color: theme.text, marginBottom: 8, fontFamily: 'CeraRoundProDEMO-Black' },
  nameInlineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  nameInlineLabel: {
    fontSize: 14,
    color: theme.text,
    fontFamily: 'CeraRoundProDEMO-Black',
  },
  nameInlineInput: {
    flex: 1,
    marginBottom: 0,
    fontFamily: 'CeraRoundProDEMO-Black',
  },
  nameHeaderCard: {
    backgroundColor: 'rgba(255,255,255,0.98)',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#d6e4f2',
    marginBottom: 12,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 12,
    shadowColor: '#4c6782',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.14,
    shadowRadius: 0,
    elevation: 2,
  },
  nameHeaderEyebrow: {
    fontSize: 11,
    fontWeight: '900',
    color: theme.muted,
    marginBottom: 6,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  nameHeaderInput: {
    height: 45,
    borderRadius: 16,
    fontSize: 16,
    fontWeight: '800',
  },
  switchRow: { marginTop: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  contributorRow: { marginTop: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  switchLabel: { fontSize: 13, color: theme.text, fontFamily: 'CeraRoundProDEMO-Black' },
  helperText: { fontSize: 12, color: theme.muted, marginBottom: 8, fontFamily: 'CeraRoundProDEMO-Black' },
  completionModeRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4, marginBottom: 10 },
  calendarCard: {
    backgroundColor: "#ffffff",
    borderRadius: 24,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#dbe8f6",
    shadowColor: "#cdcdcd",
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
  input: {
    backgroundColor: "#f9fbfd",
    borderRadius: 16,
    paddingHorizontal: 14,
    height: 46,
    fontSize: 14,
    color: theme.text,
    borderWidth: 1,
    borderColor: "#d9e6f4",
    fontFamily: 'CeraRoundProDEMO-Black',
  },
  contributorInput: { width: 82, textAlign: "center", paddingHorizontal: 8 },
  textArea: { height: 96, paddingTop: 12, textAlignVertical: "top", fontFamily: 'CeraRoundProDEMO-Black' },
  gap16: { height: 16 },
  sectionGap: { height: 8 },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", marginTop: 4, gap: 8 },
  gardenChipWrap: { gap: 4 }, 
  chip: {
    minHeight: 34,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: "#edf3f9",
    borderWidth: 1,
    borderColor: "#d6e1ec",
    justifyContent: "center",
  },
  filterStyleChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: '#c9c9c9',
    borderColor: 'transparent',
  },
  chipActive: { backgroundColor: theme.accent, borderColor: theme.accent },
  filterStyleChipActive: {
    backgroundColor: theme.accent,
    borderColor: theme.accent,
  },
  chipText: { fontSize: 12, color: "#4c5f75", fontFamily: 'CeraRoundProDEMO-Black' },
  filterStyleChipText: {
    fontSize: 14,
    color: '#ffffff',
    fontFamily: 'CeraRoundProDEMO-Black',
  },
  chipTextActive: { color: theme.bg, fontFamily: 'CeraRoundProDEMO-Black' },
  filterStyleChipTextActive: { color: '#ffffff', fontFamily: 'CeraRoundProDEMO-Black' },
  segmentWrap: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 6,
    marginTop: 10,
    flexWrap: 'wrap',
  },
  segment: {
    minHeight: 36,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 14,
    backgroundColor: '#c9c9c9',
    borderWidth: 1,
    borderColor: 'transparent',
    alignItems: "center",
    justifyContent: "center",
  },
  segmentActive: { backgroundColor: theme.accent, borderColor: theme.accent },
  segmentText: { fontSize: 14, fontWeight: '900', color: '#ffffff', fontFamily: 'CeraRoundProDEMO-Black' },
  segmentTextActive: { color: '#ffffff', fontFamily: 'CeraRoundProDEMO-Black' },
  row: { flexDirection: "row", marginTop: 10, gap: 10 },
  daysGrid: { flexDirection: "row", flexWrap: "wrap", marginTop: 10, gap: 8 },
  dayPill: {
    minWidth: 92,
    height: 40,
    borderRadius: 14,
    backgroundColor: '#c9c9c9',
    borderWidth: 1,
    borderColor: 'transparent',
    alignItems: "center",
    justifyContent: "center",
  },
  dayPillActive: { backgroundColor: theme.accent, borderColor: theme.accent },
  dayText: { fontSize: 14, fontWeight: '900', color: '#ffffff', fontFamily: 'CeraRoundProDEMO-Black' },
  dayTextActive: { color: '#ffffff', fontFamily: 'CeraRoundProDEMO-Black' },
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
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f7fbff',
    borderRadius: 14,
    paddingHorizontal: 12,
    height: 45,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#d6e4f2',
  },
  searchInput: { flex: 1, marginLeft: 8, fontSize: 14, color: theme.text },
  iconList: { maxHeight: 260 },
  iconGrid: { paddingBottom: 20 },
  iconGridWrap: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  iconBox: {
    width: '23.5%',
    height: 84,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#d6e1ec',
    marginBottom: 10,
    paddingTop: 10,
    paddingHorizontal: 6,
    shadowColor: '#d9e3ee',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 1,
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
  iconModalTitle: { fontSize: 18, color: theme.text, fontFamily: 'CeraRoundProDEMO-Black' },
  iconModalSubTitle: { marginTop: 2, fontSize: 12, color: theme.muted, fontFamily: 'CeraRoundProDEMO-Black' },
  iconModalDoneBtn: {
    minWidth: 56,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#111111',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconModalDoneText: { color: '#FFFFFF', fontSize: 13, fontFamily: 'CeraRoundProDEMO-Black' },
  iconModalSearchWrap: { paddingHorizontal: 0, paddingTop: 0 },
  iconModalSearchBar: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#d6e4f2',
    marginBottom: 8,
  },
  iconSelectedRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  iconSelectedRowLabel: { fontSize: 12, color: theme.muted, fontFamily: 'CeraRoundProDEMO-Black' },
  iconSelectedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.accent,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    gap: 6,
  },
  iconSelectedPillText: { color: '#FFFFFF', fontSize: 11, fontFamily: 'CeraRoundProDEMO-Black' },
  iconModalList: { flex: 1, paddingHorizontal: 12, paddingTop: 4 },
  iconLoadHint: { marginTop: 4, marginBottom: 12, fontSize: 12, color: theme.muted, textAlign: 'center', fontFamily: 'CeraRoundProDEMO-Black' },
  livePreviewCard: {
    marginTop: 2,
    marginBottom: 4,
    height: 220,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#d6e4f2",
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    overflow: "visible",
    paddingTop: 8,
    paddingBottom: 8,
    paddingHorizontal: 6,
  },
  assetCarouselSection: {
    width: "100%",
    marginTop: 8,
    overflow: "visible",
  },
  assetCarouselTitle: {
    fontSize: 12,
    color: theme.muted,
    marginBottom: 6,
    textAlign: "center",
    fontFamily: 'CeraRoundProDEMO-Black',
  },
  assetCarouselWrap: {
    height: 86,
    justifyContent: "center",
    overflow: "visible",
  },
  assetCarouselItem: {
    width: ASSET_CAROUSEL_ITEM_SIZE,
    height: 76,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    overflow: "visible",
    opacity: 0.45,
    transform: [{ scale: 0.86 }],
  },
  assetCarouselItemActive: {
    opacity: 1,
    transform: [{ scale: 1 }],
  },
  assetCarouselCenterRing: {
    position: "absolute",
    alignSelf: "center",
    width: ASSET_CAROUSEL_ITEM_SIZE,
    height: 76,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: theme.accent,
    backgroundColor: "rgba(89, 215, 0, 0.08)",
    zIndex: -1,
  },
  assetCarouselPlantImage: {
    width: 42,
    height: 50,
  },
  assetCarouselPlantImageActive: {
    width: 50,
    height: 58,
  },
  assetCarouselPotImage: {
    width: 52,
    height: 34,
  },
  assetCarouselPotImageActive: {
    width: 60,
    height: 38,
  },
  plantOptionsSection: {
    marginTop: 0,
    zIndex: 3,
    elevation: 3,
  },
  plantOptionsWrap: {
    height: 98,
    overflow: "visible",
  },
  plantOptionsItem: {
    width: 92,
    height: 102,
    opacity: 0.42,
    transform: [{ scale: 0.88 }],
    justifyContent: "flex-end",
    paddingBottom: 0,
    overflow: "visible",
  },
  plantOptionsItemActive: {
    opacity: 1,
    transform: [{ scale: 1 }],
  },
  plantOptionsImage: {
    width: 66,
    height: 90,
  },
  plantOptionsImageActive: {
    width: 84,
    height: 108,
  },
  potOptionsSection: {
    marginTop: -46,
    zIndex: 1,
    elevation: 1,
    overflow: "visible",
  },
  potOptionsWrap: {
    height: 116,
    paddingTop: 34,
    overflow: "visible",
  },
  potOptionsItem: {
    width: 92,
    height: 92,
    opacity: 0.42,
    transform: [{ scale: 0.88 }],
    justifyContent: "flex-start",
    paddingTop: 0,
    overflow: "visible",
  },
  potOptionsItemActive: {
    height: 102,
    opacity: 1,
    transform: [{ scale: 1 }],
    overflow: "visible",
  },
  potOptionsImage: {
    width: 74,
    height: 46,
    marginTop: 4,
  },
  potOptionsImageActive: {
    width: 90,
    height: 56,
    marginTop: 4,
  },
  topCarouselSection: {
    marginTop: 0,
  },
  topPlantCarouselWrap: {
    width: 210,
    height: 106,
    position: "absolute",
    top: 0,
    zIndex: 3,
  },
  topPotCarouselWrap: {
    width: 210,
    height: 86,
    position: "absolute",
    bottom: 8,
    zIndex: 1,
  },
  topCarouselItem: {
    opacity: 0.35,
    transform: [{ scale: 0.82 }],
  },
  topCarouselItemActive: {
    opacity: 1,
    transform: [{ scale: 1 }],
  },
  topCarouselPlantImage: {
    width: 54,
    height: 76,
  },
  topCarouselPlantImageActive: {
    width: 76,
    height: 96,
  },
  topCarouselPotImage: {
    width: 58,
    height: 38,
  },
  topCarouselPotImageActive: {
    width: 78,
    height: 48,
  },
  selectionSubLabel: {
    marginTop: 2,
    fontSize: 13,
    color: theme.muted,
    fontFamily: 'CeraRoundProDEMO-Black',
  },
  selectorPagerWrap: {
    marginTop: 4,
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: "#f4f9ff",
    borderWidth: 1,
    borderColor: "#dce8f4",
  },
  selectorCard: {
    width: "100%",
    minHeight: 50,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#d6e4f2",
  },
  selectorCardActive: {
    borderColor: theme.accent,
    backgroundColor: "#f8fff2",
  },
  selectorControlRow: {
    marginTop: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  selectorArrowButton: {
    width: 42,
    minHeight: 50,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#d6e4f2",
  },
  selectorCardStatic: {
    flex: 1,
  },
  plantPagerWrap: {
    marginTop: 4,
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: "#f4f9ff",
    borderWidth: 1,
    borderColor: "#dce8f4",
  },
  plantPagerPage: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  plantCard: {
    width: "100%",
    minHeight: 220,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#d6e4f2",
  },
  plantCardActive: {
    borderColor: theme.accent,
    backgroundColor: "#f8fff2",
  },
  previewAssemblyWrap: {
    width: 168,
    height: 170,
    alignItems: "center",
    justifyContent: "flex-end",
    marginBottom: 2,
    position: "relative",
  },
  previewPlantImage: {
    width: 94,
    height: 112,
    position: "absolute",
    bottom: 55,
    zIndex: 2,
  },
  previewPotImage: {
    width: 106,
    height: 66,
    zIndex: 1,
  },
  plantPreviewName: {
    fontSize: 16,
    fontWeight: "900",
    color: theme.text,
  },
  plantDotsRow: {
    marginTop: 6,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },
  plantDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#c3d2e2",
  },
  plantDotActive: {
    width: 20,
    borderRadius: 999,
    backgroundColor: theme.accent,
  },
  potPagerWrap: {
    marginTop: 4,
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: "#f4f9ff",
    borderWidth: 1,
    borderColor: "#dce8f4",
  },
  potPagerPage: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  potCard: {
    width: "100%",
    minHeight: 180,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#d6e4f2",
  },
  potCardActive: {
    borderColor: theme.accent,
    backgroundColor: "#f8fff2",
  },
  potPreviewName: {
    fontSize: 16,
    fontWeight: "900",
    color: theme.text,
  },
  potDotsRow: {
    marginTop: 6,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },
  potDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#c3d2e2",
  },
  potDotActive: {
    width: 20,
    borderRadius: 999,
    backgroundColor: theme.accent,
  },
  loadMoreIconsBtn: {
    alignSelf: 'center',
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: '#eaf4ff',
    borderWidth: 1,
    borderColor: '#d6e4f2',
  },
  loadMoreIconsText: { fontSize: 12, fontWeight: '900', color: theme.accent },
  reviewRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#edf2f6' },
  reviewLabel: { fontSize: 13, fontWeight: "700", color: theme.text2, fontFamily: 'CeraRoundProDEMO-Black' },
  reviewValue: { fontSize: 13, fontWeight: "800", color: theme.text, fontFamily: 'CeraRoundProDEMO-Black' },
  skipRow: { flexDirection: "row", marginTop: 12, gap: 10 },
  skipToggle: { flex: 1, height: 36, borderRadius: theme.radius, backgroundColor: theme.surface2, alignItems: "center", justifyContent: "center" },
  skipToggleOn: { backgroundColor: theme.accent },
  skipText: { fontSize: 12, fontWeight: "700", color: theme.text },
  skipTextOn: { color: theme.bg },
  inlineLink: { marginTop: 8, alignSelf: "flex-start" },
  inlineLinkText: { fontSize: 12, fontWeight: "700", color: theme.muted, textDecorationLine: "underline" },
  errorInline: { marginTop: 10, backgroundColor: theme.dangerBg, borderRadius: theme.radius, padding: 12 },
  errorInlineText: { color: theme.dangerText, fontSize: 12, fontWeight: "700", fontFamily: 'CeraRoundProDEMO-Black' },
  coachOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "center", alignItems: "center", padding: 20 },
  coachBox: { width: "100%", maxWidth: 400, backgroundColor: theme.surface, borderRadius: theme.radius, padding: 18, ...require('../utils/shadows').cpShadow({ color: '#000', offset: { width: 0, height: 3 }, opacity: 0.2, radius: 6, elevation: 6 }) },
  coachTitle: { fontSize: 16, fontWeight: "800", marginBottom: 8, color: theme.text },
  coachBody: { fontSize: 13, color: theme.text, marginBottom: 14 },
  coachCloseBtn: { marginTop: 4, alignSelf: "flex-end", paddingVertical: 8, paddingHorizontal: 16, borderRadius: 8, backgroundColor: theme.accent },
  coachCloseText: { color: theme.bg, fontWeight: "700", fontSize: 13 },
  stepHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  stepTitle: { fontSize: 16, fontWeight: "900", color: theme.text },
  stepCount: { fontSize: 12, fontWeight: "800", color: theme.muted },

});

