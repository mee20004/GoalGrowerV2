// Shared goal toggle/update transaction logic for all screens
import { doc, updateDoc, runTransaction, setDoc, increment, arrayUnion, getDoc, deleteField } from "firebase/firestore";
import { getPlantHealthState, calculateGoalStreak, isGoalDoneForDate, isGoalDoneForPeriod, countActiveDays, getPeriodTarget, getPeriodProgress } from "../utils/goalState";
import { fromKey, toKey } from "../components/GoalsStore";
import { reconcileGoalHealthLogsFromDate } from "./backfillGoalHealthLogs";
import { updateOverallScoresForSharedGardenMembers } from "../utils/scoreUtils";
import { awardGoalCompletionCoins } from "../utils/shopInventory";
import { logAnalyticsEvent } from "./analytics";
import { auth, db } from "../firebaseConfig";

// STORAGE_PAGE_ID must match all screens
const STORAGE_PAGE_ID = "storage";

/**
 * Shared function to toggle goal completion or update quantity, updating health bars and logs atomically.
 * Handles both personal and shared goals, including multi-user logic.
 * @param {Object} params - All required params for the transaction
 * @param {Object} params.goal - The goal object
 * @param {string} params.selectedDateKey - The date key (e.g. YYYY-MM-DD)
 * @param {boolean} [params.isSharedGoalView] - If this is a shared goal
 * @param {string} [params.routeSharedGardenId] - Shared garden ID if applicable
 * @param {Object} [params.shelfPosition] - Shelf position if needed
 * @param {boolean} [params.archiveToStorage] - If true, archive to storage on completion
 * @param {Function} [params.findFirstOpenStorageSlot] - Function to find open storage slot
 * @param {Function} [params.clearLocalOptimisticProgress] - Function to clear optimistic UI
 * @returns {Promise<void>}
 */
