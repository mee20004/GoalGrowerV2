import { TUTORIAL_STEP_MODES, TUTORIAL_TARGET_KEYS } from "./constants";
import { TUTORIAL_WELCOME_PLANT_IMAGE } from "./welcomeAssets";
import {
  TUTORIAL_GROWTH_STAGE_END,
  TUTORIAL_GROWTH_STAGE_START,
  TUTORIAL_HEALTHY_PLANT_IMAGE,
  TUTORIAL_WILTING_PLANT_IMAGE,
} from "./educationAssets";

// Onboarding step sequence
export const TUTORIAL_STEPS = [
  {
    id: "welcome",
    index: 0,
    mode: TUTORIAL_STEP_MODES.CENTERED,
    title: "Welcome to GoalGrower",
    description:
      "Turn your goals into plants. As you make progress, your garden grows with you.",
    targetKey: null,
    navigation: null,
    requiresUserAction: false,
    imageSource: TUTORIAL_WELCOME_PLANT_IMAGE,
    variant: "welcome",
  },
  {
    id: "highlight-add-goal",
    index: 1,
    mode: TUTORIAL_STEP_MODES.HIGHLIGHT,
    title: "Create your first goal",
    description: "Tap the + button to plant your first goal.",
    targetKey: TUTORIAL_TARGET_KEYS.ADD_GOAL_FAB,
    navigation: {
      tab: "Goals",
      screen: "GoalsHome",
    },
    requiresUserAction: true,
    advanceOn: TUTORIAL_TARGET_KEYS.ADD_GOAL_FAB,
  },
  {
    id: "goal-creation",
    index: 2,
    mode: TUTORIAL_STEP_MODES.FLOW,
    title: "Set up your goal",
    description:
      "Choose a plant, name your goal, and pick when you want to work on it.",
    targetKey: TUTORIAL_TARGET_KEYS.GOAL_CREATION,
    navigation: {
      tab: "Goals",
      screen: "AddGoal",
    },
    requiresUserAction: false,
    cardPlacement: "top",
  },
  {
    id: "plant-growth",
    index: 3,
    mode: TUTORIAL_STEP_MODES.HIGHLIGHT,
    title: "Watch your plants grow",
    description:
      "Plants grow through stages as you complete goals. Keep going to reach full bloom.",
    targetKey: TUTORIAL_TARGET_KEYS.PLANT_GROWTH,
    navigation: {
      tab: "Journey",
      screen: "JourneyHome",
    },
    requiresUserAction: false,
    cardPlacement: "top",
    comparisonImages: {
      leftSource: TUTORIAL_GROWTH_STAGE_START,
      rightSource: TUTORIAL_GROWTH_STAGE_END,
      leftLabel: "Early stage",
      rightLabel: "Full bloom",
    },
  },
  {
    id: "consistency",
    index: 4,
    mode: TUTORIAL_STEP_MODES.HIGHLIGHT,
    title: "Stay consistent",
    description:
      "Missing goals can cause plants to wilt. Check in regularly to keep your garden healthy.",
    targetKey: TUTORIAL_TARGET_KEYS.PLANT_HEALTH,
    navigation: {
      tab: "Garden",
      screen: "GardenHome",
    },
    requiresUserAction: false,
    cardPlacement: "top",
    comparisonImages: {
      leftSource: TUTORIAL_HEALTHY_PLANT_IMAGE,
      rightSource: TUTORIAL_WILTING_PLANT_IMAGE,
      leftLabel: "Healthy",
      rightLabel: "Wilting",
    },
  },
  {
    id: "completion",
    index: 5,
    mode: TUTORIAL_STEP_MODES.CENTERED,
    title: "You're ready to grow",
    description: "You've earned your first trophy. Your garden journey starts now.",
    targetKey: null,
    navigation: null,
    requiresUserAction: false,
  },
];

export const TUTORIAL_STEP_COUNT = TUTORIAL_STEPS.length;

// Step lookups
export function getTutorialStepById(stepId) {
  return TUTORIAL_STEPS.find((step) => step.id === stepId) ?? null;
}

export function getTutorialStepByIndex(index) {
  if (index < 0 || index >= TUTORIAL_STEPS.length) return null;
  return TUTORIAL_STEPS[index];
}
