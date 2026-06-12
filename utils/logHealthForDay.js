
import { db } from '../firebaseConfig';
import { doc, setDoc } from 'firebase/firestore';

/**
 * Logs the health state for a goal on a specific day.
 * @param {string} userId - The user's unique ID.
 * @param {string} goalId - The goal's unique ID.
 * @param {string} dateKey - The date in YYYY-MM-DD format.
 * @param {number} health - The health level for the day.
 * @param {boolean} frozen - Whether the plant is frozen on this day.
 * @param {boolean} done - Whether the goal was completed on this day.
 * @param {number} [streak] - Optional per-goal streak at write time.
 */
export async function logHealthForDay(userId, goalId, dateKey, health, frozen, done, streak) {
  if (!userId || !goalId || !dateKey) {
    console.error('[logHealthForDay] Missing parameter:', { userId, goalId, dateKey });
    return;
  }
  // Write health log as a nested field in logs.health.{dateKey} using updateDoc with a string path
  console.log('[logHealthForDay] Writing health log as nested field (updateDoc string path)', {
    path: `users/${userId}/goals/${goalId} logs.health.${dateKey}`,
    userId,
    goalId,
    dateKey,
    health,
    frozen,
    done
  });
  const ref = doc(db, 'users', userId, 'goals', goalId);
  const { updateDoc } = require('firebase/firestore');
  try {
    const healthEntry = {
      health,
      frozen,
      done,
      timestamp: new Date(),
    };
    if (typeof streak === "number") {
      healthEntry.streak = streak;
    }
    await updateDoc(ref, {
      [`logs.health.${dateKey}`]: healthEntry,
      [`logs.healthHistory.${dateKey}`]: health,
    });
    console.log('[logHealthForDay] updateDoc completed', { userId, goalId, dateKey });
  } catch (err) {
    console.error('[logHealthForDay] updateDoc error', err.message || String(err));
  }
}
