import React, { useState, useEffect } from 'react';
import { useNavigation } from '@react-navigation/native';
import { View, Text, TextInput, Pressable, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { auth, db } from './firebaseConfig';
import { theme } from './theme';
import { onAuthStateChanged, signOut, signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
// NEW: Imported query, where, and getDocs
import { doc, getDoc, setDoc, serverTimestamp, collection, query, where, getDocs } from 'firebase/firestore';

export default function Login() {
  const [view, setView] = useState('loading'); 
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [guest, setGuest] = useState(false);
  const navigation = useNavigation();

  const handleLogin = () => {
    if (!email || !password) {
      return Alert.alert('Error', 'Please enter both email and password.');
    }
    signInWithEmailAndPassword(auth, email, password).catch((error) => {
      Alert.alert('Login failed', error.message || 'Unable to login.');
    });
  };

  useEffect(() => {
    if (guest) {
      setView('home');
      return;
    }
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
  }, [guest]);

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
        <Text style={styles.title}>Goal Grower</Text>
        <TextInput style={styles.input} placeholder="Email" onChangeText={setEmail} value={email} autoCapitalize="none" />
        <TextInput style={styles.input} placeholder="Password" onChangeText={setPassword} value={password} secureTextEntry returnKeyType="go" onSubmitEditing={handleLogin} />
        <Pressable style={styles.button} onPress={handleLogin}>
          <Text style={styles.buttonText}>Login</Text>
        </Pressable>
        <Pressable style={[styles.button, styles.buttonSecondary]} onPress={() => createUserWithEmailAndPassword(auth, email, password)}>
          <Text style={[styles.buttonText, styles.buttonTextSecondary]}>Register</Text>
        </Pressable>
        <Pressable style={[styles.button, styles.buttonSecondary]} onPress={() => setGuest(true)}>
          <Text style={[styles.buttonText, styles.buttonTextSecondary]}>Continue as Guest</Text>
        </Pressable>
      </View>
    );
  }

  if (view === 'needsUsername') {
    return (
      <View style={styles.container} key="setup-view">
        <Text style={styles.title}>Goal Grower</Text>
        <Text style={styles.subtitle}>Pick a username to continue.</Text>
        <TextInput 
          style={styles.input} 
          placeholder="New Username" 
          value={username} 
          onChangeText={setUsername} 
          autoCapitalize="none"
        />
        <Pressable style={styles.button} onPress={handleSaveUsername}>
          <Text style={styles.buttonText}>Finish Setup</Text>
        </Pressable>
        <Pressable style={[styles.button, styles.buttonDanger]} onPress={() => signOut(auth)}>
          <Text style={[styles.buttonText, styles.buttonTextDanger]}>Logout</Text>
        </Pressable>
      </View>
    );
  }

  if (view === 'home') {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Welcome to Goal Grower!</Text>
        <Text style={styles.subtitle}>{guest ? "You are using Guest Mode. Your data is stored locally." : "Your profile is all set up."}</Text>
        {guest ? (
          <>
            <Pressable style={styles.button} onPress={() => navigation.replace('Tabs', { guest: true })}>
              <Text style={styles.buttonText}>Continue to App</Text>
            </Pressable>
            <Pressable style={[styles.button, styles.buttonSecondary]} onPress={() => setGuest(false)}>
              <Text style={[styles.buttonText, styles.buttonTextSecondary]}>Go Back</Text>
            </Pressable>
          </>
        ) : (
          <Pressable style={[styles.button, styles.buttonDanger]} onPress={() => signOut(auth)}>
            <Text style={[styles.buttonText, styles.buttonTextDanger]}>Logout</Text>
          </Pressable>
        )}
      </View>
    );
  }

  if (view === 'app') {
    // You may want to trigger navigation to your main app here
    // For now, just show a placeholder
    return (
      <View style={styles.container}>
        <Text style={styles.title}>App Loaded (Guest Mode)</Text>
        <Text style={styles.subtitle}>You are now in the app as a guest.</Text>
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
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.bg, padding: 20 },
  title: { fontSize: 32, fontWeight: 'bold', color: theme.title, marginBottom: 10 },
  subtitle: { fontSize: 16, color: theme.muted, textAlign: 'center', marginBottom: 20 },
  input: { width: '100%', height: 50, borderColor: theme.outline, borderWidth: 1, borderRadius: 10, marginBottom: 15, paddingHorizontal: 15, backgroundColor: theme.surface },
  button: { width: '100%', height: 50, borderRadius: 10, backgroundColor: theme.accent, alignItems: 'center', justifyContent: 'center', marginBottom: 10, borderWidth: 1, borderColor: theme.outline },
  buttonText: { color: theme.bg, fontWeight: '800', fontSize: 16 },
  buttonSecondary: { backgroundColor: theme.surface, borderColor: theme.outline },
  buttonTextSecondary: { color: theme.text },
  buttonDanger: { backgroundColor: '#FEE2E2', borderColor: theme.dangerText },
  buttonTextDanger: { color: theme.dangerText },
});