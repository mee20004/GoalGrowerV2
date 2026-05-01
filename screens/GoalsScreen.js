// ...existing code...
// screens/GoalsScreen.js
import React, { useState, useEffect, useRef } from "react";
import { View, Text, StyleSheet, Pressable, FlatList, ActivityIndicator, Image, Animated, Easing } from "react-native";
import * as Haptics from "expo-haptics";

import { getFirestore, collection, onSnapshot, query, where, getDocs, doc, updateDoc, runTransaction, setDoc, increment, arrayUnion, getDoc } from "firebase/firestore";
import { toggleGoalTransaction } from "../utils/goalToggleTransaction";
// import { getAuth } from "firebase/auth";
import { Ionicons } from "@expo/vector-icons";
import Page from "../components/Page";
import { theme } from "../theme";
import { PLANT_ASSETS } from "../constants/PlantAssets";
import { POT_ASSETS } from "../constants/PotAssets";
import { WALLPAPER_OPTIONS } from "../constants/WallpaperAssets";
import { useGoals, isScheduledOn, toKey, fromKey } from "../components/GoalsStore";
import { Alert } from "react-native";
import { db } from "../firebaseConfig";
import { auth } from "../firebaseConfig";
import { updateOverallScoresForSharedGardenMembers } from "../utils/scoreUtils";
import { subscribePersonalCustomizations, subscribeSharedCustomizations } from "../utils/customizationFirestore";
import { getAuth } from "firebase/auth";
import {
  calculateGoalStreak,
  getGrowthStage,
  getPlantHealthState,
  isGoalDoneForDate,
  isGoalScheduledOnDate,
} from "../utils/goalState";
// import { fromKey } from "../components/GoalsStore";
const STORAGE_PAGE_ID = 'storage';
const DEFAULT_PLANT_PREVIEW_COLOR = '#EEF6FF';

