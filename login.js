import React, { useState, useEffect } from 'react';
import { useNavigation } from '@react-navigation/native';
import { View, Text, TextInput, Pressable, StyleSheet, Alert, ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { auth, db } from './firebaseConfig';
import { theme } from './theme';
import { onAuthStateChanged, signOut, signInWithEmailAndPassword } from 'firebase/auth';
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

  const handleBackPress = () => {
    if (view === 'needsUsername') {
      signOut(auth).catch(() => {
        setView('loggedOut');
      });
      return;
    }

    if (navigation.canGoBack()) {
      navigation.goBack();
    }
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
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#58cc02" />
        <Text style={styles.loadingText}>Loading Garden...</Text>
      </View>
    );
  }

  if (view === 'loggedOut') {
    return (
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: theme.bg }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.backButtonWrap}>
          <Pressable onPress={handleBackPress} style={styles.backButton}>
            <Ionicons name="chevron-back" size={26} color={theme.accent} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.inner}>
            <Text style={styles.title}>Welcome back!</Text>
            <Text style={styles.subtitle}>Sign in to your garden</Text>
            <View style={styles.divider} />
            <View style={styles.card}>
              <Text style={styles.inputLabel}>Email</Text>
              <TextInput
                style={styles.input}
                placeholder="you@example.com"
                placeholderTextColor="#9b948d"
                onChangeText={setEmail}
                value={email}
                autoCapitalize="none"
                keyboardType="email-address"
              />
              <Text style={styles.inputLabel}>Password</Text>
              <TextInput
                style={[styles.input, { marginBottom: 0 }]}
                placeholder="Your password"
                placeholderTextColor="#9b948d"
                onChangeText={setPassword}
                value={password}
                secureTextEntry
                returnKeyType="go"
                onSubmitEditing={handleLogin}
              />
            </View>
            <View style={[styles.actionButtonWrap, { marginTop: 22 }]}>
              <View pointerEvents="none" style={[styles.actionButtonShadow, styles.actionButtonShadowPrimary]} />
              <Pressable
                style={({ pressed }) => [styles.actionButtonFace, styles.actionButtonPrimary, pressed && styles.actionButtonPressed]}
                onPress={handleLogin}
              >
                <Text style={styles.actionButtonTextPrimary}>Log In</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  if (view === 'needsUsername') {
    return (
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: theme.bg }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.backButtonWrap}>
          <Pressable onPress={handleBackPress} style={styles.backButton}>
            <Ionicons name="chevron-back" size={26} color={theme.accent} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.inner}>
            <Text style={styles.title}>Almost there</Text>
            <Text style={styles.subtitle}>Pick a username to continue.</Text>
            <View style={styles.divider} />
            <View style={styles.card}>
              <Text style={styles.inputLabel}>Username</Text>
              <TextInput
                style={[styles.input, { marginBottom: 0 }]}
                placeholder="e.g. plantlover42"
                placeholderTextColor="#9b948d"
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
              />
            </View>
            <View style={[styles.actionButtonWrap, { marginTop: 22 }]}>
              <View pointerEvents="none" style={[styles.actionButtonShadow, styles.actionButtonShadowPrimary]} />
              <Pressable
                style={({ pressed }) => [styles.actionButtonFace, styles.actionButtonPrimary, pressed && styles.actionButtonPressed]}
                onPress={handleSaveUsername}
              >
                <Text style={styles.actionButtonTextPrimary}>Finish Setup</Text>
              </Pressable>
            </View>
            <View style={[styles.actionButtonWrap, { marginTop: 12 }]}>
              <View pointerEvents="none" style={[styles.actionButtonShadow, styles.actionButtonShadowSecondary]} />
              <Pressable
                style={({ pressed }) => [styles.actionButtonFace, styles.actionButtonSecondary, pressed && styles.actionButtonPressed]}
                onPress={() => signOut(auth)}
              >
                <Text style={styles.actionButtonTextSecondary}>Logout</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
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
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.bg },
  loadingText: { marginTop: 10, fontSize: 14, color: '#6b6560', fontFamily: 'CeraRoundProDEMO-Black' },
  backButtonWrap: {
    position: 'absolute',
    top: 56,
    left: 16,
    zIndex: 10,
  },
  backButton: {
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
    elevation: 4,
  },
  scrollContent: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 16, paddingBottom: 40 },
  inner: { width: '100%', maxWidth: 420, alignSelf: 'center' },
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
    color: '#6b6560',
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
    borderColor: '#e0d7cc',
    color: '#2d2a26',
    fontSize: 15,
    fontFamily: 'CeraRoundProDEMO-Black',
  },
  actionButtonWrap: { height: 56, position: 'relative' },
  actionButtonShadow: { position: 'absolute', top: 4, left: 0, right: 0, bottom: 0, borderRadius: 20 },
  actionButtonShadowPrimary: { backgroundColor: '#509a18' },
  actionButtonShadowSecondary: { backgroundColor: '#c8bba9' },
  actionButtonFace: { height: 52, borderRadius: 20, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  actionButtonPrimary: { backgroundColor: '#58cc02' },
  actionButtonSecondary: { backgroundColor: '#f7f1e8' },
  actionButtonPressed: { transform: [{ translateY: 4 }] },
  actionButtonTextPrimary: { fontSize: 19, fontWeight: '800', color: '#fff', fontFamily: 'CeraRoundProDEMO-Black' },
  actionButtonTextSecondary: { fontSize: 19, fontWeight: '800', color: '#3d3d3d', fontFamily: 'CeraRoundProDEMO-Black' },
});