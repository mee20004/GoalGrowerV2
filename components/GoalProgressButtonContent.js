import React from "react";
import { View, Text, StyleSheet } from "react-native";

export const MAX_QUANTITY_SEGMENTS = 6;

export function getQuantitySegmentMeta(targetValue, currentValue) {
  const target = Math.max(1, Math.floor(Number(targetValue) || 1));
  const current = Math.max(0, Math.min(Number(currentValue) || 0, target));
  const segmentCount = Math.max(1, Math.min(target, MAX_QUANTITY_SEGMENTS));
  const filledSegments = Math.min(
    segmentCount,
    Math.ceil((current / target) * segmentCount)
  );
  return { segmentCount, filledSegments, current, target };
}

function QuantitySegmentRow({
  segmentCount,
  filledSegments,
  isDone,
  userDone,
  filledStyle,
}) {
  return (
    <View style={styles.segmentRow}>
      {Array.from({ length: segmentCount }).map((_, index) => (
        <View
          key={`quantity-segment-${index}`}
          style={[
            styles.segment,
            index < filledSegments
              ? (isDone || userDone ? styles.segmentDone : [styles.segmentFilled, filledStyle])
              : styles.segmentEmpty,
          ]}
        />
      ))}
    </View>
  );
}

function PeriodicProgressBar({ current, target, isDone, accentColor, compact = false }) {
  const ratio = target > 0 ? Math.max(0, Math.min(current / target, 1)) : 0;
  const labelColor = isDone ? "#ffffff" : accentColor;
  const fillColor = isDone ? "rgba(255,255,255,0.95)" : "#58cc02";
  const trackColor = isDone ? "rgba(255,255,255,0.35)" : "rgba(122,154,93,0.10)";

  return (
    <>
      <Text
        style={[
          compact ? styles.periodicLabelCompact : styles.periodicLabel,
          { color: labelColor },
        ]}
      >
        {current}/{target}
      </Text>
      <View style={[styles.periodicTrack, { backgroundColor: trackColor }]}>
        <View
          style={[
            styles.periodicFill,
            { width: `${ratio * 100}%`, backgroundColor: fillColor },
          ]}
        />
      </View>
    </>
  );
}

export default function GoalProgressButtonContent({
  mode,
  currentValue,
  targetValue,
  isDone = false,
  userDone = false,
  accentColor = "#28b900",
  contributorLabel,
  filledSegmentStyle,
}) {
  if (mode === "periodic") {
    const target = Math.max(1, Math.floor(Number(targetValue) || 1));
    const current = Math.max(0, Math.min(Number(currentValue) || 0, target));
    return (
      <View style={styles.content}>
        <PeriodicProgressBar
          current={current}
          target={target}
          isDone={isDone}
          accentColor={accentColor}
        />
      </View>
    );
  }

  if (mode === "shared-periodic") {
    const target = Math.max(1, Math.floor(Number(targetValue) || 1));
    const current = Math.max(0, Math.min(Number(currentValue) || 0, target));
    const highlight = isDone || userDone;
    return (
      <View style={styles.content}>
        {!!contributorLabel && (
          <Text
            style={[
              styles.sharedLabel,
              { color: highlight ? "#ffffff" : accentColor },
            ]}
          >
            {contributorLabel}
          </Text>
        )}
        <PeriodicProgressBar
          current={current}
          target={target}
          isDone={highlight}
          accentColor={accentColor}
          compact
        />
      </View>
    );
  }

  const { segmentCount, filledSegments } = getQuantitySegmentMeta(targetValue, currentValue);

  if (mode === "shared-quantity") {
    return (
      <View style={styles.content}>
        {!!contributorLabel && (
          <Text
            style={[
              styles.sharedLabel,
              {
                color:
                  isDone || userDone ? "#ffffff" : accentColor,
              },
            ]}
          >
            {contributorLabel}
          </Text>
        )}
        <QuantitySegmentRow
          segmentCount={segmentCount}
          filledSegments={filledSegments}
          isDone={isDone}
          userDone={userDone}
          filledStyle={filledSegmentStyle}
        />
      </View>
    );
  }

  return (
    <View style={styles.content}>
      <QuantitySegmentRow
        segmentCount={segmentCount}
        filledSegments={filledSegments}
        isDone={isDone}
        userDone={userDone}
        filledStyle={filledSegmentStyle}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 7,
  },
  sharedLabel: {
    fontSize: 11,
    fontWeight: "900",
    marginBottom: 2,
    alignSelf: "center",
  },
  periodicLabel: {
    fontSize: 13,
    fontWeight: "900",
    marginBottom: 4,
    alignSelf: "center",
  },
  periodicLabelCompact: {
    fontSize: 10,
    fontWeight: "900",
    marginBottom: 2,
    alignSelf: "center",
  },
  periodicTrack: {
    width: "100%",
    height: 6,
    borderRadius: 999,
    overflow: "hidden",
  },
  periodicFill: {
    height: "100%",
    borderRadius: 999,
  },
  segmentRow: {
    flexDirection: "row",
    width: "100%",
    gap: 3,
    justifyContent: "center",
  },
  segment: {
    flex: 1,
    height: 6,
    borderRadius: 999,
    minWidth: 4,
  },
  segmentFilled: {
    backgroundColor: "#58cc02",
  },
  segmentDone: {
    backgroundColor: "rgba(255,255,255,0.95)",
  },
  segmentEmpty: {
    backgroundColor: "rgba(122,154,93,0.10)",
  },
});
