import AsyncStorage from "@react-native-async-storage/async-storage";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../firebaseConfig";

const ONBOARDING_RELOGIN_KEY = "onboardingReloginPending";

export async function saveOnboardingRelogin({ email, password, uid }) {
  if (!email || !password || !uid) return;
  await AsyncStorage.setItem(
    ONBOARDING_RELOGIN_KEY,
    JSON.stringify({
      email: String(email).trim(),
      password,
      uid,
    })
  );
}

export async function getOnboardingRelogin() {
  const raw = await AsyncStorage.getItem(ONBOARDING_RELOGIN_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function clearOnboardingRelogin() {
  await AsyncStorage.removeItem(ONBOARDING_RELOGIN_KEY);
}

export async function tryOnboardingRelogin() {
  const pending = await getOnboardingRelogin();
  if (!pending?.email || !pending?.password) {
    return { signedIn: false };
  }

  try {
    await signInWithEmailAndPassword(auth, pending.email, pending.password);
    return { signedIn: true };
  } catch (error) {
    console.warn(
      "Onboarding relogin failed:",
      error?.code || error?.message || error
    );
    return { signedIn: false, error };
  }
}
