import { collection, doc, getDoc, getDocs, query, updateDoc, where } from "firebase/firestore";
import { db } from "../firebaseConfig";

const TROPHY_SCORE_BONUS = {
  bronze: 20,
  silver: 45,
  gold: 85,
  platinum: 110,
};

export function getGoalTrophyRating(goal) {
  const longestStreak = Number(goal?.longestStreak) || 0;
  const healthLevel = Number(goal?.healthLevel) || 0;

  if (longestStreak >= 24 && healthLevel >= 3) return "platinum";
  if (longestStreak >= 18 && healthLevel >= 3) return "gold";
  if (longestStreak >= 7 && healthLevel >= 2) return "silver";
  return "bronze";
}

export function calculateGoalScore(goal) {
  const currentStreak = Number(goal?.currentStreak) || 0;
  const longestStreak = Number(goal?.longestStreak) || 0;
  const trophyRating = getGoalTrophyRating(goal);
  const trophyBonus = TROPHY_SCORE_BONUS[trophyRating] || 0;
  return (currentStreak * 8) + (longestStreak * 4) + trophyBonus;
}

async function getScoredGoalsForUser(uid) {
  const personalGoalsSnap = await getDocs(collection(db, "users", uid, "goals"));
  const personalGoals = personalGoalsSnap.docs
    .map((goalDoc) => ({ id: goalDoc.id, ...goalDoc.data() }))
    .filter((goal) => !(goal?.gardenType === "shared" || !!goal?.sharedGardenId));

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

  const userRef = doc(db, "users", uid);
  const userSnap = await getDoc(userRef);
  if (!userSnap.exists()) return 0;

  const calculatedScore = await calculateOverallScoreForUser(uid);
  const currentData = userSnap.data() || {};
  if (currentData.overallScore !== calculatedScore) {
    await updateDoc(userRef, { overallScore: calculatedScore });
  }

  return calculatedScore;
}

export async function updateOverallScoresForSharedGardenMembers(gardenId) {
  if (!gardenId) return [];

  const gardenSnap = await getDoc(doc(db, "sharedGardens", gardenId));
  if (!gardenSnap.exists()) return [];

  const memberIds = Array.isArray(gardenSnap.data()?.memberIds) ? gardenSnap.data().memberIds : [];
  return Promise.all(memberIds.map((memberId) => updateOverallScoreForUser(memberId)));
}
