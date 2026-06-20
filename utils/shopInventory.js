import {
  doc,
  getDoc,
  onSnapshot,
} from "firebase/firestore";
import { auth, db } from "../firebaseConfig";
import { onFirestoreListenerError } from "./firestoreListener";
import { callCloudFunction } from "./cloudFunctions";
import {
  COIN_REWARDS,
  DECOR_TYPES,
  DEFAULT_OWNED_FARBG,
  DEFAULT_OWNED_PLANTS,
  DEFAULT_OWNED_POTS,
  DEFAULT_OWNED_SHELF_COLORS,
  DEFAULT_OWNED_WALL_BG,
  DEFAULT_OWNED_WINDOW_FRAMES,
  getOwnedDecorField,
  getShopItemById,
} from "../constants/ShopCatalog";
import { logAnalyticsEvent } from "./analytics";

function getUserShopRef(uid) {
  return doc(db, "users", uid);
}

export function normalizeOwnedMap(map, defaults) {
  const normalized = { ...defaults, ...(map || {}) };
  Object.keys(defaults).forEach((key) => {
    const numericKey = Number(key);
    if (Number.isFinite(numericKey) && map?.[numericKey] !== undefined) {
      normalized[key] = map[numericKey];
    }
  });
  return normalized;
}

export function buildInventoryState(userData) {
  return {
    coinBalance: typeof userData?.coinBalance === "number" ? userData.coinBalance : 0,
    ownedPlants: normalizeOwnedMap(userData?.ownedPlants, DEFAULT_OWNED_PLANTS),
    ownedPots: normalizeOwnedMap(userData?.ownedPots, DEFAULT_OWNED_POTS),
    ownedFarBg: normalizeOwnedMap(userData?.ownedFarBg, DEFAULT_OWNED_FARBG),
    ownedWindowFrames: normalizeOwnedMap(userData?.ownedWindowFrames, DEFAULT_OWNED_WINDOW_FRAMES),
    ownedWallBg: normalizeOwnedMap(userData?.ownedWallBg, DEFAULT_OWNED_WALL_BG),
    ownedShelfColors: normalizeOwnedMap(userData?.ownedShelfColors, DEFAULT_OWNED_SHELF_COLORS),
    shopInitialized: !!userData?.shopInitialized,
  };
}

export async function ensureShopInventoryInitialized(uid) {
  if (!uid) return null;

  const userRef = getUserShopRef(uid);
  const snap = await getDoc(userRef);

  if (snap.exists() && snap.data().shopInitialized) {
    return buildInventoryState(snap.data());
  }

  await callCloudFunction("initializeShop");
  const nextSnap = await getDoc(userRef);
  return nextSnap.exists() ? buildInventoryState(nextSnap.data()) : null;
}

export function subscribeShopInventory(uid, onChange, onError) {
  if (!uid) {
    onChange(null);
    return () => {};
  }

  return onSnapshot(
    getUserShopRef(uid),
    (snap) => {
      if (!snap.exists()) {
        onChange(null);
        return;
      }
      onChange(buildInventoryState(snap.data()));
    },
    onError || onFirestoreListenerError('Shop inventory listener')
  );
}

export function isPlantOwned(inventory, species) {
  return !!inventory?.ownedPlants?.[species];
}

export function isPotOwned(inventory, potKey) {
  return !!inventory?.ownedPots?.[potKey];
}

function isDecorOwned(inventory, type, index) {
  const key = String(index);
  switch (type) {
    case DECOR_TYPES.FARBG:
      return !!inventory?.ownedFarBg?.[key];
    case DECOR_TYPES.WINDOW:
      return !!inventory?.ownedWindowFrames?.[key];
    case DECOR_TYPES.WALL:
      return !!inventory?.ownedWallBg?.[key];
    case DECOR_TYPES.SHELF:
      return !!inventory?.ownedShelfColors?.[key];
    default:
      return false;
  }
}

export function isFarBgOwned(inventory, index) {
  return isDecorOwned(inventory, DECOR_TYPES.FARBG, index);
}

export function isWindowFrameOwned(inventory, index) {
  return isDecorOwned(inventory, DECOR_TYPES.WINDOW, index);
}

export function isWallBgOwned(inventory, index) {
  return isDecorOwned(inventory, DECOR_TYPES.WALL, index);
}

export function isShelfColorOwned(inventory, index) {
  return isDecorOwned(inventory, DECOR_TYPES.SHELF, index);
}

export function isShopItemOwned(inventory, item) {
  if (!inventory || !item) return false;
  if (item.type === "plant") return isPlantOwned(inventory, item.assetKey);
  if (item.type === "pot") return isPotOwned(inventory, item.assetKey);
  if ([DECOR_TYPES.FARBG, DECOR_TYPES.WINDOW, DECOR_TYPES.WALL, DECOR_TYPES.SHELF].includes(item.type)) {
    return isDecorOwned(inventory, item.type, item.assetIndex ?? Number(item.assetKey));
  }
  return false;
}

export async function purchaseShopItem(itemId) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("You must be signed in to purchase items.");

  const item = getShopItemById(itemId);
  if (!item) throw new Error("This shop item does not exist.");

  try {
    await callCloudFunction("purchaseShopItem", { itemId });
  } catch (error) {
    const message =
      error?.message?.replace(/^Firebase:\s*/i, "") ||
      error?.details ||
      "Purchase failed.";
    throw new Error(message);
  }

  logAnalyticsEvent("shop_purchase", {
    item_id: item.id,
    item_type: item.type,
    price: item.price,
  });
}

export async function creditCoins(amount, source = "manual") {
  const uid = auth.currentUser?.uid;
  if (!uid || amount <= 0) return null;

  const allowedSources = ["goal_completion"];
  if (!allowedSources.includes(source)) {
    throw new Error("Invalid coin credit source.");
  }

  const result = await callCloudFunction("creditCoins", { source });
  const creditedAmount = result?.amount ?? amount;

  logAnalyticsEvent("coin_credit", { amount: creditedAmount, source });

  const nextSnap = await getDoc(getUserShopRef(uid));
  return nextSnap.exists() ? buildInventoryState(nextSnap.data()) : null;
}

export async function verifyAndCreditCoinPurchase(transactionId) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("You must be signed in to verify purchases.");

  try {
    const payload =
      typeof transactionId === "string" && transactionId.trim()
        ? { transactionId: transactionId.trim() }
        : {};
    const result = await callCloudFunction("verifyAndCreditCoinPurchase", payload);

    if (result?.credited) {
      logAnalyticsEvent("coin_credit", {
        amount: result.amount,
        source: "iap_coins",
      });
    }

    return result;
  } catch (error) {
    const message =
      error?.message?.replace(/^Firebase:\s*/i, "") ||
      error?.details ||
      "Coin verification failed.";
    throw new Error(message);
  }
}

export async function awardGoalCompletionCoins() {
  return creditCoins(COIN_REWARDS.GOAL_COMPLETION, "goal_completion");
}

export async function claimJourneyReward(claimKey, amount, source = "journey") {
  const uid = auth.currentUser?.uid;
  if (!uid || amount <= 0) return { claimed: false, reason: "invalid" };

  try {
    const result = await callCloudFunction("claimEconomyReward", { claimKey, source });
    if (result?.claimed) {
      return { claimed: true, amount: result.amount ?? amount };
    }
    return { claimed: false, reason: result?.reason || "already_claimed" };
  } catch (error) {
    console.error("claimJourneyReward failed", error);
    return { claimed: false, reason: "error" };
  }
}
