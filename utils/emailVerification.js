import { applyActionCode, sendEmailVerification } from "firebase/auth";
import {
  ANDROID_PACKAGE_NAME,
  EMAIL_VERIFY_CONTINUE_URL,
  EMAIL_VERIFY_LINK_DOMAIN,
  IOS_BUNDLE_ID,
  MIN_SEND_INTERVAL_MS,
  RATE_LIMIT_COOLDOWN_SECONDS,
} from "../constants/emailVerification";

const lastSendAtByUid = new Map();

export function needsEmailVerification(user) {
  return !!user && !user.isAnonymous && !!user.email && !user.emailVerified;
}

export function buildInAppEmailVerificationSettings() {
  return {
    url: EMAIL_VERIFY_CONTINUE_URL,
    handleCodeInApp: true,
    linkDomain: EMAIL_VERIFY_LINK_DOMAIN,
    iOS: { bundleId: IOS_BUNDLE_ID },
    android: {
      packageName: ANDROID_PACKAGE_NAME,
      installApp: true,
      minimumVersion: "1",
    },
  };
}

export function buildWebEmailVerificationSettings() {
  return {
    url: EMAIL_VERIFY_CONTINUE_URL,
    handleCodeInApp: false,
  };
}

const NO_FALLBACK_ERROR_CODES = new Set([
  "auth/too-many-requests",
  "auth/user-token-expired",
  "auth/user-not-found",
]);

const WEB_FALLBACK_ERROR_CODES = new Set([
  "auth/invalid-dynamic-link-domain",
  "auth/auth-domain-config-required",
  "auth/unauthorized-continue-uri",
  "auth/invalid-continue-uri",
  "auth/missing-continue-uri",
  "auth/internal-error",
]);

export function getVerificationErrorCode(error) {
  return error?.code || "";
}

export function isRateLimitedVerificationError(error) {
  return getVerificationErrorCode(error) === "auth/too-many-requests";
}

export function formatEmailVerificationError(error) {
  const code = getVerificationErrorCode(error);
  switch (code) {
    case "auth/unauthorized-continue-uri":
      return "The continue URL domain is not authorized. In Firebase Console go to Authentication → Settings → Authorized domains and add goalgrower-2a859.firebaseapp.com.";
    case "auth/invalid-continue-uri":
      return "Firebase rejected the verification continue URL. Check Authorized domains in the Firebase Console.";
    case "auth/missing-continue-uri":
      return "Firebase requires a continue URL for verification emails.";
    case "auth/invalid-dynamic-link-domain":
    case "auth/auth-domain-config-required":
      return "Firebase mobile email links are not configured yet. The app will use browser verification instead.";
    case "auth/too-many-requests":
      return `Firebase is temporarily blocking sends for this account. Wait about ${Math.ceil(RATE_LIMIT_COOLDOWN_SECONDS / 60)} minutes, then tap Resend. Also check spam — an earlier email may already be there.`;
    case "auth/user-token-expired":
      return "Your session expired. Sign out and sign in again, then resend the email.";
    default:
      return error?.message || "Could not send verification email. Check Firebase Console → Authentication → Sign-in method (Email/Password enabled) and try again.";
  }
}

export function maskEmail(email) {
  if (!email || !email.includes("@")) return email || "";
  const [local, domain] = email.split("@");
  if (local.length <= 2) {
    return `${local[0] || "*"}***@${domain}`;
  }
  return `${local.slice(0, 2)}***@${domain}`;
}

export function parseEmailActionCodeFromUrl(url) {
  if (!url || typeof url !== "string") return null;

  try {
    const parsed = new URL(url);
    const mode = parsed.searchParams.get("mode");
    const oobCode = parsed.searchParams.get("oobCode");
    if (mode === "verifyEmail" && oobCode) {
      return oobCode;
    }
  } catch {
    const modeMatch = url.match(/[?&]mode=verifyEmail/i);
    const codeMatch = url.match(/[?&]oobCode=([^&]+)/i);
    if (modeMatch && codeMatch?.[1]) {
      return decodeURIComponent(codeMatch[1]);
    }
  }

  return null;
}

function getRetryAfterSeconds(uid) {
  const lastSendAt = lastSendAtByUid.get(uid) || 0;
  const elapsed = Date.now() - lastSendAt;
  if (elapsed >= MIN_SEND_INTERVAL_MS) return 0;
  return Math.ceil((MIN_SEND_INTERVAL_MS - elapsed) / 1000);
}

function markSendAttempt(uid) {
  lastSendAtByUid.set(uid, Date.now());
}

export async function sendVerificationEmail(user, { force = false } = {}) {
  if (!user?.email || user.isAnonymous || user.emailVerified) {
    return { sent: false, reason: "not_needed" };
  }

  const retryAfterSeconds = getRetryAfterSeconds(user.uid);
  if (!force && retryAfterSeconds > 0) {
    return {
      sent: false,
      reason: "throttled",
      retryAfterSeconds,
    };
  }

  await user.reload();
  markSendAttempt(user.uid);

  // Browser-first: one API call, works in Expo Go, avoids Dynamic Links config issues.
  try {
    await sendEmailVerification(user, buildWebEmailVerificationSettings());
    return { sent: true, mode: "web" };
  } catch (webError) {
    const webCode = getVerificationErrorCode(webError);
    if (NO_FALLBACK_ERROR_CODES.has(webCode)) {
      throw webError;
    }

    if (!WEB_FALLBACK_ERROR_CODES.has(webCode)) {
      throw webError;
    }

    console.warn(
      "Web verification email failed, retrying in-app settings:",
      webCode || webError?.message || webError
    );

    try {
      await sendEmailVerification(user, buildInAppEmailVerificationSettings());
      return { sent: true, mode: "in_app", fallback: true };
    } catch (inAppError) {
      console.error(
        "In-app verification email also failed:",
        getVerificationErrorCode(inAppError) || inAppError?.message || inAppError
      );
      throw inAppError;
    }
  }
}

export async function refreshEmailVerificationStatus(user) {
  if (!user) return false;
  await user.reload();
  return Boolean(user.emailVerified);
}

export async function applyEmailVerificationCode(authInstance, oobCode) {
  if (!authInstance || !oobCode) return false;
  await applyActionCode(authInstance, oobCode);
  await authInstance.currentUser?.reload();
  return authInstance.currentUser?.emailVerified ?? false;
}
