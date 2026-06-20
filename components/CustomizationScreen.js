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
  InteractionManager,
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
import CoinBadge from "./CoinBadge";
import { SHOP_CATEGORIES } from "../constants/ShopCatalog";
import { SHOP_TAB_ICONS } from "../constants/ShopTabIcons";
import { useNavigation } from "@react-navigation/native";

const SHOP_NAV_ICON = require("../assets/Icons/Taskbar/Shop.png");

const CUSTOMIZER_SECTIONS = [
  { key: "farbg", label: "Background", shopCategory: SHOP_CATEGORIES.BACKGROUNDS },
  { key: "window", label: "Window", shopCategory: SHOP_CATEGORIES.WINDOWS },
  { key: "wall", label: "Wall", shopCategory: SHOP_CATEGORIES.WALLS },
  { key: "shelf", label: "Shelf", shopCategory: SHOP_CATEGORIES.SHELVES },
];

const SECTION_SHOP_CATEGORY = Object.fromEntries(
  CUSTOMIZER_SECTIONS.map((section) => [section.key, section.shopCategory])
);

const FIXED_HOTSPOTS = [
  { key: "farbg", left: 0.18, top: 0.50, label: "Background" },
  { key: "window", left: 0.50, top: 0.56, label: "Window" },
  { key: "wall", left: 0.14, top: 0.30, label: "Wall" },
  { key: "shelf", left: 0.43, top: 0.35, label: "Shelf" },
];

