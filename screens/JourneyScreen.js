import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Image, Alert, Animated, Easing } from "react-native";
import GoalActionButton from "../components/GoalActionButton";
import HapticTouchableOpacity from "../components/HapticTouchableOpacity";
import { GROWTH_BLUE, GROWTH_BLUE_SHADOW } from "../constants/GrowthTheme";
import { HapticType, triggerLightHaptic } from "../utils/haptics";
import CoinBadge from "../components/CoinBadge";
import CoinFlyReward, {
  CLAIM_HAPTIC_START_MS,
  COIN_COUNT_UP_DURATION_MS,
  getCoinFlyCount,
} from "../components/CoinFlyReward";
import Page from "../components/Page";
import { useFocusEffect } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../firebaseConfig";
import theme from "../theme";
import { cpShadow } from "../utils/shadows";
import FireStreakIcon from "../assets/Icons/FireStreakIcon";
import { getGoalTrophyRating, updateOverallScoreForUser } from "../utils/scoreUtils";
import { getScoredGoalsForUser } from "../utils/scoreUtils";
import { countCompletedDates } from "../utils/goalState";
import { useShopInventory } from "../components/ShopInventoryProvider";
import { claimJourneyReward } from "../utils/shopInventory";
import { useGoals } from "../components/GoalsStore";
import DailyQuestCard from "../components/DailyQuestCard";
import QuestLogSection from "../components/QuestLogSection";
import { claimQuestReward, claimQuestTotalMilestone, getQuestViewForUserData, recordQuestActivity, syncQuestState } from "../utils/questEngine";
import { COIN_REWARDS } from "../constants/ShopCatalog";

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
  return countCompletedDates(goal, goal?.logs || {});
}

function ProgressBar({ value, target }) {
  const ratio = target > 0 ? Math.min(1, value / target) : 0;
  return (
    <View style={styles.progressTrack}>
      <View style={[styles.progressFill, { width: `${ratio * 100}%` }]} />
    </View>
  );
}

