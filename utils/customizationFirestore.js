import { doc, onSnapshot, setDoc, getDoc } from "firebase/firestore";
import { auth, db } from "../firebaseConfig";

function logCustomizationListenerError(context, error) {
  if (error?.code === "permission-denied" && !auth.currentUser?.uid) {
    return;
  }
  console.error(context, error);
}

export function subscribePersonalCustomizations(userId, setCustomizations) {
  if (!userId) return () => {};
  const ref = doc(db, "users", userId, "meta", "customizations");
  const unsub = onSnapshot(
    ref,
    (snap) => {
      setCustomizations(snap.exists() ? snap.data() : {});
    },
    (error) => {
      logCustomizationListenerError("Error loading personal customizations", error);
    }
  );
  return unsub;
}

export async function savePersonalCustomizations(userId, pageId, pageCustomization) {
  if (!userId || !pageId) return;
  const ref = doc(db, "users", userId, "meta", "customizations");
  await setDoc(ref, { [pageId]: pageCustomization }, { merge: true });
}

export function subscribeSharedCustomizations(sharedGardenId, setCustomizations) {
  if (!sharedGardenId) return () => {};
  const ref = doc(db, "sharedGardens", sharedGardenId, "meta", "customizations");
  const unsub = onSnapshot(
    ref,
    (snap) => {
      setCustomizations(snap.exists() ? snap.data() : {});
    },
    (error) => {
      logCustomizationListenerError("Error loading shared customizations", error);
    }
  );
  return unsub;
}

export async function saveSharedCustomizations(sharedGardenId, pageId, pageCustomization) {
  if (!sharedGardenId || !pageId) return;
  const ref = doc(db, "sharedGardens", sharedGardenId, "meta", "customizations");
  await setDoc(ref, { [pageId]: pageCustomization }, { merge: true });
}

export async function loadSharedCustomizations(sharedGardenId) {
  if (!sharedGardenId) return {};
  const ref = doc(db, "sharedGardens", sharedGardenId, "meta", "customizations");
  const snap = await getDoc(ref);
  return snap.exists() ? snap.data() : {};
}