const SHEET_HEIGHT = 196;
const SHEET_ANIM_MS = 260;
const SHEET_DISMISS_MS = 280;
const FILTER_ROW_HEIGHT = 44;
const SEGMENT_TRACK_PADDING = 4;
const SEGMENT_TAB_GAP = 4;
const FILTER_ICON_SIZE = 22;
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
  enforceOwnedSelection = true,
  canSave = true,
}) {
  const { theme } = useTheme();
  const accent = theme.accent;
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const {
    coinBalance,
    isFarBgOwned,
    isWindowFrameOwned,
    isWallBgOwned,
    isShelfColorOwned,
  } = useShopInventory();

  const showAllShopOptions = !enforceOwnedSelection;

  const farBgOptions = useMemo(
    () => FAR_BG_ASSETS.map((asset, index) => ({ asset, index })).filter(
      ({ index }) => showAllShopOptions || isFarBgOwned(index)
    ),
    [showAllShopOptions, isFarBgOwned]
  );
  const windowOptions = useMemo(
    () => FRAME_ASSETS.map((asset, index) => ({ asset, index })).filter(
      ({ index }) => showAllShopOptions || isWindowFrameOwned(index)
    ),
    [showAllShopOptions, isWindowFrameOwned]
  );
  const wallOptions = useMemo(
    () => WALLPAPER_ASSETS.map((asset, index) => ({ asset, index })).filter(
      ({ index }) => showAllShopOptions || isWallBgOwned(index)
    ),
    [showAllShopOptions, isWallBgOwned]
  );
  const shelfOptions = useMemo(
    () => SHELF_COLOR_SCHEMES.map((scheme, index) => ({ scheme, index })).filter(
      ({ index }) => showAllShopOptions || isShelfColorOwned(index)
    ),
    [showAllShopOptions, isShelfColorOwned]
  );

  const [farBg, setFarBg] = useState(customizations?.[selectedPageId]?.farBg || 0);
  const [windowFrame, setWindowFrame] = useState(customizations?.[selectedPageId]?.windowFrame || 0);
  const [wallBg, setWallBg] = useState(customizations?.[selectedPageId]?.wallBg || 0);
  const [shelfColor, setShelfColor] = useState(customizations?.[selectedPageId]?.shelfColor || 0);

  const activeSection = customizerType || "wall";
  const userEditedRef = useRef(false);
  const saveInFlightRef = useRef(false);
  const autoSaveBlockedRef = useRef(false);
  const isClosingRef = useRef(false);
  const sheetTranslate = useRef(new Animated.Value(SHEET_HEIGHT)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const applyCustomizationValues = useCallback((saved = {}) => {
    setFarBg(saved.farBg ?? 0);
    setWindowFrame(saved.windowFrame ?? 0);
    setWallBg(saved.wallBg ?? 0);
    setShelfColor(saved.shelfColor ?? 0);
  }, []);

  useEffect(() => {
    if (!visible) {
      userEditedRef.current = false;
      autoSaveBlockedRef.current = false;
      saveInFlightRef.current = false;
      return;
    }
    if (userEditedRef.current) return;
    applyCustomizationValues(customizations?.[selectedPageId] || {});
  }, [visible, selectedPageId, customizations, applyCustomizationValues]);

  const markUserEdited = useCallback(() => {
    autoSaveBlockedRef.current = false;
    userEditedRef.current = true;
  }, []);

  const setFarBgFromUser = useCallback((value) => {
    markUserEdited();
    setFarBg(value);
  }, [markUserEdited]);
  const setWindowFrameFromUser = useCallback((value) => {
    markUserEdited();
    setWindowFrame(value);
  }, [markUserEdited]);
  const setWallBgFromUser = useCallback((value) => {
    markUserEdited();
    setWallBg(value);
  }, [markUserEdited]);
  const setShelfColorFromUser = useCallback((value) => {
    markUserEdited();
    setShelfColor(value);
  }, [markUserEdited]);

  useEffect(() => {
    if (!visible || !canSave || !userEditedRef.current || saveInFlightRef.current || autoSaveBlockedRef.current) {
      return undefined;
    }

    const saved = customizations?.[selectedPageId] || {};
    const values = { farBg, windowFrame, wallBg, shelfColor };
    const hasChange =
      farBg !== (saved.farBg ?? 0) ||
      windowFrame !== (saved.windowFrame ?? 0) ||
      wallBg !== (saved.wallBg ?? 0) ||
      shelfColor !== (saved.shelfColor ?? 0);

    if (!hasChange) return undefined;

    const timer = setTimeout(async () => {
      if (saveInFlightRef.current || autoSaveBlockedRef.current) return;
      saveInFlightRef.current = true;
      try {
        await Promise.resolve(onSave(selectedPageId, values));
        userEditedRef.current = false;
        onCustomizationChange?.(values);
      } catch (error) {
        autoSaveBlockedRef.current = true;
        userEditedRef.current = false;
        applyCustomizationValues(customizations?.[selectedPageId] || {});
      } finally {
        saveInFlightRef.current = false;
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [
    farBg,
    windowFrame,
    wallBg,
    shelfColor,
    visible,
    canSave,
    selectedPageId,
    customizations,
    onSave,
    onCustomizationChange,
    applyCustomizationValues,
  ]);

  useEffect(() => {
    if (!visible) {
      sheetTranslate.setValue(SHEET_HEIGHT + insets.bottom);
      overlayOpacity.setValue(0);
      isClosingRef.current = false;
      return;
    }

    sheetTranslate.setValue(SHEET_HEIGHT + insets.bottom);
    overlayOpacity.setValue(0);
    Animated.parallel([
      Animated.timing(sheetTranslate, {
        toValue: 0,
        duration: SHEET_ANIM_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(overlayOpacity, {
        toValue: 1,
        duration: SHEET_ANIM_MS,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();
  }, [visible, sheetTranslate, overlayOpacity, insets.bottom]);

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

  const dismissSheet = useCallback(
    (onComplete) => {
      if (isClosingRef.current) return;
      isClosingRef.current = true;

      Animated.parallel([
        Animated.timing(sheetTranslate, {
          toValue: SHEET_HEIGHT + insets.bottom,
          duration: SHEET_DISMISS_MS,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(overlayOpacity, {
          toValue: 0,
          duration: SHEET_DISMISS_MS,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        isClosingRef.current = false;
        if (finished) onComplete?.();
      });
    },
    [sheetTranslate, overlayOpacity, insets.bottom]
  );

  const handleClose = useCallback(() => {
    dismissSheet(onClose);
  }, [dismissSheet, onClose]);

  const openShop = useCallback(() => {
    const category = SECTION_SHOP_CATEGORY[activeSection];
    dismissSheet(() => {
      onClose?.();
      InteractionManager.runAfterInteractions(() => {
        navigation.getParent()?.navigate("Shop", { category });
      });
    });
  }, [activeSection, dismissSheet, navigation, onClose]);

  const renderOptions = () => {
    switch (activeSection) {
      case "farbg":
        return (
          <FlatList
            data={farBgOptions}
            horizontal
            showsHorizontalScrollIndicator={false}
            extraData={farBg}
            keyExtractor={({ index }) => `farbg-${index}`}
            contentContainerStyle={styles.carouselContent}
            renderItem={({ item: { asset, index } }) => (
              <SwatchCard
                selected={farBg === index}
                accent={accent}
                onPress={() => setFarBgFromUser(index)}
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
            data={windowOptions}
            horizontal
            showsHorizontalScrollIndicator={false}
            extraData={windowFrame}
            keyExtractor={({ index }) => `window-${index}`}
            contentContainerStyle={styles.carouselContent}
            renderItem={({ item: { asset, index } }) => (
              <SwatchCard
                selected={windowFrame === index}
                accent={accent}
                onPress={() => setWindowFrameFromUser(index)}
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
            data={wallOptions}
            horizontal
            showsHorizontalScrollIndicator={false}
            extraData={wallBg}
            keyExtractor={({ index }) => `wall-${index}`}
            contentContainerStyle={styles.carouselContent}
            renderItem={({ item: { asset, index } }) => (
              <SwatchCard
                selected={wallBg === index}
                accent={accent}
                onPress={() => setWallBgFromUser(index)}
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
            data={shelfOptions}
            horizontal
            showsHorizontalScrollIndicator={false}
            extraData={shelfColor}
            keyExtractor={({ index }) => `shelf-${index}`}
            contentContainerStyle={styles.carouselContent}
            renderItem={({ item: { scheme, index } }) => (
              <SwatchCard selected={shelfColor === index} accent={accent} onPress={() => setShelfColorFromUser(index)}>
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
    <Modal visible={visible} animationType="none" transparent onRequestClose={handleClose}>
      <View style={styles.root} pointerEvents="box-none">
        <Animated.View style={[styles.dismissLayer, { opacity: overlayOpacity }]}>
          <HapticPressable
            style={StyleSheet.absoluteFillObject}
            onPress={handleClose}
            accessibilityLabel="Close customization"
          />
        </Animated.View>

        <Animated.View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { opacity: overlayOpacity }]}>
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
        </Animated.View>

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

          <View style={styles.filterRow}>
            <View style={styles.segmentTrack}>
              {CUSTOMIZER_SECTIONS.map((section) => {
                const active = activeSection === section.key;
                return (
                  <HapticPressable
                    key={section.key}
                    accessibilityLabel={section.label}
                    onPress={() => selectSection(section.key)}
                    style={[
                      styles.tabChip,
                      !active && styles.tabChipInactive,
                      active && [styles.tabChipActive, { borderColor: accent }],
                    ]}
                  >
                    <Image
                      source={SHOP_TAB_ICONS[section.shopCategory]}
                      style={{ width: FILTER_ICON_SIZE, height: FILTER_ICON_SIZE }}
                      resizeMode="contain"
                    />
                  </HapticPressable>
                );
              })}
            </View>

            <HapticPressable
              accessibilityLabel="Open shop"
              onPress={openShop}
              style={styles.shopButton}
            >
              <Image source={SHOP_NAV_ICON} style={styles.shopButtonIcon} resizeMode="contain" />
              <CoinBadge amount={coinBalance} size="sm" />
            </HapticPressable>
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
    backgroundColor: "rgba(0,0,0,0.16)",
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
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ced4db",
    borderRadius: 16,
    padding: SEGMENT_TRACK_PADDING,
    gap: SEGMENT_TAB_GAP,
    height: FILTER_ROW_HEIGHT,
  },
  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  tabChip: {
    flex: 1,
    height: FILTER_ROW_HEIGHT - SEGMENT_TRACK_PADDING * 2,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  tabChipInactive: {
    backgroundColor: "#fff",
    borderWidth: 2,
    borderColor: "transparent",
  },
  tabChipActive: {
    backgroundColor: "#fff",
    borderWidth: 2,
  },
  shopButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: FILTER_ROW_HEIGHT,
    paddingHorizontal: 10,
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    ...cpShadow({ color: "#cbd5e1", offset: { width: 0, height: 2 }, opacity: 0.45, radius: 4, elevation: 2 }),
  },
  shopButtonIcon: {
    width: 22,
    height: 22,
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
