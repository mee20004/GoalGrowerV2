import { fromKey, toKey } from "../components/GoalsStore";

// --- Trophy/Storage State Freeze Helpers ---
function isTrophyState(goal) {
  return goal?.shelfPosition?.pageId === STORAGE_PAGE_ID;
}

function shouldFreezeTrophyState(goal) {
  // Only freeze if in storage and not already frozen
  return isTrophyState(goal) && !goal?.isFrozenTrophyState;
}

function shouldUnfreezeTrophyState(goal) {
  // Unfreeze if not in storage but was previously frozen
  return !isTrophyState(goal) && goal?.isFrozenTrophyState;
}

const STORAGE_PAGE_ID = "storage";
const MAX_HEALTH_LEVEL = 5;
const HEALTH_STATUS_BY_LEVEL = {
  1: "dead",
  2: "dying",
  3: "dry",
  4: "day",
  5: "alive",
};

function clampHealthLevel(level) {
  const n = Number(level);
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(MAX_HEALTH_LEVEL, Math.floor(n)));
}

function makeHealthState(level) {
  const healthLevel = clampHealthLevel(level);
  return {
    healthLevel,
    status: HEALTH_STATUS_BY_LEVEL[healthLevel] || "alive",
  };
}

export function getGoalType(goal) {
  return goal?.type || goal?.kind || "completion";
}

export function getRequiredContributors(goal) {
  const requiredContributors = Number(goal?.requiredContributors);
  return Number.isFinite(requiredContributors) && requiredContributors >= 2
    ? Math.floor(requiredContributors)
    : 2;
}

export function getGrowthStage(totalCompletions) {
  const total = Number(totalCompletions) || 0;
  if (total > 30) return "stage4";
  if (total > 15) return "stage3";
  if (total > 5) return "stage2";
  return "stage1";
}

export function isGoalDoneForDate(goal, dateKey, currentUserId = null) {
  const goalType = getGoalType(goal);
  const isSharedMultiUser = !!goal?.multiUserWateringEnabled && (goal?.gardenType === "shared" || goal?.sharedGardenId);
  if (goalType === "completion") {
    if (isSharedMultiUser) {
      const usersMap = goal?.logs?.completion?.[dateKey]?.users || {};
      const uniqueCount = Object.keys(usersMap).filter((userId) => !!usersMap[userId]).length;
      return uniqueCount >= getRequiredContributors(goal);
    }
    return !!goal?.logs?.completion?.[dateKey]?.done;
  }

  if (goalType === "quantity" && isSharedMultiUser) {
    const target = goal?.measurable?.target ?? 0;
    const usersMap = goal?.logs?.quantity?.[dateKey]?.users || {};
    if (currentUserId) {
      // Only return true if this user has reached the target
      const userValue = Number(usersMap[currentUserId]) || 0;
      return userValue >= target;
    } else {
      // Only return true if ALL contributors (or all users if contributors missing) have reached the target
      let contributors = goal?.contributors;
      if (!Array.isArray(contributors) || contributors.length === 0) {
        contributors = Object.keys(usersMap);
      }
      return contributors.length > 0 && contributors.every((userId) => Number(usersMap[userId]) >= target);
    }
  }

  return (goal?.logs?.quantity?.[dateKey]?.value ?? 0) >= (goal?.measurable?.target ?? 0);
}

