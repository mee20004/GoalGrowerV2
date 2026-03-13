// screens/UserProfileScreen.js
import React, { useState, useCallback } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { doc, getDoc, collection, getDocs, setDoc, deleteDoc } from "firebase/firestore";
import { auth, db } from "../firebaseConfig";
import { theme } from "../theme";
import Ionicons from "@expo/vector-icons/Ionicons";

// IMPORT YOUR ACHIEVEMENTS STORE
import { ACHIEVEMENTS } from "../AchievementsStore";

export default function UserProfileScreen({ route, navigation }) {
  // We expect a userId to be passed when navigating to this screen
  const { userId } = route.params; 
  
  const [profileData, setProfileData] = useState(null);
  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [isFollowing, setIsFollowing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [followLoading, setFollowLoading] = useState(false);

  const currentUserId = auth.currentUser?.uid;

  useFocusEffect(
    useCallback(() => {
      if (userId) {
        fetchSocialData(userId);
      }
    }, [userId])
  );

  const fetchSocialData = async (targetUid) => {
    try {
      // 1. Fetch Target User's Profile
      const userRef = doc(db, "users", targetUid);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        setProfileData(userSnap.data());
      } else {
        Alert.alert("Error", "User not found.");
        navigation.goBack();
        return;
      }

      // 2. Fetch Followers & Check if current user is following them
      const followersRef = collection(db, "users", targetUid, "followers");
      const followersSnap = await getDocs(followersRef);
      setFollowersCount(followersSnap.size);
      
      // Check if my ID is in their followers list
      const amIFollowing = followersSnap.docs.some(doc => doc.id === currentUserId);
      setIsFollowing(amIFollowing);

      // 3. Fetch Following
      const followingRef = collection(db, "users", targetUid, "following");
      const followingSnap = await getDocs(followingRef);
      setFollowingCount(followingSnap.size);

    } catch (error) {
      console.error("Error fetching user data:", error);
    } finally {
      setLoading(false);
    }
  };

  const toggleFollow = async () => {
    if (!currentUserId || followLoading) return;
    setFollowLoading(true);

    try {
      // References for the target user's followers list
      const targetFollowerRef = doc(db, "users", userId, "followers", currentUserId);
      // References for my own following list
      const myFollowingRef = doc(db, "users", currentUserId, "following", userId);

      if (isFollowing) {
        // UNFOLLOW LOGIC
        await deleteDoc(targetFollowerRef);
        await deleteDoc(myFollowingRef);
        setFollowersCount(prev => prev - 1);
        setIsFollowing(false);
      } else {
        // FOLLOW LOGIC
        // Save minimal data to make rendering lists easier later
        await setDoc(targetFollowerRef, { 
          uid: currentUserId, 
          timestamp: new Date() 
        });
        await setDoc(myFollowingRef, { 
          uid: userId, 
          username: profileData.username, // Save their username so we don't have to fetch it every time
          timestamp: new Date() 
        });
        setFollowersCount(prev => prev + 1);
        setIsFollowing(true);
      }
    } catch (error) {
      console.error("Error toggling follow:", error);
      Alert.alert("Error", "Could not update follow status.");
    } finally {
      setFollowLoading(false);
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
      <View style={{ height: 20 }} />
      
      {/* Back Button */}
      <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
         <Ionicons name="arrow-back" size={24} color={theme.text} />
      </TouchableOpacity>

      {/* User Info & Stats */}
      <View style={styles.userSection}>
        <View style={styles.avatar}>
           <Ionicons name="person" size={50} color={theme.muted} />
        </View>
        <Text style={styles.userName}>{profileData?.username || "User"}</Text>

        {/* Following / Followers Counters */}
        <View style={styles.socialStatsRow}>
          <View style={styles.socialStat}>
            <Text style={styles.statNumber}>{followersCount}</Text>
            <Text style={styles.statLabel}>Followers</Text>
          </View>
          <View style={styles.socialStat}>
            <Text style={styles.statNumber}>{followingCount}</Text>
            <Text style={styles.statLabel}>Following</Text>
          </View>
        </View>

        {/* FOLLOW / UNFOLLOW BUTTON */}
        {currentUserId !== userId && (
            <>
              <TouchableOpacity 
                style={[styles.followButton, isFollowing && styles.followingButton]} 
                onPress={toggleFollow}
                disabled={followLoading}
              >
                {followLoading ? (
                  <ActivityIndicator size="small" color={isFollowing ? "#4B4B4B" : "#fff"} />
                ) : (
                  <Text style={[styles.followButtonText, isFollowing && styles.followingButtonText]}>
                    {isFollowing ? "Following" : "Follow"}
                  </Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.viewGardenButton}
                onPress={() => navigation.navigate("UserGarden", {
                  userId,
                  readOnly: true,
                  username: profileData?.username || "User",
                })}
              >
                <Ionicons name="flower-outline" size={18} color="#2D5A27" />
                <Text style={styles.viewGardenButtonText}>View Garden</Text>
              </TouchableOpacity>
            </>
        )}
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

      {/* --- DUOLINGO STYLE TROPHY CASE --- */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Achievements</Text>
        </View>

        {unlockedAchievements.length === 0 ? (
          <Text style={styles.emptyText}>This user hasn't unlocked any achievements yet.</Text>
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

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg, padding: 16 },
  backBtn: { marginBottom: 10, padding: 4, alignSelf: 'flex-start' },
  userSection: { alignItems: "center", marginBottom: 24 },
  avatar: { width: 100, height: 100, borderRadius: 50, backgroundColor: theme.surface, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  userName: { fontSize: 22, fontWeight: "800", marginBottom: 12 },
  
  socialStatsRow: { flexDirection: "row", justifyContent: "center", width: "60%", marginBottom: 16 },
  socialStat: { alignItems: "center", marginHorizontal: 20 },
  statNumber: { fontSize: 20, fontWeight: "800", color: "#2D5A27" },
  statLabel: { fontSize: 12, color: theme.muted, fontWeight: "600" },

  // New Follow Button Styles
  followButton: { backgroundColor: "#2D5A27", paddingHorizontal: 32, paddingVertical: 10, borderRadius: 8, minWidth: 120, alignItems: 'center' },
  followButtonText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  followingButton: { backgroundColor: "#E0F7D4", borderWidth: 2, borderColor: "#2D5A27" },
  followingButtonText: { color: "#2D5A27" },
  viewGardenButton: { marginTop: 10, flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#F4EEDC", borderWidth: 2, borderColor: "#D8C39E", paddingHorizontal: 22, paddingVertical: 10, borderRadius: 10 },
  viewGardenButtonText: { color: "#2D5A27", fontWeight: "800", fontSize: 14 },
  
  section: { marginBottom: 24 },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontSize: 18, fontWeight: "800" },
  
  userRow: { flexDirection: "row", alignItems: "center", backgroundColor: "#E0F7D4", borderRadius: 8, padding: 12, marginBottom: 8 },
  
  achievementsList: { flexDirection: "column" },
  duoCard: { flexDirection: "row", alignItems: "center", backgroundColor: "#ffffff", borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 2, borderColor: "#E5E5E5", borderBottomWidth: 4 },
  iconWrap: { width: 70, height: 70, borderRadius: 35, justifyContent: "center", alignItems: "center", marginRight: 16, backgroundColor: "#FFDF00" },
  achTextWrap: { flex: 1 },
  duoTitle: { fontSize: 18, fontWeight: "900", color: "#4B4B4B", marginBottom: 4 },
  duoDesc: { fontSize: 14, color: "#777777", fontWeight: "600", lineHeight: 20 },
  completedText: { marginTop: 8, fontSize: 12, fontWeight: "900", color: "#FF9600", letterSpacing: 1 },

  emptyText: { color: theme.muted, fontStyle: 'italic', marginTop: 10, textAlign: "center" }
});