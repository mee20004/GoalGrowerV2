import { theme } from './theme';
import React, { useState, useEffect, useRef } from "react";
import { useCallback } from "react";
import { Asset } from 'expo-asset';
import { StackActions } from '@react-navigation/native';
import { Text, View, Image, Alert, Pressable, TextInput, ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform, StyleSheet } from "react-native";
import { StatusBar } from "expo-status-bar";
import { AppState } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createStackNavigator, CardStyleInterpolators } from "@react-navigation/stack";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import CenteredTabBar from './components/CenteredTabBar';

// Firebase
import { onAuthStateChanged, signInAnonymously, EmailAuthProvider, linkWithCredential, signOut } from "firebase/auth";
import { doc, onSnapshot, collection, query, where, getDocs, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "./firebaseConfig";

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
import ShopScreen from './screens/ShopScreen';
import WelcomeScreen from './screens/WelcomeScreen';

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
function GardenStack({ onboardingStep, onboardingActions, onOnboardingAction, onGardenTutorialNext }) {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, gestureEnabled: false }}>
      <Stack.Screen name="GardenHome">
        {(props) => (
          <GardenScreen
            {...props}
            onboardingStep={onboardingStep}
            onboardingActions={onboardingActions}
            onOnboardingAction={onOnboardingAction}
            onGardenTutorialNext={onGardenTutorialNext}
          />
        )}
      </Stack.Screen>
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

