import { TUTORIAL_STEP_MODES } from "./constants";
import { buildTutorialNavigateAction } from "./navigation";
import { getTutorialStepByIndex } from "./steps";

export function isLastStepIndex(stepIndex, stepCount) {
  return stepIndex >= stepCount - 1;
}

export function getTutorialProgress(stepIndex, stepCount) {
  if (!stepCount) return 0;
  return (stepIndex + 1) / stepCount;
}

export function getStepPrimaryLabel(step, { isLastStep = false } = {}) {
  if (!step) return "Next";
  if (step.id === "welcome") return "Get Started";
  if (isLastStep) return "End Tutorial";
  return "Next";
}

export function shouldShowStepPrimaryButton(
  step,
  { devToolsEnabled = false, devPreview = false } = {}
) {
  if (!step) return false;
  if (!step.requiresUserAction) return true;
  return Boolean(devToolsEnabled && devPreview);
}

export function shouldNavigateForStep(step) {
  return Boolean(buildTutorialNavigateAction(step));
}

export function getOverlayModeForStep(step, { hasValidTarget = false } = {}) {
  if (!step) return "centered";
  if (step.mode === TUTORIAL_STEP_MODES.CENTERED) return "centered";
  if (step.mode === TUTORIAL_STEP_MODES.FLOW) return "flow";
  if (step.mode === TUTORIAL_STEP_MODES.HIGHLIGHT && step.targetKey && hasValidTarget) {
    return "highlight";
  }
  return "centered";
}

export function canAdvanceFromUserAction(step, actionId) {
  if (!step?.requiresUserAction || !actionId) return false;
  if (step.advanceOn === actionId) return true;
  if (step.id === actionId) return true;
  return false;
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
