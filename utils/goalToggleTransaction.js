// Shared goal toggle/update transaction logic for all screens
import { doc, updateDoc, runTransaction, setDoc, increment, arrayUnion, getDoc } from "firebase/firestore";
import { getPlantHealthState, calculateGoalStreak, isGoalDoneForDate } from "../utils/goalState";
import { fromKey } from "../components/GoalsStore";
import { updateOverallScoresForSharedGardenMembers } from "../utils/scoreUtils";
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
}) {
  if (!auth.currentUser || !goal || (shelfPosition?.pageId === STORAGE_PAGE_ID)) return;
  const currentUserId = auth.currentUser.uid;
  let transactionUpdate = null;
  let ownerIdForSync = null;
  let sourceGoalIdForSync = null;

  try {
    // --- Shared Multi-User Logic ---
    const isSharedMultiUserCompletion = isSharedGoalView && (goal?.type === "completion" || goal?.kind === "completion") && !!goal?.multiUserWateringEnabled && goal?.gardenType === "shared";
    const isSharedMultiUserQuantity = isSharedGoalView && (goal?.type === "quantity" || goal?.kind === "quantity") && !!goal?.multiUserWateringEnabled && goal?.gardenType === "shared";
    const isSharedMultiUser = isSharedMultiUserCompletion || isSharedMultiUserQuantity;
    const goalRef = isSharedGoalView
      ? doc(db, "sharedGardens", routeSharedGardenId, "layout", goal.id)
      : doc(db, "users", currentUserId, "goals", goal.id);
    transactionUpdate = null;
    let shouldAwardCompletion = false;
    let latestWasDone = isGoalDoneForDate(goal, selectedDateKey);
    let latestIsNowDone = latestWasDone;

    await runTransaction(db, async (tx) => {
      const snap = await tx.get(goalRef);
      if (!snap.exists()) return;
      const latestGoal = {
        id: snap.id,
        ...snap.data(),
        ...(isSharedGoalView ? { gardenType: "shared", sharedGardenId: routeSharedGardenId } : {}),
      };
      if (latestGoal?.shelfPosition?.pageId === STORAGE_PAGE_ID) return;
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

      if (isSharedMultiUserCompletion) {
        if (!updatedLogs.completion) updatedLogs.completion = {};
        const existingEntry = updatedLogs.completion[selectedDateKey] || {};
        const existingUsers = existingEntry.users || {};
        let nextUsers;
        if (existingUsers[currentUserId]) {
          // Uncheck: remove user
          nextUsers = { ...existingUsers };
          delete nextUsers[currentUserId];
        } else {
          // Check: add user
          nextUsers = { ...existingUsers, [currentUserId]: true };
        }
        const allContributors = Array.isArray(latestGoal.contributors)
          ? latestGoal.contributors
          : Object.keys(nextUsers);
        const requiredContributors = Math.max(2, Math.floor(Number(latestGoal?.requiredContributors) || 2));
        const uniqueCount = allContributors.filter((userId) => !!nextUsers[userId]).length;
        isNowDone = uniqueCount >= requiredContributors;
        updatedLogs.completion[selectedDateKey] = { ...existingEntry, users: nextUsers, done: isNowDone };
        updateData[`logs.completion.${selectedDateKey}`] = updatedLogs.completion[selectedDateKey];
        shouldAwardCompletion = isNowDone && !latestWasDone;
      } else if (isSharedMultiUserQuantity) {
        if (!updatedLogs.quantity) updatedLogs.quantity = {};
        const targetValue = Math.max(1, Math.floor(Number(latestGoal.measurable?.target) || 1));
        const todayQuantityLog = updatedLogs.quantity[selectedDateKey] || {};
        const existingUsers = todayQuantityLog.users || {};
        let prevValue = Number(existingUsers[currentUserId]) || 0;
        let nextValue;
        if (prevValue >= targetValue) {
          // If already at target, reset to 0 (toggle off)
          nextValue = 0;
        } else {
          // Otherwise, increment by 1
          nextValue = Math.min(prevValue + 1, targetValue);
        }
        const nextUsers = { ...existingUsers, [currentUserId]: nextValue };
        const allContributors = Array.isArray(latestGoal.contributors)
          ? latestGoal.contributors
          : Object.keys(nextUsers);
        const requiredContributors = Math.max(2, Math.floor(Number(latestGoal?.requiredContributors) || 2));
        const userDoneCount = allContributors.filter((userId) => Number(nextUsers[userId]) >= targetValue).length;
        isNowDone = userDoneCount >= requiredContributors;
        const nextEntry = { ...todayQuantityLog, users: nextUsers, done: isNowDone };
        updatedLogs.quantity[selectedDateKey] = nextEntry;
        updateData[`logs.quantity.${selectedDateKey}`] = nextEntry;
        // Streaks and health
        const { currentStreak, longestStreak } = calculateGoalStreak(latestGoal, updatedLogs, selectedDateKey);
        updateData.currentStreak = currentStreak;
        updateData.longestStreak = longestStreak;
        updateData.healthLevel = getPlantHealthState({ ...latestGoal, logs: updatedLogs }, fromKey(selectedDateKey)).healthLevel;
        // Completions
        const wasDone = !!latestGoal?.logs?.quantity?.[selectedDateKey]?.done;
        let growthChange = 0;
        if (isNowDone !== wasDone) growthChange = isNowDone ? 1 : -1;
        if (growthChange !== 0) updateData.totalCompletions = increment(growthChange);
        shouldAwardCompletion = isNowDone && !latestWasDone;
      } else if ((latestGoal.type || latestGoal.kind) === "completion") {
        if (!updatedLogs.completion) updatedLogs.completion = {};
        isNowDone = !latestWasDone;
        updatedLogs.completion[selectedDateKey] = { done: isNowDone };
        updateData[`logs.completion.${selectedDateKey}`] = updatedLogs.completion[selectedDateKey];
        shouldAwardCompletion = isNowDone && !latestWasDone;
      } else {
        if (!updatedLogs.quantity) updatedLogs.quantity = {};
        const targetValue = Math.max(1, Math.floor(Number(latestGoal.measurable?.target) || 1));
        const currentValue = Math.max(
          0,
          Math.min(Number(updatedLogs.quantity?.[selectedDateKey]?.value) || 0, targetValue)
        );
        const nextValue = latestWasDone
          ? 0
          : Math.min(currentValue + 1, targetValue);
        updatedLogs.quantity[selectedDateKey] = { value: nextValue };
        updateData[`logs.quantity.${selectedDateKey}`] = updatedLogs.quantity[selectedDateKey];
        isNowDone = nextValue >= targetValue;
        shouldAwardCompletion = isNowDone && !latestWasDone;
      }

      // Health, streaks, completions (for all cases)
      const healthGoalObj = { ...latestGoal, logs: updatedLogs };
      if (latestGoal?.shelfPosition || shelfPosition) {
        healthGoalObj.shelfPosition = latestGoal?.shelfPosition || shelfPosition;
      }
      const recalculatedHealth = getPlantHealthState(healthGoalObj, fromKey(selectedDateKey)).healthLevel;
      const safeHealthLevel = Number.isFinite(recalculatedHealth) ? recalculatedHealth : 1;
      updatedLogs.healthHistory[selectedDateKey] = safeHealthLevel;
      updateData[`logs.healthHistory.${selectedDateKey}`] = safeHealthLevel;
      const growthChange = isNowDone === latestWasDone ? 0 : isNowDone ? 1 : -1;
      const { currentStreak, longestStreak } = calculateGoalStreak(latestGoal, updatedLogs, selectedDateKey);
      const healthGoalObj2 = { ...latestGoal, logs: updatedLogs };
      if (latestGoal?.shelfPosition || shelfPosition) {
        healthGoalObj2.shelfPosition = latestGoal?.shelfPosition || shelfPosition;
      }
      const recalculatedHealth2 = getPlantHealthState(healthGoalObj2, fromKey(selectedDateKey)).healthLevel;
      const safeHealthLevel2 = Number.isFinite(recalculatedHealth2) ? recalculatedHealth2 : 1;
      updateData.currentStreak = currentStreak;
      updateData.longestStreak = longestStreak;
      if (growthChange !== 0) {
        updateData.totalCompletions = increment(growthChange);
      }
      updateData.healthLevel = safeHealthLevel2;
      updateData[`logs.healthHistory.${selectedDateKey}`] = updatedLogs.healthHistory[selectedDateKey];
      updateData[`logs.frozenDays`] = updatedLogs.frozenDays;
      tx.update(goalRef, updateData);
      transactionUpdate = updateData;
      latestIsNowDone = isNowDone;
    });
    if (!transactionUpdate) return;
    if (isSharedGoalView && goal?.ownerId && goal?.sourceGoalId && transactionUpdate) {
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
  } catch (error) {
    if (clearLocalOptimisticProgress) clearLocalOptimisticProgress();
    console.error("Error toggling goal status (shared):", error);
    throw error;
  }
}
