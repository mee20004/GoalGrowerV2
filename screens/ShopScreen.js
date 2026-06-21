import React, { useCallback, useMemo, useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Image,
  useWindowDimensions,
} from "react-native";
import { useRoute } from "@react-navigation/native";
import Ionicons from "@expo/vector-icons/Ionicons";
import HapticPressable from "../components/HapticPressable";
import { HapticType } from "../utils/haptics";
import { PAYWALL_RESULT } from "react-native-purchases-ui";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Page from "../components/Page";
import theme, { useTheme } from "../theme";
import { cpShadow } from "../utils/shadows";
import { useSubscription } from "../components/SubscriptionProvider";
import { useShopInventory } from "../components/ShopInventoryProvider";
import CoinBadge from "../components/CoinBadge";
import CoinIcon from "../components/CoinIcon";
import ShopItemCard from "../components/ShopItemCard";
import {
  SHOP_CATEGORIES,
  DECOR_TYPES,
  getShopItemsByCategory,
} from "../constants/ShopCatalog";
import { SHOP_CATALOG_TABS, SHOP_TAB_ICONS } from "../constants/ShopTabIcons";
import { PRO_LIMITS, PRO_MONTHLY_COIN_GRANT } from "../constants/subscriptionLimits";
import { PRO_FACE, PRO_SHADOW } from "../constants/proTheme";
import ProBadge from "../components/ProBadge";
import { creditCoinPurchaseWithRetry } from "../utils/shopInventory";

const PRO_SHOP_FEATURES = [
  {
    key: "goals",
    icon: "flag",
    value: String(PRO_LIMITS.activeGoals),
    label: "Active goals",
  },
  {
    key: "pages",
    icon: "leaf",
    value: String(PRO_LIMITS.gardenPages),
    label: "Garden pages",
  },
  {
    key: "shared",
    icon: "people",
    value: `${PRO_LIMITS.sharedGardensCreated} · ${PRO_LIMITS.sharedGardensJoined}`,
    label: "Shared create · join",
  },
  {
    key: "coins",
    icon: "coin",
    value: String(PRO_MONTHLY_COIN_GRANT),
    label: "Coins / month",
  },
];
const COINS_BUTTON_HEIGHT = 58;
const SHOP_BUTTON_DEPTH = 6;
const SEGMENT_TRACK_PADDING = 6;
const SEGMENT_TAB_GAP = 8;

const DECOR_ITEM_TYPES = new Set([
  DECOR_TYPES.FARBG,
  DECOR_TYPES.WINDOW,
  DECOR_TYPES.WALL,
  DECOR_TYPES.SHELF,
]);

function ProFeatureTile({ icon, value, label, hint }) {
  return (
    <View style={styles.proFeatureTile}>
      <View style={styles.proFeatureTileTop}>
        {icon === "coin" ? (
          <CoinIcon size={14} />
        ) : (
          <Ionicons name={icon} size={14} color="#FDE68A" />
        )}
        <Text style={styles.proFeatureValue}>{value}</Text>
      </View>
      <Text style={styles.proFeatureLabel}>{label}</Text>
      {!!hint && <Text style={styles.proFeatureHint}>{hint}</Text>}
    </View>
  );
}

function ProBenefitsGrid() {
  return (
    <View style={styles.proFeatureGrid}>
      {PRO_SHOP_FEATURES.map((feature) => (
        <ProFeatureTile
          key={feature.key}
          icon={feature.icon}
          value={feature.value}
          label={feature.label}
          hint={feature.hint}
        />
      ))}
    </View>
  );
}


