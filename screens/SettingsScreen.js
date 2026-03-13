// screens/SettingsScreen.js
import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, Alert, ActivityIndicator } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { updateEmail, updatePassword, signOut } from "firebase/auth";
import { doc, getDoc, updateDoc, collection, query, where, getDocs } from "firebase/firestore";
import { auth, db } from "../firebaseConfig";
import { theme } from "../theme";

export default function SettingsScreen({ navigation }) {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  
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
          }
        } catch (error) {
          console.error("Error fetching user data:", error);
        }
      }
      setFetching(false);
    };

    fetchUserData();
  }, []);

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
      <View style={[styles.container, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator size="large" color="#A88F6F" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#4B4B4B" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={{ width: 24 }} /> 
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        
        <View style={styles.section}>
          <Text style={styles.label}>Username</Text>
          <TextInput
            style={styles.input}
            value={username}
            onChangeText={setUsername}
            placeholder="Enter new username"
            autoCapitalize="none"
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Email Address</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="Enter new email"
            keyboardType="email-address"
            autoCapitalize="none"
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>New Password</Text>
          <TextInput
            style={styles.input}
            value={newPassword}
            onChangeText={setNewPassword}
            placeholder="Leave blank to keep current"
            secureTextEntry
          />
        </View>

        <TouchableOpacity 
          style={styles.saveButton} 
          onPress={handleSaveChanges}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.saveButtonText}>Save Changes</Text>
          )}
        </TouchableOpacity>

        <View style={styles.divider} />

        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutButtonText}>Log Out</Text>
        </TouchableOpacity>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  header: { 
    flexDirection: "row", 
    alignItems: "center", 
    justifyContent: "space-between", 
    paddingHorizontal: 16, 
    paddingTop: 60, 
    paddingBottom: 16, 
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E5E5"
  },
  backButton: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: "800", color: "#4B4B4B" },
  
  content: { padding: 24 },
  
  section: { marginBottom: 20 },
  label: { fontSize: 14, fontWeight: "800", color: "#4B4B4B", marginBottom: 8, marginLeft: 4 },
  input: {
    backgroundColor: "#fff",
    borderWidth: 2,
    borderColor: "#E5E5E5",
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: theme.text,
    fontWeight: "600"
  },

  saveButton: {
    backgroundColor: "#2D5A27",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 10,
    borderBottomWidth: 4,
    borderColor: "#1E3D1A"
  },
  saveButtonText: { color: "#fff", fontSize: 16, fontWeight: "800" },

  divider: {
    height: 1,
    backgroundColor: "#E5E5E5",
    marginVertical: 32
  },

  logoutButton: {
    backgroundColor: "#fff",
    borderWidth: 2,
    borderColor: "#FF4B4B",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    borderBottomWidth: 4,
  },
  logoutButtonText: { color: "#FF4B4B", fontSize: 16, fontWeight: "800" }
});