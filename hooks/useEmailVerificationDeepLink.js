import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import * as Linking from "expo-linking";
import { auth } from "../firebaseConfig";
import {
  applyEmailVerificationCode,
  parseEmailActionCodeFromUrl,
  refreshEmailVerificationStatus,
} from "../utils/emailVerification";
import { tryOnboardingRelogin } from "../utils/onboardingRelogin";

async function ensureSignedInForVerification() {
  if (auth.currentUser) {
    return auth.currentUser;
  }

  const relogin = await tryOnboardingRelogin();
  if (relogin.signedIn) {
    return auth.currentUser;
  }

  return null;
}

export function useEmailVerificationDeepLink({ onVerified }) {
  const [processing, setProcessing] = useState(false);
  const [lastError, setLastError] = useState(null);
  const [lastSuccess, setLastSuccess] = useState(false);
  const handledCodesRef = useRef(new Set());

  const finishIfVerified = useCallback(async () => {
    const user = await ensureSignedInForVerification();
    if (!user) return false;

    const verified = await refreshEmailVerificationStatus(user);
    if (verified) {
      setLastSuccess(true);
      setLastError(null);
      await onVerified?.();
      return true;
    }
    return false;
  }, [onVerified]);

  const handleUrl = useCallback(async (url) => {
    const oobCode = parseEmailActionCodeFromUrl(url);
    if (!oobCode || handledCodesRef.current.has(oobCode)) {
      return finishIfVerified();
    }

    handledCodesRef.current.add(oobCode);
    setProcessing(true);
    setLastError(null);

    try {
      await applyEmailVerificationCode(auth, oobCode);

      const user = await ensureSignedInForVerification();
      if (!user) {
        setLastError(
          "Your email was verified, but we could not restore your session. Try signing in with your email and password."
        );
        return false;
      }

      const verified = await refreshEmailVerificationStatus(user);
      if (verified) {
        setLastSuccess(true);
        await onVerified?.();
        return true;
      }

      setLastError("Could not verify this link. Try again or tap I've verified.");
      return false;
    } catch (error) {
      console.error("Email verification deep link failed", error);
      setLastError("That verification link is invalid or expired.");
      return false;
    } finally {
      setProcessing(false);
    }
  }, [finishIfVerified, onVerified]);

  useEffect(() => {
    let mounted = true;

    const bootstrap = async () => {
      const initialUrl = await Linking.getInitialURL();
      if (mounted && initialUrl) {
        await handleUrl(initialUrl);
      }
    };

    bootstrap();

    const subscription = Linking.addEventListener("url", ({ url }) => {
      handleUrl(url);
    });

    const appStateSub = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        finishIfVerified();
      }
    });

    return () => {
      mounted = false;
      subscription.remove();
      appStateSub.remove();
    };
  }, [finishIfVerified, handleUrl]);

  const checkVerificationManually = useCallback(async () => {
    setProcessing(true);
    setLastError(null);
    try {
      const verified = await finishIfVerified();
      if (!verified) {
        setLastError("Email not verified yet. Check your inbox and try again.");
      }
      return verified;
    } finally {
      setProcessing(false);
    }
  }, [finishIfVerified]);

  return {
    processing,
    lastError,
    lastSuccess,
    checkVerificationManually,
  };
}
