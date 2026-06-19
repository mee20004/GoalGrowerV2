import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import HapticPressable from '../HapticPressable';
import {
  to12HourParts,
  to24Hour,
  formatTime12,
  HOUR_12_OPTIONS,
  MINUTE_OPTIONS,
  PERIOD_OPTIONS,
} from '../../utils/timeFormat';

const ITEM_HEIGHT = 48;
const WHEEL_VISIBLE_COUNT = 5;
const WHEEL_HEIGHT = ITEM_HEIGHT * WHEEL_VISIBLE_COUNT;

function WheelColumn({ items, selectedIndex, onIndexChange, label, accentColor }) {
  const scrollRef = useRef(null);
  const isDragging = useRef(false);

  const scrollToIndex = useCallback((index, animated = true) => {
    const clamped = Math.max(0, Math.min(items.length - 1, index));
    scrollRef.current?.scrollTo({ y: clamped * ITEM_HEIGHT, animated });
    return clamped;
  }, [items.length]);

  useEffect(() => {
    const timer = setTimeout(() => scrollToIndex(selectedIndex, false), 50);
    return () => clearTimeout(timer);
  }, [selectedIndex, scrollToIndex]);

  const handleScrollEnd = (event) => {
    const offsetY = event.nativeEvent.contentOffset.y;
    const index = scrollToIndex(Math.round(offsetY / ITEM_HEIGHT), true);
    if (index !== selectedIndex) onIndexChange(index);
    isDragging.current = false;
  };

  return (
    <View style={styles.column}>
      <Text style={styles.columnLabel}>{label}</Text>
      <View style={[styles.wheelFrame, { height: WHEEL_HEIGHT }]}>
        <View
          pointerEvents="none"
          style={[styles.selectionBand, { borderColor: accentColor, backgroundColor: `${accentColor}14` }]}
        />
        <ScrollView
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
          snapToInterval={ITEM_HEIGHT}
          decelerationRate="fast"
          nestedScrollEnabled
          contentContainerStyle={{ paddingVertical: ITEM_HEIGHT * 2 }}
          onScrollBeginDrag={() => { isDragging.current = true; }}
          onMomentumScrollEnd={handleScrollEnd}
          onScrollEndDrag={(e) => {
            if (Platform.OS === 'android') handleScrollEnd(e);
          }}
        >
          {items.map((item, index) => {
            const selected = index === selectedIndex;
            return (
              <View key={`${item}-${index}`} style={styles.wheelItem}>
                <Text style={[styles.wheelText, selected && { color: accentColor, fontWeight: '900', fontSize: 22 }]}>
                  {item}
                </Text>
              </View>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );
}

export default function TimePickerSheet({
  visible,
  title,
  subtitle,
  hour24 = 9,
  minute = 0,
  accentColor = '#2ed600',
  onCancel,
  onConfirm,
}) {
  const insets = useSafeAreaInsets();
  const initial = to12HourParts(hour24, minute);
  const [hourIndex, setHourIndex] = useState(Math.max(0, initial.hour12 - 1));
  const [minuteIndex, setMinuteIndex] = useState(initial.minute);
  const [periodIndex, setPeriodIndex] = useState(initial.period === 'PM' ? 1 : 0);

  useEffect(() => {
    if (!visible) return;
    const parts = to12HourParts(hour24, minute);
    setHourIndex(Math.max(0, parts.hour12 - 1));
    setMinuteIndex(parts.minute);
    setPeriodIndex(parts.period === 'PM' ? 1 : 0);
  }, [visible, hour24, minute]);

  const preview24 = to24Hour(
    HOUR_12_OPTIONS[hourIndex],
    minuteIndex,
    PERIOD_OPTIONS[periodIndex]
  );
  const preview = formatTime12(preview24.hour, preview24.minute);

  const handleConfirm = () => {
    const { hour, minute: m } = to24Hour(
      HOUR_12_OPTIONS[hourIndex],
      minuteIndex,
      PERIOD_OPTIONS[periodIndex]
    );
    onConfirm?.(hour, m);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <HapticPressable style={styles.backdrop} onPress={onCancel} />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={styles.handle} />

          <View style={styles.header}>
            <View style={styles.headerTextWrap}>
              <Text style={styles.title}>{title}</Text>
              {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
            </View>
            <HapticPressable onPress={onCancel} hitSlop={8}>
              <Ionicons name="close" size={26} color="#334155" />
            </HapticPressable>
          </View>

          <View style={[styles.previewPill, { backgroundColor: `${accentColor}18` }]}>
            <Ionicons name="time-outline" size={20} color={accentColor} />
            <Text style={[styles.previewText, { color: accentColor }]}>{preview}</Text>
          </View>

          <View style={styles.wheelsRow}>
            <WheelColumn
              label="Hour"
              items={HOUR_12_OPTIONS}
              selectedIndex={hourIndex}
              onIndexChange={setHourIndex}
              accentColor={accentColor}
            />
            <Text style={styles.colon}>:</Text>
            <WheelColumn
              label="Min"
              items={MINUTE_OPTIONS}
              selectedIndex={minuteIndex}
              onIndexChange={setMinuteIndex}
              accentColor={accentColor}
            />
            <WheelColumn
              label=""
              items={PERIOD_OPTIONS}
              selectedIndex={periodIndex}
              onIndexChange={setPeriodIndex}
              accentColor={accentColor}
            />
          </View>

          <View style={styles.actions}>
            <HapticPressable onPress={onCancel} style={styles.cancelBtn}>
              <Text style={styles.cancelText}>Cancel</Text>
            </HapticPressable>
            <HapticPressable onPress={handleConfirm} style={[styles.confirmBtn, { backgroundColor: accentColor }]}>
              <Text style={styles.confirmText}>Set time</Text>
            </HapticPressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 18,
    paddingTop: 10,
  },
  handle: {
    alignSelf: 'center',
    width: 42,
    height: 5,
    borderRadius: 999,
    backgroundColor: '#dbe3ec',
    marginBottom: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 14,
  },
  headerTextWrap: {
    flex: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0f172a',
    fontFamily: 'CeraRoundProDEMO-Black',
  },
  subtitle: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '700',
    color: '#64748b',
    fontFamily: 'CeraRoundProDEMO-Black',
  },
  previewPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 16,
    paddingVertical: 12,
    marginBottom: 12,
  },
  previewText: {
    fontSize: 24,
    fontWeight: '900',
    fontFamily: 'CeraRoundProDEMO-Black',
  },
  wheelsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 4,
    marginBottom: 18,
  },
  column: {
    flex: 1,
    maxWidth: 88,
  },
  columnLabel: {
    fontSize: 11,
    fontWeight: '900',
    color: '#94a3b8',
    textTransform: 'uppercase',
    textAlign: 'center',
    marginBottom: 8,
    fontFamily: 'CeraRoundProDEMO-Black',
  },
  wheelFrame: {
    borderRadius: 16,
    backgroundColor: '#f8fafc',
    overflow: 'hidden',
  },
  selectionBand: {
    position: 'absolute',
    left: 6,
    right: 6,
    top: ITEM_HEIGHT * 2,
    height: ITEM_HEIGHT,
    borderRadius: 12,
    borderWidth: 1.5,
    zIndex: 1,
  },
  wheelItem: {
    height: ITEM_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wheelText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#94a3b8',
    fontFamily: 'CeraRoundProDEMO-Black',
  },
  colon: {
    fontSize: 24,
    fontWeight: '900',
    color: '#cbd5e1',
    marginBottom: ITEM_HEIGHT * 2 + 10,
    fontFamily: 'CeraRoundProDEMO-Black',
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
  },
  cancelBtn: {
    flex: 1,
    height: 52,
    borderRadius: 18,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#334155',
    fontFamily: 'CeraRoundProDEMO-Black',
  },
  confirmBtn: {
    flex: 1.4,
    height: 52,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#fff',
    fontFamily: 'CeraRoundProDEMO-Black',
  },
});
