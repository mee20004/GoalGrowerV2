import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../firebaseConfig";
import { hasProEntitlement } from "./revenueCat";
import { callCloudFunction } from "./cloudFunctions";

/** Local calendar month key (device timezone). */
export function getCurrentProCoinGrantMonth(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

/**
 * Grant Pro monthly coins once per calendar month while subscribed.
 * Idempotent via users/{uid}.lastProCoinGrantMonth.
 */
export async function processMonthlyProCoinGrant(customerInfo) {
  const uid = auth.currentUser?.uid;
  if (!uid || !hasProEntitlement(customerInfo)) {
    return { granted: false, reason: "not_pro" };
  }

  const currentMonth = getCurrentProCoinGrantMonth();

  try {
    const result = await callCloudFunction("processMonthlyProCoinGrant", { month: currentMonth });
    return result || { granted: false, reason: "error" };
  } catch (error) {
    console.error("Failed to process monthly Pro coin grant", error);
    return { granted: false, reason: "error" };
  }
}

/** Refresh shop inventory after a grant (optional helper for provider). */
export async function readCoinBalanceAfterGrant() {
  const uid = auth.currentUser?.uid;
  if (!uid) return null;
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() && typeof snap.data()?.coinBalance === "number"
    ? snap.data().coinBalance
    : null;
}
