import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
  FlatList,
  Modal,
  useWindowDimensions,
  Animated,
  Easing,
} from "react-native";
import HapticPressable from "./HapticPressable";
import { useTheme, getDarkerAccentColor, getLighterAccentColor } from "../theme";
import { cpShadow } from "../utils/shadows";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SHELF_COLOR_SCHEMES } from "../constants/ShelfColors";
import { FAR_BG_ASSETS } from "../constants/FarBGAssets";
import { WALLPAPER_ASSETS } from "../constants/WallpaperAssets";
import { FRAME_ASSETS } from "../constants/FrameAssets";
import { useShopInventory } from "./ShopInventoryProvider";

function firstOwnedIndex(length, isOwned) {
  for (let index = 0; index < length; index += 1) {
    if (isOwned(index)) return index;
  }
  return 0;
}

const SECTIONS = [
  { key: "farbg", tabLabel: "Background" },
  { key: "window", tabLabel: "Window" },
  { key: "wall", tabLabel: "Wall" },
  { key: "shelf", tabLabel: "Shelf" },
];

const FIXED_HOTSPOTS = [
  { key: "farbg", left: 0.18, top: 0.50, label: "Background" },
  { key: "window", left: 0.50, top: 0.56, label: "Window" },
  { key: "wall", left: 0.14, top: 0.30, label: "Wall" },
  { key: "shelf", left: 0.43, top: 0.35, label: "Shelf" },
];

const SHEET_HEIGHT = 184;
const HOTSPOT_CONTAINER_WIDTH = 104;
const APP_FONT = "CeraRoundProDEMO-Black";

function SwatchCard({ selected, accent, onPress, children, imagePreview = false }) {
  const faceStyle = [
    styles.colorSwatch,
    imagePreview
      ? (selected ? { borderColor: accent } : styles.swatchCardFace)
      : (selected
        ? { borderColor: accent, backgroundColor: getLighterAccentColor(accent, 0.35) }
        : styles.swatchCardFace),
  ];

  return (
    <HapticPressable onPress={onPress} style={styles.swatchCardWrap}>
      <View
        pointerEvents="none"
        style={[
          styles.swatchCardShadow,
          { backgroundColor: selected ? getDarkerAccentColor(accent) : "#cdcdcd" },
        ]}
      />
      <View style={faceStyle}>
        {children}
      </View>
    </HapticPressable>
  );
}

function HotspotButton({ left, top, label, sectionKey, activeKey, accent, onPress, pulseAnim }) {
  const isActive = activeKey === sectionKey;
  const halfWidth = HOTSPOT_CONTAINER_WIDTH / 2;

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        left: left - halfWidth,
        top: top - 36,
        width: HOTSPOT_CONTAINER_WIDTH,
        alignItems: "center",
        zIndex: 35,
      }}
    >
      <Animated.View style={{ transform: [{ scale: isActive ? pulseAnim : 1 }] }}>
        <HapticPressable
          onPress={() => onPress(sectionKey)}
          style={[
            styles.hotspotRing,
            isActive ? { borderColor: accent, backgroundColor: "rgba(255,255,255,0.22)" } : styles.hotspotRingInactive,
          ]}
        >
          <View style={[styles.hotspotDot, isActive && { backgroundColor: accent }]} />
        </HapticPressable>
      </Animated.View>
      <View style={[styles.hotspotLabel, isActive && { backgroundColor: accent }]}>
        <Text style={styles.hotspotLabelText} numberOfLines={1}>
          {label}
        </Text>
      </View>
    </View>
  );
}

