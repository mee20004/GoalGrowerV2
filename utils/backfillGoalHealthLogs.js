import { doc, updateDoc } from "firebase/firestore";
import { db } from "../firebaseConfig";
import { addDaysKey, fromKey, isScheduledOn, toKey } from "../components/GoalsStore";
import {
  calculateGoalStreak,
  dateFromFirestoreValue,
  getGoalType,
  getPlantHealthState,
  isGoalDoneForDate,
} from "./goalState";

function isHealthLogComplete(entry) {
  return (
    entry &&
    typeof entry.health === "number" &&
    typeof entry.done === "boolean" &&
    typeof entry.frozen === "boolean"
  );
}

function getScheduleMode(goal) {
  return goal?.schedule?.mode || goal?.schedule?.type;
}

function getSimulationStartDate(goal, todayKey) {
  if (goal?.resumeFromTrophyDate) {
    const d = fromKey(goal.resumeFromTrophyDate);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  const createdAtDate = dateFromFirestoreValue(goal?.createdAt);
  const today = fromKey(todayKey);
  today.setHours(0, 0, 0, 0);

  if (createdAtDate) {
    const d = new Date(createdAtDate);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  const fallback = new Date(today);
  fallback.setDate(fallback.getDate() - 365);
  fallback.setHours(0, 0, 0, 0);
  return fallback;
}

function cloneLogs(goal) {
  const logs = goal?.logs || {};
  return {
    completion: { ...(logs.completion || {}) },
    quantity: { ...(logs.quantity || {}) },
    numeric: { ...(logs.numeric || {}) },
    timer: { ...(logs.timer || {}) },
    checklist: { ...(logs.checklist || {}) },
    health: { ...(logs.health || {}) },
    healthHistory: { ...(logs.healthHistory || {}) },
    frozenDays: Array.isArray(logs.frozenDays) ? [...logs.frozenDays] : [],
  };
}

function isSharedMultiUserGoal(goal) {
  return (
    !!goal?.multiUserWateringEnabled &&
    (goal?.gardenType === "shared" || goal?.sharedGardenId)
  );
}

function hasCompletionLog(goal, dateKey) {
  return goal?.logs?.completion?.[dateKey] != null;
}

function buildCompletionBackfillEntry(goal, userId) {
  if (isSharedMultiUserGoal(goal)) {
    return { users: { [userId]: false }, done: false };
  }
  return { done: false };
}

/**
 * Backfills missing or incomplete logs.health entries for a goal from simulation
 * start through today. Scheduled days use toggle health/streak/done logic; unscheduled
 * days are still logged but health stays flat (no decrease).
 */
export async function backfillGoalHealthLogs(userId, goal, todayKey) {
  if (!userId || !goal?.id || !todayKey) return { wrote: false };

  if (!goal.schedule) {
    console.log("[backfillGoalHealthLogs] Skipping goal (no schedule)", { goalId: goal.id });
    return { wrote: false };
  }

  const scheduleMode = getScheduleMode(goal);
  if (scheduleMode === "floating") {
    console.log("[backfillGoalHealthLogs] Skipping goal (floating schedule)", { goalId: goal.id });
    return { wrote: false };
  }

  if (goal.isFrozenTrophyState) {
    console.log("[backfillGoalHealthLogs] Skipping goal (frozen trophy state)", { goalId: goal.id });
    return { wrote: false };
  }

  const workingLogs = cloneLogs(goal);
  const goalWithLogs = { ...goal, logs: workingLogs };
  const updateData = {};
  let backfilledDays = 0;

  const startDate = getSimulationStartDate(goal, todayKey);
  const endDate = fromKey(todayKey);
  endDate.setHours(0, 0, 0, 0);

  let cursorKey = toKey(startDate);
  const frozen = !!goal.isFrozenTrophyState;
  const goalType = getGoalType(goal);
  const isCompletionGoal = goalType === "completion";

  while (cursorKey <= todayKey) {
    const cursorDate = fromKey(cursorKey);
    cursorDate.setHours(0, 0, 0, 0);

    const scheduledToday = isScheduledOn(goal, cursorDate);
    const existingEntry = workingLogs.health[cursorKey];
    if (!isHealthLogComplete(existingEntry)) {
      const done = scheduledToday
        ? isGoalDoneForDate(goalWithLogs, cursorKey, userId)
        : false;
      const { healthLevel } = getPlantHealthState(goalWithLogs, cursorDate, userId);
      const { currentStreak } = calculateGoalStreak(goal, workingLogs, cursorKey);

      const healthEntry = {
        health: healthLevel,
        frozen,
        done,
        streak: currentStreak,
        timestamp: new Date(),
      };

      workingLogs.health[cursorKey] = healthEntry;
      workingLogs.healthHistory[cursorKey] = healthLevel;
      updateData[`logs.health.${cursorKey}`] = healthEntry;
      updateData[`logs.healthHistory.${cursorKey}`] = healthLevel;
      backfilledDays += 1;

      if (
        scheduledToday &&
        isCompletionGoal &&
        !done &&
        !hasCompletionLog(goalWithLogs, cursorKey)
      ) {
        const completionEntry = buildCompletionBackfillEntry(goal, userId);
        if (completionEntry) {
          if (!workingLogs.completion) workingLogs.completion = {};
          workingLogs.completion[cursorKey] = completionEntry;
          updateData[`logs.completion.${cursorKey}`] = completionEntry;
        }
      }
    }

    if (cursorKey === todayKey) break;
    cursorKey = addDaysKey(cursorKey, 1);
  }

  if (backfilledDays === 0) {
    return { wrote: false };
  }

  const todayDate = fromKey(todayKey);
  todayDate.setHours(0, 0, 0, 0);
  const { healthLevel: finalHealthLevel } = getPlantHealthState(goalWithLogs, todayDate, userId);
  const { currentStreak, longestStreak } = calculateGoalStreak(goal, workingLogs, todayKey);

  updateData.healthLevel = finalHealthLevel;
  updateData.currentStreak = currentStreak;
  updateData.longestStreak = Math.max(Number(goal?.longestStreak) || 0, longestStreak);

  const goalRef = doc(db, "users", userId, "goals", goal.id);
  try {
    await updateDoc(goalRef, updateData);
    console.log("[backfillGoalHealthLogs] Updated goal health logs", {
      goalId: goal.id,
      fields: Object.keys(updateData).length,
    });
  } catch (err) {
    console.error("[backfillGoalHealthLogs] updateDoc error", err?.message || String(err));
    throw err;
  }

  return { wrote: true, fieldsUpdated: Object.keys(updateData).length };
}
