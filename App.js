import React, { useState, useEffect } from "react";
import { Text, View } from "react-native"; // Added missing Text/View imports
import { StatusBar } from "expo-status-bar";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

// Firebase & Auth
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "./firebaseConfig"; 
import Login from "./login"; 

// Stores & Theme
import { GoalsProvider } from "./components/GoalsStore";
import { theme } from "./theme";

import WelcomeScreen from "./screens/WelcomeScreen";
import GoalsScreen from "./screens/GoalsScreen";
import AddGoalScreen from "./screens/AddGoalScreen";
import GoalScreen from "./screens/GoalScreen";
import CalendarScreen from "./screens/CalendarScreen";

import RankScreen from "./screens/RankScreen";
import GardenScreen from "./screens/GardenScreen";
import SettingsScreen from "./screens/SettingsScreen";

// --- Helpers ---
function Placeholder({ title }) {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.bg }}>
      <Text style={{ fontWeight: "900", color: theme.muted2 }}>{title}</Text>
    </View>
  );
}

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();
const RootStack = createNativeStackNavigator();

function GoalsStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="GoalsHome" component={GoalsScreen} />
      <Stack.Screen name="Goal" component={GoalScreen} />
    </Stack.Navigator>
  );
}

function AddStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="AddGoal" component={AddGoalScreen} />
    </Stack.Navigator>
  );
}

/**
 * ✅ GardenStack keeps Settings + Challenge "in the tab group"
 * without being separate tabs.
 */
function GardenStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="GardenHome" component={GardenScreen} />
      <Stack.Screen name="Challenge" component={ChallengeScreen} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
    </Stack.Navigator>
  );
}
// --- Main App Component ---
export default function App() {
  const [user, setUser] = useState(null);
  const [initializing, setInitializing] = useState(true);
  
  useEffect(() => {
    // Listen for Firebase login/logout
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      if (initializing) setInitializing(false);
    });
    return unsubscribe;
  }, []);
  useEffect(() => {
    (async () => {
      try {
        const ok = await ensureNotificationPermissions();
        if (ok) {
          await scheduleDailyReminder(9, 0);
        }
      } catch (e) {
        console.log("Notifications setup failed:", e);
      }
    })();
  }, []);

  
  // Show nothing while we check if the user is logged in
  if (initializing) return null;

  return (
    <SafeAreaProvider>
      <GoalsProvider>
        <NavigationContainer>
          <StatusBar style="dark" />

          <RootStack.Navigator screenOptions={{ headerShown: false }}>
            <RootStack.Screen name="Welcome" component={WelcomeScreen} />
            <RootStack.Screen name="Tabs" component={TabsNavigator} />
          </RootStack.Navigator>
        </NavigationContainer>
      </GoalsProvider>
    </SafeAreaProvider>
  );
}


function TabsNavigator() {
  const insets = useSafeAreaInsets();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarShowLabel: true,
        tabBarHideOnKeyboard: true,

        tabBarStyle: {
          height: 64 + insets.bottom,
          paddingTop: 8,
          paddingBottom: Math.max(10, insets.bottom),
          backgroundColor: theme.surface,
          borderTopWidth: 0,
          elevation: 10,
        },

        tabBarActiveTintColor: theme.text,
        tabBarInactiveTintColor: theme.muted,

        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: "800",
          marginTop: 2,
        },

        tabBarIcon: ({ color, focused }) => {
          const map = {
            Rank: focused ? "trophy" : "trophy-outline",
            Goals: focused ? "leaf" : "leaf-outline",
            Add: focused ? "add-circle" : "add-circle-outline",
            Calendar: focused ? "calendar" : "calendar-outline",
            Garden: focused ? "flower" : "flower-outline",
          };

          const iconName = map[route.name] ?? "ellipse-outline";
          const iconSize = route.name === "Add" ? 28 : 22;

          return <Ionicons name={iconName} size={iconSize} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Rank" component={RankScreen} />

      {/* This route is named "Goals" but your Figma label says "Habits" */}
      <Tab.Screen
        name="Goals"
        component={GoalsStack}
        options={{ tabBarLabel: "Habits" }}
      />

      <Tab.Screen
        name="Add"
        component={AddStack}
        options={{ tabBarLabel: "Add" }}
      />

      <Tab.Screen name="Calendar" component={CalendarScreen}/>
      <Tab.Screen name="Garden" children={() => <Placeholder title="Garden (Coming Soon)" />} />
    </Tab.Navigator>
  );
}