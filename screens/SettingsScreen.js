// screens/SettingsScreen.js
import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { View, Text, StyleSheet, TextInput, ScrollView, Alert, ActivityIndicator, Switch } from "react-native";
import HapticPressable from "../components/HapticPressable";
import HapticTouchableOpacity from "../components/HapticTouchableOpacity";
import Ionicons from "@expo/vector-icons/Ionicons";
import { updatePassword, signOut, onAuthStateChanged } from "firebase/auth";
import { changeUserEmail, formatEmailChangeError } from "../utils/accountEmail";
import { doc, getDoc, updateDoc, collection, query, where, getDocs, onSnapshot } from "firebase/firestore";
import { auth, db } from "../firebaseConfig";
import theme, { useTheme } from "../theme";
import { cpShadow } from "../utils/shadows";
import { triggerSelectionHaptic } from "../utils/haptics";
import { onFirestoreListenerError } from "../utils/firestoreListener";
import {
  getNotificationSettings,
  requestNotificationPermissions,
  saveNotificationSettings,
  rescheduleAllNotifications,
  removeGoalNotificationSetting,
} from "../utils/notifications";
import { getDateFormatSync, setDateFormat, FORMATS, getDateFormatPreview, DATE_FORMAT_LABELS, getWeekStartSync, setWeekStart, WEEK_START_OPTIONS, getShowLast6DaysSync, setShowLast6Days } from '../utils/dateFormat';
import { formatTime12 } from '../utils/timeFormat';
import SegmentedControl from '../components/settings/SegmentedControl';
import TimePickerSheet from '../components/settings/TimePickerSheet';
import { useSubscription } from '../components/SubscriptionProvider';
import { PRO_ENTITLEMENT_DISPLAY_NAME } from '../constants/revenueCat';
import { FREE_LIMITS_SUMMARY, PRO_BENEFITS_SUMMARY } from '../constants/subscriptionLimits';
import { formatEmailVerificationError } from '../utils/emailVerification';
import { useSubscriptionLimits } from '../hooks/useSubscriptionLimits';

const BRAND_GREEN = '#28b900';

function buildSettingsSnapshot(values) {
  return {
    username: values.username || '',
    email: values.email || '',
    privateAccount: !!values.privateAccount,
    accentColor: values.accentColor,
    weekStart: values.weekStart,
    showLast6Days: !!values.showLast6Days,
    dateFormat: values.dateFormat,
    notificationsEnabled: !!values.notificationsEnabled,
    notificationMode: values.notificationMode || 'global',
    dailyReminderEnabled: !!values.dailyReminderEnabled,
    notificationHour: values.notificationHour ?? 9,
    notificationMinute: values.notificationMinute ?? 0,
    globalCustomText: values.globalCustomText || '',
    globalCustomPosition: values.globalCustomPosition || 'prefix',
    perGoalSettings: JSON.parse(JSON.stringify(values.perGoalSettings || {})),
  };
}

