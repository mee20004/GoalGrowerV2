import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
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
import TutorialComparisonImages from "./TutorialComparisonImages";
import TutorialGrowthStages from "./TutorialGrowthStages";
import TutorialRichDescription from "./TutorialRichDescription";
import TutorialWarningBanner from "./TutorialWarningBanner";
import { tutorialCardStyles } from "./tutorialStyles";

function CardArrow({ placement, offsetX = null, offsetY = null }) {
  if (!placement) return null;

  const base = [styles.arrow, styles.arrowBase];
  if (placement === "top") {
    return (
      <View
        style={[
          ...base,
          styles.arrowTop,
          offsetX != null ? { left: offsetX, marginLeft: -10 } : null,
        ]}
      />
    );
  }
  if (placement === "bottom") {
    return (
      <View
        style={[
          ...base,
          styles.arrowBottom,
          offsetX != null ? { left: offsetX, marginLeft: -10 } : null,
        ]}
      />
    );
  }
  if (placement === "left") {
    return (
      <View
        style={[
          ...base,
          styles.arrowLeft,
          offsetY != null ? { top: offsetY, marginTop: -10 } : null,
        ]}
      />
    );
  }
  return (
    <View
      style={[
        ...base,
        styles.arrowRight,
        offsetY != null ? { top: offsetY, marginTop: -10 } : null,
      ]}
    />
  );
}

export default function TutorialCard({
  stepKey,
  title,
  description = "",
  descriptionParts = null,
  descriptionEmphasis = "",
  descriptionSuffix = "",
  warningText = "",
  growthStages = null,
  imageSource = null,
  primaryLabel = "Next",
  showPrimary = true,
  onSkip,
  onPrimary,
  targetRect = null,
  centered = false,
  cardPlacement = null,
  anchorPlacement = null,
  comparisonImages = null,
  showSkipGoalCreation = false,
  skipGoalCreationLabel = "Skip for now",
  optionalHint = null,
  onSkipGoalCreation,
}) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [measuredSize, setMeasuredSize] = useState(null);
  const fadeOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    fadeOpacity.setValue(0);
    Animated.timing(fadeOpacity, {
      toValue: 1,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [fadeOpacity, stepKey]);

  const layout = useMemo(() => {
    if (!measuredSize) return null;
    return computeTutorialCardLayout({
      screenWidth,
      screenHeight,
      cardWidth: measuredSize.width,
      cardHeight: measuredSize.height,
      targetRect: isValidRect(targetRect) ? targetRect : null,
      centered,
      cardPlacement,
      anchorPlacement,
      safeInsets: insets,
    });
  }, [
    anchorPlacement,
    cardPlacement,
    centered,
    insets,
    measuredSize,
    screenHeight,
    screenWidth,
    targetRect,
  ]);

  const isPositioned = Boolean(layout);

  const bodyProps = {
    title,
    description,
    descriptionParts,
    descriptionEmphasis,
    descriptionSuffix,
    warningText,
    growthStages,
    imageSource,
    comparisonImages,
    primaryLabel,
    showPrimary,
    onSkip,
    onPrimary,
    showSkipGoalCreation,
    skipGoalCreationLabel,
    optionalHint,
    onSkipGoalCreation,
  };

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
        <CardBody {...bodyProps} />
      </View>

      {isPositioned ? (
        <Animated.View
          pointerEvents="box-none"
          style={[
            styles.positionedWrap,
            {
              left: layout.left,
              top: layout.top,
              width: layout.width,
              opacity: fadeOpacity,
            },
          ]}
        >
          <CardArrow
            placement={layout.arrow}
            offsetX={layout.arrowOffsetX}
            offsetY={layout.arrowOffsetY}
          />
          <CardBody {...bodyProps} />
        </Animated.View>
      ) : null}
    </>
  );
}

function CardBody({
  title,
  description,
  descriptionParts,
  descriptionEmphasis,
  descriptionSuffix,
  warningText,
  growthStages,
  imageSource,
  comparisonImages,
  primaryLabel,
  showPrimary,
  onSkip,
  onPrimary,
  showSkipGoalCreation = false,
  skipGoalCreationLabel = "Skip for now",
  optionalHint = null,
  onSkipGoalCreation,
}) {
  const hasRichCopy =
    descriptionParts?.length || descriptionEmphasis || description;

  return (
    <View style={[tutorialCardStyles.card, styles.card]}>
      <Text style={tutorialCardStyles.title}>{title}</Text>

      {hasRichCopy ? (
        <TutorialRichDescription
          parts={descriptionParts}
          description={description}
          emphasis={descriptionEmphasis}
          suffix={descriptionSuffix}
        />
      ) : null}

      {warningText ? <TutorialWarningBanner text={warningText} /> : null}

      {growthStages?.length ? (
        <TutorialGrowthStages stages={growthStages} />
      ) : null}

      {comparisonImages ? (
        <TutorialComparisonImages
          leftSource={comparisonImages.leftSource}
          rightSource={comparisonImages.rightSource}
          leftLabel={comparisonImages.leftLabel}
          rightLabel={comparisonImages.rightLabel}
          variant={comparisonImages.variant}
        />
      ) : null}

      {imageSource ? (
        <Image source={imageSource} style={styles.image} resizeMode="contain" />
      ) : null}

      {showSkipGoalCreation && optionalHint ? (
        <Text style={styles.optionalHint}>{optionalHint}</Text>
      ) : null}

      <View style={tutorialCardStyles.actionsRow}>
        <Pressable
          style={tutorialCardStyles.skipLink}
          onPress={onSkip}
          accessibilityRole="button"
          accessibilityLabel="Skip tutorial"
        >
          <Text style={tutorialCardStyles.skipLinkText}>Skip</Text>
        </Pressable>
        <View style={styles.actionsEnd}>
          {showSkipGoalCreation ? (
            <Pressable
              style={tutorialCardStyles.primaryBtn}
              onPress={onSkipGoalCreation}
              accessibilityRole="button"
              accessibilityLabel={skipGoalCreationLabel}
            >
              <Text style={tutorialCardStyles.primaryText}>{skipGoalCreationLabel}</Text>
            </Pressable>
          ) : showPrimary ? (
            <Pressable
              style={tutorialCardStyles.primaryBtn}
              onPress={onPrimary}
              accessibilityRole="button"
              accessibilityLabel={primaryLabel}
            >
              <Text style={tutorialCardStyles.primaryText}>{primaryLabel}</Text>
            </Pressable>
          ) : (
            <View style={styles.primaryPlaceholder} />
          )}
        </View>
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
    maxWidth: 360,
    width: "100%",
  },
  image: {
    width: "100%",
    height: 120,
    marginBottom: 12,
  },
  optionalHint: {
    fontSize: 14,
    lineHeight: 20,
    color: "#5a6b7a",
    textAlign: "center",
    marginBottom: 12,
  },
  primaryPlaceholder: {
    minWidth: 108,
  },
  actionsEnd: {
    marginLeft: "auto",
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
