import React, { useEffect, useMemo, useRef } from "react";
import {
  Animated,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import Svg, { Path } from "react-native-svg";
import {
  TUTORIAL_OVERLAY_COLOR,
  buildHighlightCutoutPath,
  isValidRect,
} from "../../tutorial/layout";

function DimPanel({ style, animatedOpacity }) {
  return (
    <Animated.View
      pointerEvents="auto"
      style={[styles.touchPanel, style, { opacity: animatedOpacity }]}
    />
  );
}

function HighlightCutout({ rect, screenWidth, screenHeight, animatedOpacity }) {
  const topHeight = Math.max(0, rect.y);
  const leftWidth = Math.max(0, rect.x);
  const holeBottom = rect.y + rect.height;
  const holeRight = rect.x + rect.width;
  const bottomHeight = Math.max(0, screenHeight - holeBottom);
  const rightWidth = Math.max(0, screenWidth - holeRight);

  const cutoutPath = useMemo(
    () => buildHighlightCutoutPath(screenWidth, screenHeight, rect),
    [screenWidth, screenHeight, rect.x, rect.y, rect.width, rect.height]
  );

  return (
    <>
      <Animated.View
        pointerEvents="none"
        style={[styles.visualLayer, { opacity: animatedOpacity }]}
      >
        <Svg width={screenWidth} height={screenHeight}>
          <Path
            d={cutoutPath}
            fill={TUTORIAL_OVERLAY_COLOR}
            fillRule="evenodd"
          />
        </Svg>
      </Animated.View>

      <DimPanel
        animatedOpacity={animatedOpacity}
        style={{ top: 0, left: 0, width: screenWidth, height: topHeight }}
      />
      <DimPanel
        animatedOpacity={animatedOpacity}
        style={{
          top: holeBottom,
          left: 0,
          width: screenWidth,
          height: bottomHeight,
        }}
      />
      <DimPanel
        animatedOpacity={animatedOpacity}
        style={{ top: rect.y, left: 0, width: leftWidth, height: rect.height }}
      />
      <DimPanel
        animatedOpacity={animatedOpacity}
        style={{
          top: rect.y,
          left: holeRight,
          width: rightWidth,
          height: rect.height,
        }}
      />
      <View
        pointerEvents="box-none"
        style={{
          position: "absolute",
          left: rect.x,
          top: rect.y,
          width: rect.width,
          height: rect.height,
        }}
      />
    </>
  );
}

export default function TutorialOverlay({
  visible = false,
  mode = "centered",
  highlightRect = null,
  entranceDuration = 220,
  blocking = true,
  children = null,
}) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) {
      fade.setValue(0);
      return;
    }
    Animated.timing(fade, {
      toValue: 1,
      duration: entranceDuration,
      useNativeDriver: true,
    }).start();
  }, [
    visible,
    fade,
    mode,
    entranceDuration,
    highlightRect?.x,
    highlightRect?.y,
    highlightRect?.width,
    highlightRect?.height,
  ]);

  if (!visible) return null;

  const showHighlight =
    mode === "highlight" && isValidRect(highlightRect);
  const showCenteredDim = mode === "centered" || mode === "flow" || !showHighlight;

  return (
    <View style={styles.root} pointerEvents="box-none" accessibilityViewIsModal>
      {showHighlight ? (
        <HighlightCutout
          rect={highlightRect}
          screenWidth={screenWidth}
          screenHeight={screenHeight}
          animatedOpacity={fade}
        />
      ) : showCenteredDim ? (
        <Animated.View
          style={[styles.centeredDim, { opacity: fade }]}
          pointerEvents={blocking ? "auto" : "none"}
        />
      ) : null}

      {children ? (
        <View style={styles.content} pointerEvents="box-none">
          {children}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
    elevation: 1000,
  },
  visualLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  touchPanel: {
    position: "absolute",
    backgroundColor: "transparent",
  },
  centeredDim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: TUTORIAL_OVERLAY_COLOR,
  },
  content: {
    ...StyleSheet.absoluteFillObject,
  },
});
