import {
  doc,
  getDoc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { auth, db } from "../firebaseConfig";
import { onFirestoreListenerError } from "./firestoreListener";
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

function getDefaultShopPayload(existingData = {}) {
  return {
    coinBalance:
      typeof existingData.coinBalance === "number" ? existingData.coinBalance : COIN_REWARDS.STARTING_BALANCE,
    ownedPlants: normalizeOwnedMap(existingData.ownedPlants, DEFAULT_OWNED_PLANTS),
    ownedPots: normalizeOwnedMap(existingData.ownedPots, DEFAULT_OWNED_POTS),
    ownedFarBg: normalizeOwnedMap(existingData.ownedFarBg, DEFAULT_OWNED_FARBG),
    ownedWindowFrames: normalizeOwnedMap(existingData.ownedWindowFrames, DEFAULT_OWNED_WINDOW_FRAMES),
    ownedWallBg: normalizeOwnedMap(existingData.ownedWallBg, DEFAULT_OWNED_WALL_BG),
    ownedShelfColors: normalizeOwnedMap(existingData.ownedShelfColors, DEFAULT_OWNED_SHELF_COLORS),
    shopInitialized: true,
    shopInitializedAt: serverTimestamp(),
  };
}

export async function ensureShopInventoryInitialized(uid) {
  if (!uid) return null;

  const userRef = getUserShopRef(uid);
  const snap = await getDoc(userRef);

  if (!snap.exists()) {
    const payload = getDefaultShopPayload();
    await setDoc(userRef, payload, { merge: true });
    return buildInventoryState(payload);
  }

  const data = snap.data();
  if (data.shopInitialized) {
    return buildInventoryState(data);
  }

  const payload = getDefaultShopPayload(data);
  await setDoc(userRef, payload, { merge: true });
  return buildInventoryState(payload);
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

  const ownedField =
    item.type === "plant"
      ? "ownedPlants"
      : item.type === "pot"
        ? "ownedPots"
        : getOwnedDecorField(item.type);

  if (!ownedField) {
    throw new Error("This item cannot be purchased.");
  }

  const userRef = getUserShopRef(uid);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(userRef);
    const data = snap.exists() ? snap.data() : {};
    const inventory = buildInventoryState(data);

    if (isShopItemOwned(inventory, item)) {
      throw new Error("You already own this item.");
    }

    if (inventory.coinBalance < item.price) {
      throw new Error("Not enough coins.");
    }

    const ownedMap = inventory[ownedField];

    tx.set(
      userRef,
      {
        coinBalance: inventory.coinBalance - item.price,
        [ownedField]: {
          ...ownedMap,
          [String(item.assetIndex ?? item.assetKey)]: true,
        },
        shopInitialized: true,
        lastShopPurchaseAt: serverTimestamp(),
        lastShopPurchaseId: item.id,
      },
      { merge: true }
    );
  });
}

export async function creditCoins(amount, source = "manual") {
  const uid = auth.currentUser?.uid;
  if (!uid || amount <= 0) return null;

  const userRef = getUserShopRef(uid);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(userRef);
    const data = snap.exists() ? snap.data() : {};
    const balance = typeof data.coinBalance === "number" ? data.coinBalance : 0;

    tx.set(
      userRef,
      {
        coinBalance: balance + amount,
        shopInitialized: true,
        lastCoinCreditAt: serverTimestamp(),
        lastCoinCreditSource: source,
      },
      { merge: true }
    );
  });

  const nextSnap = await getDoc(userRef);
  return nextSnap.exists() ? buildInventoryState(nextSnap.data()) : null;
}

export async function awardGoalCompletionCoins() {
  return creditCoins(COIN_REWARDS.GOAL_COMPLETION, "goal_completion");
}

export async function claimJourneyReward(claimKey, amount, source = "journey") {
  const uid = auth.currentUser?.uid;
  if (!uid || amount <= 0) return { claimed: false, reason: "invalid" };

  const userRef = getUserShopRef(uid);
  let alreadyClaimed = false;

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(userRef);
    const data = snap.exists() ? snap.data() : {};
    const claims = data.journeyRewardClaims || {};
    if (claims[claimKey]) {
      alreadyClaimed = true;
      return;
    }

    const balance = typeof data.coinBalance === "number" ? data.coinBalance : COIN_REWARDS.STARTING_BALANCE;
    tx.set(
      userRef,
      {
        coinBalance: balance + amount,
        journeyRewardClaims: { ...claims, [claimKey]: true },
        shopInitialized: true,
        lastCoinCreditAt: serverTimestamp(),
        lastCoinCreditSource: source,
      },
      { merge: true }
    );
  });

  if (alreadyClaimed) return { claimed: false, reason: "already_claimed" };
  return { claimed: true, amount };
}
