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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import HapticPressable from "../components/HapticPressable";
import { auth, db } from "../firebaseConfig";
import { doc, getDoc } from "firebase/firestore";
import { theme } from "../theme";
import { cardShadow } from "../utils/shadows";
import { RESEND_COOLDOWN_SECONDS, RATE_LIMIT_COOLDOWN_SECONDS } from "../constants/emailVerification";
import {
  maskEmail,
  sendVerificationEmail,
  formatEmailVerificationError,
  isRateLimitedVerificationError,
} from "../utils/emailVerification";
import { useEmailVerificationDeepLink } from "../hooks/useEmailVerificationDeepLink";

export default function VerifyEmailScreen({ onVerified, onStartOver, onBack }) {
  const user = auth.currentUser;
  const insets = useSafeAreaInsets();
  const authEmail = user?.email || "";
  const [displayEmail, setDisplayEmail] = useState(authEmail);
  const [hasPendingEmailChange, setHasPendingEmailChange] = useState(false);
  const [profileReady, setProfileReady] = useState(false);
  const [startingOver, setStartingOver] = useState(false);
  const [goingBack, setGoingBack] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [sendError, setSendError] = useState(null);
  const initialSendStartedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const currentUser = auth.currentUser;
      if (!currentUser?.uid) {
        setDisplayEmail("");
        setProfileReady(true);
        return;
      }

      try {
        const userSnap = await getDoc(doc(db, "users", currentUser.uid));
        const pendingEmail = userSnap.exists()
          ? userSnap.data()?.pendingEmailChange
          : null;
        if (!cancelled) {
          setHasPendingEmailChange(!!pendingEmail);
          setDisplayEmail(pendingEmail || currentUser.email || "");
        }
      } catch (error) {
        if (!cancelled) {
          setDisplayEmail(currentUser.email || "");
        }
      } finally {
        if (!cancelled) setProfileReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.email, user?.uid]);

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
    if (!user?.uid || !profileReady || initialSendStartedRef.current || hasPendingEmailChange) return undefined;
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
  }, [applySendCooldown, hasPendingEmailChange, profileReady, user]);

  const handleResend = useCallback(async () => {
    if (!user || cooldown > 0 || resending) return;
    if (hasPendingEmailChange) {
      Alert.alert(
        "Confirm your new email",
        `Open the link we sent to ${displayEmail} to confirm your address.`
      );
      return;
    }
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
  }, [applySendCooldown, cooldown, displayEmail, hasPendingEmailChange, resending, user]);

  const handleStartOver = useCallback(() => {
    Alert.alert(
      "Start over?",
      "This deletes your unverified account and onboarding progress on this device so you can sign up again with the correct email and username.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Start over",
          style: "destructive",
          onPress: async () => {
            if (startingOver) return;
            setStartingOver(true);
            try {
              await onStartOver?.();
            } catch (error) {
              console.error("Start over failed", error);
              Alert.alert("Error", "Could not start over. Please try again.");
            } finally {
              setStartingOver(false);
            }
          },
        },
      ]
    );
  }, [onStartOver, startingOver]);

  const handleBack = useCallback(async () => {
    if (!onBack || goingBack) return;
    setGoingBack(true);
    try {
      await onBack();
    } catch (error) {
      console.error("Back to account creation failed", error);
      Alert.alert("Error", "Could not go back. Please try again.");
    } finally {
      setGoingBack(false);
    }
  }, [goingBack, onBack]);

  const handleSignOut = useCallback(async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Sign out failed", error);
      Alert.alert("Error", "Could not sign out. Please try again.");
    }
  }, []);

  const busy = processing || resending || startingOver || goingBack;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 24}
    >
      {onBack ? (
        <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
          <HapticPressable
            disabled={busy}
            onPress={handleBack}
            style={styles.backButton}
            hitSlop={8}
          >
            {goingBack ? (
              <ActivityIndicator color={theme.accent} />
            ) : (
              <Ionicons name="chevron-back" size={26} color={theme.accent} />
            )}
          </HapticPressable>
        </View>
      ) : null}

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
            <Text style={styles.emailHighlight}>{maskEmail(displayEmail)}</Text>.
            Tap the link in your email to continue.
          </Text>

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
  topBar: {
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
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
    ...cardShadow,
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
  startOverBtn: {
    marginTop: 18,
    alignSelf: "center",
    paddingVertical: 8,
    paddingHorizontal: 12,
    minHeight: 32,
    justifyContent: "center",
  },
  startOverText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#c63b3b",
    fontFamily: "CeraRoundProDEMO-Black",
  },
  signOutBtn: {
    marginTop: 6,
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
