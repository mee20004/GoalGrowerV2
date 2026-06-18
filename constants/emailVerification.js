export const IOS_BUNDLE_ID = "com.goalgrower.app";
export const ANDROID_PACKAGE_NAME = "com.goalgrower.app";

export const FIREBASE_AUTH_DOMAIN = "goalgrower-2a859.firebaseapp.com";

/** Continue URL after verification — must be on Auth → Authorized domains */
export const EMAIL_VERIFY_CONTINUE_URL = `https://${FIREBASE_AUTH_DOMAIN}`;

/** Hosting link domain for mobile app links (post–Dynamic Links migration) */
export const EMAIL_VERIFY_LINK_DOMAIN = FIREBASE_AUTH_DOMAIN;

export const EMAIL_VERIFY_SCHEME = "goalgrower";

export const RESEND_COOLDOWN_SECONDS = 60;

/** Client-side guard so dev remounts / double taps don't spam Firebase */
export const MIN_SEND_INTERVAL_MS = 60_000;

/** UI cooldown after Firebase auth/too-many-requests */
export const RATE_LIMIT_COOLDOWN_SECONDS = 15 * 60;