function MainTabs({ onboardingStep, onboardingActions, onOnboardingAction, onGardenTutorialNext }) {
  const insets = useSafeAreaInsets();
  const lockTaskbar = onboardingStep === ONBOARDING_STEP.GARDEN_TUTORIAL;

  return (
    <Tab.Navigator
      initialRouteName={lockTaskbar ? 'Garden' : 'Shop'}
      tabBar={props => <CenteredTabBar {...props} disabled={lockTaskbar} />}
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
            />
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
        children={() => (
          <GardenStack
            onboardingStep={onboardingStep}
            onboardingActions={onboardingActions}
            onOnboardingAction={onOnboardingAction}
            onGardenTutorialNext={onGardenTutorialNext}
          />
        )}
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

import { FontProvider } from './components/FontProvider';
import { GoalsProvider } from './components/GoalsStore';
import EnterScreen from './screens/EnterScreen';
import Login from './login';
import AsyncStorage from '@react-native-async-storage/async-storage';

const ONBOARDING_STEP = {
  WELCOME: 'welcome',
  CREATE_GOAL_INTRO: 'create_goal_intro',
  CREATE_GOAL: 'create_goal',
  GARDEN_TUTORIAL: 'garden_tutorial',
  ACCOUNT_PROMPT: 'account_prompt',
  DONE: 'done',
};

const ONBOARDING_STEP_ORDER = {
  [ONBOARDING_STEP.WELCOME]: 0,
  [ONBOARDING_STEP.CREATE_GOAL_INTRO]: 1,
  [ONBOARDING_STEP.CREATE_GOAL]: 2,
  [ONBOARDING_STEP.GARDEN_TUTORIAL]: 3,
  [ONBOARDING_STEP.ACCOUNT_PROMPT]: 4,
  [ONBOARDING_STEP.DONE]: 5,
};

const ONBOARDING_ACTION_DEFAULTS = {
  movedGoal: false,
  exitedEditMode: false,
  completedGoal: false,
  reenteredEditMode: false,
  addedPage: false,
  openedGardenSwitcher: false,
  customizedGarden: false,
};

function AccountPromptScreen({ onDone, onLoginInstead }) {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const isAnonymous = !!auth.currentUser?.isAnonymous;

  const handleFinalizeAccount = useCallback(async () => {
    const trimmedUsername = username.trim();
    const trimmedEmail = email.trim();
    if (trimmedUsername.length < 3) {
      Alert.alert('Invalid username', 'Username must be at least 3 characters.');
      return;
    }
    if (!trimmedEmail) {
      Alert.alert('Missing email', 'Please enter your email.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      Alert.alert('Invalid email', 'Please enter a valid email address.');
      return;
    }
    if (!password || password.length < 6) {
      Alert.alert('Weak password', 'Password must be at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert('Passwords do not match', 'Please make sure both passwords match.');
      return;
    }

    const currentUser = auth.currentUser;
    if (!currentUser) {
      Alert.alert('Session expired', 'Please sign in again.');
      return;
    }

    try {
      setSubmitting(true);
      const usersRef = collection(db, 'users');
      const normalizedUsername = trimmedUsername.toLowerCase();
      const usernameQueries = await Promise.all([
        getDocs(query(usersRef, where('searchKey', '==', normalizedUsername))),
        getDocs(query(usersRef, where('username', '==', trimmedUsername))),
      ]);

      const currentUid = currentUser.uid;
      const usernameTaken = usernameQueries.some((snap) =>
        snap.docs.some((d) => d.id !== currentUid)
      );

      if (usernameTaken) {
        Alert.alert('Username taken', 'That username is already in use. Please choose another one.');
        return;
      }

      if (currentUser.isAnonymous) {
        const credential = EmailAuthProvider.credential(trimmedEmail, password);
        await linkWithCredential(currentUser, credential);
      }

      await setDoc(doc(db, 'users', currentUser.uid), {
        username: trimmedUsername,
        searchKey: normalizedUsername,
        email: auth.currentUser?.email || trimmedEmail,
        createdAt: serverTimestamp(),
      }, { merge: true });

      onDone?.();
    } catch (error) {
      const code = error?.code || '';
      if (code === 'auth/email-already-in-use') {
        Alert.alert('Email already in use', 'That email already has an account. Try logging in instead.');
      } else if (code === 'auth/invalid-email') {
        Alert.alert('Invalid email', 'Please enter a valid email address.');
      } else if (code === 'auth/weak-password') {
        Alert.alert('Weak password', 'Use a stronger password with at least 6 characters.');
      } else if (code === 'auth/provider-already-linked') {
        onDone?.();
      } else if (code === 'auth/credential-already-in-use') {
        Alert.alert('Credential in use', 'These credentials are already linked to another account.');
      } else {
        Alert.alert('Could not finalize account', 'Please try again.');
      }
      console.error('Finalize account failed:', code || error?.message || error);
    } finally {
      setSubmitting(false);
    }
  }, [confirmPassword, email, onDone, password, username]);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: 16, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={{ width: '100%', maxWidth: 420, alignSelf: 'center' }}>

          {/* Header */}
          <Text style={accountStyles.title}>
            {isAnonymous ? 'Create your Account' : 'Almost done'}
          </Text>
          <Text style={accountStyles.subtitle}>
            {isAnonymous
              ? ''
              : 'Your account is already linked. Continue to finish onboarding.'}
          </Text>

          <View style={accountStyles.divider} />

          {/* Form fields */}
          {isAnonymous ? (
            <View style={accountStyles.card}>
              <Text style={accountStyles.inputLabel}>Username</Text>
              <TextInput
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
                placeholder="e.g. plantlover42"
                placeholderTextColor="#9b948d"
                style={accountStyles.input}
              />
              <Text style={accountStyles.inputLabel}>Email</Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                placeholder="you@example.com"
                placeholderTextColor="#9b948d"
                style={accountStyles.input}
              />
              <Text style={accountStyles.inputLabel}>Password</Text>
              <TextInput
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
                placeholder="At least 6 characters"
                placeholderTextColor="#9b948d"
                style={accountStyles.input}
              />
              <Text style={accountStyles.inputLabel}>Confirm Password</Text>
              <TextInput
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
                autoCapitalize="none"
                placeholder="Re-enter password"
                placeholderTextColor="#9b948d"
                style={[accountStyles.input, { marginBottom: 0 }]}
              />
            </View>
          ) : null}

          {/* Primary button */}
          <View style={[accountStyles.actionButtonWrap, { marginTop: 22 }]}>
            <View pointerEvents="none" style={[accountStyles.actionButtonShadow, accountStyles.actionButtonShadowPrimary]} />
            <Pressable
              disabled={submitting}
              onPress={isAnonymous ? handleFinalizeAccount : onDone}
              style={({ pressed }) => [
                accountStyles.actionButtonFace,
                accountStyles.actionButtonPrimary,
                pressed && !submitting && accountStyles.actionButtonPressed,
                submitting && accountStyles.actionButtonPrimaryDisabled,
              ]}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={accountStyles.actionButtonTextPrimary}>
                  {isAnonymous ? 'Create Account' : 'Continue'}
                </Text>
              )}
            </Pressable>
          </View>

          {/* Secondary button */}
          {isAnonymous ? (
            <View style={[accountStyles.actionButtonWrap, { marginTop: 12 }]}>
              <View pointerEvents="none" style={[accountStyles.actionButtonShadow, accountStyles.actionButtonShadowSecondary]} />
              <Pressable
                disabled={submitting}
                onPress={onLoginInstead}
                style={({ pressed }) => [
                  accountStyles.actionButtonFace,
                  accountStyles.actionButtonSecondary,
                  pressed && !submitting && accountStyles.actionButtonPressed,
                ]}
              >
                <Text style={accountStyles.actionButtonTextSecondary}>Log in instead</Text>
              </Pressable>
            </View>
          ) : null}

        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const accountStyles = StyleSheet.create({
  title: {
    fontSize: 36,
    fontWeight: '900',
    color: '#2d2a26',
    textAlign: 'center',
    lineHeight: 42,
    fontFamily: 'CeraRoundProDEMO-Black',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000000',
    textAlign: 'center',
    lineHeight: 26,
    fontFamily: 'CeraRoundProDEMO-Black',
    maxWidth: 320,
    alignSelf: 'center',
  },
  divider: {
    height: 3,
    backgroundColor: '#cfcfcf',
    marginTop: 20,
    marginBottom: 24,
    marginHorizontal: 14,
    borderRadius: 100,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 16,
    shadowColor: '#4c6782',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#6b6560',
    fontFamily: 'CeraRoundProDEMO-Black',
    marginBottom: 4,
    marginLeft: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  input: {
    backgroundColor: theme.bg,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    marginBottom: 10,
    borderWidth: 0,
    borderColor: '#d2d2d2',
    color: '#2d2a26',
    fontSize: 15,
    fontFamily: 'CeraRoundProDEMO-Black',
  },
  actionButtonWrap: {
    height: 56,
    position: 'relative',
  },
  actionButtonShadow: {
    position: 'absolute',
    top: 4,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 20,
  },
  actionButtonShadowPrimary: { backgroundColor: '#509a18' },
  actionButtonShadowSecondary: { backgroundColor: '#b6b6b6' },
  actionButtonFace: {
    height: 52,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  actionButtonPrimary: { backgroundColor: '#58cc02' },
  actionButtonSecondary: { backgroundColor: '#ffffff' },
  actionButtonPrimaryDisabled: { backgroundColor: '#97cd71' },
  actionButtonPressed: { transform: [{ translateY: 4 }] },
  actionButtonTextPrimary: {
    fontSize: 19,
    fontWeight: '800',
    color: '#fff',
    fontFamily: 'CeraRoundProDEMO-Black',
  },
  actionButtonTextSecondary: {
    fontSize: 19,
    fontWeight: '800',
    color: '#3d3d3d',
    fontFamily: 'CeraRoundProDEMO-Black',
  },
});

function CreateGoalIntroScreen({ onNext, onBack }) {
  return (
    <View style={{ flex: 1, backgroundColor: theme.bg, paddingHorizontal: 16, paddingTop: 96, paddingBottom: 28 }}>
      <View style={{ position: 'absolute', top: 56, left: 16, zIndex: 10 }}>
        <Pressable
          onPress={onBack}
          style={{
            width: 42,
            height: 42,
            borderRadius: 16,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#ffffff',
            shadowColor: '#c3cfdb',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 1,
            shadowRadius: 0,
            elevation: 1,
          }}
        >
          <Ionicons name="chevron-back" size={26} color={theme.accent} />
        </Pressable>
      </View>

      <View style={{ marginBottom: 40 }}>
        <View style={{ paddingHorizontal: 16, paddingVertical: 6, alignItems: 'center' }}>
          <Text style={{ fontSize: 36, fontWeight: '900', color: '#2d2a26', textAlign: 'center', lineHeight: 42, marginBottom: 12, fontFamily: 'CeraRoundProDEMO-Black', marginTop: 150, }}>
            First, let's create a goal
          </Text>
          <Text style={{ fontSize: 18, fontWeight: '700', color: '#6b6560', textAlign: 'center', lineHeight: 26, maxWidth: 320, fontFamily: 'CeraRoundProDEMO-Black' }}>
            Start with one simple goal so you can see how your garden grows as you make progress.
          </Text>
        </View>
      </View>

      <View style={{ flex: 1 }} />

      <View style={{ marginBottom: 22 }}>
        <Text style={{ fontSize: 18, fontWeight: '900', color: '#363636', marginBottom: 14, textAlign: 'center', fontFamily: 'CeraRoundProDEMO-Black' }}>
          Ready to start?
        </Text>
        <View style={{ height: 3, backgroundColor: '#cfcfcf', marginTop: 4, marginBottom: 22, marginHorizontal: 14, borderRadius: 100 }} />
        <View style={{ width: '100%', alignSelf: 'center', maxWidth: 420, height: 56, position: 'relative' }}>
          <View pointerEvents="none" style={{ position: 'absolute', top: 4, left: 0, right: 0, bottom: 0, borderRadius: 20, backgroundColor: '#509a18' }} />
          <Pressable
            onPress={onNext}
            style={({ pressed }) => ({
              borderRadius: 20,
              height: 52,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: '#58cc02',
              transform: [{ translateY: pressed ? 4 : 0 }],
            })}
          >
            <Text style={{ fontSize: 19, fontWeight: '800', color: '#ffffff', textAlign: 'center', fontFamily: 'CeraRoundProDEMO-Black' }}>Next</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [initializing, setInitializing] = useState(true);
  const [hasUsername, setHasUsername] = useState(false);
  const [showEnterScreen, setShowEnterScreen] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(ONBOARDING_STEP.WELCOME);
  const [onboardingTransitionDirection, setOnboardingTransitionDirection] = useState('forward');
  const [onboardingLoaded, setOnboardingLoaded] = useState(false);
  const [onboardingActions, setOnboardingActions] = useState(ONBOARDING_ACTION_DEFAULTS);
  const [onboardingGoalId, setOnboardingGoalId] = useState(null);
  const userRef = useRef(null);
  const unsubFirestoreRef = useRef(null);
  const appStateListenerRef = useRef(null);

  const getOnboardingKey = (uid) => `onboardingStep_${uid}`;
  const getOnboardingGoalKey = (uid) => `onboardingGoalId_${uid}`;

  const loadOnboardingStep = useCallback(async (uid) => {
    if (!uid) return;
    const key = getOnboardingKey(uid);
    const goalKey = getOnboardingGoalKey(uid);
    const saved = await AsyncStorage.getItem(key);
    const savedGoalId = await AsyncStorage.getItem(goalKey);
    setOnboardingGoalId(savedGoalId || null);
    if (saved && Object.values(ONBOARDING_STEP).includes(saved)) {
      setOnboardingStep(saved);
    } else {
      setOnboardingStep(ONBOARDING_STEP.WELCOME);
      await AsyncStorage.setItem(key, ONBOARDING_STEP.WELCOME);
    }
    setOnboardingLoaded(true);
  }, []);

  const updateOnboardingStep = useCallback(async (nextStep, options = {}) => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    const currentOrder = ONBOARDING_STEP_ORDER[onboardingStep];
    const nextOrder = ONBOARDING_STEP_ORDER[nextStep];
    if (typeof currentOrder === 'number' && typeof nextOrder === 'number') {
      setOnboardingTransitionDirection(nextOrder < currentOrder ? 'backward' : 'forward');
    }

    setOnboardingStep(nextStep);
    await AsyncStorage.setItem(getOnboardingKey(uid), nextStep);
    if (Object.prototype.hasOwnProperty.call(options, 'goalId')) {
      const nextGoalId = options.goalId || null;
      setOnboardingGoalId(nextGoalId);
      if (nextGoalId) {
        await AsyncStorage.setItem(getOnboardingGoalKey(uid), nextGoalId);
      } else {
        await AsyncStorage.removeItem(getOnboardingGoalKey(uid));
      }
    }
    if (nextStep !== ONBOARDING_STEP.GARDEN_TUTORIAL) {
      setOnboardingActions(ONBOARDING_ACTION_DEFAULTS);
    }
  }, [onboardingStep]);

  const onboardingTransitionOptions = {
    headerShown: false,
    gestureDirection: onboardingTransitionDirection === 'backward' ? 'horizontal-inverted' : 'horizontal',
    cardStyleInterpolator: CardStyleInterpolators.forHorizontalIOS,
  };

  const markOnboardingAction = useCallback((actionKey) => {
    setOnboardingActions((prev) => ({ ...prev, [actionKey]: true }));
  }, []);

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
        if (firebaseUser.isAnonymous) {
          setHasUsername(true);
          loadOnboardingStep(firebaseUser.uid);
          setInitializing(false);
          return;
        }

        initializeNotifications(null);
        unsubFirestoreRef.current = onSnapshot(
          doc(db, "users", firebaseUser.uid),
          (docSnap) => {
            if (docSnap.exists() && docSnap.data().username) {
              setHasUsername(true);
              loadOnboardingStep(firebaseUser.uid);
            } else {
              setHasUsername(false);
              setOnboardingLoaded(false);
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
        setOnboardingLoaded(false);
        setOnboardingStep(ONBOARDING_STEP.WELCOME);
        setOnboardingActions(ONBOARDING_ACTION_DEFAULTS);
        setOnboardingGoalId(null);
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

  const handleGardenTutorialNext = useCallback(() => {
    updateOnboardingStep(ONBOARDING_STEP.ACCOUNT_PROMPT, { goalId: null });
  }, [updateOnboardingStep]);

  useEffect(() => {
    if (onboardingStep === ONBOARDING_STEP.ACCOUNT_PROMPT && hasUsername && !auth.currentUser?.isAnonymous) {
      updateOnboardingStep(ONBOARDING_STEP.DONE);
    }
  }, [onboardingStep, hasUsername, updateOnboardingStep]);

  if (initializing) return null;
  if (user && hasUsername && !onboardingLoaded) return null;

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
                onboardingStep === ONBOARDING_STEP.WELCOME ? (
                  <RootStack.Screen name="Welcome" options={onboardingTransitionOptions}>
                    {(props) => (
                      <WelcomeScreen
                        {...props}
                        onContinue={() => updateOnboardingStep(ONBOARDING_STEP.CREATE_GOAL_INTRO)}
                        onLogin={() => updateOnboardingStep(ONBOARDING_STEP.ACCOUNT_PROMPT)}
                      />
                    )}
                  </RootStack.Screen>
                ) : onboardingStep === ONBOARDING_STEP.CREATE_GOAL_INTRO ? (
                  <RootStack.Screen name="OnboardingCreateGoalIntro" options={onboardingTransitionOptions}>
                    {(props) => (
                      <CreateGoalIntroScreen
                        {...props}
                        onBack={() => updateOnboardingStep(ONBOARDING_STEP.WELCOME)}
                        onNext={() => updateOnboardingStep(ONBOARDING_STEP.CREATE_GOAL)}
                      />
                    )}
                  </RootStack.Screen>
                ) : onboardingStep === ONBOARDING_STEP.CREATE_GOAL ? (
                  <RootStack.Screen name="OnboardingAddGoal" options={onboardingTransitionOptions}>
                    {(props) => (
                      <AddGoalScreen
                        {...props}
                        onboardingMode={true}
                        onBack={() => updateOnboardingStep(ONBOARDING_STEP.CREATE_GOAL_INTRO)}
                        onGoalSaved={(goalId) => updateOnboardingStep(ONBOARDING_STEP.GARDEN_TUTORIAL, { goalId })}
                      />
                    )}
                  </RootStack.Screen>
                ) : onboardingStep === ONBOARDING_STEP.ACCOUNT_PROMPT ? (
                  <RootStack.Screen name="OnboardingAccountPrompt" options={onboardingTransitionOptions}>
                    {(props) => (
                      <AccountPromptScreen
                        {...props}
                        onDone={() => updateOnboardingStep(ONBOARDING_STEP.DONE)}
                        onLoginInstead={async () => {
                          try {
                            await signOut(auth);
                          } catch (error) {
                            console.error('Sign out during onboarding failed:', error);
                          }
                        }}
                      />
                    )}
                  </RootStack.Screen>
                ) : (
                  showEnterScreen && onboardingStep === ONBOARDING_STEP.DONE ? (
                    <RootStack.Screen name="Enter" options={{ headerShown: false }}>
                      {props => <EnterScreen {...props} onDone={handleEnterScreenDone} />}
                    </RootStack.Screen>
                  ) : (
                    <RootStack.Screen name="Tabs" options={{ headerShown: false }}>
                      {(props) => (
                        <MainTabs
                          {...props}
                          onboardingStep={onboardingStep}
                          onboardingActions={onboardingActions}
                          onOnboardingAction={markOnboardingAction}
                          onGardenTutorialNext={handleGardenTutorialNext}
                        />
                      )}
                    </RootStack.Screen>
                  )
                )
              ) : (
                <>
                  <RootStack.Screen name="WelcomeEntry" options={{ headerShown: false }}>
                    {(props) => (
                      <WelcomeScreen
                        {...props}
                        onLogin={() => props.navigation.navigate('Login')}
                        onContinue={async () => {
                          try {
                            const cred = await signInAnonymously(auth);
                            const anonUid = cred?.user?.uid;
                            if (anonUid) {
                              await AsyncStorage.setItem(`onboardingStep_${anonUid}`, ONBOARDING_STEP.CREATE_GOAL_INTRO);
                              await AsyncStorage.removeItem(`onboardingGoalId_${anonUid}`);
                              setOnboardingStep(ONBOARDING_STEP.CREATE_GOAL_INTRO);
                              setOnboardingLoaded(true);
                              setOnboardingGoalId(null);
                            }
                          } catch (error) {
                            console.error('Anonymous sign-in failed:', error?.code || error?.message || error);
                            if (error?.code === 'auth/admin-restricted-operation') {
                              Alert.alert(
                                'Guest Onboarding Disabled',
                                'Anonymous sign-in is disabled in Firebase Authentication. Enable it in Firebase Console > Authentication > Sign-in method > Anonymous, or continue with Login/Register.',
                                [
                                  {
                                    text: 'Continue to Login',
                                    onPress: () => props.navigation.navigate('Login'),
                                  },
                                ]
                              );
                            } else {
                              Alert.alert('Could not start onboarding', 'Please try again or continue with Login/Register.');
                            }
                          }
                        }}
                      />
                    )}
                  </RootStack.Screen>
                  <RootStack.Screen name="Login" component={Login} />
                </>
              )}
            </RootStack.Navigator>
          </NavigationContainer>
        </GoalsProvider>
      </SafeAreaProvider>
    </FontProvider>
  );
}