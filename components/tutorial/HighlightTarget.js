import React, { useCallback, useEffect, useRef } from "react";
import { View } from "react-native";
import { useTutorial } from "../../contexts/TutorialContext";

export default function HighlightTarget({
  targetKey,
  children,
  style,
  collapsable = false,
}) {
  const viewRef = useRef(null);
  const { registerTarget, unregisterTarget, measureTarget, isTutorialActive } =
    useTutorial();

  useEffect(() => {
    if (!targetKey) return undefined;
    registerTarget(targetKey, viewRef);
    return () => unregisterTarget(targetKey);
  }, [targetKey, registerTarget, unregisterTarget]);

  useEffect(() => {
    if (!targetKey || !isTutorialActive) return undefined;

    measureTarget(targetKey);
    const timers = [50, 150, 350, 600].map((delay) =>
      setTimeout(() => measureTarget(targetKey), delay)
    );

    return () => {
      timers.forEach(clearTimeout);
    };
  }, [isTutorialActive, measureTarget, targetKey]);

  const handleLayout = useCallback(() => {
    if (targetKey) measureTarget(targetKey);
  }, [targetKey, measureTarget]);

  return (
    <View
      ref={viewRef}
      style={style}
      collapsable={collapsable}
      onLayout={handleLayout}
    >
      {children}
    </View>
  );
}
