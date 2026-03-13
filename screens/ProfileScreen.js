// ProfileScreen.js
import React, { useState, useCallback } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { doc, getDoc, collection, getDocs, updateDoc } from "firebase/firestore";
import { auth, db } from "../firebaseConfig";
import { theme } from "../theme";
import Ionicons from "@expo/vector-icons/Ionicons";
import { updateOverallScoreForUser } from "../utils/scoreUtils";

// IMPORT YOUR ACHIEVEMENTS STORE
import { ACHIEVEMENTS } from "../AchievementsStore";

export default function ProfileScreen({ navigation }) {
  const [profileData, setProfileData] = useState(null);
  const [followers, setFollowers] = useState([]);
  const [following, setFollowing] = useState([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      if (auth.currentUser) {
        fetchSocialData(auth.currentUser.uid);
      }
    }, [])
  );

  const fetchSocialData = async (uid) => {
    try {
      const userRef = doc(db, "users", uid);
      const userSnap = await getDoc(userRef);
      let userData = userSnap.exists() ? userSnap.data() : {};

      const calculatedScore = await updateOverallScoreForUser(uid);
      userData.overallScore = calculatedScore;
      
      setProfileData(userData);

      const followersRef = collection(db, "users", uid, "followers");
      const followersSnap = await getDocs(followersRef);
      setFollowers(followersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));

      const followingRef = collection(db, "users", uid, "following");
      const followingSnap = await getDocs(followingRef);
      setFollowing(followingSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));

    } catch (error) {
      console.error("Error fetching social data:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator size="large" color="#A88F6F" />
      </View>
    );
  }

  const unlockedIds = profileData?.unlockedAchievements || [];
  const unlockedAchievements = ACHIEVEMENTS.filter(ach => unlockedIds.includes(ach.id));

  return (
    <ScrollView style={styles.container}>
      {/* Increased height to push settings down further */}
      <View style={{ height: 45 }} />

      {/* TOP BAR WITH SETTINGS ICON */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.navigate("Settings")}>
          <Ionicons name="settings-outline" size={30} color="#4B4B4B" />
        </TouchableOpacity>
      </View>

      {/* User Info & Stats */}
      <View style={styles.userSection}>
        
        {/* Simple Static Avatar */}
        <View style={styles.avatar}>
          <Ionicons name="person" size={50} color={theme.muted} />
        </View>

        <Text style={styles.userName}>{profileData?.username || "User"}</Text>

        {/* REDESIGNED: Followers / Following Stats Card */}
        <View style={styles.statsCard}>
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{followers.length}</Text>
            <Text style={styles.statLabel}>FOLLOWERS</Text>
          </View>
          
          <View style={styles.statDivider} />
          
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{following.length}</Text>
            <Text style={styles.statLabel}>FOLLOWING</Text>
          </View>
        </View>

      </View>

      {/* Stats Section */}
      <View style={styles.section}>
         <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Activity Stats</Text>
        </View>
        <View style={styles.userRow}>
           <Text style={{fontWeight: 'bold', flex: 1}}>🏆 Overall Score</Text>
           <Text style={{fontWeight: '900', color: "#2D5A27"}}>{profileData?.overallScore || 0} pts</Text>
        </View>
        <View style={styles.userRow}>
           <Text style={{fontWeight: 'bold', flex: 1}}>🔥 Overall App Streak</Text>
           <Text>{profileData?.streakCount || 0} Days</Text>
        </View>
      </View>

      {/* Achievements Section */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Achievements</Text>
        </View>

        {unlockedAchievements.length === 0 ? (
          <Text style={styles.emptyText}>Complete goals to start earning achievements!</Text>
        ) : (
          <View style={styles.achievementsList}>
            {unlockedAchievements.map((ach, index) => (
              <View key={index} style={styles.duoCard}>
                <View style={styles.iconWrap}>
                  <Ionicons name={ach.icon} size={36} color="#FF9600" />
                </View>
                <View style={styles.achTextWrap}>
                  <Text style={styles.duoTitle}>{ach.title}</Text>
                  <Text style={styles.duoDesc}>{ach.desc}</Text>
                  <Text style={styles.completedText}>COMPLETED</Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* Following List */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Following</Text>
          <TouchableOpacity 
            style={styles.addButton} 
            onPress={() => navigation.navigate("AddFriends")}
          >
            <Text style={styles.addButtonText}>Find People +</Text>
          </TouchableOpacity>
        </View>

        {following.length === 0 ? (
          <Text style={styles.emptyText}>You aren't following anyone yet.</Text>
        ) : (
          following.map((user, index) => (
            <View key={user.id || index} style={styles.userRow}>
              <View style={styles.userAvatar}>
                <Ionicons name="person" size={20} color={theme.muted} />
              </View>
              <Text style={styles.listUserName}>{user.username}</Text>
                <TouchableOpacity 
                    style={styles.viewButton}
                    onPress={() => navigation.navigate("UserProfile", { userId: user.id || user.uid })}
                    >
                    <Text style={styles.viewButtonText}>View Profile</Text>
                </TouchableOpacity>
            </View>
          ))
        )}
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg, padding: 16 },
  
  // Settings Icon lowered slightly
  topBar: { flexDirection: "row", justifyContent: "flex-end", marginBottom: 15 },
  
  userSection: { alignItems: "center", marginBottom: 24 },
  
  // Restored clean static avatar
  avatar: { width: 100, height: 100, borderRadius: 50, backgroundColor: theme.surface, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  
  userName: { fontSize: 24, fontWeight: "900", color: "#333", marginBottom: 16 },
  
  // Redesigned Stats Card
  statsCard: { flexDirection: "row", backgroundColor: "#fff", borderRadius: 16, paddingVertical: 16, paddingHorizontal: 24, width: "85%", justifyContent: "space-between", alignItems: "center", borderWidth: 2, borderColor: "#E5E5E5", borderBottomWidth: 4, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 2 },
  statItem: { flex: 1, alignItems: "center" },
  statNumber: { fontSize: 20, fontWeight: "900", color: "#2D5A27", marginBottom: 4 },
  statLabel: { fontSize: 11, color: "#888", fontWeight: "800", letterSpacing: 0.5 },
  statDivider: { width: 2, height: "80%", backgroundColor: "#E5E5E5", marginHorizontal: 15 },

  section: { marginBottom: 24 },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontSize: 18, fontWeight: "800" },
  addButton: { backgroundColor: "#2D5A27", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
  addButtonText: { color: "#fff", fontWeight: "700", fontSize: 12 },
  
  userRow: { flexDirection: "row", alignItems: "center", backgroundColor: "#E0F7D4", borderRadius: 8, padding: 12, marginBottom: 8 },
  userAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  listUserName: { flex: 1, marginLeft: 12, fontWeight: "700", fontSize: 16 },
  viewButton: { backgroundColor: "#A88F6F", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
  viewButtonText: { color: "#fff", fontSize: 12, fontWeight: "600" },
  
  achievementsList: { flexDirection: "column" },
  duoCard: { flexDirection: "row", alignItems: "center", backgroundColor: "#ffffff", borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 2, borderColor: "#E5E5E5", borderBottomWidth: 4 },
  iconWrap: { width: 70, height: 70, borderRadius: 35, justifyContent: "center", alignItems: "center", marginRight: 16, backgroundColor: "#FFDF00" },
  achTextWrap: { flex: 1 },
  duoTitle: { fontSize: 18, fontWeight: "900", color: "#4B4B4B", marginBottom: 4 },
  duoDesc: { fontSize: 14, color: "#777777", fontWeight: "600", lineHeight: 20 },
  completedText: { marginTop: 8, fontSize: 12, fontWeight: "900", color: "#FF9600", letterSpacing: 1 },

  emptyText: { color: theme.muted, fontStyle: 'italic', marginTop: 10, textAlign: "center" }
});