function GoalPlantPreview({ goal, getPlantHealthState, backdropColor = DEFAULT_PLANT_PREVIEW_COLOR }) {
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
  const { isDoneForDay, selectedDateKey } = useGoals();

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

  const startTapCooldown = (goalId, sharedGardenId, duration = 180) => {
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
      await toggleGoalTransaction({
        goal,
        selectedDateKey,
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

    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (user) {
        setLoading(true);
        const goalsRef = collection(DB, "users", user.uid, "goals");
        const layoutRef = collection(DB, "users", user.uid, "gardenLayout");

        unsubGoals = onSnapshot(goalsRef, (snapshot) => {
          const goalsData = snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          }));
          if (isMounted) setGoals(goalsData);
        });

        unsubPersonalCustomization = subscribePersonalCustomizations(user.uid, (data) => {
          if (isMounted) setPersonalCustomizations(data || {});
        });

        unsubLayout = onSnapshot(layoutRef, (snapshot) => {
          const layoutData = {};
          snapshot.docs.forEach((doc) => {
            layoutData[doc.id] = doc.data();
          });
          if (isMounted) setLayout(layoutData);
        });

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
            const unsub = onSnapshot(layoutCol, (snap) => {
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
            });
            unsubSharedLayouts.push(unsub);
          });
        });
        await Promise.all(promises);
        setLoading(false);

        return () => {
          if (unsubGoals) unsubGoals();
          if (unsubLayout) unsubLayout();
          if (unsubPersonalCustomization) unsubPersonalCustomization();
          unsubSharedLayouts.forEach((unsub) => unsub());
          unsubSharedCustomizations.forEach((unsub) => unsub());
        };
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
      if (unsubGoals) unsubGoals();
      if (unsubLayout) unsubLayout();
      if (unsubPersonalCustomization) unsubPersonalCustomization();
      unsubSharedLayouts.forEach((unsub) => unsub());
      unsubSharedCustomizations.forEach((unsub) => unsub());
      unsubscribe();
    };
  }, []);

  const handleAddGoal = () => {
    navigation.navigate("AddGoal");
  };

  const handleCalendar = () => {
    navigation.navigate("Calendar");
  };

  const handleGarden = () => {
    navigation.navigate("Garden");
  };

  const handleGoalPress = (goalId, sharedGardenId, ownerId, sourceGoalId) => {
    Haptics.selectionAsync().catch(() => {});
    if (sharedGardenId) {
      navigation.navigate("Goal", { goalId, sharedGardenId, ownerId, sourceGoalId });
    } else {
      navigation.navigate("Goal", { goalId });
    }
  };

  const triggerGoalButtonHaptic = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  };

  const triggerFilterHaptic = () => {
    Haptics.selectionAsync().catch(() => {});
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
    const isSharedMultiUserCompletion = !!item.sharedGardenId && isCompletion && !!item.multiUserWateringEnabled;
    const isSharedMultiUserQuantity = !!item.sharedGardenId && isQuantity && !!item.multiUserWateringEnabled;
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
    const requiredSharedContributors = (isSharedMultiUserCompletion || isSharedMultiUserQuantity)
      ? Math.max(2, Math.floor(Number(item.requiredContributors) || 2))
      : 1;
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
    const targetValue = isCompletion ? (isSharedMultiUserCompletion ? requiredSharedContributors : 1) : (item.measurable?.target ?? 0);
    // For shared multi-user quantity, always use the current user's value (optimistic if available, else Firestore)
    const currentValue = isSharedMultiUserQuantity
      ? currentUserQuantityValue
      : (!isSharedMultiUserCompletion && optimisticProgress)
        ? optimisticProgress.currentValue
        : baseCurrentValue;

    // --- Group-level completion: always use Firestore logs, never optimistic state ---
    const isDone = isSharedMultiUserQuantity
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
    const quantitySegmentCount = showQuantitySegments ? Math.max(1, Math.min(Math.floor(Number(targetValue) || 1), 6)) : 0;
    const safeQuantityCurrent = showQuantitySegments
      ? Math.max(0, Math.min(Number(currentValue) || 0, Number(targetValue) || 1))
      : 0;
    const filledQuantitySegments = showQuantitySegments
      ? Math.min(quantitySegmentCount, Math.ceil((safeQuantityCurrent / (Number(targetValue) || 1)) * quantitySegmentCount))
      : 0;

    // --- Button coloring (match GoalScreen) ---
    let buttonBgColor = '#f1f1f1';
    let buttonShadowColor = '#d6d6d6';
    let buttonIconColor = '#58cc02';
    if (isDone) {
      buttonBgColor = '#59d700';
      buttonShadowColor = '#4aa93a';
      buttonIconColor = '#ffffff';
    } else if (isSharedMultiUserCompletion && currentUserClicked) {
      buttonBgColor = '#8ef148';
      buttonShadowColor = '#73cf39';
      buttonIconColor = '#ffffff';
    } else if (isSharedMultiUserQuantity && isDone) {
      buttonBgColor = '#59d700';
      buttonShadowColor = '#4aa93a';
      buttonIconColor = '#ffffff';
    } else if (isSharedMultiUserQuantity && Number(currentValue) >= (quantityTargetValue || 1)) {
      buttonBgColor = '#8ef148';
      buttonShadowColor = '#73cf39';
      buttonIconColor = '#ffffff';
    } else if (isQuantity && Number(currentValue) >= (quantityTargetValue || 1)) {
      buttonBgColor = '#eef6e8';
      buttonShadowColor = '#c6d6b9';
      buttonIconColor = '#2f7d12';
    }

    // Determine if this goal is scheduled for the selected day
    const isForSelectedDay = isGoalScheduledOnDate(item, fromKey(selectedDateKey));
    const previewBackdropColor = getGoalPreviewBackdropColor(item);
    const actionButtonSize = (isSharedMultiUserCompletion || isSharedMultiUserQuantity) ? 58 : 55;
    const actionButtonRadius = (isSharedMultiUserCompletion || isSharedMultiUserQuantity) ? 22 : 22;
    const actionIconSize = (isSharedMultiUserCompletion || isSharedMultiUserQuantity) ? 30 : 28;

    // --- UI: Match GoalScreen shared quantity multi-user goal button/segments exactly ---
    return (
      <View style={[
        styles.goalCard,
        item.sharedGardenId ? styles.sharedGoalCard : null,
        !isForSelectedDay && styles.goalCardDimmed,
      ]}>
        <Pressable
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
        </Pressable>
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
          <Pressable
            hitSlop={8}
            onPressIn={() => {
              if (isForSelectedDay) triggerGoalButtonHaptic();
            }}
            onPress={() => isForSelectedDay && !isTapCoolingDown && handleToggleComplete(item, layout[item.id] || item.shelfPosition, item.sharedGardenId)}
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
              <View style={styles.quantityButtonContent}>
                <Text
                  style={[
                    styles.sharedQuantityProgressLabel,
                    { color: (Number(currentValue) >= quantityTargetValue) ? '#fff' : '#58cc02', fontWeight: 'bold', fontSize: 14 },
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
                        key={`${item._flatListKey}-quantity-segment-${index}`}
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
                      key={`${item._flatListKey}-quantity-segment-${index}`}
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
                  { color: (isDone || currentUserClicked) ? "#ffffff" : buttonIconColor, fontWeight: 'bold', fontSize: 14 },
                ]}
              >
                {contributorProgressLabel}
              </Text>
            ) : (
              <Ionicons name={isDone ? "close" : "checkmark"} size={actionIconSize} color={buttonIconColor} />
            )}
          </Pressable>
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
              <Pressable
                style={[styles.filterBtn, goalFilter === 'all' && styles.filterBtnActive]}
                onPress={() => {
                  triggerFilterHaptic();
                  setGoalFilter('all');
                }}
              >
                <Text style={[styles.filterBtnText, goalFilter === 'all' && styles.filterBtnTextActive]}>All</Text>
              </Pressable>
              <Pressable
                style={[styles.filterBtn, goalFilter === 'personal' && styles.filterBtnActive]}
                onPress={() => {
                  triggerFilterHaptic();
                  setGoalFilter('personal');
                }}
              >
                <Text style={[styles.filterBtnText, goalFilter === 'personal' && styles.filterBtnTextActive]}>Personal</Text>
              </Pressable>
              <Pressable
                style={[styles.filterBtn, goalFilter === 'shared' && styles.filterBtnActive]}
                onPress={() => {
                  triggerFilterHaptic();
                  setGoalFilter('shared');
                }}
              >
                <Text style={[styles.filterBtnText, goalFilter === 'shared' && styles.filterBtnTextActive]}>Shared</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>

      {filteredGoals.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No goals yet</Text>
          <Text style={styles.emptySubtext}>Create your first goal to get started</Text>
          <Pressable onPress={handleAddGoal} style={styles.addBtn}>
            <Text style={styles.addBtnText}>+ Add Goal</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={filteredGoals}
          keyExtractor={(item) => item._flatListKey}
          renderItem={renderGoal}
          scrollEnabled={true}
          contentContainerStyle={[styles.list, { paddingBottom: 175 }]}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Floating Add Button */}
      <Pressable
        style={styles.fab}
        onPress={() => navigation.navigate('AddGoal')}
        android_ripple={{ color: '#fff' }}
      >
        <Ionicons name="add" size={22} color="#fff" />
      </Pressable>
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
    shadowColor: '#4c6782',
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
    backgroundColor: '#28b900',
    borderColor: theme.accent,
  },
  filterBtnText: {
    fontWeight: '900',
    color: "#ffffff",
    fontSize: 14,
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
    shadowColor: '#cdcdcd',
    //borderColor: '#28b900',
    //shadowColor: '#28b900',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 2,
  },
  sharedGoalCard: {
    backgroundColor: '#ffffff', // subtle accent tint for shared goals
    //borderColor: '#a7efd4',
    //shadowColor: '#a7efd0',
    shadowColor: '#36ab44',
    elevation: 2,
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
  quantitySegmentFilled: {
    backgroundColor: '#58cc02',
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
  },
  goalMeta: {
    fontSize: 11,
    fontWeight: "800",
    color: theme.muted,
    marginTop: 2,
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
  },
  emptySubtext: {
    fontSize: 14,
    fontWeight: "800",
    color: theme.muted,
    marginBottom: 24,
    textAlign: "center",
  },
  addBtn: {
    backgroundColor: theme.accent,
    borderRadius: theme.radius,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  addBtnText: {
    fontSize: 14,
    fontWeight: "900",
    color: theme.bg,
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
    bottom: 100,
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgb(82, 153, 61)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 12000,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0)',
    elevation: 12000,
    shadowColor: '#2c6e28',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 1,
    shadowRadius: 0,
  },
  contributorOverlayLabel: {
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0,
    includeFontPadding: false,
  },
  // statusButtonContainer removed: not needed, handled by AnimatedButton props

});