export default function CustomizationScreen({
  visible,
  onClose,
  onSave,
  onCustomizationChange,
  selectedPageId,
  customizations,
  customizerType,
  customizerTypeSetter,
}) {
  const { theme } = useTheme();
  const accent = theme.accent;
  const insets = useSafeAreaInsets();
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const {
    isFarBgOwned,
    isWindowFrameOwned,
    isWallBgOwned,
    isShelfColorOwned,
  } = useShopInventory();

  const ownedFarBgOptions = useMemo(
    () => FAR_BG_ASSETS.map((asset, index) => ({ asset, index })).filter(({ index }) => isFarBgOwned(index)),
    [isFarBgOwned]
  );
  const ownedWindowOptions = useMemo(
    () => FRAME_ASSETS.map((asset, index) => ({ asset, index })).filter(({ index }) => isWindowFrameOwned(index)),
    [isWindowFrameOwned]
  );
  const ownedWallOptions = useMemo(
    () => WALLPAPER_ASSETS.map((asset, index) => ({ asset, index })).filter(({ index }) => isWallBgOwned(index)),
    [isWallBgOwned]
  );
  const ownedShelfOptions = useMemo(
    () => SHELF_COLOR_SCHEMES.map((scheme, index) => ({ scheme, index })).filter(({ index }) => isShelfColorOwned(index)),
    [isShelfColorOwned]
  );

  const [farBg, setFarBg] = useState(customizations?.[selectedPageId]?.farBg || 0);
  const [windowFrame, setWindowFrame] = useState(customizations?.[selectedPageId]?.windowFrame || 0);
  const [wallBg, setWallBg] = useState(customizations?.[selectedPageId]?.wallBg || 0);
  const [shelfColor, setShelfColor] = useState(customizations?.[selectedPageId]?.shelfColor || 0);

  const activeSection = customizerType || "wall";
  const isInitialSaveSkipped = useRef(true);
  const sheetTranslate = useRef(new Animated.Value(32)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    setFarBg(customizations?.[selectedPageId]?.farBg || 0);
    setWindowFrame(customizations?.[selectedPageId]?.windowFrame || 0);
    setWallBg(customizations?.[selectedPageId]?.wallBg || 0);
    setShelfColor(customizations?.[selectedPageId]?.shelfColor || 0);
    isInitialSaveSkipped.current = true;
  }, [selectedPageId, customizations]);

  useEffect(() => {
    if (!isFarBgOwned(farBg)) {
      setFarBg(firstOwnedIndex(FAR_BG_ASSETS.length, isFarBgOwned));
    }
    if (!isWindowFrameOwned(windowFrame)) {
      setWindowFrame(firstOwnedIndex(FRAME_ASSETS.length, isWindowFrameOwned));
    }
    if (!isWallBgOwned(wallBg)) {
      setWallBg(firstOwnedIndex(WALLPAPER_ASSETS.length, isWallBgOwned));
    }
    if (!isShelfColorOwned(shelfColor)) {
      setShelfColor(firstOwnedIndex(SHELF_COLOR_SCHEMES.length, isShelfColorOwned));
    }
  }, [
    farBg,
    windowFrame,
    wallBg,
    shelfColor,
    isFarBgOwned,
    isWindowFrameOwned,
    isWallBgOwned,
    isShelfColorOwned,
  ]);

  useEffect(() => {
    if (!visible) return undefined;

    const saved = customizations?.[selectedPageId] || {};
    const values = { farBg, windowFrame, wallBg, shelfColor };
    const hasChange =
      farBg !== (saved.farBg ?? 0) ||
      windowFrame !== (saved.windowFrame ?? 0) ||
      wallBg !== (saved.wallBg ?? 0) ||
      shelfColor !== (saved.shelfColor ?? 0);

    if (isInitialSaveSkipped.current) {
      isInitialSaveSkipped.current = false;
      if (!hasChange) return undefined;
    }

    const timer = setTimeout(() => {
      onSave(selectedPageId, values);
      onCustomizationChange?.(values);
    }, 300);

    return () => clearTimeout(timer);
  }, [farBg, windowFrame, wallBg, shelfColor, visible, selectedPageId, customizations, onSave, onCustomizationChange]);

  useEffect(() => {
    if (!visible) return;
    sheetTranslate.setValue(32);
    Animated.timing(sheetTranslate, {
      toValue: 0,
      duration: 250,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [visible, sheetTranslate]);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.1, duration: 700, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulseAnim]);

  const selectSection = useCallback(
    (key) => {
      if (customizerTypeSetter && key !== customizerType) customizerTypeSetter(key);
    },
    [customizerTypeSetter, customizerType]
  );

  const renderOptions = () => {
    switch (activeSection) {
      case "farbg":
        return (
          <FlatList
            data={ownedFarBgOptions}
            horizontal
            showsHorizontalScrollIndicator={false}
            extraData={farBg}
            keyExtractor={({ index }) => `farbg-${index}`}
            contentContainerStyle={styles.carouselContent}
            renderItem={({ item: { asset, index } }) => (
              <SwatchCard
                selected={farBg === index}
                accent={accent}
                onPress={() => setFarBg(index)}
                imagePreview
              >
                <Image source={asset} style={styles.squarePreviewImage} resizeMode="cover" />
              </SwatchCard>
            )}
          />
        );
      case "window":
        return (
          <FlatList
            data={ownedWindowOptions}
            horizontal
            showsHorizontalScrollIndicator={false}
            extraData={windowFrame}
            keyExtractor={({ index }) => `window-${index}`}
            contentContainerStyle={styles.carouselContent}
            renderItem={({ item: { asset, index } }) => (
              <SwatchCard
                selected={windowFrame === index}
                accent={accent}
                onPress={() => setWindowFrame(index)}
                imagePreview
              >
                <Image source={asset} style={styles.windowSquareImage} resizeMode="contain" />
              </SwatchCard>
            )}
          />
        );
      case "wall":
        return (
          <FlatList
            data={ownedWallOptions}
            horizontal
            showsHorizontalScrollIndicator={false}
            extraData={wallBg}
            keyExtractor={({ index }) => `wall-${index}`}
            contentContainerStyle={styles.carouselContent}
            renderItem={({ item: { asset, index } }) => (
              <SwatchCard
                selected={wallBg === index}
                accent={accent}
                onPress={() => setWallBg(index)}
                imagePreview
              >
                <Image source={asset} style={styles.wallSquareImage} resizeMode="cover" />
              </SwatchCard>
            )}
          />
        );
      case "shelf":
        return (
          <FlatList
            data={ownedShelfOptions}
            horizontal
            showsHorizontalScrollIndicator={false}
            extraData={shelfColor}
            keyExtractor={({ index }) => `shelf-${index}`}
            contentContainerStyle={styles.carouselContent}
            renderItem={({ item: { scheme, index } }) => (
              <SwatchCard selected={shelfColor === index} accent={accent} onPress={() => setShelfColor(index)}>
                <View style={[styles.swatchFill, { backgroundColor: scheme.ledgeBg }]} />
              </SwatchCard>
            )}
          />
        );
      default:
        return null;
    }
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="none" transparent onRequestClose={onClose}>
      <View style={styles.root} pointerEvents="box-none">
        <HapticPressable style={styles.dismissLayer} onPress={onClose} accessibilityLabel="Close customization" />

        <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
          {FIXED_HOTSPOTS.map((spot) => (
            <HotspotButton
              key={spot.key}
              left={windowWidth * spot.left + 24}
              top={windowHeight * spot.top + 24}
              label={spot.label}
              sectionKey={spot.key}
              activeKey={activeSection}
              accent={accent}
              onPress={selectSection}
              pulseAnim={pulseAnim}
            />
          ))}
        </View>

        <Animated.View
          pointerEvents="auto"
          style={[
            styles.sheet,
            {
              bottom: 0,
              height: SHEET_HEIGHT + insets.bottom,
              paddingBottom: insets.bottom + 8,
              transform: [{ translateY: sheetTranslate }],
            },
          ]}
        >
          <View style={styles.sheetHandle} />

          <View style={styles.segmentTrack}>
            {SECTIONS.map((section) => {
              const active = activeSection === section.key;
              return (
                <HapticPressable
                  key={section.key}
                  onPress={() => selectSection(section.key)}
                  style={[
                    styles.tabChip,
                    active && [styles.tabChipActive, { backgroundColor: accent }],
                  ]}
                >
                  <Text style={[styles.tabChipText, active && styles.tabChipTextActive]}>{section.tabLabel}</Text>
                </HapticPressable>
              );
            })}
          </View>

          <View style={styles.optionsArea}>{renderOptions()}</View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  dismissLayer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "transparent",
  },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    backgroundColor: "#fafbfd",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: "#e8edf3",
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 0,
    zIndex: 40,
    ...cpShadow({ color: "#000", offset: { width: 0, height: -6 }, opacity: 0.14, radius: 12, elevation: 16 }),
  },
  sheetHandle: {
    alignSelf: "center",
    width: 42,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#d5dbe3",
    marginBottom: 12,
  },
  segmentTrack: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#eef2f6",
    borderRadius: 16,
    padding: 4,
    marginBottom: 12,
    gap: 4,
  },
  tabChip: {
    flex: 1,
    minHeight: 34,
    paddingHorizontal: 6,
    paddingVertical: 7,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  tabChipActive: {
    ...cpShadow({ color: "#000", offset: { width: 0, height: 2 }, opacity: 0.08, radius: 3, elevation: 2 }),
  },
  tabChipText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#6b7280",
    fontFamily: APP_FONT,
    letterSpacing: 0.1,
  },
  tabChipTextActive: {
    color: "#ffffff",
    fontFamily: APP_FONT,
  },
  optionsArea: {
    flex: 1,
    minHeight: 108,
    backgroundColor: "#ffffff",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#edf1f5",
    paddingVertical: 12,
    paddingLeft: 12,
  },
  carouselContent: {
    paddingRight: 12,
    alignItems: "center",
  },
  swatchCardWrap: {
    position: "relative",
    width: 80,
    height: 80,
    marginRight: 14,
  },
  swatchCardShadow: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 4,
    bottom: 0,
    borderRadius: 18,
  },
  swatchCardFace: {
    borderWidth: 2,
    borderColor: "#e5e7eb",
    backgroundColor: "#f8fafc",
  },
  colorSwatch: {
    width: 76,
    height: 76,
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: 3,
    borderColor: "transparent",
    position: "relative",
  },
  squarePreviewImage: {
    width: 100,
    height: 100,
  },
  // Tune wall thumbnail crop like windowSquareImage: width/height zoom, top/left shift.
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
  hotspotRing: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2.5,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
  hotspotRingInactive: {
    borderColor: "rgba(255,255,255,0.9)",
    backgroundColor: "rgba(0,0,0,0.12)",
  },
  hotspotDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "rgba(255,255,255,0.9)",
  },
  hotspotLabel: {
    marginTop: 4,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignSelf: "center",
    minWidth: 76,
    alignItems: "center",
  },
  hotspotLabelText: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "800",
    textAlign: "center",
    fontFamily: APP_FONT,
    letterSpacing: 0.1,
  },
});