export async function toggleGoalTransaction({
  goal,
  selectedDateKey,
  isSharedGoalView = false,
  routeSharedGardenId = null,
  shelfPosition = null,
  archiveToStorage = false,
  findFirstOpenStorageSlot = null,
  clearLocalOptimisticProgress = null,
  forceComplete = false,
  setDone = null,
}) {
  // Debug: print goal type detection flags and relevant properties
  console.log('[toggleGoalTransaction] goal.type:', goal?.type, 'goal.kind:', goal?.kind, 'goal.multiUserWateringEnabled:', goal?.multiUserWateringEnabled, 'goal.gardenType:', goal?.gardenType);
  if (!auth.currentUser) {
    console.error('[toggleGoalTransaction] Early return: No current user');
    return;
  }
  if (!goal) {
    console.error('[toggleGoalTransaction] Early return: No goal object');
    return;
  }
  if (shelfPosition?.pageId === STORAGE_PAGE_ID) {
    console.warn('[toggleGoalTransaction] Early return: Goal is in storage (shelfPosition)', shelfPosition);
    return;
  }
  // Defensive check: selectedDateKey must be a valid YYYY-MM-DD string
  if (typeof selectedDateKey !== 'string' || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(selectedDateKey)) {
    console.error('toggleGoalTransaction: Invalid selectedDateKey, aborting:', selectedDateKey, typeof selectedDateKey);
    return;
  }
  const currentUserId = auth.currentUser.uid;
  let transactionUpdate = null;
  let ownerIdForSync = null;
  let sourceGoalIdForSync = null;

  try {
    // --- Shared Multi-User Logic ---
    const isSharedMultiUserCompletion = isSharedGoalView && (goal?.type === "completion" || goal?.kind === "completion") && !!goal?.multiUserWateringEnabled && goal?.gardenType === "shared";
    const isSharedMultiUserQuantity = isSharedGoalView && (goal?.type === "quantity" || goal?.kind === "quantity") && !!goal?.multiUserWateringEnabled && goal?.gardenType === "shared";
    const isSharedMultiUserFrequency = isSharedGoalView && (goal?.type === "frequency" || goal?.kind === "frequency") && !!goal?.multiUserWateringEnabled && goal?.gardenType === "shared";
    const isSharedMultiUserPeriodQuantity = isSharedGoalView && (goal?.type === "periodQuantity" || goal?.kind === "periodQuantity") && !!goal?.multiUserWateringEnabled && goal?.gardenType === "shared";
    const isSharedMultiUser = isSharedMultiUserCompletion || isSharedMultiUserQuantity || isSharedMultiUserFrequency || isSharedMultiUserPeriodQuantity;
    const goalRef = isSharedGoalView
      ? doc(db, "sharedGardens", routeSharedGardenId, "layout", goal.id)
      : doc(db, "users", currentUserId, "goals", goal.id);
    transactionUpdate = null;
    let shouldAwardCompletion = false;
    let latestWasDone = isGoalDoneForDate(goal, selectedDateKey);
    let latestIsNowDone = latestWasDone;

    await runTransaction(db, async (tx) => {
      const snap = await tx.get(goalRef);
      if (!snap.exists()) {
        console.error('[toggleGoalTransaction] Early return: Firestore doc does not exist:', goalRef.path);
        return;
      }
      const latestGoal = {
        id: snap.id,
        ...snap.data(),
        ...(isSharedGoalView ? { gardenType: "shared", sharedGardenId: routeSharedGardenId } : {}),
      };
      if (latestGoal?.shelfPosition?.pageId === STORAGE_PAGE_ID) {
        console.warn('[toggleGoalTransaction] Early return: Goal is in storage (latestGoal)', goalRef.path, latestGoal);
        return;
      }
      latestWasDone = isGoalDoneForDate(latestGoal, selectedDateKey);
      const updatedLogs = JSON.parse(JSON.stringify(latestGoal.logs || {}));
      const updateData = {};
      let isNowDone = latestWasDone;
      if (!updatedLogs.healthHistory) updatedLogs.healthHistory = {};
      if (!updatedLogs.frozenDays) updatedLogs.frozenDays = [];
      if (latestGoal.isFrozenTrophyState || (latestGoal.shelfPosition && latestGoal.shelfPosition.pageId === 'storage')) {
        if (!updatedLogs.frozenDays.includes(selectedDateKey)) {
          updatedLogs.frozenDays.push(selectedDateKey);
        }
      }

      // Log the state before update
      console.log('[toggleGoalTransaction] Pre-update logs:', JSON.stringify(updatedLogs));

      if (isSharedMultiUserCompletion) {
        console.log('[toggleGoalTransaction] Entered SHARED MULTI-USER COMPLETION branch');
        if (!updatedLogs.completion) updatedLogs.completion = {};
        const existingEntry = updatedLogs.completion[selectedDateKey] || {};
        const existingUsers = existingEntry.users || {};
        let nextUsers;
        if (typeof setDone === 'boolean') {
          nextUsers = { ...existingUsers, [currentUserId]: setDone };
        } else if (existingUsers[currentUserId]) {
          nextUsers = { ...existingUsers, [currentUserId]: false };
        } else {
          nextUsers = { ...existingUsers, [currentUserId]: true };
        }
        // --- Contributors: all users who are checked for that day ---
        // Always recalculate contributors for this day from nextUsers
        const nextContributors = Object.keys(nextUsers).filter(uid => nextUsers[uid]);
        // Calculate isNowDone based on requiredContributors
        const requiredContributors = Math.max(2, Math.floor(Number(latestGoal?.requiredContributors) || 2));
        isNowDone = nextContributors.length >= requiredContributors;
        // Update Firestore and in-memory log
        if (nextContributors.length === 0) {
          // No contributors left, remove contributors property from in-memory log and Firestore
          const nextCompletionEntry = { ...existingEntry, users: nextUsers, done: isNowDone };
          delete nextCompletionEntry.contributors;
          updatedLogs.completion[selectedDateKey] = nextCompletionEntry;
          updateData[`logs.completion.${selectedDateKey}.contributors`] = deleteField();
          updateData[`logs.completion.${selectedDateKey}.users`] = nextUsers;
          updateData[`logs.completion.${selectedDateKey}.done`] = isNowDone;
        } else {
          // Always explicitly set done in the update
          const nextCompletionEntry = { ...existingEntry, users: nextUsers, done: isNowDone, contributors: nextContributors };
          updatedLogs.completion[selectedDateKey] = nextCompletionEntry;
          updateData[`logs.completion.${selectedDateKey}`] = { ...nextCompletionEntry, done: isNowDone };
        }
        shouldAwardCompletion = isNowDone && !latestWasDone;
      } else if (isSharedMultiUserQuantity) {
          console.log('[toggleGoalTransaction] Entered SHARED MULTI-USER QUANTITY branch');
          if (!updatedLogs.quantity) updatedLogs.quantity = {};
          if (!updatedLogs.completion) updatedLogs.completion = {};
          const targetValue = Math.max(1, Math.floor(Number(latestGoal.measurable?.target) || 1));
          const todayQuantityLog = updatedLogs.quantity[selectedDateKey] || {};
          const existingQuantityUsers = todayQuantityLog.users || {};
          let prevValue = Number(existingQuantityUsers[currentUserId]) || 0;
          let nextValue;
          if (typeof setDone === 'boolean') {
            nextValue = setDone ? targetValue : 0;
          } else if (prevValue >= targetValue) {
            nextValue = 0;
          } else {
            nextValue = Math.min(prevValue + 1, targetValue);
          }
          // Update quantity log for this user
          const nextQuantityUsers = { ...existingQuantityUsers, [currentUserId]: nextValue };
          const nextQuantityEntry = { ...todayQuantityLog, users: nextQuantityUsers };
          updatedLogs.quantity[selectedDateKey] = nextQuantityEntry;
          updateData[`logs.quantity.${selectedDateKey}`] = nextQuantityEntry;

          // Recalculate completion users for group logic from all users' quantities
          // Defensive: always remove current user if their value is below target
          let nextCompletionUsers = {};
          Object.entries(nextQuantityUsers).forEach(([uid, val]) => {
            if (Number(val) >= targetValue) {
              nextCompletionUsers[uid] = true;
            }
          });
          // If current user is below target, ensure they are not in the users map
          if (nextValue < targetValue && nextCompletionUsers[currentUserId]) {
            delete nextCompletionUsers[currentUserId];
          }
          // --- Contributors: merge from Firestore and in-memory log, then add/remove current user ---
          let prevContributors = [];
          if (Array.isArray(latestGoal.logs?.quantity?.[selectedDateKey]?.contributors)) {
            prevContributors = prevContributors.concat(latestGoal.logs.quantity[selectedDateKey].contributors);
          }
          if (Array.isArray(todayQuantityLog.contributors)) {
            prevContributors = prevContributors.concat(todayQuantityLog.contributors);
          }
          // Remove duplicates
          let quantityContributors = new Set(prevContributors);
          if (nextValue > 0) {
            quantityContributors.add(currentUserId);
          } else {
            quantityContributors.delete(currentUserId);
          }
          quantityContributors = Array.from(quantityContributors);

          // --- Contributors: merge from Firestore and in-memory log for completion, then add/remove current user ---
          // Use the already-declared existingCompletionEntry for both contributors merging and completion log update
          let prevCompletionContributors = [];
          if (Array.isArray(latestGoal.logs?.completion?.[selectedDateKey]?.contributors)) {
            prevCompletionContributors = prevCompletionContributors.concat(latestGoal.logs.completion[selectedDateKey].contributors);
          }
          if (Array.isArray(updatedLogs.completion[selectedDateKey]?.contributors)) {
            prevCompletionContributors = prevCompletionContributors.concat(updatedLogs.completion[selectedDateKey].contributors);
          }
          let completionContributors = new Set(prevCompletionContributors);
          if (nextValue >= targetValue) {
            completionContributors.add(currentUserId);
          } else {
            completionContributors.delete(currentUserId);
          }
          completionContributors = Array.from(completionContributors);
          const requiredContributors = Math.max(2, Math.floor(Number(latestGoal?.requiredContributors) || 2));
          isNowDone = Object.keys(nextCompletionUsers).length >= requiredContributors;

          // Now update quantity log
          const { deleteField } = require('firebase/firestore');
          if (quantityContributors.length === 0) {
            // Remove contributors property from in-memory log
            const nextQuantityEntryWithContrib = { ...nextQuantityEntry };
            delete nextQuantityEntryWithContrib.contributors;
            updatedLogs.quantity[selectedDateKey] = nextQuantityEntryWithContrib;
            updateData[`logs.quantity.${selectedDateKey}.contributors`] = deleteField();
            updateData[`logs.quantity.${selectedDateKey}`] = nextQuantityEntryWithContrib;
          } else {
            const nextQuantityEntryWithContrib = { ...nextQuantityEntry, contributors: quantityContributors };
            updatedLogs.quantity[selectedDateKey] = nextQuantityEntryWithContrib;
            updateData[`logs.quantity.${selectedDateKey}`] = nextQuantityEntryWithContrib;
          }

          // Now update completion log
          const existingCompletionEntry = updatedLogs.completion[selectedDateKey] || {};
          if (completionContributors.length === 0) {
            // Remove contributors property from in-memory log
            const nextCompletionEntry = { ...existingCompletionEntry, users: nextCompletionUsers, done: isNowDone };
            delete nextCompletionEntry.contributors;
            updatedLogs.completion[selectedDateKey] = nextCompletionEntry;
            updateData[`logs.completion.${selectedDateKey}.contributors`] = deleteField();
            updateData[`logs.completion.${selectedDateKey}`] = nextCompletionEntry;
          } else {
            const nextCompletionEntry = { ...existingCompletionEntry, users: nextCompletionUsers, done: isNowDone, contributors: completionContributors };
            updatedLogs.completion[selectedDateKey] = nextCompletionEntry;
            updateData[`logs.completion.${selectedDateKey}`] = nextCompletionEntry;
          }

          // Streaks and health
          const { currentStreak, longestStreak } = calculateGoalStreak(latestGoal, updatedLogs, selectedDateKey);
          updateData.currentStreak = currentStreak;
          updateData.longestStreak = longestStreak;
          updateData.healthLevel = getPlantHealthState({ ...latestGoal, logs: updatedLogs }, fromKey(selectedDateKey)).healthLevel;
          // Completions
          const wasDone = !!latestGoal?.logs?.completion?.[selectedDateKey]?.done;
          let growthChange = 0;
          if (isNowDone !== wasDone) growthChange = isNowDone ? 1 : -1;
          if (growthChange !== 0) updateData.totalCompletions = increment(growthChange);
          shouldAwardCompletion = isNowDone && !latestWasDone;
      } else if (isSharedMultiUserFrequency) {
        console.log('[toggleGoalTransaction] Entered SHARED MULTI-USER FREQUENCY branch');
        if (!updatedLogs.completion) updatedLogs.completion = {};
        const existingEntry = updatedLogs.completion[selectedDateKey] || {};
        const existingUsers = existingEntry.users || {};
        let nextUsers;
        if (typeof setDone === 'boolean') {
          nextUsers = { ...existingUsers, [currentUserId]: setDone };
        } else if (existingUsers[currentUserId]) {
          nextUsers = { ...existingUsers, [currentUserId]: false };
        } else {
          nextUsers = { ...existingUsers, [currentUserId]: true };
        }
        const nextContributors = Object.keys(nextUsers).filter((uid) => nextUsers[uid]);
        const dayDone = nextContributors.length > 0;
        if (nextContributors.length === 0) {
          const nextEntry = { ...existingEntry, users: nextUsers, done: dayDone };
          delete nextEntry.contributors;
          updatedLogs.completion[selectedDateKey] = nextEntry;
          updateData[`logs.completion.${selectedDateKey}.contributors`] = deleteField();
          updateData[`logs.completion.${selectedDateKey}.users`] = nextUsers;
          updateData[`logs.completion.${selectedDateKey}.done`] = dayDone;
        } else {
          const nextEntry = { ...existingEntry, users: nextUsers, done: dayDone, contributors: nextContributors };
          updatedLogs.completion[selectedDateKey] = nextEntry;
          updateData[`logs.completion.${selectedDateKey}`] = nextEntry;
        }
        isNowDone = isGoalDoneForPeriod({ ...latestGoal, logs: updatedLogs }, selectedDateKey);
        shouldAwardCompletion = isNowDone && !latestWasDone;
      } else if (isSharedMultiUserPeriodQuantity) {
        console.log('[toggleGoalTransaction] Entered SHARED MULTI-USER PERIOD QUANTITY branch');
        if (!updatedLogs.quantity) updatedLogs.quantity = {};
        if (!updatedLogs.completion) updatedLogs.completion = {};
        const periodTarget = getPeriodTarget(latestGoal);
        const todayQuantityLog = updatedLogs.quantity[selectedDateKey] || {};
        const existingUsers = todayQuantityLog.users || {};
        // Current user's period progress before this tap (includes today's existing value).
        const userPeriodProgress = getPeriodProgress({ ...latestGoal, logs: updatedLogs }, selectedDateKey, currentUserId);
        const prevDayValue = Number(existingUsers[currentUserId]) || 0;
        let nextDayValue;
        if (typeof setDone === 'boolean') {
          nextDayValue = setDone ? prevDayValue + 1 : 0;
        } else if (userPeriodProgress >= periodTarget) {
          nextDayValue = 0;
        } else {
          nextDayValue = prevDayValue + 1;
        }
        const nextUsers = { ...existingUsers, [currentUserId]: nextDayValue };
        const dayContributors = Object.keys(nextUsers).filter((uid) => Number(nextUsers[uid]) > 0);
        const nextQuantityEntry = { ...todayQuantityLog, users: nextUsers };
        if (dayContributors.length > 0) {
          nextQuantityEntry.contributors = dayContributors;
        } else {
          delete nextQuantityEntry.contributors;
        }
        updatedLogs.quantity[selectedDateKey] = nextQuantityEntry;
        updateData[`logs.quantity.${selectedDateKey}`] = nextQuantityEntry;

        // Mirror today's contributors into the completion log so badges / ContributorsTodaySection work.
        isNowDone = isGoalDoneForPeriod({ ...latestGoal, logs: updatedLogs }, selectedDateKey);
        if (dayContributors.length > 0) {
          const completionEntry = {
            ...(updatedLogs.completion[selectedDateKey] || {}),
            contributors: dayContributors,
            done: isNowDone,
          };
          updatedLogs.completion[selectedDateKey] = completionEntry;
          updateData[`logs.completion.${selectedDateKey}`] = completionEntry;
        } else {
          const completionEntry = { ...(updatedLogs.completion[selectedDateKey] || {}), done: isNowDone };
          delete completionEntry.contributors;
          updatedLogs.completion[selectedDateKey] = completionEntry;
          updateData[`logs.completion.${selectedDateKey}.contributors`] = deleteField();
          updateData[`logs.completion.${selectedDateKey}.done`] = isNowDone;
        }
        shouldAwardCompletion = isNowDone && !latestWasDone;
      } else if ((latestGoal.type || latestGoal.kind) === "completion") {
        console.log('[toggleGoalTransaction] Entered SINGLE-USER COMPLETION branch');
        if (!updatedLogs.completion) updatedLogs.completion = {};
        isNowDone = typeof setDone === 'boolean' ? setDone : !latestWasDone;
        // For shared (non-multi-user) completion goals, update contributors
        if (isSharedGoalView) {
          const { deleteField } = require('firebase/firestore');
          if (isNowDone) {
            // Always set contributors to [currentUserId] for this day
            updatedLogs.completion[selectedDateKey] = { done: isNowDone, contributors: [currentUserId] };
            updateData[`logs.completion.${selectedDateKey}`] = updatedLogs.completion[selectedDateKey];
          } else {
            updatedLogs.completion[selectedDateKey] = { done: isNowDone };
            updateData[`logs.completion.${selectedDateKey}.contributors`] = deleteField();
            updateData[`logs.completion.${selectedDateKey}.done`] = isNowDone;
          }
        } else {
          updatedLogs.completion[selectedDateKey] = { done: isNowDone, contributors: isNowDone ? [currentUserId] : [] };
          updateData[`logs.completion.${selectedDateKey}`] = updatedLogs.completion[selectedDateKey];
        }
        shouldAwardCompletion = isNowDone && !latestWasDone;
      } else if ((latestGoal.type || latestGoal.kind) === "frequency") {
        console.log('[toggleGoalTransaction] Entered SINGLE-USER FREQUENCY branch');
        if (!updatedLogs.completion) updatedLogs.completion = {};
        const wasDoneToday = !!updatedLogs.completion[selectedDateKey]?.done;
        const nextDoneToday = typeof setDone === 'boolean' ? setDone : !wasDoneToday;
        updatedLogs.completion[selectedDateKey] = {
          ...(updatedLogs.completion[selectedDateKey] || {}),
          done: nextDoneToday,
        };
        updateData[`logs.completion.${selectedDateKey}.done`] = nextDoneToday;
        isNowDone = isGoalDoneForPeriod({ ...latestGoal, logs: updatedLogs }, selectedDateKey);
        shouldAwardCompletion = isNowDone && !latestWasDone;
      } else if ((latestGoal.type || latestGoal.kind) === "periodQuantity") {
        console.log('[toggleGoalTransaction] Entered SINGLE-USER PERIOD QUANTITY branch');
        if (!updatedLogs.quantity) updatedLogs.quantity = {};
        const periodAlreadyDone = isGoalDoneForPeriod(latestGoal, selectedDateKey);
        const currentDayValue = Math.max(0, Number(updatedLogs.quantity[selectedDateKey]?.value) || 0);
        let nextValue;
        if (typeof setDone === 'boolean') {
          nextValue = setDone ? currentDayValue + 1 : 0;
        } else if (periodAlreadyDone) {
          // Period quota already met: tapping clears today's contribution.
          nextValue = 0;
        } else if (forceComplete) {
          nextValue = currentDayValue + Math.max(1, getPeriodTarget(latestGoal));
        } else {
          nextValue = currentDayValue + 1;
        }
        updatedLogs.quantity[selectedDateKey] = {
          ...(updatedLogs.quantity[selectedDateKey] || {}),
          value: nextValue,
        };
        updateData[`logs.quantity.${selectedDateKey}`] = updatedLogs.quantity[selectedDateKey];
        isNowDone = isGoalDoneForPeriod({ ...latestGoal, logs: updatedLogs }, selectedDateKey);
        shouldAwardCompletion = isNowDone && !latestWasDone;
      } else {
         console.log('[toggleGoalTransaction] Entered SINGLE-USER QUANTITY branch');
         if (!updatedLogs.quantity) updatedLogs.quantity = {};
         const targetValue = Math.max(1, Math.floor(Number(latestGoal.measurable?.target) || 1));
         const currentValue = Math.max(
           0,
           Math.min(Number(updatedLogs.quantity?.[selectedDateKey]?.value) || 0, targetValue)
         );
         const nextValue = typeof setDone === 'boolean'
           ? (setDone ? targetValue : 0)
           : latestWasDone
             ? 0
             : forceComplete
               ? targetValue
               : Math.min(currentValue + 1, targetValue);
         updatedLogs.quantity[selectedDateKey] = { value: nextValue };
         updateData[`logs.quantity.${selectedDateKey}`] = updatedLogs.quantity[selectedDateKey];
         isNowDone = nextValue >= targetValue;
         // Always update completion for shared (non-multi-user) quantity goals
         if (isSharedGoalView && (latestGoal.type === "quantity" || latestGoal.kind === "quantity") && !latestGoal.multiUserWateringEnabled) {
           if (!updatedLogs.completion) updatedLogs.completion = {};
           // Explicitly delete users property using FieldValue.delete()
           console.log('[toggleGoalTransaction] Firestore deleteField:', deleteField, 'typeof:', typeof deleteField);
           const delVal = deleteField();
           console.log('[toggleGoalTransaction] Setting updateData logs.completion.' + selectedDateKey + '.users to:', delVal, 'typeof:', typeof delVal);
           updateData[`logs.completion.${selectedDateKey}.users`] = delVal;
           updateData[`logs.completion.${selectedDateKey}.done`] = isNowDone;
           // Also update the in-memory logs for consistency
           if (updatedLogs.completion[selectedDateKey] && updatedLogs.completion[selectedDateKey].users) {
             delete updatedLogs.completion[selectedDateKey].users;
           }
           // --- Contributors: merge from Firestore and in-memory log, then add/remove current user ---
           let prevContributors = [];
           if (Array.isArray(latestGoal.logs?.completion?.[selectedDateKey]?.contributors)) {
             prevContributors = prevContributors.concat(latestGoal.logs.completion[selectedDateKey].contributors);
           }
           if (Array.isArray(updatedLogs.completion[selectedDateKey]?.contributors)) {
             prevContributors = prevContributors.concat(updatedLogs.completion[selectedDateKey].contributors);
           }
           let contributorsSet = new Set(prevContributors);
           const value = updatedLogs.quantity[selectedDateKey]?.value || 0;
           if (value > 0) {
             contributorsSet.add(currentUserId);
             updatedLogs.completion[selectedDateKey] = { done: isNowDone, contributors: Array.from(contributorsSet) };
             updateData[`logs.completion.${selectedDateKey}`] = updatedLogs.completion[selectedDateKey];
           } else {
             // Unchecking: remove all contributors for the day
             updateData[`logs.completion.${selectedDateKey}.contributors`] = deleteField();
             updateData[`logs.completion.${selectedDateKey}.done`] = isNowDone;
             if (updatedLogs.completion[selectedDateKey]) {
               delete updatedLogs.completion[selectedDateKey].contributors;
               updatedLogs.completion[selectedDateKey].done = isNowDone;
             } else {
               updatedLogs.completion[selectedDateKey] = { done: isNowDone };
             }
           }
         }
         shouldAwardCompletion = isNowDone && !latestWasDone;
      }

      // Health, streaks, completions (for all cases)
      const streakHealthRefKey = typeof setDone === 'boolean' ? toKey(new Date()) : selectedDateKey;
      const healthGoalObj = { ...latestGoal, logs: updatedLogs };
      if (latestGoal?.shelfPosition || shelfPosition) {
        healthGoalObj.shelfPosition = latestGoal?.shelfPosition || shelfPosition;
      }
      const dayHealthLevel = getPlantHealthState(healthGoalObj, fromKey(selectedDateKey)).healthLevel;
      const safeDayHealthLevel = Number.isFinite(dayHealthLevel) ? dayHealthLevel : 1;
      updatedLogs.healthHistory[selectedDateKey] = safeDayHealthLevel;
      updateData[`logs.healthHistory.${selectedDateKey}`] = safeDayHealthLevel;
      const isPeriodicType = (latestGoal.type || latestGoal.kind) === "frequency" || (latestGoal.type || latestGoal.kind) === "periodQuantity";
      const growthChange = isNowDone === latestWasDone ? 0 : isNowDone ? 1 : -1;
      const { currentStreak, longestStreak } = calculateGoalStreak(latestGoal, updatedLogs, streakHealthRefKey);
      const healthGoalObj2 = { ...latestGoal, logs: updatedLogs };
      if (latestGoal?.shelfPosition || shelfPosition) {
        healthGoalObj2.shelfPosition = latestGoal?.shelfPosition || shelfPosition;
      }
      const recalculatedHealth2 = getPlantHealthState(healthGoalObj2, fromKey(streakHealthRefKey)).healthLevel;
      const safeHealthLevel2 = Number.isFinite(recalculatedHealth2) ? recalculatedHealth2 : 1;
      updateData.currentStreak = currentStreak;
      updateData.longestStreak = longestStreak;
      if (isPeriodicType) {
        updateData.totalCompletions = countActiveDays(latestGoal, updatedLogs);
      } else if (growthChange !== 0) {
        updateData.totalCompletions = increment(growthChange);
      }
      updateData.healthLevel = safeHealthLevel2;
      updateData[`logs.healthHistory.${selectedDateKey}`] = updatedLogs.healthHistory[selectedDateKey];
      updateData[`logs.frozenDays`] = updatedLogs.frozenDays;
      // Unified health log: logs/health/{dateKey} with health, frozen, done, timestamp
      // Store health log as a map under logs.health.{dateKey} in the goal document
      if (typeof selectedDateKey === 'string' && /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(selectedDateKey)) {
        const { currentStreak: dayStreak } = calculateGoalStreak(latestGoal, updatedLogs, selectedDateKey);
        updateData[`logs.health.${selectedDateKey}`] = {
          health: safeDayHealthLevel,
          frozen: !!latestGoal.isFrozenTrophyState,
          done: !!isNowDone,
          streak: latestGoal?.isFrozenTrophyState && typeof latestGoal.frozenCurrentStreak === 'number'
            ? latestGoal.frozenCurrentStreak
            : dayStreak,
          timestamp: new Date(),
        };
      } else {
        console.error('Invalid selectedDateKey for Firestore field path:', selectedDateKey);
      }
      // Debug: print all updateData keys and their types before updating Firestore
      Object.keys(updateData).forEach(k => {
        if (typeof k !== 'string' || k === '[object Object]') {
          console.error('toggleGoalTransaction: Invalid updateData key:', k, typeof k);
        }
      });
      try {
        console.log('toggleGoalTransaction: updateData payload:', JSON.stringify(updateData));
      } catch (e) {
        console.log('toggleGoalTransaction: updateData payload (non-serializable)', updateData);
      }
      tx.update(goalRef, updateData);
      transactionUpdate = updateData;
      latestIsNowDone = isNowDone;
    });
    if (!transactionUpdate) return;
        if (!transactionUpdate) {
          console.error('[toggleGoalTransaction] Early return: No transactionUpdate after transaction');
          return;
        }
    if (isSharedGoalView && goal?.ownerId && goal?.sourceGoalId && transactionUpdate) {
      // Debug: print all transactionUpdate keys and their types before updating Firestore
      Object.keys(transactionUpdate).forEach(k => {
        if (typeof k !== 'string' || k === '[object Object]') {
          console.error('toggleGoalTransaction: Invalid transactionUpdate key:', k, typeof k);
        }
      });
      try {
        console.log('toggleGoalTransaction: transactionUpdate payload:', JSON.stringify(transactionUpdate));
      } catch (e) {
        console.log('toggleGoalTransaction: transactionUpdate payload (non-serializable)', transactionUpdate);
      }
      try {
        await updateDoc(doc(db, "users", goal.ownerId, "goals", goal.sourceGoalId), transactionUpdate);
      } catch (syncError) {
        if (syncError?.code !== "permission-denied") {
          console.error("Error syncing shared goal progress:", syncError);
        }
      }
    }
    if (isSharedGoalView) {
      await updateOverallScoresForSharedGardenMembers(routeSharedGardenId);
    }
    if (!isSharedGoalView && archiveToStorage && latestIsNowDone && !latestWasDone && findFirstOpenStorageSlot) {
      const storageSlot = await findFirstOpenStorageSlot(auth.currentUser.uid, goal.id);
      if (storageSlot) {
        await setDoc(
          doc(db, "users", auth.currentUser.uid, "gardenLayout", goal.id),
          { shelfPosition: storageSlot },
          { merge: true }
        );
      }
    }
    if (clearLocalOptimisticProgress) clearLocalOptimisticProgress();

    if (shouldAwardCompletion && !isSharedGoalView) {
      logAnalyticsEvent("goal_completed", { goal_id: goal.id });

      try {
        await awardGoalCompletionCoins();
      } catch (coinError) {
        console.error("Goal completion coin reward failed:", coinError);
      }
    }

    const todayKey = toKey(new Date());
    const shouldReconcileHealth = typeof setDone === 'boolean'
      ? selectedDateKey <= todayKey
      : selectedDateKey < todayKey;
    if (shouldReconcileHealth) {
      try {
        const freshSnap = await getDoc(goalRef);
        if (freshSnap.exists()) {
          await reconcileGoalHealthLogsFromDate(
            currentUserId,
            { id: freshSnap.id, ...freshSnap.data() },
            selectedDateKey,
            todayKey,
            { goalRef }
          );
        }
        if (isSharedGoalView && goal?.ownerId && goal?.sourceGoalId) {
          const ownerRef = doc(db, "users", goal.ownerId, "goals", goal.sourceGoalId);
          const ownerSnap = await getDoc(ownerRef);
          if (ownerSnap.exists()) {
            await reconcileGoalHealthLogsFromDate(
              goal.ownerId,
              { id: ownerSnap.id, ...ownerSnap.data() },
              selectedDateKey,
              todayKey,
              { goalRef: ownerRef }
            );
          }
        }
      } catch (reconcileError) {
        console.error("[toggleGoalTransaction] Health reconcile after backdate failed:", reconcileError);
      }
    }
  } catch (error) {
    if (clearLocalOptimisticProgress) clearLocalOptimisticProgress();
    console.error("Error toggling goal status (shared):", error);
    throw error;
  }
}
