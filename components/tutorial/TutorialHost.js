import React, { useEffect } from "react";
import { Modal, useWindowDimensions } from "react-native";
import { useTutorial } from "../../contexts/TutorialContext";
import { TUTORIAL_STEP_MODES } from "../../tutorial/constants";
import { expandRect, isValidRect } from "../../tutorial/layout";
import TutorialCard from "./TutorialCard";
import TutorialOverlay from "./TutorialOverlay";

function getPrimaryLabel(step, isLastStep) {
  if (step?.id === "welcome") return "Get Started";
  if (isLastStep) return "End Tutorial";
  return "Next";
}

export default function TutorialHost() {
  const { width, height } = useWindowDimensions();
  const {
    isTutorialActive,
    currentStep,
    currentStepIndex,
    stepCount,
    remeasureTargets,
    getTargetLayout,
    nextStep,
    skipTutorial,
    finishIfLastStep,
  } = useTutorial();

  useEffect(() => {
    if (!isTutorialActive) return undefined;
    const frame = requestAnimationFrame(() => {
      remeasureTargets();
    });
    return () => cancelAnimationFrame(frame);
  }, [isTutorialActive, currentStep?.id, width, height, remeasureTargets]);

  if (!isTutorialActive || !currentStep) {
    return null;
  }

  const isLastStep = currentStepIndex >= stepCount - 1;
  const isCenteredStep = currentStep.mode === TUTORIAL_STEP_MODES.CENTERED;
  const rawLayout = currentStep.targetKey
    ? getTargetLayout(currentStep.targetKey)
    : null;
  const highlightRect = expandRect(rawLayout);
  const useHighlight =
    !isCenteredStep && currentStep.targetKey && isValidRect(highlightRect);

  const handlePrimary = async () => {
    if (isLastStep) {
      await finishIfLastStep();
      return;
    }
    nextStep();
  };

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
        mode={useHighlight ? "highlight" : "centered"}
        highlightRect={useHighlight ? highlightRect : null}
      >
        <TutorialCard
          title={currentStep.title}
          description={currentStep.description}
          primaryLabel={getPrimaryLabel(currentStep, isLastStep)}
          showPrimary={!currentStep.requiresUserAction}
          onSkip={skipTutorial}
          onPrimary={handlePrimary}
          targetRect={useHighlight ? highlightRect : null}
          centered={!useHighlight}
        />
      </TutorialOverlay>
    </Modal>
  );
}
