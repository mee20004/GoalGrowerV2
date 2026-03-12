import React, { useState, useCallback, useRef, useEffect, memo } from "react";
import { 
  View, Text, StyleSheet, ActivityIndicator, ScrollView, FlatList, 
  Animated, TouchableOpacity, Platform, UIManager, LayoutAnimation, PanResponder, Image, ImageBackground, useWindowDimensions, TouchableWithoutFeedback, Pressable, Alert, Easing 
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StackActions } from "@react-navigation/native";

// Persist some state across mounts (helps keep drawer position & current page stable)
const persistedGardenState = {
  allPlants: null,
  currentPageId: null,
  isEditing: false,
  drawerScrollOffset: 0,
};
import { collection, doc, onSnapshot, setDoc, writeBatch, increment, updateDoc, getDoc, getDocs, arrayUnion, query, where, deleteDoc, runTransaction, deleteField } from "firebase/firestore";
import { auth, db } from "../firebaseConfig";
import { theme } from "../theme";
import Ionicons from "@expo/vector-icons/Ionicons";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import * as LucideIcons from "lucide-react-native/icons";
import { LinearGradient } from "expo-linear-gradient";
import { PLANT_ASSETS } from "../constants/PlantAssets";
import CustomizationScreen from "../components/CustomizationScreen";
import { subscribeSharedCustomizations, saveSharedCustomizations } from "../utils/customizationFirestore";
import { subscribePersonalCustomizations, savePersonalCustomizations } from "../utils/customizationFirestore";
import { FAR_BG_ASSETS } from "../constants/FarBGAssets";
import { FRAME_ASSETS } from "../constants/FrameAssets";
import { WALLPAPER_ASSETS } from "../constants/WallpaperAssets";
import { SHELF_COLOR_SCHEMES } from "../constants/ShelfColors";
import { toKey } from "../components/GoalsStore";
import { ACHIEVEMENTS } from "../AchievementsStore";
import { updateOverallScoreForUser, updateOverallScoresForSharedGardenMembers } from "../utils/scoreUtils";
const FAR_BG = require('../assets/far_background.png');
// Asset arrays are now imported from constants
const STORAGE_PAGE_ID = 'storage';
const STORAGE_SHELF_COUNT = 10;
const SHARED_GARDEN_DEFAULT_PAGE_ID = 'default';
const MULTI_USER_MIN_WATERERS = 2;

function getRequiredContributors(goal) {
  const requiredContributors = Number(goal?.requiredContributors);
  return Number.isFinite(requiredContributors) && requiredContributors >= 2
    ? Math.floor(requiredContributors)
    : MULTI_USER_MIN_WATERERS;
}
const toPascalCase = (value) =>
  String(value || '')
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');

const SUPPORTED_MCI_ICONS = new Set(['run-fast']);
const isMciIconName = (name) => typeof name === 'string' && name.startsWith('mci:');
const getMciName = (name) => String(name || '').slice(4);

const LEGACY_ICON_TO_LUCIDE = {
  leaf: 'sprout',
  'leaf-outline': 'sprout',
  'code-slash': 'code',
};

