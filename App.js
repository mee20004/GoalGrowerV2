import { theme } from './theme';
import React, { useState, useEffect, useRef } from "react";
import { useCallback } from "react";
import { Asset } from 'expo-asset';
import { StackActions } from '@react-navigation/native';
import { Text, View, Image, Alert } from "react-native";
import { StatusBar } from "expo-status-bar";
import { AppState } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createStackNavigator } from "@react-navigation/stack";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import CenteredTabBar from './components/CenteredTabBar';

// Firebase
import { onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "./firebaseConfig";

import { FRAME_ASSETS } from "./constants/FrameAssets";
import { WALLPAPER_ASSETS } from "./constants/WallpaperAssets";
import { initializeNotifications } from "./utils/notifications";

// Screens
import GoalsScreen from "./screens/GoalsScreen";
import AddGoalScreen from "./screens/AddGoalScreen";
import GoalScreen from "./screens/GoalScreen";
import { hasAddGoalDirty } from './utils/addGoalGuard';
import ProfileScreen from "./screens/ProfileScreen";
import AddFriendsScreen from "./screens/AddFriendsScreen";
import UserProfileScreen from './screens/UserProfileScreen';
import UserGardenScreen from './screens/UserGardenScreen';
import SharedGardenScreen from './screens/SharedGardenScreen';
import SettingsScreen from './screens/SettingsScreen';
import FollowingListScreen from './screens/FollowingListScreen';
import RankScreen from './screens/RankScreen';
import GardenScreen from './screens/GardenScreen'; // <-- 1. IMPORT GARDEN SCREEN
import JourneyScreen from './screens/JourneyScreen';
import ShopScreen from './screens/ShopScreen';

const TASKBAR_ICON_MAP = {
  Rank: require("./assets/Icons/Taskbar/TrophyIcon.png"),
  Goals: require("./assets/Icons/Taskbar/CheckIcon.png"),
  Garden: require("./assets/Icons/Taskbar/GardenIcon.png"),
  ProfileTab: require("./assets/Icons/Taskbar/ProfileIcon.png"),
  Journey: require("./assets/Icons/Taskbar/Journey.png"),
  Shop: require("./assets/Icons/Taskbar/Shop.png"),
};

// Helper Placeholder Screen
function Placeholder({ title }) {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.bg }}>
      <Text style={{ fontWeight: "900", color: theme.muted2 }}>{title}</Text>
    </View>
  );
}

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();
const RootStack = createStackNavigator();

// --- STACK NAVIGATORS ---

function GoalsStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, gestureEnabled: false }}>
      <Stack.Screen name="GoalsHome" component={GoalsScreen} />
      <Stack.Screen
        name="Goal"
        component={GoalScreen}
        options={{
          animation: "slide_from_bottom",
          animationDuration: 180,
        }}
      />
      <Stack.Screen name="AddGoal" component={AddGoalScreen} />
    </Stack.Navigator>
  );
}

function AddStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, gestureEnabled: false }}>
      <Stack.Screen name="AddGoal" component={AddGoalScreen} />
    </Stack.Navigator>
  );
}

import FollowersListScreen from './screens/FollowersListScreen';
function ProfileStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, gestureEnabled: false }}>
      <Stack.Screen name="ProfileHome" component={ProfileScreen} />
      <Stack.Screen name="AddFriends" component={AddFriendsScreen} />
      <Stack.Screen name="UserProfile" component={UserProfileScreen} />
      <Stack.Screen name="UserGarden" component={UserGardenScreen} />
      <Stack.Screen name="Settings" component={SettingsScreen} options={{ gestureEnabled: false }} />
      <Stack.Screen name="FollowingListScreen" component={FollowingListScreen} />
      <Stack.Screen name="FollowersListScreen" component={FollowersListScreen} />
    </Stack.Navigator>
  );
}

function RankStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, gestureEnabled: false }}>
      <Stack.Screen name="RankHome" component={RankScreen} />
      <Stack.Screen name="UserProfile" component={UserProfileScreen} />
      <Stack.Screen name="UserGarden" component={UserGardenScreen} />
    </Stack.Navigator>
  );
}

function JourneyStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, gestureEnabled: false }}>
      <Stack.Screen name="JourneyHome" component={JourneyScreen} />
    </Stack.Navigator>
  );
}

// <-- 2. CREATE THE GARDEN STACK
function GardenStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, gestureEnabled: false }}>
      <Stack.Screen name="GardenHome" component={GardenScreen} />
      <Stack.Screen name="SharedGarden" component={SharedGardenScreen} />
      <Stack.Screen
        name="Goal"
        component={GoalScreen}
        options={{
          animation: "slide_from_bottom",
          animationDuration: 180,
        }}
      />
      <Stack.Screen name="AddGoal" component={AddGoalScreen} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
      <Stack.Screen name="SharedGardenSettings" component={require('./screens/SharedGardenSettingsScreen').default} />
    </Stack.Navigator>
  );
}

// --- MAIN BOTTOM TABS ---

function MainTabs() {
  const insets = useSafeAreaInsets();

  const getActiveNestedRoute = (route) => {
    if (!route?.state || !route.state.routes?.length) return route;
    return getActiveNestedRoute(route.state.routes[route.state.index]);
  };

  const isAddGoalScreenActive = (navigation) => {
    const state = navigation.getState();
    const activeTab = state?.routes?.[state.index];
    const activeRoute = getActiveNestedRoute(activeTab);
    return activeRoute?.name === 'AddGoal';
  };

  const handleTabPress = (e, navigation, targetActivity) => {
    if (hasAddGoalDirty() && isAddGoalScreenActive(navigation)) {
      e.preventDefault();
      Alert.alert(
        'Discard changes?',
        'You have unsaved changes in Add Goal. Leave and lose progress or stay and continue editing?',
        [
          { text: 'Stay', style: 'cancel' },
          { text: 'Leave', style: 'destructive', onPress: () => navigation.navigate(...targetActivity) },
        ]
      );
      return;
    }

    e.preventDefault();
    navigation.navigate(...targetActivity);
  };

  return (
    <Tab.Navigator
      tabBar={props => <CenteredTabBar {...props} />}
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarShowLabel: false, // Hide text under icons
        tabBarHideOnKeyboard: false,
        tabBarActiveTintColor: theme.text,
        tabBarInactiveTintColor: theme.muted,
        tabBarLabelStyle: { fontSize: 10, fontWeight: "800", marginTop: 2 },
        tabBarIcon: ({ color, focused }) => {
          const iconSource = TASKBAR_ICON_MAP[route.name];
          if (iconSource) {
            return (
              <Image
                source={iconSource}
                style={{
                  width: 24,
                  height: 24,
                  opacity: focused ? 1 : 0.7,
                }}
                resizeMode="contain"
              />
            );
          }
          // Fallback for any unexpected route.
          return <Ionicons name="ellipse-outline" size={22} color={color} />;
        },
      })}
    >
            <Tab.Screen
              name="Shop"
              component={ShopScreen}
              options={{ tabBarLabel: "Shop" }}
              listeners={({ navigation }) => ({
                tabPress: e => {
                  if (hasAddGoalDirty()) {
                    e.preventDefault();
                    Alert.alert(
                      'Discard changes?',
                      'You have unsaved changes in Add Goal. Leave and lose progress or stay and continue editing?',
                      [
                        { text: 'Stay', style: 'cancel' },
                        { text: 'Leave', style: 'destructive', onPress: () => navigation.navigate('Shop') },
                      ]
                    );
                    return;
                  }
                  e.preventDefault();
                  navigation.navigate('Shop');
                },
              })}
            />
      <Tab.Screen
        name="Rank"
        component={RankStack}
        options={{ tabBarLabel: "Rank" }}
        listeners={({ navigation }) => ({
          tabPress: e => {
            if (hasAddGoalDirty()) {
              e.preventDefault();
              Alert.alert(
                'Discard changes?',
                'You have unsaved changes in Add Goal. Leave and lose progress or stay and continue editing?',
                [
                  { text: 'Stay', style: 'cancel' },
                  { text: 'Leave', style: 'destructive', onPress: () => navigation.navigate('Rank') },
                ]
              );
              return;
            }
            e.preventDefault();
            navigation.navigate('Rank');
          },
        })}
      />
      <Tab.Screen
        name="Goals"
        component={GoalsStack}
        options={{ tabBarLabel: "Goals" }}
        listeners={({ navigation }) => ({
          tabPress: e => {
            if (hasAddGoalDirty()) {
              e.preventDefault();
              Alert.alert(
                'Discard changes?',
                'You have unsaved changes in Add Goal. Leave and lose progress or stay and continue editing?',
                [
                  { text: 'Stay', style: 'cancel' },
                  { text: 'Leave', style: 'destructive', onPress: () => navigation.navigate('Goals', { screen: 'GoalsHome', params: {} }) },
                ]
              );
              return;
            }
            e.preventDefault();
            navigation.navigate('Goals', {
              screen: 'GoalsHome',
              params: {},
            });
          },
        })}
      />
      <Tab.Screen
        name="Journey"
        component={JourneyStack}
        options={{
          tabBarLabel: "Journey",
          tabBarIcon: ({ focused }) => (
            <Image
              source={TASKBAR_ICON_MAP.Journey}
              style={{ width: 24, height: 24, opacity: focused ? 1 : 0.7 }}
              resizeMode="contain"
            />
          ),
        }}
        listeners={({ navigation }) => ({
          tabPress: e => {
            if (hasAddGoalDirty()) {
              e.preventDefault();
              Alert.alert(
                'Discard changes?',
                'You have unsaved changes in Add Goal. Leave and lose progress or stay and continue editing?',
                [
                  { text: 'Stay', style: 'cancel' },
                  { text: 'Leave', style: 'destructive', onPress: () => navigation.navigate('Journey') },
                ]
              );
              return;
            }
            e.preventDefault();
            navigation.navigate('Journey');
          },
        })}
      />
      {/* <-- 3. WIRE UP THE GARDEN TAB --> */}
      <Tab.Screen
        name="Garden"
        component={GardenStack}
        options={{ tabBarLabel: "Garden", unmountOnBlur: false }}
        listeners={({ navigation }) => ({
          tabPress: e => {
            if (hasAddGoalDirty()) {
              e.preventDefault();
              Alert.alert(
                'Discard changes?',
                'You have unsaved changes in Add Goal. Leave and lose progress or stay and continue editing?',
                [
                  { text: 'Stay', style: 'cancel' },
                  { text: 'Leave', style: 'destructive', onPress: () => navigation.navigate('Garden', { screen: 'GardenHome', params: {} }) },
                ]
              );
              return;
            }
            e.preventDefault();
            navigation.navigate('Garden', {
              screen: 'GardenHome',
              params: {},
            });
          },
        })}
      />
      <Tab.Screen
        name="ProfileTab"
        component={ProfileStack}
        options={{ tabBarLabel: "Profile" }}
        listeners={({ navigation }) => ({
          tabPress: e => {
            if (hasAddGoalDirty()) {
              e.preventDefault();
              Alert.alert(
                'Discard changes?',
                'You have unsaved changes in Add Goal. Leave and lose progress or stay and continue editing?',
                [
                  { text: 'Stay', style: 'cancel' },
                  { text: 'Leave', style: 'destructive', onPress: () => navigation.navigate('ProfileTab') },
                ]
              );
              return;
            }
            e.preventDefault();
            navigation.navigate('ProfileTab');
          },
        })}
      />
    </Tab.Navigator>
  );
}

