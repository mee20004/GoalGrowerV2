import React, { useCallback, useEffect, useMemo } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import { useTutorial } from "../../contexts/TutorialContext";
import { expandRect, isValidRect } from "../../tutorial/layout";
import {
  getStepPrimaryLabel,
  getTutorialOverlayPresentation,
  isLastStepIndex,
  isCompletionStep,
  allowsSkipGoalCreation,
  getSkipGoalCreationLabel,
  isSilentTutorialStep,
  isWelcomeStep,
  shouldShowStepPrimaryButton,
  shouldUseHighlightPassthrough,
} from "../../tutorial/stepEngine";
import { TUTORIAL_HIGHLIGHT_PADDING } from "../../tutorial/layout";
import TutorialCard from "./TutorialCard";
import TutorialCompletionCard from "./TutorialCompletionCard";
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
    targetLayouts,
    remeasureTargets,
    getTargetLayout,
    advanceStep,
    beginWelcomeFlow,
    activateTutorialUserAction,
    skipTutorial,
    skipGoalCreation,
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
    const highlightPadding =
      currentStep.highlightPadding ?? TUTORIAL_HIGHLIGHT_PADDING;
    const highlightRect = expandRect(rawLayout, highlightPadding);
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

  const handleEndTutorial = useCallback(async () => {
    await advanceStep();
  }, [advanceStep]);

  const showWelcome = isWelcomeStep(currentStep);
  const showCompletion = isCompletionStep(currentStep);
  const isLastStep = isLastStepIndex(currentStepIndex, stepCount);
  const showPrimary = shouldShowStepPrimaryButton(currentStep);
  const usePassthrough =
    shouldUseHighlightPassthrough(currentStep) &&
    isValidRect(overlayConfig.highlightRect);

  if (!isTutorialActive || !currentStep || isSilentTutorialStep(currentStep)) {
    return null;
  }

  return (
    <View
      style={styles.host}
      pointerEvents="box-none"
      accessibilityViewIsModal
      accessibilityLabel={`Tutorial: ${currentStep.title}`}
    >
      <TutorialOverlay
        visible
        mode={overlayConfig.mode}
        highlightRect={overlayConfig.highlightRect}
        entranceDuration={showWelcome || showCompletion ? 320 : 220}
        blocking={overlayConfig.blocking}
      >
        {!showWelcome && !showCompletion ? (
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
            titleLine1={currentStep.titleLine1}
            titleLine2={currentStep.titleLine2}
            heroCaptionLine1={currentStep.heroCaptionLine1}
            heroCaptionLine2={currentStep.heroCaptionLine2}
            description={currentStep.description}
            plantSource={currentStep.imageSource}
            onGetStarted={handleWelcomeCTA}
          />
        ) : showCompletion ? (
          <TutorialCompletionCard
            title={currentStep.title}
            description={currentStep.description}
            imageSource={currentStep.imageSource}
            primaryLabel={getStepPrimaryLabel(currentStep, { isLastStep: true })}
            onEndTutorial={handleEndTutorial}
          />
        ) : (
          <TutorialCard
            stepKey={currentStep.id}
            title={currentStep.title}
            description={currentStep.description ?? ""}
            descriptionParts={currentStep.descriptionParts ?? null}
            descriptionEmphasis={currentStep.descriptionEmphasis ?? ""}
            descriptionSuffix={currentStep.descriptionSuffix ?? ""}
            warningText={currentStep.warningText ?? ""}
            growthStages={currentStep.growthStages ?? null}
            imageSource={currentStep.imageSource ?? null}
            primaryLabel={getStepPrimaryLabel(currentStep, { isLastStep })}
            showPrimary={showPrimary}
            onSkip={skipTutorial}
            showSkipGoalCreation={allowsSkipGoalCreation(currentStep)}
            skipGoalCreationLabel={getSkipGoalCreationLabel(currentStep)}
            optionalHint={currentStep.goalCreationOptionalHint ?? null}
            onSkipGoalCreation={skipGoalCreation}
            onPrimary={advanceStep}
            targetRect={overlayConfig.cardTargetRect}
            centered={overlayConfig.cardCentered}
            cardPlacement={currentStep.cardPlacement ?? null}
            anchorPlacement={currentStep.anchorPlacement ?? null}
            comparisonImages={currentStep.comparisonImages ?? null}
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
