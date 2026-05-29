export {
  ONBOARDING_COMPLETED_KEY,
  ONBOARDING_SKIPPED_KEY,
  TUTORIAL_TARGET_KEYS,
  TUTORIAL_STEP_MODES,
  onboardingKeysForUser,
} from "./constants";

export {
  TUTORIAL_STEPS,
  TUTORIAL_STEP_COUNT,
  getTutorialStepById,
  getTutorialStepByIndex,
} from "./steps";

export {
  loadOnboardingState,
  persistOnboardingCompleted,
  persistOnboardingSkipped,
  resetOnboardingState,
} from "./storage";

export {
  getStepNavigationTarget,
  buildTutorialNavigateAction,
} from "./navigation";

export {
  getTutorialProgress,
  getStepPrimaryLabel,
  shouldShowStepPrimaryButton,
  getOverlayModeForStep,
  canAdvanceFromUserAction,
  navigateForTutorialStep,
  isTutorialNavigationReady,
  resolveStepTransition,
  isLastStepIndex,
} from "./stepEngine";

export {
  TUTORIAL_OVERLAY_COLOR,
  TUTORIAL_HIGHLIGHT_PADDING,
  TUTORIAL_HIGHLIGHT_RADIUS,
  expandRect,
  isValidRect,
  rectsEqual,
} from "./layout";

export {
  CARD_MAX_WIDTH,
  CARD_MIN_WIDTH,
  computeTutorialCardLayout,
} from "./cardLayout";
