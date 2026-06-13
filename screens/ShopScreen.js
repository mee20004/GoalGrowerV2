import React, { useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useTheme } from "../theme";
import { useSubscription } from "../components/SubscriptionProvider";
import { PRO_ENTITLEMENT_DISPLAY_NAME } from "../constants/revenueCat";
import { cpShadow } from "../utils/shadows";

function ActionButton({ label, onPress, disabled, loading, accent, variant = "primary" }) {
  const shadowColor = variant === "secondary" ? "#cbd5e1" : accent;

  return (
    <View style={styles.actionButtonWrap}>
      <View pointerEvents="none" style={[styles.actionButtonShadow, { backgroundColor: shadowColor }]} />
      <Pressable
        onPress={onPress}
        disabled={disabled || loading}
        style={({ pressed }) => [
          styles.actionButtonFace,
          {
            backgroundColor: variant === "secondary" ? "#f8fafc" : accent,
            borderWidth: variant === "secondary" ? 2 : 0,
            borderColor: variant === "secondary" ? "#e2e8f0" : "transparent",
          },
          (pressed || loading) && styles.actionButtonPressed,
          (disabled || loading) && styles.actionButtonDisabled,
        ]}
      >
        {loading ? (
          <ActivityIndicator color={variant === "secondary" ? accent : "#fff"} />
        ) : (
          <Text
            style={[
              styles.actionButtonText,
              { color: variant === "secondary" ? accent : "#fff" },
            ]}
          >
            {label}
          </Text>
        )}
      </Pressable>
    </View>
  );
}

function PackageList({ title, packages, theme }) {
  if (!packages?.length) return null;

  return (
    <View style={styles.packagesSection}>
      <Text style={[styles.packagesTitle, { color: theme.text }]}>{title}</Text>
      {packages.map((pkg) => (
        <View key={pkg.identifier} style={[styles.packageRow, cpShadow]}>
          <View>
            <Text style={[styles.packageLabel, { color: theme.text }]}>
              {pkg.product.title || pkg.identifier}
            </Text>
            <Text style={[styles.packageMeta, { color: theme.muted2 }]}>
              {pkg.packageType}
            </Text>
          </View>
          <Text style={[styles.packagePrice, { color: theme.accent }]}>
            {pkg.product.priceString}
          </Text>
        </View>
      ))}
    </View>
  );
}

export default function ShopScreen() {
  const { theme } = useTheme();
  const {
    isPro,
    proEntitlement,
    actionLoading,
    loading,
    isUISupported,
    unavailableReason,
    defaultOffering,
    coinOffering,
    openDefaultPaywall,
    openCoinPaywall,
    openCustomerCenter,
    restorePurchases,
  } = useSubscription();

  const handleUpgrade = useCallback(() => {
    openDefaultPaywall();
  }, [openDefaultPaywall]);

  const handleCoins = useCallback(() => {
    openCoinPaywall();
  }, [openCoinPaywall]);

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.bg }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Text style={[styles.title, { color: theme.text }]}>Shop</Text>
      <Text style={[styles.subtitle, { color: theme.muted2 }]}>
        Unlock {PRO_ENTITLEMENT_DISPLAY_NAME} and support Goal Grower.
      </Text>

      <View style={[styles.statusCard, cpShadow]}>
        <View style={styles.statusHeader}>
          <Ionicons
            name={isPro ? "star" : "star-outline"}
            size={28}
            color={isPro ? theme.accent : theme.muted2}
          />
          <View style={styles.statusTextWrap}>
            <Text style={[styles.statusTitle, { color: theme.text }]}>
              {isPro ? "You're a Pro member" : "Free plan"}
            </Text>
            <Text style={[styles.statusBody, { color: theme.muted2 }]}>
              {isPro
                ? proEntitlement?.productIdentifier
                  ? `Active via ${proEntitlement.productIdentifier}`
                  : "All Pro features are unlocked."
                : "Upgrade for premium features and to support development."}
            </Text>
          </View>
        </View>
      </View>

      {!isUISupported && unavailableReason && (
        <View style={styles.noteCard}>
          <Text style={styles.noteText}>{unavailableReason}</Text>
        </View>
      )}

      {loading ? (
        <ActivityIndicator size="large" color={theme.accent} style={styles.loader} />
      ) : (
        <>
          <ActionButton
            label="View Pro Plans"
            onPress={handleUpgrade}
            loading={actionLoading}
            accent={theme.accent}
          />

          <ActionButton
            label="Get Coins"
            onPress={handleCoins}
            loading={actionLoading}
            accent={theme.accent}
            variant="secondary"
          />

          {isPro && (
            <ActionButton
              label="Manage Subscription"
              onPress={openCustomerCenter}
              loading={actionLoading}
              accent={theme.accent}
            />
          )}

          <ActionButton
            label="Restore Purchases"
            onPress={restorePurchases}
            loading={actionLoading}
            accent={theme.accent}
            variant="secondary"
          />

          <PackageList
            title="Pro plans"
            packages={defaultOffering?.availablePackages}
            theme={theme}
          />

          <PackageList
            title="Coins"
            packages={coinOffering?.availablePackages}
            theme={theme}
          />

          {(defaultOffering || coinOffering) && (
            <Text style={[styles.packagesFootnote, { color: theme.muted2 }]}>
              Tap a button above to open the matching RevenueCat paywall from your dashboard.
            </Text>
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 72,
    paddingBottom: 120,
  },
  title: {
    fontSize: 32,
    fontFamily: "CeraRoundProDEMO-Black",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    lineHeight: 22,
    marginBottom: 24,
    fontFamily: "CeraRoundProDEMO-Black",
  },
  statusCard: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 18,
    marginBottom: 20,
  },
  statusHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  statusTextWrap: {
    flex: 1,
  },
  statusTitle: {
    fontSize: 18,
    fontFamily: "CeraRoundProDEMO-Black",
    marginBottom: 4,
  },
  statusBody: {
    fontSize: 14,
    lineHeight: 20,
  },
  noteCard: {
    backgroundColor: "#fff7ed",
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
  },
  noteText: {
    color: "#9a3412",
    fontSize: 13,
    lineHeight: 18,
  },
  loader: {
    marginTop: 24,
  },
  actionButtonWrap: {
    position: "relative",
    marginBottom: 14,
  },
  actionButtonShadow: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 6,
    height: 52,
    borderRadius: 18,
  },
  actionButtonFace: {
    minHeight: 52,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  actionButtonPressed: {
    transform: [{ translateY: 2 }],
  },
  actionButtonDisabled: {
    opacity: 0.7,
  },
  actionButtonText: {
    fontSize: 16,
    fontFamily: "CeraRoundProDEMO-Black",
  },
  packagesSection: {
    marginTop: 12,
  },
  packagesTitle: {
    fontSize: 14,
    fontFamily: "CeraRoundProDEMO-Black",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 12,
  },
  packageRow: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  packageLabel: {
    fontSize: 16,
    fontFamily: "CeraRoundProDEMO-Black",
  },
  packageMeta: {
    fontSize: 12,
    marginTop: 4,
    textTransform: "capitalize",
  },
  packagePrice: {
    fontSize: 16,
    fontFamily: "CeraRoundProDEMO-Black",
  },
  packagesFootnote: {
    fontSize: 12,
    lineHeight: 18,
    marginTop: 8,
  },
});
