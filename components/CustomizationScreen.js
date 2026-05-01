import React, { useState, useEffect, useRef } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Image, FlatList, Modal, ScrollView, useWindowDimensions } from "react-native";
import { theme } from "../theme";
import { SHELF_COLOR_SCHEMES } from "../constants/ShelfColors";
import { FAR_BG_ASSETS } from "../constants/FarBGAssets";
import { WALLPAPER_ASSETS } from "../constants/WallpaperAssets";
import { FRAME_ASSETS } from "../constants/FrameAssets";
import { Animated, Easing } from "react-native";

// Use asset arrays from constants files

export default function CustomizationScreen({
  visible,
  onClose,
  onSave,
  selectedPageId,
  customizations,
  customizerType,
  customizerTypeSetter, // <-- add this prop
  drawerTop = 0, // pass from parent for exact alignment
  drawerAbsoluteTop = 0, // new prop: absolute offset from top of screen
}) {

  // Local state for selections
  const [farBg, setFarBg] = useState(customizations?.[selectedPageId]?.farBg || 0);
  const [windowFrame, setWindowFrame] = useState(customizations?.[selectedPageId]?.windowFrame || 0);
  const [wallBg, setWallBg] = useState(customizations?.[selectedPageId]?.wallBg || 0);
  const [shelfColor, setShelfColor] = useState(customizations?.[selectedPageId]?.shelfColor || 0);

  // Reset local state when selectedPageId changes
  useEffect(() => {
    setFarBg(customizations?.[selectedPageId]?.farBg || 0);
    setWindowFrame(customizations?.[selectedPageId]?.windowFrame || 0);
    setWallBg(customizations?.[selectedPageId]?.wallBg || 0);
    setShelfColor(customizations?.[selectedPageId]?.shelfColor || 0);
  }, [selectedPageId, customizations]);

  // Auto-save only when modal is visible and selectedPageId is stable
  useEffect(() => {
    if (visible) {
      onSave(selectedPageId, { farBg, windowFrame, wallBg, shelfColor });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [farBg, windowFrame, wallBg, shelfColor]);

  // Drawer height (match garden drawer, e.g. 48% of screen height)
  // Match the actual drawer height from styles.drawer.height in GardenScreen.js
  const DRAWER_HEIGHT = 210;
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const snapSections = [
    {
      key: 'farbg',
      label: 'Far Background',
      render: () => (
        <FlatList
          data={FAR_BG_ASSETS}
          horizontal
          extraData={farBg}
          renderItem={({ item, index }) => (
            <TouchableOpacity onPress={() => setFarBg(index)}>
              <View
                style={[
                  styles.preview,
                  {
                    justifyContent: 'center',
                    alignItems: 'center',
                    overflow: 'hidden',
                    borderWidth: 3,
                    borderColor: farBg === index ? theme.primary : 'transparent',
                    padding: 0,
                  },
                ]}
              >
                <Image
                  source={item}
                  style={{
                    position: 'absolute',
                    top: '-5%',
                    left: '-5%',
                    width: '150%',
                    height: '150%',
                    resizeMode: 'cover',
                  }}
                />
              </View>
            </TouchableOpacity>
          )}
          keyExtractor={(_, i) => `farbg-${i}`}
          style={styles.row}
        />
      ),
    },
    {
      key: 'window',
      label: 'Window Frame',
      render: () => (
        <FlatList
          data={FRAME_ASSETS}
          horizontal
          extraData={windowFrame}
          renderItem={({ item, index }) => (
            <TouchableOpacity onPress={() => setWindowFrame(index)}>
              <View
                style={[
                  styles.preview,
                  {
                    justifyContent: 'center',
                    alignItems: 'center',
                    overflow: 'hidden',
                    borderWidth: 3,
                    borderColor: windowFrame === index ? theme.primary : 'transparent',
                    marginRight: 18,
                  },
                ]}
              >
                <Image source={item} style={{ width: '400%', height: '400%', resizeMode: 'contain', marginTop: -75 }} />
              </View>
            </TouchableOpacity>
          )}
          keyExtractor={(_, i) => `window-${i}`}
          style={styles.row}
        />
      ),
    },
    {
      key: 'wall',
      label: 'Wall',
      render: () => (
        <FlatList
          data={WALLPAPER_ASSETS}
          horizontal
          extraData={wallBg}
          renderItem={({ item, index }) => (
            <TouchableOpacity onPress={() => setWallBg(index)}>
              <Image
                source={item}
                style={[
                  styles.preview,
                  {
                    borderWidth: 3,
                    borderColor: wallBg === index ? theme.primary : 'transparent',
                  },
                ]}
              />
            </TouchableOpacity>
          )}
          keyExtractor={(_, i) => `wall-${i}`}
          style={styles.row}
        />
      ),
    },
    {
      key: 'shelf',
      label: 'Shelf Style',
      render: () => (
        <FlatList
          data={SHELF_COLOR_SCHEMES}
          horizontal
          extraData={shelfColor}
          renderItem={({ item, index }) => (
            <TouchableOpacity onPress={() => setShelfColor(index)}>
              <View
                style={[
                  styles.colorSwatch,
                  { backgroundColor: item.ledgeBg },
                  {
                    borderWidth: 3,
                    borderColor: shelfColor === index ? theme.primary : 'transparent',
                  },
                ]}
              />
            </TouchableOpacity>
          )}
          keyExtractor={(_, i) => `shelf-${i}`}
          style={styles.row}
        />
      ),
    },
  ];

  const scrollRef = useRef(null);

  // Scroll to the correct section when customizerType changes and modal is opened
  useEffect(() => {
    if (visible && customizerType && scrollRef.current) {
      const sectionIndex = snapSections.findIndex(s => s.key === customizerType);
      if (sectionIndex >= 0) {
        scrollRef.current.scrollToIndex({ index: sectionIndex, animated: true });
      }
    }
  }, [visible, customizerType]);

  // Animation for spinning circles
  const spinAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.timing(spinAnim, {
        toValue: 1,
        duration: 6000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();
  }, [spinAnim]);
  const spin = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <Modal visible={visible} animationType="none" transparent>
      <View style={styles.overlay} pointerEvents="box-none">
        {/* Circles overlay at screen level */}
        <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', zIndex: 30 }}>
          {/* Far BG circle */}
          <Animated.View style={{
            position: 'absolute',
            left: windowWidth * 0.18,
            top: windowHeight * 0.50,
            width: 48,
            height: 48,
            transform: [{ rotate: spin }],
            zIndex: 31,
          }}>
            <TouchableOpacity style={{ width: 48, height: 48, borderRadius: 24, borderWidth: 3, borderColor: '#ffffff', borderStyle: 'dashed', backgroundColor: 'rgba(255, 255, 255, 0)', justifyContent: 'center', alignItems: 'center' }} onPress={() => customizerType !== 'farbg' && customizerTypeSetter('farbg')} />
          </Animated.View>
          {/* Window Frame circle */}
          <Animated.View style={{
            position: 'absolute',
            left: windowWidth * 0.50,
            top: windowHeight * 0.56,
            width: 48,
            height: 48,
            transform: [{ rotate: spin }],
            zIndex: 31,
          }}>
            <TouchableOpacity style={{ width: 48, height: 48, borderRadius: 24, borderWidth: 3, borderColor: '#ffffff', borderStyle: 'dashed', backgroundColor: 'rgba(255, 255, 255, 0)', justifyContent: 'center', alignItems: 'center' }} onPress={() => customizerType !== 'window' && customizerTypeSetter('window')} />
          </Animated.View>
          {/* Wallpaper circle */}
          <Animated.View style={{
            position: 'absolute',
            left: windowWidth * 0.14,
            top: windowHeight * 0.30,
            width: 48,
            height: 48,
            transform: [{ rotate: spin }],
            zIndex: 31,
          }}>
            <TouchableOpacity style={{ width: 48, height: 48, borderRadius: 24, borderWidth: 3, borderColor: '#ffffff', borderStyle: 'dashed', backgroundColor: 'rgba(255, 255, 255, 0)', justifyContent: 'center', alignItems: 'center' }} onPress={() => customizerType !== 'wall' && customizerTypeSetter('wall')} />
          </Animated.View>
          {/* Shelf circle */}
          <Animated.View style={{
            position: 'absolute',
            left: windowWidth * 0.43,
            top: windowHeight * 0.35,
            width: 48,
            height: 48,
            transform: [{ rotate: spin }],
            zIndex: 31,
          }}>
            <TouchableOpacity style={{ width: 48, height: 48, borderRadius: 24, borderWidth: 3, borderColor: '#ffffff', borderStyle: 'dashed', backgroundColor: 'rgba(255, 255, 255, 0)', justifyContent: 'center', alignItems: 'center' }} onPress={() => customizerType !== 'shelf' && customizerTypeSetter('shelf')} />
          </Animated.View>
        </View>
        {/* Overlay for outside clicks */}
        <View
          style={StyleSheet.absoluteFill}
          pointerEvents="auto"
          onStartShouldSetResponder={() => true}
          onResponderRelease={onClose}
        />
        {/* Modal content, allow touches to pass through overlay but not close modal */}
        <View style={{ width: '100%' }} pointerEvents="box-none">
          <View
            style={[
              styles.container,
              {
                position: 'absolute',
                top: drawerAbsoluteTop + drawerTop - 58,
                left: 0,
                right: 0,
                height: DRAWER_HEIGHT,
                marginTop: undefined, // override StyleSheet
              },
            ]}
            pointerEvents="auto"
          >
            <FlatList
              ref={scrollRef}
              data={snapSections}
              keyExtractor={section => section.key}
              renderItem={({ item }) => (
                <View style={{ minHeight: DRAWER_HEIGHT, alignItems: 'flex-start', justifyContent: 'flex-start', flex: 1 }}>
                  {item.render()}
                </View>
              )}
              pagingEnabled
              snapToInterval={DRAWER_HEIGHT}
              decelerationRate="fast"
              showsVerticalScrollIndicator={false}
              getItemLayout={(_, index) => ({ length: DRAWER_HEIGHT, offset: DRAWER_HEIGHT * index, index })}
              style={{ flex: 1 }}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "transparent",
    justifyContent: "flex-start",
    alignItems: "center",
  },
  container: {
    width: "100%",
    backgroundColor: "#ffffff",
    padding: 20,
    // marginTop removed, now set by absolute top
    // height is set dynamically
  },
  title: {
    fontSize: 22,
    fontWeight: "bold",
    marginBottom: 10,
    textAlign: "center",
  },
  section: {
    fontSize: 16,
    fontWeight: "600",
    marginTop: 18,
    marginBottom: 6,
  },
  row: {
    marginBottom: 0,
  },
  preview: {
    width: 170,
    height: 140,
    marginRight: 18,
    borderRadius: 14,
    borderColor: "transparent",
    borderWidth: 3,
    marginTop: 10,
    overflow: 'hidden',
  },
  // removed selected style, now handled inline
  colorSwatch: {
    width: 120,
    height: 120,
    borderRadius: 16,
    marginRight: 18,
    borderColor: "transparent",
  },
  buttonRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 18,
  },
  cancelButton: {
    flex: 1,
    marginRight: 8,
    backgroundColor: theme.gray,
    borderRadius: 8,
    padding: 12,
    alignItems: "center",
  },
  saveButton: {
    flex: 1,
    marginLeft: 8,
    backgroundColor: theme.primary,
    borderRadius: 8,
    padding: 12,
    alignItems: "center",
  },
  cancelText: {
    color: theme.text,
    fontWeight: "bold",
  },
  saveText: {
    color: "#fff",
    fontWeight: "bold",
  },
});
