import React, { useCallback, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Image, useWindowDimensions, Pressable, Alert } from "react-native";
import GoalActionButton from "../components/GoalActionButton";
import { useFocusEffect } from "@react-navigation/native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import { auth, db } from "../firebaseConfig";
import { theme } from "../theme";
import { getGoalTrophyRating, updateOverallScoreForUser } from "../utils/scoreUtils";
import { getScoredGoalsForUser } from "../utils/scoreUtils";

const ACHIEVEMENT_TRACKS = [
  {
    id: "create_1",
    title: "Seed Sower",
    description: "Create your first goal.",
    metric: "createdGoals",
    target: 1,
    icon: "leaf-outline",
    reward: "Cosmetic: Sprout Badge",
  },
  {
    id: "create_5",
    title: "Goal Architect",
    description: "Create 5 goals.",
    metric: "createdGoals",
    target: 5,
    icon: "layers-outline",
    reward: "Cosmetic: Builder Pot",
  },
  {
    id: "complete_10",
    title: "Momentum",
    description: "Log 10 completed goal-days.",
    metric: "completionDays",
    target: 10,
    icon: "checkmark-done-outline",
    reward: "Cosmetic: Lime Spark Trail",
  },
  {
    id: "streak_7",
    title: "Week Warrior",
    description: "Reach a 7-day app streak.",
    metric: "appStreak",
    target: 7,
    icon: "flame-outline",
    reward: "Cosmetic: Ember Nameplate",
  },
  {
    id: "score_250",
    title: "Rising Legend",
    description: "Reach an overall score of 250.",
    metric: "overallScore",
    target: 250,
    icon: "trophy-outline",
    reward: "Cosmetic: Aurora Frame",
  },
];

const COSMETIC_TRACKS = [
  { id: "cosm_pot_moss", name: "Moss Pot", metric: "createdGoals", target: 3, icon: "flower-outline" },
  { id: "cosm_frame_amber", name: "Amber Frame", metric: "completionDays", target: 20, icon: "diamond-outline" },
  { id: "cosm_badge_comet", name: "Comet Badge", metric: "overallScore", target: 400, icon: "sparkles-outline" },
  { id: "cosm_title_keeper", name: "Title: Garden Keeper", metric: "bestGoalStreak", target: 14, icon: "ribbon-outline" },
];

const TREE_STAGES = [
  require("../assets/Tree/Tree_1.png"),
  require("../assets/Tree/Tree_2.png"),
  require("../assets/Tree/Tree_3.png"),
  require("../assets/Tree/Tree_4.png"),
];

const HERO_BG_OFFSET_X = -2300;
const HERO_BG_OFFSET_Y = -2400;
const HERO_BG_SCALE = 0.3;

const METRIC_LABELS = {
  createdGoals: "Goals created",
  completedGoals: "Goals completed",
  completionDays: "Completed days",
  appStreak: "App streak",
  overallScore: "Overall score",
  bestGoalStreak: "Best goal streak",
  silverGoals: "Silver goals",
  goldGoals: "Gold goals",
  platinumGoals: "Platinum goals",
};

const TREE_STAGE_REQUIREMENTS = [
  {
    name: "Tree 1 - Sprout",
    requirements: {},
  },
  {
    name: "Tree 2 - Growing",
    requirements: {
      completedGoals: 1,
      createdGoals: 2,
      completionDays: 6,
      appStreak: 3,
      silverGoals: 1,
    },
  },
  {
    name: "Tree 3 - Thriving",
    requirements: {
      completedGoals: 3,
      createdGoals: 5,
      completionDays: 16,
      appStreak: 7,
      overallScore: 250,
      goldGoals: 1,
    },
  },
  {
    name: "Tree 4 - Legendary",
    requirements: {
      completedGoals: 5,
      createdGoals: 8,
      completionDays: 30,
      appStreak: 12,
      overallScore: 500,
      bestGoalStreak: 10,
      platinumGoals: 1,
    },
  },
];

function safeNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function countGoalCompletionDays(goal) {
  const logs = goal?.logs || {};
  const kind = goal?.kind || goal?.type || "completion";

  if (kind === "completion") {
    return Object.values(logs.completion || {}).filter((entry) => entry?.done).length;
  }

  if (kind === "numeric") {
    const target = safeNumber(goal?.measurable?.target || goal?.target || 1);
    return Object.values(logs.numeric || {}).filter((entry) => safeNumber(entry?.value) >= target).length;
  }

  if (kind === "timer") {
    const targetSeconds = safeNumber(goal?.timer?.targetSeconds || 0);
    return Object.values(logs.timer || {}).filter((entry) => safeNumber(entry?.seconds) >= targetSeconds).length;
  }

  if (kind === "checklist") {
    const itemCount = Array.isArray(goal?.checklist?.items) ? goal.checklist.items.length : 0;
    if (!itemCount) return 0;
    return Object.values(logs.checklist || {}).filter((entry) => (entry?.checkedIds || []).length >= itemCount).length;
  }

  if (kind === "flex") {
    const total = safeNumber(logs?.flex?.total);
    const target = safeNumber(goal?.flex?.target || 0);
    return total >= target && target > 0 ? 1 : 0;
  }

  return 0;
}

function ProgressBar({ value, target }) {
  const ratio = target > 0 ? Math.min(1, value / target) : 0;
  return (
    <View style={styles.progressTrack}>
      <View style={[styles.progressFill, { width: `${ratio * 100}%` }]} />
    </View>
  );
}

