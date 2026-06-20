import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { useIsFocused } from "@react-navigation/native";

/**
 * True when the screen is focused and the app is in the foreground.
 * Use to pause decorative animations and reduce CPU/GPU load when inactive.
 */
export function useScreenActive() {
  const isFocused = useIsFocused();
  const [appActive, setAppActive] = useState(() => AppState.currentState === "active");

  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState) => {
      setAppActive(nextState === "active");
    });
    return () => sub.remove();
  }, []);

  return isFocused && appActive;
}
