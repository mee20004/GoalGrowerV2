// components/Page.js
import React from "react";
import { View, ScrollView, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { theme } from "../theme";

export default function Page({
  children,
  padded = true,
  scroll = false,
  footer = null,
  footerHeight = 0, // <-- new: reserve space so content can scroll above footer
  contentContainerStyle,
  scrollProps,
}) {
  const padX = padded ? theme.pad : 0;

  return (
    <LinearGradient
      colors={theme.bgGradient || [theme.bg, theme.bg]}
      start={{ x: 0.5, y: 1 }}
      end={{ x: 0.5, y: 0 }}
      style={styles.safe}
    >
      <SafeAreaView style={styles.safeInner} edges={["top", "left", "right"]}>
        <View style={[styles.root, { paddingHorizontal: padX }]}> 
          <View style={{ height: theme.topGap }} />

          {scroll ? (
            <>
              <ScrollView
                style={styles.scroll}
                contentContainerStyle={[
                  styles.scrollContent,
                  { paddingBottom: Math.max(12, footerHeight) },
                  contentContainerStyle,
                ]}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                {...(scrollProps || {})}
              >
                {children}
              </ScrollView>

              {footer ? <View style={styles.footerWrap}>{footer}</View> : null}
            </>
          ) : (
            <>
              <View style={styles.content}>{children}</View>
              {footer ? <View style={styles.footerWrap}>{footer}</View> : null}
            </>
          )}
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  safeInner: { flex: 1, backgroundColor: 'transparent' },
  root: { flex: 1 },

  // Android scroll reliability:
  scroll: { flex: 1, minHeight: 0 },
  scrollContent: { flexGrow: 1 },

  content: { flex: 1, minHeight: 0 },

  footerWrap: { marginTop: 12 },
});