export default function JourneyScreen() {
  // Track which growth goals have been completed in this session
  const [completedGrowthGoals, setCompletedGrowthGoals] = useState([]);
  // Handler for completing a growth goal (stub)
  const handleCompleteGrowthGoal = (item) => {
    setCompletedGrowthGoals((prev) => [...prev, item.key]);
    // TODO: Implement actual completion logic for growth goals
    // For now, just show an alert
    Alert.alert('Complete Goal', `Marked "${item.label}" as complete!`);
  };
  const { height: screenHeight } = useWindowDimensions();
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState({
    createdGoals: 0,
    completedGoals: 0,
    completionDays: 0,
    appStreak: 0,
    overallScore: 0,
    bestGoalStreak: 0,
    silverGoals: 0,
    goldGoals: 0,
    platinumGoals: 0,
  });

  const loadJourney = useCallback(async () => {
    if (!auth.currentUser?.uid) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const uid = auth.currentUser.uid;
      const userRef = doc(db, "users", uid);
      const userSnap = await getDoc(userRef);
      const userData = userSnap.exists() ? userSnap.data() : {};

      // Fetch all goals (personal + shared)
      const allGoals = await getScoredGoalsForUser(uid);

      const overallScore = await updateOverallScoreForUser(uid);
      const completionByGoal = allGoals.map((goal) => ({
        goal,
        completedDays: countGoalCompletionDays(goal),
      }));

      const completionDays = completionByGoal.reduce((sum, item) => sum + item.completedDays, 0);
      const completedGoals = completionByGoal.filter((item) => item.completedDays > 0).length;

      const trophyCounts = completionByGoal.reduce(
        (acc, item) => {
          if (item.completedDays <= 0) return acc;
          const rating = getGoalTrophyRating(item.goal);
          if (rating === "platinum") acc.platinumGoals += 1;
          if (rating === "gold" || rating === "platinum") acc.goldGoals += 1;
          if (rating === "silver" || rating === "gold" || rating === "platinum") acc.silverGoals += 1;
          return acc;
        },
        { silverGoals: 0, goldGoals: 0, platinumGoals: 0 }
      );

      // Check if user currently has a silver goal in any garden
      const hasSilverGoal = allGoals.some((goal) => getGoalTrophyRating(goal) === "silver");

      const bestGoalStreak = allGoals.reduce((max, goal) => Math.max(max, safeNumber(goal?.longestStreak)), 0);

      setMetrics({
        createdGoals: allGoals.length,
        completedGoals,
        completionDays,
        appStreak: safeNumber(userData?.streakCount),
        overallScore,
        bestGoalStreak,
        silverGoals: trophyCounts.silverGoals,
        goldGoals: trophyCounts.goldGoals,
        platinumGoals: trophyCounts.platinumGoals,
        hasSilverGoal,
      });
    } catch (error) {
      console.error("Failed to load journey stats", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadJourney();
    }, [loadJourney])
  );

  const unlockedAchievements = useMemo(() => {
    return ACHIEVEMENT_TRACKS.filter((item) => safeNumber(metrics[item.metric]) >= item.target);
  }, [metrics]);

  const unlockedCosmetics = useMemo(() => {
    return COSMETIC_TRACKS.filter((item) => safeNumber(metrics[item.metric]) >= item.target);
  }, [metrics]);

  const treeStageIndex = useMemo(() => {
    let highestUnlocked = 0;

    for (let i = 1; i < TREE_STAGE_REQUIREMENTS.length; i += 1) {
      const req = TREE_STAGE_REQUIREMENTS[i].requirements;
      const meetsStage = Object.entries(req).every(([metricKey, target]) => safeNumber(metrics[metricKey]) >= target);
      if (!meetsStage) break;
      highestUnlocked = i;
    }

    return highestUnlocked;
  }, [metrics]);

  const nextTreeStage = useMemo(() => {
    return treeStageIndex < TREE_STAGE_REQUIREMENTS.length - 1 ? TREE_STAGE_REQUIREMENTS[treeStageIndex + 1] : null;
  }, [treeStageIndex]);

  const nextStageChecklist = useMemo(() => {
    if (!nextTreeStage) return [];

    return Object.entries(nextTreeStage.requirements).map(([metricKey, target]) => {
      const value = safeNumber(metrics[metricKey]);
      return {
        key: metricKey,
        label: METRIC_LABELS[metricKey] || metricKey,
        value,
        target,
        done: value >= target,
      };
    });
  }, [metrics, nextTreeStage]);

  const nextStageProgress = useMemo(() => {
    if (!nextStageChecklist.length) return 1;

    const ratioSum = nextStageChecklist.reduce((sum, item) => sum + Math.min(1, item.value / item.target), 0);
    return ratioSum / nextStageChecklist.length;
  }, [nextStageChecklist]);

  const heroHeight = Math.max(340, Math.round(screenHeight * 0.62));

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={[styles.heroScene, { height: heroHeight }]}>
        <Image
          source={require("../assets/Tree/Tree_BG.png")}
          style={[
            styles.heroBgImage,
            {
              transform: [
                { scale: HERO_BG_SCALE },
                { translateX: HERO_BG_OFFSET_X },
                { translateY: HERO_BG_OFFSET_Y },
              ],
            },
          ]}
          resizeMode="cover"
        />
        <View style={styles.headerSpacer} />

        <View style={[styles.headerCard, styles.insetX]}>
          <Text style={styles.headerTitle}>Journey</Text>
        </View>

        <View style={styles.treeShowcase}>
          <View style={styles.treeGlow} />
          <Image source={TREE_STAGES[treeStageIndex]} style={styles.treeImage} resizeMode="contain" />
        </View>
      </View>

      <View style={[styles.section, styles.insetX]}>
        <Text style={styles.sectionTitle}>Garden Growth</Text>
        <View style={styles.progressCard}>
          <View style={styles.growthHeaderRow}>
            <View>
              <Text style={styles.growthLabel}>Current Stage</Text>
              <Text style={styles.progressFootMeta}>{TREE_STAGE_REQUIREMENTS[treeStageIndex].name}</Text>
            </View>
            <View style={styles.stageChip}>
              <Ionicons name="leaf" size={13} color="#3d6f46" />
              <Text style={styles.stageChipText}>Tree {treeStageIndex + 1}/4</Text>
            </View>
          </View>
          <ProgressBar value={nextStageProgress * 100} target={100} />
          <Text style={styles.progressHint}>
            {nextTreeStage
              ? `${Math.round(nextStageProgress * 100)}% to ${nextTreeStage.name}`
              : "Your tree is fully grown"}
          </Text>
          <Text style={styles.progressHint}>Complete goals and raise their trophy levels to evolve the tree.</Text>

          {nextTreeStage ? (
            <View style={styles.nextGoalsWrap}>
              <Text style={styles.nextGoalsTitle}>Next Growth Goals</Text>
              {nextStageChecklist.map((item) => {
                const isCompleted = item.done || completedGrowthGoals.includes(item.key);
                return (
                  <View
                    key={item.key}
                    style={[
                      styles.nextGoalCardWrap,
                      completedGrowthGoals.includes(item.key) && { opacity: 0.4 },
                    ]}
                  >
                    <View
                      style={[
                        styles.nextGoalRow,
                        (item.done || completedGrowthGoals.includes(item.key)) && styles.nextGoalRowDone,
                      ]}
                    >
                      <View style={{ flex: 1, flexDirection: 'column', justifyContent: 'center' }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 2 }}>
                          <Text style={styles.nextGoalLabel}>{item.label}</Text>
                          <Text style={styles.nextGoalValue}>
                            {item.value}/{item.target}
                          </Text>
                        </View>
                        <View style={styles.nextGoalMiniTrackOuter}>
                          <View
                            style={[
                              styles.nextGoalMiniTrack,
                              { width: '100%' },
                            ]}
                          >
                            <View
                              style={[
                                styles.nextGoalMiniFill,
                                { width: `${Math.min(100, Math.round((item.value / item.target) * 100))}%` },
                              ]}
                            />
                          </View>
                        </View>
                      </View>
                      <GoalActionButton
                        onPress={() => handleCompleteGrowthGoal(item)}
                        disabled={!item.done || completedGrowthGoals.includes(item.key)}
                        backgroundColor={item.done && !completedGrowthGoals.includes(item.key) ? '#59d700' : '#b7c0c9'}
                        shadowColor={item.done && !completedGrowthGoals.includes(item.key) ? '#4aa93a' : '#b7c0c9'}
                        borderRadius={14}
                        size={40}
                        style={styles.completeGoalButtonWrap}
                        faceStyle={styles.completeGoalButton}
                      >
                        <Text style={styles.completeGoalButtonText}>Complete</Text>
                      </GoalActionButton>
                    </View>
                  </View>
                );
              })}
            </View>
          ) : null}
          
        </View>
      </View>

      <View style={[styles.section, styles.insetX]}>
        <Text style={styles.sectionTitle}>Achievements</Text>
        <View style={styles.sectionCard}>
          {loading ? <Text style={styles.helper}>Loading progress...</Text> : null}
          {ACHIEVEMENT_TRACKS.map((item) => {
            const value = safeNumber(metrics[item.metric]);
            const unlocked = value >= item.target;
            return (
              <View key={item.id} style={[styles.trackRow, unlocked && styles.trackRowUnlocked]}>
                <View style={[styles.trackIconWrap, unlocked && styles.trackIconWrapUnlocked]}>
                  <Ionicons name={item.icon} size={20} color={unlocked ? "#1f7a1f" : "#6f8294"} />
                </View>
                <View style={styles.trackBody}>
                  <View style={styles.trackTopRow}>
                    <Text style={styles.trackTitle}>{item.title}</Text>
                    <View style={[styles.trackStatusPill, unlocked && styles.trackStatusPillUnlocked]}>
                      <Text style={[styles.trackStatusText, unlocked && styles.trackStatusTextUnlocked]}>
                        {unlocked ? "Unlocked" : "In progress"}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.trackDesc}>{item.description}</Text>
                  <ProgressBar value={value} target={item.target} />
                  <View style={styles.trackMetaRow}>
                    <Text style={styles.trackMeta}>{value}/{item.target}</Text>
                    <Text style={styles.trackReward}>{item.reward}</Text>
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      </View>

      <View style={[styles.section, styles.insetX]}>
        <Text style={styles.sectionTitle}>Summary</Text>
        <View style={styles.sectionCard}>
          <View style={styles.summaryGrid}>
            <View style={styles.summaryTile}>
              <Text style={styles.summaryValue}>{unlockedAchievements.length}/{ACHIEVEMENT_TRACKS.length}</Text>
              <Text style={styles.summaryLabel}>Achievements</Text>
            </View>
            <View style={styles.summaryTile}>
              <Text style={styles.summaryValue}>{unlockedCosmetics.length}/{COSMETIC_TRACKS.length}</Text>
              <Text style={styles.summaryLabel}>Cosmetics</Text>
            </View>
            <View style={styles.summaryTile}>
              <Text style={styles.summaryValue}>{metrics.completedGoals}</Text>
              <Text style={styles.summaryLabel}>Completed Goals</Text>
            </View>
            <View style={styles.summaryTile}>
              <Text style={styles.summaryValue}>{metrics.platinumGoals}</Text>
              <Text style={styles.summaryLabel}>Platinum Goals</Text>
            </View>
          </View>

          <View style={styles.summaryScoreRow}>
            <Text style={styles.summaryScoreLabel}>Overall score</Text>
            <Text style={styles.summaryScoreValue}>{metrics.overallScore}</Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  completeGoalButtonWrap: {
    minWidth: 90,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
    flexShrink: 0,
  },
  completeGoalButtonShadow: {
    position: 'absolute',
    top: 4,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 14,
    backgroundColor: '#4aa93a',
    opacity: 0.32,
    zIndex: 0,
    shadowColor: '#2e5d1a',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 4,
  },
  
  completeGoalButton: {
    height: 36,
    minWidth: 90,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 0,
    // backgroundColor, shadow, and zIndex removed to let GoalActionButton handle them
  },
  completeGoalButtonDisabled: { opacity: 0.6 },
  completeGoalButtonText: { color: "#FFF", fontSize: 15, fontWeight: "900" },
  container: {
    flex: 1,
    backgroundColor: "#226B4B",
  },
  heroBgImage: {
    ...StyleSheet.absoluteFillObject,
  },
  content: {
    paddingBottom: 112,
  },
  insetX: {
    marginHorizontal: 16,
  },
  headerSpacer: {
    height: 65,
  },
  headerCard: {
    backgroundColor: "rgba(255,255,255,0.96)",
    borderRadius: 24,
    paddingHorizontal: 14,
    paddingVertical: 12,
    shadowColor: "#4c6782",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.16,
    shadowRadius: 0,
    elevation: 3,
    marginBottom: 12,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "900",
    color: theme.text,
  },
  nextGoalCardWrap: {
    backgroundColor: "#f5f5f5",
    borderRadius: 28, // match progressCard
    marginBottom: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    shadowColor: '#cdcdcd',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 2,
  },
  heroScene: {
    position: "relative",
    overflow: "hidden",
    marginBottom: 10,
  },
  treeShowcase: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    bottom: 40,
  },
  treeGlow: {
    position: "absolute",
    width: 230,
    height: 230,
    borderRadius: 999,
    backgroundColor: "rgba(182, 252, 201, 0)",
    top: 34,
  },
  treeImage: {
    width: "100%",
    height: "100%",
    marginTop: -100,
  },
  section: {
    marginBottom: 18,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "900",
    color: "#111111",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  progressCard: {
    backgroundColor: "#ffffff",
    borderRadius: 28,
    paddingHorizontal: 14,
    paddingVertical: 14,
    shadowColor: "#cdcdcd",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 2,
  },
  progressFootMeta: {
    marginTop: 1,
    fontSize: 12,
    fontWeight: "900",
    color: "#7d8a97",
  },
  growthHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  growthLabel: {
    fontSize: 11,
    fontWeight: "900",
    color: "#7d8a97",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 2,
  },
  stageChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#eaf7e9",
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  stageChipText: {
    fontSize: 10,
    fontWeight: "900",
    color: "#3d6f46",
  },
  progressHint: {
    marginTop: 6,
    fontSize: 11,
    fontWeight: "800",
    color: "#7d8a97",
  },
  nextGoalsWrap: {
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#e6edf3",
    paddingTop: 8,
    gap: 0,
  },
  nextGoalsTitle: {
    fontSize: 12,
    fontWeight: "900",
    color: theme.text,
    marginBottom: 2,
  },
  nextGoalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#f5f8fb",
    borderRadius: 12,
    paddingHorizontal: 0,
    paddingLeft: 8,
    paddingVertical: 0,
    marginBottom: 0,
  },
  nextGoalMiniTrackOuter: {
    marginTop: 2,
    marginBottom: 0,
    marginRight: 10,
  },
  nextGoalRowDone: {
    backgroundColor: "#eff9ed",
  },
  nextGoalLabel: {
    flex: 1,
    minWidth: 120,
    fontSize: 12,
    fontWeight: "900",
    color: "#000000",
    paddingBottom: 6,
  },
  nextGoalValue: {
    fontSize: 10,
    fontWeight: "900",
    color: "#000000",
    paddingRight: 10,
    paddingBottom: 6,
  },
  nextGoalMiniTrack: {
    width: "100%",
    height: 6,
    borderRadius: 999,
    backgroundColor: "#dde7f1",
    overflow: "hidden",
  },
  nextGoalMiniFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: "#59d700",
  },
  sectionCard: {
    backgroundColor: "#ffffff",
    borderRadius: 24,
    padding: 14,
    shadowColor: "#cdcdcd",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 2,
  },
  helper: {
    fontSize: 12,
    fontWeight: "800",
    color: "#7d8a97",
    marginBottom: 4,
  },
  trackRow: {
    flexDirection: "row",
    gap: 10,
    borderRadius: 18,
    padding: 12,
    marginBottom: 8,
    backgroundColor: "#f5f8fb",
    alignItems: "flex-start",
  },
  trackRowUnlocked: {
    backgroundColor: "#f5fff1",
  },
  trackBody: {
    flex: 1,
  },
  trackIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#eaf0f7",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  trackIconWrapUnlocked: {
    backgroundColor: "#e6f7e0",
  },
  trackTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  trackTitle: {
    fontSize: 13,
    fontWeight: "900",
    color: theme.text,
    flex: 1,
  },
  trackStatusPill: {
    backgroundColor: "#eaf0f7",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  trackStatusPillUnlocked: {
    backgroundColor: "#e6f7e0",
  },
  trackStatusText: {
    fontSize: 10,
    fontWeight: "900",
    color: "#6b7f93",
  },
  trackStatusTextUnlocked: {
    color: "#2f8f3a",
  },
  trackDesc: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: "700",
    color: theme.text2,
  },
  progressTrack: {
    marginTop: 8,
    height: 10,
    borderRadius: 999,
    backgroundColor: "#e5edf5",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: "#59d700",
  },
  trackMeta: {
    marginTop: 6,
    fontSize: 10,
    fontWeight: "800",
    color: theme.muted,
  },
  trackMetaRow: {
    marginTop: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  trackReward: {
    fontSize: 10,
    fontWeight: "900",
    color: "#3b5176",
    flex: 1,
    textAlign: "right",
  },
  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  summaryTile: {
    width: "48%",
    backgroundColor: "#f5f8fb",
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: "900",
    color: theme.text,
  },
  summaryLabel: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: "800",
    color: "#7d8a97",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  summaryScoreRow: {
    marginTop: 10,
    backgroundColor: "#edf3fa",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  summaryScoreLabel: {
    fontSize: 12,
    fontWeight: "900",
    color: "#56708a",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  summaryScoreValue: {
    fontSize: 18,
    fontWeight: "900",
    color: theme.text,
  }
});
