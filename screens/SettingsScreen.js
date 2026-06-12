// screens/SettingsScreen.js
import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Pressable, TextInput, ScrollView, Alert, ActivityIndicator, Switch, Modal } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { updateEmail, updatePassword, signOut } from "firebase/auth";
import { doc, getDoc, updateDoc, collection, query, where, getDocs, onSnapshot } from "firebase/firestore";
import { auth, db } from "../firebaseConfig";
import theme, { useTheme } from "../theme";
import { cpShadow } from "../utils/shadows";
import {
  sendGoalReminderNotification,
  toggleNotificationsGlobally,
  getNotificationSettings,
  updateGlobalNotificationTime,
  requestNotificationPermissions,
  initializeNotifications,
  getNotificationMode,
  setNotificationMode,
  getGoalNotificationSettings,
  saveGoalNotificationSettings,
  cancelGoalNotification,
  removeGoalNotificationSetting,
  saveNotificationSettings,
} from "../utils/notifications";
import { useTutorial } from "../contexts/TutorialContext";
import { getDateFormatSync, setDateFormat, FORMATS, getWeekStartSync, setWeekStart, WEEK_START_OPTIONS, getShowLast6DaysSync, setShowLast6Days } from '../utils/dateFormat';

export default function SettingsScreen({ navigation }) {
  const { replayTutorial } = useTutorial();
  const { theme, setAccent } = useTheme();
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
  const [messageEditorForGoal, setMessageEditorForGoal] = useState(null);
  const [messageEditorValue, setMessageEditorValue] = useState('');
  const [messageEditorPosition, setMessageEditorPosition] = useState('prefix');
  const [accentColor, setAccentColor] = useState(theme.accent);

  // Fetch current user info and notification settings when screen loads
  useEffect(() => {
    const fetchUserData = async () => {
      if (auth.currentUser) {
        setEmail(auth.currentUser.email || "");
        try {
          const userDoc = await getDoc(doc(db, "users", auth.currentUser.uid));
          if (userDoc.exists()) {
            setUsername(userDoc.data().username || "");
            setPrivateAccount(!!userDoc.data().privateAccount);
            setAccentColor(userDoc.data().accentColor || theme.accent);
          }

          // Fetch notification settings
          const settings = await getNotificationSettings();
          setNotificationsEnabled(settings.notificationsEnabled);
          setNotificationModeState(settings.notificationMode || "global");
          setDailyReminderEnabled(settings.dailyReminderEnabled);
          setNotificationHour(settings.globalTime);
          setNotificationMinute(settings.globalTimeMinute);
          setPerGoalSettings(settings.perGoalNotifications || {});
          setGlobalCustomText(settings.globalCustomText || '');
          setGlobalCustomPosition(settings.globalCustomPosition || 'prefix');
        } catch (error) {
          console.error("Error fetching user data:", error);
        }
      }
      setFetching(false);
    };
    fetchUserData();

    // Subscribe to user's goals and keep in state so settings can show per-goal toggles
    let unsubGoals = null;
    if (auth.currentUser) {
      const goalsRef = collection(db, 'users', auth.currentUser.uid, 'goals');
      unsubGoals = onSnapshot(goalsRef, (snap) => {
        const arr = [];
        snap.forEach((doc) => {
          arr.push({ id: doc.id, ...doc.data() });
        });
        setGoals(arr);
        // If any goals were removed, ensure their notification settings are cleared
        // Compare existing perGoalNotifications and removed ids in snapshot
      });
    }

    return () => {
      if (unsubGoals) unsubGoals();
    };
  }, []);
  const handlePrivateToggle = (value) => {
    setPrivateAccount(value);
  };

  const handleSaveGlobalMessageTemplate = async () => {
    try {
      const settings = await getNotificationSettings();
      settings.globalCustomText = globalCustomText;
      settings.globalCustomPosition = globalCustomPosition;
      const ok = await saveNotificationSettings(settings);
      if (!ok) throw new Error('save failed');
      Alert.alert('Saved', 'Global notification text updated.');
    } catch (error) {
      console.error('Error saving global message template:', error);
      Alert.alert('Error', 'Could not save global notification text.');
    }
  };

  const handleStartEditGoalMessage = async (goal) => {
    try {
      const current = await getGoalNotificationSettings(goal.id);
      setMessageEditorValue(current.customText || '');
      setMessageEditorPosition(current.customPosition || 'prefix');
      setMessageEditorForGoal(goal.id);
    } catch (error) {
      console.error('Error loading goal message settings:', error);
      setMessageEditorValue('');
      setMessageEditorPosition('prefix');
      setMessageEditorForGoal(goal.id);
    }
  };

  const handleSaveGoalMessage = async (goalId) => {
    try {
      const goal = goals.find((g) => g.id === goalId);
      const current = await getGoalNotificationSettings(goalId);
      const next = {
        ...current,
        customText: messageEditorValue,
        customPosition: messageEditorPosition,
        goalName: goal?.name || current.goalName || '',
      };
      const ok = await saveGoalNotificationSettings(goalId, next);
      if (!ok) throw new Error('save failed');
      setPerGoalSettings((prev) => ({ ...prev, [goalId]: next }));
      setMessageEditorForGoal(null);
      setMessageEditorValue('');
      Alert.alert('Saved', 'Goal notification message updated.');
    } catch (error) {
      console.error('Error saving goal message:', error);
      Alert.alert('Error', 'Could not save goal notification message.');
    }
  };

  const handleAccentColorSelect = async (nextColor) => {
    try {
      setAccentColor(nextColor);
      setAccent(nextColor);
      if (!auth.currentUser) return;
      const userRef = doc(db, 'users', auth.currentUser.uid);
      await updateDoc(userRef, { accentColor: nextColor });
    } catch (error) {
      console.error('Error saving accent color:', error);
      Alert.alert('Error', 'Could not save accent color.');
    }
  };

  const handleNotificationModeChange = async (mode) => {
    setNotificationModeState(mode);
    const success = await setNotificationMode(mode);
    if (!success) {
      setNotificationModeState(notificationMode);
      Alert.alert("Error", "Failed to update notification mode");
    }
  };

  const notificationModeExplanation = (mode) => {
    if (mode === 'global') return 'One daily reminder will be sent for all your goals at the chosen time.';
    if (mode === 'individual') return 'Manage reminders individually for each goal below.';
    return 'You will receive a daily reminder for all goals and individual reminders for selected goals.';
  };

  const handleNotificationsToggle = async (value) => {
    setNotificationsEnabled(value);
    const success = await toggleNotificationsGlobally(value);
    if (!success) {
      setNotificationsEnabled(!value);
      Alert.alert("Error", "Failed to update notification settings");
    }
  };

  const handleDailyReminderToggle = async (value) => {
    setDailyReminderEnabled(value);
    try {
      const settings = await getNotificationSettings();
      settings.dailyReminderEnabled = value;
      const saved = await saveNotificationSettings(settings);
      if (!saved) throw new Error('save failed');
      const updated = await updateGlobalNotificationTime(notificationHour, notificationMinute);
      if (!updated) throw new Error('update failed');
    } catch (error) {
      console.error('Error toggling daily reminder:', error);
      setDailyReminderEnabled(!value);
      Alert.alert("Error", "Failed to update daily reminder settings");
    }
  };

  const handleTimeUpdate = async (hour, minute) => {
    setNotificationHour(hour);
    setNotificationMinute(minute);
    setShowTimeModal(false);
    
    const success = await updateGlobalNotificationTime(hour, minute);
    if (!success) {
      Alert.alert("Error", "Failed to update notification time");
    }
  };

  const handleGoalToggle = async (goal) => {
    try {
      const current = await getGoalNotificationSettings(goal.id);
      const next = { ...current, enabled: !current.enabled, goalName: goal.name };
      const ok = await saveGoalNotificationSettings(goal.id, next);
      if (!ok) Alert.alert('Error', 'Failed to update goal notification');
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Failed to update goal notification');
    }
  };

  const handleGoalTimeUpdate = async (hour, minute) => {
    if (!selectedGoalForTime) return;
    const goal = selectedGoalForTime;
    try {
      const current = await getGoalNotificationSettings(goal.id);
      const next = { ...current, enabled: true, time: hour, timeMinute: minute, goalName: goal.name };
      const ok = await saveGoalNotificationSettings(goal.id, next);
      if (!ok) Alert.alert('Error', 'Failed to update goal notification time');
      else {
        setPerGoalSettings(prev => ({ ...prev, [goal.id]: next }));
      }
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Failed to update goal notification time');
    } finally {
      setShowGoalTimeModal(false);
      setSelectedGoalForTime(null);
    }
  };

  const formatTime12 = (hour, minute) => {
    const h = hour % 12 === 0 ? 12 : hour % 12;
    const ampm = hour >= 12 ? 'PM' : 'AM';
    return `${String(h).padStart(2,'0')}:${String(minute).padStart(2,'0')} ${ampm}`;
  };

  // Clean up goal settings when a goal is deleted
  useEffect(() => {
    if (!auth.currentUser) return;
    const goalsRef = collection(db, 'users', auth.currentUser.uid, 'goals');
    const unsub = onSnapshot(goalsRef, async (snap) => {
      const existingIds = new Set();
      snap.forEach(d => existingIds.add(d.id));
      // load notification settings and remove any per-goal entries for missing goals
      const settings = await getNotificationSettings();
      const per = settings.perGoalNotifications || {};
      const keys = Object.keys(per);
      for (const k of keys) {
        if (!existingIds.has(k)) {
          await removeGoalNotificationSetting(k);
        }
      }
    });
    return () => unsub();
  }, []);

  const handleDateFormatChange = async (next) => {
    setDateFormatState(next);
    const ok = await setDateFormat(next);
    if (!ok) Alert.alert('Error', 'Failed to save date format');
  };

  const handleWeekStartChange = async (next) => {
    setWeekStartState(next);
    const ok = await setWeekStart(next);
    if (!ok) Alert.alert('Error', 'Failed to save week start preference');
  };

  const handleShowLast6DaysToggle = async (value) => {
    setShowLast6DaysState(value);
    const ok = await setShowLast6Days(value);
    if (!ok) {
      setShowLast6DaysState(!value);
      Alert.alert('Error', 'Failed to save weekly streak history preference');
    }
  };

  

  const handleSaveChanges = async () => {
    if (!auth.currentUser) return;
    // Prevent empty username or email fields
    if (!username.trim() || !email.trim()) {
      Alert.alert("Error", "Username and Email cannot be empty.");
      return;
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
          return; // Stop the save process completely
        }
        // If we get here, the username is available! Save it.
        await updateDoc(userRef, { username: username });
        changesMade = true;
      }
      // --- 2. Update Email in Firebase Auth ---
      if (email !== auth.currentUser.email) {
        await updateEmail(auth.currentUser, email);
        changesMade = true;
      }
      // --- 3. Update Password in Firebase Auth ---
      if (newPassword.length > 0) {
        if (newPassword.length < 6) {
          Alert.alert("Weak Password", "Password must be at least 6 characters.");
          setLoading(false);
          return;
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
      if (changesMade) {
        Alert.alert("Success!", "Your profile has been updated.");
      } else {
        Alert.alert("No Changes", "Everything is already up to date.");
      }

    } catch (error) {
      console.error("Update Error:", error);
      // Firebase requires a recent login to change sensitive info like email/password
      if (error.code === 'auth/requires-recent-login') {
        Alert.alert(
          "Authentication Required", 
          "For your security, please log out and log back in to change your email or password."
        );
      } else {
        Alert.alert("Error", error.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      // Navigation is handled automatically by App.js state changing to null
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
          <TouchableOpacity style={styles.headerBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="chevron-back" size={26} color={theme.accent} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Settings</Text>
          <View style={styles.headerBtnPlaceholder} />
        </View>
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 120 }]} showsVerticalScrollIndicator={false}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Help</Text>
          <Text style={styles.switchHint}>
            Walk through the onboarding guide again from the beginning.
          </Text>
          <View style={[styles.actionButtonWrap, { marginTop: 12 }]}>
            <View pointerEvents="none" style={[styles.actionButtonShadow, styles.actionButtonShadowPrimary]} />
            <Pressable
              onPress={async () => {
                await replayTutorial();
                navigation.goBack();
              }}
              style={({ pressed }) => [
                styles.actionButtonFace,
                styles.saveButton,
                pressed && styles.actionButtonPressed,
              ]}
            >
              <Text style={styles.saveButtonText}>Replay Tutorial</Text>
            </Pressable>
          </View>
        </View>

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
                {/* Notification Mode - placed above enable toggle */}
                <View style={[{ marginBottom: 10 }] }>
                  <Text style={styles.labelNoMargin}>Notification Mode</Text>
                  <Text style={styles.switchHint}>Choose how you want to receive notifications.</Text>
                </View>

                <View style={{ flexDirection: 'column' }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                    <Pressable 
                      onPress={() => handleNotificationModeChange("global")}
                      style={[
                        styles.modeButton,
                        notificationMode === "global" && { backgroundColor: theme.accent, borderColor: theme.accent },
                        { flex: 1 }
                      ]}
                    >
                      <Text style={[
                        styles.modeButtonText,
                        notificationMode === "global" && styles.modeButtonTextActive
                      ]}>
                        All Goals
                      </Text>
                    </Pressable>

                    <Pressable 
                      onPress={() => handleNotificationModeChange("individual")}
                      style={[
                        styles.modeButton,
                        notificationMode === "individual" && { backgroundColor: theme.accent, borderColor: theme.accent },
                        { flex: 1 }
                      ]}
                    >
                      <Text style={[
                        styles.modeButtonText,
                        notificationMode === "individual" && styles.modeButtonTextActive
                      ]}>
                        Individual Goals
                      </Text>
                    </Pressable>
                  </View>

                  <View style={{ marginTop: 8, width: '100%' }}>
                    <Pressable
                      onPress={() => handleNotificationModeChange('both')}
                      style={[
                        styles.modeButton,
                        notificationMode === 'both' && { backgroundColor: theme.accent, borderColor: theme.accent },
                        styles.modeButtonFullWidth,
                      ]}
                    >
                      <Text style={[
                        styles.modeButtonText,
                        notificationMode === 'both' && styles.modeButtonTextActive,
                      ]}>
                        Both
                      </Text>
                    </Pressable>
                  </View>

                  <Text style={{ marginTop: 8, color: '#6b7280', fontSize: 13 }}>
                    {notificationModeExplanation(notificationMode)}
                  </Text>

                  {/* Global custom message template */}
                  <View style={{ marginTop: 10 }}>
                    <Text style={styles.labelNoMargin}>Global Notification Text</Text>
                    <Text style={{ color: '#6b7280', fontSize: 12, marginBottom: 6 }}>Optional text for all notifications. Use the goal name position selector below.</Text>
                    <TextInput
                      style={[styles.input, { marginTop: 6 }]}
                      value={globalCustomText}
                      onChangeText={setGlobalCustomText}
                      placeholder="e.g. Don't forget to work on your goal"
                    />
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                      <Pressable onPress={() => setGlobalCustomPosition('prefix')} style={[{ padding: 8, borderRadius: 8, borderWidth: 1 }, globalCustomPosition === 'prefix' ? { backgroundColor: theme.accent, borderColor: theme.accent } : { borderColor: '#e2e8f0' }]}> 
                        <Text style={{ color: globalCustomPosition === 'prefix' ? '#fff' : theme.text }}>Goal - Custom</Text>
                      </Pressable>
                      <Pressable onPress={() => setGlobalCustomPosition('suffix')} style={[{ padding: 8, borderRadius: 8, borderWidth: 1 }, globalCustomPosition === 'suffix' ? { backgroundColor: theme.accent, borderColor: theme.accent } : { borderColor: '#e2e8f0' }]}> 
                        <Text style={{ color: globalCustomPosition === 'suffix' ? '#fff' : theme.text }}>Custom - Goal</Text>
                      </Pressable>
                    </View>

                    <View style={{ marginTop: 8 }}>
                      <Pressable onPress={async () => {
                        const settings = await getNotificationSettings();
                        settings.globalCustomText = globalCustomText;
                        settings.globalCustomPosition = globalCustomPosition;
                        await saveNotificationSettings(settings);
                        Alert.alert('Saved', 'Global notification text updated.');
                      }} style={[styles.actionButtonFace, { backgroundColor: theme.accent, marginTop: 8, borderRadius: 12 }]}>
                        <Text style={{ color: '#fff', fontWeight: '800' }}>Save Global Text</Text>
                      </Pressable>
                    </View>
                  </View>

                </View>

                {/* Enable toggle moved below mode and template */}
                <View style={[styles.switchRow, { marginTop: 14 }]}>
                  <View style={styles.switchTextWrap}>
                    <Text style={styles.labelNoMargin}>Enable Notifications</Text>
                    <Text style={styles.switchHint}>Receive reminders about your goals.</Text>
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



                    <View style={[styles.switchRow, { marginTop: 14 }]}> 
                      <View style={styles.switchTextWrap}>
                        <Text style={styles.labelNoMargin}>Daily Reminder</Text>
                        <Text style={styles.switchHint}>Get a daily reminder at your chosen time.</Text>
                      </View>
                      <Switch
                        value={dailyReminderEnabled}
                        onValueChange={handleDailyReminderToggle}
                        trackColor={{ true: theme.accent, false: '#d2dae2' }}
                        thumbColor={dailyReminderEnabled ? '#ffffff' : '#f4f3f4'}
                      />
                    </View>

                    {dailyReminderEnabled && (notificationMode === "global" || notificationMode === 'both') && (
                      <Pressable onPress={() => setShowTimeModal(true)} style={styles.timePickerButton}>
                        <Text style={styles.timePickerLabel}>Daily reminder time</Text>
                        <View style={styles.timeDisplay}>
                          <Text style={[styles.timeText, { color: theme.accent }]}> 
                            {String(notificationHour).padStart(2, '0')}:{String(notificationMinute).padStart(2, '0')}
                          </Text>
                          <Ionicons name="chevron-forward" size={18} color={theme.accent} />
                        </View>
                      </Pressable>
                    )}
                    
                    {/* Per-goal list for individual or both modes */}
                    {(notificationMode === 'individual' || notificationMode === 'both') && (
                      <View style={{ marginTop: 12 }}>
                        {goals.map((g) => (
                          <View key={g.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 }}>
                            <View style={{ flex: 1, paddingRight: 12 }}>
                              <Text style={{ fontWeight: '800' }}>{g.name}</Text>
                              <Text style={{ color: '#6b7280', fontSize: 12 }}>{g.category || ''}</Text>
                            </View>
                            <View style={{ alignItems: 'flex-end' }}>
                              <Pressable onPress={async () => {
                                  try {
                                    const s = await getGoalNotificationSettings(g.id);
                                    setGoalTimeHour(s.time ?? 9);
                                    setGoalTimeMinute(s.timeMinute ?? 0);
                                  } catch (e) {
                                    setGoalTimeHour(9);
                                    setGoalTimeMinute(0);
                                  }
                                  setSelectedGoalForTime(g);
                                  setShowGoalTimeModal(true);
                                }} style={{ marginBottom: 6 }}>
                                <Text style={{ color: theme.accent }}>
                                  {formatTime12((perGoalSettings?.[g.id]?.time) ?? 9, (perGoalSettings?.[g.id]?.timeMinute) ?? 0)}
                                </Text>
                              </Pressable>
                              <Switch
                                value={!!(perGoalSettings?.[g.id]?.enabled)}
                                onValueChange={async () => {
                                  const s = perGoalSettings?.[g.id] || { enabled: false, time: 9, timeMinute: 0 };
                                  const next = { ...s, enabled: !s.enabled, goalName: g.name };
                                  const ok = await saveGoalNotificationSettings(g.id, next);
                                  if (ok) setPerGoalSettings(prev => ({ ...prev, [g.id]: next }));
                                  else Alert.alert('Error', 'Failed to update goal notification');
                                }}
                                trackColor={{ true: theme.accent, false: '#d2dae2' }}
                                thumbColor={'#fff'}
                              />
                            </View>
                          </View>
                        ))}
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
                { label: 'Green', value: '#28b900' },
                { label: 'Blue', value: '#3b82f6' },
                { label: 'Pink', value: '#ec4899' },
                { label: 'Red', value: '#ef4444' },
                { label: 'Orange', value: '#f97316' },
              ].map((option) => (
                <Pressable
                  key={option.value}
                  onPress={() => handleAccentColorSelect(option.value)}
                  style={[styles.colorDot, { backgroundColor: option.value }, accentColor === option.value && styles.colorDotSelected]}
                >
                  {accentColor === option.value && <Ionicons name="checkmark" size={16} color="#fff" />}
                </Pressable>
              ))}
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Preferences</Text>
          <View style={styles.card}>
            <Text style={styles.label}>Date format</Text>
            <View style={styles.optionButtonRow}>
              {FORMATS.map((fmt) => (
                <Pressable
                  key={fmt}
                  onPress={() => handleDateFormatChange(fmt)}
                  style={[
                    styles.optionButton,
                    dateFormat === fmt ? { backgroundColor: theme.accent, borderColor: theme.accent } : { borderColor: '#e2e8f0' }
                  ]}
                >
                  <Text style={{ color: dateFormat === fmt ? '#fff' : theme.text, fontWeight: '700' }}>{fmt}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={[styles.label, { marginTop: 20 }]}>Week starts on</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              {WEEK_START_OPTIONS.map((option) => (
                <Pressable
                  key={option.value}
                  onPress={() => handleWeekStartChange(option.value)}
                  style={[
                    { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1 },
                    weekStart === option.value ? { backgroundColor: theme.accent, borderColor: theme.accent } : { borderColor: '#e2e8f0' }
                  ]}
                >
                  <Text style={{ color: weekStart === option.value ? '#fff' : theme.text, fontWeight: '700' }}>{option.label}</Text>
                </Pressable>
              ))}
            </View>

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 20 }}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={styles.label}>Show last 6 days before today</Text>
                <Text style={{ color: '#7d8a97', marginTop: 4, fontSize: 12 }}>Use a rolling 7-day history window in goal details.</Text>
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
          <Text style={styles.sectionTitle}>Session</Text>
          <View style={styles.actionButtonWrap}>
            <View pointerEvents="none" style={[styles.actionButtonShadow, styles.actionButtonShadowPrimary, { backgroundColor: '#28b900' }]} />
            <Pressable
              onPress={handleSaveChanges}
              disabled={loading}
              style={({ pressed }) => [
                styles.actionButtonFace,
                styles.saveButton,
                { backgroundColor: '#28b900' },
                pressed && !loading && styles.actionButtonPressed,
                loading && styles.actionButtonDisabled,
              ]}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.saveButtonText}>Save Changes</Text>
              )}
            </Pressable>
          </View>
          <View style={styles.actionButtonWrap}>
            <View pointerEvents="none" style={[styles.actionButtonShadow, styles.actionButtonShadowDanger, { backgroundColor: '#ef4444' }]} />
            <Pressable
              onPress={handleLogout}
              style={({ pressed }) => [
                styles.actionButtonFace,
                styles.logoutButton,
                { backgroundColor: '#ef4444' },
                pressed && styles.actionButtonPressed,
              ]}
            >
              <Text style={styles.logoutButtonText}>Log Out</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>

      {/* Time Picker Modal */}
      <Modal
        visible={showTimeModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowTimeModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Set Daily Reminder Time</Text>
              <Pressable onPress={() => setShowTimeModal(false)}>
                <Ionicons name="close" size={28} color={theme.text} />
              </Pressable>
            </View>

            <View style={styles.timePickerContainer}>
              <View style={styles.timeColumn}>
                <Text style={styles.timeLabel}>Hour</Text>
                <ScrollView style={styles.hourScroll} scrollEventThrottle={16}>
                  {Array.from({ length: 24 }, (_, i) => (
                    <Pressable
                      key={i}
                      onPress={() => setNotificationHour(i)}
                      style={[
                        styles.hourOption,
                        notificationHour === i && { backgroundColor: theme.accent, borderRadius: 8 },
                      ]}
                    >
                      <Text
                        style={[
                          styles.hourOptionText,
                          notificationHour === i && styles.selectedHourText,
                        ]}
                      >
                        {String(i).padStart(2, '0')}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>

              <View style={styles.timeColumn}>
                <Text style={styles.timeLabel}>Minute</Text>
                <ScrollView style={styles.minuteScroll} scrollEventThrottle={16}>
                  {Array.from({ length: 60 }, (_, i) => (
                    <Pressable
                      key={i}
                      onPress={() => setNotificationMinute(i)}
                      style={[
                        styles.minuteOption,
                        notificationMinute === i && { backgroundColor: theme.accent, borderRadius: 8 },
                      ]}
                    >
                      <Text
                        style={[
                          styles.minuteOptionText,
                          notificationMinute === i && styles.selectedMinuteText,
                        ]}
                      >
                        {String(i).padStart(2, '0')}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            </View>

            <View style={styles.modalButtons}>
              <Pressable
                onPress={() => setShowTimeModal(false)}
                style={[styles.modalButton, styles.cancelButton]}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => handleTimeUpdate(notificationHour, notificationMinute)}
                style={[styles.modalButton, { backgroundColor: theme.accent }]}
              >
                <Text style={styles.confirmButtonText}>Set Time</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
      {/* Per-goal Time Picker Modal */}
      <Modal
        visible={showGoalTimeModal}
        transparent
        animationType="slide"
        onRequestClose={() => { setShowGoalTimeModal(false); setSelectedGoalForTime(null); }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{selectedGoalForTime ? `Set time for "${selectedGoalForTime.name}"` : 'Set Goal Time'}</Text>
              <Pressable onPress={() => { setShowGoalTimeModal(false); setSelectedGoalForTime(null); }}>
                <Ionicons name="close" size={28} color={theme.text} />
              </Pressable>
            </View>

            <View style={styles.timePickerContainer}>
              <View style={styles.timeColumn}>
                <Text style={styles.timeLabel}>Hour</Text>
                <ScrollView style={styles.hourScroll} scrollEventThrottle={16}>
                  {Array.from({ length: 24 }, (_, i) => (
                    <Pressable
                      key={i}
                      onPress={() => setGoalTimeHour(i)}
                      style={[
                        styles.hourOption,
                        goalTimeHour === i && { backgroundColor: theme.accent, borderRadius: 8 },
                      ]}
                    >
                      <Text
                        style={[
                          styles.hourOptionText,
                          goalTimeHour === i && styles.selectedHourText,
                        ]}
                      >
                        {String(i).padStart(2, '0')}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>

              <View style={styles.timeColumn}>
                <Text style={styles.timeLabel}>Minute</Text>
                <ScrollView style={styles.minuteScroll} scrollEventThrottle={16}>
                  {Array.from({ length: 60 }, (_, i) => (
                    <Pressable
                      key={i}
                      onPress={() => setGoalTimeMinute(i)}
                      style={[
                        styles.minuteOption,
                        goalTimeMinute === i && { backgroundColor: theme.accent, borderRadius: 8 },
                      ]}
                    >
                      <Text
                        style={[
                          styles.minuteOptionText,
                          goalTimeMinute === i && styles.selectedMinuteText,
                        ]}
                      >
                        {String(i).padStart(2, '0')}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            </View>

            <View style={styles.modalButtons}>
              <Pressable
                onPress={() => { setShowGoalTimeModal(false); setSelectedGoalForTime(null); }}
                style={[styles.modalButton, styles.cancelButton]}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => handleGoalTimeUpdate(goalTimeHour, goalTimeMinute)}
                style={[styles.modalButton, styles.confirmButton]}
              >
                <Text style={styles.confirmButtonText}>Set Time</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
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
    color: '#A0A4AA', // more greyed out
    fontWeight: '700',
    lineHeight: 17,
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
    backgroundColor: '#28b900',
  },
  actionButtonShadowDanger: {
    backgroundColor: '#ef4444',
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

  logoutButton: {
    height: 52,
    alignItems: "center",
    justifyContent: 'center',
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
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
});