import React, { useCallback, useEffect, useMemo } from "react";
import { Modal, useWindowDimensions } from "react-native";
import { useTutorial } from "../../contexts/TutorialContext";
import { DEV_TUTORIAL_TOOLS_ENABLED } from "../../tutorial/devConfig";
import { expandRect, isValidRect } from "../../tutorial/layout";
import {
  getOverlayModeForStep,
  getStepPrimaryLabel,
  isLastStepIndex,
  isWelcomeStep,
  shouldShowStepPrimaryButton,
} from "../../tutorial/stepEngine";
import TutorialCard from "./TutorialCard";
import TutorialOverlay from "./TutorialOverlay";
import TutorialProgress from "./TutorialProgress";
import TutorialWelcomeCard from "./TutorialWelcomeCard";

export default function TutorialHost() {
  const { width, height } = useWindowDimensions();
  const {
    isTutorialActive,
    currentStep,
    currentStepIndex,
    stepCount,
    progress,
    isDevPreview,
    remeasureTargets,
    getTargetLayout,
    advanceStep,
    beginWelcomeFlow,
    skipTutorial,
  } = useTutorial();

  useEffect(() => {
    if (!isTutorialActive) return undefined;
    const frame = requestAnimationFrame(() => {
      remeasureTargets();
    });
    return () => cancelAnimationFrame(frame);
  }, [isTutorialActive, currentStep?.id, width, height, remeasureTargets]);

  const overlayConfig = useMemo(() => {
    if (!currentStep) {
      return { mode: "centered", highlightRect: null };
    }

    const rawLayout = currentStep.targetKey
      ? getTargetLayout(currentStep.targetKey)
      : null;
    const highlightRect = expandRect(rawLayout);
    const hasValidTarget = isValidRect(highlightRect);
    const mode = getOverlayModeForStep(currentStep, { hasValidTarget });

    return {
      mode,
      highlightRect: mode === "highlight" ? highlightRect : null,
      cardTargetRect: mode === "highlight" ? highlightRect : null,
      cardCentered: mode !== "highlight",
    };
  }, [currentStep, getTargetLayout]);

  const handleWelcomeCTA = useCallback(async () => {
    await beginWelcomeFlow();
  }, [beginWelcomeFlow]);

  if (!isTutorialActive || !currentStep) {
    return null;
  }

  const showWelcome = isWelcomeStep(currentStep);
  const isLastStep = isLastStepIndex(currentStepIndex, stepCount);
  const showPrimary = shouldShowStepPrimaryButton(currentStep, {
    devToolsEnabled: DEV_TUTORIAL_TOOLS_ENABLED,
    devPreview: isDevPreview,
  });

  return (
    <Modal
      visible
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={() => {}}
    >
      <TutorialOverlay
        visible
        mode={overlayConfig.mode}
        highlightRect={overlayConfig.highlightRect}
        entranceDuration={showWelcome ? 320 : 220}
      >
        {!showWelcome ? (
          <TutorialProgress
            currentIndex={currentStepIndex}
            stepCount={stepCount}
            progress={progress}
          />
        ) : null}

        {showWelcome ? (
          <TutorialWelcomeCard
            title={currentStep.title}
            description={currentStep.description}
            imageSource={currentStep.imageSource}
            onSkip={skipTutorial}
            onGetStarted={handleWelcomeCTA}
          />
        ) : (
          <TutorialCard
            title={currentStep.title}
            description={currentStep.description}
            imageSource={currentStep.imageSource ?? null}
            primaryLabel={getStepPrimaryLabel(currentStep, { isLastStep })}
            showPrimary={showPrimary}
            onSkip={skipTutorial}
            onPrimary={advanceStep}
            targetRect={overlayConfig.cardTargetRect}
            centered={overlayConfig.cardCentered}
          />
        )}
      </TutorialOverlay>
    </Modal>
  );
}
