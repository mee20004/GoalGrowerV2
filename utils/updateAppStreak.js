import { doc, getDoc, updateDoc, setDoc } from "firebase/firestore";
import { db } from "../firebaseConfig";

/**
 * Updates the user's app streak in Firestore.
 * Increments streak if last day was yesterday, resets if missed, or sets to 1 if first time.
 * @param {string} userId
 * @param {string} todayKey - YYYY-MM-DD
 */
export async function updateAppStreak(userId, todayKey) {
  if (!userId) return;
  const userRef = doc(db, "users", userId);
  const userSnap = await getDoc(userRef);
  let streakCount = 1;
  let lastStreakDate = todayKey;
  if (userSnap.exists()) {
    const data = userSnap.data();
    const prevDate = data.lastStreakDate;
    const prevStreak = Number(data.streakCount) || 0;
    if (prevDate) {
      const prev = new Date(prevDate);
      const today = new Date(todayKey);
      const diff = Math.round((today - prev) / (1000 * 60 * 60 * 24));
      if (diff === 1) {
        streakCount = prevStreak + 1;
      } else if (diff === 0) {
        streakCount = prevStreak;
      } else {
        streakCount = 1;
      }
    }
  }
  await updateDoc(userRef, { streakCount, lastStreakDate: todayKey });
  return streakCount;
}
