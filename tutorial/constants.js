// Persistence keys
export const ONBOARDING_COMPLETED_KEY = "goalGrower:onboardingCompleted:v1";
export const ONBOARDING_SKIPPED_KEY = "goalGrower:onboardingSkipped:v1";

export function onboardingKeysForUser(userId) {
  const suffix = userId ? `:${userId}` : "";
  return {
    completed: `${ONBOARDING_COMPLETED_KEY}${suffix}`,
    skipped: `${ONBOARDING_SKIPPED_KEY}${suffix}`,
  };
}

// Highlight target refs
export const TUTORIAL_TARGET_KEYS = {
  ADD_GOAL_FAB: "addGoalFab",
  ADD_GOAL_BUTTON: "addGoalButton",
  GOAL_CREATION: "goalCreationFlow",
  PLANT_GROWTH: "plantGrowthArea",
  PLANT_HEALTH: "plantHealthArea",
  JOURNEY_TAB: "journeyTab",
  WATER_DROP: "waterDrop",
};

// Step layout modes
export const TUTORIAL_STEP_MODES = {
  CENTERED: "centered",
  HIGHLIGHT: "highlight",
  FLOW: "flow",
};
