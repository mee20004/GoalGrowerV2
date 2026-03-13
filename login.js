import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Button, StyleSheet, Alert, ActivityIndicator, ScrollView } from 'react-native';
import { auth, db } from './firebaseConfig';
import { onAuthStateChanged, signOut, signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
// NEW: Imported query, where, and getDocs
import { doc, getDoc, setDoc, serverTimestamp, collection, query, where, getDocs } from 'firebase/firestore';

export default function Login() {
  const [view, setView] = useState('loading'); 
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        console.log("LOG: Auth detected user:", user.uid);
        checkProfile(user.uid);
      } else {
        console.log("LOG: No user logged in.");
        setView('loggedOut');
      }
    });
    return unsubscribe;
  }, []);

  const checkProfile = async (uid) => {
    setView('loading');
    try {
      const userRef = doc(db, 'users', uid);
      const userSnap = await getDoc(userRef);

      if (userSnap.exists() && userSnap.data().username) {
        console.log("LOG: Profile complete. Going Home.");
        setView('home');
      } else {
        console.log("LOG: Profile missing username. Going to Setup.");
        setView('needsUsername');
      }
    } catch (e) {
      console.error("LOG: Firestore Error", e);
      setView('loggedOut');
    }
  };

  const handleSaveUsername = async () => {
    const trimmedUsername = username.trim();

    if (trimmedUsername.length < 3) {
      return Alert.alert("Error", "Username must be at least 3 characters.");
    }

    setView('loading');
    try {
      // --- NEW: CHECK IF USERNAME IS ALREADY TAKEN ---
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where("username", "==", trimmedUsername));
      const querySnapshot = await getDocs(q);

      if (!querySnapshot.empty) {
        // Someone else already has it!
        Alert.alert("Username Taken", "Sorry, that username is already in use. Please pick another one.");
        setView('needsUsername'); // Send them back to the form
        return; // Stop the save process
      }
      // -----------------------------------------------

      const userUid = auth.currentUser.uid;
      await setDoc(doc(db, 'users', userUid), {
        username: trimmedUsername,
        searchKey: trimmedUsername.toLowerCase(),
        email: auth.currentUser.email,
        createdAt: serverTimestamp(),
      }, { merge: true });

      console.log("LOG: Setup successful.");
      setView('home');
    } catch (e) {
      console.error("Save Error:", e);
      Alert.alert("Error", "Save failed.");
      setView('needsUsername');
    }
  };

  // --- STRICT RENDERING ---
  if (view === 'loading') {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#2D5A27" />
        <Text style={{marginTop: 10}}>Loading Garden...</Text>
      </View>
    );
  }

  if (view === 'loggedOut') {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Garden Your Goals</Text>
        <TextInput style={styles.input} placeholder="Email" onChangeText={setEmail} value={email} autoCapitalize="none" />
        <TextInput style={styles.input} placeholder="Password" onChangeText={setPassword} value={password} secureTextEntry />
        <Button title="Login" onPress={() => signInWithEmailAndPassword(auth, email, password)} color="#2D5A27" />
        <View style={{marginVertical: 5}} />
        <Button title="Register" onPress={() => createUserWithEmailAndPassword(auth, email, password)} color="#4285F4" />
      </View>
    );
  }

  if (view === 'needsUsername') {
    return (
      <View style={styles.container} key="setup-view">
        <Text style={styles.title}>Pick a Username</Text>
        <Text style={styles.subtitle}>You need a name before you can enter.</Text>
        <TextInput 
          style={styles.input} 
          placeholder="New Username" 
          value={username} 
          onChangeText={setUsername} 
          autoCapitalize="none"
        />
        <Button title="Finish Setup" onPress={handleSaveUsername} color="#2D5A27" />
        <View style={{marginVertical: 10}} />
        <Button title="Logout" onPress={() => signOut(auth)} color="red" />
      </View>
    );
  }

  if (view === 'home') {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Welcome Home!</Text>
        <Text>Your profile is all set up.</Text>
        <Button title="Logout" onPress={() => signOut(auth)} color="red" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text>Something went wrong. View State: {view}</Text>
      <Button title="Reset" onPress={() => signOut(auth)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F5F5F5', padding: 20 },
  title: { fontSize: 32, fontWeight: 'bold', color: '#2D5A27', marginBottom: 10 },
  subtitle: { fontSize: 16, color: '#666', textAlign: 'center', marginBottom: 20 },
  input: { width: '100%', height: 50, borderColor: '#ccc', borderWidth: 1, borderRadius: 8, marginBottom: 15, paddingHorizontal: 15, backgroundColor: '#fff' },
});