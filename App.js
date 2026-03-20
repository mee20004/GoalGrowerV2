import React, { useState, useEffect } from "react";
import { Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";

// Firebase
import { onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "./firebaseConfig";
import Login from "./login";

// Stores & Theme
import { GoalsProvider } from "./components/GoalsStore";
import { theme } from "./theme";

// Screens
import GoalsScreen from "./screens/GoalsScreen";
import AddGoalScreen from "./screens/AddGoalScreen";
import GoalScreen from "./screens/GoalScreen";
import ProfileScreen from "./screens/ProfileScreen";
import CalendarScreen from "./screens/CalendarScreen";
import AddFriendsScreen from "./screens/AddFriendsScreen";
import UserProfileScreen from './screens/UserProfileScreen';
import UserGardenScreen from './screens/UserGardenScreen';
import SharedGardenScreen from './screens/SharedGardenScreen';
import SettingsScreen from './screens/SettingsScreen';
import RankScreen from './screens/RankScreen';
import GardenScreen from './screens/GardenScreen'; // <-- 1. IMPORT GARDEN SCREEN

// Helper Placeholder Screen
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

// --- STACK NAVIGATORS ---

function GoalsStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="GoalsHome" component={GoalsScreen} />
      <Stack.Screen
        name="Goal"
        component={GoalScreen}
        options={{
          animation: "slide_from_bottom",
          animationDuration: 180,
        }}
      />
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

function ProfileStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ProfileHome" component={ProfileScreen} />
      <Stack.Screen name="AddFriends" component={AddFriendsScreen} />
      <Stack.Screen name="UserProfile" component={UserProfileScreen} />
      <Stack.Screen name="UserGarden" component={UserGardenScreen} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
    </Stack.Navigator>
  );
}

function RankStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="RankHome" component={RankScreen} />
      <Stack.Screen name="UserProfile" component={UserProfileScreen} />
      <Stack.Screen name="UserGarden" component={UserGardenScreen} />
    </Stack.Navigator>
  );
}

// <-- 2. CREATE THE GARDEN STACK
function GardenStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
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
    </Stack.Navigator>
  );
}

// --- MAIN BOTTOM TABS ---

function MainTabs() {
  const insets = useSafeAreaInsets();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarShowLabel: true,
        tabBarHideOnKeyboard: false,
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
        tabBarLabelStyle: { fontSize: 10, fontWeight: "800", marginTop: 2 },
        tabBarIcon: ({ color, focused }) => {
          const map = {
            Rank: focused ? "trophy" : "trophy-outline",
            Goals: focused ? "leaf" : "leaf-outline",
            Add: focused ? "add-circle" : "add-circle-outline",
            Calendar: focused ? "calendar" : "calendar-outline",
            Garden: focused ? "flower" : "flower-outline",
            ProfileTab: focused ? "person" : "person-outline",
          };
          const iconName = map[route.name] ?? "ellipse-outline";
          const iconSize = route.name === "Add" ? 28 : 22;
          return <Ionicons name={iconName} size={iconSize} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Rank" component={RankStack} options={{ tabBarLabel: "Rank" }} />
      <Tab.Screen name="Goals" component={GoalsStack} options={{ tabBarLabel: "Goals" }} />
      <Tab.Screen name="Add" component={AddStack} options={{ tabBarLabel: "Add" }} />
      <Tab.Screen name="Calendar" component={CalendarScreen} options={{ tabBarLabel: "Calendar" }} />
      {/* <-- 3. WIRE UP THE GARDEN TAB */}
      <Tab.Screen
        name="Garden"
        component={GardenStack}
        options={{ tabBarLabel: "Garden", unmountOnBlur: false }}
      />
      <Tab.Screen name="ProfileTab" component={ProfileStack} options={{ tabBarLabel: "Profile" }} />
    </Tab.Navigator>
  );
}

// --- ROOT APP COMPONENT ---

export default function App() {
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