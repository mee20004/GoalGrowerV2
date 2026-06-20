const admin = require("firebase-admin");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const {
  COIN_REWARDS,
  PRO_MONTHLY_COIN_GRANT,
  CREDIT_SOURCES,
  getShopItemById,
  getOwnedDecorField,
  normalizeOwnedMap,
  resolveClaimAmount,
  getDefaultShopPayload,
  isShopItemOwned,
  DEFAULT_OWNED_PLANTS,
  DEFAULT_OWNED_POTS,
  DEFAULT_OWNED_FARBG,
  DEFAULT_OWNED_WINDOW_FRAMES,
  DEFAULT_OWNED_WALL_BG,
  DEFAULT_OWNED_SHELF_COLORS,
} = require("./catalog");
const {
  getSubscriber,
  isProEntitlementActive,
  getCoinPurchaseTransactions,
  getProcessedPurchaseId,
  COIN_PRODUCT_ID,
} = require("./revenueCat");

const revenueCatSecretKey = defineSecret("REVENUECAT_SECRET_API_KEY");

const revenueCatCallableOptions = {
  secrets: [revenueCatSecretKey],
};

admin.initializeApp();
const db = admin.firestore();

function requireAuth(request) {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "You must be signed in.");
  }
  return request.auth.uid;
}

function userRef(uid) {
  return db.doc(`users/${uid}`);
}

const TROPHY_SCORE_BONUS = {
  bronze: 20,
  silver: 45,
  gold: 85,
  platinum: 110,
};

function getGoalTrophyRating(goal) {
  const longestStreak = Number(goal?.longestStreak) || 0;
  const healthLevel = Number(goal?.healthLevel) || 0;

  if (longestStreak >= 24 && healthLevel >= 5) return "platinum";
  if (longestStreak >= 18 && healthLevel >= 4) return "gold";
  if (longestStreak >= 7 && healthLevel >= 3) return "silver";
  return "bronze";
}

function calculateGoalScore(goal) {
  const currentStreak = Number(goal?.currentStreak) || 0;
  const longestStreak = Number(goal?.longestStreak) || 0;
  const trophyRating = getGoalTrophyRating(goal);
  const trophyBonus = TROPHY_SCORE_BONUS[trophyRating] || 0;
  return currentStreak * 8 + longestStreak * 4 + trophyBonus;
}

async function getScoredGoalsForUser(uid) {
  const personalGoalsSnap = await db.collection(`users/${uid}/goals`).get();
  const personalGoals = personalGoalsSnap.docs
    .map((goalDoc) => ({ id: goalDoc.id, ...goalDoc.data() }))
    .filter((goal) => !(goal?.gardenType === "shared" || !!goal?.sharedGardenId));

  const sharedGardensSnap = await db
    .collection("sharedGardens")
    .where("memberIds", "array-contains", uid)
    .get();

  const sharedGoalGroups = await Promise.all(
    sharedGardensSnap.docs.map(async (gardenDoc) => {
      const layoutSnap = await db.collection(`sharedGardens/${gardenDoc.id}/layout`).get();
      return layoutSnap.docs.map((layoutDoc) => ({
        id: layoutDoc.id,
        ...layoutDoc.data(),
        gardenType: "shared",
        sharedGardenId: gardenDoc.id,
      }));
    })
  );

  return [...personalGoals, ...sharedGoalGroups.flat()];
}

async function calculateOverallScoreForUser(uid) {
  const goals = await getScoredGoalsForUser(uid);
  return goals.reduce((total, goal) => total + calculateGoalScore(goal), 0);
}

async function persistOverallScore(uid) {
  const ref = userRef(uid);
  const snap = await ref.get();
  if (!snap.exists) return 0;

  const calculatedScore = await calculateOverallScoreForUser(uid);
  const currentScore = snap.data()?.overallScore;

  if (currentScore !== calculatedScore) {
    await ref.set({ overallScore: calculatedScore }, { merge: true });
  }

  return calculatedScore;
}

async function fetchVerifiedSubscriber(uid) {
  const secretKey = revenueCatSecretKey.value();
  try {
    return await getSubscriber(uid, secretKey);
  } catch (error) {
    console.error("RevenueCat subscriber fetch failed", error);
    throw new HttpsError(
      "failed-precondition",
      "Could not verify your purchase with the store. Try again shortly."
    );
  }
}

function matchesTransactionId(entry, transactionId) {
  const processedId = getProcessedPurchaseId(entry);
  return (
    processedId === transactionId
    || entry.id === transactionId
    || entry.storeTransactionId === transactionId
  );
}

