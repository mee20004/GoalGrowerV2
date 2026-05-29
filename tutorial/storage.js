import AsyncStorage from "@react-native-async-storage/async-storage";
import { onboardingKeysForUser } from "./constants";

function parseBool(value) {
  return value === "true";
}

// Load persisted onboarding flags
export async function loadOnboardingState(userId) {
  const keys = onboardingKeysForUser(userId);
  try {
    const [completedRaw, skippedRaw] = await Promise.all([
      AsyncStorage.getItem(keys.completed),
      AsyncStorage.getItem(keys.skipped),
    ]);
    return {
      completed: parseBool(completedRaw),
      skipped: parseBool(skippedRaw),
    };
  } catch {
    return { completed: false, skipped: false };
  }
}

// Write completion / skip state
export async function persistOnboardingCompleted(userId, completed = true) {
  const keys = onboardingKeysForUser(userId);
  try {
    await AsyncStorage.setItem(keys.completed, completed ? "true" : "false");
    if (completed) {
      await AsyncStorage.removeItem(keys.skipped);
    }
  } catch {}
}

export async function persistOnboardingSkipped(userId, skipped = true) {
  const keys = onboardingKeysForUser(userId);
  try {
    await AsyncStorage.setItem(keys.skipped, skipped ? "true" : "false");
    if (skipped) {
      await AsyncStorage.setItem(keys.completed, "true");
    }
  } catch {}
}

// Clear persisted onboarding (settings reset)
export async function resetOnboardingState(userId) {
  const keys = onboardingKeysForUser(userId);
  try {
    await Promise.all([
      AsyncStorage.removeItem(keys.completed),
      AsyncStorage.removeItem(keys.skipped),
    ]);
  } catch {}
}