function normalizeGoalIconName(name, fallback = 'target') {
  if (!name || typeof name !== 'string') return fallback;
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

function getStoragePlantRating(plant) {
  if (plant?.shelfPosition?.pageId !== STORAGE_PAGE_ID) return null;

  const longestStreak = Number(plant?.longestStreak) || 0;
  const healthLevel = getPlantHealthState(plant).healthLevel;

  if (longestStreak >= 24 && healthLevel >= 3) return 'platinum';
  if (longestStreak >= 18 && healthLevel >= 3) return 'gold';
  if (longestStreak >= 7 && healthLevel >= 2) return 'silver';
  return 'bronze';
}

function isGoalDoneForDate(goal, dateKey) {
  if (goal?.type === "completion") {
    const isSharedMultiUser = !!goal?.multiUserWateringEnabled && goal?.gardenType === "shared";
    if (isSharedMultiUser) {
      const usersMap = goal?.logs?.completion?.[dateKey]?.users || {};
      const uniqueCount = Object.keys(usersMap).filter((userId) => !!usersMap[userId]).length;
      return uniqueCount >= getRequiredContributors(goal);
    }
    return !!goal?.logs?.completion?.[dateKey]?.done;
  }

  return (goal?.logs?.quantity?.[dateKey]?.value ?? 0) >= (goal?.measurable?.target ?? 0);
}

function isGoalScheduledOnDate(goal, date) {
  const scheduleType = goal?.schedule?.type;
  const dayOfWeek = new Date(date).getDay();

  if (scheduleType === 'everyday') return true;
  if (scheduleType === 'weekdays') return dayOfWeek >= 1 && dayOfWeek <= 5;
  if (scheduleType === 'days') return !!goal?.schedule?.days?.includes(dayOfWeek);

  if (Array.isArray(goal?.schedule?.days) && goal.schedule.days.length > 0) {
    return goal.schedule.days.includes(dayOfWeek);
  }

  return true;
}

function dateFromFirestoreValue(value) {
  if (!value) return null;
  if (typeof value?.toDate === 'function') {
    const converted = value.toDate();
    return Number.isNaN(converted?.getTime?.()) ? null : converted;
  }
  if (typeof value?.seconds === 'number') {
    const converted = new Date(value.seconds * 1000);
    return Number.isNaN(converted.getTime()) ? null : converted;
  }
  const converted = new Date(value);
  return Number.isNaN(converted.getTime()) ? null : converted;
}

function getPlantHealthState(goal, now = new Date()) {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  const storedHealthLevel = Number(goal?.healthLevel);
  if (goal?.shelfPosition?.pageId === STORAGE_PAGE_ID && storedHealthLevel >= 1 && storedHealthLevel <= 3) {
    if (storedHealthLevel === 2) return { healthLevel: 2, status: 'dry' };
    if (storedHealthLevel === 1) return { healthLevel: 1, status: 'dead' };
    return { healthLevel: 3, status: 'alive' };
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

  let derived = { healthLevel: 1, status: 'dead' };

  if (recentScheduledKeys.length === 0) {
    derived = { healthLevel: 3, status: 'alive' };
  } else if (isGoalDoneForDate(goal, recentScheduledKeys[0])) {
    derived = { healthLevel: 3, status: 'alive' };
  } else if (recentScheduledKeys.length === 1 || isGoalDoneForDate(goal, recentScheduledKeys[1])) {
    derived = { healthLevel: 2, status: 'dry' };
  }

  if (storedHealthLevel >= 1 && storedHealthLevel < derived.healthLevel) {
    if (storedHealthLevel === 2) return { healthLevel: 2, status: 'dry' };
    return { healthLevel: 1, status: 'dead' };
  }

  return derived;
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
    const nextParticles = buildRandomParticles(rating);
    const nextOrbitParticles = buildOrbitParticles(rating);
    setParticles(nextParticles);
    setOrbitParticles(nextOrbitParticles);

    const count = nextParticles.length;
    progressRefs.current = Array.from({ length: count }, (_, idx) => {
      const existing = progressRefs.current[idx];
      return existing || new Animated.Value(Math.random());
    });

    const orbitCount = nextOrbitParticles.length;
    orbitProgressRefs.current = Array.from({ length: orbitCount }, (_, idx) => {
      const existing = orbitProgressRefs.current[idx];
      return existing || new Animated.Value(Math.random());
    });
  }, [rating]);

  useEffect(() => {
    if (rating !== 'gold' && rating !== 'platinum') {
      beamAnim.setValue(0);
      return;
    }

    beamAnim.setValue(0);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(beamAnim, {
          toValue: 1,
          duration: 1200,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(beamAnim, {
          toValue: 0,
          duration: 1400,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [rating]);

  useEffect(() => {
    if (!rating) return;
    burstAnim.setValue(0);
    Animated.timing(burstAnim, {
      toValue: 1,
      duration: 560,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) burstAnim.setValue(0);
    });
  }, [rating]);

  useEffect(() => {
    let isActive = true;
    const timers = [];

    const animateParticle = (idx) => {
      if (!isActive || !progressRefs.current[idx]) return;
      const progress = progressRefs.current[idx];
      progress.setValue(0);

      Animated.sequence([
        Animated.timing(progress, {
          toValue: 1,
          duration: particles[idx]?.duration || randomInt(1200, 1900),
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (!isActive || !finished) return;

        setParticles((prev) => {
          if (!prev[idx]) return prev;
          const next = [...prev];
          next[idx] = buildRandomParticle(rating, idx);
          return next;
        });

        progress.setValue(0);
        const waitMs = particles[idx]?.waitMs || randomInt(30, 180);
        const timer = setTimeout(() => animateParticle(idx), waitMs);
        timers.push(timer);
      });
    };

    progressRefs.current.forEach((_, idx) => {
      const startDelay = randomInt(0, 500);
      const timer = setTimeout(() => animateParticle(idx), startDelay);
      timers.push(timer);
    });

    return () => {
      isActive = false;
      timers.forEach(clearTimeout);
      progressRefs.current.forEach((value) => value?.stopAnimation());
    };
  }, [rating]);

  useEffect(() => {
    let isActive = true;
    const timers = [];

    const animateOrbitParticle = (idx) => {
      if (!isActive || !orbitProgressRefs.current[idx]) return;
      const progress = orbitProgressRefs.current[idx];
      progress.setValue(0);

      Animated.timing(progress, {
        toValue: 1,
        duration: orbitParticles[idx]?.duration || randomInt(1600, 2400),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (!isActive || !finished) return;

        setOrbitParticles((prev) => {
          if (!prev[idx]) return prev;
          const next = [...prev];
          next[idx] = buildOrbitParticle(rating, idx);
          return next;
        });

        const waitMs = randomInt(10, 80);
        const timer = setTimeout(() => animateOrbitParticle(idx), waitMs);
        timers.push(timer);
      });
    };

    orbitProgressRefs.current.forEach((_, idx) => {
      const startDelay = randomInt(0, 400);
      const timer = setTimeout(() => animateOrbitParticle(idx), startDelay);
      timers.push(timer);
    });

    return () => {
      isActive = false;
      timers.forEach(clearTimeout);
      orbitProgressRefs.current.forEach((value) => value?.stopAnimation());
    };
  }, [rating]);

  return (
    <View pointerEvents="none" style={styles.particleLayer}>
      {(rating === 'gold' || rating === 'platinum') && (
        <Animated.View
          style={[
            styles.trophyBeamWrap,
            {
              opacity: beamAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [rating === 'platinum' ? 0.2 : 0.08, rating === 'platinum' ? 0.5 : 0.22],
              }),
              transform: [
                {
                  scaleY: beamAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.85, 1.15],
                  }),
                },
              ],
            },
          ]}
        >
          {[
            { x: -16, angle: -32 },
            { x: -8, angle: -18 },
            { x: 0, angle: 0 },
            { x: 8, angle: 18 },
            { x: 16, angle: 32 },
          ].map((ray, idx) => (
            <LinearGradient
              key={`beam-${rating}-${ray.x}-${idx}`}
              colors={
                rating === 'platinum'
                  ? ['rgba(214, 239, 255, 0.86)', 'rgba(206, 226, 255, 0.36)', 'rgba(194, 171, 255, 0.09)', 'rgba(194, 171, 255, 0)']
                  : ['rgba(255, 245, 186, 0.56)', 'rgba(255, 231, 148, 0.2)', 'rgba(255, 214, 118, 0.05)', 'rgba(255, 214, 118, 0)']
              }
              start={{ x: 0.5, y: 1 }}
              end={{ x: 0.5, y: 0 }}
              style={[
                styles.trophyBeamRay,
                {
                  transform: [
                    { translateX: ray.x },
                    { translateY: 46 },
                    { rotate: `${ray.angle}deg` },
                    { translateY: -46 },
                    { scaleY: 1 - Math.abs(ray.x) / 84 },
                  ],
                  opacity: 1 - Math.abs(ray.x) / 44,
                },
              ]}
            />
          ))}
        </Animated.View>
      )}

      {rating && (
        <Animated.View
          style={[
            styles.trophyBurst,
            {
              opacity: burstAnim.interpolate({ inputRange: [0, 0.18, 1], outputRange: [0, 0.64, 0] }),
              transform: [{ scale: burstAnim.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1.35] }) }],
            },
          ]}
        />
      )}

      {orbitParticles.map((particle, idx) => {
        const progress = orbitProgressRefs.current[idx] || new Animated.Value(0);
        const spin = progress.interpolate({
          inputRange: [0, 1],
          outputRange: particle.direction === -1 ? ['360deg', '0deg'] : ['0deg', '360deg'],
          extrapolate: 'clamp',
        });
        const opacity = progress.interpolate({
          inputRange: [0, 0.5, 1],
          outputRange: [0.2, 0.95, 0.2],
          extrapolate: 'clamp',
        });
        const scale = progress.interpolate({
          inputRange: [0, 0.5, 1],
          outputRange: [0.85, 1.2, 0.85],
          extrapolate: 'clamp',
        });

        return (
          <View
            key={particle.key || `orbit-${rating}-${idx}`}
            style={[
              styles.orbitCenter,
              {
                transform: [{ rotate: `${particle.startAngle}deg` }],
              },
            ]}
          >
            <Animated.View
              style={{
                transform: [{ rotate: spin }, { translateX: particle.radius }, { scale }],
              }}
            >
              <Animated.View
                style={[
                  styles.orbitDot,
                  {
                    width: particle.size,
                    height: particle.size,
                    borderRadius: particle.size / 2,
                    backgroundColor: particle.color,
                    shadowColor: particle.color,
                    shadowOpacity: particle.glowOpacity || 0,
                    shadowRadius: particle.glowRadius || 0,
                    shadowOffset: { width: 0, height: 0 },
                    opacity,
                  },
                ]}
              />
            </Animated.View>
          </View>
        );
      })}

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
};

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
const PlantVisual = ({ plant, isDraggingHighlight }) => {
    // Debug log to check why platinum fern _p asset is not showing
    if (species === 'fern') {
      console.log('[Fern Debug]', {
        species,
        stage,
        rating,
        trophyVariantKey,
        trophyPlantAsset,
        hasStage4P: !!PLANT_ASSETS.fern?.p?.stage4,
        asset,
        plant
      });
    }
  const total = Number(plant.totalCompletions) || 0;
  const rating = getStoragePlantRating(plant);

  const swayAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (rating) {
      swayAnim.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(swayAnim, { toValue: 1,  duration: 600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(swayAnim, { toValue: -1, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(swayAnim, { toValue: 0,  duration: 1200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    const timer = setTimeout(() => loop.start(), Math.random() * 1500);
    return () => { clearTimeout(timer); loop.stop(); swayAnim.setValue(0); };
  }, [rating]);
  
  let stage = 'stage1';
  if (total > 30) stage = 'stage4';
  else if (total > 15) stage = 'stage3';
  else if (total > 5) stage = 'stage2';

  const healthState = getPlantHealthState(plant);
  const { status } = healthState;
  const species = plant.plantSpecies || (plant.type !== "completion" && plant.type !== "quantity" ? plant.type : "fern");
  const asset = PLANT_ASSETS[species]?.[stage]?.[status] || PLANT_ASSETS[species]?.[stage]?.['alive'] || PLANT_ASSETS['fern']['stage1']['alive'];
  const trophyVariantKey = rating === 'platinum' ? 'p' : rating === 'gold' ? 'g' : rating === 'silver' ? 's' : rating === 'bronze' ? 'b' : null;
  let trophyPlantAsset = null;
  if (rating && species === 'fern') {
    trophyPlantAsset = PLANT_ASSETS.fern?.[trophyVariantKey]?.[stage];
    // Fallback: if platinum, stage4, and asset missing, force stage4_p
    if (!trophyPlantAsset && rating === 'platinum' && stage === 'stage4') {
      trophyPlantAsset = PLANT_ASSETS.fern?.p?.stage4;
    }
  }
  const showTrophyParticles = Boolean(rating);
  const plantSource = trophyPlantAsset || asset;
  const potSource = rating ? (TROPHY_POT_IMAGES[rating] || POT_IMAGE) : POT_IMAGE;
  const showReviveHeart = healthState.healthLevel === 2 && isGoalDoneForDate(plant, toKey(new Date()));
  const todayKey = toKey(new Date());
  const isSharedMultiUserGoal = !!plant?.multiUserWateringEnabled && plant?.gardenType === "shared" && plant?.type === "completion";
  const contributorUsersMap = isSharedMultiUserGoal ? (plant?.logs?.completion?.[todayKey]?.users || {}) : {};
  const currentContributors = isSharedMultiUserGoal
    ? Object.keys(contributorUsersMap).filter((id) => !!contributorUsersMap[id]).length
    : 0;
  const requiredContributorsForBadge = isSharedMultiUserGoal ? getRequiredContributors(plant) : 1;
  const isGoalDoneToday = isSharedMultiUserGoal ? currentContributors >= requiredContributorsForBadge : false;
  const currentUserContributedToday = isSharedMultiUserGoal ? !!contributorUsersMap[auth.currentUser?.uid] : false;
  const showContributorBadge = isSharedMultiUserGoal && !isGoalDoneToday;
  const contributorBadgeLabel = `${Math.min(currentContributors, requiredContributorsForBadge)}/${requiredContributorsForBadge}`;
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
    if (plant.icon) return normalizeGoalIconName(plant.icon, plant.type === 'coding' ? 'code' : 'target');
    if (plant.goalIcon) return normalizeGoalIconName(plant.goalIcon, plant.type === 'coding' ? 'code' : 'target');
    return plant.type === 'coding' ? 'code' : 'target';
  };

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
              !rating && {
                transform: [
                  { translateY: 42.5 },
                  { rotate: swayAnim.interpolate({ inputRange: [-1, 1], outputRange: ['-4deg', '6deg'] }) },
                  { scale: swapScaleAnim },
                  { translateY: -42.5 },
                ],
              },
              rating && {
                transform: [
                  { translateY: 42.5 },
                  { scale: swapScaleAnim },
                  { translateY: -42.5 },
                ],
              },
            ]}
            resizeMode="contain"
          />
          {showReviveHeart && (
            <View style={styles.reviveHeartBadge}>
              <Ionicons name="heart" size={12} color="#fff" />
            </View>
          )}
          <View style={styles.potLabel}>
            <GoalIcon name={getPotIcon()} size={18} color="#fff" />
          </View>
          {showContributorBadge && (
            <View style={[styles.contributorPotBadge, currentUserContributedToday && styles.contributorPotBadgeSelf]}>
              <Text style={styles.contributorPotBadgeText}>{contributorBadgeLabel}</Text>
            </View>
          )}
        </ImageBackground>
      </View>
      {(plant.title || plant.name) ? (
        <Text style={styles.plantNameLabel} numberOfLines={1} ellipsizeMode="tail">
          {plant.title || plant.name}
        </Text>
      ) : null}
    </View>
  );
};

// --- 2. DRAGGABLE WRAPPER ---
const DraggablePlant = memo(({ plant, isEditing, wiggleAnim, onLongPress, onDragStart, onDragEnd, onDelete, onPlantTap, globalPan, globalDragRef, disabled = false, onCompletionTargetRef, instantDrag = false }) => {
  const [isHidden, setIsHidden] = useState(false);
  const latestProps = useRef({ plant, onDragStart, onDragEnd, onDelete, onPlantTap, isEditing, instantDrag });
  latestProps.current = { plant, onDragStart, onDragEnd, onDelete, onPlantTap, isEditing, instantDrag };

  const longPressTriggeredRef = useRef(false);
  const longPressTimeoutRef = useRef(null);
  const dragStartedRef = useRef(false);
  const dragFinalizedRef = useRef(false);
  const dragStartPendingRef = useRef(false);
  const dragStartShelfPositionRef = useRef(null);
  const lastTouchRef = useRef({ x: 0, y: 0, lx: 0, ly: 0 });

  useEffect(() => {
    return () => {
      if (longPressTimeoutRef.current) {
        clearTimeout(longPressTimeoutRef.current);
      }
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
    latestProps.current.onDragEnd(latestProps.current.plant, moveX, moveY, dragStartShelfPositionRef.current, () => {
      setIsHidden(false);
    });
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => {
        if (disabled || globalDragRef.current) return false;
        return !latestProps.current.instantDrag;
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
        const { pageX, pageY, locationX, locationY } = evt.nativeEvent;
        lastTouchRef.current = { x: pageX, y: pageY, lx: locationX, ly: locationY };

        if (latestProps.current.instantDrag || latestProps.current.isEditing) {
          startDrag(lastTouchRef.current);
        } else {
          longPressTriggeredRef.current = false;
          dragStartedRef.current = false;
          if (longPressTimeoutRef.current) clearTimeout(longPressTimeoutRef.current);
          longPressTimeoutRef.current = setTimeout(() => {
            longPressTriggeredRef.current = true;
            onLongPress && onLongPress();
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
      onPanResponderRelease: (_, gesture) => {
        if (longPressTimeoutRef.current) {
          clearTimeout(longPressTimeoutRef.current);
          longPressTimeoutRef.current = null;
        }
        if (dragStartedRef.current) {
          finalizeDrag(gesture.moveX ?? lastTouchRef.current.x, gesture.moveY ?? lastTouchRef.current.y);
        } else if (!longPressTriggeredRef.current && !latestProps.current.isEditing) {
          latestProps.current.onPlantTap?.(latestProps.current.plant);
        } else if (isHidden) {
          setIsHidden(false);
        }
        longPressTriggeredRef.current = false;
        dragStartedRef.current = false;
      },
      onPanResponderTerminate: () => {
        if (longPressTimeoutRef.current) {
          clearTimeout(longPressTimeoutRef.current);
          longPressTimeoutRef.current = null;
        }
        finalizeDrag(lastTouchRef.current.x, lastTouchRef.current.y);
        longPressTriggeredRef.current = false;
        dragStartedRef.current = false;
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
      style={[
        styles.plantContainer,
        isEditing && !isHidden && { transform: [{ rotate: wiggleAnim.interpolate({ inputRange: [-1, 1], outputRange: ['-2deg', '2deg'] }) }] },
        { opacity: isHidden ? 0 : 1 } 
      ]}
    >
      <PlantVisual plant={plant} isDraggingHighlight={false} />
    </Animated.View>
  );
});

// --- 3. MAIN GARDEN SCREEN ---
export default function GardenScreen({ route, navigation }) {
    // --- Customization State ---
    const [showCustomization, setShowCustomization] = useState(false);
    // { [pageId]: { farBg, windowFrame, wallBg, shelfColor } }
    const [customizations, setCustomizations] = useState({});
  // Subscribe to shared customizations if in shared garden
  useEffect(() => {
    let unsub;
    if (isSharedGarden && sharedGardenId) {
      unsub = subscribeSharedCustomizations(sharedGardenId, setCustomizations);
    } else if (!isSharedGarden && auth.currentUser?.uid) {
      unsub = subscribePersonalCustomizations(auth.currentUser.uid, setCustomizations);
    }
    return () => unsub && unsub();
  }, [isSharedGarden, sharedGardenId]);
  const insets = useSafeAreaInsets();
  const sharedGardenId = route?.params?.gardenId || route?.params?.sharedGardenId || null;
  const isSharedGarden = Boolean(sharedGardenId);
  const viewedUserId = route?.params?.userId || auth.currentUser?.uid;
  const isReadOnly = isSharedGarden
    ? Boolean(route?.params?.readOnly)
    : Boolean(route?.params?.readOnly && viewedUserId && viewedUserId !== auth.currentUser?.uid);
  const shouldPersistState = !isReadOnly && !isSharedGarden;
  const viewedUsername = isSharedGarden ? (route?.params?.gardenName || "Shared Garden") : (route?.params?.username || "User");

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
  const [expandedInviteGardenId, setExpandedInviteGardenId] = useState(null);
  const [activeInviteKey, setActiveInviteKey] = useState('');
  const [acceptingInviteId, setAcceptingInviteId] = useState('');
  const [leavingGardenId, setLeavingGardenId] = useState('');
  const [myUsername, setMyUsername] = useState('User');
  const currentPageRef = useRef(currentPageId);

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
  const drawerShouldShowRef = useRef((shouldPersistState ? (persistedGardenState.currentPageId || "default") : "default") !== STORAGE_PAGE_ID);
  const sharedDropOverridesRef = useRef({});

  useEffect(() => {
    currentPageRef.current = currentPageId;
  }, [currentPageId]);

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
  const drawerRef = useRef(null);
  const drawerScrollRef = useRef(null);

  useEffect(() => {
    if (drawerScrollRef.current && drawerScrollOffset) {
      drawerScrollRef.current.scrollTo({ x: drawerScrollOffset, animated: false });
    }
  }, []);

  useEffect(() => {
    if (isReadOnly || !auth.currentUser) return undefined;

    const uid = auth.currentUser.uid;

    const unsubSharedGardens = onSnapshot(
      query(collection(db, 'sharedGardens'), where('memberIds', 'array-contains', uid)),
      (snap) => {
        const docs = snap.docs
          .map((gardenDoc) => ({ id: gardenDoc.id, ...gardenDoc.data() }))
          .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
        setSharedGardens(docs);
      },
      (error) => {
        console.error('Error loading shared gardens', error);
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
        console.error('Error loading shared garden invites', error);
      }
    );

    const unsubFollowing = onSnapshot(
      collection(db, 'users', uid, 'following'),
      (snap) => {
        setFollowingUsers(snap.docs.map((userDoc) => ({ id: userDoc.id, ...userDoc.data() })));
      },
      (error) => {
        console.error('Error loading following list', error);
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
  }, [isReadOnly, isSharedGarden]);

  const setCompletionTargetRef = useCallback((plantId, node) => {
    if (node) {
      completionTargetRefs.current[plantId] = node;
      return;
    }
    delete completionTargetRefs.current[plantId];
  }, []);

  const calculateStreakForLogs = useCallback((goal, newLogs) => {
    let current = 0;
    let longest = Number(goal?.longestStreak) || 0;
    const checkToday = new Date();
    checkToday.setHours(0, 0, 0, 0);
    let checkDate = new Date(checkToday);

    for (let idx = 0; idx < 365; idx += 1) {
      const dateKey = toKey(checkDate);
      const dayOfWeek = checkDate.getDay();
      const isScheduled = goal.schedule?.type === "everyday"
        || (goal.schedule?.type === "weekdays" && dayOfWeek >= 1 && dayOfWeek <= 5)
        || (goal.schedule?.type === "days" && goal.schedule?.days?.includes(dayOfWeek));

      if (isScheduled) {
        const isDoneOnDate = goal.type === "completion"
          ? !!newLogs?.completion?.[dateKey]?.done
          : (newLogs?.quantity?.[dateKey]?.value ?? 0) >= (goal?.measurable?.target ?? 0);

        if (isDoneOnDate) current += 1;
        else if (dateKey !== toKey(checkToday)) break;
      }
      checkDate.setDate(checkDate.getDate() - 1);
    }

    if (current > longest) longest = current;
    return { currentStreak: current, longestStreak: longest };
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
        await updateDoc(userRef, { streakCount: currentAppStreak, lastActiveDate: todayStr });
        return currentAppStreak;
      }
      return 0;
    } catch (error) {
      console.error(error);
      return 0;
    }
  }, []);

  const checkAchievements = useCallback(async (currentAppStreak) => {
    if (!auth.currentUser) return;
    try {
      const userRef = doc(db, "users", auth.currentUser.uid);
      const userSnap = await getDoc(userRef);
      if (!userSnap.exists()) return;
      const userData = userSnap.data();
      const unlockedIds = userData.unlockedAchievements || [];
      const currentStats = { appStreak: currentAppStreak, overallScore: userData.overallScore || 0 };
      const newlyUnlocked = ACHIEVEMENTS.filter((achievement) => !unlockedIds.includes(achievement.id) && achievement.check(currentStats));

      if (newlyUnlocked.length > 0) {
        const newIds = newlyUnlocked.map((achievement) => achievement.id);
        await updateDoc(userRef, { unlockedAchievements: arrayUnion(...newIds) });
      }
    } catch (error) {
      console.error(error);
    }
  }, []);

  const markPlantCompletedFromDrop = useCallback(async (plantId) => {
    if (isReadOnly || !auth.currentUser) return;

    const goal = allPlants.find((item) => item.id === plantId);
    if (!goal) return;

    const todayKey = toKey(new Date());
    const currentUserId = auth.currentUser.uid;
    const isSharedMultiUser = isSharedGarden
      && goal?.type === "completion"
      && !!goal?.multiUserWateringEnabled
      && goal?.gardenType === "shared";

    if (isGoalDoneForDate(goal, todayKey)) return;

    if (isSharedMultiUser && goal?.logs?.completion?.[todayKey]?.users?.[currentUserId]) {
      return;
    }

    const updatedLogs = JSON.parse(JSON.stringify(goal.logs || {}));
    const updateData = {};
    let shouldAwardCompletion = false;

    if (goal.type === "completion") {
      if (!updatedLogs.completion) updatedLogs.completion = {};

      if (isSharedMultiUser) {
        const existingEntry = updatedLogs.completion[todayKey] || {};
        const existingUsers = existingEntry.users || {};
        const nextUsers = { ...existingUsers, [currentUserId]: true };
        const uniqueCount = Object.keys(nextUsers).filter((userId) => !!nextUsers[userId]).length;
        const isNowDone = uniqueCount >= getRequiredContributors(goal);

        updatedLogs.completion[todayKey] = { ...existingEntry, users: nextUsers, done: isNowDone };
        updateData[`logs.completion.${todayKey}`] = updatedLogs.completion[todayKey];
        shouldAwardCompletion = isNowDone;
      } else {
        updatedLogs.completion[todayKey] = { done: true };
        updateData[`logs.completion.${todayKey}.done`] = true;
        shouldAwardCompletion = true;
      }
    } else {
      if (!updatedLogs.quantity) updatedLogs.quantity = {};
      const targetValue = goal?.measurable?.target || 1;
      updatedLogs.quantity[todayKey] = { value: targetValue };
      updateData[`logs.quantity.${todayKey}.value`] = targetValue;
      shouldAwardCompletion = true;
    }

    if (shouldAwardCompletion) {
      const currentPlantHealth = getPlantHealthState(goal).healthLevel;
      updateData.totalCompletions = increment(1);
      updateData.healthLevel = currentPlantHealth <= 1 ? 2 : 3;
      const { currentStreak, longestStreak } = calculateStreakForLogs(goal, updatedLogs);
      updateData.currentStreak = currentStreak;
      updateData.longestStreak = longestStreak;
    }

    if (isSharedGarden) {
      const sharedLayoutRef = doc(db, "sharedGardens", sharedGardenId, "layout", plantId);
      await updateDoc(sharedLayoutRef, updateData);

      const ownerId = goal?.ownerId || null;
      const sourceGoalId = goal?.sourceGoalId || goal?.id;
      if (ownerId && sourceGoalId) {
        try {
          await updateDoc(doc(db, "users", ownerId, "goals", sourceGoalId), updateData);
        } catch (error) {
          if (error?.code !== "permission-denied") {
            console.error("Failed to sync shared watering to source goal:", error);
          }
        }
      }

      await updateOverallScoresForSharedGardenMembers(sharedGardenId);
    } else {
      const goalRef = doc(db, "users", auth.currentUser.uid, "goals", plantId);
      await updateDoc(goalRef, updateData);
    }

    if (shouldAwardCompletion) {
      const newAppStreak = await updateOverallAppStreak();
      await checkAchievements(newAppStreak);
    }
  }, [allPlants, calculateStreakForLogs, checkAchievements, isReadOnly, isSharedGarden, sharedGardenId, updateOverallAppStreak]);

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
  const { width, height } = useWindowDimensions();
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

  const activateEditMode = useCallback(() => {
    if (isReadOnly) return;
    if (globalDragRef.current || globalDragging) return;
    if (!isEditing) {
      setIsEditing(true);
      if (shouldPersistState) persistedGardenState.isEditing = true;
    }
  }, [globalDragging, isEditing, isReadOnly, shouldPersistState]);

  const handleDragStart = async (plant, touchX, touchY) => {
    if (isReadOnly) return false;
    if (globalDragRef.current) return false;

    if (shouldPersistState && !persistedGardenState.isEditing) {
      persistedGardenState.isEditing = true;
    }
    setIsEditing((prev) => (prev ? prev : true));

    globalDragRef.current = true;
    setGlobalDragging(true);
    globalPan.setValue({ x: 0, y: 0 });
    setDraggedGhost({ plant, x: touchX - 40, y: touchY - -50 });

    if (isSharedGarden) {
      const uid = auth.currentUser?.uid;
      if (!uid) {
        globalDragRef.current = false;
        setGlobalDragging(false);
        setDraggedGhost(null);
        return false;
      }

      const plantDoc = doc(db, "sharedGardens", sharedGardenId, "layout", plant.id);
      const expectedStartPos = normalizeShelfPosition(
        plant?.shelfPosition
          ? { ...plant.shelfPosition, pageId: plant.shelfPosition.pageId || currentPageId }
          : null
      );
      const lockAcquiredAt = Date.now();
      const lockExpiresAt = lockAcquiredAt + 20000;

      try {
        await runTransaction(db, async (transaction) => {
          const livePlantSnap = await transaction.get(plantDoc);
          if (!livePlantSnap.exists()) {
            const err = new Error("Plant no longer exists.");
            err.code = "layout-conflict";
            throw err;
          }

          const livePlantData = livePlantSnap.data() || {};
          const livePlantPos = normalizeShelfPosition(livePlantData?.shelfPosition || null);
          if (!shelfPositionsMatch(livePlantPos, expectedStartPos)) {
            const err = new Error("Plant moved by another user.");
            err.code = "layout-conflict";
            throw err;
          }

          const activeLock = livePlantData?.moveLock || null;
          const activeLockUid = activeLock?.uid;
          const activeLockExpiry = Number(activeLock?.expiresAt) || 0;
          const now = Date.now();
          if (activeLockUid && activeLockUid !== uid && activeLockExpiry > now) {
            const err = new Error("Plant is currently being moved by another member.");
            err.code = "plant-locked";
            throw err;
          }

          transaction.set(
            plantDoc,
            { moveLock: { uid, acquiredAt: lockAcquiredAt, expiresAt: lockExpiresAt } },
            { merge: true }
          );
        });
      } catch (error) {
        if (error?.code === "plant-locked") {
          Alert.alert("Plant in use", "Another member is currently moving this plant.");
        } else if (error?.code === "layout-conflict") {
          Alert.alert("Garden updated", "This plant moved before your drag started. Your garden will refresh to the latest layout.");
        } else {
          console.error("Failed to lock plant for dragging", error);
        }

        globalDragRef.current = false;
        setGlobalDragging(false);
        setDraggedGhost(null);
        return false;
      }
    }

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

  const releaseSharedMoveLock = useCallback(async (plantId) => {
    if (!isSharedGarden || !sharedGardenId || !plantId) return;
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    const plantDoc = doc(db, "sharedGardens", sharedGardenId, "layout", plantId);
    try {
      await runTransaction(db, async (transaction) => {
        const livePlantSnap = await transaction.get(plantDoc);
        if (!livePlantSnap.exists()) return;
        const liveData = livePlantSnap.data() || {};
        const liveLockUid = liveData?.moveLock?.uid;
        if (liveLockUid && liveLockUid !== uid) return;
        transaction.set(plantDoc, { moveLock: deleteField() }, { merge: true });
      });
    } catch (error) {
      console.error("Failed to release shared move lock", error);
    }
  }, [isSharedGarden, sharedGardenId]);

  const handleDragEnd = async (plant, moveX, moveY, dragStartShelfPosition, completeLocalDrag) => {
    let didUnlock = false;
    const releaseMoveLock = () => {
      if (!isSharedGarden) return;
      releaseSharedMoveLock(plant.id).catch((error) => {
        console.error("Failed to clear plant move lock", error);
      });
    };

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
      const dest = await checkDropZones(moveX, moveY);
      if (dest) {
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

          setAllPlants(prev => {
            const newArr = [...prev];
            const pIdx = newArr.findIndex(p => p.id === plant.id);
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
              newArr[pIdx] = { ...newArr[pIdx], shelfPosition: { pageId: currentPageId, shelfName, slotIndex }};
            }
            if (shouldPersistState) persistedGardenState.allPlants = newArr;
            return newArr;
          });
        };

        applyLocalDrop();
        unlockAfterLocalDrop();

        try {
          const uid = auth.currentUser?.uid;
          if (dest === 'drawer') {
            const targetDoc = isSharedGarden
              ? doc(db, "sharedGardens", sharedGardenId, "layout", plant.id)
              : doc(db, "users", uid, "gardenLayout", plant.id);
            if (isSharedGarden) {
              const expectedOldPos = normalizeShelfPosition(baseOldPos);

              await runTransaction(db, async (transaction) => {
                const livePlantSnap = await transaction.get(targetDoc);
                const livePlantData = livePlantSnap.data() || {};
                const livePlantPos = normalizeShelfPosition(livePlantData?.shelfPosition || null);
                if (!shelfPositionsMatch(livePlantPos, expectedOldPos)) {
                  const conflictError = new Error("Plant moved by another user.");
                  conflictError.code = "layout-conflict";
                  throw conflictError;
                }

                const lockUid = livePlantData?.moveLock?.uid;
                const lockExpiry = Number(livePlantData?.moveLock?.expiresAt) || 0;
                const uidNow = auth.currentUser?.uid;
                if (lockUid && lockUid !== uidNow && lockExpiry > Date.now()) {
                  const lockError = new Error("Plant is currently being moved by another member.");
                  lockError.code = "plant-locked";
                  throw lockError;
                }

                transaction.set(targetDoc, { shelfPosition: null, moveLock: deleteField() }, { merge: true });
              });
            } else {
              await setDoc(targetDoc, { shelfPosition: null }, { merge: true });
            }
          } else {
            const parsedDest = parseDestinationSlot(dest);
            if (!parsedDest) return;
            const { shelfName, slotIndex } = parsedDest;
            const targetPos = { pageId: currentPageId, shelfName, slotIndex };
            const oldPos = baseOldPos;

            if (isSharedGarden) {
              const plantDoc = doc(db, "sharedGardens", sharedGardenId, "layout", plant.id);
              const expectedOldPos = normalizeShelfPosition(oldPos);
              const candidatePlantIds = allPlants
                .map((candidatePlant) => candidatePlant?.id)
                .filter((id) => !!id && id !== plant.id);

              await runTransaction(db, async (transaction) => {
                const livePlantSnap = await transaction.get(plantDoc);
                const livePlantData = livePlantSnap.data() || {};
                const livePlantPos = normalizeShelfPosition(livePlantData?.shelfPosition || null);
                if (!shelfPositionsMatch(livePlantPos, expectedOldPos)) {
                  const conflictError = new Error("Plant moved by another user.");
                  conflictError.code = "layout-conflict";
                  throw conflictError;
                }

                const lockUid = livePlantData?.moveLock?.uid;
                const lockExpiry = Number(livePlantData?.moveLock?.expiresAt) || 0;
                if (lockUid && lockUid !== uid && lockExpiry > Date.now()) {
                  const lockError = new Error("Plant is currently being moved by another member.");
                  lockError.code = "plant-locked";
                  throw lockError;
                }

                let occupantId = null;
                for (const candidateId of candidatePlantIds) {
                  const candidateDoc = doc(db, "sharedGardens", sharedGardenId, "layout", candidateId);
                  const candidateSnap = await transaction.get(candidateDoc);
                  if (!candidateSnap.exists()) continue;
                  const candidatePos = normalizeShelfPosition(candidateSnap.data()?.shelfPosition || null);
                  if (shelfPositionsMatch(candidatePos, targetPos)) {
                    occupantId = candidateId;
                    break;
                  }
                }

                if (occupantId) {
                  const occupantDoc = doc(db, "sharedGardens", sharedGardenId, "layout", occupantId);
                  transaction.set(occupantDoc, { shelfPosition: expectedOldPos }, { merge: true });
                }

                transaction.set(
                  plantDoc,
                  { shelfPosition: targetPos, moveLock: deleteField() },
                  { merge: true }
                );
              });
            } else {
              const batch = writeBatch(db);
              const occupant = allPlants.find(
                (p) => p.shelfPosition?.pageId === currentPageId && p.shelfPosition?.shelfName === shelfName && p.shelfPosition?.slotIndex === slotIndex
              );

              if (occupant && occupant.id !== plant.id) {
                const occupantDoc = doc(db, "users", uid, "gardenLayout", occupant.id);
                batch.set(occupantDoc, { shelfPosition: oldPos }, { merge: true });
              }

              const plantDoc = doc(db, "users", uid, "gardenLayout", plant.id);
              batch.set(
                plantDoc,
                { shelfPosition: targetPos },
                { merge: true }
              );
              await batch.commit();
            }
          }
        } catch (e) {
          if (isSharedGarden) {
            delete sharedDropOverridesRef.current[plant.id];
          }
          if (e?.code === "layout-conflict") {
            Alert.alert("Garden updated", "Another member moved this plant first. Your garden will refresh to the latest layout.");
          } else if (e?.code === "plant-locked") {
            Alert.alert("Plant in use", "Another member is currently moving this plant.");
          } else {
            console.error(e);
          }
        }

        releaseMoveLock();
        return;
      }

      releaseMoveLock();
      Animated.spring(globalPan, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start(() => {
        unlock();
      });
    } catch (e) {
      console.error('Drag end failed', e);
      releaseMoveLock();
      unlock();
    }
  };

  const handleAddPage = async () => {
    if (isReadOnly || !auth.currentUser) return;
    const uid = auth.currentUser.uid;
    const newPageRef = isSharedGarden
      ? doc(collection(db, "sharedGardens", sharedGardenId, "pages"))
      : doc(collection(db, "users", uid, "gardenPages"));
    const realPageCount = pages.filter((p) => p.id !== STORAGE_PAGE_ID).length;
    const title = `Page ${realPageCount + 1}`;
    await setDoc(newPageRef, { title, createdAt: Date.now() });
    setCurrentPageId(newPageRef.id);
  };

  const handleCustomizeGarden = useCallback(() => {
    setShowCustomization(true);
  }, []);

  const handleSaveCustomization = (pageId, values) => {
    setCustomizations((prev) => ({
      ...prev,
      [pageId]: values,
    }));
  };

  const handleResetPositions = async () => {
    if (isReadOnly || !auth.currentUser) return;
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

    try {
      setCreatingSharedGarden(true);
      const uid = auth.currentUser.uid;
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

  const handleCreateSharedGarden = () => {
    if (isReadOnly || !auth.currentUser || creatingSharedGarden) return;

    if (typeof Alert.prompt === 'function') {
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

    Alert.alert('Name required', 'Please enter a garden name before creating.');
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

        tx.update(gardenRef, { memberIds: arrayUnion(uid) });
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

  const checkDropZones = async (moveX, moveY) => {
    if (currentPageRef.current !== STORAGE_PAGE_ID && drawerRef.current) {
      const dRect = await new Promise(res => drawerRef.current.measure((x, y, w, h, px, py) => {
        res(px !== undefined ? { l: px, r: px + w, t: py, b: py + h } : null);
      }));
      if (dRect && moveX >= dRect.l && moveX <= dRect.r && moveY >= dRect.t && moveY <= dRect.b) return 'drawer';
    }

    const prefix = `${currentPageRef.current}_`;
    const candidateKeys = Object.keys(slotRefs.current).filter((key) => key.startsWith(prefix));
    for (const slotKey of candidateKeys) {
      const slotRef = slotRefs.current[slotKey];
      if (!slotRef) continue;
      const rect = await new Promise(res => slotRef.measure((x, y, w, h, px, py) => {
        res(px !== undefined ? { l: px - 15, r: px + w + 15, t: py - 15, b: py + h + 15 } : null);
      }));
      if (rect && moveX >= rect.l && moveX <= rect.r && moveY >= rect.t && moveY <= rect.b) {
        const suffix = slotKey.slice(prefix.length);
        const lastUnderscore = suffix.lastIndexOf('_');
        if (lastUnderscore !== -1) {
          const shelfName = suffix.slice(0, lastUnderscore);
          const slotIndex = suffix.slice(lastUnderscore + 1);
          return `${shelfName}_${slotIndex}`;
        }
      }
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
    if (isSharedGarden) {
      setDoc(doc(db, "sharedGardens", sharedGardenId, "layout", plantId), { shelfPosition: null }, { merge: true });
      return;
    }
    setDoc(doc(db, "users", auth.currentUser.uid, "gardenLayout", plantId), { shelfPosition: null }, { merge: true });
  }, [isSharedGarden, sharedGardenId]);

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

const renderShelf = (pageId, shelfName, plantsOnPage, shelfColorIdx = 0) => {
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
      <View key={`${pageId}_${shelfName}`} style={[styles.shelfWrapper, { width: config.width, alignSelf: config.side==='left'?'flex-start':config.side==='right'?'flex-end':'center', marginTop: config.offsetTop }]}> 
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
            return (
              <View key={slotKey} ref={el => slotRefs.current[slotKey] = el} style={[styles.slot, isEditing && styles.slotEditBox]} collapsable={false}>
                {occupant && (
                  <DraggablePlant 
                    key={occupant.id}
                    plant={occupant} isEditing={isEditing} disabled={isReadOnly} wiggleAnim={wiggleAnim} 
                    onCompletionTargetRef={setCompletionTargetRef}
                    onLongPress={activateEditMode} globalPan={globalPan} globalDragRef={globalDragRef} 
                    onPlantTap={handlePlantTap}
                    onDragStart={handleDragStart} onDragEnd={handleDragEnd}
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
            <Ionicons name="trophy" size={20} color="#FFD700" style={styles.storageHeaderIcon} />
            <Text style={styles.storageHeaderTitle}>Trophy Collection</Text>
            <Ionicons name="trophy" size={20} color="#FFD700" style={styles.storageHeaderIcon} />
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
                setIsEditing(false);
                if (shouldPersistState) persistedGardenState.isEditing = false;
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
    return (
      <TouchableWithoutFeedback
        delayLongPress={350}
        onLongPress={isReadOnly ? undefined : activateEditMode}
        onPress={() => {
          if (!isReadOnly && isEditing) {
            setIsEditing(false);
            if (shouldPersistState) persistedGardenState.isEditing = false;
          }
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
              {/* Window frame rendered above wallpaper, behind shelves */}
              {FRAME_ASSETS[windowFrameIdx] && (
                <Image
                  source={FRAME_ASSETS[windowFrameIdx]}
                  style={[styles.gardenImageStyle, { position: 'absolute', width, height }]}
                  resizeMode="cover"
                />
              )}
              <View pointerEvents="none" style={styles.pageDrawerUnderlay}>
                <View style={styles.pageDrawerUnderlayTopBandPrimary} />
                <View style={styles.pageDrawerUnderlayTopBandSecondary} />
              </View>
              <View style={styles.gardenMain}>
                {["topShelf", "middleShelf", "bottomShelf"].map((shelfName) => renderShelf(page.id, shelfName, plantsOnPage, shelfColorIdx))}
              </View>
            </ImageBackground>
          </ImageBackground>
          <GardenAmbientParticles />
        </View>
      </TouchableWithoutFeedback>
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
  const switcherTargetHeight = Math.min(
    SWITCHER_VPAD +
      (isSharedGarden ? SWITCHER_ROW_H : 0) +
      (isSharedGarden ? SWITCHER_SHARED_ACTIONS_H : 0) +
      (showCurrentGardenInviteList ? SWITCHER_INVITE_LIST_H : 0) +
      (otherSharedGardens.length > 0 ? otherSharedGardens.length * SWITCHER_ROW_H : (!isSharedGarden ? SWITCHER_HINT_H : 0)) +
      sharedGardenInvites.length * SWITCHER_INVITE_H +
      SWITCHER_CREATE_H,
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

  return (
  <View style={styles.container}>
    {isReadOnly && !isSharedGarden && (
      <View style={styles.readOnlyHeader}>
        <TouchableOpacity style={styles.readOnlyBackBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={20} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.readOnlyHeaderTitle} numberOfLines={1}>{viewedUsername}'s Garden</Text>
      </View>
    )}

    {!isReadOnly && !isEditing && (
      <>
        {showSharedGardensModal && (
          <Pressable style={styles.gardenSwitcherDismissZone} onPress={() => setShowSharedGardensModal(false)} />
        )}

        <View style={[styles.gardenSwitcherShell, showSharedGardensModal && styles.gardenSwitcherShellExpanded]}>
          <TouchableOpacity
            style={[styles.gardenSwitcherButton, showSharedGardensModal && styles.gardenSwitcherButtonExpanded]}
            onPress={() => setShowSharedGardensModal((prev) => !prev)}
            activeOpacity={0.9}
          >
            <Text style={styles.gardenSwitcherText} numberOfLines={1}>{isSharedGarden ? (viewedUsername || 'Garden') : 'Personal'}</Text>
            <Ionicons name={showSharedGardensModal ? "chevron-up" : "chevron-down"} size={14} color="#fff" />
          </TouchableOpacity>

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
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.gardenBinContent}>
                {isSharedGarden && (
                  <View style={styles.gardenBinGroup}>
                    <TouchableOpacity style={styles.gardenBinRow} onPress={openPersonalGarden} activeOpacity={0.9}>
                      <Text style={styles.gardenBinRowLabel} numberOfLines={1}>Personal</Text>
                    </TouchableOpacity>
                  </View>
                )}
                {otherSharedGardens.length ? (
                  otherSharedGardens.map((garden) => (
                    <View key={garden.id} style={styles.gardenBinGroup}>
                      <TouchableOpacity style={styles.gardenBinRow} onPress={() => openSharedGarden(garden)} activeOpacity={0.9}>
                        <Text style={styles.gardenBinRowLabel} numberOfLines={1}>{garden.name || 'Other'}</Text>
                      </TouchableOpacity>
                    </View>
                  ))
                ) : !isSharedGarden ? (
                  <Text style={styles.gardenBinHintText}>No other gardens yet.</Text>
                ) : null}

                {sharedGardenInvites.length ? (
                  sharedGardenInvites.map((invite) => (
                    <View key={invite.id} style={styles.gardenBinInviteCard}>
                      <Text style={styles.gardenBinRowLabel} numberOfLines={1}>{invite.gardenName || 'Other'}</Text>
                      <TouchableOpacity
                        style={styles.gardenBinAcceptButton}
                        onPress={() => handleAcceptSharedGardenInvite(invite)}
                        disabled={acceptingInviteId === invite.id}
                      >
                        <Text style={styles.gardenBinAcceptButtonText}>{acceptingInviteId === invite.id ? '...' : 'Join'}</Text>
                      </TouchableOpacity>
                    </View>
                  ))
                ) : null}

                {isSharedGarden && (
                  <View style={styles.gardenBinGroup}>
                    <TouchableOpacity
                      style={[styles.gardenBinCreateButton, styles.gardenBinAddPeopleButton]}
                      onPress={() => setExpandedInviteGardenId(showCurrentGardenInviteList ? null : sharedGardenId)}
                      activeOpacity={0.9}
                      disabled={!currentSharedGarden}
                    >
                      <Text style={styles.gardenBinCreateText}>Add People</Text>
                    </TouchableOpacity>

                    {showCurrentGardenInviteList && (
                      <View style={styles.gardenBinInviteList}>
                        {currentGardenInvitees.length ? (
                          currentGardenInvitees.map((user) => {
                            const targetId = user.id || user.uid;
                            const inviteKey = `${sharedGardenId}:${targetId}`;
                            return (
                              <View key={targetId} style={styles.gardenBinInviteRow}>
                                <Text style={styles.gardenBinInviteName}>{user.username || 'User'}</Text>
                                <TouchableOpacity
                                  style={styles.gardenBinInviteButton}
                                  onPress={() => handleSendSharedGardenInvite(currentSharedGarden, { ...user, id: targetId })}
                                  disabled={activeInviteKey === inviteKey}
                                >
                                  <Text style={styles.gardenBinInviteButtonText}>{activeInviteKey === inviteKey ? 'Sending...' : 'Invite'}</Text>
                                </TouchableOpacity>
                              </View>
                            );
                          })
                        ) : (
                          <Text style={styles.gardenBinHintText}>No available users to invite.</Text>
                        )}
                      </View>
                    )}

                    <TouchableOpacity
                      style={[styles.gardenBinCreateButton, styles.gardenBinLeaveButton, leavingGardenId === sharedGardenId && styles.sharedDangerMiniButtonDisabled]}
                      onPress={() => confirmLeaveSharedGarden(currentSharedGarden || { id: sharedGardenId, name: viewedUsername || 'this shared garden' })}
                      activeOpacity={0.9}
                      disabled={!currentSharedGarden || leavingGardenId === sharedGardenId}
                    >
                      <Text style={styles.gardenBinCreateText}>{leavingGardenId === sharedGardenId ? 'Leaving...' : 'Leave Garden'}</Text>
                    </TouchableOpacity>
                  </View>
                )}

                <TouchableOpacity style={styles.gardenBinCreateButton} onPress={handleCreateSharedGarden} disabled={creatingSharedGarden}>
                  <Text style={styles.gardenBinCreateText}>{creatingSharedGarden ? 'Creating...' : 'New Garden'}</Text>
                </TouchableOpacity>
              </ScrollView>
          </Animated.View>
        </View>
      </>
    )}

    {!isReadOnly && isEditing && (
      <TouchableOpacity style={styles.customizeFab} onPress={handleCustomizeGarden}>
        <Ionicons name="color-palette" size={19} color="#fff" />

          {/* Customization Modal */}
          <CustomizationScreen
            visible={showCustomization}
            onClose={() => setShowCustomization(false)}
            onSave={async (pageId, values) => {
              setCustomizations(prev => ({ ...prev, [pageId]: values }));
              if (isSharedGarden && sharedGardenId) {
                await saveSharedCustomizations(sharedGardenId, pageId, values);
              } else if (!isSharedGarden && auth.currentUser?.uid) {
                await savePersonalCustomizations(auth.currentUser.uid, pageId, values);
              }
            }}
            selectedPageId={currentPageId}
            customizations={customizations}
          />
      </TouchableOpacity>
    )}

    {!isReadOnly && isEditing && (
      <TouchableOpacity style={styles.removePageFab} onPress={handleRemoveCurrentPage}>
        <Ionicons name="trash" size={17} color="#fff" />
      </TouchableOpacity>
    )}

    {!isReadOnly && isEditing && (
      <TouchableOpacity style={styles.resetFab} onPress={handleResetPositions}>
        <Ionicons name="refresh" size={18} color="#fff" />
      </TouchableOpacity>
    )}

    {!isReadOnly && isEditing && (
      <TouchableOpacity style={styles.addPageSideFab} onPress={handleAddPage}>
        <Ionicons name="add" size={22} color="#fff" />
      </TouchableOpacity>
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
      scrollEnabled={!globalDragging}
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
        pointerEvents={drawerShouldShow ? 'auto' : 'none'}
        style={[
          styles.drawer,
          { bottom: -insets.bottom - 16 },
          !isReadOnly && isEditing && styles.drawerEditBox,
          !drawerShouldShow && styles.drawerHidden,
        ]}
        ref={drawerRef}
        collapsable={false}
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
          {drawerPlants.map(plant => (
            <View key={plant.id} style={styles.drawerPlantItem}>
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

      {!isReadOnly && drawerShouldShow && (
        // Outer view: handles pan translation (JS driver required for gesture)
        <Animated.View
          {...waterPanResponder.panHandlers}
          style={[
            styles.waterDropHandle,
            { transform: waterPan.getTranslateTransform() },
          ]}
        >
          {/* Inner view: handles opacity only — native driver, smooth */}
          <Animated.View style={{ opacity: waterDropOpacity, width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="water" size={22} color="#fff" />
          </Animated.View>
        </Animated.View>
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
        <Animated.View style={[styles.ghost, { left: draggedGhost.x, top: draggedGhost.y, transform: globalPan.getTranslateTransform() }]}>
          <PlantVisual plant={draggedGhost.plant} isDraggingHighlight={true} />
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fdfbf700' },
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  gardenSwitcherShell: {
    position: 'absolute',
    top: 54,
    right: 16,
    width: 156,
    maxWidth: '52%',
    borderRadius: 30,
    backgroundColor: 'rgba(66, 66, 66, 0.96)',
    zIndex: 60,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  gardenSwitcherShellExpanded: {
    width: 156,
    maxWidth: '52%',
    maxHeight: '66%',
  },
  gardenSwitcherButton: {
    width: '100%',
    height: 38,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  gardenSwitcherButtonExpanded: {
  },
  gardenSwitcherText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 14,
    marginRight: 6,
  },
  gardenSwitcherDismissZone: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 55,
  },
  gardenSwitcherPanel: {
    backgroundColor: 'transparent',
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
    paddingTop: 2,
    overflow: 'hidden',
  },
  gardenBinContent: {
    paddingHorizontal: 7,
    paddingBottom: 6,
    gap: 6,
  },
  gardenBinGroup: {
    gap: 4,
  },
  gardenBinRow: {
    minHeight: 40,
    borderRadius: 20,
    backgroundColor: '#666666',
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  gardenBinRowLabel: {
    flex: 1,
    fontSize: 14,
    color: '#fff',
    fontWeight: '700',
    marginRight: 10,
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
    justifyContent: 'center',
    paddingHorizontal: 12,
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
    fontSize: 14,
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
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
  pageDotsContainer: { position: 'absolute', bottom:10, left: 0, right: 0, alignItems: 'center', zIndex: 999999 },
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
    justifyContent: 'center',
    paddingTop: 54,
    paddingBottom: 14,
    paddingHorizontal: 20,
    backgroundColor: '#1a1836',
    borderBottomWidth: 1,
    borderBottomColor: '#2e2b5a',
  },
  storageHeaderTitle: {
    color: '#FFD700',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginHorizontal: 10,
    textShadowColor: 'rgba(255, 200, 0, 0.45)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
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
    shadowColor: '#000',
    shadowOffset: { width:10, height: 8 },
    shadowOpacity: 0.20,
    shadowRadius: 0,
    elevation: 8,
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
    backgroundColor: '#FF9F45',
    opacity: 0.95,
  },
  shelfHighlightRight: {
    position: 'absolute',
    top: 18,
    right: '6%',
    width: '38%',
    height: 16,
    borderRadius: 14,
    backgroundColor: '#FF9A3E',
    opacity: 0.94,
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
    height: 200,
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
    bottom: 38,
    left: 0,
    right: 0,
    height: 170,
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
    bottom: 26,
    right: 2,
    minWidth: 22,
    height: 16,
    borderRadius: 8,
    backgroundColor: 'rgba(167, 152, 125, 0.52)',
    borderWidth: 1.5,
    borderColor: 'rgba(167, 152, 125, 0.8)',
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 6,
  },
  contributorPotBadgeSelf: {
    backgroundColor: 'rgba(130, 110, 80, 0.75)',
    borderColor: 'rgba(130, 110, 80, 0.9)',
  },
  contributorPotBadgeText: {
    fontSize: 8,
    fontWeight: '900',
    color: '#FFF',
  },
  reviveHeartBadge: {
    position: 'absolute',
    left: 10,
    top: 0,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#ff426b',
    borderWidth: 1.5,
    borderColor: '#fe9898',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 4,
  },
  
  potLabel: { position: 'absolute', bottom: 30, minWidth: 24, minHeight: 24, justifyContent: 'center', alignItems: 'center', zIndex: 4 },

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
    bottom: 15,
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#2D8CFF',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 12000,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 12000,
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