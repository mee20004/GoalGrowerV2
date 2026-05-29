import React from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useTutorial } from "../../contexts/TutorialContext";
import { theme } from "../../theme";
import { DEV_TUTORIAL_TOOLS_ENABLED } from "../../tutorial/devConfig";

export default function TutorialDevPanel() {
  const {
    isTutorialActive,
    currentStep,
    currentStepIndex,
    stepCount,
    nextStep,
    skipTutorial,
    completeTutorial,
    finishIfLastStep,
  } = useTutorial();

  if (!DEV_TUTORIAL_TOOLS_ENABLED || !isTutorialActive || !currentStep) {
    return null;
  }

  const isLastStep = currentStepIndex >= stepCount - 1;

  const handlePrimary = async () => {
    if (isLastStep) {
      await finishIfLastStep();
      return;
    }
    nextStep();
  };

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.badge}>Dev preview</Text>
          <Text style={styles.title}>{currentStep.title}</Text>
          <Text style={styles.description}>{currentStep.description}</Text>
          <Text style={styles.meta}>
            Step {currentStepIndex + 1} of {stepCount}
          </Text>

          <View style={styles.actions}>
            <Pressable style={styles.secondaryBtn} onPress={skipTutorial}>
              <Text style={styles.secondaryText}>Skip</Text>
            </Pressable>
            <Pressable style={styles.primaryBtn} onPress={handlePrimary}>
              <Text style={styles.primaryText}>
                {isLastStep ? "Finish" : "Next"}
              </Text>
            </Pressable>
          </View>

          {!isLastStep ? (
            <Pressable style={styles.linkBtn} onPress={completeTutorial}>
              <Text style={styles.linkText}>Mark complete (dev)</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.45)",
    justifyContent: "center",
    padding: theme.pad,
  },
  card: {
    backgroundColor: theme.surface,
    borderRadius: theme.radius,
    padding: 20,
  },
  badge: {
    fontSize: 11,
    fontWeight: "800",
    color: theme.accent,
    marginBottom: 8,
    textTransform: "uppercase",
  },
  title: {
    fontSize: 22,
    fontWeight: "900",
    color: theme.text,
    marginBottom: 8,
  },
  description: {
    fontSize: 15,
    color: theme.muted2,
    lineHeight: 21,
    marginBottom: 10,
  },
  meta: {
    fontSize: 12,
    color: theme.muted2,
    marginBottom: 16,
  },
  actions: {
    flexDirection: "row",
    gap: 10,
  },
  primaryBtn: {
    flex: 1,
    backgroundColor: theme.accent,
    borderRadius: theme.radiusSm,
    paddingVertical: 12,
    alignItems: "center",
  },
  primaryText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 15,
  },
  secondaryBtn: {
    flex: 1,
    backgroundColor: theme.bg,
    borderRadius: theme.radiusSm,
    paddingVertical: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: theme.outline,
  },
  secondaryText: {
    color: theme.text,
    fontWeight: "800",
    fontSize: 15,
  },
  linkBtn: {
    marginTop: 12,
    alignItems: "center",
  },
  linkText: {
    fontSize: 12,
    color: theme.muted2,
    textDecorationLine: "underline",
  },
});
