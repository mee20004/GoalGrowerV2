import theme, { ThemeProvider, useTheme } from './theme';
import React, { useState, useEffect, useRef } from "react";
import { useCallback } from "react";
import { Asset } from 'expo-asset';
import { StackActions } from '@react-navigation/native';
import { Text, View, Image, Alert, TextInput, ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform, StyleSheet } from "react-native";
import HapticPressable from './components/HapticPressable';
import { StatusBar } from "expo-status-bar";
import { AppState } from "react-native";
import { NavigationContainer, useNavigationContainerRef } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createStackNavigator, CardStyleInterpolators } from "@react-navigation/stack";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import CenteredTabBar from './components/CenteredTabBar';

// Firebase
import { onAuthStateChanged, signInAnonymously, EmailAuthProvider, linkWithCredential, signOut, updatePassword, reauthenticateWithCredential } from "firebase/auth";
import { doc, onSnapshot, collection, query, where, getDocs, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "./firebaseConfig";
import { abandonUnverifiedSignup } from "./utils/abandonUnverifiedSignup";
import { changeUserEmail, formatEmailChangeError } from "./utils/accountEmail";
import {
  saveOnboardingRelogin,
  clearOnboardingRelogin,
  getOnboardingRelogin,
  tryOnboardingRelogin,
} from "./utils/onboardingRelogin";
import { cardShadow, subtleBorderShadow, cpShadow } from "./utils/shadows";

import { FRAME_ASSETS } from "./constants/FrameAssets";
import { WALLPAPER_ASSETS } from "./constants/WallpaperAssets";
import { initializeNotifications, teardownNotificationListeners, syncGoalReminderBadge } from "./utils/notifications";
import {
  getActiveRouteName,
  initializeAnalytics,
  logAnalyticsEvent,
  logScreenView,
  setAnalyticsUserId,
} from "./utils/analytics";
import { prefetchDefaultGardenAssets } from "./utils/prefetchGardenAssets";

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
import WelcomeScreen from './screens/WelcomeScreen';
import VerifyEmailScreen from './screens/VerifyEmailScreen';
import { needsEmailVerification, sendVerificationEmail } from './utils/emailVerification';

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
  const { theme } = useTheme();

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
      <Stack.Screen name="UserJourney" component={JourneyScreen} />
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
      <Stack.Screen name="UserJourney" component={JourneyScreen} />
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
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const lockTaskbar = onboardingStep === ONBOARDING_STEP.GARDEN_TUTORIAL;

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

  const createTabPressListener = (navigation, tabName) => ({
    tabPress: (e) => {
      if (!hasAddGoalDirty() || !isAddGoalScreenActive(navigation)) return;

      e.preventDefault();
      Alert.alert(
        'Discard changes?',
        'You have unsaved changes in Add Goal. Leave and lose progress or stay and continue editing?',
        [
          { text: 'Stay', style: 'cancel' },
          { text: 'Leave', style: 'destructive', onPress: () => navigation.navigate(tabName) },
        ]
      );
    },
  });

  return (
    <Tab.Navigator
      initialRouteName={lockTaskbar ? 'Garden' : 'Shop'}
      tabBar={props => <CenteredTabBar {...props} disabled={lockTaskbar} hidden={lockTaskbar} />}
      screenOptions={({ route }) => ({
        headerShown: false,
        unmountOnBlur: false,
        freezeOnBlur: true,
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
              listeners={({ navigation }) => createTabPressListener(navigation, 'Shop')}
            />
      <Tab.Screen
        name="Rank"
        component={RankStack}
        options={{ tabBarLabel: "Rank" }}
        listeners={({ navigation }) => createTabPressListener(navigation, 'Rank')}
      />
      <Tab.Screen
        name="Goals"
        component={GoalsStack}
        options={{ tabBarLabel: "Goals" }}
        listeners={({ navigation }) => createTabPressListener(navigation, 'Goals')}
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
        listeners={({ navigation }) => createTabPressListener(navigation, 'Journey')}
      />
      {/* <-- 3. WIRE UP THE GARDEN TAB --> */}
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
        options={{ tabBarLabel: "Garden" }}
        listeners={({ navigation }) => createTabPressListener(navigation, 'Garden')}
      />
      <Tab.Screen
        name="ProfileTab"
        component={ProfileStack}
        options={{ tabBarLabel: "Profile" }}
        listeners={({ navigation }) => createTabPressListener(navigation, 'ProfileTab')}
      />
    </Tab.Navigator>
  );
}

// --- ROOT APP COMPONENT ---

import { FontProvider } from './components/FontProvider';
import { GoalsProvider } from './components/GoalsStore';
import { SubscriptionProvider } from './components/SubscriptionProvider';
import { ShopInventoryProvider } from './components/ShopInventoryProvider';
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
  viewedGrowthEducation: false,
  viewedHealthEducation: false,
};

function AccountPromptScreen({ onDone, onLoginInstead }) {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [profileLoaded, setProfileLoaded] = useState(false);

  const isAnonymous = !!auth.currentUser?.isAnonymous;
  const isUnverifiedLinked =
    !isAnonymous && !!auth.currentUser && !auth.currentUser.emailVerified;
  const showAccountForm = isAnonymous || isUnverifiedLinked;

  useEffect(() => {
    if (!isUnverifiedLinked) {
      setProfileLoaded(true);
      return undefined;
    }

    let cancelled = false;
    (async () => {
      const currentUser = auth.currentUser;
      if (!currentUser?.uid) {
        if (!cancelled) setProfileLoaded(true);
        return;
      }

      try {
        const userSnap = await getDoc(doc(db, 'users', currentUser.uid));
        if (cancelled) return;

        if (userSnap.exists()) {
          const data = userSnap.data();
          if (data.username) setUsername(data.username);
          if (data.pendingEmailChange) {
            setEmail(data.pendingEmailChange);
          } else if (currentUser.email) {
            setEmail(currentUser.email);
          }
        } else if (currentUser.email) {
          setEmail(currentUser.email);
        }
      } catch (error) {
        console.error('Load account prompt profile failed:', error?.code || error?.message || error);
      } finally {
        if (!cancelled) setProfileLoaded(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isUnverifiedLinked]);

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
      } else if (!currentUser.emailVerified) {
        const credential = EmailAuthProvider.credential(currentUser.email, password);
        await reauthenticateWithCredential(currentUser, credential);

        if (trimmedEmail !== currentUser.email) {
          const emailResult = await changeUserEmail(currentUser, trimmedEmail, {
            forceSend: true,
            password,
            skipReauth: true,
          });
          if (emailResult.pendingVerification) {
            Alert.alert(
              'Confirm your email',
              `We sent a link to ${trimmedEmail}. Open it to confirm your new address, then return here and tap I've verified.`
            );
          } else if (emailResult.verificationError) {
            Alert.alert(
              'Email updated',
              `Your email was saved, but we could not send a verification email: ${emailResult.verificationError?.message || 'Please try again.'}`
            );
          }
        } else {
          await sendVerificationEmail(currentUser, { force: true });
        }
        await updatePassword(currentUser, password);
      }

      await setDoc(doc(db, 'users', currentUser.uid), {
        username: trimmedUsername,
        searchKey: normalizedUsername,
        email: auth.currentUser?.email || trimmedEmail,
        createdAt: serverTimestamp(),
      }, { merge: true });

      await saveOnboardingRelogin({
        email: trimmedEmail,
        password,
        uid: auth.currentUser?.uid || currentUser.uid,
      });

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
      } else if (code === 'auth/requires-recent-login') {
        Alert.alert('Authentication required', formatEmailChangeError(error));
      } else {
        Alert.alert('Could not finalize account', error?.message || 'Please try again.');
      }
      console.error('Finalize account failed:', code || error?.message || error);
    } finally {
      setSubmitting(false);
    }
  }, [confirmPassword, email, onDone, password, username]);

  if (isUnverifiedLinked && !profileLoaded) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={theme.accent} />
      </View>
    );
  }

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
          <Text style={accountStyles.title}>Create your Account</Text>
          <Text style={accountStyles.subtitle}>
            {isUnverifiedLinked ? 'Update your details and we will resend the verification email.' : ''}
          </Text>

          <View style={accountStyles.divider} />

          {/* Form fields */}
          {showAccountForm ? (
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
                placeholder={isUnverifiedLinked ? 'Re-enter your password' : 'At least 6 characters'}
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
            <HapticPressable
              disabled={submitting}
              onPress={showAccountForm ? handleFinalizeAccount : onDone}
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
                  {showAccountForm ? 'Create Account' : 'Continue'}
                </Text>
              )}
            </HapticPressable>
          </View>

          {/* Secondary button */}
          {isAnonymous ? (
            <View style={[accountStyles.actionButtonWrap, { marginTop: 12 }]}>
              <View pointerEvents="none" style={[accountStyles.actionButtonShadow, accountStyles.actionButtonShadowSecondary]} />
              <HapticPressable
                disabled={submitting}
                onPress={onLoginInstead}
                style={({ pressed }) => [
                  accountStyles.actionButtonFace,
                  accountStyles.actionButtonSecondary,
                  pressed && !submitting && accountStyles.actionButtonPressed,
                ]}
              >
                <Text style={accountStyles.actionButtonTextSecondary}>Log in instead</Text>
              </HapticPressable>
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
    ...cpShadow({ color: '#4c6782', offset: { width: 0, height: 4 }, opacity: 0.08, radius: 8, elevation: 3 }),
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
        <HapticPressable
          onPress={onBack}
          style={{
            width: 42,
            height: 42,
            borderRadius: 16,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#ffffff',
            ...subtleBorderShadow,
          }}
        >
          <Ionicons name="chevron-back" size={26} color={theme.accent} />
        </HapticPressable>
      </View>

      <View style={{ marginBottom: 40 }}>
        <View style={{ paddingHorizontal: 16, paddingVertical: 6, alignItems: 'center' }}>
          <Text style={{ fontSize: 36, fontWeight: '900', color: '#2d2a26', textAlign: 'center', lineHeight: 42, marginBottom: 12, fontFamily: 'CeraRoundProDEMO-Black', marginTop: 150, }}>
            First, let's create a goal
          </Text>
          <Text style={{ fontSize: 18, fontWeight: '700', color: '#6b6560', textAlign: 'center', lineHeight: 26, maxWidth: 320, fontFamily: 'CeraRoundProDEMO-Black' }}>

          </Text>
        </View>
      </View>

      <View style={{ flex: 1 }} />

      <View style={{ marginBottom: 22 }}>
        <Text style={{ fontSize: 18, fontWeight: '900', color: '#363636', marginBottom: 14, textAlign: 'center', fontFamily: 'CeraRoundProDEMO-Black' }}>
        </Text>
        <View style={{ width: '100%', alignSelf: 'center', maxWidth: 420, height: 56, position: 'relative' }}>
          <View pointerEvents="none" style={{ position: 'absolute', top: 4, left: 0, right: 0, bottom: 0, borderRadius: 20, backgroundColor: '#509a18' }} />
          <HapticPressable
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
            <Text style={{ fontSize: 19, fontWeight: '800', color: '#ffffff', textAlign: 'center', fontFamily: 'CeraRoundProDEMO-Black' }}>Ready to start?</Text>
          </HapticPressable>
        </View>
      </View>
    </View>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [authUserVersion, setAuthUserVersion] = useState(0);
  const [accentColor, setAccentColor] = useState(theme.accent);
  const [initializing, setInitializing] = useState(true);
  const [hasUsername, setHasUsername] = useState(false);
  const [showEnterScreen, setShowEnterScreen] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(ONBOARDING_STEP.WELCOME);
  const [onboardingTransitionDirection, setOnboardingTransitionDirection] = useState('forward');
  const [onboardingLoaded, setOnboardingLoaded] = useState(false);
  const [onboardingActions, setOnboardingActions] = useState(ONBOARDING_ACTION_DEFAULTS);
  const [onboardingGoalId, setOnboardingGoalId] = useState(null);
  const [restoringOnboardingSession, setRestoringOnboardingSession] = useState(false);
  const userRef = useRef(null);
  const unsubFirestoreRef = useRef(null);
  const appStateListenerRef = useRef(null);
  const navigationRef = useNavigationContainerRef();
  const notificationCleanupRef = useRef(null);
  const routeNameRef = useRef(null);

  const trackNavigationState = useCallback(() => {
    const currentRouteName = getActiveRouteName(navigationRef);
    if (currentRouteName && routeNameRef.current !== currentRouteName) {
      routeNameRef.current = currentRouteName;
      logScreenView(currentRouteName);
    }
  }, [navigationRef]);

  const getOnboardingKey = (uid) => `onboardingStep_${uid}`;
  const getOnboardingGoalKey = (uid) => `onboardingGoalId_${uid}`;

  const loadOnboardingStep = useCallback(async (uid, options = {}) => {
    if (!uid) return;
    const { defaultIfMissing = ONBOARDING_STEP.WELCOME } = options;
    const key = getOnboardingKey(uid);
    const goalKey = getOnboardingGoalKey(uid);
    const saved = await AsyncStorage.getItem(key);
    const savedGoalId = await AsyncStorage.getItem(goalKey);
    setOnboardingGoalId(savedGoalId || null);

    let nextStep = defaultIfMissing;
    if (saved && Object.values(ONBOARDING_STEP).includes(saved)) {
      nextStep = saved;
    }

    // Returning email users should never restart guest onboarding at Welcome.
    const currentUser = auth.currentUser;
    if (
      currentUser &&
      !currentUser.isAnonymous &&
      nextStep === ONBOARDING_STEP.WELCOME &&
      defaultIfMissing === ONBOARDING_STEP.DONE
    ) {
      nextStep = ONBOARDING_STEP.DONE;
    }

    setOnboardingStep(nextStep);
    if (!saved || saved !== nextStep) {
      await AsyncStorage.setItem(key, nextStep);
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

    logAnalyticsEvent("onboarding_step", { step: nextStep });
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
    void initializeAnalytics();
  }, []);

  useEffect(() => {
    let unsubAuth = onAuthStateChanged(auth, (firebaseUser) => {
      if (unsubFirestoreRef.current) {
        unsubFirestoreRef.current();
        unsubFirestoreRef.current = null;
      }

      setUser(firebaseUser);
      userRef.current = firebaseUser;

      if (firebaseUser) {
        setAnalyticsUserId(firebaseUser.uid);
        void prefetchDefaultGardenAssets();

        if (firebaseUser.isAnonymous) {
          setHasUsername(true);
          loadOnboardingStep(firebaseUser.uid);
          setInitializing(false);
          return;
        }

        // Hold the UI in a loading state until Firestore confirms profile/onboarding.
        // Without this, a restored session briefly renders the logged-out Welcome screen.
        setInitializing(true);
        setHasUsername(false);
        setOnboardingLoaded(false);

        teardownNotificationListeners();
        void initializeNotifications(navigationRef);
        unsubFirestoreRef.current = onSnapshot(
          doc(db, "users", firebaseUser.uid),
          async (docSnap) => {
            if (docSnap.exists()) {
              const data = docSnap.data();

              setHasUsername(!!data.username);
              setAccentColor(data.accentColor || theme.accent);

              if (data.username) {
                await loadOnboardingStep(firebaseUser.uid, {
                  defaultIfMissing: ONBOARDING_STEP.DONE,
                });
              } else {
                setOnboardingLoaded(false);
              }
            } else {
              setHasUsername(false);
              setAccentColor(theme.accent);
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
          }
        );
      } else {
        teardownNotificationListeners();
        setAnalyticsUserId(null);

        void (async () => {
          const pendingRelogin = await getOnboardingRelogin();
          if (pendingRelogin) {
            setRestoringOnboardingSession(true);
            const relogin = await tryOnboardingRelogin();
            setRestoringOnboardingSession(false);
            if (relogin.signedIn) {
              return;
            }
          }

          // Firebase may restore a persisted session while async relogin work runs.
          if (auth.currentUser) {
            return;
          }

          setHasUsername(false);
          setInitializing(false);
          setShowEnterScreen(false);
          setOnboardingLoaded(false);
          setOnboardingStep(ONBOARDING_STEP.WELCOME);
          setOnboardingActions(ONBOARDING_ACTION_DEFAULTS);
          setOnboardingGoalId(null);
        })();
      }
    });

    appStateListenerRef.current = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void syncGoalReminderBadge();
        if (userRef.current) {
          checkEnterScreen(userRef.current.uid, "AppState.active");
        }
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

  const handleEmailVerified = useCallback(async () => {
    setRestoringOnboardingSession(true);
    try {
      let currentUser = auth.currentUser;
      if (!currentUser) {
        const relogin = await tryOnboardingRelogin();
        if (!relogin.signedIn) {
          return;
        }
        currentUser = auth.currentUser;
      }

      if (currentUser) {
        await currentUser.reload();
        if (!currentUser.emailVerified) {
          return;
        }
        await clearOnboardingRelogin();
        setAuthUserVersion((version) => version + 1);
        setUser(auth.currentUser);
      }

      if (onboardingStep !== ONBOARDING_STEP.DONE) {
        await updateOnboardingStep(ONBOARDING_STEP.DONE);
      }
    } finally {
      setRestoringOnboardingSession(false);
    }
  }, [onboardingStep, updateOnboardingStep]);

  const resetToAccountCreation = useCallback(async () => {
    await clearOnboardingRelogin();
    await abandonUnverifiedSignup({
      onboardingStep: ONBOARDING_STEP.ACCOUNT_PROMPT,
      getOnboardingKey,
      getOnboardingGoalKey,
    });
    setOnboardingStep(ONBOARDING_STEP.ACCOUNT_PROMPT);
    setOnboardingActions(ONBOARDING_ACTION_DEFAULTS);
    setOnboardingGoalId(null);
    setOnboardingLoaded(true);
    setAuthUserVersion((version) => version + 1);
  }, [getOnboardingGoalKey, getOnboardingKey]);

  const handleStartOver = resetToAccountCreation;

  const handleBackToEditAccount = useCallback(async () => {
    await updateOnboardingStep(ONBOARDING_STEP.ACCOUNT_PROMPT);
  }, [updateOnboardingStep]);

  useEffect(() => {
    const currentUser = auth.currentUser;
    if (
      onboardingStep === ONBOARDING_STEP.ACCOUNT_PROMPT &&
      hasUsername &&
      currentUser &&
      !currentUser.isAnonymous &&
      currentUser.emailVerified
    ) {
      updateOnboardingStep(ONBOARDING_STEP.DONE);
    }
  }, [onboardingStep, hasUsername, updateOnboardingStep, user?.emailVerified]);

  useEffect(() => {
    const currentUser = auth.currentUser;
    if (
      !onboardingLoaded ||
      !hasUsername ||
      !currentUser ||
      currentUser.isAnonymous ||
      onboardingStep !== ONBOARDING_STEP.WELCOME
    ) {
      return;
    }
    updateOnboardingStep(ONBOARDING_STEP.DONE);
  }, [onboardingLoaded, hasUsername, onboardingStep, updateOnboardingStep, user?.uid]);

  const activeAuthUser = auth.currentUser ?? user;

  // Stay blank until auth bootstrap finishes. Previously only logged-in users
  // were held here, so a brief null auth callback showed Welcome before restore.
  if (initializing || restoringOnboardingSession) return null;
  if (activeAuthUser && hasUsername && !onboardingLoaded) return null;
  void authUserVersion;
  const userNeedsEmailVerification =
    activeAuthUser && hasUsername && needsEmailVerification(activeAuthUser);

  const handleEnterScreenDone = async () => {
    const today = new Date().toLocaleDateString('en-CA');
    const uid = auth.currentUser?.uid;
    if (uid) {
      const key = `lastEnterScreenDate_${uid}`;
      await AsyncStorage.setItem(key, today);
    }
    setShowEnterScreen(false);
  };

  const tutorialEnabled = Boolean(user && hasUsername);

  return (
    <FontProvider>
      <SafeAreaProvider>
        <SubscriptionProvider>
          <ShopInventoryProvider>
          <GoalsProvider>
            <ThemeProvider accentColor={accentColor}>
            <NavigationContainer
              ref={navigationRef}
              onReady={trackNavigationState}
              onStateChange={trackNavigationState}
            >
              <StatusBar style="dark" />
              <RootStack.Navigator screenOptions={{ headerShown: false }}>
                {activeAuthUser && hasUsername ? (
                  userNeedsEmailVerification && onboardingStep !== ONBOARDING_STEP.ACCOUNT_PROMPT ? (
                    <RootStack.Screen name="VerifyEmail" options={{ headerShown: false }}>
                      {() => (
                        <VerifyEmailScreen
                          onVerified={handleEmailVerified}
                          onStartOver={handleStartOver}
                          onBack={handleBackToEditAccount}
                        />
                      )}
                    </RootStack.Screen>
                  ) : onboardingStep === ONBOARDING_STEP.WELCOME ? (
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
                          onGoalSaved={(goalId) =>
                            updateOnboardingStep(ONBOARDING_STEP.GARDEN_TUTORIAL, { goalId })
                          }
                          onSkipOnboarding={handleGardenTutorialNext}
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
                        {(props) => (
                          <EnterScreen {...props} onDone={handleEnterScreenDone} />
                        )}
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
                                await AsyncStorage.setItem(
                                  `onboardingStep_${anonUid}`,
                                  ONBOARDING_STEP.CREATE_GOAL_INTRO
                                );
                                await AsyncStorage.removeItem(
                                  `onboardingGoalId_${anonUid}`
                                );
                                setOnboardingStep(ONBOARDING_STEP.CREATE_GOAL_INTRO);
                                setOnboardingLoaded(true);
                                setOnboardingGoalId(null);
                              }
                            } catch (error) {
                              console.error(
                                'Anonymous sign-in failed:',
                                error?.code || error?.message || error
                              );

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
                                Alert.alert(
                                  'Could not start onboarding',
                                  'Please try again or continue with Login/Register.'
                                );
                              }
                            }
                          }}
                        />
                      )}
                    </RootStack.Screen>

                    <RootStack.Screen
                      name="Login"
                      component={Login}
                    />
                  </>
                )}
              </RootStack.Navigator>
            </NavigationContainer>
          </ThemeProvider>
        </GoalsProvider>
        </ShopInventoryProvider>
        </SubscriptionProvider>
      </SafeAreaProvider>
    </FontProvider>
  );
}