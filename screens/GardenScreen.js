import React, { useState, useCallback, useRef, useEffect, memo } from "react";
import {
  View, Text, StyleSheet, ActivityIndicator, ScrollView, FlatList,
  Animated, Platform, UIManager, LayoutAnimation, PanResponder, Image, ImageBackground, useWindowDimensions, Modal, TextInput, Alert, Easing,
} from "react-native";
import HapticPressable from "../components/HapticPressable";
import HapticTouchableOpacity from "../components/HapticTouchableOpacity";
import { triggerSelectionHaptic, triggerLightHaptic, triggerMediumHaptic } from "../utils/haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StackActions } from "@react-navigation/native";
import { collection, doc, onSnapshot, setDoc, writeBatch, increment, updateDoc, getDoc, getDocs, arrayUnion, query, where, deleteDoc, runTransaction, deleteField } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "../firebaseConfig";
import Ionicons from "@expo/vector-icons/Ionicons";
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import * as solidIcons from '@fortawesome/free-solid-svg-icons';
import { LinearGradient } from "expo-linear-gradient";

import { PLANT_ASSETS } from "../constants/PlantAssets";
import { POT_ASSETS } from "../constants/PotAssets";
import { FAR_BG_ASSETS } from "../constants/FarBGAssets";
import { FRAME_ASSETS } from "../constants/FrameAssets";
import { WALLPAPER_ASSETS } from "../constants/WallpaperAssets";
import { SHELF_COLOR_SCHEMES } from "../constants/ShelfColors";

import CustomizationScreen from "../components/CustomizationScreen";
import { toKey, useGoals } from "../components/GoalsStore";
import { useSubscription } from "../components/SubscriptionProvider";
import {
  canAddGardenPage,
  canCreateSharedGarden,
  canJoinSharedGarden,
  showSubscriptionLimitAlert,
  tryNavigateToAddGoal,
} from "../utils/subscriptionLimits";

import {
  subscribeSharedCustomizations,
  saveSharedCustomizations,
  subscribePersonalCustomizations,
  savePersonalCustomizations,
} from "../utils/customizationFirestore";

import { useFocusEffect } from "@react-navigation/native";
import { recordQuestActivity } from "../utils/questEngine";
import {
  updateOverallScoreForUser,
  updateOverallScoresForSharedGardenMembers,
} from "../utils/scoreUtils";
import { cardShadow, cpShadow, hardDropShadowSm } from "../utils/shadows";

import theme, { useTheme } from "../theme";

import {
  calculateGoalStreak,
  getGrowthStage,
  getPlantHealthState,
  getRequiredContributors,
  isGoalDoneForDate,
  isGoalScheduledOnDate,
} from "../utils/goalState";

import { toggleGoalTransaction } from "../utils/goalToggleTransaction";

// --- TROPHY STORAGE SLOT FINDERS (DEBUG) ---
async function findFirstOpenStorageSlot(uid, goalId) {
  const layoutSnap = await getDocs(collection(db, "users", uid, "gardenLayout"));
  const occupied = new Set();
  const occupiedBy = {};

  layoutSnap.forEach((layoutDoc) => {
    if (layoutDoc.id === goalId) return;
    const shelfPosition = layoutDoc.data()?.shelfPosition;
    if (shelfPosition?.pageId === STORAGE_PAGE_ID) {
      const key = `${shelfPosition.shelfName}_${shelfPosition.slotIndex}`;
      occupied.add(key);
      occupiedBy[key] = layoutDoc.id;
    }
  });
  console.log('[TROPHY DEBUG] Occupied trophy slots (personal):', Array.from(occupied), occupiedBy);

  for (let shelfIdx = 0; shelfIdx < STORAGE_SHELF_COUNT; shelfIdx += 1) {
    const shelfName = `storageShelf_${shelfIdx}`;
    for (let slotIndex = 0; slotIndex < 4; slotIndex += 1) {
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
  const occupiedBy = {};

  layoutSnap.forEach((layoutDoc) => {
    if (layoutDoc.id === goalId) return;
    const shelfPosition = layoutDoc.data()?.shelfPosition;
    if (shelfPosition?.pageId === STORAGE_PAGE_ID) {
      const key = `${shelfPosition.shelfName}_${shelfPosition.slotIndex}`;
      occupied.add(key);
      occupiedBy[key] = layoutDoc.id;
    }
  });
  console.log('[TROPHY DEBUG] Occupied trophy slots (shared):', Array.from(occupied), occupiedBy);

  for (let shelfIdx = 0; shelfIdx < STORAGE_SHELF_COUNT; shelfIdx += 1) {
    const shelfName = `storageShelf_${shelfIdx}`;
    for (let slotIndex = 0; slotIndex < 4; slotIndex += 1) {
      const key = `${shelfName}_${slotIndex}`;
      if (!occupied.has(key)) {
        return { pageId: STORAGE_PAGE_ID, shelfName, slotIndex };
      }
    }
  }

  return null;
}

// Persist some state across mounts (helps keep drawer position & current page stable)
const persistedGardenState = {
  allPlants: null,
  currentPageId: null,
  isEditing: false,
  drawerScrollOffset: 0,
};
// Ref to prevent multiple restriction alerts
let editRestrictionAlertShown = { current: false };

const FAR_BG = require('../assets/far_background.png');
const GARDEN_MASCOT = require('../assets/mascot/mascot.png');
// Asset arrays are now imported from constants
const STORAGE_PAGE_ID = 'storage';
const STORAGE_SHELF_COUNT = 10;
const PLANT_GHOST_SIZE = 110;
const SHARED_GARDEN_DEFAULT_PAGE_ID = 'default';
const MULTI_USER_MIN_WATERERS = 2;
const SHARED_EDIT_LOCK_MS = 45000;
const SHARED_EDIT_LOCK_RENEW_MS = 15000;

// --- FONT AWESOME ICONS ---
const FONT_AWESOME_ICONS = Object.entries(solidIcons)
  .filter(([key, value]) => key.startsWith('fa') && value.iconName)
  .reduce((acc, [key, value]) => {
    acc[value.iconName] = value;
    return acc;
  }, {});

function GoalIcon({ name, size, color }) {
  const iconDef = FONT_AWESOME_ICONS[name] || FONT_AWESOME_ICONS['star'];
  return <FontAwesomeIcon icon={iconDef} size={size} color={color} />;
}

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const POT_IMAGE = require('../assets/plants/pot.png');
const TROPHY_POT_IMAGES = {
  bronze: require('../assets/plants/pot_b.png'),
  silver: require('../assets/plants/pot_s.png'),
  gold: require('../assets/plants/pot_g.png'),
  platinum: require('../assets/plants/pot_p.png'),
};
const TROPHY_BADGE_IMAGES = {
  bronze: require('../assets/Icons/Badge_Bronze.png'),
  silver: require('../assets/Icons/Badge_Silver.png'),
  gold: require('../assets/Icons/Badge_Gold.png'),
  platinum: require('../assets/Icons/Badge_Platinum.png'),
};

function getStoragePlantRating(plant) {
  if (plant?.shelfPosition?.pageId !== STORAGE_PAGE_ID) return null;

  const longestStreak = Number(plant?.longestStreak) || 0;
  const healthLevel = 5;

  if (longestStreak >= 24 && healthLevel >= 5) return 'platinum';
  if (longestStreak >= 18 && healthLevel >= 4) return 'gold';
  if (longestStreak >= 7 && healthLevel >= 3) return 'silver';
  return 'bronze';
}

function getTrophyBadgeSource(rating) {
  return TROPHY_BADGE_IMAGES[rating] || null;
}


const TROPHY_PARTICLE_COLORS = {
  bronze: ['rgba(242, 196, 145, 0.95)', 'rgba(255, 220, 184, 0.9)', 'rgba(247, 177, 115, 0.92)'],
  silver: ['rgba(237, 242, 255, 0.96)', 'rgba(213, 224, 255, 0.9)', 'rgba(196, 214, 255, 0.92)'],
  gold: ['rgba(255, 249, 179, 1)', 'rgba(255, 224, 120, 0.95)', 'rgba(255, 238, 153, 0.96)'],
  platinum: ['rgba(221, 245, 255, 1)', 'rgba(189, 226, 255, 0.96)', 'rgba(226, 213, 255, 0.94)'],
};

const TROPHY_PARTICLE_PRESETS = {
  bronze: {
    count: 3,
    xRange: [0, 78],
    yRange: [38, 76],
    travelRange: [14, 34],
    driftRange: [-12, 12],
    sizeRange: [4, 7],
    speedRange: [0.82, 1],
    durationRange: [1200, 1900],
    waitRange: [30, 180],
    opacityCurve: [0.05, 0.95, 0.7, 0],
    scaleCurve: [0.45, 1.05, 0.65],
    glowChance: 0,
    orbitCount: 0,
    orbitRadiusRange: [12, 18],
    orbitSizeRange: [1.8, 2.8],
    orbitDurationRange: [2200, 3000],
  },
  silver: {
    count: 5,
    xRange: [-2, 80],
    yRange: [36, 80],
    travelRange: [18, 42],
    driftRange: [-16, 16],
    sizeRange: [4.5, 8],
    speedRange: [0.9, 1.08],
    durationRange: [980, 1650],
    waitRange: [20, 120],
    opacityCurve: [0.06, 1, 0.78, 0],
    scaleCurve: [0.5, 1.15, 0.72],
    glowChance: 0.35,
    orbitCount: 3,
    orbitRadiusRange: [14, 22],
    orbitSizeRange: [2, 3.2],
    orbitDurationRange: [1800, 2600],
  },
  gold: {
    count: 7,
    xRange: [-4, 82],
    yRange: [34, 82],
    travelRange: [22, 52],
    driftRange: [-22, 22],
    sizeRange: [5, 9.5],
    speedRange: [0.95, 1.18],
    durationRange: [820, 1380],
    waitRange: [10, 80],
    opacityCurve: [0.08, 1, 0.84, 0],
    scaleCurve: [0.55, 1.25, 0.78],
    glowChance: 0.62,
    orbitCount: 5,
    orbitRadiusRange: [16, 28],
    orbitSizeRange: [2.2, 3.8],
    orbitDurationRange: [1300, 2200],
  },
  platinum: {
    count: 8,
    xRange: [-6, 84],
    yRange: [32, 84],
    travelRange: [24, 56],
    driftRange: [-24, 24],
    sizeRange: [5.2, 10],
    speedRange: [0.98, 1.24],
    durationRange: [760, 1280],
    waitRange: [8, 60],
    opacityCurve: [0.1, 1, 0.88, 0],
    scaleCurve: [0.58, 1.3, 0.82],
    glowChance: 0.72,
    orbitCount: 6,
    orbitRadiusRange: [18, 30],
    orbitSizeRange: [2.4, 4.1],
    orbitDurationRange: [1150, 2000],
  },
};

const randomBetween = (min, max) => min + Math.random() * (max - min);
const randomInt = (min, max) => Math.floor(randomBetween(min, max + 1));

const buildRandomParticle = (rating, idx) => {
  const preset = TROPHY_PARTICLE_PRESETS[rating] || TROPHY_PARTICLE_PRESETS.bronze;
  const colors = TROPHY_PARTICLE_COLORS[rating] || TROPHY_PARTICLE_COLORS.bronze;
  const isGlow = Math.random() < preset.glowChance;
  const size = randomBetween(preset.sizeRange[0], preset.sizeRange[1]);

  return {
    x: randomBetween(preset.xRange[0], preset.xRange[1]),
    y: randomBetween(preset.yRange[0], preset.yRange[1]),
    travel: randomBetween(preset.travelRange[0], preset.travelRange[1]),
    drift: randomBetween(preset.driftRange[0], preset.driftRange[1]),
    size,
    speedFactor: randomBetween(preset.speedRange[0], preset.speedRange[1]),
    duration: randomInt(preset.durationRange[0], preset.durationRange[1]),
    waitMs: randomInt(preset.waitRange[0], preset.waitRange[1]),
    opacityCurve: preset.opacityCurve,
    scaleCurve: preset.scaleCurve,
    isGlow,
    glowRadius: isGlow ? size * randomBetween(8, 14) : size * randomBetween(2, 4),
    glowOpacity: isGlow ? 1.0 : randomBetween(0.5, 0.8),
    color: colors[randomInt(0, colors.length - 1)],
  };
};

const buildOrbitParticle = (rating, idx) => {
  const preset = TROPHY_PARTICLE_PRESETS[rating] || TROPHY_PARTICLE_PRESETS.bronze;
  const colors = TROPHY_PARTICLE_COLORS[rating] || TROPHY_PARTICLE_COLORS.bronze;
  const size = randomBetween(preset.orbitSizeRange[0], preset.orbitSizeRange[1]);
  const glowBoost = rating === 'platinum' ? 4 : rating === 'gold' ? 3.5 : rating === 'silver' ? 2.5 : 1.8;

  return {
    key: `orbit-${rating}-${idx}-${Date.now()}-${Math.round(Math.random() * 100000)}`,
    radius: randomBetween(preset.orbitRadiusRange[0], preset.orbitRadiusRange[1]),
    size,
    startAngle: randomBetween(-180, 180),
    direction: Math.random() < 0.5 ? 1 : -1,
    duration: randomInt(preset.orbitDurationRange[0], preset.orbitDurationRange[1]),
    color: colors[randomInt(0, colors.length - 1)],
    glowRadius: size * randomBetween(6, 12) * glowBoost,
    glowOpacity: Math.min(randomBetween(0.9, 1.0) * glowBoost, 1.0),
  };
};

const buildOrbitParticles = (rating) => {
  const preset = TROPHY_PARTICLE_PRESETS[rating] || TROPHY_PARTICLE_PRESETS.bronze;
  return Array.from({ length: preset.orbitCount || 0 }, (_, idx) => buildOrbitParticle(rating, idx));
};

const buildRandomParticles = (rating) => {
  const preset = TROPHY_PARTICLE_PRESETS[rating] || TROPHY_PARTICLE_PRESETS.bronze;
  const count = preset.count;
  return Array.from({ length: count }, (_, idx) => buildRandomParticle(rating, idx));
};

const TrophyParticles = ({ rating }) => {
  const [particles, setParticles] = useState(() => buildRandomParticles(rating));
  const [orbitParticles, setOrbitParticles] = useState(() => buildOrbitParticles(rating));
  const progressRefs = useRef([]);
  const orbitProgressRefs = useRef([]);
  const beamAnim = useRef(new Animated.Value(0)).current;
  const burstAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    setParticles(buildRandomParticles(rating));
    setOrbitParticles(buildOrbitParticles(rating));
  }, [rating]);

  return (
    <View pointerEvents="none" style={styles.particleLayer}>
      {particles.map((particle, idx) => {
        const progress = progressRefs.current[idx] || new Animated.Value(0);
        const shiftedProgress = progress.interpolate({ inputRange: [0, 1], outputRange: [0, particle.speedFactor], extrapolate: 'clamp' });
        const opacity = shiftedProgress.interpolate({
          inputRange: [0, 0.2, 0.7, 1],
          outputRange: particle.opacityCurve || [0.05, 0.95, 0.7, 0],
          extrapolate: 'clamp',
        });
        const scale = shiftedProgress.interpolate({
          inputRange: [0, 0.4, 1],
          outputRange: particle.scaleCurve || [0.45, 1.05, 0.65],
          extrapolate: 'clamp',
        });
        const translateY = shiftedProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [0, -particle.travel],
          extrapolate: 'clamp',
        });
        const translateX = shiftedProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [0, particle.drift],
          extrapolate: 'clamp',
        });

        return (
          <Animated.View
            key={particle.key || `${rating}-particle-${idx}`}
            style={[
              styles.particleDot,
              {
                left: particle.x,
                bottom: particle.y,
                width: particle.size,
                height: particle.size,
                borderRadius: particle.size / 2,
                backgroundColor: particle.color,
                shadowColor: particle.color,
                shadowOpacity: particle.glowOpacity || 0,
                shadowRadius: particle.glowRadius || 0,
                shadowOffset: { width: 0, height: 0 },
                opacity,
                transform: [{ translateX }, { translateY }, { scale }],
              },
            ]}
          />
        );
      })}
    </View>
  );
}

// --- GARDEN AMBIENT PARTICLES ---
const AMBIENT_COUNT = 20;
const buildAmbientParticle = (idx) => ({
  key: `ambient-${idx}-${Date.now()}`,
  x: Math.random() * 90,
  startY: 15 + Math.random() * 70,
  size: 5 + Math.random() * 4,
  duration: 4000 + Math.random() * 4000,
  drift: (Math.random() - 0.5) * 40,
  travel: 40 + Math.random() * 60,
  delay: Math.random() * 3000,
});

const GardenAmbientParticles = () => {
  const particles = useRef(Array.from({ length: AMBIENT_COUNT }, (_, i) => buildAmbientParticle(i))).current;
  const anims = useRef(particles.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    let active = true;
    const loops = anims.map((anim, i) => {
      const loop = Animated.loop(
        Animated.timing(anim, {
          toValue: 1,
          duration: particles[i].duration,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      );
      const t = setTimeout(() => { if (active) loop.start(); }, particles[i].delay);
      return { loop, t };
    });
    return () => {
      active = false;
      loops.forEach(({ loop, t }) => { clearTimeout(t); loop.stop(); });
    };
  }, []);

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { zIndex: 9998, elevation: 9998 }]}>
      {particles.map((p, i) => {
        const opacity = anims[i].interpolate({ inputRange: [0, 0.15, 0.75, 1], outputRange: [0, 0.85, 0.65, 0] });
        const translateY = anims[i].interpolate({ inputRange: [0, 1], outputRange: [0, -p.travel] });
        const translateX = anims[i].interpolate({ inputRange: [0, 1], outputRange: [0, p.drift] });
        return (
          <Animated.View
            key={p.key}
            style={{
              position: 'absolute',
              left: `${p.x}%`,
              top: `${p.startY}%`,
              width: p.size,
              height: p.size,
              borderRadius: p.size / 2,
              backgroundColor: 'rgba(255, 255, 255, 0.72)',
              shadowColor: '#ffffff00',
              shadowOpacity: 0.9,
              shadowRadius: 4,
              shadowOffset: { width: 0, height: 0 },
              opacity,
              transform: [{ translateX }, { translateY }],
            }}
          />
        );
      })}
    </View>
  );
};

// --- 1. PLANT VISUAL COMPONENT ---

