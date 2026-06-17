import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../firebaseConfig";
import { toKey, addDaysKey, fromKey, isScheduledOn, isWithinActiveRange } from "../components/GoalsStore";
import { isGoalDoneForDate } from "../utils/goalState";
import { claimJourneyReward } from "./shopInventory";
import {
  QUEST_CADENCE,
  QUEST_CATALOG,
  QUEST_MILESTONES,
  evaluateQuest,
  getQuestById,
  getQuestsByCadence,
  getWeekKeyFromDate,
  getWeekKeyFromDateKey,
  isQuestEligible,
} from "../constants/QuestCatalog";

const DAILY_QUEST_COUNT = 3;
const QUEST_HISTORY_LIMIT = 14;

function safeArray(arr) {
  return Array.isArray(arr) ? arr : [];
}

function uniqueDates(dates) {
  return [...new Set(safeArray(dates).filter(Boolean))].slice(-21);
}

function addDateToList(dates, dateKey) {
  if (!dateKey) return uniqueDates(dates);
  return uniqueDates([...safeArray(dates), dateKey]);
}

function countCompletionsOnDate(goals, dateKey) {
  let count = 0;
  for (const goal of goals) {
    if (isGoalDoneForDate(goal, dateKey)) count += 1;
  }
  return count;
}

function countGoalDaysInWeekFromGoals(goals, weekKey) {
  const dates = new Set();
  for (const goal of goals) {
    const completion = goal?.logs?.completion || {};
    Object.entries(completion).forEach(([dateKey, entry]) => {
      if (entry?.done && getWeekKeyFromDateKey(dateKey) === weekKey) {
        dates.add(dateKey);
      }
    });
    const numeric = goal?.logs?.numeric || {};
    Object.entries(numeric).forEach(([dateKey, entry]) => {
      if ((entry?.value ?? 0) >= (goal.measurable?.target ?? 0) && getWeekKeyFromDateKey(dateKey) === weekKey) {
        dates.add(dateKey);
      }
    });
  }
  return dates.size;
}

function wasGoalCreatedOnDate(goals, dateKey) {
  return goals.some((goal) => {
    const createdKey = goal?.createdAt ? toKey(new Date(goal.createdAt)) : null;
    return createdKey === dateKey;
  });
}

function wasGoalCreatedInWeek(goals, weekKey) {
  return goals.some((goal) => {
    if (!goal?.createdAt) return false;
    return getWeekKeyFromDate(new Date(goal.createdAt)) === weekKey;
  });
}

function completedBeforeNoonToday(goals, todayKey) {
  const noon = new Date();
  noon.setHours(12, 0, 0, 0);
  const noonMs = noon.getTime();

  return goals.some((goal) => {
    if (!isGoalDoneForDate(goal, todayKey)) return false;
    const completion = goal?.logs?.completion?.[todayKey];
    const completedAt = completion?.completedAt || completion?.at || goal?.logs?.completion?.[todayKey]?.ts;
    if (completedAt) {
      const ts = typeof completedAt === "number" ? completedAt : new Date(completedAt).getTime();
      return Number.isFinite(ts) && ts < noonMs;
    }
    const now = new Date();
    return now.getHours() < 12;
  });
}

export function buildQuestClaimKey(questId, periodKey = "") {
  if (!periodKey) return `quest:${questId}`;
  return `quest:${questId}:${periodKey}`;
}

