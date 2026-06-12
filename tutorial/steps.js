import { TUTORIAL_STEP_MODES, TUTORIAL_TARGET_KEYS } from "./constants";
import {
  TUTORIAL_GROWTH_STAGE_PLANTS,
  TUTORIAL_HEALTHY_PLANT_IMAGE,
  TUTORIAL_WILTING_PLANT_IMAGE,
} from "./educationAssets";
import { TUTORIAL_WELCOME_PLANT_IMAGE } from "./welcomeAssets";

// Onboarding step sequence (copy aligned with wireframes/welcomeTutorial)
export const TUTORIAL_STEPS = [
  {
    id: "welcome",
    index: 0,
    mode: TUTORIAL_STEP_MODES.CENTERED,
    title: "Welcome to GoalGrower",
    titleLine1: "Welcome to",
    titleLine2: "GoalGrower!",
    heroCaptionLine1: "Grow your goals,",
    heroCaptionLine2: "one step at a time",
    description:
      "Your goals are like plants. Each goal you create becomes a plant in your garden that grows as you make progress.",
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
    title: "Create Your First Goal",
    descriptionParts: [
      { text: "Tap the " },
      { text: "+ Add Goal", accent: true },
      {
        text: " button, choose a plant, set your schedule, and plant it in your garden!",
      },
    ],
    targetKey: TUTORIAL_TARGET_KEYS.ADD_GOAL_BUTTON,
    anchorPlacement: "above",
    navigation: {
      tab: "Goals",
      screen: "GoalsHome",
    },
    requiresUserAction: true,
    advanceOn: TUTORIAL_TARGET_KEYS.ADD_GOAL_BUTTON,
    allowSkipGoalCreation: true,
    skipGoalCreationLabel: "Skip for now",
    goalCreationOptionalHint: "Creating a goal is optional during the tutorial.",
  },
  {
    id: "goal-creation",
    index: 2,
    mode: TUTORIAL_STEP_MODES.FLOW,
    silent: true,
    title: "Create Your First Goal",
    targetKey: null,
    navigation: {
      tab: "Goals",
      screen: "AddGoal",
    },
    requiresUserAction: false,
    advanceOn: TUTORIAL_TARGET_KEYS.GOAL_CREATION,
  },
  {
    id: "plant-growth",
    index: 3,
    mode: TUTORIAL_STEP_MODES.HIGHLIGHT,
    title: "Watch it Grow",
    description:
      "The more you complete your goals, the larger your plant grows!",
    descriptionEmphasis: "Progress through multiple stages",
    descriptionSuffix: "to build your garden.",
    growthStages: TUTORIAL_GROWTH_STAGE_PLANTS,
    targetKey: TUTORIAL_TARGET_KEYS.JOURNEY_TAB,
    anchorPlacement: "above",
    highlightPadding: 12,
    navigation: {
      tab: "Journey",
      screen: "JourneyHome",
    },
    requiresUserAction: false,
  },
  {
    id: "consistency",
    index: 4,
    mode: TUTORIAL_STEP_MODES.HIGHLIGHT,
    title: "Stay Consistent!",
    warningText:
      "If you miss watering your plant on schedule, it will start to wilt and eventually die.",
    targetKey: TUTORIAL_TARGET_KEYS.WATER_DROP,
    anchorPlacement: "above",
    highlightPadding: 10,
    navigation: {
      tab: "Garden",
      screen: "GardenHome",
    },
    requiresUserAction: false,
    comparisonImages: {
      variant: "consistency",
      leftSource: TUTORIAL_HEALTHY_PLANT_IMAGE,
      rightSource: TUTORIAL_WILTING_PLANT_IMAGE,
      leftLabel: "Well Watered",
      rightLabel: "Needs Water",
    },
  },
  {
    id: "completion",
    index: 5,
    mode: TUTORIAL_STEP_MODES.CENTERED,
    title: "Congratulations!",
    description:
      "You've completed the tutorial. You're ready to grow your garden!",
    targetKey: null,
    navigation: null,
    requiresUserAction: false,
    imageSource: null,
    variant: "completion",
  },
];

export const TUTORIAL_STEP_COUNT = TUTORIAL_STEPS.length;

export function getTutorialStepById(stepId) {
  return TUTORIAL_STEPS.find((step) => step.id === stepId) ?? null;
}

export function getTutorialStepByIndex(index) {
  if (index < 0 || index >= TUTORIAL_STEPS.length) return null;
  return TUTORIAL_STEPS[index];
}
