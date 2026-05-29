import React, { useMemo, useState } from "react";
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { theme } from "../../theme";
import { computeTutorialCardLayout } from "../../tutorial/cardLayout";
import { isValidRect } from "../../tutorial/layout";

function CardArrow({ placement }) {
  if (!placement) return null;

  const base = [styles.arrow, styles.arrowBase];
  if (placement === "top") return <View style={[...base, styles.arrowTop]} />;
  if (placement === "bottom") return <View style={[...base, styles.arrowBottom]} />;
  if (placement === "left") return <View style={[...base, styles.arrowLeft]} />;
  return <View style={[...base, styles.arrowRight]} />;
}

export default function TutorialCard({
  title,
  description,
  imageSource = null,
  primaryLabel = "Next",
  showPrimary = true,
  onSkip,
  onPrimary,
  targetRect = null,
  centered = false,
}) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [measuredSize, setMeasuredSize] = useState(null);

  const layout = useMemo(() => {
    if (!measuredSize) return null;
    return computeTutorialCardLayout({
      screenWidth,
      screenHeight,
      cardWidth: measuredSize.width,
      cardHeight: measuredSize.height,
      targetRect: isValidRect(targetRect) ? targetRect : null,
      centered,
      safeInsets: insets,
    });
  }, [centered, insets, measuredSize, screenHeight, screenWidth, targetRect]);

  const isPositioned = Boolean(layout);

  return (
    <>
      <View
        pointerEvents="none"
        style={styles.measureWrap}
        onLayout={(event) => {
          const { width, height } = event.nativeEvent.layout;
          if (width > 0 && height > 0) {
            setMeasuredSize({ width, height });
          }
        }}
      >
        <CardBody
          title={title}
          description={description}
          imageSource={imageSource}
          primaryLabel={primaryLabel}
          showPrimary={showPrimary}
          onSkip={onSkip}
          onPrimary={onPrimary}
        />
      </View>

      {isPositioned ? (
        <View
          pointerEvents="box-none"
          style={[
            styles.positionedWrap,
            {
              left: layout.left,
              top: layout.top,
              width: layout.width,
            },
          ]}
        >
          <CardArrow placement={layout.arrow} />
          <CardBody
            title={title}
            description={description}
            imageSource={imageSource}
            primaryLabel={primaryLabel}
            showPrimary={showPrimary}
            onSkip={onSkip}
            onPrimary={onPrimary}
          />
        </View>
      ) : null}
    </>
  );
}

function CardBody({
  title,
  description,
  imageSource,
  primaryLabel,
  showPrimary,
  onSkip,
  onPrimary,
}) {
  return (
    <View style={styles.card}>
      {imageSource ? (
        <Image source={imageSource} style={styles.image} resizeMode="contain" />
      ) : null}
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
      <View style={styles.actions}>
        <Pressable
          style={styles.secondaryBtn}
          onPress={onSkip}
          accessibilityRole="button"
          accessibilityLabel="Skip tutorial"
        >
          <Text style={styles.secondaryText}>Skip</Text>
        </Pressable>
        {showPrimary ? (
          <Pressable
            style={styles.primaryBtn}
            onPress={onPrimary}
            accessibilityRole="button"
            accessibilityLabel={primaryLabel}
          >
            <Text style={styles.primaryText}>{primaryLabel}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  measureWrap: {
    position: "absolute",
    left: -9999,
    top: 0,
    opacity: 0,
    maxWidth: 360,
    width: "88%",
  },
  positionedWrap: {
    position: "absolute",
  },
  card: {
    backgroundColor: theme.surface,
    borderRadius: theme.radius,
    padding: 20,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
    borderWidth: 1,
    borderColor: theme.outline,
  },
  image: {
    width: "100%",
    height: 120,
    marginBottom: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: "900",
    color: theme.text,
    marginBottom: 8,
  },
  description: {
    fontSize: 15,
    color: theme.muted2,
    lineHeight: 21,
    marginBottom: 16,
  },
  actions: {
    flexDirection: "row",
    gap: 10,
  },
  primaryBtn: {
    flex: 1,
    backgroundColor: theme.accent,
    borderRadius: theme.radiusSm,
    paddingVertical: 12,
    alignItems: "center",
  },
  primaryText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 15,
  },
  secondaryBtn: {
    flex: 1,
    backgroundColor: theme.bg,
    borderRadius: theme.radiusSm,
    paddingVertical: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: theme.outline,
  },
  secondaryText: {
    color: theme.text,
    fontWeight: "800",
    fontSize: 15,
  },
  arrow: {
    position: "absolute",
    width: 0,
    height: 0,
    backgroundColor: "transparent",
    borderStyle: "solid",
  },
  arrowBase: {
    zIndex: 2,
  },
  arrowTop: {
    top: -10,
    left: "50%",
    marginLeft: -10,
    borderLeftWidth: 10,
    borderRightWidth: 10,
    borderBottomWidth: 10,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderBottomColor: theme.surface,
  },
  arrowBottom: {
    bottom: -10,
    left: "50%",
    marginLeft: -10,
    borderLeftWidth: 10,
    borderRightWidth: 10,
    borderTopWidth: 10,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: theme.surface,
  },
  arrowLeft: {
    left: -10,
    top: "50%",
    marginTop: -10,
    borderTopWidth: 10,
    borderBottomWidth: 10,
    borderRightWidth: 10,
    borderTopColor: "transparent",
    borderBottomColor: "transparent",
    borderRightColor: theme.surface,
  },
  arrowRight: {
    right: -10,
    top: "50%",
    marginTop: -10,
    borderTopWidth: 10,
    borderBottomWidth: 10,
    borderLeftWidth: 10,
    borderTopColor: "transparent",
    borderBottomColor: "transparent",
    borderLeftColor: theme.surface,
  },
});
