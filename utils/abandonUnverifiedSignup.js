import AsyncStorage from "@react-native-async-storage/async-storage";
import { deleteUser, signInAnonymously } from "firebase/auth";
import { deleteDoc, doc } from "firebase/firestore";
import { auth, db } from "../firebaseConfig";

export async function abandonUnverifiedSignup({
  onboardingStep = "account_prompt",
  getOnboardingKey = (uid) => `onboardingStep_${uid}`,
  getOnboardingGoalKey = (uid) => `onboardingGoalId_${uid}`,
} = {}) {
  const user = auth.currentUser;
  if (!user) {
    throw new Error("Not signed in");
  }
  if (user.emailVerified) {
    throw new Error("Account is already verified");
  }

  const oldUid = user.uid;

  try {
    await deleteDoc(doc(db, "users", oldUid));
  } catch (error) {
    console.warn("Could not delete user profile during start over:", error?.code || error?.message || error);
  }

  await deleteUser(user);

  const credential = await signInAnonymously(auth);
  const newUid = credential.user?.uid;

  if (newUid) {
    await AsyncStorage.setItem(getOnboardingKey(newUid), onboardingStep);
    await AsyncStorage.removeItem(getOnboardingGoalKey(newUid));
  }

  return { newUid };
}
