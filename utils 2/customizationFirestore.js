
// Personal garden customization sync
import { auth } from "../firebaseConfig";

export function subscribePersonalCustomizations(userId, setCustomizations) {
  if (!userId) return () => {};
  const ref = doc(db, "users", userId, "meta", "customizations");
  const unsub = onSnapshot(ref, (snap) => {
    setCustomizations(snap.exists() ? snap.data() : {});
  });
  return unsub;
}

export async function savePersonalCustomizations(userId, pageId, pageCustomization) {
  if (!userId || !pageId) return;
  const ref = doc(db, "users", userId, "meta", "customizations");
  await setDoc(ref, { [pageId]: pageCustomization }, { merge: true });
}
// Utility functions for shared garden customization sync
import { doc, onSnapshot, setDoc, getDoc } from "firebase/firestore";
import { db } from "../firebaseConfig";

export function subscribeSharedCustomizations(sharedGardenId, setCustomizations) {
  if (!sharedGardenId) return () => {};
  const ref = doc(db, "sharedGardens", sharedGardenId, "meta", "customizations");
  const unsub = onSnapshot(ref, (snap) => {
    setCustomizations(snap.exists() ? snap.data() : {});
  });
  return unsub;
}

// Only update the changed page's customization, not the whole object
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
