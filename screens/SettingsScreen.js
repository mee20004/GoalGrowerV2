// screens/SettingsScreen.js
import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Pressable, TextInput, ScrollView, Alert, ActivityIndicator, Switch, Modal } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { updateEmail, updatePassword, signOut } from "firebase/auth";
import { doc, getDoc, updateDoc, collection, query, where, getDocs } from "firebase/firestore";
import { auth, db } from "../firebaseConfig";
import { theme } from "../theme";
import { 
  sendGoalReminderNotification,
  sendTestNotification,
  toggleNotificationsGlobally,
  getNotificationSettings,
  updateGlobalNotificationTime,
  requestNotificationPermissions,
  initializeNotifications,
  getNotificationMode,
  setNotificationMode,
} from "../utils/notifications";

export default function SettingsScreen({ navigation }) {
  const [username, setUsername] = useState("");
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
  const [sendingTest, setSendingTest] = useState(false);
  const [showTimeModal, setShowTimeModal] = useState(false);

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
          }

          // Fetch notification settings
          const settings = await getNotificationSettings();
          setNotificationsEnabled(settings.notificationsEnabled);
          setNotificationModeState(settings.notificationMode || "global");
          setDailyReminderEnabled(settings.dailyReminderEnabled);
          setNotificationHour(settings.globalTime);
          setNotificationMinute(settings.globalTimeMinute);
        } catch (error) {
          console.error("Error fetching user data:", error);
        }
      }
      setFetching(false);
    };
    fetchUserData();
  }, []);
  const handlePrivateToggle = (value) => {
    setPrivateAccount(value);
  };

  const handleNotificationModeChange = async (mode) => {
    setNotificationModeState(mode);
    const success = await setNotificationMode(mode);
    if (!success) {
      setNotificationModeState(notificationMode);
      Alert.alert("Error", "Failed to update notification mode");
    }
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
      
      if (!await updateGlobalNotificationTime(notificationHour, notificationMinute)) {
        setDailyReminderEnabled(!value);
        Alert.alert("Error", "Failed to update daily reminder settings");
      }
    } catch (error) {
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

  const handleSendTestNotification = async () => {
    setSendingTest(true);
    try {
      // Request permissions if needed
      const hasPermission = await requestNotificationPermissions();
      if (!hasPermission) {
        Alert.alert("Permission Required", "Notification permissions are required to send test notifications.");
      } else {
        const id = await sendTestNotification("🌱 Goal Grower Test", "This is a test notification!");
        if (id) {
          Alert.alert("Success!", "Test notification sent!");
        } else {
          Alert.alert("Error", "Failed to send test notification");
        }
      }
    } catch (error) {
      console.error("Error sending test notification:", error);
      Alert.alert("Error", "Failed to send test notification");
    } finally {
      setSendingTest(false);
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

        <View style={styles.actionButtonWrap}>
          <View pointerEvents="none" style={[styles.actionButtonShadow, styles.actionButtonShadowPrimary]} />
          <Pressable 
            onPress={handleSaveChanges}
            disabled={loading}
            style={({ pressed }) => [
              styles.actionButtonFace,
              styles.saveButton,
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

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notifications</Text>
          <View style={styles.card}>
            <View style={styles.switchRow}>
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
                    <Text style={styles.labelNoMargin}>Notification Mode</Text>
                    <Text style={styles.switchHint}>Choose how you want to receive notifications.</Text>
                  </View>
                </View>

                <View style={styles.modeSelectionWrap}>
                  <Pressable 
                    onPress={() => handleNotificationModeChange("global")}
                    style={[
                      styles.modeButton,
                      notificationMode === "global" && styles.modeButtonActive
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
                      notificationMode === "individual" && styles.modeButtonActive
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

                {dailyReminderEnabled && notificationMode === "global" && (
                  <Pressable onPress={() => setShowTimeModal(true)} style={styles.timePickerButton}>
                    <Text style={styles.timePickerLabel}>Daily reminder time</Text>
                    <View style={styles.timeDisplay}>
                      <Text style={styles.timeText}>
                        {String(notificationHour).padStart(2, '0')}:{String(notificationMinute).padStart(2, '0')}
                      </Text>
                      <Ionicons name="chevron-forward" size={18} color={theme.accent} />
                    </View>
                  </Pressable>
                )}
              </>
            )}
          </View>
        </View>

        <View style={styles.actionButtonWrap}>
          <View pointerEvents="none" style={[styles.actionButtonShadow, styles.actionButtonShadowPrimary]} />
          <Pressable
            onPress={handleSendTestNotification}
            disabled={sendingTest}
            style={({ pressed }) => [
              styles.actionButtonFace,
              styles.saveButton,
              pressed && !sendingTest && styles.actionButtonPressed,
              sendingTest && styles.actionButtonDisabled,
            ]}
          >
            {sendingTest ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.saveButtonText}>Send Test Notification</Text>
            )}
          </Pressable>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Session</Text>
          <View style={styles.actionButtonWrap}>
            <View pointerEvents="none" style={[styles.actionButtonShadow, styles.actionButtonShadowDanger]} />
            <Pressable
              onPress={handleLogout}
              style={({ pressed }) => [
                styles.actionButtonFace,
                styles.logoutButton,
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
                        notificationHour === i && styles.selectedHour,
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
                        notificationMinute === i && styles.selectedMinute,
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
    shadowColor: '#4c6782',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.16,
    shadowRadius: 0,
    elevation: 3,
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
    shadowColor: '#c3cfdb',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 1,
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
  },

  content: { paddingBottom: 52 },

  section: { marginBottom: 18 },
  sectionTitle: { fontSize: 12, fontWeight: "900", color: '#000000', marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 16,
    shadowColor: '#cdcdcd',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 2,
  },
  label: { fontSize: 13, fontWeight: "900", color: theme.text2, marginBottom: 8 },
  labelNoMargin: { fontSize: 13, fontWeight: "900", color: theme.text2 },
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
    fontWeight: "700"
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
    color: theme.text2,
    fontWeight: '700',
    lineHeight: 17,
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
    backgroundColor: '#d35656',
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
    backgroundColor: '#59d700',
    height: 52,
    alignItems: "center",
    justifyContent: 'center',
  },
  saveButtonText: { color: "#fff", fontSize: 16, fontWeight: "800" },

  logoutButton: {
    backgroundColor: '#ef6b6b',
    height: 52,
    alignItems: "center",
    justifyContent: 'center',
  },
  logoutButtonText: { color: "#fff", fontSize: 16, fontWeight: "800" },

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
    color: theme.accent,
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
    color: theme.accent,
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
    backgroundColor: theme.accent,
    borderRadius: 8,
  },
  selectedMinute: {
    backgroundColor: theme.accent,
    borderRadius: 8,
  },
  hourOptionText: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.text2,
  },
  minuteOptionText: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.text2,
  },
  selectedHourText: {
    color: '#fff',
    fontWeight: '900',
  },
  selectedMinuteText: {
    color: '#fff',
    fontWeight: '900',
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
    backgroundColor: theme.accent,
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '800',
    color: theme.text,
  },
  confirmButtonText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#fff',
  },

  // Mode Selection Styles
  modeSelectionWrap: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
    marginBottom: 8,
  },
  modeButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: '#f7fafc',
    borderWidth: 2,
    borderColor: '#d9e6f4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeButtonActive: {
    backgroundColor: theme.accent,
    borderColor: theme.accent,
  },
  modeButtonText: {
    fontSize: 13,
    fontWeight: '800',
    color: theme.text2,
  },
  modeButtonTextActive: {
    color: '#ffffff',
  },
});