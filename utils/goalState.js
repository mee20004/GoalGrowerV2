import { fromKey, isScheduledOn, toKey } from "../components/GoalsStore";
import { logHealthForDay } from "./logHealthForDay";
import {
  enumeratePeriods,
  getPeriodDateKeys,
  getPeriodKey,
  getPeriodStart,
} from "./periodUtils";

export const GOAL_TYPE_FREQUENCY = "frequency";
export const GOAL_TYPE_PERIOD_QUANTITY = "periodQuantity";

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

export function isPeriodicGoal(goal) {
  const type = getGoalType(goal);
  return type === GOAL_TYPE_FREQUENCY || type === GOAL_TYPE_PERIOD_QUANTITY;
}

export function getGoalPeriod(goal) {
  return goal?.period === "month" ? "month" : "week";
}

export function getPeriodTarget(goal) {
  const n = Number(goal?.periodTarget);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

function isSharedMultiUserGoal(goal) {
  return !!goal?.multiUserWateringEnabled && (goal?.gardenType === "shared" || goal?.sharedGardenId);
}

/**
 * Individual progress toward the period target for a periodic goal.
 * frequency      -> count of distinct done days in the period.
 * periodQuantity -> sum of logged values in the period.
 * For shared multi-user goals, pass userId to scope to that user's logs.
 */
export function getPeriodProgress(goal, dateKey, userId = null) {
  const period = getGoalPeriod(goal);
  const dateKeys = getPeriodDateKeys(dateKey, period);
  const type = getGoalType(goal);
  const isShared = isSharedMultiUserGoal(goal);

  if (type === GOAL_TYPE_FREQUENCY) {
    return dateKeys.reduce((sum, dk) => {
      const entry = goal?.logs?.completion?.[dk];
      if (!entry) return sum;
      if (isShared) {
        if (userId) return sum + (entry?.users?.[userId] ? 1 : 0);
        return sum + (entry?.done ? 1 : 0);
      }
      return sum + (entry?.done ? 1 : 0);
    }, 0);
  }

  // periodQuantity
  return dateKeys.reduce((sum, dk) => {
    const entry = goal?.logs?.quantity?.[dk];
    if (!entry) return sum;
    if (isShared && userId) return sum + (Number(entry?.users?.[userId]) || 0);
    if (isShared && !userId) return sum + (Number(entry?.value) || 0);
    return sum + (Number(entry?.value) || 0);
  }, 0);
}

/** Number of users who have met the period target within the period containing dateKey. */
export function getPeriodContributorCount(goal, dateKey) {
  const type = getGoalType(goal);
  const period = getGoalPeriod(goal);
  const target = getPeriodTarget(goal);
  const dateKeys = getPeriodDateKeys(dateKey, period);
  const logKey = type === GOAL_TYPE_FREQUENCY ? "completion" : "quantity";

  const userIds = new Set();
  dateKeys.forEach((dk) => {
    const users = goal?.logs?.[logKey]?.[dk]?.users || {};
    Object.keys(users).forEach((uid) => userIds.add(uid));
  });

  let count = 0;
  userIds.forEach((uid) => {
    if (getPeriodProgress(goal, dateKey, uid) >= target) count += 1;
  });
  return count;
}

/**
 * Whether a periodic goal is "done" for the period containing dateKey.
 * Shared multi-user: with userId -> that user met quota; without -> group quota met.
 */
export function isGoalDoneForPeriod(goal, dateKey, userId = null) {
  const target = getPeriodTarget(goal);
  if (isSharedMultiUserGoal(goal)) {
    if (userId) {
      return getPeriodProgress(goal, dateKey, userId) >= target;
    }
    return getPeriodContributorCount(goal, dateKey) >= getRequiredContributors(goal);
  }
  return getPeriodProgress(goal, dateKey) >= target;
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
  if (isPeriodicGoal(goal)) {
    return isGoalDoneForPeriod(goal, dateKey, currentUserId);
  }
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
  return isScheduledOn(goal, date);
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

/**
 * Calculates plant health state and asynchronously logs health for each day.
 * @param {object} goal
 * @param {Date} now
 * @returns {object} health state
 */
// userId must be passed in to log health in the correct Firestore location
export function getPlantHealthState(goal, now = new Date(), userId = null) {
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

  // Periodic goals (frequency / periodQuantity) are evaluated per week/month
  // rather than per scheduled day.
  if (isPeriodicGoal(goal)) {
    const period = getGoalPeriod(goal);
    const periods = enumeratePeriods(toKey(simulationStartDate), toKey(today), period);
    if (periods.length === 0) {
      return makeHealthState(5);
    }
    let periodicHealth = simulationStartHealth;
    periods.forEach((p) => {
      const done = isGoalDoneForPeriod(goal, p.startKey);
      if (p.isComplete) {
        periodicHealth += done ? 1 : -1;
      } else if (done) {
        periodicHealth += 1;
      }
      periodicHealth = clampHealthLevel(periodicHealth);
    });
    return makeHealthState(periodicHealth);
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
      // Removed logHealthForDay call to prevent repeated Firestore writes during health calculation
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

  // Periodic goals: streak counts consecutive periods that met quota, walking
  // backward; the current (in-progress) period never breaks the streak.
  if (isPeriodicGoal(goalData)) {
    const period = getGoalPeriod(goalData);
    const goalWithLogs = { ...goalData, logs: newLogs };
    const currentPeriodKey = getPeriodKey(referenceDateKey, period);
    let cursorKey = referenceDateKey;
    for (let i = 0; i < 520; i += 1) {
      const periodKey = getPeriodKey(cursorKey, period);
      const isCurrentPeriod = periodKey === currentPeriodKey;
      const done = isGoalDoneForPeriod(goalWithLogs, cursorKey);
      if (done) {
        current += 1;
      } else if (!isCurrentPeriod) {
        break;
      }
      const start = getPeriodStart(cursorKey, period);
      const prev = new Date(start);
      prev.setDate(prev.getDate() - 1);
      cursorKey = toKey(prev);
    }
    if (current > longest) longest = current;
    return { currentStreak: current, longestStreak: longest };
  }

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
    // Set resumeFromTrophyDate to the day after trophy was frozen, and resumeFromTrophyHealth to frozenHealthLevel - 1
    let resumeFromTrophyDate = null;
    if (goal?.trophyDate) {
      // trophyDate is the day the goal became a trophy (should be a dateKey string)
      const trophyDateObj = fromKey(goal.trophyDate);
      trophyDateObj.setDate(trophyDateObj.getDate() + 1);
      resumeFromTrophyDate = toKey(trophyDateObj);
    }
    const resumeFromTrophyHealth = (typeof frozenHealthLevel === 'number') ? clampHealthLevel(frozenHealthLevel - 1) : undefined;
    return {
      ...rest,
      ...(resumeFromTrophyDate ? { resumeFromTrophyDate } : {}),
      ...(resumeFromTrophyHealth !== undefined ? { resumeFromTrophyHealth } : {}),
    };
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

/**
 * Counts "active days" for periodic goals to drive plant growth stage:
 * frequency      -> days with a completion (single done or any shared user).
 * periodQuantity -> days with any logged value (single or shared users).
 * This keeps growth tied to engagement, independent of period adherence.
 */
export function countActiveDays(goalData, logs) {
  const type = getGoalType(goalData);
  let total = 0;

  if (type === GOAL_TYPE_FREQUENCY) {
    const completion = logs?.completion || {};
    Object.values(completion).forEach((entry) => {
      if (entry?.done) {
        total += 1;
      } else if (entry?.users && Object.values(entry.users).some((v) => !!v)) {
        total += 1;
      }
    });
    return total;
  }

  const quantity = logs?.quantity || {};
  Object.values(quantity).forEach((entry) => {
    const single = Number(entry?.value) || 0;
    const usersSum = entry?.users
      ? Object.values(entry.users).reduce((sum, v) => sum + (Number(v) || 0), 0)
      : 0;
    if (single > 0 || usersSum > 0) {
      total += 1;
    }
  });
  return total;
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