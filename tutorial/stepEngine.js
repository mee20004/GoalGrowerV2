import { TUTORIAL_STEP_MODES, TUTORIAL_TARGET_KEYS } from "./constants";
import { buildTutorialNavigateAction } from "./navigation";
import { getTutorialStepByIndex } from "./steps";

export function isLastStepIndex(stepIndex, stepCount) {
  return stepIndex >= stepCount - 1;
}

export function getTutorialProgress(stepIndex, stepCount) {
  if (!stepCount) return 0;
  return (stepIndex + 1) / stepCount;
}

export function isWelcomeStep(step) {
  return step?.id === "welcome";
}

export function isCompletionStep(step) {
  return step?.id === "completion";
}

export function isSilentTutorialStep(step) {
  return Boolean(step?.silent);
}

export function isGoalCreationTutorialStep(step) {
  return step?.id === "highlight-add-goal" || step?.id === "goal-creation";
}

export function allowsSkipGoalCreation(step) {
  return Boolean(step?.allowSkipGoalCreation);
}

export function getSkipGoalCreationLabel(step) {
  return step?.skipGoalCreationLabel || "Skip for now";
}

export const PLANT_GROWTH_STEP_INDEX = 3;

export function getStepPrimaryLabel(step, { isLastStep = false } = {}) {
  if (!step) return "Next";
  if (isWelcomeStep(step)) return "Get Started";
  if (isCompletionStep(step) || isLastStep) return "Done";
  return "Next";
}

export function shouldShowStepPrimaryButton(step) {
  if (!step) return false;
  return !step.requiresUserAction;
}

export function shouldNavigateForStep(step) {
  return Boolean(buildTutorialNavigateAction(step));
}

export function getOverlayModeForStep(step, { hasValidTarget = false } = {}) {
  if (!step) return "centered";
  if (step.mode === TUTORIAL_STEP_MODES.CENTERED) return "centered";
  if (step.mode === TUTORIAL_STEP_MODES.FLOW) {
    return hasValidTarget && step.targetKey ? "highlight" : "flow";
  }
  if (step.mode === TUTORIAL_STEP_MODES.HIGHLIGHT && step.targetKey && hasValidTarget) {
    return "highlight";
  }
  if (step.targetKey) return "flow";
  return "centered";
}

export function getTutorialOverlayPresentation(step, { hasValidTarget = false } = {}) {
  const mode = getOverlayModeForStep(step, { hasValidTarget });

  return {
    mode,
    blocking: mode === "centered",
    highlightRect: mode === "highlight",
  };
}

export function shouldUseHighlightPassthrough(step) {
  return Boolean(step?.requiresUserAction && step?.advanceOn);
}

export function canAdvanceFromUserAction(step, actionId) {
  if (!step || !actionId) return false;
  if (step.advanceOn === actionId) return true;
  if (step.requiresUserAction && step.id === actionId) return true;
  return false;
}

const CREATE_GOAL_TITLE = "Create a Goal";

export function resolveTutorialStep(step, { hasExistingGoals = false } = {}) {
  if (!step || !hasExistingGoals) return step;

  if (step.id === "highlight-add-goal") {
    return {
      ...step,
      title: CREATE_GOAL_TITLE,
      targetKey: TUTORIAL_TARGET_KEYS.ADD_GOAL_FAB,
      advanceOn: TUTORIAL_TARGET_KEYS.ADD_GOAL_FAB,
      descriptionParts: [
        { text: "Tap the " },
        { text: "+", accent: true },
        {
          text: " button in the bottom right, choose a plant, set your schedule, and plant it in your garden!",
        },
      ],
    };
  }

  if (step.id === "goal-creation") {
    return {
      ...step,
      title: CREATE_GOAL_TITLE,
    };
  }

  return step;
}

export function getNextStepIndex(currentIndex, stepCount) {
  const next = currentIndex + 1;
  if (next >= stepCount) return currentIndex;
  return next;
}

function getNavigationFromRef(navigationRef) {
  return navigationRef?.current ?? navigationRef ?? null;
}

function getActiveRootRoute(navigation) {
  const state = navigation?.getRootState?.() ?? navigation?.getState?.();
  if (!state?.routes?.length) return null;
  return state.routes[state.index ?? 0] ?? null;
}

export function isTutorialNavigationReady(navigationRef) {
  const navigation = getNavigationFromRef(navigationRef);
  if (!navigation?.getState && !navigation?.getRootState) return false;
  if (navigation.isReady && !navigation.isReady()) return false;
  const route = getActiveRootRoute(navigation);
  if (!route) return false;
  return route.name === "Tabs";
}

export function navigateForTutorialStep(navigationRef, step) {
  const navigation = getNavigationFromRef(navigationRef);
  if (!navigation || !step) return false;

  const action = buildTutorialNavigateAction(step);
  if (!action) return true;

  const route = getActiveRootRoute(navigation);
  if (!route) return false;

  if (route.name === "Tabs") {
    navigation.navigate(action.name, action.params);
    return true;
  }

  if (route.name !== "Enter" && route.name !== "Login") {
    navigation.navigate("Tabs", {
      screen: action.name,
      params: action.params,
    });
    return true;
  }

  return false;
}

export function resolveStepTransition({ currentIndex, stepCount, direction = "next" }) {
  if (direction === "previous") {
    return { nextIndex: Math.max(0, currentIndex - 1), completed: false };
  }

  if (isLastStepIndex(currentIndex, stepCount)) {
    return { nextIndex: currentIndex, completed: true };
  }

  return {
    nextIndex: getNextStepIndex(currentIndex, stepCount),
    completed: false,
  };
}

export function getStepByIndex(index) {
  return getTutorialStepByIndex(index);
}
