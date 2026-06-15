import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
  ImageBackground,
  useWindowDimensions,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { PAYWALL_RESULT } from "react-native-purchases-ui";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme, getDarkerAccentColor } from "../theme";
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
import { creditCoins } from "../utils/shopInventory";

function shadowStyle({
  color = "#000",
  offset = { width: 0, height: 2 },
  opacity = 0.2,
  radius = 4,
  elevation = 3,
} = {}) {
  return {
    shadowColor: color,
    shadowOffset: offset,
    shadowOpacity: opacity,
    shadowRadius: radius,
    elevation,
  };
}

const BANNER_IMAGE = require("../assets/FarBG/beach_b.png");

const DECOR_ITEM_TYPES = new Set([
  DECOR_TYPES.FARBG,
  DECOR_TYPES.WINDOW,
  DECOR_TYPES.WALL,
  DECOR_TYPES.SHELF,
]);

const CATALOG_TABS = [
  { key: SHOP_CATEGORIES.PLANTS, label: "Plants", icon: "leaf" },
  { key: SHOP_CATEGORIES.POTS, label: "Pots", icon: "color-palette" },
  { key: SHOP_CATEGORIES.BACKGROUNDS, label: "Backgrounds", icon: "image" },
  { key: SHOP_CATEGORIES.WINDOWS, label: "Windows", icon: "grid" },
  { key: SHOP_CATEGORIES.WALLS, label: "Walls", icon: "color-fill" },
  { key: SHOP_CATEGORIES.SHELVES, label: "Shelves", icon: "layers" },
];

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

  const cardWidth = (width - 48 - 14) / 2;
  const catalogItems = useMemo(() => getShopItemsByCategory(activeTab), [activeTab]);

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
    <View style={[styles.screen, { backgroundColor: theme.bg }]}>
      <View
        pointerEvents="box-none"
        style={[styles.stickyCoinWrap, { top: insets.top + 16 }]}
      >
        <View
          style={[
            styles.balancePill,
            shadowStyle({ color: "#cdcdcd", offset: { width: 0, height: 3 }, opacity: 1, radius: 0, elevation: 4 }),
          ]}
        >
          <CoinBadge amount={coinBalance} size="md" />
        </View>
      </View>

      <ScrollView
        style={styles.container}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 24, paddingBottom: 120 + insets.bottom },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Shop</Text>

      {/* Pro banner */}
      <Pressable onPress={handleProBanner} disabled={subscriptionLoading}>
        <ImageBackground
          source={BANNER_IMAGE}
          style={[styles.banner, shadowStyle({ color: "#94a3b8", offset: { width: 0, height: 6 }, opacity: 0.35, radius: 12, elevation: 4 })]}
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
                  ? "Manage your subscription anytime."
                  : "Premium plants, pots & perks to grow faster."}
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
      </Pressable>

      {/* Buy coins button */}
      <Pressable
        onPress={handleGetCoins}
        disabled={subscriptionLoading}
        style={({ pressed }) => [
          styles.coinsButton,
          shadowStyle({ color: "#e0a92e", offset: { width: 0, height: 5 }, opacity: 1, radius: 0, elevation: 3 }),
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
      </Pressable>

      {!isUISupported && unavailableReason ? (
        <View style={styles.noteCard}>
          <Text style={styles.noteText}>{unavailableReason}</Text>
        </View>
      ) : null}

      {/* Products */}
      <View style={styles.catalogSection}>
        <Text style={styles.sectionTitle}>Collection</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={[
            styles.segmentTrack,
            shadowStyle({ color: "#cbd5e1", offset: { width: 0, height: 3 }, opacity: 0.5, radius: 6, elevation: 2 }),
          ]}
        >
          {CATALOG_TABS.map((tab) => {
            const active = activeTab === tab.key;
            return (
              <Pressable
                key={tab.key}
                onPress={() => setActiveTab(tab.key)}
                style={[
                  styles.segmentChip,
                  !active && styles.segmentChipInactive,
                  active && [
                    styles.segmentChipActive,
                    { backgroundColor: theme.accent },
                    shadowStyle({ color: getDarkerAccentColor(theme.accent, 0.65), offset: { width: 0, height: 0 }, opacity: 0.45, radius: 0, elevation: 3 }),
                  ],
                ]}
              >
                <Ionicons
                  name={tab.icon}
                  size={16}
                  color={active ? "#fff" : theme.accent}
                />
                <Text style={[styles.segmentLabel, active && styles.segmentLabelActive]}>
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
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
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  stickyCoinWrap: {
    position: "absolute",
    right: 24,
    zIndex: 10,
  },
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 24,
    paddingBottom: 120,
  },
  title: {
    fontSize: 32,
    fontFamily: "CeraRoundProDEMO-Black",
    color: "#0f172a",
    marginBottom: 18,
    paddingRight: 120,
  },
  balancePill: {
    backgroundColor: "#fff",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  banner: {
    borderRadius: 24,
    overflow: "hidden",
    marginBottom: 14,
    minHeight: 168,
  },
  bannerImage: {
    borderRadius: 24,
    height: 300,
    width: 500,
    left: -40,
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
    shadowColor: "#cdcdcd",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 2,
  },
  bannerCtaText: {
    fontSize: 14,
    fontFamily: "CeraRoundProDEMO-Black",
  },
  coinsButton: {
    backgroundColor: "#f5b942",
    borderRadius: 18,
    height: 58,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
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
    gap: 8,
    backgroundColor: "#ced4db",
    borderRadius: 18,
    padding: 6,
    paddingRight: 10,
  },
  segmentChip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 44,
    borderRadius: 14,
    paddingHorizontal: 12,
  },
  segmentChipInactive: {
    backgroundColor: "#fff",
    borderWidth: 0,
    borderColor: "#dce3eb",
  },
  segmentChipActive: {
    borderWidth: 2,
    borderColor: "transparent",
  },
  segmentLabel: {
    fontSize: 13,
    fontFamily: "CeraRoundProDEMO-Black",
    color: "#334155",
  },
  segmentLabelActive: {
    color: "#fff",
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
