import React, { useState, useEffect } from "react";
import { useCallback } from "react";
import { Asset } from 'expo-asset';
import { StackActions } from '@react-navigation/native';
import { Text, View, Image } from "react-native";
import { StatusBar } from "expo-status-bar";
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
import Login from "./login";

// Stores & Theme
import { GoalsProvider } from "./components/GoalsStore";
import { theme } from "./theme";
import { PLANT_ASSETS } from "./constants/PlantAssets";
import { FAR_BG_ASSETS } from "./constants/FarBGAssets";
import { FRAME_ASSETS } from "./constants/FrameAssets";
import { WALLPAPER_ASSETS } from "./constants/WallpaperAssets";
import { initializeNotifications } from "./utils/notifications";

// Screens
import GoalsScreen from "./screens/GoalsScreen";
import AddGoalScreen from "./screens/AddGoalScreen";
import GoalScreen from "./screens/GoalScreen";
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

const TASKBAR_ICON_MAP = {
  Rank: require("./assets/Icons/Taskbar/TrophyIcon.png"),
  Goals: require("./assets/Icons/Taskbar/CheckIcon.png"),
  Garden: require("./assets/Icons/Taskbar/GardenIcon.png"),
  ProfileTab: require("./assets/Icons/Taskbar/ProfileIcon.png"),
  Journey: require("./assets/Icons/Taskbar/Journey.png"),
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
      <Tab.Screen name="Rank" component={RankStack} options={{ tabBarLabel: "Rank" }} />
      <Tab.Screen
        name="Goals"
        component={GoalsStack}
        options={{ tabBarLabel: "Goals" }}
        listeners={({ navigation }) => ({
          tabPress: e => {
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
      />
      {/* <-- 3. WIRE UP THE GARDEN TAB */}
      <Tab.Screen
        name="Garden"
        component={GardenStack}
        options={{ tabBarLabel: "Garden", unmountOnBlur: false }}
        listeners={({ navigation }) => ({
          tabPress: e => {
            // Prevent default behavior
            e.preventDefault();
            // Always navigate to the root of the Garden stack
            navigation.navigate('Garden', {
              screen: 'GardenHome',
              params: {},
            });
          },
        })}
      />
      <Tab.Screen name="ProfileTab" component={ProfileStack} options={{ tabBarLabel: "Profile" }} />
    </Tab.Navigator>
  );
}

// --- ROOT APP COMPONENT ---

export default function App() {
    // Preload all major assets for GardenScreen and GoalsScreen on app load
    const preloadAllAssets = useCallback(async () => {
      // Flatten plant asset tree
      const flattenPlantAssets = (obj) => {
        let arr = [];
        for (const v of Object.values(obj)) {
          if (typeof v === 'number') arr.push(v);
          else if (typeof v === 'object') arr = arr.concat(flattenPlantAssets(v));
        }
        return arr;
      };
      const plantImages = flattenPlantAssets(PLANT_ASSETS);
      const allAssets = [
        ...plantImages,
        ...FAR_BG_ASSETS,
        ...FRAME_ASSETS,
        ...WALLPAPER_ASSETS,
        require('./assets/plants/pot.png'),
        require('./assets/plants/pot_b.png'),
        require('./assets/plants/pot_s.png'),
        require('./assets/plants/pot_g.png'),
        require('./assets/plants/pot_p.png'),
        require('./assets/far_background.png'),
      ];
      try {
        await Asset.loadAsync(allAssets);
      } catch (e) {
        // Ignore errors, just try to cache as much as possible
      }
    }, []);

    useEffect(() => {
      preloadAllAssets();
    }, [preloadAllAssets]);
  const [user, setUser] = useState(null);
  const [hasUsername, setHasUsername] = useState(false);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    let unsubFirestore = null;

    const unsubAuth = onAuthStateChanged(auth, (firebaseUser) => {
      if (unsubFirestore) {
        unsubFirestore();
        unsubFirestore = null;
      }

      setUser(firebaseUser);

      if (firebaseUser) {
        // Initialize notifications when user logs in
        initializeNotifications(null);

        unsubFirestore = onSnapshot(
          doc(db, "users", firebaseUser.uid),
          (docSnap) => {
            if (docSnap.exists() && docSnap.data().username) {
              setHasUsername(true);
            } else {
              setHasUsername(false);
            }
            setInitializing(false);
          },
          (error) => {
            if (error?.code !== "permission-denied" || auth.currentUser) {
              console.error("Error listening to user profile:", error);
            }
            setHasUsername(false);
            setInitializing(false);
          }
        );
      } else {
        setHasUsername(false);
        setInitializing(false);
      }
    });

    return () => {
      unsubAuth();
      if (unsubFirestore) unsubFirestore();
    };
  }, []);

  if (initializing) return null;

  return (
    <SafeAreaProvider>
      <GoalsProvider>
        <NavigationContainer>
          <StatusBar style="dark" />
          <RootStack.Navigator screenOptions={{ headerShown: false }}>
            {user && hasUsername ? (
              <RootStack.Screen name="Tabs" component={MainTabs} />
            ) : (
              <RootStack.Screen name="Login" component={Login} />
            )}
          </RootStack.Navigator>
        </NavigationContainer>
      </GoalsProvider>
    </SafeAreaProvider>
  );
}