export default function SettingsScreen({ navigation }) {
  const { theme, setAccent } = useTheme();
  const {
    isPro,
    actionLoading: subscriptionLoading,
    openDefaultPaywall,
    openCustomerCenter,
    restorePurchases,
  } = useSubscription();
  const { usage } = useSubscriptionLimits();
  const [username, setUsername] = useState("");
  const [weekStart, setWeekStartState] = useState(getWeekStartSync());
  const [showLast6Days, setShowLast6DaysState] = useState(getShowLast6DaysSync());
  const [email, setEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [privateAccount, setPrivateAccount] = useState(false);
  const [savingPrivate, setSavingPrivate] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [notificationMode, setNotificationModeState] = useState("global");
  const [dailyReminderEnabled, setDailyReminderEnabled] = useState(true);
  const [notificationHour, setNotificationHour] = useState(9);
  const [notificationMinute, setNotificationMinute] = useState(0);
  
  const [showTimeModal, setShowTimeModal] = useState(false);
  const [goals, setGoals] = useState([]);
  const [selectedGoalForTime, setSelectedGoalForTime] = useState(null);
  const [showGoalTimeModal, setShowGoalTimeModal] = useState(false);
  const [goalTimeHour, setGoalTimeHour] = useState(9);
  const [goalTimeMinute, setGoalTimeMinute] = useState(0);
  const [dateFormat, setDateFormatState] = useState(getDateFormatSync());
  const [perGoalSettings, setPerGoalSettings] = useState({});
  const [globalCustomText, setGlobalCustomText] = useState('');
  const [globalCustomPosition, setGlobalCustomPosition] = useState('prefix');
  const [accentColor, setAccentColor] = useState(theme.accent);
  const [showCustomMessage, setShowCustomMessage] = useState(false);
  const savedSnapshotRef = useRef(null);

  const NOTIFICATION_MODE_OPTIONS = [
    { value: 'global', label: 'One reminder', hint: 'Single daily nudge for all goals' },
    { value: 'individual', label: 'Per goal', hint: 'Set a time for each goal' },
    { value: 'both', label: 'Both', hint: 'Daily summary plus per-goal alerts' },
  ];

  // Fetch current user info and notification settings when screen loads
  useEffect(() => {
    const fetchUserData = async () => {
      if (auth.currentUser) {
        const authEmail = auth.currentUser.email || "";
        setEmail(authEmail);
        try {
          const userDoc = await getDoc(doc(db, "users", auth.currentUser.uid));
          const userData = userDoc.exists() ? userDoc.data() : {};
          const loadedUsername = userData.username || "";
          const loadedPrivate = !!userData.privateAccount;
          const loadedAccent = userData.accentColor || theme.accent;

          const settings = await getNotificationSettings();
          const loadedWeekStart = getWeekStartSync();
          const loadedShowLast6Days = getShowLast6DaysSync();
          const loadedDateFormat = getDateFormatSync();

          const snapshot = buildSettingsSnapshot({
            username: loadedUsername,
            email: authEmail,
            privateAccount: loadedPrivate,
            accentColor: loadedAccent,
            weekStart: loadedWeekStart,
            showLast6Days: loadedShowLast6Days,
            dateFormat: loadedDateFormat,
            notificationsEnabled: settings.notificationsEnabled,
            notificationMode: settings.notificationMode || 'global',
            dailyReminderEnabled: settings.dailyReminderEnabled,
            notificationHour: settings.globalTime,
            notificationMinute: settings.globalTimeMinute,
            globalCustomText: settings.globalCustomText || '',
            globalCustomPosition: settings.globalCustomPosition || 'prefix',
            perGoalSettings: settings.perGoalNotifications || {},
          });

          savedSnapshotRef.current = snapshot;
          setUsername(snapshot.username);
          setPrivateAccount(snapshot.privateAccount);
          setAccentColor(snapshot.accentColor);
          setWeekStartState(snapshot.weekStart);
          setShowLast6DaysState(snapshot.showLast6Days);
          setDateFormatState(snapshot.dateFormat);
          setNotificationsEnabled(snapshot.notificationsEnabled);
          setNotificationModeState(snapshot.notificationMode);
          setDailyReminderEnabled(snapshot.dailyReminderEnabled);
          setNotificationHour(snapshot.notificationHour);
          setNotificationMinute(snapshot.notificationMinute);
          setPerGoalSettings(snapshot.perGoalSettings);
          setGlobalCustomText(snapshot.globalCustomText);
          setGlobalCustomPosition(snapshot.globalCustomPosition);
        } catch (error) {
          console.error("Error fetching user data:", error);
        }
      }
      setFetching(false);
    };
    fetchUserData();

    // Subscribe to user's goals and keep in state so settings can show per-goal toggles
    let unsubGoals = () => {};
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      unsubGoals();
      if (!user) {
        setGoals([]);
        return;
      }
      const goalsRef = collection(db, 'users', user.uid, 'goals');
      unsubGoals = onSnapshot(
        goalsRef,
        (snap) => {
          const arr = [];
          snap.forEach((doc) => {
            arr.push({ id: doc.id, ...doc.data() });
          });
          setGoals(arr);
        },
        onFirestoreListenerError('SettingsScreen goals listener')
      );
    });

    return () => {
      unsubGoals();
      unsubAuth();
    };
  }, []);
  const applySnapshotToState = useCallback((snapshot) => {
    if (!snapshot) return;
    setUsername(snapshot.username);
    setEmail(snapshot.email);
    setPrivateAccount(snapshot.privateAccount);
    setAccentColor(snapshot.accentColor);
    setAccent(snapshot.accentColor);
    setWeekStartState(snapshot.weekStart);
    setShowLast6DaysState(snapshot.showLast6Days);
    setDateFormatState(snapshot.dateFormat);
    setNotificationsEnabled(snapshot.notificationsEnabled);
    setNotificationModeState(snapshot.notificationMode);
    setDailyReminderEnabled(snapshot.dailyReminderEnabled);
    setNotificationHour(snapshot.notificationHour);
    setNotificationMinute(snapshot.notificationMinute);
    setPerGoalSettings(snapshot.perGoalSettings);
    setGlobalCustomText(snapshot.globalCustomText);
    setGlobalCustomPosition(snapshot.globalCustomPosition);
    setNewPassword('');
  }, [setAccent]);

  const hasUnsavedChanges = useMemo(() => {
    const saved = savedSnapshotRef.current;
    if (!saved) return false;
    if (newPassword.length > 0) return true;
    return (
      username !== saved.username
      || email !== saved.email
      || privateAccount !== saved.privateAccount
      || accentColor !== saved.accentColor
      || weekStart !== saved.weekStart
      || showLast6Days !== saved.showLast6Days
      || dateFormat !== saved.dateFormat
      || notificationsEnabled !== saved.notificationsEnabled
      || notificationMode !== saved.notificationMode
      || dailyReminderEnabled !== saved.dailyReminderEnabled
      || notificationHour !== saved.notificationHour
      || notificationMinute !== saved.notificationMinute
      || globalCustomText !== saved.globalCustomText
      || globalCustomPosition !== saved.globalCustomPosition
      || JSON.stringify(perGoalSettings) !== JSON.stringify(saved.perGoalSettings)
    );
  }, [
    username,
    email,
    newPassword,
    privateAccount,
    accentColor,
    weekStart,
    showLast6Days,
    dateFormat,
    notificationsEnabled,
    notificationMode,
    dailyReminderEnabled,
    notificationHour,
    notificationMinute,
    globalCustomText,
    globalCustomPosition,
    perGoalSettings,
  ]);

  const discardChanges = useCallback(async () => {
    const saved = savedSnapshotRef.current;
    if (!saved) return;
    applySnapshotToState(saved);
    await setDateFormat(saved.dateFormat);
    await setWeekStart(saved.weekStart);
    await setShowLast6Days(saved.showLast6Days);
  }, [applySnapshotToState]);

  const handlePrivateToggle = (value) => {
    triggerSelectionHaptic();
    setPrivateAccount(value);
  };

  const handleAccentColorSelect = (nextColor) => {
    setAccentColor(nextColor);
  };

  const handleNotificationModeChange = (mode) => {
    setNotificationModeState(mode);
  };

  const handleNotificationsToggle = async (value) => {
    triggerSelectionHaptic();
    if (value) {
      const granted = await requestNotificationPermissions();
      if (!granted) {
        Alert.alert(
          "Notifications disabled",
          "Enable notifications in your device settings to receive goal reminders."
        );
        return;
      }
    }
    setNotificationsEnabled(value);
  };

  const handleDailyReminderToggle = (value) => {
    triggerSelectionHaptic();
    setDailyReminderEnabled(value);
  };

  const handleTimeUpdate = (hour, minute) => {
    setNotificationHour(hour);
    setNotificationMinute(minute);
    setShowTimeModal(false);
  };

  const handleGoalTimeUpdate = (hour, minute) => {
    if (!selectedGoalForTime) return;
    const goal = selectedGoalForTime;
    const current = perGoalSettings?.[goal.id] || { enabled: false, time: 9, timeMinute: 0 };
    const next = { ...current, enabled: true, time: hour, timeMinute: minute, goalName: goal.name };
    setPerGoalSettings((prev) => ({ ...prev, [goal.id]: next }));
    setShowGoalTimeModal(false);
    setSelectedGoalForTime(null);
  };

  const openGoalTimePicker = async (goal) => {
    const s = perGoalSettings?.[goal.id] || { time: 9, timeMinute: 0 };
    setGoalTimeHour(s.time ?? 9);
    setGoalTimeMinute(s.timeMinute ?? 0);
    setSelectedGoalForTime(goal);
    setShowGoalTimeModal(true);
  };

  const toggleGoalNotification = async (goal) => {
    triggerSelectionHaptic();
    const s = perGoalSettings?.[goal.id] || { enabled: false, time: 9, timeMinute: 0 };
    if (!s.enabled) {
      const granted = await requestNotificationPermissions();
      if (!granted) {
        Alert.alert(
          "Notifications disabled",
          "Enable notifications in your device settings to receive goal reminders."
        );
        return;
      }
    }
    const next = { ...s, enabled: !s.enabled, goalName: goal.name };
    setPerGoalSettings((prev) => ({ ...prev, [goal.id]: next }));
  };

  // Clean up goal settings when a goal is deleted
  useEffect(() => {
    let unsubGoals = () => {};
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      unsubGoals();
      if (!user) return;
      const goalsRef = collection(db, 'users', user.uid, 'goals');
      unsubGoals = onSnapshot(
        goalsRef,
        async (snap) => {
          const existingIds = new Set();
          snap.forEach((d) => existingIds.add(d.id));
          const settings = await getNotificationSettings();
          const per = settings.perGoalNotifications || {};
          const keys = Object.keys(per);
          for (const k of keys) {
            if (!existingIds.has(k)) {
              await removeGoalNotificationSetting(k);
            }
          }
        },
        onFirestoreListenerError('SettingsScreen goal notification cleanup listener')
      );
    });
    return () => {
      unsubGoals();
      unsubAuth();
    };
  }, []);

  const handleDateFormatChange = (next) => {
    setDateFormatState(next);
  };

  const handleWeekStartChange = (next) => {
    setWeekStartState(next);
  };

  const handleShowLast6DaysToggle = (value) => {
    triggerSelectionHaptic();
    setShowLast6DaysState(value);
  };

  const savePreferenceSettings = async () => {
    const dateOk = await setDateFormat(dateFormat);
    const weekOk = await setWeekStart(weekStart);
    const historyOk = await setShowLast6Days(showLast6Days);
    if (!dateOk || !weekOk || !historyOk) {
      throw new Error('preference save failed');
    }
  };

  const saveNotificationPrefs = async () => {
    if (notificationsEnabled) {
      const granted = await requestNotificationPermissions();
      if (!granted) {
        throw new Error('notification permission denied');
      }
    }

    const settings = {
      notificationsEnabled,
      notificationMode,
      dailyReminderEnabled,
      globalTime: notificationHour,
      globalTimeMinute: notificationMinute,
      globalCustomText,
      globalCustomPosition,
      perGoalNotifications: perGoalSettings,
    };

    const saved = await saveNotificationSettings(settings);
    if (!saved) throw new Error('notification save failed');

    const rescheduled = await rescheduleAllNotifications(settings);
    if (!rescheduled) throw new Error('notification reschedule failed');
  };

  const handleSaveChanges = async () => {
    if (!auth.currentUser) return false;
    // Prevent empty username or email fields
    if (!username.trim() || !email.trim()) {
      Alert.alert("Error", "Username and Email cannot be empty.");
      return false;
    }

    // Debugging logs
    let currentPrivate = false;
    try {
      const userRef = doc(db, "users", auth.currentUser.uid);
      const userSnap = await getDoc(userRef);
      const currentUsername = userSnap.exists() ? userSnap.data().username : "";
      currentPrivate = userSnap.exists() ? !!userSnap.data().privateAccount : false;
      console.log("[DEBUG] username (state):", username);
      console.log("[DEBUG] currentUsername (db):", currentUsername);
      console.log("[DEBUG] email (state):", email);
      console.log("[DEBUG] auth.currentUser.email:", auth.currentUser.email);
      console.log("[DEBUG] privateAccount (state):", privateAccount);
      console.log("[DEBUG] currentPrivate (db):", currentPrivate);
    } catch (e) {
      console.log("[DEBUG] Error fetching user for debug:", e);
    }

    setLoading(true);

    try {
      let changesMade = false;
      const userRef = doc(db, "users", auth.currentUser.uid);
      const userSnap = await getDoc(userRef);
      const currentUsername = userSnap.exists() ? userSnap.data().username : "";
      // --- 1. CHECK IF USERNAME IS TAKEN ---
      if (username !== currentUsername) {
        // Search the users collection for this exact username
        const usersRef = collection(db, "users");
        const q = query(usersRef, where("username", "==", username));
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
          // Uh oh, someone else has it!
          Alert.alert("Username Taken", "Sorry, that username is already in use. Please pick another one.");
          setLoading(false);
          return false; // Stop the save process completely
        }
        // If we get here, the username is available! Save it.
        await updateDoc(userRef, { username: username });
        changesMade = true;
      }
      // --- 2. Update Email in Firebase Auth ---
      let emailChanged = false;
      let emailUpdateResult = null;
      if (email !== auth.currentUser.email) {
        emailUpdateResult = await changeUserEmail(auth.currentUser, email);
        if (emailUpdateResult.changed) {
          emailChanged = true;
          changesMade = true;
        }
      }
      // --- 3. Update Password in Firebase Auth ---
      if (newPassword.length > 0) {
        if (newPassword.length < 6) {
          Alert.alert("Weak Password", "Password must be at least 6 characters.");
          setLoading(false);
          return false;
        }
        await updatePassword(auth.currentUser, newPassword);
        setNewPassword(""); // Clear the field after success
        changesMade = true;
      }
      // --- 4. Check Private Account Change ---
      if (privateAccount !== currentPrivate) {
        await updateDoc(userRef, { privateAccount });
        changesMade = true;
      }

      const savedAccent = savedSnapshotRef.current?.accentColor;
      if (accentColor !== savedAccent) {
        await updateDoc(userRef, { accentColor });
        setAccent(accentColor);
        changesMade = true;
      }

      const savedPrefs = savedSnapshotRef.current;
      const prefsChanged = savedPrefs && (
        dateFormat !== savedPrefs.dateFormat
        || weekStart !== savedPrefs.weekStart
        || showLast6Days !== savedPrefs.showLast6Days
      );
      if (prefsChanged) {
        await savePreferenceSettings();
        changesMade = true;
      }

      const savedNotifications = savedSnapshotRef.current;
      const notificationsChanged = savedNotifications && (
        notificationsEnabled !== savedNotifications.notificationsEnabled
        || notificationMode !== savedNotifications.notificationMode
        || dailyReminderEnabled !== savedNotifications.dailyReminderEnabled
        || notificationHour !== savedNotifications.notificationHour
        || notificationMinute !== savedNotifications.notificationMinute
        || globalCustomText !== savedNotifications.globalCustomText
        || globalCustomPosition !== savedNotifications.globalCustomPosition
        || JSON.stringify(perGoalSettings) !== JSON.stringify(savedNotifications.perGoalSettings)
      );
      if (notificationsChanged) {
        try {
          await saveNotificationPrefs();
          changesMade = true;
        } catch (notificationError) {
          if (notificationError?.message === 'notification permission denied') {
            Alert.alert(
              "Notifications disabled",
              "Enable notifications in your device settings to receive goal reminders."
            );
            setLoading(false);
            return false;
          }
          throw notificationError;
        }
      }

      if (changesMade) {
        savedSnapshotRef.current = buildSettingsSnapshot({
          username,
          email: email !== auth.currentUser.email ? email : auth.currentUser.email,
          privateAccount,
          accentColor,
          weekStart,
          showLast6Days,
          dateFormat,
          notificationsEnabled,
          notificationMode,
          dailyReminderEnabled,
          notificationHour,
          notificationMinute,
          globalCustomText,
          globalCustomPosition,
          perGoalSettings,
        });
        setNewPassword('');
      }

      if (emailChanged) {
        if (emailUpdateResult?.verificationSent === false && emailUpdateResult?.verificationError) {
          Alert.alert(
            'Email updated',
            `Your email was saved, but we could not send a verification email: ${formatEmailVerificationError(emailUpdateResult.verificationError)}`
          );
        } else {
          Alert.alert(
            'Email updated',
            'Verify your new address to keep full access. Check your inbox and spam folder for a verification link.'
          );
        }
      } else if (changesMade) {
        Alert.alert("Success!", "Your settings have been saved.");
      } else {
        Alert.alert("No Changes", "Everything is already up to date.");
      }

      return true;
    } catch (error) {
      console.error("Update Error:", error);
      // Firebase requires a recent login to change sensitive info like email/password
      if (error.code === 'auth/requires-recent-login') {
        Alert.alert(
          "Authentication Required", 
          "For your security, please log out and log back in to change your email or password."
        );
      } else if (error.code === 'auth/email-already-in-use' || error.code === 'auth/invalid-email') {
        Alert.alert("Error", formatEmailChangeError(error));
      } else {
        Alert.alert("Error", error.message);
      }
      return false;
    } finally {
      setLoading(false);
    }
  };

  const promptUnsavedChanges = useCallback((onLeave) => {
    if (!hasUnsavedChanges) {
      onLeave();
      return;
    }
    Alert.alert(
      'Unsaved changes',
      'You have unsaved changes. Save them or leave without saving.',
      [
        { text: 'Stay', style: 'cancel' },
        {
          text: 'Leave without saving',
          style: 'destructive',
          onPress: async () => {
            await discardChanges();
            onLeave();
          },
        },
        {
          text: 'Save changes',
          onPress: async () => {
            const saved = await handleSaveChanges();
            if (saved) onLeave();
          },
        },
      ]
    );
  }, [discardChanges, handleSaveChanges, hasUnsavedChanges]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      if (!hasUnsavedChanges) return;
      e.preventDefault();
      promptUnsavedChanges(() => navigation.dispatch(e.data.action));
    });
    return unsubscribe;
  }, [navigation, hasUnsavedChanges, promptUnsavedChanges]);

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      Alert.alert("Error", "Failed to log out.");
    }
  };

  if (fetching) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color="#A88F6F" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerTopSpacer} />
      <View style={styles.headerWrapper}>
        <View style={styles.headerRow}>
          <HapticTouchableOpacity style={styles.headerBtn} onPress={() => promptUnsavedChanges(() => navigation.goBack())}>
            <Ionicons name="chevron-back" size={26} color={theme.accent} />
          </HapticTouchableOpacity>
          <Text style={styles.headerTitle}>Settings</Text>
          <View style={styles.headerBtnPlaceholder} />
        </View>
      </View>

      {hasUnsavedChanges && (
        <View style={[styles.unsavedBanner, { backgroundColor: `${theme.accent}18`, borderColor: `${theme.accent}55` }]}>
          <Ionicons name="alert-circle-outline" size={18} color={theme.accent} />
          <Text style={[styles.unsavedBannerText, { color: theme.accent }]}>
            You have unsaved changes. Press Save Changes before leaving.
          </Text>
        </View>
      )}

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 120 }]} showsVerticalScrollIndicator={false}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          <View style={styles.card}>
            <Text style={styles.label}>Username</Text>
            <TextInput
              style={styles.input}
              value={username}
              onChangeText={setUsername}
              placeholder="Enter new username"
              placeholderTextColor={theme.muted2}
              autoCapitalize="none"
            />

            <Text style={[styles.label, styles.inputTopGap]}>Email Address</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="Enter new email"
              placeholderTextColor={theme.muted2}
              keyboardType="email-address"
              autoCapitalize="none"
            />

            <Text style={[styles.label, styles.inputTopGap]}>New Password</Text>
            <TextInput
              style={styles.input}
              value={newPassword}
              onChangeText={setNewPassword}
              placeholder="Leave blank to keep current"
              placeholderTextColor={theme.muted2}
              secureTextEntry
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Privacy</Text>
          <View style={styles.card}>
            <View style={styles.switchRow}>
              <View style={styles.switchTextWrap}>
                <Text style={styles.labelNoMargin}>Private Account</Text>
                <Text style={styles.switchHint}>Only approved followers can see your profile activity.</Text>
              </View>
              <Switch
                value={privateAccount}
                onValueChange={handlePrivateToggle}
                disabled={savingPrivate}
                trackColor={{ true: theme.accent, false: '#d2dae2' }}
                thumbColor={privateAccount ? '#ffffff' : '#f4f3f4'}
              />
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notifications</Text>
          <View style={styles.card}>
            <View style={styles.switchRow}>
              <View style={styles.switchTextWrap}>
                <Text style={styles.labelNoMargin}>Goal reminders</Text>
                <Text style={styles.switchHint}>Get nudges to stay on track with your goals.</Text>
              </View>
              <Switch
                value={notificationsEnabled}
                onValueChange={handleNotificationsToggle}
                trackColor={{ true: theme.accent, false: '#d2dae2' }}
                thumbColor={notificationsEnabled ? '#ffffff' : '#f4f3f4'}
              />
            </View>

            {notificationsEnabled && (
              <>
                <View style={styles.divider} />

                <Text style={styles.subsectionLabel}>Reminder style</Text>
                <Text style={styles.subsectionHint}>Pick how reminders are scheduled.</Text>
                <View style={styles.segmentedWrap}>
                  <SegmentedControl
                    options={NOTIFICATION_MODE_OPTIONS}
                    value={notificationMode}
                    onChange={handleNotificationModeChange}
                    accentColor={theme.accent}
                    layout="column"
                  />
                </View>

                {(notificationMode === 'global' || notificationMode === 'both') && (
                  <>
                    <View style={styles.divider} />
                    <View style={styles.switchRow}>
                      <View style={styles.switchTextWrap}>
                        <Text style={styles.labelNoMargin}>Daily summary</Text>
                        <Text style={styles.switchHint}>One reminder covering all your goals.</Text>
                      </View>
                      <Switch
                        value={dailyReminderEnabled}
                        onValueChange={handleDailyReminderToggle}
                        trackColor={{ true: theme.accent, false: '#d2dae2' }}
                        thumbColor={dailyReminderEnabled ? '#ffffff' : '#f4f3f4'}
                      />
                    </View>

                    {dailyReminderEnabled && (
                      <HapticPressable onPress={() => setShowTimeModal(true)} style={styles.settingRowButton}>
                        <View style={styles.settingRowLeft}>
                          <View style={[styles.settingIconWrap, { backgroundColor: `${theme.accent}18` }]}>
                            <Ionicons name="alarm-outline" size={18} color={theme.accent} />
                          </View>
                          <View style={styles.settingRowText}>
                            <Text style={styles.settingRowTitle}>Reminder time</Text>
                            <Text style={styles.settingRowHint}>Tap to change when you get reminded</Text>
                          </View>
                        </View>
                        <View style={styles.timeChip}>
                          <Text style={[styles.timeChipText, { color: theme.accent }]}>
                            {formatTime12(notificationHour, notificationMinute)}
                          </Text>
                          <Ionicons name="chevron-forward" size={16} color={theme.accent} />
                        </View>
                      </HapticPressable>
                    )}
                  </>
                )}

                {(notificationMode === 'individual' || notificationMode === 'both') && (
                  <>
                    <View style={styles.divider} />
                    <Text style={styles.subsectionLabel}>Goal reminders</Text>
                    <Text style={styles.subsectionHint}>
                      Turn reminders on and set a time for each goal.
                    </Text>
                    {goals.length === 0 ? (
                      <Text style={styles.emptyGoalsHint}>Create a goal to set individual reminders.</Text>
                    ) : (
                      goals.map((g) => {
                        const goalSettings = perGoalSettings?.[g.id];
                        const enabled = !!goalSettings?.enabled;
                        return (
                          <View key={g.id} style={styles.goalReminderCard}>
                            <View style={styles.goalReminderTop}>
                              <View style={styles.goalReminderInfo}>
                                <Text style={styles.goalName} numberOfLines={1}>{g.name}</Text>
                                {!!g.category && (
                                  <Text style={styles.goalHint} numberOfLines={1}>{g.category}</Text>
                                )}
                              </View>
                              <Switch
                                value={enabled}
                                onValueChange={() => toggleGoalNotification(g)}
                                trackColor={{ true: theme.accent, false: '#d2dae2' }}
                                thumbColor="#fff"
                              />
                            </View>
                            {enabled && (
                              <HapticPressable onPress={() => openGoalTimePicker(g)} style={styles.goalTimeRow}>
                                <Ionicons name="time-outline" size={16} color={theme.accent} />
                                <Text style={styles.goalTimeLabel}>Remind me at</Text>
                                <Text style={[styles.goalTimeValue, { color: theme.accent }]}>
                                  {formatTime12(goalSettings?.time ?? 9, goalSettings?.timeMinute ?? 0)}
                                </Text>
                                <Ionicons name="chevron-forward" size={16} color={theme.accent} />
                              </HapticPressable>
                            )}
                          </View>
                        );
                      })
                    )}
                  </>
                )}

                <View style={styles.divider} />
                <HapticPressable
                  onPress={() => setShowCustomMessage((prev) => !prev)}
                  style={styles.expandRow}
                >
                  <View style={styles.settingRowLeft}>
                    <View style={[styles.settingIconWrap, { backgroundColor: '#eef2ff' }]}>
                      <Ionicons name="chatbubble-ellipses-outline" size={18} color="#6366f1" />
                    </View>
                    <View style={styles.settingRowText}>
                      <Text style={styles.settingRowTitle}>Custom message</Text>
                      <Text style={styles.settingRowHint}>Optional text added to reminders</Text>
                    </View>
                  </View>
                  <Ionicons
                    name={showCustomMessage ? 'chevron-up' : 'chevron-down'}
                    size={18}
                    color="#94a3b8"
                  />
                </HapticPressable>

                {showCustomMessage && (
                  <View style={styles.customMessagePanel}>
                    <Text style={styles.customMessageLabel}>Message text</Text>
                    <TextInput
                      style={styles.input}
                      value={globalCustomText}
                      onChangeText={setGlobalCustomText}
                      placeholder="e.g. Don't forget to work on"
                      placeholderTextColor={theme.muted2}
                    />
                    <Text style={[styles.customMessageLabel, { marginTop: 12 }]}>Goal name position</Text>
                    <View style={styles.templateRow}>
                      <HapticPressable
                        onPress={() => setGlobalCustomPosition('prefix')}
                        style={[
                          styles.templateButton,
                          globalCustomPosition === 'prefix' && { backgroundColor: theme.accent, borderColor: theme.accent },
                        ]}
                      >
                        <Text style={[styles.templateText, globalCustomPosition === 'prefix' && styles.templateTextActive]}>
                          Goal name first
                        </Text>
                        <Text style={[styles.templateExample, globalCustomPosition === 'prefix' && styles.templateExampleActive]}>
                          Run 5K — Don't forget
                        </Text>
                      </HapticPressable>
                      <HapticPressable
                        onPress={() => setGlobalCustomPosition('suffix')}
                        style={[
                          styles.templateButton,
                          globalCustomPosition === 'suffix' && { backgroundColor: theme.accent, borderColor: theme.accent },
                        ]}
                      >
                        <Text style={[styles.templateText, globalCustomPosition === 'suffix' && styles.templateTextActive]}>
                          Custom text first
                        </Text>
                        <Text style={[styles.templateExample, globalCustomPosition === 'suffix' && styles.templateExampleActive]}>
                          Don't forget — Run 5K
                        </Text>
                      </HapticPressable>
                    </View>
                  </View>
                )}
              </>
            )}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>App Color</Text>
          <View style={styles.card}>
            <Text style={styles.labelNoMargin}>Accent Color</Text>
            <Text style={styles.switchHint}>Pick the accent color used in buttons and highlights.</Text>
            <View style={styles.colorOptionsRow}>
              {[
                { label: 'Green', value: '#2ed600' },
                { label: 'Blue', value: '#3b82f6' },
                { label: 'Pink', value: '#ec4899' },
                { label: 'Red', value: '#ef4444' },
                { label: 'Orange', value: '#f97316' },
              ].map((option) => (
                <HapticPressable
                  key={option.value}
                  onPress={() => handleAccentColorSelect(option.value)}
                  style={[styles.colorDot, { backgroundColor: option.value }, accentColor === option.value && styles.colorDotSelected]}
                >
                  {accentColor === option.value && <Ionicons name="checkmark" size={16} color="#fff" />}
                </HapticPressable>
              ))}
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Preferences</Text>
          <View style={styles.card}>
            <Text style={styles.subsectionLabel}>Date format</Text>
            <Text style={styles.subsectionHint}>How dates appear across the app.</Text>
            <View style={styles.preferenceCards}>
              {FORMATS.map((fmt) => {
                const selected = dateFormat === fmt;
                return (
                  <HapticPressable
                    key={fmt}
                    onPress={() => handleDateFormatChange(fmt)}
                    style={[
                      styles.preferenceCard,
                      selected && { borderColor: theme.accent, backgroundColor: `${theme.accent}10` },
                    ]}
                  >
                    <View style={styles.preferenceCardTop}>
                      <Text style={[styles.preferenceCardTitle, selected && { color: theme.accent }]}>
                        {DATE_FORMAT_LABELS[fmt]}
                      </Text>
                      {selected && <Ionicons name="checkmark-circle" size={18} color={theme.accent} />}
                    </View>
                    <Text style={styles.preferenceCardPreview}>{getDateFormatPreview(fmt)}</Text>
                    <Text style={styles.preferenceCardMeta}>{fmt}</Text>
                  </HapticPressable>
                );
              })}
            </View>

            <View style={styles.divider} />

            <Text style={styles.subsectionLabel}>Week starts on</Text>
            <Text style={styles.subsectionHint}>Sets the first day in weekly goal views.</Text>
            <View style={styles.segmentedWrap}>
              <SegmentedControl
                options={WEEK_START_OPTIONS.map((option) => ({
                  value: option.value,
                  label: option.label,
                }))}
                value={weekStart}
                onChange={handleWeekStartChange}
                accentColor={theme.accent}
              />
            </View>

            <View style={styles.divider} />

            <View style={styles.switchRow}>
              <View style={styles.switchTextWrap}>
                <Text style={styles.labelNoMargin}>Rolling week history</Text>
                <Text style={styles.switchHint}>
                  Show the last 6 days plus today in goal details instead of a fixed calendar week.
                </Text>
              </View>
              <Switch
                value={showLast6Days}
                onValueChange={handleShowLast6DaysToggle}
                trackColor={{ false: '#d1d5db', true: theme.accent }}
                thumbColor={showLast6Days ? '#ffffff' : '#f8fafc'}
              />
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Subscription</Text>
          <View style={styles.card}>
            <Text style={styles.labelNoMargin}>
              {isPro ? `${PRO_ENTITLEMENT_DISPLAY_NAME} active` : "Upgrade to Pro"}
            </Text>
            <Text style={styles.switchHint}>
              {isPro
                ? `${PRO_BENEFITS_SUMMARY} Manage billing from Customer Center.`
                : `${FREE_LIMITS_SUMMARY} Upgrade to Pro for more.`}
            </Text>

            {isPro ? (
              <View style={styles.usageCard}>
                <Text style={styles.usageTitle}>Your Pro usage</Text>
                <Text style={styles.usageRow}>
                  Active goals: {usage.activeGoals.current}/{usage.activeGoals.limit}
                </Text>
                <Text style={styles.usageRow}>
                  Shared gardens created: {usage.sharedGardensCreated.current}/{usage.sharedGardensCreated.limit}
                </Text>
                <Text style={styles.usageRow}>
                  Shared gardens joined: {usage.sharedGardensJoined.current}/{usage.sharedGardensJoined.limit}
                </Text>
              </View>
            ) : (
              <View style={styles.usageCard}>
                <Text style={styles.usageTitle}>Your usage</Text>
                <Text style={styles.usageRow}>
                  Active goals: {usage.activeGoals.current}/{usage.activeGoals.limit}
                </Text>
                <Text style={styles.usageRow}>
                  Shared gardens created: {usage.sharedGardensCreated.current}/{usage.sharedGardensCreated.limit}
                </Text>
                <Text style={styles.usageRow}>
                  Shared gardens joined: {usage.sharedGardensJoined.current}/{usage.sharedGardensJoined.limit}
                </Text>
              </View>
            )}

            {!isPro && (
              <View style={[styles.actionButtonWrap, { marginTop: 16 }]}>
                <View pointerEvents="none" style={[styles.actionButtonShadow, styles.actionButtonShadowPrimary]} />
                <HapticPressable
                  onPress={openDefaultPaywall}
                  disabled={subscriptionLoading}
                  style={({ pressed }) => [
                    styles.actionButtonFace,
                    styles.saveButton,
                    { backgroundColor: BRAND_GREEN },
                    pressed && !subscriptionLoading && styles.actionButtonPressed,
                    subscriptionLoading && styles.actionButtonDisabled,
                  ]}
                >
                  {subscriptionLoading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.saveButtonText}>View Plans</Text>
                  )}
                </HapticPressable>
              </View>
            )}

            {isPro && (
              <View style={[styles.actionButtonWrap, { marginTop: 16 }]}>
                <View pointerEvents="none" style={[styles.actionButtonShadow, styles.actionButtonShadowPrimary]} />
                <HapticPressable
                  onPress={openCustomerCenter}
                  disabled={subscriptionLoading}
                  style={({ pressed }) => [
                    styles.actionButtonFace,
                    styles.saveButton,
                    { backgroundColor: BRAND_GREEN },
                    pressed && !subscriptionLoading && styles.actionButtonPressed,
                    subscriptionLoading && styles.actionButtonDisabled,
                  ]}
                >
                  {subscriptionLoading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.saveButtonText}>Manage Subscription</Text>
                  )}
                </HapticPressable>
              </View>
            )}

            <View style={[styles.actionButtonWrap, { marginTop: 12 }]}>
              <View pointerEvents="none" style={[styles.actionButtonShadow, styles.actionButtonShadowMuted]} />
              <HapticPressable
                onPress={restorePurchases}
                disabled={subscriptionLoading}
                style={({ pressed }) => [
                  styles.actionButtonFace,
                  styles.restoreButton,
                  pressed && !subscriptionLoading && styles.actionButtonPressed,
                  subscriptionLoading && styles.actionButtonDisabled,
                ]}
              >
                <Text style={styles.saveButtonText}>Restore Purchases</Text>
              </HapticPressable>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Session</Text>
          <View style={styles.actionButtonWrap}>
            <View pointerEvents="none" style={[styles.actionButtonShadow, styles.actionButtonShadowPrimary]} />
            <HapticPressable
              onPress={handleSaveChanges}
              disabled={loading}
              style={({ pressed }) => [
                styles.actionButtonFace,
                styles.saveButton,
                { backgroundColor: BRAND_GREEN },
                pressed && !loading && styles.actionButtonPressed,
                loading && styles.actionButtonDisabled,
              ]}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.saveButtonText}>Save Changes</Text>
              )}
            </HapticPressable>
          </View>
          <View style={styles.actionButtonWrap}>
            <View pointerEvents="none" style={[styles.actionButtonShadow, styles.actionButtonShadowDanger]} />
            <HapticPressable
              onPress={handleLogout}
              style={({ pressed }) => [
                styles.actionButtonFace,
                styles.logoutButton,
                pressed && styles.actionButtonPressed,
              ]}
            >
              <Text style={styles.logoutButtonText}>Log Out</Text>
            </HapticPressable>
          </View>
        </View>
      </ScrollView>

      <TimePickerSheet
        visible={showTimeModal}
        title="Daily reminder time"
        subtitle="Choose when your summary reminder arrives"
        hour24={notificationHour}
        minute={notificationMinute}
        accentColor={theme.accent}
        onCancel={() => setShowTimeModal(false)}
        onConfirm={handleTimeUpdate}
      />

      <TimePickerSheet
        visible={showGoalTimeModal}
        title={selectedGoalForTime ? `Reminder for ${selectedGoalForTime.name}` : 'Goal reminder time'}
        subtitle="Pick a time for this goal"
        hour24={goalTimeHour}
        minute={goalTimeMinute}
        accentColor={theme.accent}
        onCancel={() => {
          setShowGoalTimeModal(false);
          setSelectedGoalForTime(null);
        }}
        onConfirm={handleGoalTimeUpdate}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg, paddingHorizontal: 16 },
  loadingWrap: {
    flex: 1,
    backgroundColor: theme.bg,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTopSpacer: {
    height: 65,
  },
  headerWrapper: {
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: 24,
    borderWidth: 0,
    borderColor: '#d9e6f4',
    ...cpShadow({ color: '#4c6782', offset: { width: 0, height: 6 }, opacity: 0.16, radius: 0, elevation: 3 }),
    marginTop: 8,
    marginBottom: 12,
  },
  headerRow: { 
    flexDirection: "row", 
    alignItems: "center", 
    justifyContent: "space-between", 
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 10,
  },
  headerBtn: {
    width: 42,
    height: 42,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: '#e7edf5',
    ...cpShadow({ color: '#c3cfdb', offset: { width: 0, height: 4 }, opacity: 1, radius: 0, elevation: 1 }),
  },
  headerBtnPlaceholder: {
    width: 42,
    height: 42,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "900",
    color: theme.text,
    flexShrink: 1,
    fontFamily: 'CeraRoundProDEMO-Black',
  },
  unsavedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
  },
  unsavedBannerText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 17,
    fontFamily: 'CeraRoundProDEMO-Black',
  },

  content: { paddingBottom: 52 },

  section: { marginBottom: 18 },
  sectionTitle: { fontSize: 12, fontWeight: "900", color: '#000000', marginBottom: 8, textTransform: "uppercase", letterSpacing: 1, fontFamily: 'CeraRoundProDEMO-Black' },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 16,
    ...cpShadow({ color: '#cdcdcd', offset: { width: 0, height: 6 }, opacity: 1, radius: 0, elevation: 2 }),
  },
  label: { fontSize: 13, fontWeight: "900", color: theme.text2, marginBottom: 8, fontFamily: 'CeraRoundProDEMO-Black' },
  labelNoMargin: { fontSize: 13, fontWeight: "900", color: theme.text2, fontFamily: 'CeraRoundProDEMO-Black' },
  optionButtonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  optionButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    flexShrink: 1,
    minWidth: 90,
    alignItems: 'center',
  },
  inputTopGap: { marginTop: 14 },
  input: {
    backgroundColor: '#f7fafc',
    borderWidth: 1.5,
    borderColor: '#d9e6f4',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: theme.text,
    fontWeight: "700",
    fontFamily: 'CeraRoundProDEMO-Black',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
  },
  switchTextWrap: {
    flex: 1,
    paddingRight: 8,
  },
  switchHint: {
    marginTop: 4,
    fontSize: 12,
    color: '#A0A4AA',
    fontWeight: '700',
    lineHeight: 17,
    fontFamily: 'CeraRoundProDEMO-Black',
  },
  divider: {
    height: 1,
    backgroundColor: '#eef2f6',
    marginVertical: 16,
  },
  subsectionLabel: {
    fontSize: 13,
    fontWeight: '900',
    color: theme.text2,
    fontFamily: 'CeraRoundProDEMO-Black',
  },
  subsectionHint: {
    marginTop: 4,
    marginBottom: 10,
    fontSize: 12,
    fontWeight: '700',
    color: '#94a3b8',
    lineHeight: 17,
    fontFamily: 'CeraRoundProDEMO-Black',
  },
  segmentedWrap: {
    marginTop: 4,
  },
  settingRowButton: {
    marginTop: 12,
    padding: 12,
    borderRadius: 16,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e8eef4',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  settingRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  settingIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingRowText: {
    flex: 1,
  },
  settingRowTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: theme.text2,
    fontFamily: 'CeraRoundProDEMO-Black',
  },
  settingRowHint: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: '700',
    color: '#94a3b8',
    fontFamily: 'CeraRoundProDEMO-Black',
  },
  timeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  timeChipText: {
    fontSize: 14,
    fontWeight: '900',
    fontFamily: 'CeraRoundProDEMO-Black',
  },
  emptyGoalsHint: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '700',
    color: '#94a3b8',
    fontFamily: 'CeraRoundProDEMO-Black',
  },
  goalReminderCard: {
    marginTop: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e8eef4',
    backgroundColor: '#fbfdff',
    padding: 12,
  },
  goalReminderTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  goalReminderInfo: {
    flex: 1,
    paddingRight: 8,
  },
  goalTimeRow: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#eef2f6',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  goalTimeLabel: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
    fontFamily: 'CeraRoundProDEMO-Black',
  },
  goalTimeValue: {
    fontSize: 13,
    fontWeight: '900',
    fontFamily: 'CeraRoundProDEMO-Black',
  },
  expandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  customMessagePanel: {
    marginTop: 12,
    padding: 12,
    borderRadius: 16,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e8eef4',
  },
  customMessageLabel: {
    fontSize: 12,
    fontWeight: '900',
    color: theme.text2,
    marginBottom: 8,
    fontFamily: 'CeraRoundProDEMO-Black',
  },
  templateRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  templateExample: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: '700',
    color: '#94a3b8',
    fontFamily: 'CeraRoundProDEMO-Black',
  },
  templateExampleActive: {
    color: 'rgba(255,255,255,0.88)',
  },
  inlineSaveButton: {
    marginTop: 12,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inlineSaveButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
    fontFamily: 'CeraRoundProDEMO-Black',
  },
  preferenceCards: {
    gap: 8,
  },
  preferenceCard: {
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    borderRadius: 16,
    padding: 12,
    backgroundColor: '#fbfdff',
  },
  preferenceCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  preferenceCardTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: theme.text2,
    fontFamily: 'CeraRoundProDEMO-Black',
  },
  preferenceCardPreview: {
    marginTop: 6,
    fontSize: 18,
    fontWeight: '900',
    color: theme.text,
    fontFamily: 'CeraRoundProDEMO-Black',
  },
  preferenceCardMeta: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: '700',
    color: '#94a3b8',
    fontFamily: 'CeraRoundProDEMO-Black',
  },
  usageCard: {
    marginTop: 12,
    backgroundColor: '#f6fafd',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  usageTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: theme.text,
    marginBottom: 6,
    fontFamily: 'CeraRoundProDEMO-Black',
  },
  usageRow: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6b7987',
    marginBottom: 4,
    fontFamily: 'CeraRoundProDEMO-Black',
  },
  actionButtonWrap: {
    marginBottom: 12,
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
  actionButtonShadowPrimary: {
    backgroundColor: '#4aa93a',
  },
  actionButtonShadowDanger: {
    backgroundColor: '#c63b3b',
  },
  actionButtonShadowMuted: {
    backgroundColor: '#475569',
  },
  actionButtonFace: {
    height: 52,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  actionButtonPressed: {
    transform: [{ translateY: 4 }],
  },
  actionButtonDisabled: {
    opacity: 0.85,
  },
  saveButton: {
    height: 52,
    alignItems: "center",
    justifyContent: 'center',
  },
  saveButtonText: { color: "#fff", fontSize: 16, fontWeight: "800", fontFamily: 'CeraRoundProDEMO-Black' },

  restoreButton: {
    height: 52,
    alignItems: "center",
    justifyContent: 'center',
    backgroundColor: '#64748b',
  },

  logoutButton: {
    height: 52,
    alignItems: "center",
    justifyContent: 'center',
    backgroundColor: '#e14f4f',
  },
  logoutButtonText: { color: "#fff", fontSize: 16, fontWeight: "800", fontFamily: 'CeraRoundProDEMO-Black' },

  // Time Picker Styles
  timePickerButton: {
    marginTop: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    paddingTop: 14,
  },
  timePickerLabel: {
    fontSize: 13,
    fontWeight: '900',
    color: theme.text2,
    fontFamily: 'CeraRoundProDEMO-Black',
  },
  timeDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#f7fafc',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  timeText: {
    fontSize: 16,
    fontWeight: '900',
    fontFamily: 'CeraRoundProDEMO-Black',
  },
  goalNotificationsButton: {
    marginTop: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    paddingTop: 14,
  },
  goalNotificationsButtonText: {
    fontSize: 13,
    fontWeight: '900',
    fontFamily: 'CeraRoundProDEMO-Black',
  },

  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 24,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: theme.text,
    fontFamily: 'CeraRoundProDEMO-Black',
  },
  timePickerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 20,
    height: 200,
  },
  timeColumn: {
    flex: 1,
    alignItems: 'center',
  },
  timeLabel: {
    fontSize: 12,
    fontWeight: '900',
    color: theme.text2,
    marginBottom: 8,
    textTransform: 'uppercase',
    fontFamily: 'CeraRoundProDEMO-Black',
  },
  hourScroll: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: '#f7fafc',
    paddingVertical: 8,
  },
  minuteScroll: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: '#f7fafc',
    paddingVertical: 8,
  },
  hourOption: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  minuteOption: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  selectedHour: {
    borderRadius: 8,
  },
  selectedMinute: {
    borderRadius: 8,
  },
  hourOptionText: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.text2,
    fontFamily: 'CeraRoundProDEMO-Black',
  },
  minuteOptionText: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.text2,
    fontFamily: 'CeraRoundProDEMO-Black',
  },
  selectedHourText: {
    color: '#fff',
    fontWeight: '900',
    fontFamily: 'CeraRoundProDEMO-Black',
  },
  selectedMinuteText: {
    color: '#fff',
    fontWeight: '900',
    fontFamily: 'CeraRoundProDEMO-Black',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    backgroundColor: '#f0f0f0',
  },
  confirmButton: {
    backgroundColor: '#ffffff00',
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '800',
    color: theme.text,
    fontFamily: 'CeraRoundProDEMO-Black',
  },
  confirmButtonText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#fff',
    fontFamily: 'CeraRoundProDEMO-Black',
  },

  // Mode Selection Styles
  modeSelectionWrap: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
    marginBottom: 8,
  },
  modeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  modeHalf: {
    flex: 1,
  },
  modeButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: '#f7fafc',
    borderWidth: 1,
    borderColor: '#d9e6f4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeButtonFullWidth: {
    width: '100%',
  },
  modeButtonActive: {
  },
  modeButtonText: {
    fontSize: 13,
    fontWeight: '800',
    color: theme.text2,
  },
  modeButtonTextActive: {
    color: '#ffffff',
  },
  sectionNote: {
    marginTop: 10,
    color: '#6b7280',
    fontSize: 13,
  },
  rowSpace: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  templateButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d2dae2',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f7fafc',
  },
  templateButtonActive: {
  },
  templateText: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.text2,
  },
  templateTextActive: {
    color: '#fff',
  },
  saveTemplateButton: {
    marginTop: 12,
    borderRadius: 12,
  },
  goalCard: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 16,
    padding: 12,
    marginBottom: 12,
    backgroundColor: '#fbfdff',
  },
  goalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  goalName: {
    fontWeight: '800',
    color: theme.text,
  },
  goalHint: {
    color: '#6b7280',
    fontSize: 12,
    marginTop: 4,
  },
  goalControls: {
    alignItems: 'flex-end',
  },
  timeChip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#eef6ff',
    marginBottom: 8,
  },
  timeChipText: {
    fontSize: 13,
    fontWeight: '800',
  },
  editMessageButton: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: '#f7fafc',
    borderWidth: 1,
    borderColor: '#d2dae2',
    marginBottom: 8,
  },
  editMessageText: {
    fontSize: 12,
    fontWeight: '700',
  },
  goalMessageEditor: {
    marginTop: 10,
  },
  colorOptionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 12,
  },
  colorDot: {
    width: 46,
    height: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorDotSelected: {
    borderWidth: 2,
    borderColor: '#fff',
    ...cpShadow({ color: '#000', offset: { width: 0, height: 2 }, opacity: 0.08, radius: 6, elevation: 2 }),
  },
});