// screens/SettingsScreen.js
import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Pressable, TextInput, ScrollView, Alert, ActivityIndicator, Switch } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { updateEmail, updatePassword, signOut } from "firebase/auth";
import { doc, getDoc, updateDoc, collection, query, where, getDocs } from "firebase/firestore";
import { auth, db } from "../firebaseConfig";
import { theme } from "../theme";

export default function SettingsScreen({ navigation }) {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [privateAccount, setPrivateAccount] = useState(false);
  const [savingPrivate, setSavingPrivate] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);

  // Fetch current user info when screen loads
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
        } catch (error) {
          console.error("Error fetching user data:", error);
        }
      }
      setFetching(false);
    };
    fetchUserData();
  }, []);
  const handlePrivateToggle = async (value) => {
    if (!auth.currentUser) return;
    setPrivateAccount(value);
    setSavingPrivate(true);
    try {
      await updateDoc(doc(db, "users", auth.currentUser.uid), { privateAccount: value });
    } catch (e) {
      setPrivateAccount(!value);
      Alert.alert("Error", "Could not update privacy setting.");
    } finally {
      setSavingPrivate(false);
    }
  };

  const handleSaveChanges = async () => {
    if (!auth.currentUser) return;
    
    // Prevent empty username or email fields
    if (!username.trim() || !email.trim()) {
      Alert.alert("Error", "Username and Email cannot be empty.");
      return;
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

      <ScrollView contentContainerStyle={styles.content}>
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
  sectionTitle: { fontSize: 12, fontWeight: "900", color: '#ffffff', marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 },
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
  logoutButtonText: { color: "#fff", fontSize: 16, fontWeight: "800" }
});