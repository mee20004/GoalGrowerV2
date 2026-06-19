import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import HapticPressable from '../HapticPressable';
import theme from '../../theme';

export default function SegmentedControl({
  options,
  value,
  onChange,
  accentColor = theme.accent,
  layout = 'row',
}) {
  return (
    <View style={[styles.wrap, layout === 'column' && styles.wrapColumn]}>
      {options.map((option) => {
        const selected = value === option.value;
        return (
          <HapticPressable
            key={String(option.value)}
            onPress={() => onChange(option.value)}
            style={[
              styles.option,
              layout === 'column' && styles.optionColumn,
              selected && { backgroundColor: accentColor, borderColor: accentColor },
            ]}
          >
            {!!option.icon && (
              <Text style={[styles.icon, selected && styles.optionTextSelected]}>{option.icon}</Text>
            )}
            <Text style={[styles.optionText, selected && styles.optionTextSelected]} numberOfLines={2}>
              {option.label}
            </Text>
            {!!option.hint && (
              <Text style={[styles.optionHint, selected && styles.optionHintSelected]} numberOfLines={2}>
                {option.hint}
              </Text>
            )}
          </HapticPressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    gap: 8,
  },
  wrapColumn: {
    flexDirection: 'column',
  },
  option: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 16,
    backgroundColor: '#f7fafc',
    borderWidth: 1,
    borderColor: '#d9e6f4',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  optionColumn: {
    width: '100%',
    flex: 0,
    alignItems: 'flex-start',
    paddingHorizontal: 14,
  },
  icon: {
    fontSize: 16,
    marginBottom: 4,
  },
  optionText: {
    fontSize: 13,
    fontWeight: '800',
    color: theme.text2,
    textAlign: 'center',
    fontFamily: 'CeraRoundProDEMO-Black',
  },
  optionTextSelected: {
    color: '#fff',
  },
  optionHint: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: '700',
    color: '#8b95a1',
    textAlign: 'center',
    lineHeight: 15,
    fontFamily: 'CeraRoundProDEMO-Black',
  },
  optionHintSelected: {
    color: 'rgba(255,255,255,0.88)',
  },
});
