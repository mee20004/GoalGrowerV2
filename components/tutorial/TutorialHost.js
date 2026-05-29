import React, { useEffect } from "react";
import { Modal, useWindowDimensions } from "react-native";
import { useTutorial } from "../../contexts/TutorialContext";
import { TUTORIAL_STEP_MODES } from "../../tutorial/constants";
import { expandRect, isValidRect } from "../../tutorial/layout";
import { DEV_TUTORIAL_TOOLS_ENABLED } from "../../tutorial/devConfig";
import TutorialDevPanel from "./TutorialDevPanel";
import TutorialOverlay from "./TutorialOverlay";

export default function TutorialHost() {
  const { width, height } = useWindowDimensions();
  const {
    isTutorialActive,
    currentStep,
    remeasureTargets,
    getTargetLayout,
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

  const isCenteredStep = currentStep.mode === TUTORIAL_STEP_MODES.CENTERED;
  const rawLayout = currentStep.targetKey
    ? getTargetLayout(currentStep.targetKey)
    : null;
  const highlightRect = expandRect(rawLayout);
  const useHighlight =
    !isCenteredStep && currentStep.targetKey && isValidRect(highlightRect);

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
        {DEV_TUTORIAL_TOOLS_ENABLED ? <TutorialDevPanel /> : null}
      </TutorialOverlay>
    </Modal>
  );
}
