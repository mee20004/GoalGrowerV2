import React, { useCallback, useEffect, useRef } from "react";
import { View } from "react-native";
import { useTutorial } from "../../contexts/TutorialContext";

export default function HighlightTarget({ targetKey, children, style, collapsable = false }) {
  const viewRef = useRef(null);
  const { registerTarget, unregisterTarget, measureTarget } = useTutorial();

  useEffect(() => {
    if (!targetKey) return undefined;
    registerTarget(targetKey, viewRef);
    return () => unregisterTarget(targetKey);
  }, [targetKey, registerTarget, unregisterTarget]);

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
