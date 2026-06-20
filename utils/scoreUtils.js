import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../firebaseConfig";
import { callCloudFunction } from "./cloudFunctions";

const TROPHY_SCORE_BONUS = {
  bronze: 20,
  silver: 45,
  gold: 85,
  platinum: 110,
};

export function getGoalTrophyRating(goal) {
  const longestStreak = Number(goal?.longestStreak) || 0;
  const healthLevel = Number(goal?.healthLevel) || 0;

  if (longestStreak >= 24 && healthLevel >= 5) return "platinum";
  if (longestStreak >= 18 && healthLevel >= 4) return "gold";
  if (longestStreak >= 7 && healthLevel >= 3) return "silver";
  return "bronze";
}

export function calculateGoalScore(goal) {
  const currentStreak = Number(goal?.currentStreak) || 0;
  const longestStreak = Number(goal?.longestStreak) || 0;
  const trophyRating = getGoalTrophyRating(goal);
  const trophyBonus = TROPHY_SCORE_BONUS[trophyRating] || 0;
  return (currentStreak * 8) + (longestStreak * 4) + trophyBonus;
}

export async function getScoredGoalsForUser(uid, { includeSharedGardens = true } = {}) {
  const personalGoalsSnap = await getDocs(collection(db, "users", uid, "goals"));
  const personalGoals = personalGoalsSnap.docs
    .map((goalDoc) => ({ id: goalDoc.id, ...goalDoc.data() }))
    .filter((goal) => !(goal?.gardenType === "shared" || !!goal?.sharedGardenId));

  if (!includeSharedGardens) {
    return personalGoals;
  }

  const sharedGardensSnap = await getDocs(
    query(collection(db, "sharedGardens"), where("memberIds", "array-contains", uid))
  );

  const sharedGoalGroups = await Promise.all(
    sharedGardensSnap.docs.map(async (gardenDoc) => {
      const layoutSnap = await getDocs(collection(db, "sharedGardens", gardenDoc.id, "layout"));
      return layoutSnap.docs.map((layoutDoc) => ({
        id: layoutDoc.id,
        ...layoutDoc.data(),
        gardenType: "shared",
        sharedGardenId: gardenDoc.id,
      }));
    })
  );

  return [...personalGoals, ...sharedGoalGroups.flat()];
}

export async function calculateOverallScoreForUser(uid) {
  if (!uid) return 0;
  const goals = await getScoredGoalsForUser(uid);
  return goals.reduce((total, goal) => total + calculateGoalScore(goal), 0);
}

export async function updateOverallScoreForUser(uid) {
  if (!uid) return 0;

  try {
    const result = await callCloudFunction("recalculateOverallScore", { targetUid: uid });
    return typeof result?.score === "number" ? result.score : 0;
  } catch (error) {
    console.error("Failed to recalculate overall score", error);
    try {
      return await calculateOverallScoreForUser(uid);
    } catch {
      return 0;
    }
  }
}

export async function updateOverallScoresForSharedGardenMembers(gardenId) {
  if (!gardenId) return [];

  try {
    const result = await callCloudFunction("recalculateSharedGardenScores", { gardenId });
    if (Array.isArray(result?.scores)) {
      return result.scores.map((entry) => entry.score);
    }
    return typeof result?.score === "number" ? [result.score] : [];
  } catch (error) {
    console.error("Failed to recalculate shared garden scores", error);
    return [];
  }
}