async function creditVerifiedCoinPurchases(uid, purchases) {
  const coinAmount = CREDIT_SOURCES.iap_coins;
  if (!coinAmount || coinAmount <= 0) {
    throw new HttpsError("internal", "Coin grant amount is not configured.");
  }

  const ref = userRef(uid);
  let totalCredited = 0;
  const creditedTransactionIds = [];

  await db.runTransaction(async (tx) => {
    const userSnap = await tx.get(ref);
    const data = userSnap.exists ? userSnap.data() : {};
    let balance =
      typeof data.coinBalance === "number" ? data.coinBalance : COIN_REWARDS.STARTING_BALANCE;

    for (const purchase of purchases) {
      const processedId = getProcessedPurchaseId(purchase);
      const processedRef = ref.collection("processedPurchases").doc(processedId);
      const processedSnap = await tx.get(processedRef);
      if (processedSnap.exists) continue;

      tx.set(processedRef, {
        productId: COIN_PRODUCT_ID,
        purchaseDate: purchase.purchaseDate || null,
        isSandbox: !!purchase.isSandbox,
        creditedAt: admin.firestore.FieldValue.serverTimestamp(),
        creditedAmount: coinAmount,
      });

      balance += coinAmount;
      totalCredited += coinAmount;
      creditedTransactionIds.push(processedId);
    }

    if (totalCredited > 0) {
      tx.set(
        ref,
        {
          coinBalance: balance,
          shopInitialized: true,
          lastCoinCreditAt: admin.firestore.FieldValue.serverTimestamp(),
          lastCoinCreditSource: "iap_coins",
        },
        { merge: true }
      );
    }
  });

  return { totalCredited, creditedTransactionIds };
}

exports.verifyAndCreditCoinPurchase = onCall(revenueCatCallableOptions, async (request) => {
  const uid = requireAuth(request);
  const transactionId =
    typeof request.data?.transactionId === "string"
      ? request.data.transactionId.trim()
      : "";

  const subscriber = await fetchVerifiedSubscriber(uid);
  if (!subscriber) {
    throw new HttpsError(
      "failed-precondition",
      "No purchase record found yet. Try again in a moment."
    );
  }

  const coinPurchases = getCoinPurchaseTransactions(subscriber);
  if (coinPurchases.length === 0) {
    return { credited: false, reason: "no_purchases", amount: 0 };
  }

  const purchasesToCredit = transactionId
    ? coinPurchases.filter((entry) => matchesTransactionId(entry, transactionId))
    : coinPurchases;

  if (transactionId && purchasesToCredit.length === 0) {
    throw new HttpsError("failed-precondition", "Purchase could not be verified.");
  }

  const { totalCredited, creditedTransactionIds } = await creditVerifiedCoinPurchases(
    uid,
    purchasesToCredit
  );

  if (totalCredited <= 0) {
    return {
      credited: false,
      reason: transactionId ? "already_credited" : "already_credited",
      amount: 0,
      transactionId: transactionId || null,
    };
  }

  return {
    credited: true,
    amount: totalCredited,
    transactionIds: creditedTransactionIds,
  };
});

exports.initializeShop = onCall(async (request) => {
  const uid = requireAuth(request);
  const ref = userRef(uid);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() : {};

    if (data.shopInitialized) {
      return { initialized: false, reason: "already_initialized" };
    }

    const payload = getDefaultShopPayload(data);
    tx.set(ref, payload, { merge: true });
    return { initialized: true, coinBalance: payload.coinBalance };
  });
});

exports.purchaseShopItem = onCall(async (request) => {
  const uid = requireAuth(request);
  const itemId = request.data?.itemId;

  if (!itemId || typeof itemId !== "string") {
    throw new HttpsError("invalid-argument", "A valid itemId is required.");
  }

  const item = getShopItemById(itemId);
  if (!item) {
    throw new HttpsError("not-found", "This shop item does not exist.");
  }

  const ownedField =
    item.type === "plant"
      ? "ownedPlants"
      : item.type === "pot"
        ? "ownedPots"
        : getOwnedDecorField(item.type);

  if (!ownedField) {
    throw new HttpsError("failed-precondition", "This item cannot be purchased.");
  }

  const ref = userRef(uid);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() : {};

    if (isShopItemOwned(data, item)) {
      throw new HttpsError("already-exists", "You already own this item.");
    }

    const balance = typeof data.coinBalance === "number" ? data.coinBalance : COIN_REWARDS.STARTING_BALANCE;
    if (balance < item.price) {
      throw new HttpsError("failed-precondition", "Not enough coins.");
    }

    const defaults = {
      ownedPlants: DEFAULT_OWNED_PLANTS,
      ownedPots: DEFAULT_OWNED_POTS,
      ownedFarBg: DEFAULT_OWNED_FARBG,
      ownedWindowFrames: DEFAULT_OWNED_WINDOW_FRAMES,
      ownedWallBg: DEFAULT_OWNED_WALL_BG,
      ownedShelfColors: DEFAULT_OWNED_SHELF_COLORS,
    }[ownedField];

    const ownedMap = normalizeOwnedMap(data[ownedField], defaults);
    const ownedKey = String(item.assetIndex ?? item.assetKey);

    tx.set(
      ref,
      {
        coinBalance: balance - item.price,
        [ownedField]: {
          ...ownedMap,
          [ownedKey]: true,
        },
        shopInitialized: true,
        lastShopPurchaseAt: admin.firestore.FieldValue.serverTimestamp(),
        lastShopPurchaseId: item.id,
      },
      { merge: true }
    );
  });

  return { purchased: true, itemId };
});