// --- ROOT APP COMPONENT ---

import { FontProvider } from './components/FontProvider';
import { GoalsProvider } from './components/GoalsStore';
import EnterScreen from './screens/EnterScreen';
import Login from './login';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function App() {
  const [user, setUser] = useState(null);
  const [initializing, setInitializing] = useState(true);
  const [hasUsername, setHasUsername] = useState(false);
  const [showEnterScreen, setShowEnterScreen] = useState(false);
  const userRef = useRef(null);
  const unsubFirestoreRef = useRef(null);
  const appStateListenerRef = useRef(null);

  // Helper to check if EnterScreen should be shown
  const checkEnterScreen = async (uid, context) => {
    if (!uid) {
      setShowEnterScreen(false);
      return;
    }
    const key = `lastEnterScreenDate_${uid}`;
    const today = new Date().toLocaleDateString('en-CA');
    const lastDate = await AsyncStorage.getItem(key);
    if (lastDate !== today) {
      setShowEnterScreen(true);
    } else {
      setShowEnterScreen(false);
    }
  };

  useEffect(() => {
    let unsubAuth = onAuthStateChanged(auth, (firebaseUser) => {
      if (unsubFirestoreRef.current) {
        unsubFirestoreRef.current();
        unsubFirestoreRef.current = null;
      }

      setUser(firebaseUser);
      userRef.current = firebaseUser;

      if (firebaseUser) {
        initializeNotifications(null);
        unsubFirestoreRef.current = onSnapshot(
          doc(db, "users", firebaseUser.uid),
          (docSnap) => {
            if (docSnap.exists() && docSnap.data().username) {
              setHasUsername(true);
            } else {
              setHasUsername(false);
            }
            setInitializing(false);
            checkEnterScreen(firebaseUser.uid, "onSnapshot");
          },
          (error) => {
            if (error?.code !== "permission-denied" || auth.currentUser) {
              console.error("Error listening to user profile:", error);
            }
            setHasUsername(false);
            setInitializing(false);
            checkEnterScreen(firebaseUser.uid, "onSnapshotError");
          }
        );
      } else {
        setHasUsername(false);
        setInitializing(false);
        setShowEnterScreen(false);
      }
    });

    appStateListenerRef.current = AppState.addEventListener('change', (state) => {
      if (state === 'active' && userRef.current) {
        checkEnterScreen(userRef.current.uid, "AppState.active");
      }
    });

    return () => {
      if (unsubAuth) unsubAuth();
      if (unsubFirestoreRef.current) unsubFirestoreRef.current();
      if (appStateListenerRef.current) appStateListenerRef.current.remove();
    };
  }, []);

  if (initializing) return null;

  const handleEnterScreenDone = async () => {
    const today = new Date().toLocaleDateString('en-CA');
    const uid = auth.currentUser?.uid;
    if (uid) {
      const key = `lastEnterScreenDate_${uid}`;
      await AsyncStorage.setItem(key, today);
    }
    setShowEnterScreen(false);
  };

  return (
    <FontProvider>
      <SafeAreaProvider>
        <GoalsProvider>
          <NavigationContainer>
            <StatusBar style="dark" />
            <RootStack.Navigator screenOptions={{ headerShown: false }}>
              {user && hasUsername ? (
                showEnterScreen ? (
                  <RootStack.Screen name="Enter" options={{ headerShown: false }}>
                    {props => <EnterScreen {...props} onDone={handleEnterScreenDone} />}
                  </RootStack.Screen>
                ) : (
                  <RootStack.Screen name="Tabs" component={MainTabs} />
                )
              ) : (
                <RootStack.Screen name="Login" component={Login} />
              )}
            </RootStack.Navigator>
          </NavigationContainer>
        </GoalsProvider>
      </SafeAreaProvider>
    </FontProvider>
  );
}