export function buildQuestContext({
  metrics = {},
  userData = {},
  goals = [],
  todayKey = toKey(new Date()),
}) {
  const weekKey = getWeekKeyFromDate(new Date());
  const yesterdayKey = addDaysKey(todayKey, -1);
  const gardenVisitDates = uniqueDates(userData?.questActivity?.gardenVisitDates);
  const journeyVisitDates = uniqueDates(userData?.questActivity?.journeyVisitDates);
  const goalsVisitDates = uniqueDates(userData?.questActivity?.goalsVisitDates);

  const date = fromKey(todayKey);
  const scheduledToday = goals.filter(
    (g) => isWithinActiveRange(g, date) && isScheduledOn(g, date)
  );

  const goalsTodayTotal = scheduledToday.length;
  const goalsCompletedToday = scheduledToday.filter((g) => isGoalDoneForDate(g, todayKey)).length;
  const yesterdayCompletedCount = countCompletionsOnDate(goals, yesterdayKey);
  const weekGoalDaysByKey = {
    [weekKey]: countGoalDaysInWeekFromGoals(goals, weekKey),
  };

  return {
    todayKey,
    weekKey,
    metrics,
    goals,
    goalsTodayTotal,
    goalsCompletedToday,
    yesterdayCompletedCount,
    visitedGardenToday: gardenVisitDates.includes(todayKey),
    visitedJourneyToday: journeyVisitDates.includes(todayKey),
    visitedGoalsToday: goalsVisitDates.includes(todayKey),
    gardenVisitDates,
    journeyVisitDates,
    goalsVisitDates,
    activeToday: userData?.lastActiveDate === todayKey || safeNum(metrics?.appStreak) >= 1,
    createdGoalToday: wasGoalCreatedOnDate(goals, todayKey),
    createdGoalThisWeek: wasGoalCreatedInWeek(goals, weekKey),
    completedGoalBeforeNoon: completedBeforeNoonToday(goals, todayKey),
    weekGoalDaysByKey,
  };
}

function pickQuestIds(cadence, ctx, previousIds = [], count = 1) {
  const pool = getQuestsByCadence(cadence).filter((q) => isQuestEligible(q, ctx));
  if (!pool.length) return [];

  const categories = ["today", "garden", "streak", "engagement", "journey", "trophy", "weekly"];
  const picked = [];
  const used = new Set(previousIds);

  for (const category of categories) {
    if (picked.length >= count) break;
    const candidates = pool.filter((q) => q.category === category && !used.has(q.id) && !picked.some((p) => p === q.id));
    if (!candidates.length) continue;
    const choice = candidates[Math.floor(Math.random() * candidates.length)];
    picked.push(choice.id);
    used.add(choice.id);
  }

  while (picked.length < count) {
    const remaining = pool.filter((q) => !used.has(q.id));
    if (!remaining.length) break;
    const choice = remaining[Math.floor(Math.random() * remaining.length)];
    picked.push(choice.id);
    used.add(choice.id);
  }

  return picked.slice(0, count);
}

function evaluateQuestState(questIds, ctx, existing = {}) {
  const completed = { ...(existing.completed || {}) };
  const progress = { ...(existing.progress || {}) };

  questIds.forEach((questId) => {
    const result = evaluateQuest(questId, ctx);
    progress[questId] = result.progress;
    if (result.isComplete) {
      completed[questId] = true;
    }
  });

  return { completed, progress };
}

function buildQuestViewModels(state, ctx, claims = {}) {
  const mapQuest = (questId, periodKey, cadence) => {
    const quest = getQuestById(questId);
    if (!quest) return null;
    const evaluation = evaluateQuest(questId, ctx);
    const claimKey = buildQuestClaimKey(questId, periodKey);
    const isComplete = !!state.completed?.[questId] || evaluation.isComplete;
    const isClaimed = !!state.claimed?.[questId] || isQuestClaimed(questId, periodKey, claims);
    return {
      id: questId,
      cadence,
      periodKey,
      claimKey,
      title: quest.title,
      description: quest.description,
      icon: quest.icon,
      coinReward: quest.coinReward,
      progress: evaluation.progress,
      target: evaluation.target,
      isComplete,
      isClaimed,
      canClaim: isComplete && !isClaimed,
    };
  };

  const daily = safeArray(state.dailyQuests?.questIds)
    .map((id) => mapQuest(id, state.dailyQuests?.dateKey, QUEST_CADENCE.DAILY))
    .filter(Boolean);

  const weekly = safeArray(state.weeklyQuests?.questIds)
    .map((id) => mapQuest(id, state.weeklyQuests?.weekKey, QUEST_CADENCE.WEEKLY))
    .filter(Boolean);

  const milestones = getQuestsByCadence(QUEST_CADENCE.MILESTONE)
    .map((quest) => mapQuest(quest.id, "", QUEST_CADENCE.MILESTONE))
    .filter(Boolean);

  const questMilestones = QUEST_MILESTONES.map((m) => {
    const total = safeNum(state.questStats?.totalCompleted);
    const claimKey = buildQuestClaimKey(m.id, "");
    return {
      ...m,
      claimKey,
      progress: Math.min(total, m.total),
      target: m.total,
      isComplete: total >= m.total,
      isClaimed: !!claims[claimKey],
      canClaim: total >= m.total && !claims[claimKey],
    };
  });

  return { daily, weekly, milestones, questMilestones, questHistory: safeArray(state.questHistory) };
}

function safeNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

const LEGACY_MILESTONE_CLAIM_KEYS = {
  milestone_create_1: "achievement:create_1",
  milestone_create_5: "achievement:create_5",
  milestone_complete_10: "achievement:complete_10",
  milestone_streak_7: "achievement:streak_7",
  milestone_score_250: "achievement:score_250",
};

function isQuestClaimed(questId, periodKey, claims = {}) {
  const claimKey = buildQuestClaimKey(questId, periodKey);
  if (claims[claimKey]) return true;
  const legacyKey = LEGACY_MILESTONE_CLAIM_KEYS[questId];
  return !!(legacyKey && claims[legacyKey]);
}

function getUserQuestRef(uid) {
  return doc(db, "users", uid);
}

export async function recordQuestActivity(activityType, dateKey = toKey(new Date())) {
  const uid = auth.currentUser?.uid;
  if (!uid || !activityType) return;

  const userRef = getUserQuestRef(uid);
  const snap = await getDoc(userRef);
  const data = snap.exists() ? snap.data() : {};
  const activity = data.questActivity || {};

  const fieldMap = {
    garden: "gardenVisitDates",
    journey: "journeyVisitDates",
    goals: "goalsVisitDates",
  };
  const field = fieldMap[activityType];
  if (!field) return;

  const nextDates = addDateToList(activity[field], dateKey);
  if (nextDates.length === safeArray(activity[field]).length && nextDates.includes(dateKey)) {
    return;
  }

  await setDoc(
    userRef,
    {
      questActivity: {
        ...activity,
        [field]: nextDates,
      },
    },
    { merge: true }
  );
}

export async function syncQuestState({ metrics, goals, userData: inputUserData }) {
  const uid = auth.currentUser?.uid;
  if (!uid) return null;

  const userRef = getUserQuestRef(uid);
  const snap = await getDoc(userRef);
  const userData = inputUserData || (snap.exists() ? snap.data() : {});
  const todayKey = toKey(new Date());
  const weekKey = getWeekKeyFromDate(new Date());
  const ctx = buildQuestContext({ metrics, userData, goals, todayKey });

  let dailyQuests = userData.dailyQuests || {};
  let weeklyQuests = userData.weeklyQuests || {};
  const claims = userData.journeyRewardClaims || {};
  let questStats = userData.questStats || { totalCompleted: 0 };
  let questHistory = safeArray(userData.questHistory);
  let dirty = false;

  if (dailyQuests.dateKey !== todayKey) {
    const previousIds = safeArray(dailyQuests.questIds);
    dailyQuests = {
      dateKey: todayKey,
      questIds: pickQuestIds(QUEST_CADENCE.DAILY, ctx, previousIds, DAILY_QUEST_COUNT),
      completed: {},
      claimed: {},
      progress: {},
    };
    dirty = true;
  }

  if (weeklyQuests.weekKey !== weekKey) {
    weeklyQuests = {
      weekKey,
      questIds: pickQuestIds(QUEST_CADENCE.WEEKLY, ctx, safeArray(weeklyQuests.questIds), 1),
      completed: {},
      claimed: {},
      progress: {},
    };
    dirty = true;
  }

  const dailyEval = evaluateQuestState(dailyQuests.questIds, ctx, dailyQuests);
  const weeklyEval = evaluateQuestState(weeklyQuests.questIds, ctx, weeklyQuests);

  if (JSON.stringify(dailyEval.completed) !== JSON.stringify(dailyQuests.completed)
    || JSON.stringify(dailyEval.progress) !== JSON.stringify(dailyQuests.progress)) {
    dailyQuests = { ...dailyQuests, ...dailyEval };
    dirty = true;
  }

  if (JSON.stringify(weeklyEval.completed) !== JSON.stringify(weeklyQuests.completed)
    || JSON.stringify(weeklyEval.progress) !== JSON.stringify(weeklyQuests.progress)) {
    weeklyQuests = { ...weeklyQuests, ...weeklyEval };
    dirty = true;
  }

  if (dirty) {
    await setDoc(
      userRef,
      {
        dailyQuests,
        weeklyQuests,
        questStats,
        questHistory,
      },
      { merge: true }
    );
  }

  const state = { dailyQuests, weeklyQuests, questStats, questHistory };
  return buildQuestViewModels(state, ctx, claims);
}

