import AsyncStorage from "@react-native-async-storage/async-storage";
import { onboardingKeysForUser } from "./constants";

function parseBool(value) {
  return value === "true";
}

// Load persisted onboarding flags
export async function loadOnboardingState(userId) {
  const keys = onboardingKeysForUser(userId);
  try {
    const [completedRaw, skippedRaw, awardGrantedRaw] = await Promise.all([
      AsyncStorage.getItem(keys.completed),
      AsyncStorage.getItem(keys.skipped),
      AsyncStorage.getItem(keys.awardGranted),
    ]);
    return {
      completed: parseBool(completedRaw),
      skipped: parseBool(skippedRaw),
      awardGranted: parseBool(awardGrantedRaw),
    };
  } catch {
    return { completed: false, skipped: false, awardGranted: false };
  }
}

export async function loadTutorialAwardGranted(userId) {
  const keys = onboardingKeysForUser(userId);
  try {
    return parseBool(await AsyncStorage.getItem(keys.awardGranted));
  } catch {
    return false;
  }
}

export async function persistTutorialAwardGranted(userId, granted = true) {
  const keys = onboardingKeysForUser(userId);
  try {
    if (granted) {
      await AsyncStorage.setItem(keys.awardGranted, "true");
    } else {
      await AsyncStorage.removeItem(keys.awardGranted);
    }
  } catch {}
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
