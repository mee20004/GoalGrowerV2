import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { StyleSheet, View } from "react-native";
import TutorialHost from "../components/tutorial/TutorialHost";
import {
  TUTORIAL_STEP_COUNT,
  TUTORIAL_STEPS,
  getTutorialStepByIndex,
  loadOnboardingState,
  loadTutorialAwardGranted,
  persistOnboardingCompleted,
  persistOnboardingSkipped,
  persistTutorialAwardGranted,
  resetOnboardingState,
  rectsEqual,
} from "../tutorial";
import { DEV_TUTORIAL_TOOLS_ENABLED } from "../tutorial/devConfig";
import { TUTORIAL_TARGET_KEYS } from "../tutorial/constants";
import {
  canAdvanceFromUserAction,
  getTutorialProgress,
  isTutorialNavigationReady,
  isWelcomeStep,
  navigateForTutorialStep,
  resolveStepTransition,
  resolveTutorialStep,
} from "../tutorial/stepEngine";

const TutorialContext = createContext(null);

export function TutorialProvider({
  children,
  userId = null,
  enabled = true,
  navigationRef = null,
}) {
  const [hydrated, setHydrated] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [skipped, setSkipped] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [targetLayouts, setTargetLayouts] = useState({});
  const targetsRef = useRef(new Map());
  const devPreviewRef = useRef(false);
  const [devPreview, setDevPreview] = useState(false);
  const pendingNavigationStepIdRef = useRef(null);
  const [hasExistingGoals, setHasExistingGoals] = useState(false);
  const [tutorialAwardGranted, setTutorialAwardGranted] = useState(false);

  const setTutorialHasExistingGoals = useCallback((value) => {
    setHasExistingGoals(Boolean(value));
  }, []);

  // Hydrate from AsyncStorage
  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      if (!enabled || !userId) {
        if (!cancelled) {
          setCompleted(false);
          setSkipped(false);
          setTutorialAwardGranted(false);
          setCurrentStepIndex(0);
          setHydrated(true);
        }
        return;
      }

      const persisted = await loadOnboardingState(userId);
      if (cancelled) return;

      setCompleted(persisted.completed);
      setSkipped(persisted.skipped);
      setTutorialAwardGranted(persisted.awardGranted);
      setCurrentStepIndex(0);
      setHydrated(true);
    }

    setHydrated(false);
    hydrate();

    return () => {
      cancelled = true;
    };
  }, [enabled, userId]);

  const baseStep = useMemo(
    () => getTutorialStepByIndex(currentStepIndex),
    [currentStepIndex]
  );

  const currentStep = useMemo(
    () => resolveTutorialStep(baseStep, { hasExistingGoals }),
    [baseStep, hasExistingGoals]
  );

  const isTutorialEligible = Boolean(enabled && userId && hydrated);
  const isTutorialFinished = completed || skipped;
  const isTutorialActive =
    isTutorialEligible && !isTutorialFinished && currentStepIndex < TUTORIAL_STEP_COUNT;
  const isDevPreview = DEV_TUTORIAL_TOOLS_ENABLED && devPreview;
  const progress = getTutorialProgress(currentStepIndex, TUTORIAL_STEP_COUNT);

  const syncStepNavigation = useCallback(
    (step) => {
      if (!step || !navigationRef) return false;

      const didNavigate = navigateForTutorialStep(navigationRef, step);
      if (!didNavigate && step.navigation) {
        pendingNavigationStepIdRef.current = step.id;
        return false;
      }

      pendingNavigationStepIdRef.current = null;
      return didNavigate;
    },
    [navigationRef]
  );

  // Highlight target registry
  const updateTargetLayout = useCallback((targetKey, layout) => {
    if (!targetKey || !layout) return;
    setTargetLayouts((prev) => {
      if (rectsEqual(prev[targetKey], layout)) return prev;
      return { ...prev, [targetKey]: layout };
    });
  }, []);

  const measureTarget = useCallback(
    (targetKey, attempt = 0) => {
      const ref = targetsRef.current.get(targetKey);
      const node = ref?.current ?? ref;

      if (!node?.measureInWindow) {
        if (attempt < 10) {
          setTimeout(() => measureTarget(targetKey, attempt + 1), 60 * (attempt + 1));
        }
        return;
      }

      node.measureInWindow((x, y, width, height) => {
        if (width <= 0 || height <= 0) {
          if (attempt < 10) {
            setTimeout(() => measureTarget(targetKey, attempt + 1), 60 * (attempt + 1));
          }
          return;
        }
        updateTargetLayout(targetKey, { x, y, width, height });
      });
    },
    [updateTargetLayout]
  );

  const remeasureTargets = useCallback(() => {
    targetsRef.current.forEach((_, targetKey) => {
      measureTarget(targetKey);
    });
  }, [measureTarget]);

  useEffect(() => {
    if (!isTutorialActive || !currentStep || !navigationRef) return undefined;

    syncStepNavigation(currentStep);

    const unsubscribe = navigationRef.addListener?.("state", () => {
      if (pendingNavigationStepIdRef.current === currentStep.id) {
        if (!isTutorialNavigationReady(navigationRef)) return;
        syncStepNavigation(currentStep);
      }
      requestAnimationFrame(() => {
        requestAnimationFrame(remeasureTargets);
      });
    });

    return unsubscribe;
  }, [currentStep, isTutorialActive, navigationRef, remeasureTargets, syncStepNavigation]);

  useEffect(() => {
    if (!isTutorialActive || !currentStep?.targetKey) return undefined;

    remeasureTargets();
    const retryTimers = [80, 200, 400, 700, 1200].map((delay) =>
      setTimeout(remeasureTargets, delay)
    );

    return () => {
      retryTimers.forEach(clearTimeout);
    };
  }, [currentStep?.id, currentStep?.targetKey, isTutorialActive, remeasureTargets]);

  const registerTarget = useCallback(
    (targetKey, ref) => {
      if (!targetKey || !ref) return;
      targetsRef.current.set(targetKey, ref);
      requestAnimationFrame(() => measureTarget(targetKey));
    },
    [measureTarget]
  );

  const unregisterTarget = useCallback((targetKey) => {
    if (!targetKey) return;
    targetsRef.current.delete(targetKey);
    setTargetLayouts((prev) => {
      if (!prev[targetKey]) return prev;
      const next = { ...prev };
      delete next[targetKey];
      return next;
    });
  }, []);

  const getTargetRef = useCallback((targetKey) => {
    if (!targetKey) return null;
    return targetsRef.current.get(targetKey) ?? null;
  }, []);

  const getTargetLayout = useCallback(
    (targetKey) => {
      if (!targetKey) return null;
      return targetLayouts[targetKey] ?? null;
    },
    [targetLayouts]
  );

  const goToStep = useCallback(
    (index) => {
      if (index < 0 || index >= TUTORIAL_STEP_COUNT) return;
      const step = getTutorialStepByIndex(index);
      if (!step) return;
      setCurrentStepIndex(index);
      syncStepNavigation(step);
    },
    [syncStepNavigation]
  );

  const nextStep = useCallback(() => {
    setCurrentStepIndex((prev) => {
      const transition = resolveStepTransition({
        currentIndex: prev,
        stepCount: TUTORIAL_STEP_COUNT,
        direction: "next",
      });
      if (transition.completed) return prev;
      const step = getTutorialStepByIndex(transition.nextIndex);
      if (step) syncStepNavigation(step);
      return transition.nextIndex;
    });
  }, [syncStepNavigation]);

  const previousStep = useCallback(() => {
    setCurrentStepIndex((prev) => {
      const transition = resolveStepTransition({
        currentIndex: prev,
        stepCount: TUTORIAL_STEP_COUNT,
        direction: "previous",
      });
      const step = getTutorialStepByIndex(transition.nextIndex);
      if (step) syncStepNavigation(step);
      return transition.nextIndex;
    });
  }, [syncStepNavigation]);

  const completeTutorial = useCallback(async () => {
    setCompleted(true);
    setSkipped(false);
    setCurrentStepIndex(TUTORIAL_STEP_COUNT - 1);
    pendingNavigationStepIdRef.current = null;
    const skipPersist = DEV_TUTORIAL_TOOLS_ENABLED && devPreviewRef.current;
    devPreviewRef.current = false;
    setDevPreview(false);
    if (userId && !skipPersist) {
      const alreadyGranted = tutorialAwardGranted || await loadTutorialAwardGranted(userId);
      if (!alreadyGranted) {
        await persistTutorialAwardGranted(userId, true);
        setTutorialAwardGranted(true);
      }
      await persistOnboardingCompleted(userId, true);
    }
  }, [tutorialAwardGranted, userId]);

  const skipTutorial = useCallback(async () => {
    setSkipped(true);
    setCompleted(true);
    pendingNavigationStepIdRef.current = null;
    const skipPersist = DEV_TUTORIAL_TOOLS_ENABLED && devPreviewRef.current;
    devPreviewRef.current = false;
    setDevPreview(false);
    if (userId && !skipPersist) {
      await persistOnboardingSkipped(userId, true);
    }
  }, [userId]);

  const resetTutorial = useCallback(async () => {
    setCompleted(false);
    setSkipped(false);
    setCurrentStepIndex(0);
    devPreviewRef.current = false;
    setDevPreview(false);
    pendingNavigationStepIdRef.current = null;
    if (userId) {
      await resetOnboardingState(userId);
    }
  }, [userId]);

  const previewTutorial = useCallback(async () => {
    if (!DEV_TUTORIAL_TOOLS_ENABLED || !userId) return;
    devPreviewRef.current = true;
    setDevPreview(true);
    await resetOnboardingState(userId);
    setCompleted(false);
    setSkipped(false);
    setCurrentStepIndex(0);
    pendingNavigationStepIdRef.current = null;

    const goalsHomeStep = getTutorialStepByIndex(1);
    if (goalsHomeStep) syncStepNavigation(goalsHomeStep);

    setTimeout(remeasureTargets, 150);
    setTimeout(remeasureTargets, 450);
  }, [remeasureTargets, syncStepNavigation, userId]);

  const advanceStep = useCallback(async () => {
    const transition = resolveStepTransition({
      currentIndex: currentStepIndex,
      stepCount: TUTORIAL_STEP_COUNT,
      direction: "next",
    });

    if (transition.completed) {
      await completeTutorial();
      return;
    }

    const step = getTutorialStepByIndex(transition.nextIndex);
    setCurrentStepIndex(transition.nextIndex);
    if (step) syncStepNavigation(step);
  }, [completeTutorial, currentStepIndex, syncStepNavigation]);

  const beginWelcomeFlow = useCallback(async () => {
    if (!isTutorialActive || !isWelcomeStep(currentStep)) {
      await advanceStep();
      return;
    }

    const nextStep = getTutorialStepByIndex(1);
    if (nextStep) syncStepNavigation(nextStep);
    setCurrentStepIndex(1);
    requestAnimationFrame(() => {
      requestAnimationFrame(remeasureTargets);
    });
    setTimeout(remeasureTargets, 250);
  }, [advanceStep, currentStep, isTutorialActive, remeasureTargets, syncStepNavigation]);

  const notifyUserAction = useCallback(
    (actionId) => {
      if (!isTutorialActive || !currentStep) return false;
      if (!canAdvanceFromUserAction(currentStep, actionId)) return false;
      nextStep();
      return true;
    },
    [currentStep, isTutorialActive, nextStep]
  );

  const activateTutorialUserAction = useCallback(
    (actionId) => {
      if (!actionId) return false;

      if (
        (actionId === TUTORIAL_TARGET_KEYS.ADD_GOAL_BUTTON ||
          actionId === TUTORIAL_TARGET_KEYS.ADD_GOAL_FAB) &&
        navigationRef?.current
      ) {
        navigationRef.current.navigate("Goals", { screen: "AddGoal" });
      }

      return notifyUserAction(actionId);
    },
    [navigationRef, notifyUserAction]
  );

  const finishIfLastStep = useCallback(async () => {
    const transition = resolveStepTransition({
      currentIndex: currentStepIndex,
      stepCount: TUTORIAL_STEP_COUNT,
      direction: "next",
    });
    if (transition.completed) {
      await completeTutorial();
      return true;
    }
    return false;
  }, [completeTutorial, currentStepIndex]);

  const value = useMemo(
    () => ({
      hydrated,
      enabled,
      userId,
      steps: TUTORIAL_STEPS,
      stepCount: TUTORIAL_STEP_COUNT,
      currentStepIndex,
      currentStep,
      completed,
      skipped,
      isTutorialEligible,
      isTutorialFinished,
      isTutorialActive,
      isDevPreview,
      progress,
      goToStep,
      nextStep,
      previousStep,
      advanceStep,
      beginWelcomeFlow,
      notifyUserAction,
      activateTutorialUserAction,
      completeTutorial,
      skipTutorial,
      resetTutorial,
      previewTutorial,
      finishIfLastStep,
      targetLayouts,
      registerTarget,
      unregisterTarget,
      getTargetRef,
      getTargetLayout,
      updateTargetLayout,
      measureTarget,
      remeasureTargets,
      setTutorialHasExistingGoals,
    }),
    [
      hydrated,
      enabled,
      userId,
      currentStepIndex,
      currentStep,
      setTutorialHasExistingGoals,
      completed,
      skipped,
      isTutorialEligible,
      isTutorialFinished,
      isTutorialActive,
      isDevPreview,
      progress,
      goToStep,
      nextStep,
      previousStep,
      advanceStep,
      beginWelcomeFlow,
      notifyUserAction,
      activateTutorialUserAction,
      completeTutorial,
      skipTutorial,
      resetTutorial,
      previewTutorial,
      finishIfLastStep,
      targetLayouts,
      registerTarget,
      unregisterTarget,
      getTargetRef,
      getTargetLayout,
      updateTargetLayout,
      measureTarget,
      remeasureTargets,
    ]
  );

  return (
    <TutorialContext.Provider value={value}>
      <View style={styles.providerRoot}>
        {children}
        <TutorialHost />
      </View>
    </TutorialContext.Provider>
  );
}

const styles = StyleSheet.create({
  providerRoot: {
    flex: 1,
  },
});

export function useTutorial() {
  const ctx = useContext(TutorialContext);
  if (!ctx) {
    throw new Error("useTutorial must be used inside TutorialProvider");
  }
  return ctx;
}
