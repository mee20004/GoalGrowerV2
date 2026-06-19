import React, { memo, useMemo, useState } from "react";
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
import { getDecorPreview, getPlantPreview } from "../constants/ShopCatalog";
import {
  getShopDecorPreviewLayout,
  resolveDecorPreviewLayout,
  SHOP_PREVIEW_FRAME_HEIGHT,
} from "../constants/ShopDecorPreviewLayout";
import { hardDropShadowSm, cpShadow } from "../utils/shadows";
import { getDarkerAccentColor } from "../theme";

function DecorShopPreview({ preview, layout }) {
  const [stageSize, setStageSize] = useState(null);

  const resolved = useMemo(
    () => resolveDecorPreviewLayout(layout, stageSize),
    [layout, stageSize]
  );

  return (
    <View
      style={styles.decorPreviewStage}
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        setStageSize((prev) =>
          prev?.width === width && prev?.height === height ? prev : { width, height }
        );
      }}
    >
      {resolved && preview.kind === "image" ? (
        <Image
          source={preview.source}
          style={{
            position: "absolute",
            width: resolved.width,
            height: resolved.height,
            left: resolved.left,
            top: resolved.top,
          }}
          resizeMode={resolved.resizeMode}
        />
      ) : null}
      {resolved && preview.kind === "shelf" ? (
        <View
          style={{
            position: "absolute",
            width: resolved.width,
            height: resolved.height,
            left: resolved.left,
            top: resolved.top,
            backgroundColor: preview.color,
          }}
        />
      ) : null}
    </View>
  );
}

function ShopItemCard({ item, owned, canAfford, loading, accent, onPress }) {
  const isPlantPot = item.type === "plant" || item.type === "pot";
  const plantPreview =
    item.type === "plant" ? getPlantPreview(item.assetKey) : getPlantPreview("fern");
  const potPreview = item.type === "pot" ? item.assetKey : "default";
  const decorPreview = !isPlantPot ? getDecorPreview(item) : null;
  const decorPreviewLayout = !isPlantPot ? getShopDecorPreviewLayout(item) : null;
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
      <View style={[styles.previewWrap, !isPlantPot && styles.previewWrapDecor]}>
        {isPlantPot ? (
          <TutorialPlantInPot
            plantSource={plantPreview}
            potKey={potPreview}
            size={item.type === "pot" ? 72 : 80}
          />
        ) : decorPreview ? (
          <DecorShopPreview preview={decorPreview} layout={decorPreviewLayout} />
        ) : null}
        {item.tag ? (
          <View style={[styles.tag, { backgroundColor: getDarkerAccentColor(accent, 0.9) }]}>
            <Text style={styles.tagText}>{item.tag}</Text>
          </View>
        ) : null}
        {owned ? (
          <View style={[styles.ownedCheck, { backgroundColor: accent }]}>
            <Ionicons name="checkmark" size={11} color="#fff" />
          </View>
        ) : null}
      </View>

      <Text style={styles.name} numberOfLines={1}>
        {item.name}
      </Text>

      <HapticPressable
        disabled={disabled}
        haptic={disabled ? false : HapticType.LIGHT}
        onPress={onPress}
        style={({ pressed }) => [
          styles.button,
          { backgroundColor: buttonColor },
          canAfford && !owned && {
            ...cpShadow({
              color: getDarkerAccentColor(accent),
              offset: { width: 0, height: 4 },
              opacity: 1,
              radius: 0,
              elevation: 2,
            }),
          },
          pressed && !disabled && styles.buttonPressed,
        ]}
      >
        {loading ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : owned ? (
          <Text style={[styles.buttonText, { color: buttonTextColor }]}>Owned</Text>
        ) : (
          <View style={styles.priceRow}>
            <CoinIcon size={20} />
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
    borderRadius: 16,
    padding: 8,
  },
  previewWrap: {
    alignItems: "center",
    justifyContent: "center",
    height: SHOP_PREVIEW_FRAME_HEIGHT,
    marginBottom: 6,
    backgroundColor: "#f6f8fa",
    borderRadius: 12,
  },
  previewWrapDecor: {
    overflow: "hidden",
    padding: 0,
  },
  decorPreviewStage: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
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
    top: 6,
    right: 6,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  name: {
    fontSize: 12,
    fontFamily: "CeraRoundProDEMO-Black",
    color: "#0f172a",
    marginBottom: 6,
    textAlign: "center",
  },
  button: {
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonPressed: {
    transform: [{ translateY: 2 }],
  },
  buttonText: {
    fontSize: 12,
    fontFamily: "CeraRoundProDEMO-Black",
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
});
