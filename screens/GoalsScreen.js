// ...existing code...
// screens/GoalsScreen.js
import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { View, Text, StyleSheet, FlatList, ActivityIndicator, Image, Animated, Easing } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { useScreenActive } from "../hooks/useScreenActive";

import { getFirestore, collection, onSnapshot, query, where, getDocs, doc, updateDoc, runTransaction, setDoc, increment, arrayUnion, getDoc } from "firebase/firestore";
import { toggleGoalTransaction } from "../utils/goalToggleTransaction";
// import { getAuth } from "firebase/auth";
import { Ionicons } from "@expo/vector-icons";
import HapticPressable from "../components/HapticPressable";
import GoalProgressButtonContent from "../components/GoalProgressButtonContent";
import Page from "../components/Page";
import { HapticType } from "../utils/haptics";
import theme, { getDarkerAccentColor, getLighterAccentColor, useTheme } from "../theme";
import { cpShadow, panelShadow, hardDropShadow, cardShadow } from "../utils/shadows";
import { PLANT_ASSETS } from "../constants/PlantAssets";
import { POT_ASSETS } from "../constants/PotAssets";
import { WALLPAPER_OPTIONS } from "../constants/WallpaperAssets";
import { useGoals, isScheduledOn, toKey, fromKey } from "../components/GoalsStore";
import { useSubscription } from "../components/SubscriptionProvider";
import { tryNavigateToAddGoal } from "../utils/subscriptionLimits";
import { Alert } from "react-native";
import { db } from "../firebaseConfig";
import { auth } from "../firebaseConfig";
import { updateOverallScoresForSharedGardenMembers } from "../utils/scoreUtils";
import { subscribePersonalCustomizations, subscribeSharedCustomizations } from "../utils/customizationFirestore";
import { onFirestoreListenerError } from "../utils/firestoreListener";
import { recordQuestActivity } from "../utils/questEngine";
import { getAuth } from "firebase/auth";
import {
  calculateGoalStreak,
  getGrowthStage,
  getPlantHealthState,
  isGoalDoneForDate,
  isGoalScheduledOnDate,
  getGoalPeriod,
  getPeriodTarget,
  getPeriodProgress,
  getPeriodContributorCount,
} from "../utils/goalState";
// import { fromKey } from "../components/GoalsStore";
const STORAGE_PAGE_ID = 'storage';
const DEFAULT_PLANT_PREVIEW_COLOR = '#EEF6FF';

function GoalPlantPreview({ goal, getPlantHealthState, backdropColor = DEFAULT_PLANT_PREVIEW_COLOR }) {
  const screenActive = useScreenActive();
  const stage = getGrowthStage(goal?.totalCompletions);

  // DEBUG: Print health simulation details for this goal
  if (goal?.name === "Grumble") {
    const now = new Date();
    const healthState = getPlantHealthState(goal, now);
    const createdAt = goal?.createdAt ? new Date(goal.createdAt.seconds ? goal.createdAt.seconds * 1000 : goal.createdAt) : null;
    console.log("[DEBUG][Grumble] Health simulation:");
    console.log("  createdAt:", createdAt);
    console.log("  today:", now);
    console.log("  healthState:", healthState);
    if (goal?.logs) {
      console.log("  logs:", goal.logs);
    }
  }
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

  useEffect(() => {
    if (!screenActive) {
      swayAnim.stopAnimation();
      swayAnim.setValue(0);
      return undefined;
    }

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
  }, [swayAnim, screenActive]);

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
    <View style={[styles.goalPlantPreviewWrap, { backgroundColor: backdropColor }]}> 
      <Animated.Image
        source={displayedPlantSource}
        style={[
          styles.goalPlantImage,
          {
            transform: [
              { translateY: 18 },
              { rotate: swayAnim.interpolate({ inputRange: [-1, 1], outputRange: ['-4deg', '6deg'] }) },
              { scale: swapScaleAnim },
              { translateY: -18 },
            ],
          },
        ]}
        resizeMode="contain"
      />
      <Image source={potSource} style={styles.goalPlantPot} resizeMode="contain" />
    </View>
  );
}

