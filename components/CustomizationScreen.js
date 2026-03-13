import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Image, FlatList, Modal, ScrollView } from "react-native";
import { theme } from "../theme";
import { SHELF_COLOR_SCHEMES } from "../constants/ShelfColors";
import { FAR_BG_ASSETS } from "../constants/FarBGAssets";
import { WALLPAPER_ASSETS } from "../constants/WallpaperAssets";
import { FRAME_ASSETS } from "../constants/FrameAssets";

// Use asset arrays from constants files

export default function CustomizationScreen({
  visible,
  onClose,
  onSave,
  selectedPageId,
  customizations,
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

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={styles.container} onPress={e => e.stopPropagation()}>
          <Text style={styles.title}>Customize Page</Text>
          <ScrollView>
            <Text style={styles.section}>Far Background</Text>
            <FlatList
              data={FAR_BG_ASSETS}
              horizontal
              renderItem={({ item, index }) => (
                <TouchableOpacity onPress={() => setFarBg(index)}>
                  <Image source={item} style={[styles.preview, farBg === index && styles.selected]} />
                </TouchableOpacity>
              )}
              keyExtractor={(_, i) => `farbg-${i}`}
              style={styles.row}
            />
            <Text style={styles.section}>Window Frame</Text>
            <FlatList
              data={FRAME_ASSETS}
              horizontal
              renderItem={({ item, index }) => (
                <TouchableOpacity onPress={() => setWindowFrame(index)}>
                  <Image source={item} style={[styles.preview, windowFrame === index && styles.selected]} />
                </TouchableOpacity>
              )}
              keyExtractor={(_, i) => `window-${i}`}
              style={styles.row}
            />
            <Text style={styles.section}>Wall</Text>
            <FlatList
              data={WALLPAPER_ASSETS}
              horizontal
              renderItem={({ item, index }) => (
                <TouchableOpacity onPress={() => setWallBg(index)}>
                  <Image source={item} style={[styles.preview, wallBg === index && styles.selected]} />
                </TouchableOpacity>
              )}
              keyExtractor={(_, i) => `wall-${i}`}
              style={styles.row}
            />
            <Text style={styles.section}>Shelf Style</Text>
            <FlatList
              data={SHELF_COLOR_SCHEMES}
              horizontal
              renderItem={({ item, index }) => (
                <TouchableOpacity onPress={() => setShelfColor(index)}>
                  <View style={[styles.colorSwatch, { backgroundColor: item.ledgeBg }, shelfColor === index && styles.selected]} />
                  <Text style={{ fontSize: 10, color: '#333', marginTop: 4, textAlign: 'center' }}>{item.name}</Text>
                </TouchableOpacity>
              )}
              keyExtractor={(_, i) => `shelf-${i}`}
              style={styles.row}
            />
          </ScrollView>
          {/* No Save/Cancel buttons, auto-save on change. */}
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "transparent",
    justifyContent: "flex-end",
    alignItems: "center",
  },
  container: {
    width: "100%",
    backgroundColor: "#fff",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    padding: 20,
    maxHeight: "90%",
    marginBottom: 0,
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
    marginBottom: 8,
  },
  preview: {
    width: 64,
    height: 40,
    marginRight: 10,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "transparent",
  },
  selected: {
    borderColor: theme.primary,
    borderWidth: 2,
  },
  colorSwatch: {
    width: 40,
    height: 40,
    borderRadius: 8,
    marginRight: 10,
    borderWidth: 2,
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
