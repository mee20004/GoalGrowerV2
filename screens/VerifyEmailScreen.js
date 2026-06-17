import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from "react-native";
import { signOut } from "firebase/auth";
import Ionicons from "@expo/vector-icons/Ionicons";
import HapticPressable from "../components/HapticPressable";
import { auth } from "../firebaseConfig";
import theme from "../theme";
import { RESEND_COOLDOWN_SECONDS, RATE_LIMIT_COOLDOWN_SECONDS } from "../constants/emailVerification";
import {
  maskEmail,
  sendVerificationEmail,
  formatEmailVerificationError,
  isRateLimitedVerificationError,
} from "../utils/emailVerification";
import { useEmailVerificationDeepLink } from "../hooks/useEmailVerificationDeepLink";

export default function VerifyEmailScreen({ onVerified }) {
  const user = auth.currentUser;
  const email = user?.email || "";
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [sendError, setSendError] = useState(null);
  const initialSendStartedRef = useRef(false);

  const applySendCooldown = useCallback((seconds) => {
    setCooldown(Math.max(0, seconds));
  }, []);

  const handleVerified = useCallback(async () => {
    await onVerified?.();
  }, [onVerified]);

  const {
    processing,
    lastError,
    checkVerificationManually,
  } = useEmailVerificationDeepLink({ onVerified: handleVerified });

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = setInterval(() => {
      setCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  useEffect(() => {
    if (!user?.uid || initialSendStartedRef.current) return undefined;
    initialSendStartedRef.current = true;

    let cancelled = false;
    (async () => {
      try {
        const result = await sendVerificationEmail(user);
        if (cancelled) return;

        if (result.sent) {
          setSendError(null);
          applySendCooldown(RESEND_COOLDOWN_SECONDS);
          return;
        }

        if (result.reason === "throttled" && result.retryAfterSeconds) {
          applySendCooldown(result.retryAfterSeconds);
        }
      } catch (error) {
        if (!cancelled) {
          setSendError(formatEmailVerificationError(error));
          if (isRateLimitedVerificationError(error)) {
            applySendCooldown(RATE_LIMIT_COOLDOWN_SECONDS);
          }
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [applySendCooldown, user]);

  const handleResend = useCallback(async () => {
    if (!user || cooldown > 0 || resending) return;
    setResending(true);
    setSendError(null);
    try {
      await sendVerificationEmail(user, { force: true });
      applySendCooldown(RESEND_COOLDOWN_SECONDS);
      Alert.alert("Email sent", "Check your inbox and spam folder for the verification link.");
    } catch (error) {
      console.error("Resend verification email failed", error);
      const message = formatEmailVerificationError(error);
      setSendError(message);
      if (isRateLimitedVerificationError(error)) {
        applySendCooldown(RATE_LIMIT_COOLDOWN_SECONDS);
      }
      Alert.alert("Could not send email", message);
    } finally {
      setResending(false);
    }
  }, [applySendCooldown, cooldown, resending, user]);

  const handleSignOut = useCallback(async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Sign out failed", error);
      Alert.alert("Error", "Could not sign out. Please try again.");
    }
  }, []);

  const busy = processing || resending;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 24}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.inner}>
          <View style={styles.iconWrap}>
            <Ionicons name="mail-outline" size={42} color={theme.accent} />
          </View>

          <Text style={styles.title}>Verify your email</Text>
          <Text style={styles.subtitle}>
            We sent a verification link to{" "}
            <Text style={styles.emailHighlight}>{maskEmail(email)}</Text>.
            Tap the link in your email to continue.
          </Text>

          <View style={styles.hintCard}>
            <Text style={styles.hintTitle}>Using the app on a device?</Text>
            <Text style={styles.hintBody}>
              The link should open Goal Grower automatically after you verify.
            </Text>
            <Text style={[styles.hintTitle, { marginTop: 10 }]}>Using Expo Go?</Text>
            <Text style={styles.hintBody}>
              Verify in your browser, return here, then tap I've verified.
            </Text>
          </View>

          {sendError ? (
            <Text style={styles.errorText}>{sendError}</Text>
          ) : null}

          {lastError ? (
            <Text style={styles.errorText}>{lastError}</Text>
          ) : null}

          <View style={[styles.actionButtonWrap, { marginTop: 22 }]}>
            <View pointerEvents="none" style={[styles.actionButtonShadow, styles.actionButtonShadowPrimary]} />
            <HapticPressable
              disabled={busy}
              onPress={checkVerificationManually}
              style={({ pressed }) => [
                styles.actionButtonFace,
                styles.actionButtonPrimary,
                pressed && !busy && styles.actionButtonPressed,
                busy && styles.actionButtonPrimaryDisabled,
              ]}
            >
              {processing ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.actionButtonTextPrimary}>I've verified</Text>
              )}
            </HapticPressable>
          </View>

          <View style={[styles.actionButtonWrap, { marginTop: 12 }]}>
            <View pointerEvents="none" style={[styles.actionButtonShadow, styles.actionButtonShadowSecondary]} />
            <HapticPressable
              disabled={busy || cooldown > 0}
              onPress={handleResend}
              style={({ pressed }) => [
                styles.actionButtonFace,
                styles.actionButtonSecondary,
                pressed && !busy && cooldown <= 0 && styles.actionButtonPressed,
              ]}
            >
              {resending ? (
                <ActivityIndicator color={theme.accent} />
              ) : (
                <Text style={styles.actionButtonTextSecondary}>
                  {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend email"}
                </Text>
              )}
            </HapticPressable>
          </View>

          <HapticPressable onPress={handleSignOut} style={styles.signOutBtn}>
            <Text style={styles.signOutText}>Sign out</Text>
          </HapticPressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.bg,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  inner: {
    width: "100%",
    maxWidth: 420,
    alignSelf: "center",
  },
  iconWrap: {
    alignSelf: "center",
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
    shadowColor: "#4c6782",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  title: {
    fontSize: 32,
    fontWeight: "900",
    color: "#2d2a26",
    textAlign: "center",
    lineHeight: 38,
    fontFamily: "CeraRoundProDEMO-Black",
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#4a4540",
    textAlign: "center",
    lineHeight: 24,
    fontFamily: "CeraRoundProDEMO-Black",
  },
  emailHighlight: {
    color: theme.accent,
    fontWeight: "900",
  },
  hintCard: {
    marginTop: 20,
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 14,
    shadowColor: "#4c6782",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  hintTitle: {
    fontSize: 12,
    fontWeight: "900",
    color: theme.text,
    fontFamily: "CeraRoundProDEMO-Black",
    marginBottom: 4,
  },
  hintBody: {
    fontSize: 12,
    fontWeight: "700",
    color: "#6b6560",
    lineHeight: 18,
    fontFamily: "CeraRoundProDEMO-Black",
  },
  errorText: {
    marginTop: 14,
    textAlign: "center",
    color: "#c63b3b",
    fontSize: 13,
    fontWeight: "800",
    fontFamily: "CeraRoundProDEMO-Black",
  },
  actionButtonWrap: {
    height: 56,
    position: "relative",
  },
  actionButtonShadow: {
    position: "absolute",
    top: 4,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 20,
  },
  actionButtonShadowPrimary: { backgroundColor: "#509a18" },
  actionButtonShadowSecondary: { backgroundColor: "#b6b6b6" },
  actionButtonFace: {
    height: 52,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  actionButtonPrimary: { backgroundColor: "#58cc02" },
  actionButtonSecondary: { backgroundColor: "#ffffff" },
  actionButtonPrimaryDisabled: { backgroundColor: "#97cd71" },
  actionButtonPressed: { transform: [{ translateY: 4 }] },
  actionButtonTextPrimary: {
    fontSize: 18,
    fontWeight: "800",
    color: "#fff",
    fontFamily: "CeraRoundProDEMO-Black",
  },
  actionButtonTextSecondary: {
    fontSize: 16,
    fontWeight: "800",
    color: theme.accent,
    fontFamily: "CeraRoundProDEMO-Black",
  },
  signOutBtn: {
    marginTop: 18,
    alignSelf: "center",
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  signOutText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#6b6560",
    fontFamily: "CeraRoundProDEMO-Black",
  },
});