exports.claimEconomyReward = onCall(async (request) => {
  const uid = requireAuth(request);
  const claimKey = request.data?.claimKey;
  const source = typeof request.data?.source === "string" ? request.data.source : "journey";

  const amount = resolveClaimAmount(claimKey);
  if (!amount || amount <= 0) {
    throw new HttpsError("invalid-argument", "Invalid reward claim.");
  }

  const ref = userRef(uid);
  let alreadyClaimed = false;

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() : {};
    const claims = data.journeyRewardClaims || {};

    if (claims[claimKey]) {
      alreadyClaimed = true;
      return;
    }

    const balance =
      typeof data.coinBalance === "number" ? data.coinBalance : COIN_REWARDS.STARTING_BALANCE;

    tx.set(
      ref,
      {
        coinBalance: balance + amount,
        journeyRewardClaims: { ...claims, [claimKey]: true },
        shopInitialized: true,
        lastCoinCreditAt: admin.firestore.FieldValue.serverTimestamp(),
        lastCoinCreditSource: source,
      },
      { merge: true }
    );
  });

  if (alreadyClaimed) {
    return { claimed: false, reason: "already_claimed" };
  }

  return { claimed: true, amount, claimKey };
});

exports.creditCoins = onCall(async (request) => {
  const uid = requireAuth(request);
  const source = request.data?.source;

  if (source === "iap_coins") {
    throw new HttpsError(
      "failed-precondition",
      "Coin pack purchases must be verified through verifyAndCreditCoinPurchase."
    );
  }

  const amount = CREDIT_SOURCES[source];
  if (!amount || amount <= 0) {
    throw new HttpsError("invalid-argument", "Invalid coin credit source.");
  }

  const ref = userRef(uid);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() : {};
    const balance = typeof data.coinBalance === "number" ? data.coinBalance : 0;

    tx.set(
      ref,
      {
        coinBalance: balance + amount,
        shopInitialized: true,
        lastCoinCreditAt: admin.firestore.FieldValue.serverTimestamp(),
        lastCoinCreditSource: source,
      },
      { merge: true }
    );
  });

  return { credited: true, amount, source };
});

exports.processMonthlyProCoinGrant = onCall(revenueCatCallableOptions, async (request) => {
  const uid = requireAuth(request);
  const now = new Date();
  const currentMonth =
    request.data?.month ||
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const subscriber = await fetchVerifiedSubscriber(uid);
  if (!subscriber || !isProEntitlementActive(subscriber)) {
    return { granted: false, reason: "not_pro" };
  }

  const ref = userRef(uid);

  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() : {};

    if (data.lastProCoinGrantMonth === currentMonth) {
      return { granted: false, reason: "already_granted" };
    }

    const balance =
      typeof data.coinBalance === "number" ? data.coinBalance : COIN_REWARDS.STARTING_BALANCE;

    tx.set(
      ref,
      {
        coinBalance: balance + PRO_MONTHLY_COIN_GRANT,
        shopInitialized: true,
        lastProCoinGrantMonth: currentMonth,
        lastCoinCreditAt: admin.firestore.FieldValue.serverTimestamp(),
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
});

exports.recalculateOverallScore = onCall(async (request) => {
  const uid = requireAuth(request);
  const targetUid = request.data?.targetUid || uid;

  if (targetUid !== uid) {
    throw new HttpsError("permission-denied", "You can only recalculate your own score.");
  }

  const score = await persistOverallScore(targetUid);
  return { score };
});

exports.recalculateSharedGardenScores = onCall(async (request) => {
  const uid = requireAuth(request);
  const gardenId = request.data?.gardenId;

  if (!gardenId || typeof gardenId !== "string") {
    throw new HttpsError("invalid-argument", "A valid gardenId is required.");
  }

  const gardenSnap = await db.doc(`sharedGardens/${gardenId}`).get();
  if (!gardenSnap.exists) {
    throw new HttpsError("not-found", "Shared garden not found.");
  }

  const memberIds = Array.isArray(gardenSnap.data()?.memberIds)
    ? gardenSnap.data().memberIds
    : [];

  if (!memberIds.includes(uid)) {
    throw new HttpsError("permission-denied", "You must be a member of this shared garden.");
  }

  const scores = await Promise.all(
    memberIds.map(async (memberId) => ({
      uid: memberId,
      score: await persistOverallScore(memberId),
    }))
  );

  const callerScore = scores.find((entry) => entry.uid === uid)?.score ?? 0;
  return { scores, score: callerScore };
});
