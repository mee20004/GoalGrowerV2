import { Platform, Alert, NativeModules } from "react-native";
import Purchases, { LOG_LEVEL, PURCHASES_ERROR_CODE } from "react-native-purchases";
import RevenueCatUI, { PAYWALL_RESULT } from "react-native-purchases-ui";
import {
  PRO_ENTITLEMENT_ID,
  OFFERING_IDS,
  REVENUECAT_API_KEY,
} from "../constants/revenueCat";

let configured = false;
let operationChain = Promise.resolve();

const NATIVE_PLATFORMS = Platform.OS === "ios" || Platform.OS === "android";

function enqueueRevenueCatOperation(operation) {
  const run = async () => operation();
  const next = operationChain.then(run, run);
  operationChain = next.catch(() => {});
  return next;
}

function isConcurrentRequestError(error) {
  if (!error) return false;

  const backendCode = error?.info?.backendErrorCode ?? error?.info?.backend_error_code;
  if (backendCode === 7638) return true;

  const message = String(error?.message || error?.underlyingErrorMessage || "");
  return message.includes("another request in flight") || message.includes("Status code: 429");
}

async function withRetry(operation, retries = 3) {
  let lastError = null;

  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isConcurrentRequestError(error) || attempt === retries - 1) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
    }
  }

  throw lastError;
}

export function isRevenueCatSupported() {
  return NATIVE_PLATFORMS;
}

export function isRevenueCatUISupported() {
  if (!NATIVE_PLATFORMS) return false;
  return Boolean(NativeModules.RNPaywalls && NativeModules.RNCustomerCenter);
}

export function getRevenueCatUnavailableReason() {
  if (Platform.OS === "web") {
    return "Subscriptions are not available on web. Use the iOS or Android app.";
  }

  if (!NATIVE_PLATFORMS) {
    return "Subscriptions are only available in the iOS and Android app.";
  }

  if (!isRevenueCatUISupported()) {
    return "RevenueCat native UI is not linked in this build. Rebuild with a development build (not Expo Go), then try again:\n\nnpx expo run:ios\nor\neas build --profile development";
  }

  return null;
}

export function hasProEntitlement(customerInfo) {
  if (!customerInfo?.entitlements?.active) return false;
  return Boolean(customerInfo.entitlements.active[PRO_ENTITLEMENT_ID]);
}

export function getActiveProEntitlement(customerInfo) {
  return customerInfo?.entitlements?.active?.[PRO_ENTITLEMENT_ID] ?? null;
}

export function resolveOffering(offerings, offeringId = OFFERING_IDS.DEFAULT) {
  if (!offerings) return null;

  if (offeringId === OFFERING_IDS.DEFAULT) {
    return offerings.all?.[OFFERING_IDS.DEFAULT] ?? offerings.current ?? null;
  }

  return offerings.all?.[offeringId] ?? null;
}

export { OFFERING_IDS };

export async function configureRevenueCat() {
  if (!NATIVE_PLATFORMS) {
    return false;
  }

  return enqueueRevenueCatOperation(async () => {
    if (configured) {
      return true;
    }

    if (__DEV__) {
      Purchases.setLogLevel(LOG_LEVEL.DEBUG);
    }

    Purchases.configure({ apiKey: REVENUECAT_API_KEY });
    configured = true;
    return true;
  });
}

export async function identifyRevenueCatUser(appUserId) {
  if (!configured || !appUserId) return null;

  return enqueueRevenueCatOperation(async () => {
    try {
      const currentAppUserId = await withRetry(() => Purchases.getAppUserID());

      if (currentAppUserId === appUserId) {
        return withRetry(() => Purchases.getCustomerInfo());
      }

      const { customerInfo } = await withRetry(() => Purchases.logIn(appUserId));
      return customerInfo;
    } catch (error) {
      console.error("RevenueCat logIn failed:", error);
      throw error;
    }
  });
}

export async function logOutRevenueCatUser() {
  if (!configured) return null;

  return enqueueRevenueCatOperation(async () => {
    try {
      const currentAppUserId = await withRetry(() => Purchases.getAppUserID());
      if (currentAppUserId.startsWith("$RCAnonymousID:")) {
        return withRetry(() => Purchases.getCustomerInfo());
      }

      return await withRetry(() => Purchases.logOut());
    } catch (error) {
      console.error("RevenueCat logOut failed:", error);
      throw error;
    }
  });
}

export async function fetchCustomerInfo() {
  if (!configured) return null;

  return enqueueRevenueCatOperation(async () => {
    try {
      return await withRetry(() => Purchases.getCustomerInfo());
    } catch (error) {
      console.error("RevenueCat getCustomerInfo failed:", error);
      throw error;
    }
  });
}

export async function fetchOfferings() {
  if (!configured) return null;

  return enqueueRevenueCatOperation(async () => {
    try {
      return await withRetry(() => Purchases.getOfferings());
    } catch (error) {
      console.error("RevenueCat getOfferings failed:", error);
      throw error;
    }
  });
}

