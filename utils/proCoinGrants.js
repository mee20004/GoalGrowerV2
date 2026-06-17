import { doc, getDoc, runTransaction, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../firebaseConfig";
import { PRO_MONTHLY_COIN_GRANT } from "../constants/subscriptionLimits";
import { COIN_REWARDS } from "../constants/ShopCatalog";
import { hasProEntitlement } from "./revenueCat";

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
  const userRef = doc(db, "users", uid);

  try {
    const result = await runTransaction(db, async (tx) => {
      const snap = await tx.get(userRef);
      const data = snap.exists() ? snap.data() : {};

      if (data.lastProCoinGrantMonth === currentMonth) {
        return { granted: false, reason: "already_granted" };
      }

      const balance = typeof data.coinBalance === "number"
        ? data.coinBalance
        : COIN_REWARDS.STARTING_BALANCE;

      tx.set(
        userRef,
        {
          coinBalance: balance + PRO_MONTHLY_COIN_GRANT,
          shopInitialized: true,
          lastProCoinGrantMonth: currentMonth,
          lastCoinCreditAt: serverTimestamp(),
          lastCoinCreditSource: "pro_monthly",
        },
        { merge: true }
      );

      return {
        granted: true,
        amount: PRO_MONTHLY_COIN_GRANT,
        month: currentMonth,
      };
    });

    return result;
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
