import React, { memo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Image,
} from "react-native";
import HapticPressable from "./HapticPressable";
import { HapticType } from "../utils/haptics";
import Ionicons from "@expo/vector-icons/Ionicons";
import TutorialPlantInPot from "./tutorial/TutorialPlantInPot";
import CoinIcon from "./CoinIcon";
import { getDecorPreview, getPlantPreview, DECOR_TYPES } from "../constants/ShopCatalog";
import { hardDropShadowSm } from "../utils/shadows";
import { getDarkerAccentColor } from "../theme";

function getDecorImageProps(type) {
  switch (type) {
    case DECOR_TYPES.FARBG:
      return { style: styles.farBgSquareImage, resizeMode: "cover" };
    case DECOR_TYPES.WALL:
      return { style: styles.wallSquareImage, resizeMode: "cover" };
    case DECOR_TYPES.WINDOW:
      return { style: styles.windowSquareImage, resizeMode: "contain" };
    default:
      return null;
  }
}

function ShopItemCard({ item, owned, canAfford, loading, accent, onPress }) {
  const isPlantPot = item.type === "plant" || item.type === "pot";
  const plantPreview =
    item.type === "plant" ? getPlantPreview(item.assetKey) : getPlantPreview("fern");
  const potPreview = item.type === "pot" ? item.assetKey : "default";
  const decorPreview = !isPlantPot ? getDecorPreview(item) : null;
  const decorImageProps = decorPreview?.kind === "image" ? getDecorImageProps(item.type) : null;
  const disabled = loading || owned || !canAfford;

  const buttonColor = owned ? "#9aa6b2" : canAfford ? accent : "#e2e8f0";
  const buttonTextColor = owned ? "#fff" : canAfford ? "#fff" : "#94a3b8";

  return (
    <View
      style={[
        styles.card,
        hardDropShadowSm,
      ]}
    >
      <View style={styles.previewWrap}>
        {isPlantPot ? (
          <TutorialPlantInPot
            plantSource={plantPreview}
            potKey={potPreview}
            size={item.type === "pot" ? 92 : 104}
          />
        ) : decorPreview ? (
          <View style={styles.decorSwatch}>
            {decorPreview.kind === "image" ? (
              <Image
                source={decorPreview.source}
                style={decorImageProps?.style}
                resizeMode={decorImageProps?.resizeMode}
              />
            ) : (
              <View style={[styles.swatchFill, { backgroundColor: decorPreview.color }]} />
            )}
          </View>
        ) : null}
        {item.tag ? (
          <View style={[styles.tag, { backgroundColor: getDarkerAccentColor(accent, 0.9) }]}>
            <Text style={styles.tagText}>{item.tag}</Text>
          </View>
        ) : null}
        {owned ? (
          <View style={styles.ownedCheck}>
            <Ionicons name="checkmark" size={13} color="#fff" />
          </View>
        ) : null}
      </View>

      <Text style={styles.name} numberOfLines={1}>
        {item.name}
      </Text>
      <Text style={styles.description} numberOfLines={2}>
        {item.description}
      </Text>

      <HapticPressable
        disabled={disabled}
        haptic={disabled ? false : HapticType.LIGHT}
        onPress={onPress}
        style={({ pressed }) => [
          styles.button,
          { backgroundColor: buttonColor },
          pressed && !disabled && styles.buttonPressed,
        ]}
      >
        {loading ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : owned ? (
          <Text style={[styles.buttonText, { color: buttonTextColor }]}>Owned</Text>
        ) : (
          <View style={styles.priceRow}>
            <CoinIcon size={25} />
            <Text style={[styles.buttonText, { color: buttonTextColor }]}>{item.price}</Text>
          </View>
        )}
      </HapticPressable>
    </View>
  );
}

export default memo(ShopItemCard);

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 12,
  },
  previewWrap: {
    alignItems: "center",
    justifyContent: "center",
    height: 110,
    marginBottom: 10,
    backgroundColor: "#f6f8fa",
    borderRadius: 16,
  },
  decorSwatch: {
    width: 76,
    height: 76,
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "#e5e7eb",
    backgroundColor: "#f8fafc",
    position: "relative",
  },
  farBgSquareImage: {
    width: 100,
    height: 100,
  },
  wallSquareImage: {
    position: "absolute",
    width: 150,
    height: 150,
    top: -1,
    left: -12,
  },
  windowSquareImage: {
    position: "absolute",
    width: 280,
    height: 280,
    top: -125,
    left: -105,
  },
  swatchFill: {
    flex: 1,
    width: "100%",
    height: "100%",
  },
  tag: {
    position: "absolute",
    top: 8,
    left: 8,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  tagText: {
    color: "#fff",
    fontSize: 9,
    fontFamily: "CeraRoundProDEMO-Black",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  ownedCheck: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#22c55e",
    alignItems: "center",
    justifyContent: "center",
  },
  name: {
    fontSize: 16,
    fontFamily: "CeraRoundProDEMO-Black",
    color: "#0f172a",
    marginBottom: 3,
  },
  description: {
    fontSize: 12,
    lineHeight: 16,
    color: "#94a3b8",
    height: 32,
    marginBottom: 10,
  },
  button: {
    height: 42,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  buttonText: {
    fontSize: 15,
    fontFamily: "CeraRoundProDEMO-Black",
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
});
