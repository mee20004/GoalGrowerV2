import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Platform, Modal } from 'react-native';
import HapticPressable from './HapticPressable';
import { theme } from '../theme';
import { getWeekdayLabelsSync, getWeekStartSync } from '../utils/dateFormat';

const toStartOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const toISODate = (date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const buildMonthGrid = (monthDate) => {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstDayWeekIndex = (new Date(year, month, 1).getDay() - getWeekStartSync() + 7) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells = [];
  for (let i = 0; i < firstDayWeekIndex; i += 1) cells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) cells.push(day);
  while (cells.length < 42) cells.push(null);
  return cells;
};

const monthLabel = (date) => date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
const monthName = (date) => date.toLocaleDateString(undefined, { month: 'long' });
const getWeekdayLabels = () => getWeekdayLabelsSync();

export default function SwipeCalendar({ month, setMonth, selectedDate, onSelectDate }) {
  const [calendarWidth, setCalendarWidth] = useState(0);
  const calendarPagerRef = useRef(null);
  const [showPicker, setShowPicker] = useState(false);
  const [pickerYearRange, setPickerYearRange] = useState([]);
  const monthPickerRef = useRef(null);
  const yearPickerRef = useRef(null);

  const calendarCells = useMemo(() => buildMonthGrid(month), [month]);
  const prevMonth = useMemo(() => new Date(month.getFullYear(), month.getMonth() - 1, 1), [month]);
  const nextMonth = useMemo(() => new Date(month.getFullYear(), month.getMonth() + 1, 1), [month]);
  const prevMonthCells = useMemo(() => buildMonthGrid(prevMonth), [prevMonth]);
  const nextMonthCells = useMemo(() => buildMonthGrid(nextMonth), [nextMonth]);

  useEffect(() => {
    if (!calendarWidth || !calendarPagerRef.current) return;
    // Defer scrolling until layout stabilizes to avoid a visual jump
    const rafId = requestAnimationFrame(() => {
      try {
        calendarPagerRef.current?.scrollTo({ x: calendarWidth, animated: false });
      } catch (e) {
        // ignore
      }
    });
    return () => cancelAnimationFrame(rafId);
  }, [calendarWidth, month]);

  const handleCalendarScrollEnd = (event) => {
    if (!calendarWidth) return;
    const offsetX = event.nativeEvent.contentOffset.x;
    const pageIndex = Math.min(2, Math.max(0, Math.round(offsetX / calendarWidth)));
    if (pageIndex === 0) {
      setMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
    } else if (pageIndex === 2) {
      setMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
    }
  };

  const todayStart = toStartOfDay(new Date());

  useEffect(() => {
    // build a reasonable year range centered on the current month year
    const center = month.getFullYear();
    const range = [];
    for (let y = center - 25; y <= center + 25; y += 1) range.push(y);
    setPickerYearRange(range);
  }, [month]);

  const openPicker = () => setShowPicker(true);
  const closePicker = () => setShowPicker(false);

  const onPickYearMonth = (y, m) => {
    setMonth(new Date(y, m, 1));
    closePicker();
  };

  return (
    <View style={styles.calendarCard}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={styles.helperText}>Swipe the calendar left/right to move by month.</Text>
        <HapticPressable onPress={openPicker} style={{ padding: 6 }}>
          <Text style={[styles.helperText, { fontWeight: '700' }]}>{monthName(month)} {"\u2022"} {month.getFullYear()}</Text>
        </HapticPressable>
      </View>
      <ScrollView
        ref={calendarPagerRef}
        horizontal
        pagingEnabled
        snapToOffsets={calendarWidth ? [0, calendarWidth, calendarWidth * 2] : undefined}
        snapToAlignment="start"
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        bounces={false}
        onLayout={(e) => setCalendarWidth(e.nativeEvent.layout.width)}
        onMomentumScrollEnd={handleCalendarScrollEnd}
        scrollEventThrottle={16}
      >
        {[{ month: prevMonth, cells: prevMonthCells }, { month, cells: calendarCells }, { month: nextMonth, cells: nextMonthCells }].map((entry, pageIdx) => (
          <View key={`${entry.month.getFullYear()}-${entry.month.getMonth()}-${pageIdx}`} style={[styles.calendarPage, { width: calendarWidth || undefined }]}>
            <View style={styles.calendarHeader}>
              <Text style={styles.calendarHeaderText}>{monthLabel(entry.month)}</Text>
            </View>

            <View style={styles.calendarWeekHeader}>
              {getWeekdayLabels().map((label, idx) => (
                <Text key={`${label}-${idx}`} style={styles.calendarWeekHeaderText}>{label}</Text>
              ))}
            </View>

            <View style={styles.calendarGridFull}>
              {entry.cells.map((day, idx) => {
                const dayDate = day ? new Date(entry.month.getFullYear(), entry.month.getMonth(), day) : null;
                const isToday = !!dayDate && toStartOfDay(dayDate).getTime() === todayStart.getTime();
                const isPast = !!dayDate && toStartOfDay(dayDate).getTime() < todayStart.getTime();
                const iso = day ? toISODate(new Date(entry.month.getFullYear(), entry.month.getMonth(), day)) : '';
                const isSelected = !!day && selectedDate === iso;

                return (
                  <HapticPressable
                    key={`${pageIdx}-${idx}-${day || 'blank'}`}
                    onPress={() => day && !isPast && onSelectDate(iso)}
                    disabled={!day || isPast}
                    style={[
                      styles.calendarCell,
                      isPast && styles.calendarCellPast,
                      isToday && styles.calendarCellToday,
                      isSelected && styles.calendarCellSelected,
                      !day && styles.calendarCellEmpty,
                    ]}
                  >
                    <Text style={[styles.calendarCellText, isPast && styles.calendarCellTextPast, isSelected && styles.calendarCellTextSelected]}>
                      {day || ''}
                    </Text>
                  </HapticPressable>
                );
              })}
            </View>
          </View>
        ))}
      </ScrollView>

        <Modal visible={showPicker} transparent animationType="fade" onRequestClose={closePicker}>
          <View style={styles.pickerOverlay}>
            <View style={styles.pickerCard}>
              <Text style={styles.pickerTitle}>Pick month & year</Text>
              <View style={styles.pickerRow}>
                <ScrollView
                  ref={monthPickerRef}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ paddingHorizontal: 12 }}
                  snapToInterval={80}
                  decelerationRate="fast"
                >
                  {Array.from({ length: 12 }, (_, i) => (
                    <HapticPressable
                      key={`m-${i}`}
                      onPress={() => onPickYearMonth(month.getFullYear(), i)}
                      style={[styles.pickerItem, i === month.getMonth() && styles.pickerItemActive]}
                    >
                      <Text style={[styles.pickerItemText, i === month.getMonth() && styles.pickerItemTextActive]}>
                        {new Date(0, i).toLocaleString(undefined, { month: 'short' })}
                      </Text>
                    </HapticPressable>
                  ))}
                </ScrollView>
              </View>
              <View style={[styles.pickerRow, { marginTop: 12 }]}> 
                <ScrollView
                  ref={yearPickerRef}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ paddingHorizontal: 12 }}
                  snapToInterval={80}
                  decelerationRate="fast"
                >
                  {pickerYearRange.map((y) => (
                    <HapticPressable
                      key={`y-${y}`}
                      onPress={() => onPickYearMonth(y, month.getMonth())}
                      style={[styles.pickerItem, y === month.getFullYear() && styles.pickerItemActive]}
                    >
                      <Text style={[styles.pickerItemText, y === month.getFullYear() && styles.pickerItemTextActive]}>{String(y)}</Text>
                    </HapticPressable>
                  ))}
                </ScrollView>
              </View>

              <View style={styles.pickerActions}>
                <HapticPressable onPress={closePicker} style={styles.pickerCancel}>
                  <Text style={styles.pickerCancelText}>Cancel</Text>
                </HapticPressable>
              </View>
            </View>
          </View>
        </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  calendarCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 12,
    marginTop: 8,
  },
  helperText: { fontSize: 12, color: '#7d8a97', marginBottom: 8 },
  calendarHeader: { alignItems: 'center', marginBottom: 8 },
  calendarHeaderText: { fontSize: 15, fontWeight: '800', color: theme.text },
  calendarWeekHeader: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 6, marginBottom: 6 },
  calendarWeekHeaderText: { width: `${100 / 7}%`, textAlign: 'center', fontSize: 11, color: theme.muted2, fontWeight: '800' },
  calendarPage: { paddingHorizontal: 2, minHeight: 318 },
  calendarGridFull: { flexDirection: 'row', flexWrap: 'wrap' },
  calendarCell: { width: `${100 / 7}%`, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 8, marginVertical: 2 },
  calendarCellEmpty: { opacity: 0 },
  calendarCellPast: { opacity: 0.35 },
  calendarCellToday: { borderWidth: 1, borderColor: theme.accent, backgroundColor: 'rgba(89,215,0,0.08)' },
  calendarCellSelected: { backgroundColor: theme.accent, borderRadius: 8 },
  calendarCellText: { color: theme.text, fontWeight: '800' },
  calendarCellTextPast: { color: '#9aa7b4' },
  calendarCellTextSelected: { color: '#fff' },
  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  pickerCard: { width: '92%', backgroundColor: '#fff', borderRadius: 12, padding: 12 },
  pickerTitle: { fontSize: 16, fontWeight: '800', marginBottom: 8, color: theme.text },
  pickerRow: { height: 56 },
  pickerItem: { width: 72, height: 48, marginHorizontal: 4, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f4f6f9' },
  pickerItemActive: { backgroundColor: theme.accent },
  pickerItemText: { color: theme.text, fontWeight: '700' },
  pickerItemTextActive: { color: '#fff' },
  pickerActions: { marginTop: 12, flexDirection: 'row', justifyContent: 'flex-end' },
  pickerCancel: { paddingVertical: 8, paddingHorizontal: 12 },
  pickerCancelText: { color: theme.accent, fontWeight: '700' },
});