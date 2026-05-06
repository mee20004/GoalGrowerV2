import React, { useRef } from 'react';
import { View, TouchableOpacity, StyleSheet, Platform, Image, Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';

const TASKBAR_ICON_MAP = {
  Rank: require('../assets/Icons/Taskbar/TrophyIcon.png'),
  Goals: require('../assets/Icons/Taskbar/CheckIcon.png'),
  Garden: require('../assets/Icons/Taskbar/GardenIcon.png'),
  ProfileTab: require('../assets/Icons/Taskbar/ProfileIcon.png'),
  Journey: require('../assets/Icons/Taskbar/Journey.png'),
};

export default function CenteredTabBar({ state, descriptors, navigation }) {
  const width = '90%'; // Set your desired width
  const tapScalesRef = useRef({});
  const insets = useSafeAreaInsets();

  const getTapScale = (routeKey) => {
    if (!tapScalesRef.current[routeKey]) {
      tapScalesRef.current[routeKey] = new Animated.Value(1);
    }
    return tapScalesRef.current[routeKey];
  };

  const runTapAnimation = (routeKey) => {
    const scale = getTapScale(routeKey);
    scale.stopAnimation();
    Animated.sequence([
      Animated.timing(scale, {
        toValue: 0.88,
        duration: 70,
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue: 1,
        speed: 22,
        bounciness: 7,
        useNativeDriver: true,
      }),
    ]).start();
  };

  return (
    <View style={[styles.outer, { width, left: '5%', marginLeft: -width / 2, bottom: insets.bottom + 8 }]}> 
      <View style={styles.inner}>
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const label =
            options.tabBarLabel !== undefined
              ? options.tabBarLabel
              : options.title !== undefined
              ? options.title
              : route.name;

          const isFocused = state.index === index;
          const tapScale = getTapScale(route.key);

          const onPress = () => {
            runTapAnimation(route.key);
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          const onLongPress = () => {
            navigation.emit({
              type: 'tabLongPress',
              target: route.key,
            });
          };

          const taskbarIconSource = TASKBAR_ICON_MAP[route.name];
          const iconName = options.tabBarIcon
            ? options.tabBarIcon({ color: isFocused ? '#2D5A27' : '#A0A0A0', focused: isFocused })
            : 'ellipse-outline';

          return (
            <TouchableOpacity
              key={route.key}
              accessibilityRole="button"
              accessibilityState={isFocused ? { selected: true } : {}}
              accessibilityLabel={options.tabBarAccessibilityLabel}
              testID={options.tabBarTestID}
              onPress={onPress}
              onLongPress={onLongPress}
              style={styles.tab}
              activeOpacity={0.8}
            >
              <Animated.View
                style={[
                  styles.iconFrame,
                  isFocused && styles.iconFrameActive,
                  { transform: [{ scale: tapScale }] },
                ]}
              >
                {taskbarIconSource ? (
                  <Image
                    source={taskbarIconSource}
                    style={styles.taskbarIcon}
                    resizeMode="contain"
                    fadeDuration={0}
                  />
                ) : typeof iconName === 'string' ? (
                  <Ionicons name={iconName} size={24} color={isFocused ? '#2D5A27' : '#A0A0A0'} />
                ) : (
                  iconName
                )}
              </Animated.View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    position: 'absolute',
    height: 64,
    borderRadius: 32,
    backgroundColor: '#fff', // You can use your theme here
    elevation: 10,
    shadowColor: '#d4d4d4',
    shadowOffset: { width: 0, height: 5 },
    borderWidth: 0,
    borderColor: '#d4d4d4',
    shadowOpacity: 1,
    shadowRadius: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 8,
    ...Platform.select({
      android: { overflow: 'hidden' },
    }),
  },
  inner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
  },
  tab: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 64,
    flex: 1,
  },
  iconFrame: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: 'transparent',
  },
  iconFrameActive: {
    borderColor: '#92d7ff',
    backgroundColor: '#f1fdff',
  },
  taskbarIcon: {
    width: 34,
    height: 34,
    // Ensure all icons are the same size
  },
});