export function isGoalScheduledOnDate(goal, date) {
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

export function dateFromFirestoreValue(value) {
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

export function getPlantHealthState(goal, now = new Date()) {
  // --- Trophy/Storage freeze logic ---
  if (goal?.isFrozenTrophyState && typeof goal?.frozenHealthLevel === 'number') {
    // If frozen, always return the frozen value
    return makeHealthState(goal.frozenHealthLevel);
  }

  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  const storedHealthLevel = Number(goal?.healthLevel);
  if (isTrophyState(goal) && storedHealthLevel >= 1 && storedHealthLevel <= MAX_HEALTH_LEVEL) {
    return makeHealthState(storedHealthLevel);
  }

  // Resume simulation from after trophy if available
  let simulationStartDate, simulationStartHealth;
  if (goal?.resumeFromTrophyDate && typeof goal?.resumeFromTrophyHealth === 'number') {
    simulationStartDate = fromKey(goal.resumeFromTrophyDate);
    simulationStartDate.setHours(0, 0, 0, 0);
    simulationStartHealth = clampHealthLevel(goal.resumeFromTrophyHealth);
  } else {
    const createdAtDate = dateFromFirestoreValue(goal?.createdAt);
    simulationStartDate = createdAtDate ? new Date(createdAtDate) : new Date(today);
    simulationStartDate.setHours(0, 0, 0, 0);
    simulationStartHealth = MAX_HEALTH_LEVEL;
    // Keep simulation bounded for performance if createdAt is missing/invalid.
    if (!createdAtDate) {
      simulationStartDate.setDate(simulationStartDate.getDate() - 365);
    }
  }

  let healthLevel = simulationStartHealth;
  let hasScheduledDay = false;
  const cursor = new Date(simulationStartDate);

  for (let i = 0; i < 2000 && cursor.getTime() <= today.getTime(); i += 1) {
    if (isGoalScheduledOnDate(goal, cursor)) {
      hasScheduledDay = true;
      const dateKey = toKey(cursor);
      const done = isGoalDoneForDate(goal, dateKey);
      healthLevel += done ? 1 : -1;
      healthLevel = clampHealthLevel(healthLevel);
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  if (!hasScheduledDay) {
    return makeHealthState(5);
  }
  const derived = makeHealthState(healthLevel);
  return derived;
}

export function calculateGoalStreak(goalData, newLogs, referenceDateKey) {
  // If frozen, always return the frozen values
  if (goalData?.isFrozenTrophyState && typeof goalData?.frozenCurrentStreak === 'number' && typeof goalData?.frozenLongestStreak === 'number') {
    return { currentStreak: goalData.frozenCurrentStreak, longestStreak: goalData.frozenLongestStreak };
  }

  let current = 0;
  let longest = Number(goalData?.longestStreak) || 0;
  const checkDateBase = fromKey(referenceDateKey);
  const checkToday = new Date(checkDateBase);
  checkToday.setHours(0, 0, 0, 0);
  let checkDate = new Date(checkToday);

  for (let i = 0; i < 365; i += 1) {
    const dateKey = toKey(checkDate);
    if (isGoalScheduledOnDate(goalData, checkDate)) {
      const isDoneOnDate = isGoalDoneForDate({ ...goalData, logs: newLogs }, dateKey);
      if (isDoneOnDate) current += 1;
      else if (dateKey !== toKey(checkToday)) break;
    }
    checkDate.setDate(checkDate.getDate() - 1);
  }

  if (current > longest) longest = current;
  return { currentStreak: current, longestStreak: longest };
}
// --- Trophy freeze state mutators ---
export function updateTrophyFreezeState(goal) {
  // Returns a shallow copy of goal with freeze/unfreeze fields set as needed
  // Should be called before saving goal to DB after a move
  if (shouldFreezeTrophyState(goal)) {
    // Freeze now
    return {
      ...goal,
      isFrozenTrophyState: true,
      frozenHealthLevel: goal.healthLevel,
      frozenCurrentStreak: goal.currentStreak,
      frozenLongestStreak: goal.longestStreak,
    };
  } else if (shouldUnfreezeTrophyState(goal)) {
    // Unfreeze now
    const { isFrozenTrophyState, frozenHealthLevel, frozenCurrentStreak, frozenLongestStreak, ...rest } = goal;
    return rest;
  }
  return goal;
}

export function migrateLogsForTrackingType(goalData, nextType, nextMeasurable) {
  const currentType = getGoalType(goalData);
  const nextLogs = JSON.parse(JSON.stringify(goalData?.logs || {}));

  if (currentType === nextType) {
    return nextLogs;
  }

  if (currentType === "quantity" && nextType === "completion") {
    const previousTarget = Math.max(1, Math.floor(Number(goalData?.measurable?.target) || 1));
    const quantityLogs = nextLogs.quantity || {};
    const completionLogs = nextLogs.completion || {};

    Object.entries(quantityLogs).forEach(([dateKey, entry]) => {
      const value = Number(entry?.value) || 0;
      if (value >= previousTarget) {
        completionLogs[dateKey] = {
          ...(completionLogs[dateKey] || {}),
          done: true,
        };
      }
    });

    nextLogs.completion = completionLogs;
    return nextLogs;
  }

  if (currentType === "completion" && nextType === "quantity") {
    const nextTarget = Math.max(1, Math.floor(Number(nextMeasurable?.target) || 1));
    const completionLogs = nextLogs.completion || {};
    const quantityLogs = nextLogs.quantity || {};

    Object.entries(completionLogs).forEach(([dateKey, entry]) => {
      if (!entry?.done) return;
      quantityLogs[dateKey] = {
        value: Math.max(Number(quantityLogs[dateKey]?.value) || 0, nextTarget),
      };
    });

    nextLogs.quantity = quantityLogs;
    return nextLogs;
  }

  return nextLogs;
}

export function countCompletedDates(goalData, logs) {
  const completionKeys = Object.keys(logs?.completion || {});
  const quantityKeys = Object.keys(logs?.quantity || {});
  const allDateKeys = new Set([...completionKeys, ...quantityKeys]);
  let total = 0;

  allDateKeys.forEach((dateKey) => {
    if (isGoalDoneForDate({ ...goalData, logs }, dateKey)) {
      total += 1;
    }
  });

  return total;
}