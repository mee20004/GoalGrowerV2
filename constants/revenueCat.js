import { Platform } from "react-native";

/**
 * RevenueCat configuration for Goal Grower.
 *
 * Dashboard setup checklist:
 * 1. Create entitlement identifier below and attach all products to it.
 * 2. Create products in App Store Connect / Google Play with matching store IDs.
 * 3. Add products to RevenueCat and map them to packages:
 *    - Coins  -> custom package in CoinOfferings (consumable, e.g. coins_pack)
 *    - Yearly -> $rc_annual
 *    - Monthly -> $rc_monthly
 * 4. Create an Offering (e.g. "default") and mark it Current.
 * 5. Design a Paywall for that Offering in the RevenueCat dashboard.
 * 6. Configure Customer Center paths in the dashboard (Settings > Customer Center).
 * 7. Copy the App Store / Play Store public API keys into EAS env vars (not the test key).
 */

/** Display name in RevenueCat: "Goal Grower - Habit Tracker Pro" */
export const PRO_ENTITLEMENT_ID = "pro";

/** Store product identifiers — must match App Store Connect / Google Play Console. */
export const PRODUCT_IDS = {
  COINS: "coins",
  YEARLY: "yearly",
  MONTHLY: "monthly",
};

/** RevenueCat package lookup keys (standard offering package types). */
export const PACKAGE_TYPES = {
  CUSTOM: "custom",
  ANNUAL: "$rc_annual",
  MONTHLY: "$rc_monthly",
};

export const PRO_ENTITLEMENT_DISPLAY_NAME = "Goal Grower - Habit Tracker Pro";

/** RevenueCat offering identifiers — must match dashboard Offering IDs exactly. */
export const OFFERING_IDS = {
  DEFAULT: "default",
  COINS: "CoinOfferings",
};

/** Sandbox/test key — local development only. Never ship in TestFlight/App Store builds. */
export const REVENUECAT_TEST_API_KEY = "test_QqxGrZYjqcGGCrEshrRxtVyGpcY";

export function getRevenueCatApiKey() {
  const productionKey = Platform.select({
    ios: process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY,
    android: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY,
    default: null,
  });

  if (productionKey) {
    return productionKey;
  }

  if (__DEV__) {
    return REVENUECAT_TEST_API_KEY;
  }

  return null;
}

/** Validates the platform-specific public RevenueCat key baked into the build. */
export function validateRevenueCatApiKey(apiKey) {
  if (!apiKey || typeof apiKey !== "string") {
    return {
      valid: false,
      reason:
        "RevenueCat is not configured for this build. Add EXPO_PUBLIC_REVENUECAT_IOS_API_KEY in EAS (production environment) and rebuild.",
    };
  }

  const trimmed = apiKey.trim();
  if (!trimmed || trimmed.startsWith("@")) {
    return {
      valid: false,
      reason:
        "RevenueCat API key was not resolved at build time. Set EXPO_PUBLIC_REVENUECAT_IOS_API_KEY in EAS and rebuild.",
    };
  }

  if (trimmed.startsWith("sk_")) {
    return {
      valid: false,
      reason:
        "Use RevenueCat's public iOS API key (appl_...) in the app, not the secret server key (sk_...).",
    };
  }

  if (trimmed.startsWith("test_") && !__DEV__) {
    return {
      valid: false,
      reason:
        "Test RevenueCat keys cannot be used in release builds. Add EXPO_PUBLIC_REVENUECAT_IOS_API_KEY in EAS and rebuild.",
    };
  }

  if (Platform.OS === "ios" && !trimmed.startsWith("appl_") && !(__DEV__ && trimmed.startsWith("test_"))) {
    return {
      valid: false,
      reason:
        "Invalid iOS RevenueCat key. Copy the public App Store key (starts with appl_) from RevenueCat → Project Settings → API keys.",
    };
  }

  if (
    Platform.OS === "android"
    && !trimmed.startsWith("goog_")
    && !(__DEV__ && trimmed.startsWith("test_"))
  ) {
    return {
      valid: false,
      reason:
        "Invalid Android RevenueCat key. Copy the public Play Store key (starts with goog_) from RevenueCat → Project Settings → API keys.",
    };
  }

  return { valid: true, reason: null };
}
