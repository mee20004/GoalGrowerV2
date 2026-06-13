/**
 * RevenueCat configuration for Goal Grower.
 *
 * Dashboard setup checklist:
 * 1. Create entitlement identifier below and attach all products to it.
 * 2. Create products in App Store Connect / Google Play with matching store IDs.
 * 3. Add products to RevenueCat and map them to packages:
 *    - Coins  -> $rc_lifetime (or custom lifetime package)
 *    - Yearly -> $rc_annual
 *    - Monthly -> $rc_monthly
 * 4. Create an Offering (e.g. "default") and mark it Current.
 * 5. Design a Paywall for that Offering in the RevenueCat dashboard.
 * 6. Configure Customer Center paths in the dashboard (Settings > Customer Center).
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
  LIFETIME: "$rc_lifetime",
  ANNUAL: "$rc_annual",
  MONTHLY: "$rc_monthly",
};

export const PRO_ENTITLEMENT_DISPLAY_NAME = "Goal Grower - Habit Tracker Pro";

/** RevenueCat offering identifiers — must match dashboard Offering IDs exactly. */
export const OFFERING_IDS = {
  DEFAULT: "default",
  COINS: "CoinOfferings",
};

/** Public test API key — replace with platform-specific production keys before release. */
export const REVENUECAT_API_KEY = "test_QqxGrZYjqcGGCrEshrRxtVyGpcY";
