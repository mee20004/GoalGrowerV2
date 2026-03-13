import React, { useMemo, useState, useEffect } from "react";
import { View, Text, StyleSheet, Pressable, FlatList, ActivityIndicator, Alert, Image } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import Page from "../components/Page";
import { theme } from "../theme";
import { toKey, isScheduledOn, isWithinActiveRange } from "../components/GoalsStore";
import { ACHIEVEMENTS } from "../AchievementsStore";
import { PLANT_ASSETS } from "../constants/PlantAssets";

// Added 'increment' to the list of imports - essential for plant growth!
import { 
  collection, 
  query, 
  onSnapshot, 
  doc, 
  updateDoc, 
  getDoc, 
  getDocs,
  setDoc,
  arrayUnion, 
  increment,
  where,
  runTransaction
} from "firebase/firestore";
import { auth, db } from "../firebaseConfig";
import { updateOverallScoresForSharedGardenMembers } from "../utils/scoreUtils";

const STORAGE_PAGE_ID = "storage";
const STORAGE_SHELF_COUNT = 10;
const STORAGE_SHELF_SLOTS = 4;
const MULTI_USER_MIN_WATERERS = 2;
const OTHER_GARDEN_GOAL_COLOR = "#e0ceae";

function getRequiredContributors(goal) {
  const requiredContributors = Number(goal?.requiredContributors);
  return Number.isFinite(requiredContributors) && requiredContributors >= 2
    ? Math.floor(requiredContributors)
    : MULTI_USER_MIN_WATERERS;
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatSchedule(goal) {
  const schedule = goal?.schedule;
  if (!schedule) return "No schedule";
  if (schedule.type === "everyday") return "Every day";
  if (schedule.type === "weekdays") return "Weekdays";
  if (schedule.type === "days") {
    const labels = (schedule.days || []).map((day) => DAY_LABELS[day]).filter(Boolean);
    return labels.length ? labels.join(", ") : "Custom days";
  }
  return "Custom schedule";
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

function getPlantPreviewAsset(goal) {
  const total = Number(goal?.totalCompletions) || 0;

  let stage = "stage1";
  if (total > 30) stage = "stage4";
  else if (total > 15) stage = "stage3";
  else if (total > 5) stage = "stage2";

  const { status } = getPlantHealthState(goal);
  const species = goal?.plantSpecies || (goal?.type !== "completion" && goal?.type !== "quantity" ? goal?.type : "fern");

  return (
    PLANT_ASSETS[species]?.[stage]?.[status] ||
    PLANT_ASSETS[species]?.[stage]?.alive ||
    PLANT_ASSETS.fern?.stage1?.alive
  );
}

function Chip({ label, active, onPress }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

function isGoalDoneForDate(goal, dateKey) {
  if (goal.type === "completion") {
    const isSharedMultiUser = !!goal?.multiUserWateringEnabled && goal?.gardenType === "shared";
    if (isSharedMultiUser) {
      const usersMap = goal?.logs?.completion?.[dateKey]?.users || {};
      const uniqueCount = Object.keys(usersMap).filter((userId) => !!usersMap[userId]).length;
      return uniqueCount >= getRequiredContributors(goal);
    }
    return !!goal.logs?.completion?.[dateKey]?.done;
  }

  return (goal.logs?.quantity?.[dateKey]?.value ?? 0) >= (goal.measurable?.target ?? 0);
}

function parseISODateAtStart(value) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setHours(0, 0, 0, 0);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isGoalFullyCompleted(goal, today = new Date()) {
  const completionType = goal?.completionCondition?.type || "none";
  const totalCompletions = Number(goal?.totalCompletions) || 0;
  const targetAmount = Number(goal?.completionCondition?.targetAmount) || 0;

  const todayStart = new Date(today);
  todayStart.setHours(0, 0, 0, 0);

  const endDate = parseISODateAtStart(goal?.completionCondition?.endDate);
  const reachedEndDate = !!endDate && todayStart.getTime() > endDate.getTime();
  const reachedEndAmount = targetAmount > 0 && totalCompletions >= targetAmount;

  if (completionType === "date") return reachedEndDate;
  if (completionType === "amount") return reachedEndAmount;
  if (completionType === "both") return reachedEndDate && reachedEndAmount;
  return false;
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

export default function GoalsScreen({ navigation }) {
  const [dbGoals, setDbGoals] = useState([]);
  const [sharedGoals, setSharedGoals] = useState([]);
  const [layoutByGoalId, setLayoutByGoalId] = useState({});
  const [sharedGardenNameById, setSharedGardenNameById] = useState({});
  const [gardenFilter, setGardenFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const uid = auth.currentUser?.uid;

  const streak = useMemo(() => {
    if (!goal || typeof getStreak !== "function") return 0;
    return getStreak(goal, dateKey);
  }, [goal, dateKey, getStreak]);

  useEffect(() => {
    if (!uid) {
      setDbGoals([]);
      setLoading(false);
      return undefined;
    }

    setLoading(true);
    const goalsRef = collection(db, "users", uid, "goals");
    const q = query(goalsRef);
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const fetchedGoals = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setDbGoals(fetchedGoals);
        setLoading(false);
      },
      (error) => {
        if (error?.code !== "permission-denied" || auth.currentUser?.uid === uid) {
          console.error("Error fetching goals:", error);
        }
        setDbGoals([]);
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, [uid]);

  useEffect(() => {
    if (!uid) {
      setSharedGardenNameById({});
      setSharedGoals([]);
      return undefined;
    }

    const layoutUnsubs = new Map();
    const layoutByGarden = new Map();

    const emitSharedGoals = () => {
      const merged = [];
      layoutByGarden.forEach((goals) => {
        merged.push(...goals);
      });
      setSharedGoals(merged);
    };

    const unsubscribe = onSnapshot(
      query(collection(db, "sharedGardens"), where("memberIds", "array-contains", uid)),
      (snapshot) => {
        const next = {};
        const activeGardenIds = new Set();

        snapshot.forEach((gardenDoc) => {
          const data = gardenDoc.data() || {};
          const gardenId = gardenDoc.id;
          activeGardenIds.add(gardenId);
          next[gardenId] = data.name || "Shared Garden";

          if (!layoutUnsubs.has(gardenId)) {
            const unsubLayout = onSnapshot(
              collection(db, "sharedGardens", gardenId, "layout"),
              (layoutSnap) => {
                const goalsForGarden = layoutSnap.docs.map((layoutDoc) => {
                  const layoutData = layoutDoc.data() || {};
                  const shelfPosition = layoutData.shelfPosition || (layoutData.shelfName
                    ? {
                        pageId: layoutData.pageId || "default",
                        shelfName: layoutData.shelfName,
                        slotIndex: Number(layoutData.slotIndex) || 0,
                      }
                    : null);

                  return {
                    id: layoutDoc.id,
                    ...layoutData,
                    shelfPosition,
                    gardenType: "shared",
                    sharedGardenId: gardenId,
                    gardenId: gardenId,
                    _listKey: `${gardenId}_${layoutDoc.id}`,
                  };
                });

                layoutByGarden.set(gardenId, goalsForGarden);
                emitSharedGoals();
              },
              (error) => {
                if (error?.code !== "permission-denied" || auth.currentUser?.uid === uid) {
                  console.error("Error fetching shared garden goals:", error);
                }
                layoutByGarden.delete(gardenId);
                emitSharedGoals();
              }
            );

            layoutUnsubs.set(gardenId, unsubLayout);
          }
        });

        Array.from(layoutUnsubs.keys()).forEach((gardenId) => {
          if (!activeGardenIds.has(gardenId)) {
            const unsubLayout = layoutUnsubs.get(gardenId);
            unsubLayout?.();
            layoutUnsubs.delete(gardenId);
            layoutByGarden.delete(gardenId);
          }
        });

        emitSharedGoals();
        setSharedGardenNameById(next);
      },
      (error) => {
        if (error?.code !== "permission-denied" || auth.currentUser?.uid === uid) {
          console.error("Error fetching shared gardens:", error);
        }
        setSharedGardenNameById({});
        setSharedGoals([]);
      }
    );

    return () => {
      unsubscribe();
      layoutUnsubs.forEach((unsubLayout) => unsubLayout());
      layoutUnsubs.clear();
      layoutByGarden.clear();
    };
  }, [uid]);

  useEffect(() => {
    if (!uid) {
      setLayoutByGoalId({});
      return undefined;
    }

    const layoutRef = collection(db, "users", uid, "gardenLayout");
    const unsubscribe = onSnapshot(
      layoutRef,
      (snapshot) => {
        const nextLayout = {};
        snapshot.forEach((layoutDoc) => {
          nextLayout[layoutDoc.id] = layoutDoc.data()?.shelfPosition || null;
        });
        setLayoutByGoalId(nextLayout);
      },
      (error) => {
        if (error?.code !== "permission-denied" || auth.currentUser?.uid === uid) {
          console.error("Error fetching garden layout:", error);
        }
        setLayoutByGoalId({});
      }
    );
    return () => unsubscribe();
  }, [uid]);

  const allGoals = useMemo(() => {
    const personalGoals = dbGoals.filter((goal) => !(goal?.gardenType === "shared" || !!goal?.sharedGardenId));
    return [...personalGoals, ...sharedGoals];
  }, [dbGoals, sharedGoals]);

  const filtered = useMemo(() => {
    return allGoals
      .filter((g) => g?.gardenType === "shared" || g?.gardenType === "personal" || !g?.gardenType)
      .filter((g) => {
        if (g?.gardenType === "shared") {
          return g?.shelfPosition?.pageId !== STORAGE_PAGE_ID;
        }
        return layoutByGoalId[g.id]?.pageId !== STORAGE_PAGE_ID;
      })
      .filter((g) => isWithinActiveRange(g, today))
      .filter((g) => !isGoalFullyCompleted(g, today));
  }, [allGoals, layoutByGoalId, todayKey]);

  const visibleGoals = useMemo(() => {
    if (gardenFilter === "personal") {
      return filtered.filter((goal) => !(goal?.gardenType === "shared" || !!goal?.sharedGardenId));
    }
    if (gardenFilter === "other") {
      return filtered.filter((goal) => goal?.gardenType === "shared" || !!goal?.sharedGardenId);
    }
    return filtered;
  }, [filtered, gardenFilter]);

  const getGardenLabel = (goal) => {
    if (goal?.gardenType === "shared" || !!goal?.sharedGardenId) {
      const sharedId = goal?.sharedGardenId || goal?.gardenId;
      return sharedGardenNameById[sharedId] || "Shared Garden";
    }
    return "Personal Garden";
  };

  const calculateStreak = (goal, newLogs) => {
    let current = 0;
    let longest = goal.longestStreak || 0;
    const checkToday = new Date();
    checkToday.setHours(0, 0, 0, 0);
    let checkDate = new Date(checkToday);
    
    for (let i = 0; i < 365; i++) {
      const dateKey = toKey(checkDate);
      const dayOfWeek = checkDate.getDay();
      const isScheduled = goal.schedule?.type === "everyday" 
        || (goal.schedule?.type === "weekdays" && dayOfWeek >= 1 && dayOfWeek <= 5)
        || (goal.schedule?.type === "days" && goal.schedule?.days?.includes(dayOfWeek));

      if (isScheduled) {
        let isDoneOnDate = goal.type === "completion" 
          ? !!newLogs?.completion?.[dateKey]?.done 
          : (newLogs?.quantity?.[dateKey]?.value ?? 0) >= (goal.measurable?.target ?? 0);

        if (isDoneOnDate) current++;
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
        currentAppStreak = (userData.lastActiveDate === yesterdayStr) ? currentAppStreak + 1 : 1;
        await updateDoc(userRef, { streakCount: currentAppStreak, lastActiveDate: todayStr });
        return currentAppStreak; 
      }
    } catch (error) {
      console.error(error);
      return 0;
    }
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
      const newlyUnlocked = ACHIEVEMENTS.filter(ach => !unlockedIds.includes(ach.id) && ach.check(currentStats));

      if (newlyUnlocked.length > 0) {
        const newIds = newlyUnlocked.map(ach => ach.id);
        const newTitles = newlyUnlocked.map(ach => `${ach.icon} ${ach.title}`);
        await updateDoc(userRef, { unlockedAchievements: arrayUnion(...newIds) });
        Alert.alert("🏆 Achievement Unlocked!", `Great job! You just earned:\n\n${newTitles.join("\n")}`);
      }
    } catch (error) { console.error(error); }
  };

  // --- THE NEW PROGRESS-TRACKING TOGGLE ---
  const handleToggleComplete = async (item, isCurrentlyDone) => {
    if (!auth.currentUser) return;

    try {
      const isSharedGoal = item?.gardenType === "shared" && !!item?.sharedGardenId;
      const currentUserId = auth.currentUser.uid;
      const isSharedMultiUser = isSharedGoal && item?.type === "completion" && !!item?.multiUserWateringEnabled;

      if (isSharedMultiUser) {
        const sharedRef = doc(db, "sharedGardens", item.sharedGardenId, "layout", item.id);
        let transactionUpdate = null;
        let ownerIdForSync = null;
        let sourceGoalIdForSync = null;

        await runTransaction(db, async (tx) => {
          const snap = await tx.get(sharedRef);
          if (!snap.exists()) return;

          const latest = { id: snap.id, ...snap.data(), gardenType: "shared" };
          ownerIdForSync = latest?.ownerId || null;
          sourceGoalIdForSync = latest?.sourceGoalId || null;

          const latestLogs = JSON.parse(JSON.stringify(latest.logs || {}));
          if (!latestLogs.completion) latestLogs.completion = {};

          const existingEntry = latestLogs.completion[todayKey] || {};
          const existingUsers = existingEntry.users || {};
          const hasUserContribution = !!existingUsers[currentUserId];

          const wasDone = isGoalDoneForDate(latest, todayKey);
          const nextUsers = { ...existingUsers };
          if (hasUserContribution) {
            delete nextUsers[currentUserId];
          } else {
            nextUsers[currentUserId] = true;
          }
          const uniqueCount = Object.keys(nextUsers).filter((userId) => !!nextUsers[userId]).length;
          const isNowDone = uniqueCount >= getRequiredContributors(latest);

          const nextEntry = { ...existingEntry, users: nextUsers, done: isNowDone };
          latestLogs.completion[todayKey] = nextEntry;

          const txUpdateData = {
            [`logs.completion.${todayKey}`]: nextEntry,
          };

          if (isNowDone !== wasDone) {
            const { currentStreak, longestStreak } = calculateStreak(latest, latestLogs);
            const currentPlantHealth = getPlantHealthState(latest).healthLevel;
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
          } catch (error) {
            if (error?.code !== "permission-denied") {
              console.error("Error syncing shared goal progress:", error);
            }
          }
        }

        await updateOverallScoresForSharedGardenMembers(item.sharedGardenId);

        return;
      }

      const willBeDone = !isCurrentlyDone;
      const shouldArchiveToStorage =
        !isSharedGoal &&
        willBeDone &&
        (item.completionCondition?.type === "date" || item.completionCondition?.type === "both");

      const goalRef = isSharedGoal
        ? doc(db, "sharedGardens", item.sharedGardenId, "layout", item.id)
        : doc(db, "users", auth.currentUser.uid, "goals", item.id);
      
      // 1. Deep copy logs to calculate new streaks locally
      const updatedLogs = JSON.parse(JSON.stringify(item.logs || {}));
      const updateData = {};
      let shouldAwardCompletion = false;

      if (item.type === "completion") {
        if (!updatedLogs.completion) updatedLogs.completion = {};

        if (isSharedGoal && item?.multiUserWateringEnabled) {
          const existingEntry = updatedLogs.completion[todayKey] || {};
          const existingUsers = existingEntry.users || {};

          if (existingUsers[currentUserId]) {
            return;
          }

          const nextUsers = { ...existingUsers, [currentUserId]: true };
          const uniqueCount = Object.keys(nextUsers).filter((userId) => !!nextUsers[userId]).length;
          const isNowDone = uniqueCount >= getRequiredContributors(item);
          updatedLogs.completion[todayKey] = { ...existingEntry, users: nextUsers, done: isNowDone };
          updateData[`logs.completion.${todayKey}`] = updatedLogs.completion[todayKey];
          shouldAwardCompletion = isNowDone && !isCurrentlyDone;
        } else {
          updatedLogs.completion[todayKey] = { done: !isCurrentlyDone };
          updateData[`logs.completion.${todayKey}.done`] = !isCurrentlyDone;
          shouldAwardCompletion = !isCurrentlyDone;
        }
      } else {
        if (!updatedLogs.quantity) updatedLogs.quantity = {};
        const targetValue = item.measurable?.target || 1;
        updatedLogs.quantity[todayKey] = { value: isCurrentlyDone ? 0 : targetValue };
        updateData[`logs.quantity.${todayKey}.value`] = isCurrentlyDone ? 0 : targetValue;
        shouldAwardCompletion = !isCurrentlyDone;
      }

      if (shouldAwardCompletion || (!isSharedGoal && isCurrentlyDone)) {
        const growthChange = isCurrentlyDone ? -1 : 1;
        const { currentStreak, longestStreak } = calculateStreak(item, updatedLogs);
        const currentPlantHealth = getPlantHealthState(item).healthLevel;
        updateData.currentStreak = currentStreak;
        updateData.longestStreak = longestStreak;
        updateData.totalCompletions = increment(growthChange);
        updateData.healthLevel = isCurrentlyDone ? 2 : currentPlantHealth <= 1 ? 2 : 3;
      }

      await updateDoc(goalRef, updateData);

      if (isSharedGoal && item?.ownerId && item?.sourceGoalId) {
        try {
          await updateDoc(doc(db, "users", item.ownerId, "goals", item.sourceGoalId), updateData);
        } catch (error) {
          if (error?.code !== "permission-denied") {
            console.error("Error syncing shared goal progress:", error);
          }
        }
      }

      if (isSharedGoal) {
        await updateOverallScoresForSharedGardenMembers(item.sharedGardenId);
      }

      if (shouldArchiveToStorage) {
        const storageSlot = await findFirstOpenStorageSlot(auth.currentUser.uid, item.id);
        if (storageSlot) {
          await setDoc(
            doc(db, "users", auth.currentUser.uid, "gardenLayout", item.id),
            { shelfPosition: storageSlot },
            { merge: true }
          );
        }
      }

      if (shouldAwardCompletion && !isSharedGoal) {
        const newAppStreak = await updateOverallAppStreak();
        await checkAchievements(newAppStreak);
      }

    } catch (error) {
      console.error("Error toggling goal status:", error);
      Alert.alert("Error", "Could not update goal progress.");
    }
  };

  return (
    <Page>
      <View style={styles.headerRow}>
        <Text style={styles.headerTitle}>Goals</Text>
      </View>

      <View style={styles.filterRow}>
        {[
          { key: "all", label: "All" },
          { key: "personal", label: "Personal" },
          { key: "other", label: "Other Gardens" },
        ].map((filterOption) => {
          const active = gardenFilter === filterOption.key;
          return (
            <Pressable
              key={filterOption.key}
              onPress={() => setGardenFilter(filterOption.key)}
              style={[styles.filterChip, active && styles.filterChipActive]}
            >
              <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{filterOption.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={theme.accent} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={visibleGoals}
          keyExtractor={(item) => item._listKey || item.id}
          contentContainerStyle={{ paddingBottom: 24 }}
          renderItem={({ item }) => {
            const dueToday = isScheduledOn(item, today);
            const done = isGoalDoneForDate(item, todayKey);
            const isOtherGardenGoal = item?.gardenType === "shared" || !!item?.sharedGardenId;
            const isSharedMultiUser =
              item?.gardenType === "shared" &&
              item?.type === "completion" &&
              !!item?.multiUserWateringEnabled;
            const usersMap = isSharedMultiUser ? (item?.logs?.completion?.[todayKey]?.users || {}) : {};
            const uniqueUserCount = isSharedMultiUser
              ? Object.keys(usersMap).filter((userId) => !!usersMap[userId]).length
              : 0;
            const requiredContributors = isSharedMultiUser ? getRequiredContributors(item) : 1;
            const contributorProgressLabel = `${Math.min(uniqueUserCount, requiredContributors)}/${requiredContributors}`;
            const currentUserContributed = isSharedMultiUser ? !!usersMap[uid] : false;
            const healthState = getPlantHealthState(item);
            const showReviveHeart = done && healthState.healthLevel === 2;

            const scheduleText = formatSchedule(item);
            const gardenLabel = getGardenLabel(item);

            return (
              <Pressable 
                style={[
                  styles.goalCard,
                  isOtherGardenGoal ? styles.goalCardOtherGarden : styles.goalCardPersonalGarden,
                  !dueToday && styles.goalCardMuted,
                ]}
                onPress={() =>
                  navigation.navigate("Goal", {
                    goalId: item.id,
                    source: "goals",
                    sharedGardenId: item?.gardenType === "shared" ? item?.sharedGardenId : undefined,
                  })
                }
              >
                <View style={styles.leftIcon}>
                  <Image source={getPlantPreviewAsset(item)} style={styles.leftIconImage} resizeMode="contain" />
                </View>
                <View style={styles.textWrap}>
                  <Text style={[styles.title, isOtherGardenGoal ? styles.titleOtherGarden : styles.titlePersonalGarden]} numberOfLines={1}>{item.name}</Text>
                  <Text style={[styles.sub, isOtherGardenGoal ? styles.subOtherGarden : styles.subPersonalGarden]} numberOfLines={1}>
                    {scheduleText}
                  </Text>
                  <Text style={[styles.gardenSub, isOtherGardenGoal ? styles.gardenSubOther : styles.gardenSubPersonal]} numberOfLines={1}>{gardenLabel}</Text>
                </View>

                <Pressable 
                  style={styles.rightWrap} 
                  onPress={() => handleToggleComplete(item, done)}
                  hitSlop={15}
                >
                  <View style={styles.rightInfo}>
                    {showReviveHeart && <Ionicons name="heart" size={14} color="#FF6B8A" style={styles.reviveHeart} />}
                    {item.currentStreak > 0 && (
                      <Text style={[styles.streakText, isOtherGardenGoal && styles.streakTextOtherGarden]}>{item.currentStreak}</Text>
                    )}
                  </View>

                  <View style={styles.dropletAnchor}>
                    {isSharedMultiUser ? (
                      <View style={[
                        styles.contributorBadge,
                        !done && currentUserContributed && styles.contributorBadgeSelf,
                        done && styles.contributorBadgeDone,
                      ]}>
                        <Text style={[
                          styles.contributorBadgeText,
                          !done && currentUserContributed && styles.contributorBadgeTextSelf,
                          done && styles.contributorBadgeTextDone,
                        ]}>
                          {contributorProgressLabel}
                        </Text>
                      </View>
                    ) : (
                      <Droplet filled={done} />
                    )}
                  </View>
                </Pressable>
              </Pressable>
            );
          }}
          ListEmptyComponent={
            <View style={{ marginTop: 26 }}>
              <Text style={styles.empty}>Nothing Scheduled Yet</Text>
            </View>
          }
        />
      )}
    </Page>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  headerTitle: { fontSize: 20, fontWeight: "900", color: theme.title },
  filterRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  filterChip: {
    paddingHorizontal: 10,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.card,
  },
  filterChipActive: {
    backgroundColor: theme.accent,
  },
  filterChipText: { fontSize: 12, fontWeight: "900", color: theme.text2 },
  filterChipTextActive: { color: theme.bg },
  goalCard: { flexDirection: "row", alignItems: "center", backgroundColor: theme.card, borderRadius: theme.radius, paddingHorizontal: 12, height: 74, marginBottom: 12 },
  goalCardPersonalGarden: { backgroundColor: theme.card },
  goalCardOtherGarden: { backgroundColor: OTHER_GARDEN_GOAL_COLOR },
  goalCardMuted: { opacity: 0.45 },
  leftIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: theme.accent, marginRight: 12 },
  leftIconImage: { width: 34, height: 34, alignSelf: "center", marginTop: 5 },
  textWrap: { flex: 1 },
  title: { fontSize: 14, fontWeight: "900", color: theme.text },
  titlePersonalGarden: { color: theme.text },
  titleOtherGarden: { color: theme.text },
  sub: { marginTop: 2, fontSize: 12, fontWeight: "800", color: theme.text2 },
  subPersonalGarden: { color: theme.text2 },
  subOtherGarden: { color: theme.text2 },
  gardenSub: { marginTop: 1, fontSize: 11, fontWeight: "800" },
  gardenSubPersonal: { color: theme.text2 },
  gardenSubOther: { color: theme.accent },
  rightWrap: { width: 74, height: 28, position: "relative", justifyContent: "center" },
  rightInfo: { position: "absolute", left: 0, flexDirection: "row", alignItems: "center" },
  dropletAnchor: { position: "absolute", right: 0, alignItems: "center", justifyContent: "center" },
  reviveHeart: { marginRight: 6 },
  streakText: { fontSize: 13, fontWeight: "900", color: theme.accent },
  streakTextOtherGarden: { color: theme.accent },
  contributorBadge: {
    minWidth: 30,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: theme.accent,
    paddingHorizontal: 6,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  contributorBadgeSelf: {
    backgroundColor: "rgba(167, 152, 125, 0.52)",
  },
  contributorBadgeDone: {
    backgroundColor: theme.accent,
  },
  contributorBadgeText: {
    fontSize: 10,
    fontWeight: "900",
    color: "#FFF",
  },
  contributorBadgeTextSelf: {
    color: "#FFF",
  },
  contributorBadgeTextDone: {
    color: theme.bg,
  },
  droplet: { width: 22, height: 22, borderRadius: 11 },
  dropletOutline: { borderWidth: 2, borderColor: theme.accent },
  dropletFilled: { backgroundColor: theme.accent },
  empty: { textAlign: "center", color: theme.surface, fontWeight: "900", marginTop: 40 },
});