const PlantVisual = ({ plant, isDraggingHighlight, educationDemo }) => {
  const total = Number(plant.totalCompletions) || 0;
  // Only use getStoragePlantRating for badge visuals, not for health
  const isTrophy = plant?.shelfPosition?.pageId === STORAGE_PAGE_ID;
  const rating = isTrophy ? getStoragePlantRating(plant) : null;

  // Always use calculated healthLevel for today for ALL plants (matches GoalScreen)
  const today = new Date();
  const displayHealthState = getPlantHealthState(plant, today, auth.currentUser?.uid);
  const healthLevel = displayHealthState.healthLevel;

  const swayAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(swayAnim, { toValue: 1,  duration: 600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(swayAnim, { toValue: -1, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(swayAnim, { toValue: 0,  duration: 1200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    const timer = setTimeout(() => loop.start(), Math.random() * 1500);
    return () => { clearTimeout(timer); loop.stop(); swayAnim.setValue(0); };
  }, [swayAnim]);


  // --- Use the exact same logic as GoalPlantPreview for plant image selection ---
  const stage = getGrowthStage(plant?.totalCompletions);
  const { status } = getPlantHealthState(plant, new Date(), auth.currentUser?.uid);
  const species = plant?.plantSpecies || ((plant?.type !== "completion" && plant?.type !== "quantity") ? plant?.type : "fern");
  const speciesAssets = PLANT_ASSETS[species] || PLANT_ASSETS.fern;

  const resolveEducationDemoSource = () => {
    if (!educationDemo) return null;
    if (educationDemo.mode === "growth") {
      const stageKeys = ["stage1", "stage2", "stage3", "stage4"];
      const demoStage = stageKeys[educationDemo.frame] || "stage1";
      return speciesAssets?.[demoStage]?.alive || PLANT_ASSETS.fern?.stage1?.alive;
    }
    if (educationDemo.mode === "health") {
      if (educationDemo.frame === 1) {
        return speciesAssets?.[stage]?.dying || speciesAssets?.[stage]?.dry || speciesAssets?.[stage]?.alive;
      }
      return speciesAssets?.[stage]?.alive || PLANT_ASSETS.fern?.stage1?.alive;
    }
    return null;
  };

  const educationDemoSource = resolveEducationDemoSource();
  const plantSource = educationDemoSource
    || speciesAssets?.[stage]?.[status]
    || speciesAssets?.[stage]?.alive
    || PLANT_ASSETS.fern?.stage1?.alive;

  // Use the potType or potStyle field from the plant/goal, fallback to default
  let potKey = plant.potType || plant.potStyle || "default";
  let potSource = POT_ASSETS[potKey] || POT_ASSETS["default"];
  const showTrophyParticles = Boolean(rating);
  const trophyBadgeSource = getTrophyBadgeSource(rating);
  const todayKey = toKey(today);
  const isScheduledToday = isGoalScheduledOnDate(plant, today);
  const isSharedMultiUserCompletion = !!plant?.multiUserWateringEnabled && plant?.gardenType === "shared" && (plant?.type || plant?.kind) === "completion";
  const isSharedMultiUserQuantity = !!plant?.multiUserWateringEnabled && plant?.gardenType === "shared" && (plant?.type || plant?.kind) === "quantity";
  const isQuantityGoal = (plant?.type || plant?.kind) === "quantity";
  const currentUserId = auth.currentUser?.uid;
  const todayQuantityLog = plant?.logs?.quantity?.[todayKey] || {};
  let quantityLogs = {};
  if (isSharedMultiUserQuantity && typeof todayQuantityLog.users === 'object' && todayQuantityLog.users !== null) {
    quantityLogs = todayQuantityLog.users;
  }
  const quantityTargetForBadge = isQuantityGoal
    ? Math.max(1, Math.floor(Number(plant?.measurable?.target) || 1))
    : 0;
  let contributorQuantityCount = 0;
  if (isSharedMultiUserQuantity) {
    const allContributors = Array.isArray(plant.contributors)
      ? plant.contributors
      : Object.keys(quantityLogs);
    contributorQuantityCount = allContributors.filter((userId) => Number(quantityLogs[userId]) >= quantityTargetForBadge).length;
  }
  const requiredContributorsForBadge = (isSharedMultiUserCompletion || isSharedMultiUserQuantity)
    ? Math.max(2, Math.floor(Number(plant.requiredContributors) || 2))
    : 1;
  const contributorUsersMap = isSharedMultiUserCompletion ? (plant?.logs?.completion?.[todayKey]?.users || {}) : {};
  const currentContributors = isSharedMultiUserCompletion
    ? Object.keys(contributorUsersMap).filter((id) => !!contributorUsersMap[id]).length
    : 0;
  const firestoreUserValue = Number(quantityLogs[currentUserId]) || 0;
  const isGoalDoneToday = isSharedMultiUserQuantity
    ? (() => {
        const allContributors = Array.isArray(plant.contributors)
          ? plant.contributors
          : Object.keys(quantityLogs);
        const userDoneCount = allContributors.filter((userId) => Number(quantityLogs[userId]) >= quantityTargetForBadge).length;
        return userDoneCount >= requiredContributorsForBadge;
      })()
    : isSharedMultiUserCompletion
      ? (currentContributors >= requiredContributorsForBadge)
      : isGoalDoneForDate(plant, todayKey);
  const currentUserContributedToday = isSharedMultiUserCompletion
    ? !!contributorUsersMap[currentUserId]
    : isSharedMultiUserQuantity
      ? firestoreUserValue >= quantityTargetForBadge
      : false;
  const showCompletionBadge = plant?.shelfPosition?.pageId !== STORAGE_PAGE_ID;
  // Progress bar logic
  const progressCurrentValue = isSharedMultiUserCompletion
    ? Math.min(currentContributors, requiredContributorsForBadge)
    : isSharedMultiUserQuantity
      ? Math.min(contributorQuantityCount, requiredContributorsForBadge)
      : isQuantityGoal
        ? Math.max(0, Math.min(Number(plant?.logs?.quantity?.[todayKey]?.value) || 0, quantityTargetForBadge))
        : (isGoalDoneToday ? 1 : 0);
  const progressTargetValue = (isSharedMultiUserCompletion || isSharedMultiUserQuantity)
    ? requiredContributorsForBadge
    : isQuantityGoal
      ? quantityTargetForBadge
      : 1;
  const progressFillRatio = progressTargetValue > 0
    ? Math.max(0, Math.min(progressCurrentValue / progressTargetValue, 1))
    : 0;
  const completionBadgeLabel = isSharedMultiUserCompletion
    ? `${Math.min(currentContributors, requiredContributorsForBadge)}/${requiredContributorsForBadge}`
    : isSharedMultiUserQuantity
      ? `${Math.min(contributorQuantityCount, requiredContributorsForBadge)}/${requiredContributorsForBadge}`
      : null;
  const completionBadgeIcon = isGoalDoneToday ? 'checkmark' : 'remove';
  const [displayedPlantSource, setDisplayedPlantSource] = useState(plantSource);
  const swapScaleAnim = useRef(new Animated.Value(1)).current;
  const previousSourceRef = useRef(plantSource);

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

  const getPotIcon = () => {
    if (plant.icon) return plant.icon;
    if (plant.goalIcon) return plant.goalIcon;
    return plant.type === 'coding' ? 'code' : 'target';
  };

  // --- UI: Two bars for shared multi-user quantity ---
  const showDualBars = isSharedMultiUserQuantity;
  const userBarRatio = quantityTargetForBadge > 0 ? Math.max(0, Math.min(firestoreUserValue / quantityTargetForBadge, 1)) : 0;
  const groupBarRatio = requiredContributorsForBadge > 0 ? Math.max(0, Math.min(contributorQuantityCount / requiredContributorsForBadge, 1)) : 0;
  // --- Use healthLevel for any visuals here if needed ---
  // Example: <Text>Health: {healthLevel}</Text>
  return (
    <View style={styles.plantAssemblyWrapper}>
      <View style={styles.plantAssembly}>
        {showTrophyParticles && (
          <View style={styles.trophyEffectsUnderPot}>
            <TrophyParticles rating={rating} />
          </View>
        )}
        <ImageBackground source={potSource} style={styles.potBackground} imageStyle={styles.potImageTexture} resizeMode="contain">
          <Animated.Image
            source={displayedPlantSource}
            style={[
              styles.plantImage,
              isDraggingHighlight && styles.draggingShadow,
              {
                transform: [
                  { translateY: 42.5 },
                  { rotate: swayAnim.interpolate({ inputRange: [-1, 1], outputRange: ['-4deg', '6deg'] }) },
                  { scale: swapScaleAnim },
                  { translateY: -42.5 },
                ],
              },
            ]}
            resizeMode="contain"
          />
          <View style={styles.potLabel}>
            <GoalIcon name={getPotIcon()} size={18} color="#fff" />
          </View>
          {trophyBadgeSource ? (
            <Image source={trophyBadgeSource} style={styles.trophyTierBadgeIcon} resizeMode="contain" />
          ) : null}
        </ImageBackground>
      </View>
      {(plant.title || plant.name) ? (
        <Text style={styles.plantNameLabel} numberOfLines={1} ellipsizeMode="tail">
          {plant.title || plant.name}
        </Text>
      ) : null}
      {showCompletionBadge && (
        <View style={[styles.plantProgressWrap, !isScheduledToday && styles.completionPotBadgeInactive]}>
          {showDualBars ? (
            <View style={{ marginTop: 10 }}>
              {/* User bar */}
              <View style={[styles.plantProgressTrack, { marginBottom: 4 }]}> 
                <View
                  style={[
                    styles.plantProgressFill,
                    { width: `${Math.max(0, Math.min(userBarRatio * 100, 100))}%` },
                    firestoreUserValue >= quantityTargetForBadge
                      ? styles.plantProgressFillSharedSelf
                      : styles.plantProgressFillQuantity,
                  ]}
                />
              </View>
              {/* Group bar */}
              <View style={styles.plantProgressTrack}>
                <View
                  style={[
                    styles.plantProgressFill,
                    { width: `${Math.max(0, Math.min(groupBarRatio * 100, 100))}%` },
                    isGoalDoneToday
                      ? styles.plantProgressFillDone
                      : styles.plantProgressFillShared,
                  ]}
                />
              </View>
            </View>
          ) : (
            <>
              <View style={styles.plantProgressTrack}>
                <View
                  style={[
                    styles.plantProgressFill,
                    {
                      width: `${Math.max(0, Math.min(progressFillRatio * 100, 100))}%`,
                    },
                    isGoalDoneToday
                      ? styles.plantProgressFillDone
                      : isSharedMultiUserCompletion
                        ? (currentUserContributedToday ? styles.plantProgressFillSharedSelf : styles.plantProgressFillShared)
                      : isQuantityGoal && progressCurrentValue > 0
                        ? styles.plantProgressFillQuantity
                        : styles.plantProgressFillPending,
                  ]}
                />
              </View>
              {(isSharedMultiUserCompletion || isSharedMultiUserQuantity) ? (
                <Text style={styles.sharedProgressLabel}>{completionBadgeLabel}</Text>
              ) : null}
            </>
          )}
        </View>
      )}
    </View>
  );
};

// --- 2. DRAGGABLE WRAPPER ---
const DraggablePlant = memo(({ plant, isEditing, wiggleAnim, onLongPress, onDragStart, onDragEnd, onDelete, onPlantTap, globalPan, globalDragRef, disabled = false, onCompletionTargetRef, instantDrag = false, educationDemo = null }) => {
  const [isHidden, setIsHidden] = useState(false);
  const latestProps = useRef({ plant, onDragStart, onDragEnd, onDelete, onPlantTap, isEditing, instantDrag });
  latestProps.current = { plant, onDragStart, onDragEnd, onDelete, onPlantTap, isEditing, instantDrag };

  const longPressTriggeredRef = useRef(false);
  const responderClaimedRef = useRef(false);
  const longPressTimeoutRef = useRef(null);
  const dragStartedRef = useRef(false);
  const dragFinalizedRef = useRef(false);
  const dragStartPendingRef = useRef(false);
  const dragStartShelfPositionRef = useRef(null);
  const dragOriginRef = useRef({ x: 0, y: 0 });
  const lastTouchRef = useRef({ x: 0, y: 0, lx: 0, ly: 0 });

  const clearLongPressTimeout = () => {
    if (longPressTimeoutRef.current) {
      clearTimeout(longPressTimeoutRef.current);
      longPressTimeoutRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      clearLongPressTimeout();
    };
  }, []);

  const startDrag = async ({ pageX, pageY, locationX, locationY } = {}) => {
    if (dragStartedRef.current || globalDragRef.current || dragStartPendingRef.current) return;
    const { x, y, lx, ly } = lastTouchRef.current;
    const touch = {
      pageX: pageX ?? x,
      pageY: pageY ?? y,
      locationX: locationX ?? lx,
      locationY: locationY ?? ly,
    };

    setIsHidden(true);
    dragStartedRef.current = true;
    dragFinalizedRef.current = false;
    dragStartShelfPositionRef.current = latestProps.current.plant?.shelfPosition
      ? { ...latestProps.current.plant.shelfPosition }
      : null;

    dragOriginRef.current = { x: touch.pageX, y: touch.pageY };
    dragStartPendingRef.current = true;
    try {
      const didStart = await latestProps.current.onDragStart(
        latestProps.current.plant,
        touch.pageX,
        touch.pageY,
        touch.locationX,
        touch.locationY
      );
      if (didStart === false) {
        dragStartedRef.current = false;
        dragFinalizedRef.current = false;
        dragStartShelfPositionRef.current = null;
        setIsHidden(false);
      }
    } finally {
      dragStartPendingRef.current = false;
    }
  };

  const finalizeDrag = (moveX, moveY) => {
    if (!dragStartedRef.current || dragFinalizedRef.current) return;
    dragFinalizedRef.current = true;
    longPressTriggeredRef.current = false;
    latestProps.current.onDragEnd(latestProps.current.plant, moveX, moveY, dragStartShelfPositionRef.current, () => {
      setIsHidden(false);
    });
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => {
        // Do NOT claim the responder immediately on touch start unless
        // `instantDrag` is enabled. Let the parent navigator handle
        // horizontal swipe gestures that begin on top of a plant.
        if (disabled || globalDragRef.current) return false;
        return !!latestProps.current.instantDrag;
      },
      onMoveShouldSetPanResponder: (_, gesture) => {
        if (disabled) return false;
        // Allow dragging immediately once edit mode is active, or once a long-press has been triggered
        if (longPressTriggeredRef.current) return true;
        if (latestProps.current.instantDrag) {
          return !globalDragRef.current && (Math.abs(gesture.dx) > 3 || Math.abs(gesture.dy) > 3);
        }
        return latestProps.current.isEditing && !globalDragRef.current && (Math.abs(gesture.dx) > 1 || Math.abs(gesture.dy) > 1);
      },
      onPanResponderGrant: (evt) => {
        evt.persist?.();
        responderClaimedRef.current = true;
        const { pageX, pageY, locationX, locationY } = evt.nativeEvent;
        lastTouchRef.current = { x: pageX, y: pageY, lx: locationX, ly: locationY };

        if (latestProps.current.instantDrag || latestProps.current.isEditing || longPressTriggeredRef.current) {
          startDrag(lastTouchRef.current);
        } else {
          longPressTriggeredRef.current = false;
          dragStartedRef.current = false;
          clearLongPressTimeout();
          longPressTimeoutRef.current = setTimeout(() => {
            longPressTriggeredRef.current = true;
            triggerMediumHaptic();
            startDrag(lastTouchRef.current);
          }, 400);
        }
      },
      onPanResponderMove: (evt, gesture) => {
        evt.persist?.();
        lastTouchRef.current = {
          x: evt.nativeEvent.pageX,
          y: evt.nativeEvent.pageY,
          lx: evt.nativeEvent.locationX,
          ly: evt.nativeEvent.locationY,
        };
        if (dragStartedRef.current) {
          Animated.event([null, { dx: globalPan.x, dy: globalPan.y }], { useNativeDriver: false })(evt, gesture);
        }
      },
      onPanResponderTerminationRequest: () => false,
      onPanResponderRelease: (_, gesture) => {
        if (longPressTimeoutRef.current) {
          clearTimeout(longPressTimeoutRef.current);
          longPressTimeoutRef.current = null;
        }
        if (dragStartedRef.current) {
          finalizeDrag(gesture.moveX ?? lastTouchRef.current.x, gesture.moveY ?? lastTouchRef.current.y);
        } else if (!longPressTriggeredRef.current && !latestProps.current.isEditing) {
          // If the gesture moved significantly, treat it as a swipe/drag cancel
          const moved = Math.abs(gesture.dx || 0) > 10 || Math.abs(gesture.dy || 0) > 10;
          if (!moved) {
            triggerLightHaptic();
            latestProps.current.onPlantTap?.(latestProps.current.plant);
          }
        } else if (isHidden) {
          setIsHidden(false);
        }
        longPressTriggeredRef.current = false;
        dragStartedRef.current = false;
        responderClaimedRef.current = false;
      },
      onPanResponderTerminate: () => {
        if (longPressTimeoutRef.current) {
          clearTimeout(longPressTimeoutRef.current);
          longPressTimeoutRef.current = null;
        }
        finalizeDrag(lastTouchRef.current.x, lastTouchRef.current.y);
        longPressTriggeredRef.current = false;
        dragStartedRef.current = false;
        responderClaimedRef.current = false;
        if (isHidden) setIsHidden(false);
      }
    })
  ).current;

  const panHandlers = disabled ? {} : panResponder.panHandlers;

  return (
    <Animated.View 
      ref={(node) => onCompletionTargetRef && onCompletionTargetRef(plant.id, node)}
      collapsable={false}
      {...panHandlers}
      onTouchStart={(e) => {
        const { pageX, pageY, locationX, locationY } = e.nativeEvent;
        lastTouchRef.current = { x: pageX, y: pageY, lx: locationX, ly: locationY };
        if (disabled || globalDragRef.current || latestProps.current.instantDrag || latestProps.current.isEditing) return;

        clearLongPressTimeout();
        longPressTriggeredRef.current = false;
        longPressTimeoutRef.current = setTimeout(() => {
          longPressTriggeredRef.current = true;
          triggerMediumHaptic();
          startDrag(lastTouchRef.current);
        }, 400);
      }}
      onTouchMove={(e) => {
        const { pageX, pageY, locationX, locationY } = e.nativeEvent;
        const prev = lastTouchRef.current;
        const TAP_THRESHOLD = 8;
        const moved = Math.abs(pageX - prev.x) > TAP_THRESHOLD || Math.abs(pageY - prev.y) > TAP_THRESHOLD;
        lastTouchRef.current = { x: pageX, y: pageY, lx: locationX, ly: locationY };

        if (dragStartedRef.current) {
          const origin = dragOriginRef.current;
          globalPan.setValue({ x: pageX - origin.x, y: pageY - origin.y });
          return;
        }

        if (disabled || globalDragRef.current || latestProps.current.instantDrag || latestProps.current.isEditing) return;
        if (moved && !dragStartedRef.current) {
          clearLongPressTimeout();
        }
      }}
      onTouchEnd={(e) => {
        clearLongPressTimeout();
        if (dragStartedRef.current && !responderClaimedRef.current) {
          const { pageX, pageY } = e.nativeEvent;
          longPressTriggeredRef.current = false;
          finalizeDrag(pageX, pageY);
          return;
        }
        // If a responder was claimed (dragging) or a long-press triggered, skip
        if (responderClaimedRef.current || dragStartedRef.current || longPressTriggeredRef.current) {
          longPressTriggeredRef.current = false;
          return;
        }
        if (latestProps.current.isEditing || globalDragRef.current) return;
        const { pageX, pageY } = e.nativeEvent;
        const TAP_THRESHOLD = 10; // px
        const moved = Math.abs(pageX - (lastTouchRef.current.x || 0)) > TAP_THRESHOLD || Math.abs(pageY - (lastTouchRef.current.y || 0)) > TAP_THRESHOLD;
        if (!moved) {
          triggerLightHaptic();
          latestProps.current.onPlantTap?.(latestProps.current.plant);
        }
        longPressTriggeredRef.current = false;
      }}
      style={[
        styles.plantContainer,
        isEditing && !isHidden && { transform: [{ rotate: wiggleAnim.interpolate({ inputRange: [-1, 1], outputRange: ['-2deg', '2deg'] }) }] },
        { opacity: isHidden ? 0 : 1 } 
      ]}
    >
      <PlantVisual plant={plant} isDraggingHighlight={false} educationDemo={educationDemo} />
    </Animated.View>
  );
});

const GARDEN_TUTORIAL_TASKS = [
  { key: 'movedGoal', label: 'Move a goal to a different spot' },
  { key: 'exitedEditMode', label: 'Tap anywhere to exit edit mode' },
  { key: 'completedGoal', label: 'Drag the water drop to complete a goal' },
  { key: 'reenteredEditMode', label: 'Long-press anywhere to enter edit mode' },
  { key: 'addedPage', label: 'Add a new page' },
  { key: 'customizedGarden', label: 'Open customization' },
  { key: 'openedGardenSwitcher', label: 'Open garden switcher' },
];

const GROWTH_EDUCATION_LABELS = ["Sprout", "Growing", "Blooming", "Full bloom"];
const GROWTH_EDUCATION_HINTS = [
  "Your plant today.",
  "After a few check-ins.",
  "More progress unlocked.",
  "Your long-term goal.",
];
const HEALTH_EDUCATION_LABELS = ["Healthy", "Wilting", "Thriving"];
const HEALTH_EDUCATION_HINTS = [
  "Water on schedule.",
  "Miss days and it wilts.",
  "Get back on track.",
];

const TUTORIAL_HOTSPOT_WIDTH = 104;
const TUTORIAL_HOTSPOT_HEIGHT = 72;
const TUTORIAL_HOTSPOT_RING_SIZE = 44;
const TUTORIAL_HOTSPOT_RING_OFFSET = TUTORIAL_HOTSPOT_RING_SIZE / 2;

function getTutorialHotspotBounds(left, top) {
  const halfW = TUTORIAL_HOTSPOT_WIDTH / 2;
  const anchorTop = top - TUTORIAL_HOTSPOT_RING_OFFSET;
  return {
    left: left - halfW,
    top: anchorTop,
    right: left + halfW,
    bottom: anchorTop + TUTORIAL_HOTSPOT_HEIGHT,
  };
}

function getTutorialMascotExclusionRect(screenWidth, screenHeight, insets) {
  const zoneWidth = 310;
  const zoneHeight = 370;
  const anchorBottom = insets.bottom + 138;

  return {
    left: screenWidth - 18 - zoneWidth,
    top: screenHeight - anchorBottom - zoneHeight,
    right: screenWidth,
    bottom: screenHeight - anchorBottom + 16,
  };
}

function tutorialHotspotOverlapsMascot(left, top, screenWidth, screenHeight, insets) {
  const hotspot = getTutorialHotspotBounds(left, top);
  const zone = getTutorialMascotExclusionRect(screenWidth, screenHeight, insets);
  return (
    hotspot.left < zone.right
    && hotspot.right > zone.left
    && hotspot.top < zone.bottom
    && hotspot.bottom > zone.top
  );
}

function offsetTutorialHotspotFromMascot(left, top, screenWidth, screenHeight, insets) {
  const zone = getTutorialMascotExclusionRect(screenWidth, screenHeight, insets);
  let nextLeft = left;
  let nextTop = top;

  if (left > zone.left - 20 && top > zone.top - 40) {
    nextLeft = zone.left - 36;
  }
  if (tutorialHotspotOverlapsMascot(nextLeft, nextTop, screenWidth, screenHeight, insets)) {
    nextTop = zone.top - 48;
  }
  if (tutorialHotspotOverlapsMascot(nextLeft, nextTop, screenWidth, screenHeight, insets)) {
    nextLeft = Math.min(nextLeft, screenWidth * 0.38);
    nextTop = Math.min(nextTop, zone.top - 60);
  }

  return {
    left: Math.max(
      TUTORIAL_HOTSPOT_WIDTH / 2 + 8,
      Math.min(nextLeft, screenWidth - TUTORIAL_HOTSPOT_WIDTH / 2 - 8)
    ),
    top: Math.max(56, nextTop),
  };
}

function isGardenTapHoldTask(taskKey, isEditing) {
  return (
    taskKey === 'exitedEditMode'
    || taskKey === 'reenteredEditMode'
    || ((taskKey === 'addedPage' || taskKey === 'customizedGarden') && !isEditing)
  );
}

function getGardenTapHoldHotspotPosition(screenWidth, screenHeight, drawerTop, insets) {
  const targetTop = drawerTop > 0 ? drawerTop - 56 : screenHeight * 0.68;
  return {
    left: screenWidth * 0.38,
    top: Math.max(120, Math.min(targetTop, screenHeight - insets.bottom - 330)),
  };
}

function isAnchoredTutorialHotspot(taskKey, isEditing) {
  if (taskKey === 'movedGoal' || taskKey === 'completedGoal' || taskKey === 'openedGardenSwitcher') return true;
  if (isGardenTapHoldTask(taskKey, isEditing)) return true;
  if (isEditing && (taskKey === 'addedPage' || taskKey === 'customizedGarden')) return true;
  return false;
}

function getTutorialHotspotCenter(taskKey, isEditing, x, y, w, h) {
  if (taskKey === 'movedGoal') {
    return {
      left: x + w / 2,
      top: y + h * 0.5,
    };
  }
  return { left: x + w / 2, top: y + h / 2 };
}

function getGardenTutorialHotspotLabel(taskKey, isEditing) {
  switch (taskKey) {
    case 'movedGoal':
      return 'Drag here';
    case 'exitedEditMode':
      return 'Tap here';
    case 'completedGoal':
      return 'Water';
    case 'reenteredEditMode':
      return 'Long press';
    case 'addedPage':
      return isEditing ? 'Add page' : 'Long press';
    case 'customizedGarden':
      return isEditing ? 'Customize' : 'Long press';
    case 'openedGardenSwitcher':
      return 'Gardens';
    default:
      return '';
  }
}

function getGardenTutorialActionType(taskKey, isEditing) {
  switch (taskKey) {
    case 'movedGoal':
    case 'completedGoal':
      return 'drag';
    case 'reenteredEditMode':
      return 'longPress';
    case 'addedPage':
    case 'customizedGarden':
      return isEditing ? 'tap' : 'longPress';
    default:
      return 'tap';
  }
}

function getGardenTutorialHotspotRef(taskKey, isEditing, refs) {
  switch (taskKey) {
    case 'movedGoal':
      return refs.drawerFirstPlant?.current ? refs.drawerFirstPlant : refs.drawer;
    case 'exitedEditMode':
    case 'reenteredEditMode':
      return refs.gardenMain;
    case 'completedGoal':
      return refs.waterDrop;
    case 'addedPage':
      return isEditing ? refs.addPageFab : refs.gardenMain;
    case 'customizedGarden':
      return isEditing ? refs.customizeFab : refs.gardenMain;
    case 'openedGardenSwitcher':
      return refs.gardenSwitcher;
    default:
      return null;
  }
}

function GardenTutorialHotspot({ left, top, label, taskKey, actionType }) {
  const mainScale = useRef(new Animated.Value(1)).current;
  const dragX = useRef(new Animated.Value(0)).current;
  const dragY = useRef(new Animated.Value(0)).current;
  const rippleScale = useRef(new Animated.Value(1)).current;
  const rippleOpacity = useRef(new Animated.Value(0)).current;
  const holdRingScale = useRef(new Animated.Value(1)).current;
  const holdRingOpacity = useRef(new Animated.Value(0)).current;
  const dragUpRight = taskKey === 'completedGoal';
  const halfWidth = TUTORIAL_HOTSPOT_WIDTH / 2;

  useEffect(() => {
    const resetDrag = () => {
      dragX.setValue(0);
      dragY.setValue(0);
    };
    const resetRipple = () => {
      rippleScale.setValue(1);
      rippleOpacity.setValue(0);
    };
    const resetHoldRing = () => {
      holdRingScale.setValue(1);
      holdRingOpacity.setValue(0);
    };

    let loop;

    if (actionType === 'tap') {
      loop = Animated.loop(
        Animated.sequence([
          Animated.parallel([
            Animated.sequence([
              Animated.timing(mainScale, {
                toValue: 0.86,
                duration: 110,
                easing: Easing.out(Easing.quad),
                useNativeDriver: true,
              }),
              Animated.spring(mainScale, {
                toValue: 1,
                friction: 5,
                tension: 180,
                useNativeDriver: true,
              }),
            ]),
            Animated.sequence([
              Animated.timing(rippleOpacity, { toValue: 0.65, duration: 60, useNativeDriver: true }),
              Animated.parallel([
                Animated.timing(rippleScale, {
                  toValue: 2,
                  duration: 450,
                  easing: Easing.out(Easing.quad),
                  useNativeDriver: true,
                }),
                Animated.timing(rippleOpacity, {
                  toValue: 0,
                  duration: 450,
                  easing: Easing.out(Easing.quad),
                  useNativeDriver: true,
                }),
              ]),
            ]),
          ]),
          Animated.delay(550),
        ])
      );
      loop.start();
      return () => {
        loop.stop();
        mainScale.setValue(1);
        resetRipple();
      };
    }

    if (actionType === 'longPress') {
      loop = Animated.loop(
        Animated.sequence([
          Animated.parallel([
            Animated.timing(mainScale, {
              toValue: 0.76,
              duration: 600,
              easing: Easing.out(Easing.quad),
              useNativeDriver: true,
            }),
            Animated.sequence([
              Animated.timing(holdRingOpacity, { toValue: 0.55, duration: 300, useNativeDriver: true }),
              Animated.timing(holdRingScale, {
                toValue: 1.55,
                duration: 600,
                easing: Easing.out(Easing.quad),
                useNativeDriver: true,
              }),
            ]),
          ]),
          Animated.delay(280),
          Animated.parallel([
            Animated.spring(mainScale, { toValue: 1, friction: 6, useNativeDriver: true }),
            Animated.timing(holdRingOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
            Animated.timing(holdRingScale, { toValue: 1, duration: 200, useNativeDriver: true }),
          ]),
          Animated.delay(480),
        ])
      );
      loop.start();
      return () => {
        loop.stop();
        mainScale.setValue(1);
        resetHoldRing();
      };
    }

    loop = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(dragY, {
            toValue: -50,
            duration: 850,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(dragX, {
            toValue: dragUpRight ? 36 : 0,
            duration: 850,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ]),
        Animated.delay(180),
        Animated.parallel([
          Animated.timing(dragY, {
            toValue: 0,
            duration: 350,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(dragX, {
            toValue: 0,
            duration: 350,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
        Animated.delay(400),
      ])
    );
    loop.start();
    return () => {
      loop.stop();
      mainScale.setValue(1);
      resetDrag();
    };
  }, [actionType, dragUpRight, mainScale, dragX, dragY, rippleScale, rippleOpacity, holdRingScale, holdRingOpacity]);

  return (
    <View
      pointerEvents="none"
      style={[
        styles.tutorialHotspotWrap,
        {
          left: left - halfWidth,
          top: top - TUTORIAL_HOTSPOT_RING_OFFSET,
          width: TUTORIAL_HOTSPOT_WIDTH,
        },
      ]}
    >
      {actionType === 'tap' && (
        <Animated.View
          style={[
            styles.tutorialHotspotRipple,
            {
              opacity: rippleOpacity,
              transform: [{ scale: rippleScale }],
            },
          ]}
        />
      )}
      {actionType === 'longPress' && (
        <Animated.View
          style={[
            styles.tutorialHotspotRipple,
            {
              opacity: holdRingOpacity,
              transform: [{ scale: holdRingScale }],
            },
          ]}
        />
      )}
      <Animated.View
        style={{
          transform: [
            { translateX: dragX },
            { translateY: dragY },
            { scale: mainScale },
          ],
        }}
      >
        <View style={styles.tutorialHotspotRing}>
          <View style={styles.tutorialHotspotDot} />
        </View>
      </Animated.View>
      <View style={styles.tutorialHotspotLabel}>
        <Text style={styles.tutorialHotspotLabelText} numberOfLines={1}>
          {label}
        </Text>
      </View>
    </View>
  );
}

// --- 3. MAIN GARDEN SCREEN ---
export default function GardenScreen({ route, navigation, onboardingStep, onboardingActions = {}, onOnboardingAction, onGardenTutorialNext }) {
    // Utility to update a goal and always recalculate healthLevel for today
    async function updateGoalWithHealth(goal, updatedFields) {
      const today = new Date();
      const updatedGoal = { ...goal, ...updatedFields };
      const updatedHealthLevel = getPlantHealthState(updatedGoal, today, auth.currentUser?.uid).healthLevel;
      const updateData = { ...updatedFields, healthLevel: updatedHealthLevel };
      console.log('[updateGoalWithHealth] updateData:', JSON.stringify(updateData));
      await updateDoc(doc(db, "users", auth.currentUser.uid, "goals", goal.id), updateData);
    }
  // --- Drawer and shelf positioning state/logic ---
  const [drawerTop, setDrawerTop] = useState(0);
  const [parentHeight, setParentHeight] = useState(0);
  const [shelfLayout, setShelfLayout] = useState({ y: 0, height: 0 });

  const onGardenMainLayout = useCallback((e) => {
    setParentHeight(e.nativeEvent.layout.height);
  }, []);

  const onBottomShelfLayout = useCallback((e) => {
    const { y, height } = e.nativeEvent.layout;
    setShelfLayout({ y, height });
  }, []);

  useEffect(() => {
    if (shelfLayout.height) {
      // The drawer's top should align just below the bottom shelf, with a small gap
      const gap = 0; // px below the shelf
      setDrawerTop(shelfLayout.y + shelfLayout.height + gap);
    }
  }, [shelfLayout]);

  useFocusEffect(
    useCallback(() => {
      recordQuestActivity("garden");
    }, [])
  );

    // --- Customization State ---
    const { theme } = useTheme();
    const [showCustomization, setShowCustomization] = useState(false);
    // { [pageId]: { farBg, windowFrame, wallBg, shelfColor } }
    const [customizations, setCustomizations] = useState({});
    const pendingCustomizationSaveRef = useRef(null);

    const applyCustomizationsFromServer = useCallback((serverData) => {
      const pending = pendingCustomizationSaveRef.current;
      if (pending?.pageId && pending?.values) {
        setCustomizations({ ...serverData, [pending.pageId]: pending.values });
        return;
      }
      setCustomizations(serverData);
    }, []);

    // Exit edit mode when customization modal is opened
    useEffect(() => {
      if (showCustomization && isEditing) {
        setIsEditing(false);
        if (shouldPersistState) persistedGardenState.isEditing = false;
      }
    }, [showCustomization]);
  // Subscribe to shared customizations if in shared garden
  useEffect(() => {
    let unsub;
    if (isSharedGarden && sharedGardenId) {
      unsub = subscribeSharedCustomizations(sharedGardenId, applyCustomizationsFromServer);
    } else if (!isSharedGarden && auth.currentUser?.uid) {
      unsub = subscribePersonalCustomizations(auth.currentUser.uid, applyCustomizationsFromServer);
    }
    return () => unsub && unsub();
  }, [isSharedGarden, sharedGardenId, applyCustomizationsFromServer]);
  const insets = useSafeAreaInsets();
  const { isPro, openDefaultPaywall } = useSubscription();
  const { goals } = useGoals();
  const { width, height } = useWindowDimensions();
  const drawerRef = useRef(null);
  const drawerFirstPlantRef = useRef(null);
  const gardenMainRef = useRef(null);
  const gardenSwitcherRef = useRef(null);
  const customizeFabRef = useRef(null);
  const addPageFabRef = useRef(null);
  const waterDropRef = useRef(null);
  const [tutorialHotspot, setTutorialHotspot] = useState(null);
  const [educationPanelMode, setEducationPanelMode] = useState(null);
  const [educationDemoFrame, setEducationDemoFrame] = useState(0);
  const [tutorialPlantId, setTutorialPlantId] = useState(null);

  const sharedGardenId = route?.params?.gardenId || route?.params?.sharedGardenId || null;
  const isSharedGarden = Boolean(sharedGardenId);
  const viewedUserId = route?.params?.userId || auth.currentUser?.uid;
  const [sharedGardenSettings, setSharedGardenSettings] = useState({
    restrictAddPeople: false,
    restrictCustomize: false,
    restrictEditPlants: false,
    ownerId: null,
    editModeLock: null,
  });
  const [sharedGardenSettingsLoaded, setSharedGardenSettingsLoaded] = useState(false);
  const isOwner = isSharedGarden && sharedGardenSettings.ownerId && auth.currentUser && sharedGardenSettings.ownerId === auth.currentUser.uid;
  const isReadOnly = isSharedGarden
    ? Boolean(route?.params?.readOnly)
    : Boolean(route?.params?.readOnly && viewedUserId && viewedUserId !== auth.currentUser?.uid);
  const shouldPersistState = !isReadOnly && !isSharedGarden;
  const viewedUsername = isSharedGarden ? (route?.params?.gardenName || "Shared Garden") : (route?.params?.username || "User");
  // Fetch shared garden settings (permissions)
  useEffect(() => {
    if (!isSharedGarden || !sharedGardenId) {
      setSharedGardenSettingsLoaded(true);
      return;
    }
    const unsub = onSnapshot(
      doc(db, "sharedGardens", sharedGardenId),
      (snap) => {
        if (!snap.exists()) return;
        const data = snap.data();
        setSharedGardenSettings({
          restrictAddPeople: !!data.restrictAddPeople,
          restrictCustomize: !!data.restrictCustomize,
          restrictEditPlants: !!data.restrictEditPlants,
          ownerId: data.ownerId || null,
          editModeLock: data.editModeLock || null,
        });
        setSharedGardenSettingsLoaded(true);
      },
      (error) => {
        if (error?.code !== 'permission-denied' || auth.currentUser?.uid) {
          console.error('Error loading shared garden settings', error);
        }
      }
    );
    return () => unsub();
  }, [isSharedGarden, sharedGardenId]);

  const [allPlants, setAllPlants] = useState(shouldPersistState ? (persistedGardenState.allPlants || []) : []);
  const [pages, setPages] = useState([]);
  const [currentPageId, setCurrentPageId] = useState(shouldPersistState ? (persistedGardenState.currentPageId || "default") : "default");

  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(shouldPersistState ? (persistedGardenState.isEditing || false) : false);
  const [globalDragging, setGlobalDragging] = useState(false);
  const [drawerScrollOffset, setDrawerScrollOffset] = useState(shouldPersistState ? (persistedGardenState.drawerScrollOffset || 0) : 0);
  const [drawerShouldShow, setDrawerShouldShow] = useState((shouldPersistState ? (persistedGardenState.currentPageId || "default") : "default") !== STORAGE_PAGE_ID);
  const [dragPageSwitching, setDragPageSwitching] = useState(false);
  const [dragEdge, setDragEdge] = useState(null);
  const [showSharedGardensModal, setShowSharedGardensModal] = useState(false);
  const [sharedGardens, setSharedGardens] = useState([]);
  const [sharedGardenInvites, setSharedGardenInvites] = useState([]);
  const [followingUsers, setFollowingUsers] = useState([]);
  const [creatingSharedGarden, setCreatingSharedGarden] = useState(false);
  const [showCreateSharedGardenModal, setShowCreateSharedGardenModal] = useState(false);
  const [newSharedGardenName, setNewSharedGardenName] = useState('');
  const [expandedInviteGardenId, setExpandedInviteGardenId] = useState(null);
  const [activeInviteKey, setActiveInviteKey] = useState('');
  const [acceptingInviteId, setAcceptingInviteId] = useState('');
  const [leavingGardenId, setLeavingGardenId] = useState('');
  const [myUsername, setMyUsername] = useState('User');
  const [currentUid, setCurrentUid] = useState(auth.currentUser?.uid || null);
  const prevPagesCountRef = useRef(0);
  const currentPageRef = useRef(currentPageId);
  const sharedEditLockAlertShown = useRef(false);
  const skipNextSharedLockEnsureRef = useRef(false);

  const globalPan = useRef(new Animated.ValueXY()).current;
  const globalDragRef = useRef(false);
  const [draggedGhost, setDraggedGhost] = useState(null); 
  const completionTargetRefs = useRef({});
  const waterPan = useRef(new Animated.ValueXY()).current;
  const waterDropOpacity = useRef(new Animated.Value(1)).current;  // native driver
  const [waterDragging, setWaterDragging] = useState(false);
  const [splashPos, setSplashPos] = useState(null);
  const splashScale = useRef(new Animated.Value(0)).current;   // native driver
  const splashOpacity = useRef(new Animated.Value(0)).current; // native driver
  const splashScale2 = useRef(new Animated.Value(0)).current;  // native driver
  const splashOpacity2 = useRef(new Animated.Value(0)).current; // native driver
  const wiggleAnim = useRef(new Animated.Value(0)).current;
  const switcherOpenAnim = useRef(new Animated.Value(0)).current;
  const bubbleScale = useRef(new Animated.Value(0.8)).current;
  const bubbleTranslate = useRef(new Animated.ValueXY({ x: 40, y: 40 })).current;
  const bubbleSway = useRef(new Animated.Value(0)).current;
  const tutorialNextRippleScale = useRef(new Animated.Value(1)).current;
  const tutorialNextRippleOpacity = useRef(new Animated.Value(0)).current;
  const lastBubbleTutorialTaskRef = useRef(null);
  const drawerShouldShowRef = useRef((shouldPersistState ? (persistedGardenState.currentPageId || "default") : "default") !== STORAGE_PAGE_ID);
  const sharedDropOverridesRef = useRef({});

  const handleEducationDismiss = useCallback(() => {
    const mode = educationPanelMode;
    if (mode === "growth") {
      onOnboardingAction?.("viewedGrowthEducation");
    } else if (mode === "health") {
      onOnboardingAction?.("viewedHealthEducation");
    }
    setEducationPanelMode(null);
    setEducationDemoFrame(0);
  }, [educationPanelMode, onOnboardingAction]);

  const handleEducationNext = useCallback(() => {
    if (!educationPanelMode) return;
    const totalFrames = educationPanelMode === "growth" ? 4 : 3;
    if (educationDemoFrame >= totalFrames - 1) {
      handleEducationDismiss();
      return;
    }
    setEducationDemoFrame((prev) => prev + 1);
  }, [educationDemoFrame, educationPanelMode, handleEducationDismiss]);

  useEffect(() => {
    if (onboardingStep !== "garden_tutorial") {
      setEducationPanelMode(null);
      return undefined;
    }
    if (educationPanelMode) return undefined;

    if (
      onboardingActions?.exitedEditMode
      && onboardingActions?.movedGoal
      && !onboardingActions?.viewedGrowthEducation
    ) {
      setEducationDemoFrame(0);
      setEducationPanelMode("growth");
    } else if (onboardingActions?.completedGoal && !onboardingActions?.viewedHealthEducation) {
      setEducationDemoFrame(0);
      setEducationPanelMode("health");
    }

    return undefined;
  }, [
    educationPanelMode,
    onboardingStep,
    onboardingActions?.exitedEditMode,
    onboardingActions?.movedGoal,
    onboardingActions?.viewedGrowthEducation,
    onboardingActions?.completedGoal,
    onboardingActions?.viewedHealthEducation,
  ]);

  useEffect(() => {
    if (onboardingStep !== "garden_tutorial" || tutorialPlantId) return undefined;
    if (!onboardingActions?.movedGoal) return undefined;

    const candidate = allPlants
      .filter((plant) => plant.shelfPosition && plant.shelfPosition.pageId !== STORAGE_PAGE_ID)
      .sort((left, right) => (Number(left.totalCompletions) || 0) - (Number(right.totalCompletions) || 0))[0];

    if (candidate?.id) {
      setTutorialPlantId(candidate.id);
    }

    return undefined;
  }, [allPlants, onboardingActions?.movedGoal, onboardingStep, tutorialPlantId]);

  useEffect(() => {
    currentPageRef.current = currentPageId;
  }, [currentPageId]);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      setCurrentUid(user?.uid || null);
    });
    return () => unsubAuth();
  }, []);

  useEffect(() => {
    if (onboardingStep !== 'garden_tutorial') return;
    const nonStoragePageCount = pages.filter((p) => p.id !== STORAGE_PAGE_ID).length;
    if (prevPagesCountRef.current > 0 && nonStoragePageCount > prevPagesCountRef.current) {
      onOnboardingAction?.('addedPage');
    }
    prevPagesCountRef.current = nonStoragePageCount;
  }, [pages, onboardingStep, onOnboardingAction]);

  useEffect(() => {
    if (onboardingStep === 'garden_tutorial' && showSharedGardensModal) {
      onOnboardingAction?.('openedGardenSwitcher');
    }
  }, [showSharedGardensModal, onboardingStep, onOnboardingAction]);

  useEffect(() => {
    if (onboardingStep !== 'garden_tutorial') {
      lastBubbleTutorialTaskRef.current = null;
      return;
    }

    const showingEducation = educationPanelMode
      || (
        onboardingActions?.exitedEditMode
        && onboardingActions?.movedGoal
        && !onboardingActions?.viewedGrowthEducation
      )
      || (onboardingActions?.completedGoal && !onboardingActions?.viewedHealthEducation);

    if (showingEducation) return;

    const nextTask = GARDEN_TUTORIAL_TASKS.find((item) => !onboardingActions?.[item.key]);
    const taskKey = nextTask?.key ?? 'complete';

    if (lastBubbleTutorialTaskRef.current === taskKey) return;
    lastBubbleTutorialTaskRef.current = taskKey;

    if (showCustomization && taskKey === 'openedGardenSwitcher') {
      bubbleScale.setValue(1);
      bubbleTranslate.setValue({ x: 0, y: 0 });
      return;
    }

    bubbleScale.setValue(0.6);
    bubbleTranslate.setValue({ x: 100, y: 200 });
    Animated.parallel([
      Animated.spring(bubbleScale, {
        toValue: 1,
        friction: 8,
        tension: 10,
        useNativeDriver: true,
      }),
      Animated.spring(bubbleTranslate, {
        toValue: { x: 0, y: 0 },
        friction: 8,
        tension: 10,
        useNativeDriver: true,
      }),
    ]).start();
  }, [onboardingStep, onboardingActions, showCustomization, bubbleScale, bubbleTranslate, educationPanelMode]);

  useEffect(() => {
    if (onboardingStep !== 'garden_tutorial') {
      bubbleSway.stopAnimation();
      bubbleSway.setValue(0);
      return;
    }

    const swayLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(bubbleSway, {
          toValue: 1,
          duration: 1100,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(bubbleSway, {
          toValue: -1,
          duration: 2200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(bubbleSway, {
          toValue: 0,
          duration: 1100,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );

    swayLoop.start();
    return () => swayLoop.stop();
  }, [onboardingStep, bubbleSway]);

  useEffect(() => {
    if (!educationPanelMode) {
      tutorialNextRippleScale.stopAnimation();
      tutorialNextRippleOpacity.stopAnimation();
      tutorialNextRippleScale.setValue(1);
      tutorialNextRippleOpacity.setValue(0);
      return undefined;
    }

    const rippleLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(tutorialNextRippleScale, {
          toValue: 1,
          duration: 0,
          useNativeDriver: true,
        }),
        Animated.timing(tutorialNextRippleOpacity, {
          toValue: 0.65,
          duration: 60,
          useNativeDriver: true,
        }),
        Animated.parallel([
          Animated.timing(tutorialNextRippleScale, {
            toValue: 1.28,
            duration: 450,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(tutorialNextRippleOpacity, {
            toValue: 0,
            duration: 450,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
        Animated.delay(550),
      ])
    );

    rippleLoop.start();
    return () => {
      rippleLoop.stop();
      tutorialNextRippleScale.setValue(1);
      tutorialNextRippleOpacity.setValue(0);
    };
  }, [educationPanelMode, tutorialNextRippleOpacity, tutorialNextRippleScale]);

  useEffect(() => {
    if (!educationPanelMode || onboardingStep !== 'garden_tutorial') return undefined;

    bubbleScale.setValue(0.6);
    bubbleTranslate.setValue({ x: 100, y: 200 });
    Animated.parallel([
      Animated.spring(bubbleScale, {
        toValue: 1,
        friction: 8,
        tension: 10,
        useNativeDriver: true,
      }),
      Animated.spring(bubbleTranslate, {
        toValue: { x: 0, y: 0 },
        friction: 8,
        tension: 10,
        useNativeDriver: true,
      }),
    ]).start();

    return undefined;
  }, [educationPanelMode, onboardingStep, bubbleScale, bubbleTranslate]);

  const measureTutorialHotspot = useCallback(() => {
    if (onboardingStep !== 'garden_tutorial') {
      setTutorialHotspot(null);
      return;
    }

    if (showCustomization || educationPanelMode) {
      setTutorialHotspot(null);
      return;
    }

    if (
      onboardingActions?.exitedEditMode
      && onboardingActions?.movedGoal
      && !onboardingActions?.viewedGrowthEducation
    ) {
      setTutorialHotspot(null);
      return;
    }

    if (onboardingActions?.completedGoal && !onboardingActions?.viewedHealthEducation) {
      setTutorialHotspot(null);
      return;
    }

    const nextTask = GARDEN_TUTORIAL_TASKS.find((item) => !onboardingActions?.[item.key]);
    if (!nextTask) {
      setTutorialHotspot(null);
      return;
    }

    if (isGardenTapHoldTask(nextTask.key, isEditing)) {
      const { left, top } = getGardenTapHoldHotspotPosition(width, height, drawerTop, insets);
      setTutorialHotspot({
        left,
        top,
        label: getGardenTutorialHotspotLabel(nextTask.key, isEditing),
        taskKey: nextTask.key,
      });
      return;
    }

    const applyMeasuredHotspot = (task, x, y, w, h) => {
      let { left, top } = getTutorialHotspotCenter(task.key, isEditing, x, y, w, h);

      if (!isAnchoredTutorialHotspot(task.key, isEditing)
        && tutorialHotspotOverlapsMascot(left, top, width, height, insets)) {
        ({ left, top } = offsetTutorialHotspotFromMascot(left, top, width, height, insets));
      }

      setTutorialHotspot({
        left,
        top,
        label: getGardenTutorialHotspotLabel(task.key, isEditing),
        taskKey: task.key,
      });
    };

    if (nextTask.key === 'movedGoal') {
      const firstDrawerPlant = allPlants.find((plant) => !plant.shelfPosition);
      const plantNode = firstDrawerPlant && completionTargetRefs.current[firstDrawerPlant.id];
      if (plantNode) {
        plantNode.measureInWindow((x, y, w, h) => applyMeasuredHotspot(nextTask, x, y, w, h));
        return;
      }
    }

    const targetRef = getGardenTutorialHotspotRef(nextTask.key, isEditing, {
      drawer: drawerRef,
      drawerFirstPlant: drawerFirstPlantRef,
      gardenMain: gardenMainRef,
      waterDrop: waterDropRef,
      addPageFab: addPageFabRef,
      customizeFab: customizeFabRef,
      gardenSwitcher: gardenSwitcherRef,
    });

    if (!targetRef?.current) {
      setTutorialHotspot(null);
      return;
    }

    targetRef.current.measureInWindow((x, y, w, h) => applyMeasuredHotspot(nextTask, x, y, w, h));
  }, [onboardingStep, onboardingActions, isEditing, width, height, insets, allPlants, showCustomization, drawerTop, educationPanelMode]);

  useEffect(() => {
    if (onboardingStep !== 'garden_tutorial') {
      setTutorialHotspot(null);
      return;
    }
    if (educationPanelMode) {
      setTutorialHotspot(null);
      return;
    }
    const timer = setTimeout(measureTutorialHotspot, 80);
    return () => clearTimeout(timer);
  }, [
    onboardingStep,
    onboardingActions,
    isEditing,
    drawerTop,
    drawerShouldShow,
    showCustomization,
    currentPageId,
    allPlants,
    measureTutorialHotspot,
    educationPanelMode,
  ]);

  useEffect(() => {
    const next = currentPageId !== STORAGE_PAGE_ID;
    drawerShouldShowRef.current = next;
    setDrawerShouldShow(next);
  }, [currentPageId]);

  useEffect(() => {
    Animated.timing(switcherOpenAnim, {
      toValue: showSharedGardensModal ? 1 : 0,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [showSharedGardensModal, switcherOpenAnim]);

  const slotRefs = useRef({});
  const drawerScrollRef = useRef(null);

  useEffect(() => {
    if (drawerScrollRef.current && drawerScrollOffset) {
      drawerScrollRef.current.scrollTo({ x: drawerScrollOffset, animated: false });
    }
  }, []);

  useEffect(() => {
    if (isReadOnly || !currentUid) {
      setSharedGardens([]);
      setSharedGardenInvites([]);
      setFollowingUsers([]);
      return undefined;
    }

    const uid = currentUid;

    const unsubSharedGardens = onSnapshot(
      query(collection(db, 'sharedGardens'), where('memberIds', 'array-contains', uid)),
      (snap) => {
        const docs = snap.docs
          .map((gardenDoc) => ({ id: gardenDoc.id, ...gardenDoc.data() }))
          .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
        setSharedGardens(docs);
      },
      (error) => {
        if (error?.code !== 'permission-denied' || auth.currentUser?.uid === uid) {
          console.error('Error loading shared gardens', error);
        }
      }
    );

    const unsubInvites = onSnapshot(
      collection(db, 'users', uid, 'sharedGardenInvites'),
      (snap) => {
        const docs = snap.docs
          .map((inviteDoc) => ({ id: inviteDoc.id, ...inviteDoc.data() }))
          .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        setSharedGardenInvites(docs);
      },
      (error) => {
        if (error?.code !== 'permission-denied' || auth.currentUser?.uid === uid) {
          console.error('Error loading shared garden invites', error);
        }
      }
    );

    const unsubFollowing = onSnapshot(
      collection(db, 'users', uid, 'following'),
      (snap) => {
        setFollowingUsers(snap.docs.map((userDoc) => ({ id: userDoc.id, ...userDoc.data() })));
      },
      (error) => {
        if (error?.code !== 'permission-denied' || auth.currentUser?.uid === uid) {
          console.error('Error loading following list', error);
        }
      }
    );

    let active = true;
    const loadMyUsername = async () => {
      try {
        const userSnap = await getDoc(doc(db, 'users', uid));
        if (!active) return;
        if (userSnap.exists()) {
          setMyUsername(userSnap.data()?.username || 'User');
        }
      } catch (error) {
        console.error('Error loading current username', error);
      }
    };

    loadMyUsername();

    return () => {
      active = false;
      unsubSharedGardens();
      unsubInvites();
      unsubFollowing();
    };
  }, [currentUid, isReadOnly]);

  const setCompletionTargetRef = useCallback((plantId, node) => {
    if (node) {
      completionTargetRefs.current[plantId] = node;
      if (
        onboardingStep === 'garden_tutorial'
        && !onboardingActions?.movedGoal
        && allPlants.find((plant) => !plant.shelfPosition)?.id === plantId
      ) {
        requestAnimationFrame(() => measureTutorialHotspot());
      }
      return;
    }
    delete completionTargetRefs.current[plantId];
  }, [onboardingStep, onboardingActions, allPlants, measureTutorialHotspot]);

  const calculateStreakForLogs = useCallback((goal, newLogs) => {
    return calculateGoalStreak(goal, newLogs, toKey(new Date()));
  }, []);

  const updateOverallAppStreak = useCallback(async () => {
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
        currentAppStreak = (userData.lastActiveDate === yesterdayStr) ? currentAppStreak + 1 : 1;
        const updateData = { streakCount: currentAppStreak, lastActiveDate: todayStr };
        console.log('[updateStreak] updateData:', JSON.stringify(updateData));
        await updateDoc(userRef, updateData);
        return currentAppStreak;
      }
      return 0;
    } catch (error) {
      console.error(error);
      return 0;
    }
  }, []);

  const markPlantCompletedFromDrop = useCallback(async (plantId) => {
    if (isReadOnly || !auth.currentUser) return;
    const goal = allPlants.find((item) => item.id === plantId);
    if (!goal) return;
    const today = new Date();
    const todayKey = toKey(today);
    // Block completion if today is not a scheduled day
    if (!isGoalScheduledOnDate(goal, today)) {
      Alert.alert(
        "Not Scheduled Today",
        "You can't complete this goal today because it is not scheduled for today."
      );
      return;
    }
    if (isGoalDoneForDate(goal, todayKey)) return;
    try {
      const todayKeyString = typeof todayKey === 'string' ? todayKey : toKey(todayKey);
      console.log('[GardenScreen] toggleGoalTransaction selectedDateKey:', todayKeyString, typeof todayKeyString);
      await toggleGoalTransaction({
        goal,
        selectedDateKey: todayKeyString,
        isSharedGoalView: !!sharedGardenId,
        routeSharedGardenId: sharedGardenId,
        shelfPosition: goal.shelfPosition,
        findFirstOpenStorageSlot,
        findFirstOpenSharedStorageSlot,
      });
      if (onboardingStep === 'garden_tutorial') {
        onOnboardingAction?.('completedGoal');
        if (!onboardingActions?.viewedHealthEducation) {
          setEducationDemoFrame(0);
          setEducationPanelMode('health');
        }
      }
    } catch (error) {
      console.error("Error toggling goal status (GardenScreen):", error);
      Alert.alert("Error", "Could not update goal progress.");
    }
  }, [allPlants, findFirstOpenSharedStorageSlot, findFirstOpenStorageSlot, isReadOnly, onboardingActions?.viewedHealthEducation, onboardingStep, onOnboardingAction, sharedGardenId]);

  const findCompletionTargetId = useCallback(async (moveX, moveY) => {
    const visiblePlantIds = allPlants
      .filter((plant) => {
        if (!plant?.shelfPosition) return true;
        return plant.shelfPosition.pageId === currentPageId;
      })
      .map((plant) => plant.id);

    for (const plantId of visiblePlantIds) {
      const ref = completionTargetRefs.current[plantId];
      if (!ref) continue;

      const rect = await new Promise((resolve) => {
        ref.measure((x, y, widthVal, heightVal, pageX, pageY) => {
          if (pageX === undefined || pageY === undefined) {
            resolve(null);
            return;
          }
          resolve({
            left: pageX - 26,
            right: pageX + widthVal + 26,
            top: pageY - 26,
            bottom: pageY + heightVal + 26,
          });
        });
      });

      if (!rect) continue;
      if (moveX >= rect.left && moveX <= rect.right && moveY >= rect.top && moveY <= rect.bottom) {
        return plantId;
      }
    }

    return null;
  }, [allPlants, currentPageId]);

  const resetWaterDrop = useCallback((opts = {}) => {
    if (opts.hit && opts.x != null && opts.y != null) {
      // Show double ripple burst at drop position
      setSplashPos({ x: opts.x, y: opts.y });

      // Ring 1 — fast leading ring (native driver)
      splashScale.setValue(0.3);
      splashOpacity.setValue(1);
      Animated.parallel([
        Animated.timing(splashScale, { toValue: 3.0, duration: 340, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.sequence([
          Animated.delay(60),
          Animated.timing(splashOpacity, { toValue: 0, duration: 280, useNativeDriver: true }),
        ]),
      ]).start();

      // Ring 2 — slightly delayed trailing ring (native driver)
      splashScale2.setValue(0.1);
      splashOpacity2.setValue(0);
      Animated.sequence([
        Animated.delay(70),
        Animated.parallel([
          Animated.timing(splashOpacity2, { toValue: 0.7, duration: 60, useNativeDriver: true }),
          Animated.timing(splashScale2, { toValue: 2.0, duration: 380, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        ]),
        Animated.timing(splashOpacity2, { toValue: 0, duration: 180, useNativeDriver: true }),
      ]).start(() => setSplashPos(null));

      // Drop opacity: native driver (separate view from pan)
      Animated.timing(waterDropOpacity, {
        toValue: 0,
        duration: 60,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start(() => {
        waterPan.setValue({ x: 0, y: 0 });
        setWaterDragging(false);
        Animated.timing(waterDropOpacity, {
          toValue: 1,
          duration: 150,
          useNativeDriver: true,
        }).start();
      });
    } else {
      // Miss — spring back (JS driver for pan only)
      Animated.spring(waterPan, {
        toValue: { x: 0, y: 0 },
        useNativeDriver: false,
        speed: 20,
        bounciness: 5,
      }).start(() => setWaterDragging(false));
    }
  }, [waterPan, waterDropOpacity, splashScale, splashOpacity, splashScale2, splashOpacity2]);

  const waterPanResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => !isReadOnly && !globalDragging && drawerShouldShowRef.current,
    onMoveShouldSetPanResponder: (_, gestureState) => {
      if (isReadOnly || globalDragging || !drawerShouldShowRef.current) return false;
      return Math.abs(gestureState.dx) > 2 || Math.abs(gestureState.dy) > 2;
    },
    onPanResponderGrant: () => {
      triggerLightHaptic();
      setWaterDragging(true);
      waterPan.setValue({ x: 0, y: 0 });
    },
    onPanResponderMove: Animated.event(
      [null, { dx: waterPan.x, dy: waterPan.y }],
      { useNativeDriver: false }
    ),
    onPanResponderRelease: async (_, gestureState) => {
      // Capture position synchronously — don't wait for async ops
      const releaseX = gestureState.moveX;
      const releaseY = gestureState.moveY;
      try {
        const targetId = await findCompletionTargetId(releaseX, releaseY);
        if (targetId) {
          triggerMediumHaptic();
          // Fire the animation immediately, write to DB in background
          resetWaterDrop({ hit: true, x: releaseX, y: releaseY });
          markPlantCompletedFromDrop(targetId).catch((err) =>
            console.error("Failed to complete plant from water drop", err)
          );
        } else {
          resetWaterDrop();
        }
      } catch (error) {
        console.error("Failed to complete plant from water drop", error);
        resetWaterDrop();
      }
    },
    onPanResponderTerminate: () => {
      resetWaterDrop();
    },
  });

  const goPrevPage = () => {
    const currentIndex = pages.findIndex(p => p.id === currentPageId);
    if (currentIndex > 0) {
      const prevId = pages[currentIndex - 1].id;
      setCurrentPageId(prevId);
      if (shouldPersistState) persistedGardenState.currentPageId = prevId;
      scrollToPageId(prevId);
    }
  };

  const goNextPage = () => {
    const currentIndex = pages.findIndex(p => p.id === currentPageId);
    if (currentIndex >= 0 && currentIndex < pages.length - 1) {
      const nextId = pages[currentIndex + 1].id;
      setCurrentPageId(nextId);
      if (shouldPersistState) persistedGardenState.currentPageId = nextId;
      scrollToPageId(nextId);
    }
  };

  const flatListRef = useRef(null);
  const pageScrollX = useRef(new Animated.Value(0)).current;

  const scrollToPageId = (pageId) => {
    const idx = pages.findIndex(p => p.id === pageId);
    if (idx === -1 || !flatListRef.current) return;
    try {
      flatListRef.current.scrollToIndex({ index: idx, animated: true });
    } catch (e) {
      // If the list isn't laid out yet, try again on the next tick
      setTimeout(() => {
        if (flatListRef.current) {
          flatListRef.current.scrollToIndex({ index: idx, animated: true });
        }
      }, 0);
    }
  };

  const onPageScrollEnd = (e) => {
    const offsetX = e.nativeEvent.contentOffset.x;
    const idx = Math.round(offsetX / width);
    if (idx >= 0 && idx < pages.length) {
      setCurrentPageId(pages[idx].id);
    }
  };

  useEffect(() => {
    setLoading(true);

    if (isSharedGarden) {
      const unsubSharedLayout = onSnapshot(
        collection(db, "sharedGardens", sharedGardenId, "layout"),
        (layoutSnap) => {
          const merged = layoutSnap.docs.map((layoutDoc) => {
            const data = layoutDoc.data() || {};
            const liveShelfPosition = data.shelfPosition || (data.shelfName
              ? {
                  pageId: data.pageId || "default",
                  shelfName: data.shelfName,
                  slotIndex: Number(data.slotIndex) || 0,
                }
              : null);

            const hasOverride = Object.prototype.hasOwnProperty.call(sharedDropOverridesRef.current, layoutDoc.id);
            let shelfPosition = liveShelfPosition;
            if (hasOverride) {
              const overridePosition = sharedDropOverridesRef.current[layoutDoc.id];
              if (shelfPositionsMatch(liveShelfPosition, overridePosition)) {
                delete sharedDropOverridesRef.current[layoutDoc.id];
              } else {
                shelfPosition = overridePosition;
              }
            }

            return {
              id: layoutDoc.id,
              ...data,
              shelfPosition,
            };
          });
          setAllPlants(merged);
          setLoading(false);
        },
        (error) => {
          console.error("Error fetching shared garden layout:", error);
          setAllPlants([]);
          setLoading(false);
        }
      );

      return () => {
        unsubSharedLayout();
      };
    }

    if (!viewedUserId) {
      setAllPlants([]);
      setLoading(false);
      return undefined;
    }

    const uid = viewedUserId;
    let unsubGoals = () => {};

    const unsubLayout = onSnapshot(
      collection(db, "users", uid, "gardenLayout"),
      (layoutSnap) => {
        const layoutMap = {};
        layoutSnap.forEach(doc => {
          const pos = doc.data().shelfPosition;
          layoutMap[doc.id] = pos
            ? { ...pos, pageId: pos.pageId || "default" }
            : null;
        });

        unsubGoals();
        unsubGoals = onSnapshot(
          collection(db, "users", uid, "goals"),
          (goalsSnap) => {
            const merged = goalsSnap.docs
              .map((goalDoc) => ({ id: goalDoc.id, ...goalDoc.data() }))
              .filter((goalData) => !(goalData?.gardenType === "shared" || !!goalData?.sharedGardenId))
              .map((goalData) => ({
                ...goalData,
                shelfPosition: layoutMap[goalData.id] || null,
              }));
            setAllPlants(merged);
            if (shouldPersistState) persistedGardenState.allPlants = merged;
            setLoading(false);
          },
          (error) => {
            if (error?.code !== "permission-denied" || auth.currentUser?.uid === uid || isReadOnly) {
              console.error("Error fetching garden goals:", error);
            }
            setAllPlants([]);
            setLoading(false);
          }
        );
      },
      (error) => {
        if (error?.code !== "permission-denied" || auth.currentUser?.uid === uid || isReadOnly) {
          console.error("Error fetching garden layout:", error);
        }
        unsubGoals();
        setAllPlants([]);
        setLoading(false);
      }
    );

    return () => {
      unsubGoals();
      unsubLayout();
    };
  }, [isReadOnly, isSharedGarden, sharedGardenId, shouldPersistState, viewedUserId]);

  useEffect(() => {
    if (isSharedGarden) {
      const sharedPagesRef = collection(db, "sharedGardens", sharedGardenId, "pages");
      const unsubPages = onSnapshot(
        sharedPagesRef,
        (snap) => {
          const docs = snap.docs.map(pageDoc => ({ id: pageDoc.id, ...pageDoc.data() }));
          const hasDefault = docs.some((page) => page.id === "default");
          if (!hasDefault && !isReadOnly) {
            setDoc(doc(sharedPagesRef, "default"), { title: "Page 1", createdAt: Date.now() }, { merge: true });
          }

          const sorted = docs.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
          const sharedPages = sorted.length ? sorted : [{ id: "default", title: "Page 1" }];
          const nextPages = [{ id: STORAGE_PAGE_ID, title: 'Storage' }, ...sharedPages];
          setPages(nextPages);
          setCurrentPageId((prev) => (prev && nextPages.some((page) => page.id === prev) ? prev : "default"));
        },
        (error) => {
          console.error("Error fetching shared garden pages:", error);
          setPages([{ id: STORAGE_PAGE_ID, title: 'Storage' }, { id: "default", title: "Page 1" }]);
          setCurrentPageId("default");
        }
      );

      return () => unsubPages();
    }

    if (!viewedUserId) {
      setPages([{ id: STORAGE_PAGE_ID, title: 'Storage' }]);
      setCurrentPageId("default");
      return undefined;
    }

    const uid = viewedUserId;
    const pagesRef = collection(db, "users", uid, "gardenPages");

    const unsubPages = onSnapshot(
      pagesRef,
      (snap) => {
        const docs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const hasDefault = docs.some(d => d.id === "default");
        if (!hasDefault && !isReadOnly) {
          setDoc(doc(pagesRef, "default"), { title: "Page 1", createdAt: Date.now() }, { merge: true });
        }

        const sorted = docs.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
        setPages([{ id: STORAGE_PAGE_ID, title: 'Storage' }, ...sorted]);

        setCurrentPageId(prev => {
          const next = (prev && (prev === STORAGE_PAGE_ID || docs.some(d => d.id === prev))) ? prev : "default";
          if (shouldPersistState) persistedGardenState.currentPageId = next;
          return next;
        });
      },
      (error) => {
        if (error?.code !== "permission-denied" || auth.currentUser?.uid === uid || isReadOnly) {
          console.error("Error fetching garden pages:", error);
        }
        setPages([{ id: STORAGE_PAGE_ID, title: 'Storage' }]);
        setCurrentPageId("default");
      }
    );

    return () => unsubPages();
  }, [isReadOnly, isSharedGarden, sharedGardenId, shouldPersistState, viewedUserId]);

  useEffect(() => {
    if (!pages.length) return;
    if (!currentPageId) return;
    scrollToPageId(currentPageId);
  }, [pages, currentPageId]);

  useEffect(() => {
    if (isEditing) {
      Animated.loop(Animated.sequence([
        Animated.timing(wiggleAnim, { toValue: 1, duration: 130, useNativeDriver: true }),
        Animated.timing(wiggleAnim, { toValue: -1, duration: 130, useNativeDriver: true })
      ])).start();
    } else wiggleAnim.setValue(0);
  }, [isEditing]);

  const canEditPlants = !isSharedGarden || isOwner || !sharedGardenSettings.restrictEditPlants;
  const canCustomize = !isSharedGarden || isOwner || !sharedGardenSettings.restrictCustomize;
  const canAddPeople = !isSharedGarden || isOwner || !sharedGardenSettings.restrictAddPeople;
  const canEnterEditMode = canEditPlants || canCustomize;

  const releaseSharedEditLock = useCallback(async () => {
    if (!isSharedGarden || !sharedGardenId) return;
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    const gardenRef = doc(db, "sharedGardens", sharedGardenId);
    try {
      await runTransaction(db, async (transaction) => {
        const gardenSnap = await transaction.get(gardenRef);
        if (!gardenSnap.exists()) return;
        const gardenData = gardenSnap.data() || {};
        const activeLockUid = gardenData?.editModeLock?.uid;
        if (activeLockUid && activeLockUid !== uid) return;
        transaction.set(gardenRef, { editModeLock: deleteField() }, { merge: true });
      });
    } catch (error) {
      console.error("Failed to release shared edit lock", error);
    }
  }, [isSharedGarden, sharedGardenId]);

  const acquireSharedEditLock = useCallback(async () => {
    if (!isSharedGarden || !sharedGardenId) return true;
    const uid = auth.currentUser?.uid;
    if (!uid) return false;

    const gardenRef = doc(db, "sharedGardens", sharedGardenId);
    const now = Date.now();
    const displayName = myUsername || auth.currentUser?.displayName || "Someone";

    try {
      await runTransaction(db, async (transaction) => {
        const gardenSnap = await transaction.get(gardenRef);
        if (!gardenSnap.exists()) {
          const error = new Error("Shared garden no longer exists.");
          error.code = "shared-garden-missing";
          throw error;
        }

        const gardenData = gardenSnap.data() || {};
        const activeLock = gardenData?.editModeLock || null;
        const activeLockUid = activeLock?.uid;
        const activeLockExpiry = Number(activeLock?.expiresAt) || 0;

        if (activeLockUid && activeLockUid !== uid && activeLockExpiry > now) {
          const error = new Error("Another member is editing this garden.");
          error.code = "shared-edit-locked";
          error.editorName = activeLock?.username || "Someone";
          throw error;
        }

        transaction.set(
          gardenRef,
          {
            editModeLock: {
              uid,
              username: displayName,
              acquiredAt: activeLockUid === uid ? (Number(activeLock?.acquiredAt) || now) : now,
              expiresAt: now + SHARED_EDIT_LOCK_MS,
            },
          },
          { merge: true }
        );
      });
      skipNextSharedLockEnsureRef.current = true;
      return true;
    } catch (error) {
      if (error?.code === "shared-edit-locked") {
        if (!sharedEditLockAlertShown.current) {
          sharedEditLockAlertShown.current = true;
          Alert.alert(
            "Garden in use",
            `${error.editorName} is currently editing this garden. Try again in a moment.`,
            [
              {
                text: "OK",
                onPress: () => { sharedEditLockAlertShown.current = false; },
              },
            ]
          );
        }
      } else if (error?.code !== "shared-garden-missing") {
        console.error("Failed to acquire shared edit lock", error);
      }
      return false;
    }
  }, [isSharedGarden, sharedGardenId, myUsername]);

  useEffect(() => {
    if (!isSharedGarden || !sharedGardenId || !auth.currentUser?.uid) return undefined;
    if (!isEditing) {
      releaseSharedEditLock();
      return undefined;
    }

    let isActive = true;
    const ensureLock = async () => {
      const acquired = await acquireSharedEditLock();
      if (!acquired && isActive) {
        setIsEditing(false);
        if (shouldPersistState) persistedGardenState.isEditing = false;
      }
    };

    if (skipNextSharedLockEnsureRef.current) {
      skipNextSharedLockEnsureRef.current = false;
    } else {
      ensureLock();
    }
    const intervalId = setInterval(() => {
      ensureLock();
    }, SHARED_EDIT_LOCK_RENEW_MS);

    return () => {
      isActive = false;
      clearInterval(intervalId);
      releaseSharedEditLock();
    };
  }, [acquireSharedEditLock, isEditing, isSharedGarden, sharedGardenId, releaseSharedEditLock, shouldPersistState]);

  const activateEditMode = useCallback(async () => {
    if (isReadOnly) return false;
    if (!canEnterEditMode) {
      if (!editRestrictionAlertShown.current) {
        editRestrictionAlertShown.current = true;
        Alert.alert("Restricted", "Only the owner can edit or customize this garden.", [
          {
            text: "OK",
            onPress: () => { editRestrictionAlertShown.current = false; },
          },
        ]);
      }
      return false;
    }
    if (globalDragRef.current || globalDragging) return false;

    if (!isEditing && isSharedGarden) {
      const lockAcquired = await acquireSharedEditLock();
      if (!lockAcquired) return false;
    }

    if (!isEditing) {
      triggerMediumHaptic();
      setIsEditing(true);
      if (shouldPersistState) persistedGardenState.isEditing = true;
      if (onboardingStep === 'garden_tutorial' && onboardingActions?.completedGoal) {
        onOnboardingAction?.('reenteredEditMode');
      }
    }
    return true;
  }, [acquireSharedEditLock, canEnterEditMode, globalDragging, isEditing, isReadOnly, isSharedGarden, onboardingActions, onboardingStep, onOnboardingAction, shouldPersistState]);

  const exitEditModeFromTap = useCallback(() => {
    if (isReadOnly || !isEditing) return;
    triggerSelectionHaptic();
    setIsEditing(false);
    if (shouldPersistState) persistedGardenState.isEditing = false;
    if (onboardingStep === 'garden_tutorial' && onboardingActions?.movedGoal) {
      if (!onboardingActions?.viewedGrowthEducation) {
        setEducationDemoFrame(0);
        setEducationPanelMode('growth');
      }
      onOnboardingAction?.('exitedEditMode');
    }
  }, [isEditing, isReadOnly, onboardingActions, onboardingStep, onOnboardingAction, shouldPersistState]);

  const handleDragStart = async (plant, touchX, touchY, touchLocationX, touchLocationY) => {
    if (!canEditPlants) {
      if (!editRestrictionAlertShown.current) {
        editRestrictionAlertShown.current = true;
        Alert.alert("Restricted", "Only the owner can move or edit plants in this garden.", [
          {
            text: "OK",
            onPress: () => { editRestrictionAlertShown.current = false; },
          },
        ]);
      }
      return false;
    }

    const editModeReady = await activateEditMode();
    if (!editModeReady || globalDragRef.current) return false;

    globalDragRef.current = true;
    setGlobalDragging(true);
    globalPan.setValue({ x: 0, y: 0 });

    // Center plant directly under finger
    setDraggedGhost({
  plant,
  x: touchX - 44,
  y: touchY  + 44,
});
    return true;
  };

  const parseDestinationSlot = (dest) => {
    const lastUnderscore = dest.lastIndexOf('_');
    if (lastUnderscore === -1) return null;

    const shelfName = dest.slice(0, lastUnderscore);
    const slotIndex = parseInt(dest.slice(lastUnderscore + 1), 10);

    if (!shelfName || Number.isNaN(slotIndex)) return null;
    return { shelfName, slotIndex };
  };

  const normalizeShelfPosition = (position) => {
    if (!position) return null;
    const shelfName = position?.shelfName;
    const slotIndex = Number(position?.slotIndex);
    if (!shelfName || Number.isNaN(slotIndex)) return null;
    return {
      pageId: position?.pageId || "default",
      shelfName,
      slotIndex,
    };
  };

  const shelfPositionsMatch = (left, right) => {
    const leftNorm = normalizeShelfPosition(left);
    const rightNorm = normalizeShelfPosition(right);
    if (!leftNorm && !rightNorm) return true;
    if (!leftNorm || !rightNorm) return false;
    return leftNorm.pageId === rightNorm.pageId
      && leftNorm.shelfName === rightNorm.shelfName
      && leftNorm.slotIndex === rightNorm.slotIndex;
  };

  const handleDragEnd = async (plant, moveX, moveY, dragStartShelfPosition, completeLocalDrag) => {
    let didUnlock = false;

    const unlock = () => {
      if (didUnlock) return;
      didUnlock = true;
      globalDragRef.current = false;
      setGlobalDragging(false);
      setDraggedGhost(null);
      completeLocalDrag();
    };

    const unlockAfterLocalDrop = () => {
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(() => unlock());
      } else {
        setTimeout(() => unlock(), 0);
      }
    };

    try {
      const uid = auth.currentUser?.uid;
      const dest = await checkDropZones(moveX, moveY, plant.id);
      if (dest) {
        if (onboardingStep === 'garden_tutorial') {
          onOnboardingAction?.('movedGoal');
          setTutorialPlantId(plant.id);
        }
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        const baseOldPos = dragStartShelfPosition
          ? { ...dragStartShelfPosition, pageId: dragStartShelfPosition.pageId || currentPageId }
          : (plant.shelfPosition
            ? { ...plant.shelfPosition, pageId: plant.shelfPosition.pageId || currentPageId }
            : null);

        const applyLocalDrop = () => {
          if (isSharedGarden) {
            if (dest === 'drawer') {
              sharedDropOverridesRef.current[plant.id] = null;
            } else {
              const parsedDest = parseDestinationSlot(dest);
              if (parsedDest) {
                sharedDropOverridesRef.current[plant.id] = {
                  pageId: currentPageId,
                  shelfName: parsedDest.shelfName,
                  slotIndex: parsedDest.slotIndex,
                };
              }
            }
          }

          setAllPlants((prev) => {
            const newArr = [...prev];
            const pIdx = newArr.findIndex((p) => p.id === plant.id);
            if (dest === 'drawer') {
              newArr[pIdx] = { ...newArr[pIdx], shelfPosition: null };
            } else {
              const parsedDest = parseDestinationSlot(dest);
              if (!parsedDest) {
                return prev;
              }
              const { shelfName, slotIndex } = parsedDest;
              const occIdx = newArr.findIndex(
                (p) => p.shelfPosition?.pageId === currentPageId && p.shelfPosition?.shelfName === shelfName && p.shelfPosition?.slotIndex === slotIndex
              );
              if (occIdx !== -1 && newArr[occIdx].id !== plant.id) {
                newArr[occIdx] = { ...newArr[occIdx], shelfPosition: baseOldPos };
              }
              newArr[pIdx] = { ...newArr[pIdx], shelfPosition: { pageId: currentPageId, shelfName, slotIndex } };
            }
            if (shouldPersistState) persistedGardenState.allPlants = newArr;
            return newArr;
          });
        };

        applyLocalDrop();
        unlockAfterLocalDrop();

        try {
          const activeSharedLockUid = sharedGardenSettings?.editModeLock?.uid;
          const activeSharedLockExpiry = Number(sharedGardenSettings?.editModeLock?.expiresAt) || 0;
          if (isSharedGarden && activeSharedLockUid && activeSharedLockUid !== uid && activeSharedLockExpiry > Date.now()) {
            const error = new Error("Another member is editing this garden.");
            error.code = "shared-edit-locked";
            error.editorName = sharedGardenSettings?.editModeLock?.username || "Someone";
            throw error;
          }

          if (dest === 'drawer') {
            const targetDoc = isSharedGarden
              ? doc(db, "sharedGardens", sharedGardenId, "layout", plant.id)
              : doc(db, "users", uid, "gardenLayout", plant.id);

            if (isSharedGarden) {
              await setDoc(targetDoc, { shelfPosition: null, moveLock: deleteField() }, { merge: true });
            } else {
              await setDoc(targetDoc, { shelfPosition: null }, { merge: true });
            }
          } else {
            const parsedDest = parseDestinationSlot(dest);
            if (!parsedDest) return;
            const { shelfName, slotIndex } = parsedDest;
            const targetPos = { pageId: currentPageId, shelfName, slotIndex };
            const oldPos = baseOldPos;
            const occupant = allPlants.find(
              (p) => p.shelfPosition?.pageId === currentPageId && p.shelfPosition?.shelfName === shelfName && p.shelfPosition?.slotIndex === slotIndex
            );

            const batch = writeBatch(db);
            if (occupant && occupant.id !== plant.id) {
              const occupantDoc = isSharedGarden
                ? doc(db, "sharedGardens", sharedGardenId, "layout", occupant.id)
                : doc(db, "users", uid, "gardenLayout", occupant.id);
              batch.set(
                occupantDoc,
                isSharedGarden ? { shelfPosition: oldPos, moveLock: deleteField() } : { shelfPosition: oldPos },
                { merge: true }
              );
            }

            const plantDoc = isSharedGarden
              ? doc(db, "sharedGardens", sharedGardenId, "layout", plant.id)
              : doc(db, "users", uid, "gardenLayout", plant.id);

            // --- PATCH: Copy trophy/progress/health state when moving to shared garden ---
            let extraFields = {};
            if (isSharedGarden) {
              try {
                // Try to get the user's goal document for this plant
                const userGoalRef = doc(db, "users", plant.ownerId || uid, "goals", plant.sourceGoalId || plant.id);
                const userGoalSnap = await getDoc(userGoalRef);
                if (userGoalSnap.exists()) {
                  const userGoalData = userGoalSnap.data();
                  // Copy relevant fields
                  extraFields = {
                    healthLevel: userGoalData.healthLevel ?? null,
                    currentStreak: userGoalData.currentStreak ?? null,
                    longestStreak: userGoalData.longestStreak ?? null,
                    logs: userGoalData.logs ?? null,
                    totalCompletions: userGoalData.totalCompletions ?? null,
                    trophyAwarded: userGoalData.trophyAwarded ?? null,
                    // Add more fields as needed
                  };
                }
              } catch (err) {
                console.error('[TROPHY MIGRATION] Failed to copy goal state to shared garden:', err);
              }
            }

            batch.set(
              plantDoc,
              isSharedGarden
                ? { shelfPosition: targetPos, moveLock: deleteField(), ...extraFields }
                : { shelfPosition: targetPos },
              { merge: true }
            );
            await batch.commit();
          }
        } catch (e) {
          if (isSharedGarden) {
            delete sharedDropOverridesRef.current[plant.id];
          }
          if (e?.code === "shared-edit-locked") {
            const editorName = e?.editorName || "Someone";
            Alert.alert("Garden in use", `${editorName} is currently editing this garden. Try again in a moment.`);
            setIsEditing(false);
            if (shouldPersistState) persistedGardenState.isEditing = false;
          } else {
            console.error(e);
          }
        }

        return;
      }

      Animated.spring(globalPan, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start(() => {
        unlock();
      });
    } catch (e) {
      console.error('Drag end failed', e);
      unlock();
    }
  };

  const handleAddPage = async () => {
    if (isReadOnly || !auth.currentUser) return;
    if (!canCustomize) {
      Alert.alert("Restricted", "Only the owner can customize this garden.");
      return;
    }

    const shouldCheckPageLimit = !isSharedGarden || isOwner;
    if (shouldCheckPageLimit) {
      const pageLimit = canAddGardenPage({ isPro, pages });
      if (showSubscriptionLimitAlert(pageLimit, openDefaultPaywall)) {
        return;
      }
    }

    const uid = auth.currentUser.uid;
    const newPageRef = isSharedGarden
      ? doc(collection(db, "sharedGardens", sharedGardenId, "pages"))
      : doc(collection(db, "users", uid, "gardenPages"));
    const realPageCount = pages.filter((p) => p.id !== STORAGE_PAGE_ID).length;
    const title = `Page ${realPageCount + 1}`;
    await setDoc(newPageRef, { title, createdAt: Date.now() });
    setCurrentPageId(newPageRef.id);
  };

  const [customizerType, setCustomizerType] = useState('wall');
  const handleCustomization = useCallback((type = 'wall') => {
    if (currentPageId === STORAGE_PAGE_ID) {
      Alert.alert("Can't customize trophies", "Switch to a garden page to customize its look.");
      return;
    }
    setCustomizerType(type || 'wall');
    setShowCustomization(true);
    if (onboardingStep === 'garden_tutorial' && !onboardingActions?.customizedGarden) {
      onOnboardingAction?.('customizedGarden');
    }
  }, [currentPageId, onboardingStep, onboardingActions, onOnboardingAction]);

  const handleResetPositions = async () => {
    if (isReadOnly || !auth.currentUser) return;
    if (!canEditPlants) {
      Alert.alert("Restricted", "Only the owner can reset plant positions in this garden.");
      return;
    }
    if (!currentPageId || currentPageId === STORAGE_PAGE_ID) return;
    const uid = auth.currentUser.uid;
    const batch = writeBatch(db);
    allPlants.forEach((p) => {
      if (p.shelfPosition?.pageId !== currentPageId) return;
      const targetDoc = isSharedGarden
        ? doc(db, "sharedGardens", sharedGardenId, "layout", p.id)
        : doc(db, "users", uid, "gardenLayout", p.id);
      batch.set(targetDoc, { shelfPosition: null }, { merge: true });
    });
    try {
      await batch.commit();
      setAllPlants((prev) => {
        const next = prev.map((p) => (
          p.shelfPosition?.pageId !== currentPageId
            ? p
            : { ...p, shelfPosition: null }
        ));
        if (shouldPersistState) persistedGardenState.allPlants = next;
        return next;
      });
    } catch (e) {
      console.error('Failed to reset positions', e);
    }
  };

  const handleRemoveCurrentPage = async () => {
    if (isReadOnly || !auth.currentUser || !currentPageId) return;
    if (!canCustomize) {
      Alert.alert("Restricted", "Only the owner can customize this garden.");
      return;
    }
    const realPages = pages.filter((p) => p.id !== STORAGE_PAGE_ID);
    if (realPages.length <= 1) {
      Alert.alert("Can't remove page", "You need at least one garden page.");
      return;
    }
    if (currentPageId === STORAGE_PAGE_ID || currentPageId === "default") {
      Alert.alert("Can't remove this page", "The default page can't be removed.");
      return;
    }

    const uid = auth.currentUser.uid;
    const remainingPages = pages.filter((p) => p.id !== currentPageId);
    const nextPageId = remainingPages.find((p) => p.id !== STORAGE_PAGE_ID)?.id || STORAGE_PAGE_ID;

    try {
      const batch = writeBatch(db);
      allPlants
        .filter((plant) => plant.shelfPosition?.pageId === currentPageId)
        .forEach((plant) => {
          const targetDoc = isSharedGarden
            ? doc(db, "sharedGardens", sharedGardenId, "layout", plant.id)
            : doc(db, "users", uid, "gardenLayout", plant.id);
          batch.set(targetDoc, { shelfPosition: null }, { merge: true });
        });

      const pageDoc = isSharedGarden
        ? doc(db, "sharedGardens", sharedGardenId, "pages", currentPageId)
        : doc(db, "users", uid, "gardenPages", currentPageId);
      batch.delete(pageDoc);
      await batch.commit();

      setCurrentPageId(nextPageId);
      if (shouldPersistState) persistedGardenState.currentPageId = nextPageId;
    } catch (error) {
      console.error("Failed to remove page", error);
      Alert.alert("Error", "Could not remove this page right now.");
    }
  };

  const createSharedGardenWithName = async (rawName) => {
    const trimmedName = String(rawName || '').trim();
    if (!trimmedName || isReadOnly || !auth.currentUser || creatingSharedGarden) return;

    const uid = auth.currentUser.uid;
    const createLimit = canCreateSharedGarden({ isPro, gardens: sharedGardens, uid });
    if (showSubscriptionLimitAlert(createLimit, openDefaultPaywall)) {
      return;
    }

    try {
      setCreatingSharedGarden(true);
      const gardenRef = doc(collection(db, 'sharedGardens'));
      const nextName = trimmedName;
      const createdAt = Date.now();

      await setDoc(gardenRef, {
        name: nextName,
        ownerId: uid,
        ownerUsername: myUsername || 'User',
        memberIds: [uid],
        createdAt,
      });

      await setDoc(doc(db, 'sharedGardens', gardenRef.id, 'pages', SHARED_GARDEN_DEFAULT_PAGE_ID), {
        title: 'Page 1',
        createdAt,
      }, { merge: true });

      navigation.navigate('SharedGarden', { gardenId: gardenRef.id, gardenName: nextName });
      setShowSharedGardensModal(false);
    } catch (error) {
      console.error('Failed to create shared garden', error);
      Alert.alert('Error', 'Could not create a shared garden right now.');
    } finally {
      setCreatingSharedGarden(false);
    }
  };

  const closeCreateSharedGardenModal = () => {
    setShowCreateSharedGardenModal(false);
    setNewSharedGardenName('');
  };

  const handleCreateSharedGarden = () => {
    if (isReadOnly || !auth.currentUser || creatingSharedGarden) return;

    const createLimit = canCreateSharedGarden({
      isPro,
      gardens: sharedGardens,
      uid: auth.currentUser.uid,
    });
    if (showSubscriptionLimitAlert(createLimit, openDefaultPaywall)) {
      return;
    }

    if (Platform.OS === 'ios' && typeof Alert.prompt === 'function') {
      Alert.prompt(
        'New Garden',
        'Name your new garden',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Create',
            onPress: (value) => {
              const trimmed = String(value || '').trim();
              if (!trimmed) {
                Alert.alert('Name required', 'Please enter a garden name before creating.');
                return;
              }
              createSharedGardenWithName(trimmed);
            },
          },
        ],
        'plain-text'
      );
      return;
    }

    setNewSharedGardenName('');
    setShowSharedGardensModal(false);
    setShowCreateSharedGardenModal(true);
  };

  const handleConfirmCreateSharedGarden = () => {
    const trimmed = String(newSharedGardenName || '').trim();
    if (!trimmed) {
      Alert.alert('Name required', 'Please enter a garden name before creating.');
      return;
    }
    closeCreateSharedGardenModal();
    createSharedGardenWithName(trimmed);
  };

  const handleSendSharedGardenInvite = async (garden, targetUser) => {
    if (isReadOnly || !auth.currentUser || !garden?.id || !targetUser?.id) return;
    const inviteKey = `${garden.id}:${targetUser.id}`;

    try {
      setActiveInviteKey(inviteKey);
      const inviteRef = doc(db, 'users', targetUser.id, 'sharedGardenInvites', `${garden.id}_${auth.currentUser.uid}`);
      await setDoc(inviteRef, {
        gardenId: garden.id,
        gardenName: garden.name || 'Shared Garden',
        invitedByUid: auth.currentUser.uid,
        invitedByUsername: myUsername || 'User',
        createdAt: Date.now(),
      }, { merge: true });

      Alert.alert('Invite sent', `${targetUser.username || 'User'} can now accept the invitation from their garden screen.`);
    } catch (error) {
      console.error('Failed to send shared garden invite', error);
      Alert.alert('Error', 'Could not send the shared garden invite.');
    } finally {
      setActiveInviteKey('');
    }
  };

  const handleAcceptSharedGardenInvite = async (invite) => {
    if (isReadOnly || !auth.currentUser || !invite?.gardenId) return;

    try {
      setAcceptingInviteId(invite.id);
      const uid = auth.currentUser.uid;

      const joinLimit = canJoinSharedGarden({ isPro, gardens: sharedGardens, uid });
      if (showSubscriptionLimitAlert(joinLimit, openDefaultPaywall)) {
        return;
      }

      const gardenRef = doc(db, 'sharedGardens', invite.gardenId);
      const gardenSnap = await getDoc(gardenRef);

      if (!gardenSnap.exists()) {
        await deleteDoc(doc(db, 'users', uid, 'sharedGardenInvites', invite.id));
        Alert.alert('Unavailable', 'That shared garden no longer exists.');
        return;
      }

      let alreadyMember = false;
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(gardenRef);
        if (!snap.exists()) {
          const err = new Error('garden-not-found');
          err.code = 'garden-not-found';
          throw err;
        }

        const data = snap.data() || {};
        const memberIds = Array.isArray(data.memberIds) ? data.memberIds : [];
        if (memberIds.includes(uid)) {
          alreadyMember = true;
          return;
        }

        const updateData = { memberIds: arrayUnion(uid) };
        console.log('[acceptSharedGardenInvite] tx.update:', JSON.stringify(updateData));
        tx.update(gardenRef, updateData);
      });

      await deleteDoc(doc(db, 'users', uid, 'sharedGardenInvites', invite.id));
      await updateOverallScoreForUser(uid);
      if (alreadyMember) {
        Alert.alert('Already joined', `You are already a member of ${invite.gardenName || 'this shared garden'}.`);
      } else {
        Alert.alert('Joined shared garden', `You joined ${invite.gardenName || 'the shared garden'}.`);
      }
    } catch (error) {
      console.error('Failed to accept shared garden invite', error);
      Alert.alert('Error', 'Could not accept the invitation right now.');
    } finally {
      setAcceptingInviteId('');
    }
  };

  const openSharedGarden = (garden) => {
    if (!garden?.id) return;
    setShowSharedGardensModal(false);
    if (isSharedGarden) {
      // Replace in-place with no animation — feels like switching, not navigating
      navigation.dispatch({ ...StackActions.replace('SharedGarden', { gardenId: garden.id, gardenName: garden.name || 'Shared Garden' }), animated: false });
    } else {
      navigation.navigate('SharedGarden', { gardenId: garden.id, gardenName: garden.name || 'Shared Garden' });
    }
  };

  const openPersonalGarden = () => {
    setShowSharedGardensModal(false);
    if (isSharedGarden) {
      // Stack is always exactly: Personal > SharedGarden, so one goBack lands on Personal
      navigation.goBack();
    }
  };

  const handleLeaveSharedGarden = async (garden) => {
    if (isReadOnly || !auth.currentUser || !garden?.id || leavingGardenId) return;
    const leavingCurrentlyViewedSharedGarden = isSharedGarden && sharedGardenId === garden.id;

    try {
      setLeavingGardenId(garden.id);
      const uid = auth.currentUser.uid;
      const gardenRef = doc(db, 'sharedGardens', garden.id);
      let shouldDeleteSharedGoals = false;

      await runTransaction(db, async (tx) => {
        const snap = await tx.get(gardenRef);
        if (!snap.exists()) {
          const err = new Error('garden-not-found');
          err.code = 'garden-not-found';
          throw err;
        }

        const data = snap.data() || {};
        const memberIds = Array.isArray(data.memberIds) ? data.memberIds : [];
        if (!memberIds.includes(uid)) return;

        const nextMemberIds = memberIds.filter((memberId) => memberId !== uid);
        shouldDeleteSharedGoals = nextMemberIds.length === 0;
        const updateData = { memberIds: nextMemberIds };
        console.log('[removeFromSharedGarden] tx.update:', JSON.stringify(updateData));
        tx.update(gardenRef, { memberIds: nextMemberIds });
      });

      if (shouldDeleteSharedGoals) {
        const layoutSnap = await getDocs(collection(db, 'sharedGardens', garden.id, 'layout'));
        if (!layoutSnap.empty) {
          const batch = writeBatch(db);
          layoutSnap.forEach((layoutDoc) => {
            batch.delete(layoutDoc.ref);
          });
          await batch.commit();
        }
      }

      if (expandedInviteGardenId === garden.id) {
        setExpandedInviteGardenId(null);
      }
      await updateOverallScoreForUser(uid);
      if (!shouldDeleteSharedGoals) {
        await updateOverallScoresForSharedGardenMembers(garden.id);
      }

      if (leavingCurrentlyViewedSharedGarden) {
        setShowSharedGardensModal(false);
        if (navigation.canGoBack()) {
          navigation.goBack();
        } else {
          navigation.navigate('Garden');
        }
        return;
      }

      if (shouldDeleteSharedGoals) {
        Alert.alert('Shared garden emptied', `You left ${garden.name || 'the shared garden'}. All shared goals were deleted because no members remain.`);
      } else {
        Alert.alert('Left shared garden', `You left ${garden.name || 'the shared garden'}.`);
      }
    } catch (error) {
      console.error('Failed to leave shared garden', error);
      Alert.alert('Error', 'Could not leave this shared garden right now.');
    } finally {
      setLeavingGardenId('');
    }
  };

  const confirmLeaveSharedGarden = (garden) => {
    if (!garden?.id) return;
    Alert.alert(
      'Leave Shared Garden',
      `Leave ${garden.name || 'this shared garden'}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Leave', style: 'destructive', onPress: () => handleLeaveSharedGarden(garden) },
      ]
    );
  };

  const checkDropZones = async (moveX, moveY, draggedPlantId = null) => {
    if (drawerRef.current && currentPageRef.current !== STORAGE_PAGE_ID) {
      const dRect = await new Promise((res) => {
        drawerRef.current.measure((x, y, w, h, px, py) => {
          res(px !== undefined ? { l: px, r: px + w, t: py, b: py + h } : null);
        });
      });

      if (dRect && moveX >= dRect.l && moveX <= dRect.r && moveY >= dRect.t && moveY <= dRect.b) return 'drawer';
    }

    const prefix = `${currentPageRef.current}_`;
    const candidateKeys = Object.keys(slotRefs.current).filter((key) => key.startsWith(prefix));

    for (const slotKey of candidateKeys) {
      const slotRef = slotRefs.current[slotKey];
      if (!slotRef) continue;

      const rect = await new Promise((res) => {
        slotRef.measure((x, y, w, h, px, py) => {
          res(px !== undefined ? {
            l: px,
            r: px + w,
            t: py,
            b: py + h,
          } : null);
        });
      });

      if (!rect) continue;

      const isInside =
        moveX >= rect.l &&
        moveX <= rect.r &&
        moveY >= rect.t &&
        moveY <= rect.b;

      if (!isInside) continue;

      const suffix = slotKey.slice(prefix.length);
      const lastUnderscore = suffix.lastIndexOf('_');
      if (lastUnderscore === -1) continue;

      const shelfName = suffix.slice(0, lastUnderscore);
      const slotIndex = Number(suffix.slice(lastUnderscore + 1));

      // Check if slot is occupied by another plant
      const occupied = allPlants.find(
        (p) =>
          p.id !== draggedPlantId &&
          p.shelfPosition?.pageId === currentPageRef.current &&
          p.shelfPosition?.shelfName === shelfName &&
          Number(p.shelfPosition?.slotIndex) === slotIndex
      );

      if (occupied) return null;

      return `${shelfName}_${slotIndex}`;
    }

    return null;
  };

  // --- EXACT SHELF CONFIGS FROM ORIGINAL ---
  const SHELF_CONFIG = {
    topShelf: { side: 'left', width: '65%', offsetTop: -0, slots: 3 },
    middleShelf: { side: 'right', width: '65%', offsetTop: -50, slots: 3 },
    bottomShelf: { side: 'full', width: '100%', offsetTop: 130, slots: 4 },
  };

  const currentPage = pages.find(p => p.id === currentPageId);
  const pageTitle = currentPage?.title ?? "My Garden";

  const drawerPlants = allPlants.filter(p => !p.shelfPosition); // only show unassigned plants in the drawer
  const handlePlantTap = useCallback((plant) => {
    if (!plant?.id || globalDragging || dragPageSwitching) return;
    navigation.navigate("Goal", {
      goalId: plant.id,
      source: isSharedGarden ? "shared-garden" : "garden",
      sharedGardenId: isSharedGarden ? sharedGardenId : undefined,
      gardenName: isSharedGarden ? viewedUsername : undefined,
    });
  }, [dragPageSwitching, globalDragging, isSharedGarden, navigation, sharedGardenId, viewedUsername]);

  const clearPlantFromLayout = useCallback((plantId) => {
    if (!plantId || !auth.currentUser) return;
    if (!canEditPlants) {
      Alert.alert("Restricted", "Only the owner can remove plants in this garden.");
      return;
    }
    if (isSharedGarden) {
      setDoc(doc(db, "sharedGardens", sharedGardenId, "layout", plantId), { shelfPosition: null }, { merge: true });
      return;
    }
    setDoc(doc(db, "users", auth.currentUser.uid, "gardenLayout", plantId), { shelfPosition: null }, { merge: true });
  }, [isSharedGarden, sharedGardenId, canEditPlants]);

  const renderStorageShelf = (pageId, shelfIdx, plantsOnPage) => {
    const shelfName = `storageShelf_${shelfIdx}`;
    return (
      <View key={`${pageId}_${shelfName}`} style={[styles.shelfWrapper, styles.storageShelfWrapper]}>
        <LinearGradient
          colors={['#FF6A28', '#E0502A', '#B43A2A']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0.25 }}
          style={[styles.shelfLedge, styles.bottomShelfLedge, styles.storageShelfLedge]}
        >
          <View style={[styles.shelfHighlightLeft, styles.bottomShelfHighlightLeft]} />
          <View style={[styles.shelfHighlightRight, styles.bottomShelfHighlightRight]} />
          <View style={[styles.shelfCornerShade, styles.bottomShelfCornerShade]} />
          <View style={[styles.shelfBand, styles.bottomShelfBand]}>
            <View style={[styles.shelfBandDivider, styles.bottomShelfBandDivider]} />
            <LinearGradient
              colors={['#8A2D35', '#65243A']}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={[styles.shelfBandUpper, styles.bottomShelfBandUpper]}
            />
            <LinearGradient
              colors={['#592344', '#3D1736']}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={[styles.shelfBandLower, styles.bottomShelfBandLower]}
            />
          </View>
        </LinearGradient>

        <View style={styles.slotsRow}>
          {Array.from({ length: 4 }).map((_, idx) => {
            const occupant = plantsOnPage.find(
              (p) => p.shelfPosition?.shelfName === shelfName && p.shelfPosition?.slotIndex === idx
            );
            const slotKey = `${pageId}_${shelfName}_${idx}`;
            return (
              <View key={slotKey} ref={el => slotRefs.current[slotKey] = el} style={[styles.slot, isEditing && styles.slotEditBox]} collapsable={false}>
                {occupant && (
                  <DraggablePlant
                    key={occupant.id}
                    plant={occupant}
                    isEditing={isEditing}
                    disabled={isReadOnly}
                    onCompletionTargetRef={setCompletionTargetRef}
                    wiggleAnim={wiggleAnim}
                    onLongPress={activateEditMode}
                    onPlantTap={handlePlantTap}
                    globalPan={globalPan}
                    globalDragRef={globalDragRef}
                    instantDrag={isEditing}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                    onDelete={() => clearPlantFromLayout(occupant.id)}
                  />
                )}
              </View>
            );
          })}
        </View>
      </View>
    );
  };

const renderShelf = (pageId, shelfName, plantsOnPage, shelfColorIdx = 0, onBottomShelfLayout) => {
  const config = SHELF_CONFIG[shelfName];
  const isBottomShelf = shelfName === 'bottomShelf';
  const scheme = SHELF_COLOR_SCHEMES[shelfColorIdx] || SHELF_COLOR_SCHEMES[0];

  const shelfDecor = (
    <>
      <View style={[styles.shelfHighlightLeft, isBottomShelf && styles.bottomShelfHighlightLeft, { backgroundColor: isBottomShelf ? scheme.bottomHighlightLeft : scheme.highlightLeft }]} />
      <View style={[styles.shelfHighlightRight, isBottomShelf && styles.bottomShelfHighlightRight, { backgroundColor: isBottomShelf ? scheme.bottomHighlightRight : scheme.highlightRight }]} />
      <View style={[styles.shelfCornerShade, isBottomShelf && styles.bottomShelfCornerShade, { backgroundColor: isBottomShelf ? scheme.bottomCornerShade : scheme.cornerShade }]} />
      <View style={[styles.shelfBand, isBottomShelf && styles.bottomShelfBand]}>
        <View style={[styles.shelfBandDivider, isBottomShelf && styles.bottomShelfBandDivider, { backgroundColor: isBottomShelf ? scheme.bottomBandDivider : scheme.bandDivider }]} />
        {isBottomShelf ? (
          <LinearGradient
            colors={scheme.bandUpperGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={[styles.shelfBandUpper, styles.bottomShelfBandUpper]}
          />
        ) : (
          <View style={[styles.shelfBandUpper, { backgroundColor: scheme.bandUpperBg }]} />
        )}
        {isBottomShelf ? (
          <LinearGradient
            colors={scheme.bandLowerGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={[styles.shelfBandLower, styles.bottomShelfBandLower]}
          />
        ) : (
          <View style={[styles.shelfBandLower, { backgroundColor: scheme.bandLowerBg }]} />
        )}
      </View>
    </>
  );

  return (
    <View
      key={`${pageId}_${shelfName}`}
      style={[styles.shelfWrapper, { width: config.width, alignSelf: config.side==='left'?'flex-start':config.side==='right'?'flex-end':'center', marginTop: config.offsetTop }]}
      onLayout={isBottomShelf ? onBottomShelfLayout : undefined}
    >
      {isBottomShelf ? (
        <LinearGradient
          colors={scheme.ledgeGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0.25 }}
          style={[styles.shelfLedge, styles.bottomShelfLedge]}
        >
          {shelfDecor}
        </LinearGradient>
      ) : (
        <View style={styles.shelfShadow}>
          <View style={[styles.shelfLedge, { backgroundColor: scheme.ledgeBg }]}>{shelfDecor}</View>
        </View>
      )}
      <View style={styles.slotsRow}>
        {Array.from({ length: config.slots }).map((_, idx) => {
          const occupant = plantsOnPage.find(p => p.shelfPosition?.shelfName === shelfName && p.shelfPosition?.slotIndex === idx);
          const slotKey = `${pageId}_${shelfName}_${idx}`;
          const tutorialEducationDemo = (
            onboardingStep === "garden_tutorial"
            && pageId === currentPageId
            && occupant?.id === tutorialPlantId
            && educationPanelMode
          ) ? { mode: educationPanelMode, frame: educationDemoFrame } : null;
          return (
            <View key={slotKey} ref={el => slotRefs.current[slotKey] = el} style={[styles.slot, isEditing && styles.slotEditBox]} collapsable={false}>
              {occupant && (
                <DraggablePlant 
                  key={occupant.id}
                  plant={occupant} isEditing={isEditing} disabled={isReadOnly} wiggleAnim={wiggleAnim} 
                  onCompletionTargetRef={setCompletionTargetRef}
                  onLongPress={activateEditMode} globalPan={globalPan} globalDragRef={globalDragRef} 
                  onPlantTap={handlePlantTap}
                  instantDrag={isEditing}
                  onDragStart={handleDragStart} onDragEnd={handleDragEnd}
                  onDelete={() => clearPlantFromLayout(occupant.id)}
                  educationDemo={tutorialEducationDemo}
                />
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
};


  const storageTouchTimer = useRef(null);
  const storageTouchMoved = useRef(false);
  const storageTouchStartTime = useRef(0);

  const renderGardenPage = (page) => {
    // Get customization for this page
    const custom = customizations?.[page.id] || {};
    const farBgIdx = custom.farBg ?? 0;
    const wallBgIdx = custom.wallBg ?? 0;
    const windowFrameIdx = custom.windowFrame ?? 0;
    const shelfColorIdx = custom.shelfColor ?? 0;
    // Import asset arrays
    // ...existing code...
    if (page.id === STORAGE_PAGE_ID) {
      const plantsOnPage = allPlants.filter(p => p.shelfPosition?.pageId === STORAGE_PAGE_ID);
      return (
        <View style={[styles.storagePage, { width, height }]}> 
          <View style={styles.storageHeader}>
            <Text style={styles.storageHeaderTitle}>Trophies</Text>
          </View>
          <ScrollView
            style={styles.storageScroll}
            contentContainerStyle={styles.storageScrollContent}
            showsVerticalScrollIndicator={false}
            scrollEnabled={!globalDragging}
            keyboardShouldPersistTaps="handled"
            onTouchStart={() => {
              if (isReadOnly) return;
              storageTouchMoved.current = false;
              storageTouchStartTime.current = Date.now();
              storageTouchTimer.current = setTimeout(() => {
                if (!storageTouchMoved.current) activateEditMode();
              }, 350);
            }}
            onTouchMove={() => {
              if (isReadOnly) return;
              storageTouchMoved.current = true;
              clearTimeout(storageTouchTimer.current);
            }}
            onTouchEnd={() => {
              if (isReadOnly) return;
              clearTimeout(storageTouchTimer.current);
              const elapsed = Date.now() - storageTouchStartTime.current;
              if (!storageTouchMoved.current && elapsed < 300 && isEditing) {
                exitEditModeFromTap();
              }
            }}
          >
            {Array.from({ length: Math.max(1, Math.ceil(plantsOnPage.length / 4) + 1) }).map((_, shelfIdx) =>
              renderStorageShelf(STORAGE_PAGE_ID, shelfIdx, plantsOnPage)
            )}
          </ScrollView>
        </View>
      );
    }

    const plantsOnPage = allPlants.filter(p => p.shelfPosition?.pageId === page.id);

    // Use customization indices to select assets
    const previewWidth = width;
    const previewHeight = height;
    return (
      <HapticPressable
        delayLongPress={350}
        onLongPress={isReadOnly ? undefined : activateEditMode}
        onPress={() => {
          exitEditModeFromTap();
        }}
      >
        <View style={{ width, height, overflow: 'hidden' }}>
          <ImageBackground
            source={FAR_BG_ASSETS[farBgIdx]}
            style={[styles.farBackground, { width, height }]}
            imageStyle={styles.farImageStyle}
            resizeMode="contain"
          >
            <ImageBackground
              source={WALLPAPER_ASSETS[wallBgIdx]}
              style={[styles.gardenBackground, { width, height }]}
              imageStyle={styles.gardenImageStyle}
              resizeMode="cover"
            >
              {FRAME_ASSETS[windowFrameIdx] && (
                <Image
                  source={FRAME_ASSETS[windowFrameIdx]}
                  style={[styles.gardenImageStyle, { position: 'absolute', width, height }]}
                  resizeMode="cover"
                />
              )}
              {/* Customization Circles Overlay moved to CustomizationScreen.js */}
              <View pointerEvents="none" style={[styles.pageDrawerUnderlay, { top: drawerTop, left: 0, right: 0 }]}> 
                <View style={styles.pageDrawerUnderlayTopBandPrimary} />
                <View style={styles.pageDrawerUnderlayTopBandSecondary} />
              </View>
              <View
                ref={page.id === currentPageId ? gardenMainRef : undefined}
                style={styles.gardenMain}
                onLayout={(e) => {
                  onGardenMainLayout(e);
                  if (onboardingStep === 'garden_tutorial' && page.id === currentPageId) {
                    measureTutorialHotspot();
                  }
                }}
              >
                {["topShelf", "middleShelf", "bottomShelf"].map((shelfName) =>
                  renderShelf(
                    page.id,
                    shelfName,
                    plantsOnPage,
                    shelfColorIdx,
                    shelfName === 'bottomShelf' ? onBottomShelfLayout : undefined
                  )
                )}
              </View>
            </ImageBackground>
          </ImageBackground>
          <GardenAmbientParticles />
        </View>
      </HapticPressable>
    );
  };

  if (loading) return <View style={styles.loader}><ActivityIndicator size="large" color="#2D5A27" /></View>;

  const dots = (
    <View style={styles.pageDots}>
      {pages.map((page, index) => {
        const inputRange = [(index - 1) * width, index * width, (index + 1) * width];
        const isTrophyDot = page.id === STORAGE_PAGE_ID;
        const animatedWidth = pageScrollX.interpolate({
          inputRange,
          outputRange: [8, 20, 8],
          extrapolate: 'clamp',
        });
        const animatedOpacity = pageScrollX.interpolate({
          inputRange,
          outputRange: [0.45, 1, 0.45],
          extrapolate: 'clamp',
        });
        const animatedScale = pageScrollX.interpolate({
          inputRange,
          outputRange: [1, 1.15, 1],
          extrapolate: 'clamp',
        });
        const animatedBackgroundColor = pageScrollX.interpolate({
          inputRange,
          outputRange: isTrophyDot
            ? ['rgba(255, 196, 64, 0.45)', '#FFD54A', 'rgba(255, 196, 64, 0.45)']
            : ['rgb(103, 103, 103)', '#ffffff', 'rgb(103, 103, 103)'],
          extrapolate: 'clamp',
        });

        return (
          <Animated.View
            key={page.id}
            style={[
              styles.dot,
              {
                width: animatedWidth,
                backgroundColor: animatedBackgroundColor,
                opacity: animatedOpacity,
                transform: [{ scale: animatedScale }],
              },
            ]}
          />
        );
      })}
    </View>
  );

  const pageIndex = pages.findIndex(p => p.id === currentPageId);
  const currentSharedGarden = isSharedGarden
    ? (sharedGardens.find((g) => g.id === sharedGardenId) || null)
    : null;
  const currentGardenInvitees = currentSharedGarden
    ? followingUsers.filter((user) => !(currentSharedGarden.memberIds || []).includes(user.id || user.uid))
    : [];
  const showCurrentGardenInviteList = isSharedGarden && expandedInviteGardenId === sharedGardenId;
  const otherSharedGardens = isSharedGarden
    ? sharedGardens.filter((g) => g.id !== sharedGardenId)
    : sharedGardens;
  const SWITCHER_ROW_H = 48;   // compact garden row + gap
  const SWITCHER_SHARED_ACTIONS_H = 90; // two compact create-style action buttons
  const SWITCHER_INVITE_ROW_H = 34; // compact inline invite row
  const SWITCHER_INVITE_LIST_H = 20 + (currentGardenInvitees.length > 0 ? currentGardenInvitees.length * SWITCHER_INVITE_ROW_H : 24);
  const SWITCHER_INVITE_H = 46; // compact invite card + gap
  const SWITCHER_CREATE_H = 46; // compact create/action button + margin
  const SWITCHER_HINT_H = 28;   // "no gardens" hint text
  const SWITCHER_VPAD = 10;     // panel paddingTop + bottom content padding
  // Calculate the number of rows/buttons actually rendered
  let switcherRows = 0;
  if (isSharedGarden) switcherRows += 1; // Personal
  switcherRows += otherSharedGardens.length; // Other gardens
  if (isSharedGarden) switcherRows += 1; // Settings
  switcherRows += 1; // New Garden
  // Add invite cards if present
  const inviteRows = sharedGardenInvites.length;
  // Add extra invite list if shown
  const inviteListHeight = showCurrentGardenInviteList ? SWITCHER_INVITE_LIST_H : 0;
  // If not shared garden and no other gardens, show hint row
  const hintRows = (!isSharedGarden && otherSharedGardens.length === 0) ? 1 : 0;
  const switcherTargetHeight = Math.min(
    SWITCHER_VPAD +
      switcherRows * SWITCHER_ROW_H +
      inviteRows * SWITCHER_INVITE_H +
      inviteListHeight +
      hintRows * SWITCHER_HINT_H,
    370
  );
  const switcherPanelHeight = switcherOpenAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, switcherTargetHeight],
  });
  const switcherPanelOpacity = switcherOpenAnim.interpolate({
    inputRange: [0, 0.55, 1],
    outputRange: [0, 0.8, 1],
  });
  const switcherPanelTranslateY = switcherOpenAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-6, 0],
  });

  const showGardenTutorialCard = onboardingStep === 'garden_tutorial';
  const tutorialComplete = GARDEN_TUTORIAL_TASKS.every((item) => !!onboardingActions?.[item.key]);
  const nextTutorialTask = GARDEN_TUTORIAL_TASKS.find((item) => !onboardingActions?.[item.key]);
  const tutorialStepNumber = nextTutorialTask
    ? GARDEN_TUTORIAL_TASKS.findIndex((item) => item.key === nextTutorialTask.key) + 1
    : GARDEN_TUTORIAL_TASKS.length;
  const educationActive = Boolean(educationPanelMode);
  const showingEducationPreview = educationActive
    || (
      onboardingStep === 'garden_tutorial'
      && onboardingActions?.exitedEditMode
      && onboardingActions?.movedGoal
      && !onboardingActions?.viewedGrowthEducation
    )
    || (
      onboardingStep === 'garden_tutorial'
      && onboardingActions?.completedGoal
      && !onboardingActions?.viewedHealthEducation
    );
  const effectiveEducationMode = educationPanelMode
    || (
      onboardingStep === 'garden_tutorial'
      && onboardingActions?.exitedEditMode
      && onboardingActions?.movedGoal
      && !onboardingActions?.viewedGrowthEducation
      ? 'growth'
      : onboardingStep === 'garden_tutorial'
        && onboardingActions?.completedGoal
        && !onboardingActions?.viewedHealthEducation
        ? 'health'
        : null
    );
  const educationTotalFrames = effectiveEducationMode === "growth" ? 4 : effectiveEducationMode === "health" ? 3 : 0;
  const educationOnLastFrame = showingEducationPreview && educationDemoFrame >= educationTotalFrames - 1;
  const educationLabels = effectiveEducationMode === "growth" ? GROWTH_EDUCATION_LABELS : HEALTH_EDUCATION_LABELS;
  const educationHints = effectiveEducationMode === "growth" ? GROWTH_EDUCATION_HINTS : HEALTH_EDUCATION_HINTS;
  const educationBubbleLabel = educationLabels[educationDemoFrame] || educationLabels[0];
  const educationBubbleHint = educationHints[educationDemoFrame] || educationHints[0];
  const tutorialBubbleText = showCustomization && nextTutorialTask?.key === 'openedGardenSwitcher'
    ? 'Tap Done, then the garden switcher.'
    : !nextTutorialTask
    ? 'Almost done!'
    : nextTutorialTask.key === 'movedGoal'
      ? 'Drag your goal onto a shelf.'
      : nextTutorialTask.key === 'exitedEditMode'
        ? 'Tap anywhere to finish placing.'
      : nextTutorialTask.key === 'completedGoal'
        ? 'Drag water onto your plant.'
      : nextTutorialTask.key === 'reenteredEditMode'
        ? (isEditing ? 'Edit mode is on.' : 'Long-press to edit again.')
      : nextTutorialTask.key === 'addedPage'
        ? (isEditing ? 'Tap + to add a page.' : 'Long-press, then tap +.')
        : nextTutorialTask.key === 'customizedGarden'
          ? (isEditing ? 'Tap the palette.' : 'Long-press, then palette.')
          : 'Tap the garden switcher.';
  const tutorialTaskTitle = !nextTutorialTask
    ? 'All set'
    : nextTutorialTask.key === 'movedGoal'
      ? 'Place your goal'
      : nextTutorialTask.key === 'exitedEditMode'
        ? 'Finish placing'
      : nextTutorialTask.key === 'completedGoal'
        ? 'Water your plant'
      : nextTutorialTask.key === 'reenteredEditMode'
        ? 'Edit your garden'
      : nextTutorialTask.key === 'addedPage'
        ? 'Add a page'
      : nextTutorialTask.key === 'customizedGarden'
        ? 'Customize'
        : 'Garden switcher';

  const tutorialRightEnabled = showingEducationPreview || tutorialComplete;
  const tutorialRightLabel = showingEducationPreview
    ? (educationOnLastFrame
      ? "Got it"
      : `Next ${educationDemoFrame + 1}/${educationTotalFrames}`)
    : (tutorialComplete ? "Next" : "Finish tasks first");

  const mascotBubbleTransforms = {
    transform: [
      { scale: bubbleScale },
      {
        translateX: Animated.add(
          bubbleTranslate.x,
          bubbleSway.interpolate({
            inputRange: [-1, 0, 1],
            outputRange: [-4, 0, 4],
          })
        ),
      },
      { translateY: bubbleTranslate.y },
      {
        rotate: bubbleSway.interpolate({
          inputRange: [-1, 0, 1],
          outputRange: ['-2deg', '0deg', '2deg'],
        }),
      },
    ],
  };

  const mascotBubbleContent = showingEducationPreview ? (
    <>
      <Text style={styles.educationModeLabel}>
        {effectiveEducationMode === "growth" ? "GROWTH PREVIEW" : "HEALTH PREVIEW"}
      </Text>
      <Text style={styles.mascotBubbleTitle}>{educationBubbleLabel}</Text>
      <Text style={styles.mascotBubbleText}>{educationBubbleHint}</Text>
      <View style={styles.educationProgressRow}>
        {Array.from({ length: educationTotalFrames }).map((_, index) => (
          <View
            key={`education-progress-${index}`}
            style={[
              styles.educationProgressDot,
              index <= educationDemoFrame && styles.educationProgressDotActive,
            ]}
          />
        ))}
      </View>
    </>
  ) : (
    <>
      <Text style={styles.tutorialStepLabel}>
        {`STEP ${tutorialStepNumber} OF ${GARDEN_TUTORIAL_TASKS.length}`}
      </Text>
      <Text style={styles.mascotBubbleTitle}>{tutorialTaskTitle}</Text>
      {nextTutorialTask?.key === 'addedPage' && isEditing ? (
        <Text style={styles.mascotBubbleText}>
          {'Tap  '}
          <Image source={require('../assets/Icons/addPageBlack.png')} style={{ width: 13, height: 13 }} />
          {'  to add a page.'}
        </Text>
      ) : (
        <Text style={styles.mascotBubbleText}>{tutorialBubbleText}</Text>
      )}
    </>
  );

  return (
  <View style={styles.container}>
    {showGardenTutorialCard && (
      <View pointerEvents="box-none" style={[styles.mascotGuideWrap, { right: 18, bottom: insets.bottom + 138 }]}> 
        <Animated.View
          style={[
            styles.mascotBubble,
            showingEducationPreview && styles.mascotBubbleEducation,
            mascotBubbleTransforms,
          ]}
        >
          {educationActive ? (
            <HapticPressable
              onPress={handleEducationNext}
              accessibilityRole="button"
              accessibilityLabel={educationOnLastFrame ? "Finish preview" : "Next preview step"}
              style={styles.mascotBubbleTapArea}
            >
              {mascotBubbleContent}
            </HapticPressable>
          ) : (
            mascotBubbleContent
          )}
        </Animated.View>
        <Image source={GARDEN_MASCOT} style={styles.mascotImage} resizeMode="contain" />
      </View>
    )}
    {showGardenTutorialCard && (
      <View style={[styles.tutorialNextWrap, { left: 24, bottom: insets.bottom + 10 }]}>
        <View style={styles.tutorialNextButtonWrap}>
          <View style={styles.tutorialNextButtonShell}>
            <View pointerEvents="none" style={[styles.tutorialNextButtonShadow, styles.tutorialSkipButtonShadowColor]} />
            <HapticPressable
              onPress={() => {
                if (nextTutorialTask?.key) {
                  onOnboardingAction?.(nextTutorialTask.key);
                }
              }}
              disabled={!nextTutorialTask || showingEducationPreview}
              style={({ pressed }) => [
                styles.tutorialNextButtonFace,
                styles.tutorialSkipButtonFaceColor,
                (!nextTutorialTask || showingEducationPreview) && styles.tutorialSkipButtonFaceDisabled,
                pressed && !!nextTutorialTask && !showingEducationPreview && styles.tutorialNextButtonPressed,
              ]}
            >
              <Text style={[styles.tutorialSkipBtnText, (!nextTutorialTask || showingEducationPreview) && styles.tutorialSkipBtnTextDisabled]}>Skip</Text>
            </HapticPressable>
          </View>
        </View>
      </View>
    )}
    {showGardenTutorialCard && (
      <View style={[styles.tutorialNextWrap, { right: 24, bottom: insets.bottom + 10 }]}> 
        <View style={styles.tutorialNextButtonWrap}>
          <View style={styles.tutorialNextButtonShell}>
            {educationActive ? (
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.tutorialNextRipple,
                  {
                    opacity: tutorialNextRippleOpacity,
                    transform: [{ scale: tutorialNextRippleScale }],
                  },
                ]}
              />
            ) : null}
            <View pointerEvents="none" style={[styles.tutorialNextButtonShadow, styles.tutorialNextButtonShadowColor]} />
            <HapticPressable
              onPress={showingEducationPreview ? handleEducationNext : (tutorialComplete ? onGardenTutorialNext : undefined)}
              disabled={!tutorialRightEnabled}
              style={({ pressed }) => [
                styles.tutorialNextButtonFace,
                styles.tutorialNextButtonFaceColor,
                pressed && tutorialRightEnabled && styles.tutorialNextButtonPressed,
                !tutorialRightEnabled && styles.tutorialNextButtonFaceDisabled,
              ]}
            >
              <Text style={[styles.tutorialNextBtnText, !tutorialRightEnabled && styles.tutorialNextBtnTextDisabled]}>{tutorialRightLabel}</Text>
            </HapticPressable>
          </View>
        </View>
      </View>
    )}

    {isReadOnly && !isSharedGarden && (
      <View style={styles.readOnlyHeader}>
        <HapticTouchableOpacity style={styles.readOnlyBackBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={20} color="#fff" />
        </HapticTouchableOpacity>
        <Text style={styles.readOnlyHeaderTitle} numberOfLines={1}>{viewedUsername}'s Garden</Text>
      </View>
    )}

    {!isReadOnly && !isEditing && (
      <>
        {showSharedGardensModal && (
          <HapticPressable style={styles.gardenSwitcherDismissZone} onPress={() => setShowSharedGardensModal(false)} />
        )}

        <View
          ref={gardenSwitcherRef}
          style={[styles.gardenSwitcherShell, showSharedGardensModal && styles.gardenSwitcherShellExpanded]}
          onLayout={measureTutorialHotspot}
        >
          <HapticTouchableOpacity
            style={[styles.gardenSwitcherButton, showSharedGardensModal && styles.gardenSwitcherButtonExpanded]}
            onPress={() => setShowSharedGardensModal((prev) => !prev)}
            activeOpacity={0.9}
          >
            <Text style={styles.gardenSwitcherText} numberOfLines={1}>{isSharedGarden ? (viewedUsername || 'Garden') : 'Personal'}</Text>
            <Ionicons name={showSharedGardensModal ? "chevron-up" : "chevron-down"} size={14} color="#fff" />
          </HapticTouchableOpacity>

          <Animated.View
            pointerEvents={showSharedGardensModal ? 'auto' : 'none'}
            style={[
              styles.gardenSwitcherPanel,
              {
                height: switcherPanelHeight,
                opacity: switcherPanelOpacity,
                transform: [{ translateY: switcherPanelTranslateY }],
              },
            ]}
          >
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.gardenBinContent, { flexGrow: 0 }]}> 
                {isSharedGarden && (
                  <View style={styles.gardenBinGroup}>
                    <HapticTouchableOpacity style={[styles.gardenBinRow, styles.gardenBinRowCurrent]} onPress={openPersonalGarden} activeOpacity={0.9}>
                      <Text style={styles.gardenBinRowLabel} numberOfLines={1}>Personal</Text>
                    </HapticTouchableOpacity>
                  </View>
                )}
                {otherSharedGardens.length ? (
                  otherSharedGardens.map((garden) => (
                    <View key={garden.id} style={styles.gardenBinGroup}>
                      <HapticTouchableOpacity style={styles.gardenBinRow} onPress={() => openSharedGarden(garden)} activeOpacity={0.9}>
                        <Text style={styles.gardenBinRowLabel} numberOfLines={1}>{garden.name || 'Other'}</Text>
                      </HapticTouchableOpacity>
                    </View>
                  ))
                ) : !isSharedGarden ? (
                  <Text style={styles.gardenBinHintText}>No other gardens yet.</Text>
                ) : null}

                {sharedGardenInvites.length ? (
                  sharedGardenInvites.map((invite) => (
                    <View key={invite.id} style={styles.gardenBinInviteCard}>
                      <Text style={styles.gardenBinRowLabel} numberOfLines={1}>{invite.gardenName || 'Other'}</Text>
                      <HapticTouchableOpacity
                        style={styles.gardenBinAcceptButton}
                        onPress={() => handleAcceptSharedGardenInvite(invite)}
                        disabled={acceptingInviteId === invite.id}
                      >
                        <Text style={styles.gardenBinAcceptButtonText}>{acceptingInviteId === invite.id ? '...' : 'Join'}</Text>
                      </HapticTouchableOpacity>
                    </View>
                  ))
                ) : null}

                {isSharedGarden && (
                  <View style={styles.gardenBinGroup}>
                    <HapticTouchableOpacity
                      style={[styles.gardenBinCreateButton, { backgroundColor: '#637fa6' }]}
                      onPress={() => {
                        setShowSharedGardensModal(false);
                        navigation.navigate('SharedGardenSettings', {
                          sharedGardenId,
                          gardenName: viewedUsername,
                        });
                      }}
                      activeOpacity={0.9}
                    >
                      <Text style={styles.gardenBinCreateText}>Settings</Text>
                    </HapticTouchableOpacity>
                  </View>
                )}

                <HapticTouchableOpacity style={styles.gardenBinCreateButton} onPress={handleCreateSharedGarden} disabled={creatingSharedGarden}>
                  <Text style={styles.gardenBinCreateText}>{creatingSharedGarden ? 'Creating...' : 'New Garden'}</Text>
                </HapticTouchableOpacity>
              </ScrollView>
          </Animated.View>
        </View>

        <Modal visible={showCreateSharedGardenModal} transparent animationType="fade" onRequestClose={closeCreateSharedGardenModal}>
          <View style={styles.createGardenModalOverlay}>
            <View style={styles.createGardenModalCard}>
              <Text style={styles.createGardenModalTitle}>New Garden</Text>
              <Text style={styles.createGardenModalHint}>Enter a name for your shared garden.</Text>
              <TextInput
                value={newSharedGardenName}
                onChangeText={setNewSharedGardenName}
                placeholder="Garden name"
                placeholderTextColor="#9CA3AF"
                style={styles.createGardenModalInput}
                autoCapitalize="words"
                returnKeyType="done"
                onSubmitEditing={handleConfirmCreateSharedGarden}
              />
              <View style={styles.createGardenModalActions}>
                <HapticTouchableOpacity style={[styles.createGardenModalButton, styles.createGardenModalButtonSecondary]} onPress={closeCreateSharedGardenModal}>
                  <Text style={styles.createGardenModalButtonText}>Cancel</Text>
                </HapticTouchableOpacity>
                <HapticTouchableOpacity style={[styles.createGardenModalButton, styles.createGardenModalButtonPrimary, { backgroundColor: theme.accent }]} onPress={handleConfirmCreateSharedGarden}>
                  <Text style={[styles.createGardenModalButtonText, styles.createGardenModalButtonTextPrimary]}>Create</Text>
                </HapticTouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </>
    )}

    {/* Customization FAB only in edit mode, but modal is always rendered if showCustomization is true */}
    {!isReadOnly && isEditing && canCustomize && (
      <HapticTouchableOpacity ref={customizeFabRef} style={styles.customizeFab} onPress={() => handleCustomization('wall')}>
        <Ionicons name="color-palette" size={19} color="#fff" />
      </HapticTouchableOpacity>
    )}
    {showCustomization && (
      <CustomizationScreen
        visible={showCustomization}
        onClose={() => setShowCustomization(false)}
        onSave={async (pageId, values) => {
          if (isSharedGarden && !canCustomize) return;
          pendingCustomizationSaveRef.current = { pageId, values };
          setCustomizations((prev) => ({ ...prev, [pageId]: values }));
          try {
            if (isSharedGarden && sharedGardenId) {
              await saveSharedCustomizations(sharedGardenId, pageId, values);
            } else if (!isSharedGarden && auth.currentUser?.uid) {
              await savePersonalCustomizations(auth.currentUser.uid, pageId, values);
            }
          } catch (error) {
            console.error("Failed to save garden customization", error);
            Alert.alert(
              "Could not save",
              error?.code === "permission-denied"
                ? "You do not have permission to customize this shared garden."
                : "Your customization could not be saved. Try again."
            );
            throw error;
          } finally {
            pendingCustomizationSaveRef.current = null;
          }
        }}
        selectedPageId={currentPageId}
        customizations={customizations}
        customizerType={customizerType}
        customizerTypeSetter={setCustomizerType}
        enforceOwnedSelection={!isSharedGarden}
        canSave={canCustomize && sharedGardenSettingsLoaded}
      />
    )}
    {!isReadOnly && isEditing && !canCustomize && (
      <HapticTouchableOpacity ref={customizeFabRef} style={styles.customizeFab} onPress={() => Alert.alert("Restricted", "Only the owner can customize this garden.") }>
        <Ionicons name="color-palette" size={19} color="#fff" />
      </HapticTouchableOpacity>
    )}

    {!isReadOnly && isEditing && canCustomize && (
      <HapticTouchableOpacity style={styles.removePageFab} onPress={handleRemoveCurrentPage}>
        <Ionicons name="trash" size={17} color="#fff" />
      </HapticTouchableOpacity>
    )}

    {!isReadOnly && isEditing && canEditPlants && (
      <HapticTouchableOpacity style={styles.resetFab} onPress={handleResetPositions}>
        <Ionicons name="refresh" size={18} color="#fff" />
      </HapticTouchableOpacity>
    )}

    {!isReadOnly && isEditing && canCustomize && (
      <HapticTouchableOpacity ref={addPageFabRef} style={styles.addPageSideFab} onPress={handleAddPage}>
        <Image source={require('../assets/Icons/addPage.png')} style={{ width: 20, height: 20 }} resizeMode="contain" />
      </HapticTouchableOpacity>
    )}

    <Animated.FlatList
      ref={flatListRef}
      data={pages}
      keyExtractor={(item) => item.id}
      horizontal
      pagingEnabled
      showsHorizontalScrollIndicator={false}
      bounces={false}
      alwaysBounceHorizontal={false}
      overScrollMode="never"
      onScroll={Animated.event(
        [{ nativeEvent: { contentOffset: { x: pageScrollX } } }],
        {
          useNativeDriver: false,
          listener: (e) => {
            const offsetX = e.nativeEvent.contentOffset.x;
            const nextShow = offsetX > width * 0.9;
            if (nextShow !== drawerShouldShowRef.current) {
              drawerShouldShowRef.current = nextShow;
              setDrawerShouldShow(nextShow);
            }
          },
        }
      )}
      scrollEventThrottle={16}
      onMomentumScrollEnd={onPageScrollEnd}
      scrollEnabled={!globalDragging && !showCustomization}
      getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
      initialScrollIndex={pageIndex >= 0 ? pageIndex : 0}
      renderItem={({ item }) => (
        <View style={{ width, flex: 1 }}>
          {renderGardenPage(item)}
        </View>
      )}
      style={[styles.pageList, { width, height }]}
    />

    <View style={styles.pageDotsContainer}>
      {dots}
    </View>

      <View
        ref={drawerRef}
        pointerEvents={drawerShouldShow ? 'auto' : 'none'}
        style={[
          styles.drawer,
          { top: drawerTop },
          !isReadOnly && isEditing && styles.drawerEditBox,
          !drawerShouldShow && styles.drawerHidden,
        ]}
        collapsable={false}
        onLayout={measureTutorialHotspot}
      >
        <View style={styles.drawerTopBandPrimary} />
        <View style={styles.drawerTopBandSecondary} />
        <ScrollView
          ref={drawerScrollRef}
          horizontal
          directionalLockEnabled
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          bounces={false}
          alwaysBounceVertical={false}
          contentContainerStyle={[styles.drawerList, { flexDirection: 'row', alignItems: 'center' }]}
          scrollEnabled={!globalDragging}
          scrollEventThrottle={16}
          onScroll={(e) => {
            const x = e.nativeEvent.contentOffset.x;
            setDrawerScrollOffset(x);
            if (shouldPersistState) persistedGardenState.drawerScrollOffset = x;
          }}
        >
          {drawerPlants.map((plant, index) => (
            <View
              key={plant.id}
              ref={index === 0 ? drawerFirstPlantRef : undefined}
              collapsable={false}
              style={styles.drawerPlantItem}
              onLayout={index === 0 ? measureTutorialHotspot : undefined}
            >
              <DraggablePlant 
                plant={plant} isEditing={isEditing} disabled={isReadOnly} wiggleAnim={wiggleAnim} 
                onCompletionTargetRef={setCompletionTargetRef}
                onLongPress={activateEditMode} globalPan={globalPan} globalDragRef={globalDragRef} 
                onPlantTap={handlePlantTap}
                instantDrag={true}
                onDragStart={handleDragStart} onDragEnd={handleDragEnd}
              />
            </View>
          ))}
        </ScrollView>
      </View>

      {!isReadOnly && drawerShouldShow && !showCustomization && (
        <>
          {/* Water drop button (left) */}
          <Animated.View
            ref={waterDropRef}
            {...waterPanResponder.panHandlers}
            style={[
              styles.waterDropHandle,
              styles.waterDropHandleWater,
              {
                transform: waterPan.getTranslateTransform(),
                left: 32,
                right: undefined,
                bottom: insets.bottom + 85,
              },
            ]}
            onLayout={measureTutorialHotspot}
          >
            <Animated.View style={{ opacity: waterDropOpacity, width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="water" size={22} color="#fff" />
            </Animated.View>
          </Animated.View>

          {/* Plus button (right) */}
          <HapticTouchableOpacity
            style={[styles.waterDropHandle, styles.waterDropHandleAddGoal, { right: 32, left: undefined, bottom: insets.bottom + 85 }]}
            activeOpacity={0.8}
            onPress={() => tryNavigateToAddGoal({ navigation, isPro, goals, openDefaultPaywall })}
          >
            <Ionicons name="add" size={22} color="#fff" />
          </HapticTouchableOpacity>
        </>
      )}

      {splashPos && (
        <>
          <Animated.View
            pointerEvents="none"
            style={[
              styles.splashBurst,
              {
                left: splashPos.x - 38,
                top: splashPos.y - 38,
                transform: [{ scale: splashScale }],
                opacity: splashOpacity,
              },
            ]}
          />
          <Animated.View
            pointerEvents="none"
            style={[
              styles.splashBurst,
              styles.splashBurst2,
              {
                left: splashPos.x - 38,
                top: splashPos.y - 38,
                transform: [{ scale: splashScale2 }],
                opacity: splashOpacity2,
              },
            ]}
          />
        </>
      )}

      {draggedGhost && (
        <Animated.View style={[
          styles.ghost,
          {
            left: draggedGhost.x,
            top: draggedGhost.y,
            width: PLANT_GHOST_SIZE,
            height: PLANT_GHOST_SIZE,
          },
        ]}>
          <Animated.View style={{ transform: globalPan.getTranslateTransform() }}>
            <PlantVisual plant={draggedGhost.plant} isDraggingHighlight={true} />
          </Animated.View>
        </Animated.View>
      )}
    {showGardenTutorialCard && tutorialHotspot && !showCustomization && !showingEducationPreview && (
      <GardenTutorialHotspot
        left={tutorialHotspot.left}
        top={tutorialHotspot.top}
        label={tutorialHotspot.label}
        taskKey={tutorialHotspot.taskKey}
        actionType={getGardenTutorialActionType(tutorialHotspot.taskKey, isEditing)}
      />
    )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fdfbf700' },
  mascotGuideWrap: {
    position: 'absolute',
    zIndex: 70,
    alignItems: 'flex-end',
    paddingBottom: 70,
  },
  mascotBubbleTapArea: {
    alignSelf: 'stretch',
  },
  mascotBubble: {
    backgroundColor: 'rgba(255,255,255,0.97)',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    maxWidth: 240,
    ...cardShadow,
    marginBottom: 0,
    marginRight: 45,
  },
  mascotBubbleEducation: {
    borderWidth: 2,
    borderColor: '#9be35d',
    backgroundColor: 'rgba(248, 255, 242, 0.98)',
  },
  educationModeLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#58a700',
    letterSpacing: 0.6,
    fontFamily: 'CeraRoundProDEMO-Black',
  },
  tutorialStepLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#8a9aaa',
    letterSpacing: 0.6,
    fontFamily: 'CeraRoundProDEMO-Black',
  },
  educationProgressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  educationProgressDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#d8e6d0',
  },
  educationProgressDotActive: {
    backgroundColor: '#58cc02',
  },
  mascotBubbleTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#1f2e3d',
    fontFamily: 'CeraRoundProDEMO-Black',
  },
  mascotBubbleText: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '700',
    color: '#6f8296',
    lineHeight: 18,
    fontFamily: 'CeraRoundProDEMO-Black',
  },
  mascotImage: {
    width: 142,
    height: 142,
    left: 40,
    opacity: 0,
  },
  tutorialHotspotWrap: {
    position: 'absolute',
    alignItems: 'center',
    zIndex: 14000,
    elevation: 14000,
  },
  tutorialHotspotRing: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2.5,
    borderStyle: 'dashed',
    borderColor: '#ffffff',
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    ...cpShadow({ color: '#000000', offset: { width: 0, height: 2 }, opacity: 0.18, radius: 3, elevation: 4 }),
  },
  tutorialHotspotDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#ffffff',
  },
  tutorialHotspotRipple: {
    position: 'absolute',
    top: 0,
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: '#ffffff',
    backgroundColor: 'transparent',
  },
  tutorialHotspotLabel: {
    marginTop: 4,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignSelf: 'center',
    minWidth: 76,
    alignItems: 'center',
  },
  tutorialHotspotLabelText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '800',
    textAlign: 'center',
    fontFamily: 'CeraRoundProDEMO-Black',
  },
  tutorialNextWrap: {
    position: 'absolute',
    zIndex: 13050,
    elevation: 30,
    overflow: 'visible',
  },
  tutorialNextButtonWrap: {
    overflow: 'visible',
  },
  tutorialNextButtonShell: {
    height: 56,
    position: 'relative',
    minWidth: 140,
  },
  tutorialNextRipple: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 52,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#ffffff',
    backgroundColor: 'transparent',
  },
  tutorialNextButtonFace: {
    height: 52,
    minWidth: 140,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    zIndex: 1,
  },
  tutorialNextButtonShadow: {
    position: 'absolute',
    top: 4,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 20,
  },
  tutorialNextButtonShadowColor: {
    backgroundColor: '#4aa93a',
  },
  tutorialSkipButtonShadowColor: {
    backgroundColor: '#bebebe',
  },
  tutorialNextButtonFaceColor: {
    backgroundColor: '#59d700',
  },
  tutorialSkipButtonFaceColor: {
    backgroundColor: '#ffffff',
  },
  tutorialSkipButtonFaceDisabled: {
    backgroundColor: '#f0f0f0',
  },
  tutorialNextButtonFaceDisabled: {
    backgroundColor: '#97cd71',
  },
  tutorialNextButtonPressed: {
    transform: [{ translateY: 4 }],
  },
  tutorialNextBtnText: {
    fontSize: 15,
    fontFamily: 'CeraRoundProDEMO-Black',
    color: '#FFFFFF',
    fontWeight: '900',
    letterSpacing: 0.1,
  },
  tutorialNextBtnTextDisabled: {
    color: '#f7fbf3',
  },
  tutorialSkipBtnText: {
    fontSize: 15,
    fontFamily: 'CeraRoundProDEMO-Black',
    color: '#3d3d3d',
    fontWeight: '900',
    letterSpacing: 0.1,
  },
  tutorialSkipBtnTextDisabled: {
    color: '#b0b0b0',
  },
  readOnlyHeader: {
    position: 'absolute',
    top: 48,
    left: 14,
    right: 14,
    zIndex: 40,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(20, 25, 45, 0.82)',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  readOnlyBackBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    marginRight: 10,
  },
  readOnlyHeaderTitle: {
    flex: 1,
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
    fontFamily: 'CeraRoundProDEMO-Black',
    letterSpacing: 0.1,
  },
  sharedGardenBackBtn: {
    position: 'absolute',
    top: 50,
    left: 16,
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(20, 25, 45, 0.82)',
    zIndex: 40,
  },
  loader: { flex: 1, justifyContent: "center", alignItems: "center" },
  pageNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  pageNavBtn: { padding: 4 },
  customizeFab: { 
    position: 'absolute', 
    top: 50, 
    right: 20, 
    width: 42, 
    height: 42, 
    borderRadius: 24, 
    backgroundColor: '#567287', 
    justifyContent: 'center', 
    alignItems: 'center', 
    zIndex: 30, 
    elevation: 8,
    ...cpShadow({ color: '#000', offset: { width: 0, height: 4 }, opacity: 0.3, radius: 6, elevation: 6 }),
  },
  addPageSideFab: {
    position: 'absolute',
    top: '50%',
    right: 16,
    marginTop: -21,
    width: 42,
    height: 42,
    borderRadius: 24,
    backgroundColor: '#3d6366',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 30,
    elevation: 8,
    ...cpShadow({ color: '#000', offset: { width: 0, height: 4 }, opacity: 0.3, radius: 6, elevation: 6 }),
  },
  sharedGardensFab: {
    position: 'absolute',
    top: 50,
    left: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#5C48D3',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 30,
    elevation: 8,
    ...cpShadow({ color: '#000', offset: { width: 0, height: 4 }, opacity: 0.3, radius: 6, elevation: 6 }),
  },
  gardenSwitcherShell: {
    position: 'absolute',
    top: 55,
    right: 16,
    width: 156,
    maxWidth: '52%',
    borderRadius: 23,
    backgroundColor: 'rgba(66, 66, 66, 0.96)',
    zIndex: 60,
    overflow: 'hidden',
    borderWidth: 0,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  gardenSwitcherShellExpanded: {
    width: 156,
    maxWidth: '52%',
    maxHeight: '66%',
    borderRadius: 23,
  },
  gardenSwitcherButton: {
    width: '100%',
    height: 38,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 23, // Consistent corner roundness
  },
  gardenSwitcherButtonExpanded: {
  },
  gardenSwitcherText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 14,
    marginRight: 6,
    fontFamily: 'CeraRoundProDEMO-Black',
    letterSpacing: 0.1,
  },
  gardenSwitcherDismissZone: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 55,
  },
  gardenSwitcherPanel: {
    backgroundColor: 'transparent',
    paddingTop: 2,
    overflow: 'hidden',
  },
  gardenBinContent: {
    paddingHorizontal: 7,
    paddingBottom: 0,
    gap: 6,
  },
  gardenBinGroup: {
    gap: 4,
  },
  gardenBinRow: {
    minHeight: 40,
    borderRadius: 20,
    backgroundColor: '#666666',
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 10,
  },
  gardenBinRowCurrent: {
  },
  gardenBinRowLabel: {
    fontSize: 15,
    color: '#fff',
    fontWeight: '700',
    marginRight: 0,
    marginLeft: 0,
    textAlignVertical: 'center',
    includeFontPadding: false,
    fontFamily: 'CeraRoundProDEMO-Black',
    letterSpacing: 0.1,
  },
  gardenBinRowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  gardenBinActionInvite: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#8F4ED8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gardenBinActionLeave: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#CF3636',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gardenBinInviteList: {
    backgroundColor: '#565656',
    borderRadius: 12,
    padding: 8,
    gap: 6,
  },
  gardenBinInviteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 10,
    backgroundColor: '#6f6f6f',
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  gardenBinInviteName: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12,
    marginRight: 10,
    flex: 1,
  },
  gardenBinInviteButton: {
    borderRadius: 8,
    backgroundColor: '#8F4ED8',
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  gardenBinInviteButtonText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 11,
  },
  gardenBinHintText: {
    color: '#E7E7E7',
    fontWeight: '700',
    fontSize: 12,
    paddingHorizontal: 6,
  },
  gardenBinInviteCard: {
    minHeight: 40,
    borderRadius: 20,
    backgroundColor: '#666666',
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  gardenBinAcceptButton: {
    backgroundColor: '#8F4ED8',
    borderRadius: 9,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  gardenBinAcceptButtonText: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 11,
  },
  gardenBinCreateButton: {
    marginTop: 3,
    minHeight: 40,
    borderRadius: 20,
    backgroundColor: '#B8B8B8',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignSelf: 'stretch',
    gap: 10,
  },
  gardenBinAddPeopleButton: {
    backgroundColor: '#8F4ED8',
  },
  gardenBinLeaveButton: {
    backgroundColor: '#CF3636',
  },
  gardenBinCreateText: {
    color: '#f1f1f1',
    fontWeight: '700',
    fontSize: 15,
    textAlignVertical: 'center',
    includeFontPadding: false,
    fontFamily: 'CeraRoundProDEMO-Black',
    letterSpacing: 0.1,
  },
  resetFab: { 
    position: 'absolute', 
    top: 50, 
    right: 75, 
    width: 42, 
    height: 42, 
    borderRadius: 24, 
    backgroundColor: '#B22222', 
    justifyContent: 'center', 
    alignItems: 'center', 
    zIndex: 30, 
    elevation: 8,
    ...cpShadow({ color: '#000', offset: { width: 0, height: 4 }, opacity: 0.3, radius: 6, elevation: 6 }),
  },
  removePageFab: {
    position: 'absolute',
    top: 50,
    right: 130,
    width: 42,
    height: 42,
    borderRadius: 24,
    backgroundColor: '#4C4C4C',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 30,
    elevation: 8,
    ...cpShadow({ color: '#000', offset: { width: 0, height: 4 }, opacity: 0.3, radius: 6, elevation: 6 }),
  },
  sharedModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  sharedModalDismissZone: {
    flex: 1,
  },
  sharedModalCard: {
    maxHeight: '82%',
    backgroundColor: '#F7F7FB',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 14,
    paddingBottom: 18,
  },
  sharedModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingBottom: 12,
  },
  sharedModalTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#2B2550',
  },
  sharedModalCloseBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#2B2550',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sharedModalContent: {
    paddingHorizontal: 18,
    paddingBottom: 20,
    gap: 14,
  },
  sharedSectionCard: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#ECECF4',
  },
  sharedSectionTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#2D5A27',
    marginBottom: 10,
  },
  sharedGardenInput: {
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D9D9E4',
    backgroundColor: '#FAFAFD',
    paddingHorizontal: 14,
    color: '#232323',
    fontWeight: '700',
  },
  sharedPrimaryButton: {
    marginTop: 10,
    backgroundColor: '#2D5A27',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  sharedPrimaryButtonText: {
    color: '#fff',
    fontWeight: '900',
  },
  createGardenModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.42)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  createGardenModalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 22,
    ...cpShadow({ color: '#000', offset: { width: 0, height: 12 }, opacity: 0.12, radius: 16, elevation: 10 }),
  },
  createGardenModalTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#111827',
    marginBottom: 8,
  },
  createGardenModalHint: {
    color: '#6B7280',
    marginBottom: 14,
    fontSize: 13,
  },
  createGardenModalInput: {
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#F9FAFB',
    paddingHorizontal: 16,
    color: '#111827',
    fontWeight: '700',
  },
  createGardenModalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 18,
  },
  createGardenModalButton: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
  },
  createGardenModalButtonSecondary: {
    backgroundColor: '#E5E7EB',
  },
  createGardenModalButtonPrimary: {
    backgroundColor: '#2D5A27',
  },
  createGardenModalButtonText: {
    color: '#111827',
    fontWeight: '900',
  },
  createGardenModalButtonTextPrimary: {
    color: '#fff',
  },
  sharedGardenRowCard: {
    borderRadius: 14,
    backgroundColor: '#F8F8FC',
    padding: 12,
    marginBottom: 10,
  },
  sharedGardenRowTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sharedGardenMeta: {
    flex: 1,
    paddingRight: 10,
  },
  sharedGardenName: {
    fontSize: 15,
    fontWeight: '900',
    color: '#2A2A2A',
  },
  sharedGardenDetail: {
    marginTop: 3,
    color: '#76768A',
    fontWeight: '700',
    fontSize: 12,
  },
  sharedGardenActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sharedSecondaryButton: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: '#EAEAF8',
    marginRight: 8,
  },
  sharedSecondaryButtonText: {
    color: '#463C92',
    fontWeight: '900',
    fontSize: 12,
  },
  sharedPrimaryMiniButton: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: '#2D5A27',
  },
  sharedPrimaryMiniButtonText: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 12,
  },
  sharedDangerMiniButton: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: '#A73737',
    marginRight: 8,
  },
  sharedDangerMiniButtonDisabled: {
    opacity: 0.6,
  },
  sharedDangerMiniButtonText: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 12,
  },
  inviteListWrap: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E6E6F0',
    paddingTop: 10,
    gap: 8,
  },
  inviteUserRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  inviteUserName: {
    flex: 1,
    color: '#2C2C2C',
    fontWeight: '800',
    marginRight: 8,
  },
  inviteUserButton: {
    backgroundColor: '#5C48D3',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  inviteUserButtonText: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 12,
  },
  sharedInviteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8F8FC',
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
  },
  sharedEmptyText: {
    color: '#78788C',
    fontWeight: '700',
    lineHeight: 20,
  },
  pageDotsContainer: { position: 'absolute', bottom:100, left: 0, right: 0, alignItems: 'center', zIndex: 999999 },
  resetBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#B22222', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, marginRight: 10 },
  addPageText: { color: '#fff', marginLeft: 6, fontWeight: '700' },
  editBtn: { backgroundColor: '#eee', paddingHorizontal: 15, paddingVertical: 6, borderRadius: 20 },
  doneBtn: { backgroundColor: '#2D5A27', paddingHorizontal: 15, paddingVertical: 6, borderRadius: 20 },
  btnText: { fontWeight: 'bold', color: '#444' },
  pageDots: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgb(103, 103, 103)', marginHorizontal: 4 },
  pageList: { flex: 1 },
  storagePage: { flex: 1, backgroundColor: '#242347' },
  storageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 10,
    paddingBottom: 6,
    paddingHorizontal: 20,
    backgroundColor: '#1a1836',
    borderBottomWidth: 0,
    borderBottomColor: '#2e2b5a',
    margin: 15,
    marginTop: 55,
    borderRadius: 40,
  },
  storageHeaderTitle: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginHorizontal: 0,
    textAlign: 'left',
    fontFamily: 'CeraRoundProDEMO-Black',
    paddingBottom: 5,
    paddingLeft: 10,
  },
  storageHeaderIcon: {
    opacity: 0.9,
  },
  storageScroll: { flex: 1 },
  storageScrollContent: { paddingTop: 20, paddingBottom: 220, gap: 18 },

  gardenMain: { flex: 1, paddingBottom: 160, paddingTop: 40, justifyContent: 'space-around' },
  shelfWrapper: { height: 132, justifyContent: 'flex-end', marginBottom: 20, marginHorizontal: -4, overflow: 'visible' },
  storageShelfWrapper: { width: '100%', alignSelf: 'center', marginTop: 0, marginBottom: 0, overflow: 'visible' },
  shelfShadow: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    width: '100%',
    height: 60,
    borderRadius: 16,
    ...cpShadow({ color: '#000', offset: { width: 10, height: 8 }, opacity: 0.20, radius: 0, elevation: 8 }),
  },
  shelfLedge: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    width: '100%',
    height: 60,
    backgroundColor: '#FA6424',
    borderRadius: 16,
    overflow: 'hidden',
  },
  shelfHighlightLeft: {
    position: 'absolute',
    top: 12,
    left: '8%',
    width: '46%',
    height: 14,
    borderRadius: 12,
    backgroundColor: '#FF9F4A',
    opacity: 0.95,
  },
  shelfHighlightRight: {
    position: 'absolute',
    top: 18,
    right: '6%',
    width: '38%',
    height: 16,
    borderRadius: 14,
    backgroundColor: '#FF9742',
    opacity: 0.9,
  },
  shelfCornerShade: {
    position: 'absolute',
    top: 6,
    right: '3%',
    width: '20%',
    height: 6,
    borderRadius: 6,
    backgroundColor: '#ff8a37',
    opacity: 0.65,
  },
  shelfBand: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 22,
  },
  shelfBandDivider: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 0,
    backgroundColor: '#A63A3A',
    zIndex: 2,
  },
  shelfBandUpper: {
    position: 'absolute',
    top: 1,
    left: 0,
    right: 0,
    height: 18,
    backgroundColor: '#a84615',
  },
  shelfBandLower: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 12,
    backgroundColor: '#611c45',
  },
  bottomShelfLedge: {
    height: 65,
    borderRadius: 0,
  },
  bottomShelfHighlightLeft: {
    top: 12,
    left: '8%',
    width: '48%',
    height: 11,
    borderRadius: 8,
    backgroundColor: '#FF9F4A',
    opacity: 0.92,
  },
  bottomShelfHighlightRight: {
    top: 18,
    right: '-1%',
    width: '39%',
    height: 18,
    borderRadius: 12,
    backgroundColor: '#FF9742',
    opacity: 0.9,
  },
  bottomShelfCornerShade: {
    top: 6,
    right: '4%',
    width: '38%',
    height: 5,
    borderRadius: 4,
    backgroundColor: '#f44d2c',
    opacity: 0.5,
  },
  bottomShelfBand: {
    height: 22,
  },
  bottomShelfBandDivider: {
    height: 1,
    backgroundColor: '#9A3438',
  },
  bottomShelfBandUpper: {
    top: 1,
    height: 16,
  },
  bottomShelfBandLower: {
    height: 11,
  },
  storageShelfLedge: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  slotsRow: { height: 85, flexDirection: "row", justifyContent: "space-around", width: '100%', zIndex: 5 },
  slot: { width: 80, height: 80, justifyContent: 'flex-end', alignItems: 'center', borderRadius: 12 },
  slotEditBox: { borderWidth: 2, borderColor: '#d1d1d1', borderStyle: 'dashed', backgroundColor: 'rgba(0,0,0,0.02)' },

  drawer: {
    position: 'absolute',
    height: 136,
    width: '100%',
    backgroundColor: '#242347',
    zIndex: 100,
    overflow: 'hidden',
  },
  drawerHidden: {
    opacity: 0,
  },
  pageDrawerUnderlay: {
    position: 'absolute',
    height: 300,
    backgroundColor: '#242347',
    zIndex: 1,
    overflow: 'hidden',
  },
  pageDrawerUnderlayTopBandPrimary: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 12,
    backgroundColor: '#111338',
  },
  pageDrawerUnderlayTopBandSecondary: {
    position: 'absolute',
    top: 12,
    left: 0,
    right: 0,
    height: 6,
    backgroundColor: '#1A1D45',
  },
  drawerTopBandPrimary: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 12,
    backgroundColor: '#111338',
  },
  drawerTopBandSecondary: {
    position: 'absolute',
    top: 12,
    left: 0,
    right: 0,
    height: 6,
    backgroundColor: '#1A1D45',
  },
  drawerEditBox: { borderWidth: 3, borderColor: '#5D5F8A', borderStyle: 'dashed' },
  drawerList: { paddingHorizontal: 0, alignItems: 'center', minWidth: '100%', flexGrow: 1, justifyContent: 'center', bottom: -0, paddingTop: 14 },
  drawerPlantItem: {
    marginHorizontal: 2,
    transform: [{ scale: 0.7 }],
    marginBottom: 60,
  },

  plantContainer: { width: 100, height: 125, alignItems: 'center', justifyContent: 'flex-end', bottom: -15 },
  plantAssemblyWrapper: { alignItems: 'center', justifyContent: 'flex-end', width: '100%', height: '10', bottom: -10 },
  plantAssembly: { alignItems: 'center', justifyContent: 'flex-end', width: '100%', flex: 1 },
  ambientParticleOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 5000,
    elevation: 5000,
  },
  plantNameLabel: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '800',
    textAlign: 'center',
    width: 90,
    marginTop: 0,
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
    letterSpacing: 0.2,
    bottom: 30,
    fontFamily: 'CeraRoundProDEMO-Black',
  },
  plantProgressWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    bottom: 28,
  },
  plantProgressTrack: {
    width: 58,
    height: 7,
    borderRadius: 99,
    backgroundColor: 'rgba(96, 109, 124, 0.45)',
    borderWidth: 0,
    borderColor: 'rgba(96, 109, 124, 0.72)',
    overflow: 'hidden',
  },
  plantProgressFill: {
    height: '100%',
    borderRadius: 99,
  },
  plantProgressFillPending: {
    backgroundColor: 'rgba(167, 152, 125, 0.72)',
  },
  plantProgressFillSelf: {
    backgroundColor: 'rgba(130, 110, 80, 0.9)',
  },
  plantProgressFillShared: {
    backgroundColor: '#00b0d7',
  },
  plantProgressFillSharedSelf: {
    backgroundColor: '#00b0d7',
  },
  plantProgressFillQuantity: {
    backgroundColor: '#00b0d7',
  },
  plantProgressFillDone: {
    backgroundColor: '#00b0d7',
  },
  sharedProgressLabel: {
    marginTop: 2,
    fontSize: 7,
    fontWeight: '900',
    color: '#e8f6ff',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
    letterSpacing: 0.2,
    fontFamily: 'CeraRoundProDEMO-Black',
  },
  trophyEffectsUnderPot: { position: 'absolute', width: 108, height: 140, bottom: 8, zIndex: 0, overflow: 'visible' },
  potBackground: { width: 80, height: 80, alignItems: 'center', justifyContent: 'flex-end', position: 'relative', bottom: 10, zIndex: 1 },
  particleLayer: { position: 'absolute', left: -6, right: -6, bottom: 21, height: 124, zIndex: 1 },
  trophyBeamWrap: { position: 'absolute', left: 8, right: 8, bottom: 25, height: 124, alignItems: 'center', justifyContent: 'flex-end', zIndex: -1 },
  trophyBeamRay: { position: 'absolute', bottom: 0, width: 24, height: 118, borderTopLeftRadius: 20, borderTopRightRadius: 20, borderBottomLeftRadius: 11, borderBottomRightRadius: 11 },
  trophyBurst: { position: 'absolute', left: 18, bottom: 34, width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.6)' },
  particleDot: { position: 'absolute', width: 6, height: 6, borderRadius: 3 },
  potImageTexture: { width: '100%', height: '70%', bottom: 0, position: 'absolute' },
  plantImage: { width: 65, height: 85, position: 'absolute', bottom: 68, zIndex: 1 },
  contributorPotBadge: {
    position: 'absolute',
    bottom: 24,
    right: 0,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(167, 152, 125, 0.52)',
    borderWidth: 1.5,
    borderColor: 'rgba(167, 152, 125, 0.8)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 6,
  },
  contributorPotBadgeSelf: {
    backgroundColor: 'rgba(130, 110, 80, 0.75)',
    borderColor: 'rgba(130, 110, 80, 0.9)',
  },
  completionPotBadgePending: {
    backgroundColor: 'rgba(96, 109, 124, 0.82)',
    borderColor: 'rgba(96, 109, 124, 0.95)',
  },
  quantityPotBadgeProgress: {
    backgroundColor: 'rgba(238, 246, 232, 0.95)',
    borderColor: 'rgba(198, 214, 185, 0.98)',
  },
  quantityPotBadge: {
    width: 'auto',
    minWidth: 28,
    height: 22,
    paddingHorizontal: 5,
    borderRadius: 11,
  },
  completionPotBadgeDone: {
    backgroundColor: '#59d700',
    borderColor: '#4aa93a',
  },
  completionPotBadgeInactive: {
    opacity: 0.4,
  },
  contributorPotBadgeText: {
    fontSize: 7,
    fontWeight: '900',
    color: '#FFF',
  },
  quantityPotSegmentRow: {
    flexDirection: 'row',
    width: 'auto',
    gap: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quantityPotSegment: {
    flex: 1,
    height: 6,
    borderRadius: 99,
    minWidth: 3,
  },
  quantityPotSegmentFilled: {
    backgroundColor: '#58cc02',
  },
  quantityPotSegmentDone: {
    backgroundColor: 'rgba(255,255,255,0.95)',
  },
  quantityPotSegmentEmpty: {
    backgroundColor: 'rgba(122,154,93,0.24)',
  },

  potLabel: { position: 'absolute', bottom: 30, minWidth: 24, minHeight: 24, justifyContent: 'center', alignItems: 'center', zIndex: 4 },
  trophyTierBadge: {
    position: 'absolute',
    right: 3,
    top: -2,
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 7,
  },
  trophyTierBadgeText: {
    fontSize: 9,
    fontWeight: '900',
    lineHeight: 10,
  },
  trophyTierBadgeIcon: {
    position: 'absolute',
    right: -4,
    bottom: 20,
    width: 42,
    height: 42,
    zIndex: 7,
  },

  gardenBackground: { flex: 1, width: '100%', height: '100%', bottom: 0 },
  backgroundImageTexture: { top: -80 },
  
  draggingShadow: { opacity: 1, transform: [{ scale: 1.1 }] },
  deleteBadge: { position: 'absolute', top: -10, left: -10, backgroundColor: '#E74C3C', width: 22, height: 22, borderRadius: 11, justifyContent: 'center', alignItems: 'center', zIndex: 10, borderWidth: 2, borderColor: '#fff' },
  ghost: { position: 'absolute', pointerEvents: 'none', zIndex: 9999 },
  splashBurst: {
    position: 'absolute',
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 2.5,
    borderColor: '#5aafff',
    backgroundColor: 'rgba(45, 140, 255, 0.12)',
    zIndex: 13000,
    pointerEvents: 'none',
  },
  splashBurst2: {
    borderColor: '#90ceff',
    backgroundColor: 'transparent',
    borderWidth: 1.5,
  },
  waterDropHandle: {
    position: 'absolute',
    right: 16,
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#2D8CFF',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 12000,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0)',
    elevation: 12000,
  },
  waterDropHandleWater: {
    ...cpShadow({ color: '#1467bb', offset: { width: 0, height: 5 }, opacity: 1, radius: 0, elevation: 4 }),
  },
  waterDropHandleAddGoal: {
    backgroundColor: 'rgb(82, 153, 61)',
    ...cpShadow({ color: '#2c6e28', offset: { width: 0, height: 5 }, opacity: 1, radius: 0, elevation: 4 }),
  },

  // The container stays fullscreen
  farBackground: {
    flex: 1,
    width: '100%',
    backgroundColor: '#1a1a1a', // Fallback color
  },

  // MANUALLY ADJUST THE FAR IMAGE HERE
  farImageStyle: {
    top: -0,            // Move up/down (e.g., -50 to pull it up)
    left: 40,           // Move left/right
    opacity: 1,      // Good for making it feel "distant"
    height: '120%', 
    transform: [
    { scale: 1.3 }   // Zooms in/out on the garden texture specifically
    ],   // Make it slightly taller than the screen if you need to offset 'top'
  },

  gardenBackground: {
    flex: 1,
    width: '100%',
  },

  // MANUALLY ADJUST THE GARDEN/FLOOR IMAGE HERE
  gardenImageStyle: {
    top: -80,          // Shifts the garden texture relative to the shelves
    transform: [
      { scale: 1.1 }   // Zooms in/out on the garden texture specifically
    ],
  },
});