export default function GoalsScreen({ navigation }) {
    // Utility to update a goal and always recalculate healthLevel for selectedDateKey
    async function updateGoalWithHealth(goal, updatedFields, selectedDateKey) {
      const updatedGoal = { ...goal, ...updatedFields };
      const updatedHealthLevel = getPlantHealthState(updatedGoal, fromKey(selectedDateKey)).healthLevel;
      const updateData = { ...updatedFields, healthLevel: updatedHealthLevel };
      await updateDoc(doc(db, "users", goal.ownerId || auth.currentUser?.uid, "goals", goal.id), updateData);
    }
  const [goals, setGoals] = useState([]);
  const [layout, setLayout] = useState({});
  const [sharedGoals, setSharedGoals] = useState([]);
  const [sharedLayouts, setSharedLayouts] = useState({});
  const [sharedGardenNames, setSharedGardenNames] = useState({});
  const [personalCustomizations, setPersonalCustomizations] = useState({});
  const [sharedCustomizationsByGarden, setSharedCustomizationsByGarden] = useState({});
  const [loading, setLoading] = useState(true);
  const [goalFilter, setGoalFilter] = useState('all'); // 'all' | 'personal' | 'shared'
  const [optimisticProgressByGoal, setOptimisticProgressByGoal] = useState({});
  const [tapCooldownByGoal, setTapCooldownByGoal] = useState({});
  const optimisticProgressRef = useRef({});
  const optimisticResetTimersRef = useRef({});
  const tapCooldownRef = useRef({});
  const tapCooldownTimersRef = useRef({});
  const inFlightToggleRef = useRef({});
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { isDoneForDay, selectedDateKey } = useGoals();
  const { isPro, openDefaultPaywall } = useSubscription();

  useFocusEffect(
    useCallback(() => {
      recordQuestActivity("goals");
    }, [])
  );

  const sharedGoalCardShadow = useMemo(
    () =>
      cpShadow({
        color: theme.accent,
        offset: { width: 0, height: 6 },
        opacity: 1,
        radius: 0,
        elevation: 2,
      }),
    [theme.accent]
  );

  const accentShadowColor = useMemo(
    () => getDarkerAccentColor(theme.accent),
    [theme.accent]
  );

  const quantitySegmentFilledStyle = useMemo(
    () => ({ backgroundColor: theme.accent }),
    [theme.accent]
  );

  const fabDynamicStyle = useMemo(
    () => ({
      backgroundColor: theme.accent,
      ...cpShadow({
        color: accentShadowColor,
        offset: { width: 0, height: 5 },
        opacity: 1,
        radius: 0,
        elevation: 12,
      }),
    }),
    [theme.accent, accentShadowColor]
  );

  const getOptimisticGoalKey = (goalId, sharedGardenId) => `${sharedGardenId ? `shared-${sharedGardenId}` : 'personal'}-${goalId}`;

  const clearOptimisticProgress = (goalId, sharedGardenId) => {
    const key = getOptimisticGoalKey(goalId, sharedGardenId);
    const existingTimer = optimisticResetTimersRef.current[key];
    if (existingTimer) {
      clearTimeout(existingTimer);
      delete optimisticResetTimersRef.current[key];
    }
    delete optimisticProgressRef.current[key];
    setOptimisticProgressByGoal((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const setOptimisticProgress = (goalId, sharedGardenId, optimisticStateOrUpdater) => {
    const key = getOptimisticGoalKey(goalId, sharedGardenId);
    const existingTimer = optimisticResetTimersRef.current[key];
    if (existingTimer) clearTimeout(existingTimer);
    setOptimisticProgressByGoal((prev) => {
      const nextState = typeof optimisticStateOrUpdater === "function"
        ? optimisticStateOrUpdater(prev[key])
        : optimisticStateOrUpdater;
      optimisticProgressRef.current[key] = nextState;
      return { ...prev, [key]: nextState };
    });
    optimisticResetTimersRef.current[key] = setTimeout(() => {
      delete optimisticProgressRef.current[key];
      setOptimisticProgressByGoal((prev) => {
        if (!(key in prev)) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      });
      delete optimisticResetTimersRef.current[key];
    }, 1800);
  };

  const startTapCooldown = (goalId, sharedGardenId, duration = 210) => {
    const key = getOptimisticGoalKey(goalId, sharedGardenId);
    const existingTimer = tapCooldownTimersRef.current[key];
    if (existingTimer) clearTimeout(existingTimer);
    tapCooldownRef.current[key] = true;
    setTapCooldownByGoal((prev) => ({ ...prev, [key]: true }));
    tapCooldownTimersRef.current[key] = setTimeout(() => {
      delete tapCooldownRef.current[key];
      delete tapCooldownTimersRef.current[key];
      setTapCooldownByGoal((prev) => {
        if (!(key in prev)) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }, duration);
  };

  useEffect(() => {
    return () => {
      Object.values(optimisticResetTimersRef.current).forEach((timerId) => clearTimeout(timerId));
      Object.values(tapCooldownTimersRef.current).forEach((timerId) => clearTimeout(timerId));
      optimisticResetTimersRef.current = {};
      tapCooldownTimersRef.current = {};
      optimisticProgressRef.current = {};
      tapCooldownRef.current = {};
    };
  }, []);

  // Main: handleToggleComplete (from GoalScreen, adapted for GoalsScreen)
  async function handleToggleComplete(goal, shelfPosition, sharedGardenId) {
    if (!goal || shelfPosition?.pageId === STORAGE_PAGE_ID) return;
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
      const selectedDateKeyString = typeof selectedDateKey === 'string' ? selectedDateKey : toKey(selectedDateKey);
      console.log('[GoalsScreen] toggleGoalTransaction selectedDateKey:', selectedDateKeyString, typeof selectedDateKeyString);
      await toggleGoalTransaction({
        goal,
        selectedDateKey: selectedDateKeyString,
        isSharedGoalView: !!sharedGardenId,
        routeSharedGardenId: sharedGardenId,
        shelfPosition,
        clearLocalOptimisticProgress: () => clearOptimisticProgress(goal.id, sharedGardenId),
      });
    } catch (error) {
      clearOptimisticProgress(goal?.id, sharedGardenId);
      console.error("Error toggling goal status:", error);
      Alert.alert("Error", "Could not update goal progress.");
    }
  }

  useEffect(() => {
    const auth = getAuth();
    const DB = getFirestore();

    let unsubGoals = null;
    let unsubLayout = null;
    let unsubPersonalCustomization = null;
    let unsubSharedLayouts = [];
    let unsubSharedCustomizations = [];
    let isMounted = true;

    const clearFirestoreListeners = () => {
      if (unsubGoals) unsubGoals();
      if (unsubLayout) unsubLayout();
      if (unsubPersonalCustomization) unsubPersonalCustomization();
      unsubSharedLayouts.forEach((unsub) => unsub());
      unsubSharedCustomizations.forEach((unsub) => unsub());
      unsubGoals = null;
      unsubLayout = null;
      unsubPersonalCustomization = null;
      unsubSharedLayouts = [];
      unsubSharedCustomizations = [];
    };

    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      clearFirestoreListeners();
      if (user) {
        setLoading(true);
        const goalsRef = collection(DB, "users", user.uid, "goals");
        const layoutRef = collection(DB, "users", user.uid, "gardenLayout");

        unsubGoals = onSnapshot(
          goalsRef,
          (snapshot) => {
            const goalsData = snapshot.docs.map((doc) => ({
              id: doc.id,
              ...doc.data(),
            }));
            if (isMounted) setGoals(goalsData);
          },
          onFirestoreListenerError('GoalsScreen goals listener')
        );

        unsubPersonalCustomization = subscribePersonalCustomizations(user.uid, (data) => {
          if (isMounted) setPersonalCustomizations(data || {});
        });

        unsubLayout = onSnapshot(
          layoutRef,
          (snapshot) => {
            const layoutData = {};
            snapshot.docs.forEach((doc) => {
              layoutData[doc.id] = doc.data();
            });
            if (isMounted) setLayout(layoutData);
          },
          onFirestoreListenerError('GoalsScreen layout listener')
        );

        // Fetch shared gardens and their layouts
        const sharedGardensQuery = query(collection(DB, "sharedGardens"), where("memberIds", "array-contains", user.uid));
        const sharedGardensSnap = await getDocs(sharedGardensQuery);

        // --- Robust sharedGoals state: always rebuild from all gardens ---
        const sharedGoalsByGarden = {};
        const sharedLayoutsObj = {};
        const sharedGardenNamesObj = {};
        unsubSharedLayouts.forEach((unsub) => unsub());
        unsubSharedCustomizations.forEach((unsub) => unsub());
        unsubSharedLayouts = [];
        unsubSharedCustomizations = [];

        // Track all garden layout snapshots in memory
        const gardenLayoutSnapshots = {};

        const updateAllSharedGoals = () => {
          // Flatten all garden goals into a single array
          const allGoals = Object.values(gardenLayoutSnapshots).flat();
          setSharedGoals(allGoals);
        };

        const promises = sharedGardensSnap.docs.map(async (gardenDoc) => {
          const gardenId = gardenDoc.id;
          const gardenName = gardenDoc.data().name || "Shared Garden";
          sharedGardenNamesObj[gardenId] = gardenName;

          const unsubCustomization = subscribeSharedCustomizations(gardenId, (data) => {
            if (isMounted) {
              setSharedCustomizationsByGarden((prev) => ({ ...prev, [gardenId]: data || {} }));
            }
          });
          unsubSharedCustomizations.push(unsubCustomization);

          const layoutCol = collection(DB, "sharedGardens", gardenId, "layout");
          return new Promise((resolve) => {
            const unsub = onSnapshot(
              layoutCol,
              (snap) => {
                const gardenGoals = [];
                snap.docs.forEach((doc) => {
                  const data = doc.data();
                  gardenGoals.push({ ...data, id: doc.id, sharedGardenId: gardenId });
                  sharedLayoutsObj[doc.id] = data;
                });
                gardenLayoutSnapshots[gardenId] = gardenGoals;
                if (isMounted) {
                  updateAllSharedGoals();
                  setSharedLayouts((prev) => ({ ...prev, ...sharedLayoutsObj }));
                  setSharedGardenNames((prev) => ({ ...prev, ...sharedGardenNamesObj }));
                }
                resolve();
              },
              onFirestoreListenerError('GoalsScreen shared layout listener')
            );
            unsubSharedLayouts.push(unsub);
          });
        });
        await Promise.all(promises);
        setLoading(false);
      } else {
        setGoals([]);
        setLayout({});
        setSharedGoals([]);
        setSharedLayouts({});
        setPersonalCustomizations({});
        setSharedCustomizationsByGarden({});
        setLoading(false);
      }
    });

    return () => {
      isMounted = false;
      clearFirestoreListeners();
      unsubscribe();
    };
  }, []);

  const visibleGoalCount = useMemo(() => {
    const visiblePersonalGoals = goals.filter((g) => {
      const layoutEntry = layout[g.id];
      return !layoutEntry || layoutEntry.shelfPosition?.pageId !== STORAGE_PAGE_ID;
    });
    const visibleSharedGoals = sharedGoals.filter((g) => {
      return !g.shelfPosition || g.shelfPosition.pageId !== STORAGE_PAGE_ID;
    });
    const sharedGoalIds = new Set(visibleSharedGoals.map((g) => g.id));
    const dedupedPersonalGoals = visiblePersonalGoals.filter((g) => !sharedGoalIds.has(g.id));
    return dedupedPersonalGoals.length + visibleSharedGoals.length;
  }, [goals, sharedGoals, layout]);

  const handleAddGoal = () => {
    tryNavigateToAddGoal({ navigation, isPro, goals, openDefaultPaywall });
  };

  const handleCalendar = () => {
    navigation.navigate("Calendar");
  };

  const handleGarden = () => {
    navigation.navigate("Garden");
  };

  const handleGoalPress = (goalId, sharedGardenId, ownerId, sourceGoalId) => {
    if (sharedGardenId) {
      navigation.navigate("Goal", { goalId, sharedGardenId, ownerId, sourceGoalId });
    } else {
      navigation.navigate("Goal", { goalId });
    }
  };

  const getGoalPreviewBackdropColor = (goal) => {
    const isSharedGoal = !!goal?.sharedGardenId;
    const latestLayoutEntry = isSharedGoal ? sharedLayouts?.[goal.id] : layout?.[goal.id];
    const resolvedPageId =
      latestLayoutEntry?.shelfPosition?.pageId
      || goal?.shelfPosition?.pageId
      || 'default';

    const pageCustomizations = isSharedGoal
      ? (
          sharedCustomizationsByGarden?.[goal.sharedGardenId]?.[resolvedPageId]
          || sharedCustomizationsByGarden?.[goal.sharedGardenId]?.default
        )
      : (personalCustomizations?.[resolvedPageId] || personalCustomizations?.default);

    const wallBgIndex = Number(pageCustomizations?.wallBg ?? 0);
    return WALLPAPER_OPTIONS[wallBgIndex]?.previewColor || DEFAULT_PLANT_PREVIEW_COLOR;
  };

  const renderGoal = ({ item }) => {
    // --- Begin: Match GoalScreen shared quantity multi-user goal UI exactly ---
    const auth = getAuth();
    const goalType = item.kind || item.type;
    const isCompletion = goalType === "completion";
    const isQuantity = goalType === "quantity";
    const isFrequency = goalType === "frequency";
    const isPeriodQuantity = goalType === "periodQuantity";
    const isPeriodic = isFrequency || isPeriodQuantity;
    const isSharedMultiUserCompletion = !!item.sharedGardenId && isCompletion && !!item.multiUserWateringEnabled;
    const isSharedMultiUserQuantity = !!item.sharedGardenId && isQuantity && !!item.multiUserWateringEnabled;
    const isSharedMultiUserFrequency = !!item.sharedGardenId && isFrequency && !!item.multiUserWateringEnabled;
    const isSharedMultiUserPeriodQuantity = !!item.sharedGardenId && isPeriodQuantity && !!item.multiUserWateringEnabled;
    const isSharedMultiUserPeriodic = isSharedMultiUserFrequency || isSharedMultiUserPeriodQuantity;
    const currentUserId = auth.currentUser?.uid;
    const completionLog = item.logs?.completion?.[selectedDateKey] || {};
    const quantityLog = item.logs?.quantity?.[selectedDateKey] || {};
    const goalUiKey = getOptimisticGoalKey(item.id, item.sharedGardenId);
    const optimisticProgress = optimisticProgressByGoal[goalUiKey];
    const isTapCoolingDown = !!tapCooldownByGoal[goalUiKey];
    // --- Shared multi-user completion ---
    const currentWaterUsers = isSharedMultiUserCompletion
      ? Object.keys(completionLog.users || {}).filter((userId) => !!completionLog.users[userId]).length
      : 0;
    const currentUserClicked = isSharedMultiUserCompletion
      ? !!completionLog.users?.[currentUserId]
      : false;

    // --- Shared multi-user quantity: robust group and user progress logic (matches GoalScreen.js) ---
    let firestoreQuantityLogs = {};
    if (
      isSharedMultiUserQuantity &&
      typeof quantityLog.users === 'object' && quantityLog.users !== null
    ) {
      firestoreQuantityLogs = quantityLog.users;
    }
    const quantityTargetValue = isQuantity ? (item.measurable?.target ?? 1) : 1;
    // Contributors: always use contributors array if present, else fallback to all user keys in logs
    const allContributors = isSharedMultiUserQuantity
      ? (Array.isArray(item.contributors) && item.contributors.length > 0
          ? item.contributors
          : Object.keys(firestoreQuantityLogs))
      : [];
    // Group completion: always use Firestore logs, never optimistic state
    let contributorQuantityCount = 0;
    if (isSharedMultiUserQuantity) {
      contributorQuantityCount = allContributors.filter((userId) => Number(firestoreQuantityLogs[userId]) >= quantityTargetValue).length;
    }
    const requiredSharedContributors = (isSharedMultiUserCompletion || isSharedMultiUserQuantity || isSharedMultiUserPeriodic)
      ? Math.max(2, Math.floor(Number(item.requiredContributors) || 2))
      : 1;

    // --- Periodic (frequency / periodQuantity) progress ---
    const periodTargetValue = isPeriodic ? getPeriodTarget(item) : 0;
    const periodScopedUserId = isSharedMultiUserPeriodic ? currentUserId : null;
    const periodUserProgress = isPeriodic ? getPeriodProgress(item, selectedDateKey, periodScopedUserId) : 0;
    const periodGroupCount = isSharedMultiUserPeriodic ? getPeriodContributorCount(item, selectedDateKey) : 0;
    const periodUserDone = isPeriodic ? periodUserProgress >= periodTargetValue : false;
    const periodGroupDone = isSharedMultiUserPeriodic
      ? periodGroupCount >= requiredSharedContributors
      : periodUserDone;
    // Progress label for group bar
    let contributorProgressLabel = isSharedMultiUserQuantity
      ? `${Math.min(contributorQuantityCount, requiredSharedContributors)}/${requiredSharedContributors}`
      : (isSharedMultiUserCompletion ? `${currentWaterUsers}/${requiredSharedContributors}` : undefined);

    // Only use optimistic state for current user's segment
    let quantityLogs = firestoreQuantityLogs;
    const firestoreUserValue = Number(firestoreQuantityLogs[currentUserId]) || 0;
    let currentUserQuantityValue = firestoreUserValue;
    if (isSharedMultiUserQuantity && optimisticProgress && typeof optimisticProgress.currentValue === 'number') {
      // Only update current user's segment optimistically
      quantityLogs = { ...firestoreQuantityLogs, [currentUserId]: optimisticProgress.currentValue };
      currentUserQuantityValue = optimisticProgress.currentValue;
    }
    // For single-user, fallback to value
    const baseCurrentValue = isCompletion
      ? (isSharedMultiUserCompletion ? currentWaterUsers : (completionLog.done ? 1 : 0))
      : (item.logs?.quantity?.[selectedDateKey]?.value ?? 0);
    const targetValue = isPeriodic
      ? periodTargetValue
      : isCompletion ? (isSharedMultiUserCompletion ? requiredSharedContributors : 1) : (item.measurable?.target ?? 0);
    // For shared multi-user quantity, always use the current user's value (optimistic if available, else Firestore)
    const currentValue = isPeriodic
      ? periodUserProgress
      : isSharedMultiUserQuantity
      ? currentUserQuantityValue
      : (!isSharedMultiUserCompletion && optimisticProgress)
        ? optimisticProgress.currentValue
        : baseCurrentValue;

    // --- Group-level completion: always use Firestore logs, never optimistic state ---
    const isDone = isPeriodic
      ? periodGroupDone
      : isSharedMultiUserQuantity
      ? (contributorQuantityCount >= requiredSharedContributors)
      : (!isSharedMultiUserCompletion && optimisticProgress)
        ? optimisticProgress.isDone
        : (currentValue >= targetValue && targetValue > 0);

    // Always define buttonProgressLabel for both shared multi-user completion and quantity
    const buttonProgressLabel = isSharedMultiUserQuantity || isSharedMultiUserCompletion ? contributorProgressLabel : undefined;

    // Always define hasUserContributed for both shared multi-user completion and quantity
    const hasUserContributed = isSharedMultiUserQuantity
      ? Number(currentValue) >= quantityTargetValue
      : (isSharedMultiUserCompletion && currentUserClicked);

    // --- Segment rendering ---
    const showQuantitySegments = isQuantity && Number(targetValue) > 0;
    const showPeriodicProgress = isPeriodic && Number(targetValue) > 0;

    // --- Button coloring (match GoalScreen) ---
    const uncheckedButtonShadowColor = '#cdcdcd';
    let buttonBgColor = '#f1f1f1';
    let buttonShadowColor = uncheckedButtonShadowColor;
    let buttonIconColor = theme.accent;

    // Handle shared goals (completion and quantity)
    if (isSharedMultiUserCompletion || isSharedMultiUserQuantity || isSharedMultiUserPeriodic) {
      if (isDone) {
        buttonBgColor = theme.accent;
        buttonShadowColor = accentShadowColor;
        buttonIconColor = '#ffffff';
      } else if (isSharedMultiUserCompletion && currentUserClicked) {
        buttonBgColor = getLighterAccentColor(theme.accent);
        buttonShadowColor = accentShadowColor;
        buttonIconColor = '#ffffff';
      } else if (isSharedMultiUserQuantity && Number(currentValue) >= (quantityTargetValue || 1)) {
        buttonBgColor = getLighterAccentColor(theme.accent);
        buttonShadowColor = accentShadowColor;
        buttonIconColor = '#ffffff';
      } else if (isSharedMultiUserPeriodic && periodUserDone) {
        buttonBgColor = getLighterAccentColor(theme.accent);
        buttonShadowColor = accentShadowColor;
        buttonIconColor = '#ffffff';
      } else {
        buttonBgColor = '#f1f1f1';
        buttonShadowColor = uncheckedButtonShadowColor;
        buttonIconColor = theme.accent;
      }
    } else if (isDone) {
      buttonBgColor = theme.accent;
      buttonShadowColor = accentShadowColor;
      buttonIconColor = '#ffffff';
    } else if ((isQuantity || (isPeriodic && !isSharedMultiUserPeriodic)) && Number(currentValue) >= (targetValue || 1)) {
      buttonBgColor = getLighterAccentColor(theme.accent);
      buttonShadowColor = accentShadowColor;
      buttonIconColor = '#ffffff';
    }

    // Determine if this goal is scheduled for the selected day
    const isForSelectedDay = isGoalScheduledOnDate(item, fromKey(selectedDateKey));
    const previewBackdropColor = getGoalPreviewBackdropColor(item);
    const actionButtonSize = (isSharedMultiUserCompletion || isSharedMultiUserQuantity || isSharedMultiUserPeriodic) ? 58 : 55;
    const actionButtonRadius = 22;
    const actionIconSize = (isSharedMultiUserCompletion || isSharedMultiUserQuantity || isSharedMultiUserPeriodic) ? 30 : 28;

    // --- UI: Match GoalScreen shared quantity multi-user goal button/segments exactly ---
    return (
      <View style={[
        styles.goalCard,
        item.sharedGardenId ? styles.sharedGoalCard : null,
        item.sharedGardenId ? sharedGoalCardShadow : null,
        !isForSelectedDay && styles.goalCardDimmed,
      ]}>
        <HapticPressable
          haptic={HapticType.SELECTION}
          onPress={() => handleGoalPress(item.id, item.sharedGardenId, item.ownerId, item.sourceGoalId)}
          style={styles.goalMainPressable}
        >
          <GoalPlantPreview
            goal={item}
            getPlantHealthState={getPlantHealthState}
            backdropColor={previewBackdropColor}
          />
          <View style={styles.goalContent}>
            <Text style={[styles.goalName, !isForSelectedDay && styles.goalNameDimmed]} numberOfLines={1}>{item.name}</Text>
            <Text style={[styles.goalMeta, !isForSelectedDay && styles.goalMetaDimmed]}>
              {item.frequencyLabel || "Custom"}
              {item.sharedGardenId && sharedGardenNames[item.sharedGardenId] ? ` \u2022 ${sharedGardenNames[item.sharedGardenId]}` : ""}
            </Text>
          </View>
        </HapticPressable>
        <View style={[styles.goalStatusButton, { width: actionButtonSize, height: actionButtonSize + 4 }]}> 
          <View
            pointerEvents="none"
            style={[
              styles.goalStatusButtonShadow,
              {
                borderRadius: actionButtonRadius,
                backgroundColor: buttonShadowColor,
              },
            ]}
          />
          <HapticPressable
            haptic={HapticType.MEDIUM}
            hitSlop={8}
            onPress={() => {
              if (isForSelectedDay && !isTapCoolingDown) {
                startTapCooldown(item.id, item.sharedGardenId, 600); // 600ms cooldown
                handleToggleComplete(item, layout[item.id] || item.shelfPosition, item.sharedGardenId);
              }
            }}
            disabled={!isForSelectedDay || isTapCoolingDown}
            style={({ pressed }) => [
              styles.goalStatusButtonFace,
              {
                width: actionButtonSize,
                height: actionButtonSize,
                borderRadius: actionButtonRadius,
                backgroundColor: buttonBgColor,
                transform: [{ translateY: pressed && !isTapCoolingDown ? 4 : 0 }],
              },
              !isForSelectedDay && styles.goalStatusButtonDisabled,
            ]}
          >

            {isSharedMultiUserQuantity ? (
              <GoalProgressButtonContent
                mode="shared-quantity"
                currentValue={currentValue}
                targetValue={quantityTargetValue}
                isDone={isDone}
                userDone={Number(currentValue) >= quantityTargetValue}
                accentColor={theme.accent}
                contributorLabel={`${Math.min(Object.values(quantityLogs).filter((v) => Number(v) >= quantityTargetValue).length, requiredSharedContributors)}/${requiredSharedContributors}`}
                filledSegmentStyle={quantitySegmentFilledStyle}
              />
            ) : isSharedMultiUserPeriodic ? (
              <GoalProgressButtonContent
                mode="shared-periodic"
                currentValue={periodUserProgress}
                targetValue={periodTargetValue}
                isDone={isDone}
                userDone={periodUserDone}
                accentColor={theme.accent}
                contributorLabel={`${Math.min(periodGroupCount, requiredSharedContributors)}/${requiredSharedContributors}`}
              />
            ) : showQuantitySegments ? (
              <GoalProgressButtonContent
                mode="quantity"
                currentValue={currentValue}
                targetValue={targetValue}
                isDone={isDone}
                filledSegmentStyle={quantitySegmentFilledStyle}
              />
            ) : showPeriodicProgress ? (
              <GoalProgressButtonContent
                mode="periodic"
                currentValue={currentValue}
                targetValue={targetValue}
                isDone={isDone}
                accentColor={theme.accent}
              />
            ) : isSharedMultiUserCompletion ? (
              <Text
                style={[
                  styles.statusCircleCount,
                  { color: (isDone || currentUserClicked) ? "#ffffff" : theme.accent, fontWeight: 'bold', fontSize: 14 },
                ]}
              >
                {contributorProgressLabel}
              </Text>
            ) : (
              <Ionicons name={isDone ? "close" : "checkmark"} size={actionIconSize} color={buttonIconColor} />
            )}
          </HapticPressable>
        </View>
      </View>
    );
    // --- End: Match GoalScreen shared quantity multi-user goal UI exactly ---
  };

  if (loading) {
    return (
      <Page>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={theme.accent} />
        </View>
      </Page>
    );
  }

  // Filter out trophy goals from both personal and shared
  const visiblePersonalGoals = goals.filter((g) => {
    const layoutEntry = layout[g.id];
    return !layoutEntry || layoutEntry.shelfPosition?.pageId !== STORAGE_PAGE_ID;
  });
  const visibleSharedGoals = sharedGoals.filter((g) => {
    return !g.shelfPosition || g.shelfPosition.pageId !== STORAGE_PAGE_ID;
  });
  // Deduplicate: if a goal exists in any shared garden, do not show it as a personal goal
  const sharedGoalIds = new Set(visibleSharedGoals.map(g => g.id));
  const dedupedPersonalGoals = visiblePersonalGoals.filter(g => !sharedGoalIds.has(g.id));
  // For shared goals, key is always shared-<sharedGardenId>-<id>; for personal, personal-<id>
  // Build a map to ensure unique keys for FlatList, and attach the key to each goal object
  const goalMap = new Map();
  dedupedPersonalGoals.forEach(g => {
    const key = `personal-${String(g.id)}`;
    goalMap.set(key, { ...g, _flatListKey: key });
  });
  visibleSharedGoals.forEach(g => {
    const key = `shared-${String(g.sharedGardenId)}-${String(g.id)}`;
    goalMap.set(key, { ...g, _flatListKey: key });
  });
  const allVisibleGoals = Array.from(goalMap.values());

  // Filter goals based on selected filter
  let filteredGoals = allVisibleGoals;
  if (goalFilter === 'personal') {
    filteredGoals = allVisibleGoals.filter(g => !g.sharedGardenId);
  } else if (goalFilter === 'shared') {
    filteredGoals = allVisibleGoals.filter(g => g.sharedGardenId);
  }

  return (
    <Page>
      <View style={styles.headerWrapper}>
        <View style={styles.headerContent}>
          <View style={styles.headerRow}>
            <Text style={styles.headerTitle}>Goals</Text>

            <View style={styles.filterRow}>
              <HapticPressable
                haptic={HapticType.SELECTION}
                style={[styles.filterBtn, goalFilter === 'all' && { backgroundColor: theme.accent, borderColor: theme.accent }]}
                onPress={() => setGoalFilter('all')}
              >
                <Text style={[styles.filterBtnText, goalFilter === 'all' && styles.filterBtnTextActive]}>All</Text>
              </HapticPressable>
              <HapticPressable
                haptic={HapticType.SELECTION}
                style={[styles.filterBtn, goalFilter === 'personal' && { backgroundColor: theme.accent, borderColor: theme.accent }]}
                onPress={() => setGoalFilter('personal')}
              >
                <Text style={[styles.filterBtnText, goalFilter === 'personal' && styles.filterBtnTextActive]}>Personal</Text>
              </HapticPressable>
              <HapticPressable
                haptic={HapticType.SELECTION}
                style={[styles.filterBtn, goalFilter === 'shared' && { backgroundColor: theme.accent, borderColor: theme.accent }]}
                onPress={() => setGoalFilter('shared')}
              >
                <Text style={[styles.filterBtnText, goalFilter === 'shared' && styles.filterBtnTextActive]}>Shared</Text>
              </HapticPressable>
            </View>
          </View>
        </View>
      </View>

      {filteredGoals.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No goals yet</Text>
          <Text style={styles.emptySubtext}>Create your first goal to get started</Text>
          <HapticPressable onPress={handleAddGoal} style={[styles.addBtn, { backgroundColor: theme.accent }]}>
            <Text style={styles.addBtnText}>+ Add Goal</Text>
          </HapticPressable>
        </View>
      ) : (
        <FlatList
          data={filteredGoals}
          keyExtractor={(item) => item._flatListKey}
          renderItem={renderGoal}
          extraData={`${theme.accent}:${accentShadowColor}`}
          scrollEnabled={true}
          contentContainerStyle={[styles.list, { paddingBottom: 175 }]}
          showsVerticalScrollIndicator={false}
        />
      )}

      <View style={[styles.fab, fabDynamicStyle, { bottom: insets.bottom + 85 }]}>
        <HapticPressable
          style={styles.fabPressable}
          onPress={handleAddGoal}
          android_ripple={{ color: "#fff" }}
          accessibilityRole="button"
          accessibilityLabel="Add goal"
        >
          <Ionicons name="add" size={22} color="#fff" />
        </HapticPressable>
      </View>
    </Page>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "900",
    color: theme.text,
    fontFamily: 'CeraRoundProDEMO-Black',
    letterSpacing: 0.1,
  },
  headerButtons: {
    flexDirection: "row",
    gap: 8,
  },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: theme.radius,
    backgroundColor: theme.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  centerContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  list: {
    gap: 16,
  },
  headerWrapper: {
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: 24,
    borderWidth: 0,
    borderColor: '#d9e6f4',
    ...cpShadow({ color: "#000000", offset: { width: 0, height: 6 }, opacity: 0.16, radius: 0, elevation: 3 }),
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    minHeight: 44,
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
    backgroundColor: '#aaaaaa00',
    borderRadius: 18,
    padding: 8,
    flexWrap: 'nowrap',
    flexShrink: 1,
  },
  filterBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: '#dcdcdc',
    borderWidth: 1,
    borderColor: 'transparent',
    marginHorizontal: 0,
  },
  filterBtnActive: {
    backgroundColor: theme.accent,
    borderColor: theme.accent,
  },
  filterBtnText: {
    fontWeight: '900',
    color: "#ffffff",
    fontSize: 14,
    fontFamily: 'CeraRoundProDEMO-Black',
    letterSpacing: 0.1,
  },
  filterBtnTextActive: {
    color: "#ffffff",
  },
  goalCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: theme.surface,
    borderRadius: 28,
    paddingHorizontal: 10,
    paddingLeft: 10,
    paddingVertical: 6,
    //borderWidth: 3,
    borderColor: '#cdcdcd',
    ...cpShadow({ color: '#cdcdcd', offset: { width: 0, height: 6 }, opacity: 1, radius: 0, elevation: 2 }),
  },
  sharedGoalCard: {
    backgroundColor: '#ffffff',
  },
  goalMainPressable: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 8,
  },
  goalPlantPreviewWrap: {
    width: 56,
    height: 56,
    marginRight: 10,
    alignItems: 'center',
    justifyContent: 'flex-end',
    position: 'relative',
    backgroundColor: '#ffdc4e',
    borderRadius: 16,
    paddingBottom: 2,
  },
  goalPlantImage: {
    position: 'absolute',
    bottom: 20,
    width: 30,
    height: 36,
    zIndex: 2,
    elevation: 2,
  },
  goalPlantPot: {
    width: 34,
    height: 22,
    zIndex: 1,
  },
  goalContent: {
    flex: 1,
    paddingVertical: 2,
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
  goalStatusButtonDisabled: {
    opacity: 0.55,
  },
  goalButtonIconWrap: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sharedGoalButtonIcon: {
    minWidth: 30,
    height: 30,
    paddingHorizontal: 3,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  quantityButtonContent: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 7,
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
  quantitySegmentDone: {
    backgroundColor: 'rgba(255,255,255,1)',
  },
  quantitySegmentEmpty: {
    backgroundColor: 'rgb(183, 183, 183)',
  },
  goalButtonIcon: {
    left: 0,
    bottom: 0,
  },
  toggleButton: {
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  toggleButtonDone: {
    opacity: 1,
  },
  // Removed custom 3D button styles. Use only AnimatedButton props for 3D effect.
  goalName: {
    fontSize: 15,
    fontWeight: "900",
    color: theme.text,
    fontFamily: 'CeraRoundProDEMO-Black',
    letterSpacing: 0.1,
  },
  goalMeta: {
    fontSize: 11,
    fontWeight: "800",
    color: theme.muted,
    marginTop: 2,
    fontFamily: 'CeraRoundProDEMO-Black',
    letterSpacing: 0.1,
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: "900",
    color: theme.text,
    marginBottom: 8,
    fontFamily: 'CeraRoundProDEMO-Black',
    letterSpacing: 0.1,
  },
  emptySubtext: {
    fontSize: 14,
    fontWeight: "800",
    color: theme.muted,
    marginBottom: 24,
    textAlign: "center",
    fontFamily: 'CeraRoundProDEMO-Black',
    letterSpacing: 0.1,
  },
  addBtn: {
    borderRadius: theme.radius,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  addBtnText: {
    fontSize: 14,
    fontWeight: "900",
    color: theme.bg,
    fontFamily: 'CeraRoundProDEMO-Black',
    letterSpacing: 0.1,
  },
  goalCardDimmed: {
    opacity: 0.5,
  },
  goalNameDimmed: {
    color: theme.muted,
  },
  goalMetaDimmed: {
    color: theme.muted2 || theme.muted,
  },
  // Floating Action Button style (copied and adapted from GardenScreen)
  fab: {
    position: 'absolute',
    right: 16,
    width: 50,
    height: 50,
    borderRadius: 25,
    zIndex: 12000,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0)',
    elevation: 12000,
  },
  fabPressable: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  contributorOverlayLabel: {
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.1,
    includeFontPadding: false,
    fontFamily: 'CeraRoundProDEMO-Black',
  },
  // statusButtonContainer removed: not needed, handled by AnimatedButton props

});


