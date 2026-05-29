import React, { useCallback, useEffect, useMemo } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import { useTutorial } from "../../contexts/TutorialContext";
import { DEV_TUTORIAL_TOOLS_ENABLED } from "../../tutorial/devConfig";
import { expandRect, isValidRect } from "../../tutorial/layout";
import {
  getStepPrimaryLabel,
  getTutorialOverlayPresentation,
  isLastStepIndex,
  isWelcomeStep,
  shouldShowStepPrimaryButton,
  shouldUseHighlightPassthrough,
} from "../../tutorial/stepEngine";
import TutorialCard from "./TutorialCard";
import TutorialHighlightPassthrough from "./TutorialHighlightPassthrough";
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
    targetLayouts,
    remeasureTargets,
    getTargetLayout,
    advanceStep,
    beginWelcomeFlow,
    activateTutorialUserAction,
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
      return {
        mode: "centered",
        blocking: true,
        highlightRect: null,
        cardTargetRect: null,
        cardCentered: true,
      };
    }

    const rawLayout = currentStep.targetKey
      ? getTargetLayout(currentStep.targetKey)
      : null;
    const highlightRect = expandRect(rawLayout);
    const hasValidTarget = isValidRect(highlightRect);
    const presentation = getTutorialOverlayPresentation(currentStep, {
      hasValidTarget,
    });

    return {
      mode: presentation.mode,
      blocking: presentation.blocking,
      highlightRect: presentation.highlightRect ? highlightRect : null,
      cardTargetRect: presentation.highlightRect ? highlightRect : null,
      cardCentered: presentation.mode !== "highlight",
    };
  }, [currentStep, getTargetLayout, targetLayouts]);

  const handleWelcomeCTA = useCallback(async () => {
    await beginWelcomeFlow();
  }, [beginWelcomeFlow]);

  const handleHighlightPassthrough = useCallback(() => {
    if (!currentStep?.advanceOn) return;
    activateTutorialUserAction(currentStep.advanceOn);
  }, [activateTutorialUserAction, currentStep?.advanceOn]);

  if (!isTutorialActive || !currentStep) {
    return null;
  }

  const showWelcome = isWelcomeStep(currentStep);
  const isLastStep = isLastStepIndex(currentStepIndex, stepCount);
  const showPrimary = shouldShowStepPrimaryButton(currentStep, {
    devToolsEnabled: DEV_TUTORIAL_TOOLS_ENABLED,
    devPreview: isDevPreview,
  });
  const usePassthrough =
    shouldUseHighlightPassthrough(currentStep) &&
    isValidRect(overlayConfig.highlightRect);

  return (
    <View style={styles.host} pointerEvents="box-none" accessibilityViewIsModal>
      <TutorialOverlay
        visible
        mode={overlayConfig.mode}
        highlightRect={overlayConfig.highlightRect}
        entranceDuration={showWelcome ? 320 : 220}
        blocking={overlayConfig.blocking}
      >
        {!showWelcome ? (
          <TutorialProgress
            currentIndex={currentStepIndex}
            stepCount={stepCount}
            progress={progress}
          />
        ) : null}

        <TutorialHighlightPassthrough
          rect={overlayConfig.highlightRect}
          enabled={usePassthrough}
          onPress={handleHighlightPassthrough}
        />

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
            cardPlacement={currentStep.cardPlacement ?? null}
          />
        )}
      </TutorialOverlay>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10000,
    elevation: 10000,
  },
});
