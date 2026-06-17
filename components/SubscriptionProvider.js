import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Alert } from "react-native";
import Purchases from "react-native-purchases";
import { PAYWALL_RESULT } from "react-native-purchases-ui";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../firebaseConfig";
import { PRO_ENTITLEMENT_DISPLAY_NAME, OFFERING_IDS } from "../constants/revenueCat";
import {
  configureRevenueCat,
  describePaywallResult,
  fetchCustomerInfo,
  fetchOfferings,
  getActiveProEntitlement,
  getRevenueCatUnavailableReason,
  hasProEntitlement,
  identifyRevenueCatUser,
  isRevenueCatSupported,
  isRevenueCatUISupported,
  logOutRevenueCatUser,
  presentCustomerCenter,
  presentPaywall,
  presentPaywallIfNeeded,
  resolveOffering,
  restorePurchases,
} from "../utils/revenueCat";
import { processMonthlyProCoinGrant } from "../utils/proCoinGrants";

const SubscriptionContext = createContext(null);

export function SubscriptionProvider({ children }) {
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [customerInfo, setCustomerInfo] = useState(null);
  const [offerings, setOfferings] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const syncedUidRef = useRef(undefined);

  const handleCustomerInfoUpdate = useCallback(async (info) => {
    setCustomerInfo(info);
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    try {
      await processMonthlyProCoinGrant(info);
    } catch (error) {
      console.error("Monthly Pro coin grant failed:", error);
    }
  }, []);

  const isSupported = isRevenueCatSupported();
  const isUISupported = isRevenueCatUISupported();
  const unavailableReason = getRevenueCatUnavailableReason();
  const isPro = hasProEntitlement(customerInfo);
  const proEntitlement = getActiveProEntitlement(customerInfo);
  const currentOffering = offerings?.current ?? null;
  const defaultOffering = resolveOffering(offerings, OFFERING_IDS.DEFAULT);
  const coinOffering = resolveOffering(offerings, OFFERING_IDS.COINS);

  const refreshCustomerInfo = useCallback(async () => {
    if (!isSupported) {
      setCustomerInfo(null);
      return null;
    }

    const info = await fetchCustomerInfo();
    setCustomerInfo(info);
    return info;
  }, [isSupported]);

  const refreshOfferings = useCallback(async () => {
    if (!isSupported) {
      setOfferings(null);
      return null;
    }

    const nextOfferings = await fetchOfferings();
    setOfferings(nextOfferings);
    return nextOfferings;
  }, [isSupported]);

  const syncRevenueCatIdentity = useCallback(async (firebaseUser) => {
    const uid = firebaseUser?.uid ?? null;

    if (uid) {
      return identifyRevenueCatUser(uid);
    }

    return logOutRevenueCatUser();
  }, []);

  useEffect(() => {
    let cancelled = false;
    let removeCustomerInfoListener = null;
    let unsubscribeAuth = null;

    const bootstrap = async () => {
      try {
        const configured = await configureRevenueCat();
        if (cancelled || !configured) return;

        removeCustomerInfoListener = Purchases.addCustomerInfoUpdateListener((info) => {
          handleCustomerInfoUpdate(info);
        });

        const initialUser = auth.currentUser;
        const initialUid = initialUser?.uid ?? null;
        syncedUidRef.current = initialUid;

        const info = await syncRevenueCatIdentity(initialUser);
        const nextOfferings = await fetchOfferings();

        if (!cancelled) {
          setCustomerInfo(info);
          setOfferings(nextOfferings);
          if (info) {
            await processMonthlyProCoinGrant(info);
          }
        }

        unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
          const uid = firebaseUser?.uid ?? null;
          if (uid === syncedUidRef.current) return;

          syncedUidRef.current = uid;

          try {
            const nextInfo = await syncRevenueCatIdentity(firebaseUser);
            if (!cancelled) {
              setCustomerInfo(nextInfo);
              if (nextInfo) {
                await processMonthlyProCoinGrant(nextInfo);
              }
            }
          } catch (error) {
            console.error("RevenueCat auth sync failed:", error);
          }
        });
      } catch (error) {
        console.error("RevenueCat bootstrap failed:", error);
      } finally {
        if (!cancelled) {
          setReady(true);
          setLoading(false);
        }
      }
    };

    bootstrap();

    return () => {
      cancelled = true;
      if (removeCustomerInfoListener) removeCustomerInfoListener();
      if (unsubscribeAuth) unsubscribeAuth();
    };
  }, [syncRevenueCatIdentity, handleCustomerInfoUpdate]);

  const showPaywallResultMessage = useCallback((result) => {
    const message = describePaywallResult(result);
    if (message) {
      Alert.alert(PRO_ENTITLEMENT_DISPLAY_NAME, message);
    }
  }, []);

  const openPaywall = useCallback(async (offeringId = OFFERING_IDS.DEFAULT) => {
    if (!ready || !isUISupported) {
      Alert.alert("Unavailable", unavailableReason || "Subscriptions are not available in this environment.");
      return PAYWALL_RESULT.ERROR;
    }

    setActionLoading(true);
    try {
      const result = await presentPaywall(offeringId);
      await refreshCustomerInfo();
      showPaywallResultMessage(result);
      return result;
    } finally {
      setActionLoading(false);
    }
  }, [ready, isUISupported, unavailableReason, refreshCustomerInfo, showPaywallResultMessage]);

  const openDefaultPaywall = useCallback(() => {
    return openPaywall(OFFERING_IDS.DEFAULT);
  }, [openPaywall]);

  const openCoinPaywall = useCallback(() => {
    return openPaywall(OFFERING_IDS.COINS);
  }, [openPaywall]);

  const openPaywallIfNeeded = useCallback(async (offeringId = OFFERING_IDS.DEFAULT) => {
    if (!ready || !isUISupported) {
      return PAYWALL_RESULT.NOT_PRESENTED;
    }

    setActionLoading(true);
    try {
      const result = await presentPaywallIfNeeded(offeringId);
      await refreshCustomerInfo();
      showPaywallResultMessage(result);
      return result;
    } finally {
      setActionLoading(false);
    }
  }, [ready, isUISupported, refreshCustomerInfo, showPaywallResultMessage]);

  const openCustomerCenter = useCallback(async () => {
    if (!ready || !isUISupported) {
      Alert.alert("Unavailable", unavailableReason || "Subscription management is not available in this environment.");
      return;
    }

    setActionLoading(true);
    try {
      await presentCustomerCenter();
      await refreshCustomerInfo();
    } finally {
      setActionLoading(false);
    }
  }, [ready, isUISupported, unavailableReason, refreshCustomerInfo]);

  const restore = useCallback(async () => {
    if (!ready || !isSupported) {
      Alert.alert("Unavailable", unavailableReason || "Restore purchases is not available in this environment.");
      return null;
    }

    setActionLoading(true);
    try {
      const info = await restorePurchases();
      setCustomerInfo(info);
      if (info) {
        await processMonthlyProCoinGrant(info);
      }

      if (hasProEntitlement(info)) {
        Alert.alert("Restored", `Your ${PRO_ENTITLEMENT_DISPLAY_NAME} access has been restored.`);
      } else {
        Alert.alert("No Purchases Found", "We could not find any previous purchases for this account.");
      }

      return info;
    } finally {
      setActionLoading(false);
    }
  }, [ready, isSupported, unavailableReason]);

  const value = useMemo(
    () => ({
      ready,
      loading,
      actionLoading,
      isSupported,
      isUISupported,
      unavailableReason,
      isPro,
      proEntitlement,
      customerInfo,
      offerings,
      currentOffering,
      defaultOffering,
      coinOffering,
      refreshCustomerInfo,
      refreshOfferings,
      openPaywall,
      openDefaultPaywall,
      openCoinPaywall,
      openPaywallIfNeeded,
      openCustomerCenter,
      restorePurchases: restore,
    }),
    [
      ready,
      loading,
      actionLoading,
      isSupported,
      isUISupported,
      unavailableReason,
      isPro,
      proEntitlement,
      customerInfo,
      offerings,
      currentOffering,
      defaultOffering,
      coinOffering,
      refreshCustomerInfo,
      refreshOfferings,
      openPaywall,
      openDefaultPaywall,
      openCoinPaywall,
      openPaywallIfNeeded,
      openCustomerCenter,
      restore,
    ]
  );

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription() {
  const context = useContext(SubscriptionContext);
  if (!context) {
    throw new Error("useSubscription must be used within SubscriptionProvider");
  }
  return context;
}