export async function restorePurchases() {
  if (!configured) {
    throw new Error("RevenueCat is not configured.");
  }

  return enqueueRevenueCatOperation(async () => {
    try {
      return await withRetry(() => Purchases.restorePurchases());
    } catch (error) {
      handlePurchaseError(error, "restore");
      throw error;
    }
  });
}

function alertRevenueCatUnavailable() {
  const reason = getRevenueCatUnavailableReason();
  Alert.alert("Unavailable", reason || "Subscriptions are not available in this environment.");
}

export async function presentPaywall(offeringId = OFFERING_IDS.DEFAULT) {
  if (!configured) {
    alertRevenueCatUnavailable();
    return PAYWALL_RESULT.ERROR;
  }

  if (!isRevenueCatUISupported()) {
    alertRevenueCatUnavailable();
    return PAYWALL_RESULT.ERROR;
  }

  try {
    const offerings = await fetchOfferings();
    const offering = resolveOffering(offerings, offeringId);

    if (!offering) {
      Alert.alert(
        "Offering Unavailable",
        `Could not load the "${offeringId}" offering. Check that it exists in RevenueCat and has a paywall attached.`
      );
      return PAYWALL_RESULT.ERROR;
    }

    return await RevenueCatUI.presentPaywall({ offering });
  } catch (error) {
    console.error("RevenueCat presentPaywall failed:", error);
    Alert.alert("Paywall Error", getReadablePurchaseError(error));
    return PAYWALL_RESULT.ERROR;
  }
}

export async function presentPaywallIfNeeded(
  offeringId = OFFERING_IDS.DEFAULT,
  requiredEntitlementIdentifier = PRO_ENTITLEMENT_ID
) {
  if (!configured || !isRevenueCatUISupported()) {
    return PAYWALL_RESULT.NOT_PRESENTED;
  }

  try {
    const offerings = await fetchOfferings();
    const offering = resolveOffering(offerings, offeringId);

    if (!offering) {
      console.warn(`RevenueCat offering "${offeringId}" was not found.`);
      return PAYWALL_RESULT.ERROR;
    }

    return await RevenueCatUI.presentPaywallIfNeeded({
      requiredEntitlementIdentifier,
      offering,
    });
  } catch (error) {
    console.error("RevenueCat presentPaywallIfNeeded failed:", error);
    Alert.alert("Paywall Error", getReadablePurchaseError(error));
    return PAYWALL_RESULT.ERROR;
  }
}

export async function presentCustomerCenter() {
  if (!configured || !isRevenueCatUISupported()) {
    alertRevenueCatUnavailable();
    return;
  }

  try {
    await RevenueCatUI.presentCustomerCenter({
      callbacks: {
        onRestoreCompleted: ({ customerInfo }) => {
          if (hasProEntitlement(customerInfo)) {
            Alert.alert("Restored", "Your purchases have been restored.");
          }
        },
        onRestoreFailed: ({ error }) => {
          Alert.alert("Restore Failed", getReadablePurchaseError(error));
        },
      },
    });
  } catch (error) {
    console.error("RevenueCat presentCustomerCenter failed:", error);
    Alert.alert("Customer Center Error", getReadablePurchaseError(error));
  }
}

export function getReadablePurchaseError(error) {
  if (!error) return "Something went wrong. Please try again.";

  const message = String(error.message || error.underlyingErrorMessage || "");
  if (message.includes("document is not available")) {
    return getRevenueCatUnavailableReason() || "Paywall requires a native iOS or Android build.";
  }

  if (error.code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR) {
    return "Purchase cancelled.";
  }

  if (error.code === PURCHASES_ERROR_CODE.NETWORK_ERROR) {
    return "Network error. Check your connection and try again.";
  }

  if (error.code === PURCHASES_ERROR_CODE.STORE_PROBLEM_ERROR) {
    return "The app store is having trouble right now. Try again shortly.";
  }

  if (error.code === PURCHASES_ERROR_CODE.PRODUCT_NOT_AVAILABLE_FOR_PURCHASE_ERROR) {
    return "This product is not available yet.";
  }

  if (isConcurrentRequestError(error)) {
    return "RevenueCat is busy syncing. Please try again in a moment.";
  }

  return error.message || "Something went wrong. Please try again.";
}

export function handlePurchaseError(error, context = "purchase") {
  if (error?.code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR) {
    return;
  }

  const title = context === "restore" ? "Restore Failed" : "Purchase Failed";
  Alert.alert(title, getReadablePurchaseError(error));
}

export function describePaywallResult(result) {
  switch (result) {
    case PAYWALL_RESULT.PURCHASED:
      return "Thanks for subscribing to Goal Grower Pro!";
    case PAYWALL_RESULT.RESTORED:
      return "Your purchases have been restored.";
    case PAYWALL_RESULT.CANCELLED:
      return null;
    case PAYWALL_RESULT.NOT_PRESENTED:
      return "You already have Goal Grower Pro.";
    default:
      return null;
  }
}
