import { useCallback } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { useTutorial } from "../../contexts/TutorialContext";

export default function useRemeasureTutorialOnFocus() {
  const { isTutorialActive, remeasureTargets } = useTutorial();

  useFocusEffect(
    useCallback(() => {
      if (!isTutorialActive) return undefined;

      const frame = requestAnimationFrame(() => {
        remeasureTargets();
      });

      return () => cancelAnimationFrame(frame);
    }, [isTutorialActive, remeasureTargets])
  );
}
