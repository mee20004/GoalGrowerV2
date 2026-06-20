const PRO_ENTITLEMENT_ID = "pro";
const COIN_PRODUCT_ID = "coins";

function revenueCatError(status, body) {
  const error = new Error(`RevenueCat API ${status}: ${body}`);
  error.status = status;
  return error;
}

async function revenueCatFetch(path, secretKey, options = {}) {
  const response = await fetch(`https://api.revenuecat.com/v1${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  if (response.status === 404) {
    return null;
  }

  const body = await response.text();
  if (!response.ok) {
    throw revenueCatError(response.status, body);
  }

  return body ? JSON.parse(body) : null;
}

/**
 * Fetch subscriber profile using the App User ID (Firebase UID).
 * Uses RevenueCat REST API v1 — compatible with project secret keys.
 */
async function getSubscriber(appUserId, secretKey) {
  if (!appUserId || !secretKey) {
    throw new Error("RevenueCat subscriber lookup requires app user id and secret key.");
  }

  const encodedId = encodeURIComponent(appUserId);
  const payload = await revenueCatFetch(`/subscribers/${encodedId}`, secretKey);
  return payload?.subscriber ?? null;
}

function parseEntitlementExpiry(expiresDate) {
  if (!expiresDate) return null;
  const parsed = new Date(expiresDate);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isProEntitlementActive(subscriber) {
  const entitlement = subscriber?.entitlements?.[PRO_ENTITLEMENT_ID];
  if (!entitlement) return false;

  const expiresAt = parseEntitlementExpiry(entitlement.expires_date);
  if (!expiresAt) return true;
  return expiresAt.getTime() > Date.now();
}

function getCoinPurchaseTransactions(subscriber) {
  const entries = subscriber?.non_subscriptions?.[COIN_PRODUCT_ID];
  if (!Array.isArray(entries)) return [];

  return entries
    .map((entry) => ({
      id: entry?.id || entry?.store_transaction_id || null,
      storeTransactionId: entry?.store_transaction_id || entry?.id || null,
      purchaseDate: entry?.purchase_date || null,
      isSandbox: !!entry?.is_sandbox,
    }))
    .filter((entry) => entry.id);
}

function getProcessedPurchaseId(entry) {
  return String(entry.storeTransactionId || entry.id);
}

module.exports = {
  PRO_ENTITLEMENT_ID,
  COIN_PRODUCT_ID,
  getSubscriber,
  isProEntitlementActive,
  getCoinPurchaseTransactions,
  getProcessedPurchaseId,
};