export default function ShopScreen() {
  const { theme } = useTheme();
  const route = useRoute();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const initialCategory = route.params?.category;
  const [activeTab, setActiveTab] = useState(() =>
    SHOP_CATALOG_TABS.some((tab) => tab.key === initialCategory)
      ? initialCategory
      : SHOP_CATEGORIES.PLANTS
  );

  useEffect(() => {
    const category = route.params?.category;
    if (category && SHOP_CATALOG_TABS.some((tab) => tab.key === category)) {
      setActiveTab(category);
    }
  }, [route.params?.category]);

  const {
    coinBalance,
    loading: inventoryLoading,
    purchaseLoadingId,
    isItemOwned,
    buyItem,
  } = useShopInventory();

  const {
    actionLoading: subscriptionLoading,
    isPro,
    openCoinPaywall,
    openDefaultPaywall,
    openCustomerCenter,
    isUISupported,
    unavailableReason,
  } = useSubscription();

  const cardWidth = (width - theme.pad * 2 - 14 * 2) / 3;
  const catalogItems = useMemo(() => getShopItemsByCategory(activeTab), [activeTab]);
  const tabCount = SHOP_CATALOG_TABS.length;
  const segmentContentWidth = width - theme.pad * 2;
  const segmentTabWidth =
    (segmentContentWidth
      - SEGMENT_TRACK_PADDING * 2
      - SEGMENT_TAB_GAP * (tabCount - 1))
    / tabCount;
  const segmentTabHeight = COINS_BUTTON_HEIGHT - SEGMENT_TRACK_PADDING * 2;
  const segmentIconSize = Math.min(segmentTabWidth - 8, segmentTabHeight - 8);

  const handleBuy = useCallback(
    async (item) => {
      if (isItemOwned(item)) return;

      if (coinBalance < item.price) {
        Alert.alert(
          "Not enough coins",
          `${item.name} costs ${item.price} coins. Complete goals to earn coins, or grab a coin pack.`,
          [
            { text: "Get Coins", onPress: handleGetCoins },
            { text: "OK", style: "cancel" },
          ]
        );
        return;
      }

      try {
        await buyItem(item.id);
        const isDecor = DECOR_ITEM_TYPES.has(item.type);
        Alert.alert(
          isDecor ? "Unlocked" : "Added to your garden",
          isDecor
            ? `${item.name} is ready in Customize.`
            : `${item.name} is ready for your next goal.`
        );
      } catch (error) {
        Alert.alert("Purchase failed", error?.message || "Could not complete purchase.");
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [buyItem, coinBalance, isItemOwned]
  );

  const handleGetCoins = useCallback(async () => {
    const result = await openCoinPaywall();
    if (result !== PAYWALL_RESULT.PURCHASED) return;

    try {
      const creditResult = await creditCoinPurchaseWithRetry();

      if (creditResult?.credited) {
        Alert.alert(
          "Coins added",
          `+${creditResult.amount.toLocaleString()} coins are in your balance.`
        );
        return;
      }

      if (creditResult?.reason === "already_credited") {
        Alert.alert("Coins added", "Your coin pack is already on your balance.");
        return;
      }

      Alert.alert(
        "Coins pending",
        "Purchase succeeded, but coin credit is still syncing. Reopen Shop or try Buy Coins again shortly."
      );
    } catch (error) {
      Alert.alert(
        "Coins pending",
        error?.message
          || "Purchase succeeded, but coin credit failed. Reopen Shop or try Buy Coins again shortly."
      );
      console.error("IAP coin credit failed:", error);
    }
  }, [openCoinPaywall]);

  const handleProBanner = useCallback(() => {
    if (isPro) {
      openCustomerCenter();
    } else {
      openDefaultPaywall();
    }
  }, [isPro, openCustomerCenter, openDefaultPaywall]);

  return (
    <Page>
      <View style={styles.container}>
        <View style={styles.headerWrapper}>
          <View style={styles.headerContent}>
            <View style={styles.headerRow}>
              <Text style={styles.headerTitle}>Shop</Text>
              <View style={styles.headerBalancePill}>
                <CoinBadge amount={coinBalance} size="md" />
              </View>
            </View>
          </View>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.content,
            { paddingBottom: 120 + insets.bottom },
          ]}
          showsVerticalScrollIndicator={false}
        >
      {/* Pro subscription card */}
      <Text style={styles.sectionTitle}>Subscription</Text>
      <View style={styles.proCardWrap}>
        <View
          pointerEvents="none"
          style={[styles.proCardShadow, { backgroundColor: PRO_SHADOW }]}
        />
        <HapticPressable
          haptic={HapticType.LIGHT}
          onPress={handleProBanner}
          disabled={subscriptionLoading}
          style={({ pressed }) => [
            styles.proCardFace,
            pressed && !subscriptionLoading && styles.shopButtonPressed,
            subscriptionLoading && styles.disabled,
          ]}
        >
          <View style={styles.proCardTitleRow}>
            <Text style={styles.proCardTitle}>
              {isPro ? "Thanks for going Pro!" : "Grow your goals with Pro!"}
            </Text>
            <ProBadge height={22} />
          </View>
          {isPro ? (
            <>
              <Text style={styles.proCardBodyText}>Your plan includes:</Text>
              <ProBenefitsGrid />
            </>
          ) : (
            <>
              <Text style={styles.proCardBodyText}>What you get with Pro:</Text>
              <ProBenefitsGrid />
            </>
          )}

          <View style={styles.proCardFooter}>
            {subscriptionLoading ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <>
                <View style={styles.proCardFooterLeft}>
                  <Ionicons name="sparkles" size={16} color="#FDE68A" />
                  <Text style={styles.proCardCtaText}>
                    {isPro ? "Manage subscription" : "See Pro plans"}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={22} color="#ffffff" />
              </>
            )}
          </View>
        </HapticPressable>
      </View>

      {/* Buy coins button */}
      <View style={styles.coinsButtonWrap}>
        <View pointerEvents="none" style={styles.coinsButtonShadow} />
        <HapticPressable
          haptic={HapticType.LIGHT}
          onPress={handleGetCoins}
          disabled={subscriptionLoading}
          style={({ pressed }) => [
            styles.coinsButtonFace,
            pressed && !subscriptionLoading && styles.shopButtonPressed,
            subscriptionLoading && styles.disabled,
          ]}
        >
          {subscriptionLoading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <View style={styles.coinsButtonLeft}>
                <CoinIcon size={28} />
                <Text style={styles.coinsButtonText}>Buy Coins</Text>
              </View>
              <Ionicons name="add-circle" size={22} color="#fff" />
            </>
          )}
        </HapticPressable>
      </View>

      {!isUISupported && unavailableReason ? (
        <View style={styles.noteCard}>
          <Text style={styles.noteText}>{unavailableReason}</Text>
        </View>
      ) : null}

      {/* Products */}
      <View style={styles.catalogSection}>
        <Text style={styles.sectionTitle}>Collection</Text>
        <View
          style={[
            styles.segmentTrack,
            { width: segmentContentWidth, height: COINS_BUTTON_HEIGHT },
            cpShadow({ color: "#cbd5e1", offset: { width: 0, height: 3 }, opacity: 0.5, radius: 6, elevation: 2 }),
          ]}
        >
          {SHOP_CATALOG_TABS.map((tab) => {
            const active = activeTab === tab.key;
            return (
              <HapticPressable
                key={tab.key}
                accessibilityLabel={tab.label}
                onPress={() => setActiveTab(tab.key)}
                style={[
                  styles.segmentChip,
                  {
                    width: segmentTabWidth,
                    height: segmentTabHeight,
                  },
                  !active && styles.segmentChipInactive,
                  active && [
                    styles.segmentChipActive,
                    { borderColor: theme.accent },
                  ],
                ]}
              >
                <Image
                  source={SHOP_TAB_ICONS[tab.key]}
                  style={{ width: segmentIconSize, height: segmentIconSize }}
                  resizeMode="contain"
                />
              </HapticPressable>
            );
          })}
        </View>
      </View>

      {inventoryLoading ? (
        <ActivityIndicator size="large" color={theme.accent} style={styles.loader} />
      ) : (
        <View style={styles.grid}>
          {catalogItems.map((item) => (
            <View key={item.id} style={{ width: cardWidth }}>
              <ShopItemCard
                item={item}
                owned={isItemOwned(item)}
                canAfford={coinBalance >= item.price}
                loading={purchaseLoadingId === item.id}
                accent={theme.accent}
                onPress={() => handleBuy(item)}
              />
            </View>
          ))}
        </View>
      )}
      </ScrollView>
      </View>
    </Page>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerWrapper: {
    backgroundColor: "rgba(255,255,255,0.96)",
    borderRadius: 24,
    borderWidth: 0,
    borderColor: "#d9e6f4",
    ...cpShadow({ color: "#000000", offset: { width: 0, height: 6 }, opacity: 0.16, radius: 0, elevation: 3 }),
    marginTop: 8,
    marginBottom: 12,
  },
  headerContent: {
    paddingVertical: 0,
    paddingHorizontal: 0,
    paddingLeft: 16,
    paddingRight: 12,
    alignItems: "stretch",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    minHeight: 44,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "900",
    color: theme.text,
    fontFamily: "CeraRoundProDEMO-Black",
  },
  headerBalancePill: {
    backgroundColor: "#fff",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingBottom: 120,
  },
  proCardWrap: {
    position: "relative",
    marginBottom: 22,
    paddingBottom: SHOP_BUTTON_DEPTH,
  },
  proCardShadow: {
    position: "absolute",
    top: SHOP_BUTTON_DEPTH,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 22,
  },
  proCardFace: {
    backgroundColor: PRO_FACE,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 0,
    gap: 8,
    overflow: "hidden",
  },
  shopButtonPressed: {
    transform: [{ translateY: SHOP_BUTTON_DEPTH }],
  },
  proCardTitleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  proCardTitle: {
    flex: 1,
    fontSize: 19,
    lineHeight: 23,
    color: "#ffffff",
    fontFamily: "CeraRoundProDEMO-Black",
  },
  proCardBodyText: {
    fontSize: 10,
    lineHeight: 13,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: "rgba(255,255,255,0.78)",
    fontFamily: "CeraRoundProDEMO-Black",
  },
  proFeatureGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  proFeatureTile: {
    flexGrow: 1,
    flexBasis: "47%",
    backgroundColor: "rgba(255, 255, 255, 0.25)",
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 7,
    borderWidth: 0,
    borderColor: "rgba(255,255,255,0.28)",
    gap: 1,
  },
  proFeatureTileTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  proFeatureValue: {
    fontSize: 17,
    lineHeight: 19,
    color: "#ffffff",
    fontFamily: "CeraRoundProDEMO-Black",
  },
  proFeatureLabel: {
    fontSize: 10,
    lineHeight: 12,
    color: "rgba(255,255,255,0.92)",
    fontFamily: "CeraRoundProDEMO-Black",
  },
  proFeatureHint: {
    fontSize: 10,
    lineHeight: 12,
    color: "rgba(255,255,255,0.72)",
    fontFamily: "CeraRoundProDEMO-Black",
  },
  proCardFooter: {
    marginTop: 4,
    marginHorizontal: -16,
    height: COINS_BUTTON_HEIGHT,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.28)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  proCardFooterLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  proCardCtaText: {
    fontSize: 17,
    color: "#ffffff",
    fontFamily: "CeraRoundProDEMO-Black",
  },
  coinsButtonWrap: {
    position: "relative",
    height: COINS_BUTTON_HEIGHT + SHOP_BUTTON_DEPTH,
    marginBottom: 28,
  },
  coinsButtonShadow: {
    position: "absolute",
    top: SHOP_BUTTON_DEPTH,
    left: 0,
    right: 0,
    height: COINS_BUTTON_HEIGHT,
    borderRadius: 18,
    backgroundColor: "#e0a92e",
  },
  coinsButtonFace: {
    height: COINS_BUTTON_HEIGHT,
    borderRadius: 18,
    paddingHorizontal: 18,
    backgroundColor: "#f5b942",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  disabled: {
    opacity: 0.7,
  },
  coinsButtonLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  coinsButtonText: {
    color: "#fff",
    fontSize: 17,
    fontFamily: "CeraRoundProDEMO-Black",
  },
  earnHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 22,
    paddingHorizontal: 4,
  },
  earnHintText: {
    fontSize: 12,
    color: "#94a3b8",
    fontFamily: "CeraRoundProDEMO-Black",
  },
  noteCard: {
    backgroundColor: "#fff7ed",
    borderRadius: 16,
    padding: 14,
    marginBottom: 18,
  },
  noteText: {
    color: "#9a3412",
    fontSize: 13,
    lineHeight: 18,
  },
  catalogSection: {
    marginBottom: 18,
    gap: 12,
  },
  sectionTitle: {
    fontSize: 20,
    fontFamily: "CeraRoundProDEMO-Black",
    color: "#0f172a",
    padding: 10,
  },
  segmentTrack: {
    flexDirection: "row",
    alignItems: "center",
    gap: SEGMENT_TAB_GAP,
    backgroundColor: "#ced4db",
    borderRadius: 18,
    padding: SEGMENT_TRACK_PADDING,
    alignSelf: "center",
  },
  segmentChip: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
  },
  segmentChipInactive: {
    backgroundColor: "#fff",
    borderWidth: 2,
    borderColor: "transparent",
  },
  segmentChipActive: {
    backgroundColor: "#fff",
    borderWidth: 4,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14,
  },
  loader: {
    marginTop: 40,
  },
});