export default function JourneyScreen({ route, navigation }) {
  const viewUserId = route?.params?.userId;
  const viewUsername = route?.params?.username || "User";
  const isReadOnly = Boolean(viewUserId);
  const targetUid = viewUserId || auth.currentUser?.uid;
  const insets = useSafeAreaInsets();
  const { coinBalance } = useShopInventory();
  const { goals } = useGoals();
  const [claimingRewardKey, setClaimingRewardKey] = useState(null);
  const [claimedRewards, setClaimedRewards] = useState({});
  const [flyReward, setFlyReward] = useState(null);
  const [questView, setQuestView] = useState({
    daily: [],
    weekly: [],
    milestones: [],
    questMilestones: [],
    questHistory: [],
  });
  const balanceAnchorRef = useRef(null);
  const containerRef = useRef(null);
  const claimOriginRefs = useRef({});
  const balancePulse = useRef(new Animated.Value(1)).current;
  const countUpAnim = useRef(new Animated.Value(0)).current;
  const [displayCoinBalance, setDisplayCoinBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [questStats, setQuestStats] = useState({ totalCompleted: 0 });
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

  const loadJourney = useCallback(async ({ silent = false } = {}) => {
    if (!targetUid) {
      setLoading(false);
      return;
    }

    if (!silent) {
      setLoading(true);
    }
    try {
      const uid = targetUid;
      const userRef = doc(db, "users", uid);
      const userSnap = await getDoc(userRef);
      const userData = userSnap.exists() ? userSnap.data() : {};
      setClaimedRewards(userData?.journeyRewardClaims || {});

      if (isReadOnly) {
        const viewedBalance = typeof userData.coinBalance === "number" ? userData.coinBalance : 0;
        setDisplayCoinBalance(viewedBalance);
        countUpAnim.setValue(viewedBalance);
      }

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

      const nextMetrics = {
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
      };

      setMetrics(nextMetrics);
      setQuestStats(userData?.questStats || { totalCompleted: 0 });

      let questState = null;
      if (isReadOnly) {
        questState = getQuestViewForUserData({
          metrics: nextMetrics,
          goals: allGoals,
          userData,
        });
      } else {
        await recordQuestActivity("journey");
        const refreshedSnap = await getDoc(userRef);
        const refreshedData = refreshedSnap.exists() ? refreshedSnap.data() : userData;
        questState = await syncQuestState({
          metrics: nextMetrics,
          goals: allGoals.length ? allGoals : goals,
          userData: refreshedData,
        });
        if (questState) {
          setClaimedRewards(refreshedData?.journeyRewardClaims || {});
          setQuestStats(refreshedData?.questStats || { totalCompleted: 0 });
        }
      }

      if (questState) {
        setQuestView(questState);
      }
    } catch (error) {
      console.error("Failed to load journey stats", error);
    } finally {
      setLoading(false);
    }
  }, [goals, isReadOnly, targetUid]);

  useEffect(() => {
    if (isReadOnly || flyReward) return;
    setDisplayCoinBalance(coinBalance);
    countUpAnim.setValue(coinBalance);
  }, [coinBalance, flyReward, countUpAnim, isReadOnly]);

  useEffect(() => {
    if (!flyReward || flyReward.fromBalance == null || flyReward.toBalance == null) {
      return undefined;
    }

    const { fromBalance, toBalance } = flyReward;
    countUpAnim.setValue(fromBalance);
    setDisplayCoinBalance(fromBalance);

    const listener = countUpAnim.addListener(({ value }) => {
      setDisplayCoinBalance(Math.round(value));
    });

    const animation = Animated.timing(countUpAnim, {
      toValue: toBalance,
      duration: COIN_COUNT_UP_DURATION_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    });

    animation.start(({ finished }) => {
      if (finished) {
        setDisplayCoinBalance(toBalance);
      }
    });

    return () => {
      countUpAnim.removeListener(listener);
      animation.stop();
    };
  }, [flyReward, countUpAnim]);

  const isRewardClaimed = useCallback(
    (claimKey) => !!claimedRewards[claimKey],
    [claimedRewards]
  );

  const measureBalanceTarget = useCallback(() => new Promise((resolve) => {
    balanceAnchorRef.current?.measureInWindow((x, y, w, h) => {
      resolve({ x: x + w / 2, y: y + h / 2 });
    });
  }), []);

  const playBalancePulse = useCallback(() => {
    balancePulse.setValue(1);
    Animated.sequence([
      Animated.timing(balancePulse, {
        toValue: 1.14,
        duration: 140,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.spring(balancePulse, {
        toValue: 1,
        friction: 5,
        tension: 180,
        useNativeDriver: true,
      }),
    ]).start();
  }, [balancePulse]);

  const toContainerCoords = useCallback((point) => new Promise((resolve) => {
    if (!point) {
      resolve(null);
      return;
    }
    containerRef.current?.measureInWindow((containerX, containerY) => {
      resolve({
        x: point.x - containerX,
        y: point.y - containerY,
      });
    });
  }), []);

  const claimHapticTimersRef = useRef([]);

  const clearClaimHaptics = useCallback(() => {
    claimHapticTimersRef.current.forEach(clearTimeout);
    claimHapticTimersRef.current = [];
  }, []);

  const playClaimHaptics = useCallback((amount) => {
    clearClaimHaptics();
    const count = getCoinFlyCount(amount);
    const interval = Math.max(
      40,
      Math.floor((COIN_COUNT_UP_DURATION_MS - CLAIM_HAPTIC_START_MS) / Math.max(count - 1, 1))
    );
    for (let i = 0; i < count; i += 1) {
      const timer = setTimeout(() => triggerLightHaptic(), CLAIM_HAPTIC_START_MS + i * interval);
      claimHapticTimersRef.current.push(timer);
    }
  }, [clearClaimHaptics]);

  const cancelFlyReward = useCallback((balanceBefore) => {
    clearClaimHaptics();
    setFlyReward(null);
    setDisplayCoinBalance(balanceBefore);
    countUpAnim.setValue(balanceBefore);
  }, [clearClaimHaptics, countUpAnim]);

  const triggerFlyReward = useCallback(async (amount, origin, balanceBefore) => {
    const endWindow = await measureBalanceTarget();
    const startBalance = typeof balanceBefore === "number" ? balanceBefore : coinBalance;

    if (!origin || !endWindow) {
      setDisplayCoinBalance(startBalance + amount);
      playBalancePulse();
      return;
    }

    const [start, end] = await Promise.all([
      toContainerCoords(origin),
      toContainerCoords(endWindow),
    ]);

    if (start && end) {
      setFlyReward({
        amount,
        start,
        end,
        fromBalance: startBalance,
        toBalance: startBalance + amount,
      });
    } else {
      setDisplayCoinBalance(startBalance + amount);
      playBalancePulse();
    }
  }, [coinBalance, measureBalanceTarget, playBalancePulse, toContainerCoords]);

  const finishFlyReward = useCallback(() => {
    setFlyReward(null);
    playBalancePulse();
  }, [playBalancePulse]);

  const startClaimFromOrigin = useCallback((claimKey, runner) => {
    const node = claimOriginRefs.current[claimKey];
    if (!node) {
      runner(null);
      return;
    }
    node.measureInWindow((x, y, w, h) => {
      runner({ x: x + w / 2, y: y + h / 2 });
    });
  }, []);

  const handleClaimReward = useCallback(async (claimKey, amount, source, label, origin) => {
    if (!auth.currentUser?.uid || claimingRewardKey || isRewardClaimed(claimKey)) return;

    setClaimingRewardKey(claimKey);
    const balanceBefore = coinBalance;
    playClaimHaptics(amount);
    const flyPromise = triggerFlyReward(amount, origin, balanceBefore);
    try {
      const result = await claimJourneyReward(claimKey, amount, source);
      if (result.claimed) {
        setClaimedRewards((prev) => ({ ...prev, [claimKey]: true }));
        await flyPromise;
      } else if (result.reason === "already_claimed") {
        setClaimedRewards((prev) => ({ ...prev, [claimKey]: true }));
        cancelFlyReward(balanceBefore);
      } else {
        cancelFlyReward(balanceBefore);
      }
    } catch (error) {
      cancelFlyReward(balanceBefore);
      console.error(`Failed to claim ${label} reward`, error);
      Alert.alert("Error", "Could not claim your coin reward. Try again.");
    } finally {
      setClaimingRewardKey(null);
    }
  }, [claimingRewardKey, cancelFlyReward, coinBalance, isRewardClaimed, playClaimHaptics, triggerFlyReward]);

  const handleCompleteGrowthGoal = useCallback((item, origin) => {
    const claimKey = `growth:${item.key}`;
    handleClaimReward(
      claimKey,
      COIN_REWARDS.JOURNEY_GROWTH_GOAL,
      "journey_growth",
      item.label,
      origin
    );
  }, [handleClaimReward]);

  const handleClaimQuest = useCallback((quest, origin) => {
    if (!quest?.canClaim) return;
    setClaimingRewardKey(quest.claimKey);
    const balanceBefore = coinBalance;
    playClaimHaptics(quest.coinReward);
    const flyPromise = triggerFlyReward(quest.coinReward, origin, balanceBefore);
    claimQuestReward({
      questId: quest.id,
      periodKey: quest.periodKey,
      amount: quest.coinReward,
      title: quest.title,
      cadence: quest.cadence,
    })
      .then(async (result) => {
        if (result.claimed || result.reason === "already_claimed") {
          setClaimedRewards((prev) => ({ ...prev, [quest.claimKey]: true }));
          if (result.claimed) {
            await flyPromise;
          } else {
            cancelFlyReward(balanceBefore);
          }
          await loadJourney({ silent: true });
        } else {
          cancelFlyReward(balanceBefore);
        }
      })
      .catch((error) => {
        cancelFlyReward(balanceBefore);
        console.error("Failed to claim quest reward", error);
        Alert.alert("Error", "Could not claim your quest reward. Try again.");
      })
      .finally(() => {
        setClaimingRewardKey(null);
      });
  }, [cancelFlyReward, coinBalance, loadJourney, playClaimHaptics, triggerFlyReward]);

  const handleClaimQuestMilestone = useCallback((milestone, origin) => {
    if (!milestone?.canClaim) return;
    setClaimingRewardKey(milestone.claimKey);
    const balanceBefore = coinBalance;
    playClaimHaptics(milestone.coinReward);
    const flyPromise = triggerFlyReward(milestone.coinReward, origin, balanceBefore);
    claimQuestTotalMilestone({
      milestone,
      title: `Complete ${milestone.target} quests`,
    })
      .then(async (result) => {
        if (result.claimed || result.reason === "already_claimed") {
          setClaimedRewards((prev) => ({ ...prev, [milestone.claimKey]: true }));
          if (result.claimed) {
            await flyPromise;
          } else {
            cancelFlyReward(balanceBefore);
          }
          await loadJourney({ silent: true });
        } else {
          cancelFlyReward(balanceBefore);
        }
      })
      .catch((error) => {
        cancelFlyReward(balanceBefore);
        console.error("Failed to claim quest milestone", error);
        Alert.alert("Error", "Could not claim your milestone reward. Try again.");
      })
      .finally(() => {
        setClaimingRewardKey(null);
      });
  }, [cancelFlyReward, coinBalance, loadJourney, playClaimHaptics, triggerFlyReward]);

  const onQuestClaimPress = useCallback((quest) => {
    startClaimFromOrigin(quest.claimKey, (origin) => {
      handleClaimQuest(quest, origin);
    });
  }, [handleClaimQuest, startClaimFromOrigin]);

  const onQuestMilestoneClaimPress = useCallback((milestone) => {
    startClaimFromOrigin(milestone.claimKey, (origin) => {
      handleClaimQuestMilestone(milestone, origin);
    });
  }, [handleClaimQuestMilestone, startClaimFromOrigin]);

  useFocusEffect(
    useCallback(() => {
      loadJourney();
    }, [loadJourney])
  );

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

  return (
    <Page>
      <View ref={containerRef} collapsable={false} style={styles.container}>
        <View style={styles.headerWrapper}>
          <View style={styles.headerContent}>
            <View style={styles.headerRow}>
              {isReadOnly ? (
                <>
                  <HapticTouchableOpacity
                    style={styles.readOnlyBackBtn}
                    onPress={() => navigation.goBack()}
                  >
                    <Ionicons name="chevron-back" size={24} color={theme.text} />
                  </HapticTouchableOpacity>
                  <Text style={[styles.headerTitle, styles.readOnlyHeaderTitle]} numberOfLines={1}>
                    {viewUsername}'s Journey
                  </Text>
                  <View style={styles.headerBalancePill}>
                    <CoinBadge amount={displayCoinBalance} size="md" />
                  </View>
                </>
              ) : (
                <>
                  <Text style={styles.headerTitle}>Journey</Text>
                  <Animated.View
                    ref={balanceAnchorRef}
                    collapsable={false}
                    style={[styles.headerBalancePill, { transform: [{ scale: balancePulse }] }]}
                  >
                    <CoinBadge amount={displayCoinBalance} size="md" />
                  </Animated.View>
                </>
              )}
            </View>
          </View>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.content,
            { paddingBottom: 120 + insets.bottom },
          ]}
          showsVerticalScrollIndicator={false}
        >
        <View style={styles.heroContainer}>
          <View style={styles.treeShowcaseOuter}>
            <View style={styles.treeShowcaseAbsolute}>
              <Image source={TREE_STAGES[treeStageIndex]} style={styles.treeImage} />
            </View>
          </View>
          <Image
            source={require("../assets/Tree/Tree_BG.png")}
            style={styles.heroBgImageRounded}
            resizeMode="cover"
          />
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
              <Ionicons name="leaf" size={13} color="#7d8a97" />
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
                const claimKey = `growth:${item.key}`;
                const isClaimed = isRewardClaimed(claimKey);
                const canClaim = item.done && !isClaimed;
                const isClaiming = claimingRewardKey === claimKey;
                return (
                  <View
                    key={item.key}
                    style={[
                      styles.nextGoalCardWrap,
                      isClaimed && { opacity: 0.55 },
                    ]}
                  >
                    <View
                      style={styles.nextGoalRow}
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
                      {isReadOnly ? (
                        isClaimed ? (
                          <Ionicons name="checkmark-circle" size={22} color="#7d8a97" />
                        ) : item.done ? (
                          <Text style={styles.readOnlyGrowthStatus}>Complete</Text>
                        ) : null
                      ) : (
                        <View
                          collapsable={false}
                          ref={(node) => {
                            claimOriginRefs.current[claimKey] = node;
                          }}
                        >
                          <GoalActionButton
                            onPress={() => {
                              startClaimFromOrigin(claimKey, (origin) => {
                                handleCompleteGrowthGoal(item, origin);
                              });
                            }}
                            disabled={!canClaim || isClaiming}
                            haptic={canClaim ? HapticType.MEDIUM : false}
                            backgroundColor={canClaim ? GROWTH_BLUE : '#b7c0c9'}
                            shadowColor={canClaim ? GROWTH_BLUE_SHADOW : '#9aa3ad'}
                            borderRadius={14}
                            size={40}
                            style={styles.completeGoalButtonWrap}
                            faceStyle={styles.completeGoalButton}
                          >
                            <Text style={styles.completeGoalButtonText}>
                              {isClaimed ? "Claimed" : isClaiming ? "..." : "Claim"}
                            </Text>
                          </GoalActionButton>
                        </View>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          ) : null}
            </View>
          </View>

      <View style={[styles.section, styles.insetX]}>
        <Text style={styles.sectionTitle}>Today's Quests</Text>
        <DailyQuestCard
          dailyQuests={questView.daily}
          weeklyQuests={questView.weekly}
          loading={loading}
          claimingKey={claimingRewardKey}
          claimOriginRefs={claimOriginRefs}
          onClaim={onQuestClaimPress}
          readOnly={isReadOnly}
        />
      </View>

      <View style={[styles.section, styles.insetX]}>
        <QuestLogSection
          questHistory={questView.questHistory}
          milestones={questView.milestones}
          questMilestones={questView.questMilestones}
          totalCompleted={safeNumber(questStats.totalCompleted)}
          claimingKey={claimingRewardKey}
          claimOriginRefs={claimOriginRefs}
          onClaimQuest={onQuestClaimPress}
          onClaimMilestone={onQuestMilestoneClaimPress}
          readOnly={isReadOnly}
        />
      </View>

      <View style={[styles.section, styles.insetX]}>
        <Text style={styles.sectionTitle}>Summary</Text>
        <View style={styles.sectionCard}>
          <View style={styles.appStreakRow}>
            <View style={styles.appStreakIconWrap}>
              <Image source={FireStreakIcon} style={styles.appStreakIcon} resizeMode="contain" />
            </View>
            <View style={styles.appStreakTextWrap}>
              <Text style={styles.appStreakLabel}>App streak</Text>
              <Text style={styles.appStreakValue}>
                {loading ? "—" : metrics.appStreak} {metrics.appStreak === 1 ? "day" : "days"}
              </Text>
            </View>
          </View>

          <View style={styles.summaryGrid}>
            <View style={styles.summaryTile}>
              <Text style={styles.summaryValue}>{safeNumber(questStats.totalCompleted)}</Text>
              <Text style={styles.summaryLabel}>Quests Done</Text>
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
        {!isReadOnly ? <CoinFlyReward reward={flyReward} onComplete={finishFlyReward} /> : null}
      </View>
    </Page>
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
    backgroundColor: GROWTH_BLUE_SHADOW,
    opacity: 0.32,
    zIndex: 0,
    shadowColor: GROWTH_BLUE_SHADOW,
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
  completeGoalButtonText: { color: "#FFF", fontSize: 15, fontWeight: "900", fontFamily: 'CeraRoundProDEMO-Black', letterSpacing: 0.1 },
  container: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  headerWrapper: {
    backgroundColor: "rgba(255,255,255,0.96)",
    borderRadius: 24,
    borderWidth: 0,
    borderColor: "#d9e6f4",
    ...cpShadow({ color: "#000000", offset: { width: 0, height: 6 }, opacity: 0.16, radius: 0, elevation: 3 }),
    marginTop: 8,
    marginBottom: 12,
  },
  headerContent: {
    paddingVertical: 0,
    paddingHorizontal: 0,
    paddingLeft: 16,
    paddingRight: 12,
    alignItems: "stretch",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    minHeight: 44,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "900",
    color: theme.text,
    fontFamily: "CeraRoundProDEMO-Black",
  },
  readOnlyBackBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f0f4f8",
    flexShrink: 0,
  },
  readOnlyHeaderTitle: {
    flex: 1,
    fontSize: 18,
    marginHorizontal: 8,
  },
  readOnlyGrowthStatus: {
    alignSelf: "center",
    marginLeft: 8,
    fontSize: 11,
    fontWeight: "800",
    color: "#7d8a97",
    fontFamily: "CeraRoundProDEMO-Black",
    flexShrink: 0,
  },
  headerBalancePill: {
    backgroundColor: "#fff",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  heroContainer: {
    borderRadius: 32,
    overflow: 'hidden',
    shadowColor: '#cdcdcd',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 4,
    marginBottom: 12,
  },
  heroBgImageRounded: {
    width: '100%',
    height: 520,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    overflow: 'hidden',
  },
  heroBgImage: {
    ...StyleSheet.absoluteFillObject,
  },
  content: {
    paddingBottom: 120,
  },
  insetX: {
    marginHorizontal: 0,
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
  treeShowcaseOuter: {
    position: 'relative',
    height: 0,
    zIndex: 2,
  },
  treeShowcaseAbsolute: {
    position: 'absolute',
    top: 60,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  treeShowcase: {},
  treeImage: {
    width: 340,
    height: 340,
    resizeMode: 'contain',
    zIndex: 2,
    marginBottom: 0,
  },
  section: {
    marginBottom: 18,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "900",
    color: theme.text,
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 1,
    fontFamily: 'CeraRoundProDEMO-Black',
  },
  progressFootMeta: {
    marginTop: 1,
    fontSize: 13,
    fontWeight: "900",
    color: theme.muted,
    fontFamily: 'CeraRoundProDEMO-Black',
    letterSpacing: 0.1,
  },
  growthLabel: {
    fontSize: 12,
    fontWeight: "900",
    color: theme.muted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 2,
    fontFamily: 'CeraRoundProDEMO-Black',
  },
  nextGoalsTitle: {
    fontSize: 13,
    fontWeight: "900",
    color: theme.text,
    marginBottom: 2,
    fontFamily: 'CeraRoundProDEMO-Black',
    letterSpacing: 0.1,
  },
  nextGoalLabel: {
    flex: 1,
    minWidth: 120,
    fontSize: 12,
    fontWeight: "900",
    color: theme.text,
    paddingBottom: 6,
    fontFamily: 'CeraRoundProDEMO-Black',
    letterSpacing: 0.1,
  },
  nextGoalValue: {
    fontSize: 12,
    fontWeight: "900",
    color: theme.text,
    paddingRight: 10,
    paddingBottom: 6,
    fontFamily: 'CeraRoundProDEMO-Black',
    letterSpacing: 0.1,
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
    fontFamily: 'CeraRoundProDEMO-Black',
    letterSpacing: 0.1,
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
    fontFamily: 'CeraRoundProDEMO-Black',
  },
  stageChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#f5f5f5",
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  stageChipText: {
    fontSize: 10,
    fontWeight: "900",
    color: "#7d8a97",
    fontFamily: 'CeraRoundProDEMO-Black',
    letterSpacing: 0.1,
  },
  progressHint: {
    marginTop: 6,
    fontSize: 11,
    fontWeight: "800",
    color: "#7d8a97",
    fontFamily: 'CeraRoundProDEMO-Black',
    letterSpacing: 0.1,
  },
  nextGoalsWrap: {
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#e8e8e8",
    paddingTop: 8,
    gap: 0,
  },
  nextGoalsTitle: {
    fontSize: 12,
    fontWeight: "900",
    color: theme.text,
    marginBottom: 2,
    fontFamily: 'CeraRoundProDEMO-Black',
    letterSpacing: 0.1,
  },
  nextGoalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "transparent",
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
  nextGoalLabel: {
    flex: 1,
    minWidth: 120,
    fontSize: 12,
    fontWeight: "900",
    color: "#000000",
    paddingBottom: 6,
    fontFamily: 'CeraRoundProDEMO-Black',
    letterSpacing: 0.1,
  },
  nextGoalValue: {
    fontSize: 10,
    fontWeight: "900",
    color: "#000000",
    paddingRight: 10,
    paddingBottom: 6,
    fontFamily: 'CeraRoundProDEMO-Black',
    letterSpacing: 0.1,
  },
  nextGoalMiniTrack: {
    width: "100%",
    height: 6,
    borderRadius: 999,
    backgroundColor: "#e0e0e0",
    overflow: "hidden",
  },
  nextGoalMiniFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: GROWTH_BLUE,
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
    fontFamily: 'CeraRoundProDEMO-Black',
    letterSpacing: 0.1,
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
    fontSize: 15,
    fontWeight: "900",
    color: theme.text,
    flex: 1,
    fontFamily: 'CeraRoundProDEMO-Black',
    letterSpacing: 0.1,
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
    fontFamily: 'CeraRoundProDEMO-Black',
    letterSpacing: 0.1,
  },
  trackStatusTextUnlocked: {
    color: "#2f8f3a",
  },
  trackDesc: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: "700",
    color: theme.text2,
    fontFamily: 'CeraRoundProDEMO-Black',
    letterSpacing: 0.1,
  },
  progressTrack: {
    marginTop: 8,
    height: 10,
    borderRadius: 999,
    backgroundColor: "#e0e0e0",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: GROWTH_BLUE,
  },
  trackMeta: {
    marginTop: 6,
    fontSize: 10,
    fontWeight: "800",
    color: theme.muted,
    fontFamily: 'CeraRoundProDEMO-Black',
    letterSpacing: 0.1,
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
    fontFamily: 'CeraRoundProDEMO-Black',
    letterSpacing: 0.1,
  },
  achievementClaimButtonWrap: {
    marginTop: 10,
    alignSelf: "flex-start",
    minWidth: 132,
  },
  achievementClaimButton: {
    height: 34,
    minWidth: 132,
    paddingHorizontal: 12,
  },
  achievementClaimButtonText: {
    color: "#1f2937",
    fontSize: 13,
    fontWeight: "900",
    fontFamily: "CeraRoundProDEMO-Black",
    letterSpacing: 0.1,
  },
  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  appStreakRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff4e8",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
    gap: 12,
  },
  appStreakIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },
  appStreakIcon: {
    width: 24,
    height: 24,
  },
  appStreakTextWrap: {
    flex: 1,
  },
  appStreakLabel: {
    fontSize: 12,
    fontWeight: "900",
    color: "#9a5b14",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    fontFamily: "CeraRoundProDEMO-Black",
  },
  appStreakValue: {
    marginTop: 2,
    fontSize: 22,
    fontWeight: "900",
    color: theme.text,
    fontFamily: "CeraRoundProDEMO-Black",
    letterSpacing: 0.1,
  },
  summaryTile: {
    width: "48%",
    backgroundColor: "#f5f5f5",
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  summaryValue: {
    fontSize: 18,
    fontWeight: "900",
    color: theme.text,
    fontFamily: 'CeraRoundProDEMO-Black',
    letterSpacing: 0.1,
  },
  summaryLabel: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: "800",
    color: "#7d8a97",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    fontFamily: 'CeraRoundProDEMO-Black',
  },
  summaryScoreRow: {
    marginTop: 10,
    backgroundColor: "#f5f5f5",
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
    color: "#7d8a97",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    fontFamily: 'CeraRoundProDEMO-Black',
  },
  summaryScoreValue: {
    fontSize: 18,
    fontWeight: "900",
    color: theme.text,
    fontFamily: 'CeraRoundProDEMO-Black',
    letterSpacing: 0.1,
  }
});
