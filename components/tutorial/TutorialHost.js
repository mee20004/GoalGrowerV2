import React, { useEffect, useMemo } from "react";
import { Modal, useWindowDimensions } from "react-native";
import { useTutorial } from "../../contexts/TutorialContext";
import { DEV_TUTORIAL_TOOLS_ENABLED } from "../../tutorial/devConfig";
import { expandRect, isValidRect } from "../../tutorial/layout";
import {
  getOverlayModeForStep,
  getStepPrimaryLabel,
  isLastStepIndex,
  shouldShowStepPrimaryButton,
} from "../../tutorial/stepEngine";
import TutorialCard from "./TutorialCard";
import TutorialOverlay from "./TutorialOverlay";
import TutorialProgress from "./TutorialProgress";

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

  if (!isTutorialActive || !currentStep) {
    return null;
  }

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
      >
        <TutorialProgress
          currentIndex={currentStepIndex}
          stepCount={stepCount}
          progress={progress}
        />
        <TutorialCard
          title={currentStep.title}
          description={currentStep.description}
          primaryLabel={getStepPrimaryLabel(currentStep, { isLastStep })}
          showPrimary={showPrimary}
          onSkip={skipTutorial}
          onPrimary={advanceStep}
          targetRect={overlayConfig.cardTargetRect}
          centered={overlayConfig.cardCentered}
        />
      </TutorialOverlay>
    </Modal>
  );
}