export async function claimQuestReward({
  questId,
  periodKey,
  amount,
  title,
  cadence,
}) {
  const claimKey = buildQuestClaimKey(questId, periodKey);
  const result = await claimJourneyReward(claimKey, amount, `quest_${cadence}`);

  if (!result.claimed && result.reason !== "already_claimed") {
    return result;
  }

  const uid = auth.currentUser?.uid;
  if (!uid) return result;

  const userRef = getUserQuestRef(uid);
  const snap = await getDoc(userRef);
  const data = snap.exists() ? snap.data() : {};
  const quest = getQuestById(questId);

  let dailyQuests = data.dailyQuests || {};
  let weeklyQuests = data.weeklyQuests || {};
  let questStats = data.questStats || { totalCompleted: 0 };
  let questHistory = safeArray(data.questHistory);

  const historyEntry = {
    questId,
    title: title || quest?.title || questId,
    cadence: cadence || quest?.cadence,
    periodKey,
    coinReward: amount,
    completedAt: Date.now(),
  };

  if (cadence === QUEST_CADENCE.DAILY && dailyQuests.dateKey === periodKey) {
    dailyQuests = {
      ...dailyQuests,
      claimed: { ...(dailyQuests.claimed || {}), [questId]: true },
    };
  } else if (cadence === QUEST_CADENCE.WEEKLY && weeklyQuests.weekKey === periodKey) {
    weeklyQuests = {
      ...weeklyQuests,
      claimed: { ...(weeklyQuests.claimed || {}), [questId]: true },
    };
  }

  if (result.claimed) {
    const countsTowardQuestTotal = cadence === QUEST_CADENCE.DAILY || cadence === QUEST_CADENCE.WEEKLY;
    if (countsTowardQuestTotal) {
      questStats = {
        ...questStats,
        totalCompleted: safeNum(questStats.totalCompleted) + 1,
        lastCompletedAt: serverTimestamp(),
      };
      questHistory = [historyEntry, ...questHistory.filter((h) => h.questId !== questId || h.periodKey !== periodKey)]
        .slice(0, QUEST_HISTORY_LIMIT);
    }
  }

  await setDoc(
    userRef,
    {
      dailyQuests,
      weeklyQuests,
      questStats,
      questHistory,
      journeyRewardClaims: { ...(data.journeyRewardClaims || {}), [claimKey]: true },
    },
    { merge: true }
  );

  return result;
}

export async function claimQuestTotalMilestone({ milestone, title }) {
  return claimQuestReward({
    questId: milestone.id,
    periodKey: "",
    amount: milestone.coinReward,
    title: title || `Complete ${milestone.total} quests`,
    cadence: "milestone_total",
  });
}

/** Read-only quest view for another user's journey — no rollover or Firestore writes. */
export function getQuestViewForUserData({ metrics, goals, userData }) {
  const todayKey = toKey(new Date());
  const ctx = buildQuestContext({ metrics, userData, goals, todayKey });
  const claims = userData?.journeyRewardClaims || {};

  let dailyQuests = userData?.dailyQuests || {};
  let weeklyQuests = userData?.weeklyQuests || {};
  const questStats = userData?.questStats || { totalCompleted: 0 };
  const questHistory = safeArray(userData?.questHistory);

  const dailyEval = evaluateQuestState(safeArray(dailyQuests.questIds), ctx, dailyQuests);
  const weeklyEval = evaluateQuestState(safeArray(weeklyQuests.questIds), ctx, weeklyQuests);

  dailyQuests = { ...dailyQuests, ...dailyEval };
  weeklyQuests = { ...weeklyQuests, ...weeklyEval };

  const state = { dailyQuests, weeklyQuests, questStats, questHistory };
  return buildQuestViewModels(state, ctx, claims);
}
