import { initializeApp } from "firebase/app";
import { initializeAuth, getReactNativePersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import AsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
  apiKey: "AIzaSyAqQp-d5xtT_pjPK5n6t7PGswEjb0aXero",
  authDomain: "goalgrower-2a859.firebaseapp.com",
  projectId: "goalgrower-2a859",
  storageBucket: "goalgrower-2a859.firebasestorage.app",
  messagingSenderId: "1043088781890",
  appId: "1:1043088781890:web:4b11eb3ac612c2026c33db",
  measurementId: "G-TWXPJMVL13"
};

// 1. Initialize the App
const app = initializeApp(firebaseConfig);

// 2. Initialize Auth with Persistence 
// (This keeps users logged in even if they close the app)
const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage)
});

// 3. Initialize Firestore
const db = getFirestore(app);

export { app, auth, db };