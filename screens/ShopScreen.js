import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Image,
  ImageBackground,
  useWindowDimensions,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import HapticPressable from "../components/HapticPressable";
import { LinearGradient } from "expo-linear-gradient";
import { PAYWALL_RESULT } from "react-native-purchases-ui";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Page from "../components/Page";
import theme, { useTheme } from "../theme";
import { cpShadow, hardDropShadowSm } from "../utils/shadows";
import { useSubscription } from "../components/SubscriptionProvider";
import { useShopInventory } from "../components/ShopInventoryProvider";
import CoinBadge from "../components/CoinBadge";
import CoinIcon from "../components/CoinIcon";
import ShopItemCard from "../components/ShopItemCard";
import {
  SHOP_CATEGORIES,
  DECOR_TYPES,
  IAP_COIN_GRANTS,
  getShopItemsByCategory,
} from "../constants/ShopCatalog";
import { SHOP_CATALOG_TABS, SHOP_TAB_ICONS } from "../constants/ShopTabIcons";
import { PRO_BENEFITS_SUMMARY } from "../constants/subscriptionLimits";
import { creditCoins } from "../utils/shopInventory";

const BANNER_IMAGE = require("../assets/FarBG/beach_b.png");
const COINS_BUTTON_HEIGHT = 58;
const SEGMENT_TRACK_PADDING = 6;
const SEGMENT_TAB_GAP = 8;

const DECOR_ITEM_TYPES = new Set([
  DECOR_TYPES.FARBG,
  DECOR_TYPES.WINDOW,
  DECOR_TYPES.WALL,
  DECOR_TYPES.SHELF,
]);


export default function ShopScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [activeTab, setActiveTab] = useState(SHOP_CATEGORIES.PLANTS);

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
    if (result === PAYWALL_RESULT.PURCHASED || result === PAYWALL_RESULT.RESTORED) {
      const grantAmount = IAP_COIN_GRANTS.coins || 500;
      try {
        await creditCoins(grantAmount, "iap_coins");
        Alert.alert("Coins added", `+${grantAmount.toLocaleString()} coins are in your balance.`);
      } catch (error) {
        Alert.alert("Coins pending", "Purchase succeeded, but coin credit failed. Try again shortly.");
        console.error("IAP coin credit failed:", error);
      }
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
      {/* Pro banner */}
      <View style={styles.bannerWrap}>
        <View pointerEvents="none" style={styles.bannerShadow} />
        <HapticPressable
          onPress={handleProBanner}
          disabled={subscriptionLoading}
          style={({ pressed }) => [
            styles.bannerFace,
            pressed && !subscriptionLoading && styles.bannerPressed,
          ]}
        >
          <ImageBackground
            source={BANNER_IMAGE}
            style={styles.banner}
            imageStyle={styles.bannerImage}
            resizeMode="cover"
          >
            <LinearGradient
              colors={["rgba(15, 23, 42, 0.4)", "rgba(15, 23, 42, 0.2)", "rgba(15, 23, 42, 0.05)"]}
              locations={[0, 0.55, 1]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={styles.bannerScrim}
            >
              <View style={styles.bannerTextWrap}>
                <View style={styles.bannerBadge}>
                  <Ionicons name="star" size={12} color={theme.accent} />
                  <Text style={[styles.bannerBadgeText, { color: theme.accent }]}>
                    {isPro ? "PRO MEMBER" : "GOAL GROWER PRO"}
                  </Text>
                </View>
                <Text style={styles.bannerTitle}>
                  {isPro ? "Thanks for going Pro!" : "Grow Your Garden"}
                </Text>
                <Text style={styles.bannerBody}>
                  {isPro
                    ? PRO_BENEFITS_SUMMARY
                    : `Upgrade to unlock more. Pro includes: ${PRO_BENEFITS_SUMMARY}`}
                </Text>
                <View style={styles.bannerCta}>
                  <Text style={[styles.bannerCtaText, { color: theme.accent }]}>
                    {isPro ? "Manage plan" : "See Pro plans"}
                  </Text>
                  <Ionicons name="arrow-forward" size={15} color={theme.accent} />
                </View>
              </View>
            </LinearGradient>
          </ImageBackground>
        </HapticPressable>
      </View>

      {/* Buy coins button */}
      <HapticPressable
        onPress={handleGetCoins}
        disabled={subscriptionLoading}
        style={({ pressed }) => [
          styles.coinsButton,
          cpShadow({ color: "#e0a92e", offset: { width: 0, height: 5 }, opacity: 1, radius: 0, elevation: 3 }),
          pressed && !subscriptionLoading && styles.coinsButtonPressed,
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
  bannerWrap: {
    position: "relative",
    marginBottom: 14,
    paddingBottom: 5,
  },
  bannerShadow: {
    position: "absolute",
    top: 5,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 24,
    backgroundColor: "rgb(180, 201, 218)",
  },
  bannerFace: {
    borderRadius: 24,
    overflow: "hidden",
  },
  bannerPressed: {
    transform: [{ translateY: 2 }],
  },
  banner: {
    borderRadius: 24,
    overflow: "hidden",
    minHeight: 168,
  },
  bannerImage: {
    top: 0,
    borderRadius: 24,
    height: 400,
    width: 550,
    left: -45,
  },
  bannerScrim: {
    flex: 1,
    minHeight: 168,
    justifyContent: "center",
    paddingVertical: 22,
    paddingLeft: 22,
    paddingRight: 28,
  },
  bannerTextWrap: {
    maxWidth: "72%",
    alignItems: "flex-start",
    justifyContent: "center",
  },
  bannerBadge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#fff",
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
    marginBottom: 10,
  },
  bannerBadgeText: {
    fontSize: 10,
    fontFamily: "CeraRoundProDEMO-Black",
    letterSpacing: 0.5,
  },
  bannerTitle: {
    fontSize: 24,
    lineHeight: 28,
    color: "#fff",
    fontFamily: "CeraRoundProDEMO-Black",
    marginBottom: 6,
    textAlign: "left",
  },
  bannerBody: {
    fontSize: 13,
    lineHeight: 19,
    color: "rgba(255,255,255,0.9)",
    marginBottom: 16,
    textAlign: "left",
  },
  bannerCta: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#fff",
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 9,
    ...hardDropShadowSm,
  },
  bannerCtaText: {
    fontSize: 14,
    fontFamily: "CeraRoundProDEMO-Black",
  },
  coinsButton: {
    backgroundColor: "#f5b942",
    borderRadius: 18,
    height: COINS_BUTTON_HEIGHT,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 28,
  },
  coinsButtonPressed: {
    transform: [{ translateY: 2 }],
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
