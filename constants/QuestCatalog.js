import { JOURNEY_ACHIEVEMENT_COINS } from "./ShopCatalog";

function clampProgress(progress, target) {
  const t = Math.max(1, target);
  const p = Math.max(0, Math.min(t, progress));
  return { progress: p, target: t, isComplete: p >= t };
}

function safeNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function countGoalDaysInWeek(ctx, weekKey) {
  if (ctx.weekGoalDaysByKey?.[weekKey] != null) {
    return ctx.weekGoalDaysByKey[weekKey];
  }
  return 0;
}

function countVisitsInWeek(dates = [], weekKey) {
  if (!Array.isArray(dates) || !weekKey) return 0;
  return dates.filter((d) => getWeekKeyFromDateKey(d) === weekKey).length;
}

export function getWeekKeyFromDate(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  const weekNum = 1 + Math.round(
    ((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7
  );
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

export function getWeekKeyFromDateKey(dateKey) {
  if (!dateKey || typeof dateKey !== "string") return "";
  const [y, m, d] = dateKey.split("-").map(Number);
  return getWeekKeyFromDate(new Date(y, (m || 1) - 1, d || 1));
}

export const QUEST_CADENCE = {
  DAILY: "daily",
  WEEKLY: "weekly",
  MILESTONE: "milestone",
};

export const QUEST_MILESTONES = [
  { total: 10, coinReward: 50, id: "quest_milestone_10" },
  { total: 30, coinReward: 100, id: "quest_milestone_30" },
  { total: 50, coinReward: 150, id: "quest_milestone_50" },
];

export const QUEST_CATALOG = [
  // --- Daily ---
  {
    id: "daily_complete_1",
    cadence: QUEST_CADENCE.DAILY,
    category: "today",
    title: "Complete 1 goal",
    description: "Check off any goal scheduled for today.",
    icon: "checkmark-circle-outline",
    coinReward: 10,
    isEligible: (ctx) => ctx.goalsTodayTotal >= 1,
    evaluate: (ctx) => clampProgress(ctx.goalsCompletedToday, 1),
  },
  {
    id: "daily_complete_2",
    cadence: QUEST_CADENCE.DAILY,
    category: "today",
    title: "Complete 2 goals",
    description: "Check off 2 goals scheduled for today.",
    icon: "checkmark-done-outline",
    coinReward: 15,
    isEligible: (ctx) => ctx.goalsTodayTotal >= 2,
    evaluate: (ctx) => clampProgress(ctx.goalsCompletedToday, 2),
  },
  {
    id: "daily_complete_3",
    cadence: QUEST_CADENCE.DAILY,
    category: "today",
    title: "Complete 3 goals",
    description: "Check off 3 goals scheduled for today.",
    icon: "list-outline",
    coinReward: 20,
    isEligible: (ctx) => ctx.goalsTodayTotal >= 3,
    evaluate: (ctx) => clampProgress(ctx.goalsCompletedToday, 3),
  },
  {
    id: "daily_complete_all",
    cadence: QUEST_CADENCE.DAILY,
    category: "today",
    title: "Finish today's list",
    description: "Complete every goal scheduled for today.",
    icon: "ribbon-outline",
    coinReward: 25,
    isEligible: (ctx) => ctx.goalsTodayTotal >= 1,
    evaluate: (ctx) => {
      const target = Math.max(1, ctx.goalsTodayTotal);
      return clampProgress(ctx.goalsCompletedToday, target);
    },
  },
  {
    id: "daily_half_done",
    cadence: QUEST_CADENCE.DAILY,
    category: "today",
    title: "Halfway there",
    description: "Complete at least half of today's goals.",
    icon: "pie-chart-outline",
    coinReward: 12,
    isEligible: (ctx) => ctx.goalsTodayTotal >= 2,
    evaluate: (ctx) => {
      const target = Math.max(1, Math.ceil(ctx.goalsTodayTotal / 2));
      return clampProgress(ctx.goalsCompletedToday, target);
    },
  },
  {
    id: "daily_visit_garden",
    cadence: QUEST_CADENCE.DAILY,
    category: "garden",
    title: "Visit your garden",
    description: "Open the Garden tab today.",
    icon: "leaf-outline",
    coinReward: 10,
    isEligible: () => true,
    evaluate: (ctx) => clampProgress(ctx.visitedGardenToday ? 1 : 0, 1),
  },
  {
    id: "daily_open_journey",
    cadence: QUEST_CADENCE.DAILY,
    category: "journey",
    title: "Check your journey",
    description: "Open the Journey tab today.",
    icon: "map-outline",
    coinReward: 8,
    isEligible: () => true,
    evaluate: (ctx) => clampProgress(ctx.visitedJourneyToday ? 1 : 0, 1),
  },
  {
    id: "daily_streak_alive",
    cadence: QUEST_CADENCE.DAILY,
    category: "streak",
    title: "Keep your streak alive",
    description: "Show up today and keep your app streak going.",
    icon: "flame-outline",
    coinReward: 12,
    isEligible: (ctx) => ctx.goalsTodayTotal >= 1,
    evaluate: (ctx) => clampProgress(ctx.activeToday ? 1 : 0, 1),
  },
  {
    id: "daily_create_goal",
    cadence: QUEST_CADENCE.DAILY,
    category: "today",
    title: "Plant a new goal",
    description: "Create a new goal today.",
    icon: "add-circle-outline",
    coinReward: 15,
    isEligible: () => true,
    evaluate: (ctx) => clampProgress(ctx.createdGoalToday ? 1 : 0, 1),
  },
  {
    id: "daily_early_bird",
    cadence: QUEST_CADENCE.DAILY,
    category: "today",
    title: "Early bird",
    description: "Complete a goal before noon.",
    icon: "sunny-outline",
    coinReward: 15,
    isEligible: (ctx) => ctx.goalsTodayTotal >= 1,
    evaluate: (ctx) => clampProgress(ctx.completedGoalBeforeNoon ? 1 : 0, 1),
  },
  {
    id: "daily_goals_tab",
    cadence: QUEST_CADENCE.DAILY,
    category: "engagement",
    title: "Review your goals",
    description: "Open the Goals tab today.",
    icon: "clipboard-outline",
    coinReward: 8,
    isEligible: () => true,
    evaluate: (ctx) => clampProgress(ctx.visitedGoalsToday ? 1 : 0, 1),
  },
  {
    id: "daily_app_streak_3",
    cadence: QUEST_CADENCE.DAILY,
    category: "streak",
    title: "3-day momentum",
    description: "Maintain at least a 3-day app streak.",
    icon: "trending-up-outline",
    coinReward: 18,
    isEligible: (ctx) => safeNum(ctx.metrics?.appStreak) >= 2,
    evaluate: (ctx) => clampProgress(safeNum(ctx.metrics?.appStreak), 3),
  },
  {
    id: "daily_silver_hunter",
    cadence: QUEST_CADENCE.DAILY,
    category: "trophy",
    title: "Silver spotlight",
    description: "Have at least one silver-rated goal.",
    icon: "medal-outline",
    coinReward: 14,
    isEligible: (ctx) => safeNum(ctx.metrics?.silverGoals) >= 1 || ctx.metrics?.hasSilverGoal,
    evaluate: (ctx) => clampProgress(safeNum(ctx.metrics?.silverGoals) >= 1 ? 1 : 0, 1),
  },
  {
    id: "daily_completion_push",
    cadence: QUEST_CADENCE.DAILY,
    category: "today",
    title: "One more win",
    description: "Complete at least one more goal than yesterday.",
    icon: "arrow-up-circle-outline",
    coinReward: 16,
    isEligible: (ctx) => ctx.goalsTodayTotal >= 1,
    evaluate: (ctx) => {
      const yesterday = Math.max(0, safeNum(ctx.yesterdayCompletedCount));
      const target = yesterday + 1;
      return clampProgress(ctx.goalsCompletedToday, target);
    },
  },
  {
    id: "daily_no_zeros",
    cadence: QUEST_CADENCE.DAILY,
    category: "today",
    title: "No zero days",
    description: "Complete at least one goal if any are scheduled.",
    icon: "shield-checkmark-outline",
    coinReward: 10,
    isEligible: (ctx) => ctx.goalsTodayTotal >= 1,
    evaluate: (ctx) => clampProgress(ctx.goalsCompletedToday >= 1 ? 1 : 0, 1),
  },

  // --- Weekly ---
  {
    id: "weekly_5_goal_days",
    cadence: QUEST_CADENCE.WEEKLY,
    category: "weekly",
    title: "Log 5 goal-days",
    description: "Complete goals on 5 separate days this week.",
    icon: "calendar-outline",
    coinReward: 40,
    isEligible: () => true,
    evaluate: (ctx) => clampProgress(countGoalDaysInWeek(ctx, ctx.weekKey), 5),
  },
  {
    id: "weekly_10_goal_days",
    cadence: QUEST_CADENCE.WEEKLY,
    category: "weekly",
    title: "Log 10 goal-days",
    description: "Complete goals on 10 separate days this week.",
    icon: "calendar-number-outline",
    coinReward: 60,
    isEligible: (ctx) => safeNum(ctx.metrics?.completionDays) >= 5,
    evaluate: (ctx) => clampProgress(countGoalDaysInWeek(ctx, ctx.weekKey), 10),
  },
  {
    id: "weekly_garden_3",
    cadence: QUEST_CADENCE.WEEKLY,
    category: "weekly",
    title: "Garden regular",
    description: "Visit your garden 3 times this week.",
    icon: "flower-outline",
    coinReward: 35,
    isEligible: () => true,
    evaluate: (ctx) => clampProgress(countVisitsInWeek(ctx.gardenVisitDates, ctx.weekKey), 3),
  },
  {
    id: "weekly_streak_5",
    cadence: QUEST_CADENCE.WEEKLY,
    category: "weekly",
    title: "5-day streak",
    description: "Reach a 5-day app streak this week.",
    icon: "flame",
    coinReward: 45,
    isEligible: (ctx) => safeNum(ctx.metrics?.appStreak) >= 3,
    evaluate: (ctx) => clampProgress(safeNum(ctx.metrics?.appStreak), 5),
  },
  {
    id: "weekly_create_goal",
    cadence: QUEST_CADENCE.WEEKLY,
    category: "weekly",
    title: "Grow your garden",
    description: "Create a new goal this week.",
    icon: "sparkles-outline",
    coinReward: 30,
    isEligible: () => true,
    evaluate: (ctx) => clampProgress(ctx.createdGoalThisWeek ? 1 : 0, 1),
  },

  // --- Milestones (one-time) ---
  {
    id: "milestone_create_1",
    cadence: QUEST_CADENCE.MILESTONE,
    category: "milestone",
    title: "Seed Sower",
    description: "Create your first goal.",
    icon: "leaf-outline",
    coinReward: JOURNEY_ACHIEVEMENT_COINS.create_1,
    isEligible: () => true,
    evaluate: (ctx) => clampProgress(safeNum(ctx.metrics?.createdGoals), 1),
  },
  {
    id: "milestone_create_5",
    cadence: QUEST_CADENCE.MILESTONE,
    category: "milestone",
    title: "Goal Architect",
    description: "Create 5 goals.",
    icon: "layers-outline",
    coinReward: JOURNEY_ACHIEVEMENT_COINS.create_5,
    isEligible: () => true,
    evaluate: (ctx) => clampProgress(safeNum(ctx.metrics?.createdGoals), 5),
  },
  {
    id: "milestone_complete_10",
    cadence: QUEST_CADENCE.MILESTONE,
    category: "milestone",
    title: "Momentum",
    description: "Log 10 completed goal-days.",
    icon: "checkmark-done-outline",
    coinReward: JOURNEY_ACHIEVEMENT_COINS.complete_10,
    isEligible: () => true,
    evaluate: (ctx) => clampProgress(safeNum(ctx.metrics?.completionDays), 10),
  },
  {
    id: "milestone_streak_3",
    cadence: QUEST_CADENCE.MILESTONE,
    category: "milestone",
    title: "On a Roll",
    description: "Reach a 3-day app streak.",
    icon: "flame-outline",
    coinReward: 40,
    isEligible: () => true,
    evaluate: (ctx) => clampProgress(safeNum(ctx.metrics?.appStreak), 3),
  },
  {
    id: "milestone_streak_7",
    cadence: QUEST_CADENCE.MILESTONE,
    category: "milestone",
    title: "Week Warrior",
    description: "Reach a 7-day app streak.",
    icon: "flame",
    coinReward: JOURNEY_ACHIEVEMENT_COINS.streak_7,
    isEligible: () => true,
    evaluate: (ctx) => clampProgress(safeNum(ctx.metrics?.appStreak), 7),
  },
  {
    id: "milestone_score_100",
    cadence: QUEST_CADENCE.MILESTONE,
    category: "milestone",
    title: "Century Club",
    description: "Reach an overall score of 100.",
    icon: "medal-outline",
    coinReward: 60,
    isEligible: () => true,
    evaluate: (ctx) => clampProgress(safeNum(ctx.metrics?.overallScore), 100),
  },
  {
    id: "milestone_score_250",
    cadence: QUEST_CADENCE.MILESTONE,
    category: "milestone",
    title: "Rising Legend",
    description: "Reach an overall score of 250.",
    icon: "trophy-outline",
    coinReward: JOURNEY_ACHIEVEMENT_COINS.score_250,
    isEligible: () => true,
    evaluate: (ctx) => clampProgress(safeNum(ctx.metrics?.overallScore), 250),
  },
];

const catalogById = Object.fromEntries(QUEST_CATALOG.map((q) => [q.id, q]));

export function getQuestById(id) {
  return catalogById[id] || null;
}

export function getQuestsByCadence(cadence) {
  return QUEST_CATALOG.filter((q) => q.cadence === cadence);
}

export function evaluateQuest(questId, ctx) {
  const quest = getQuestById(questId);
  if (!quest) return { progress: 0, target: 1, isComplete: false };
  return quest.evaluate(ctx);
}

export function isQuestEligible(quest, ctx) {
  if (!quest?.isEligible) return true;
  try {
    return !!quest.isEligible(ctx);
  } catch {
    return false;
  }
}
