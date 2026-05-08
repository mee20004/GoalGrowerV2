// screens/UserProfileScreen.js
import React, { useState, useCallback } from "react";
import { Dimensions } from "react-native";
import { View, Text, ScrollView, TouchableOpacity, Pressable, StyleSheet, ActivityIndicator, Alert } from "react-native";
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

  const screenHeight = Dimensions.get('window').height;
  return (
    <View style={styles.screenWrap}>
      <ScrollView
        style={styles.container}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ minHeight: screenHeight, paddingBottom: 100 }}
      >
        <View style={styles.headerTopSpacer} />
        <View style={styles.headerWrapper}>
          <View style={styles.headerRow}>
            <TouchableOpacity style={styles.headerBtn} onPress={() => navigation.goBack()}>
              <Ionicons name="chevron-back" size={26} color={theme.accent} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Profile</Text>
            <View style={styles.headerBtnPlaceholder} />
          </View>
        </View>

        <View style={styles.userSection}>
          <View style={styles.profileCard}>
            {/* Avatar removed */}
            <Text style={styles.userName}>{profileData?.username || "User"}</Text>

            <View style={styles.statsCard}>
              <View style={styles.statItem}>
                <Text style={styles.statNumber}>{followersCount}</Text>
                <Text style={styles.statLabel}>FOLLOWERS</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={styles.statNumber}>{followingCount}</Text>
                <Text style={styles.statLabel}>FOLLOWING</Text>
              </View>
            </View>

            {currentUserId !== userId && (
              <>
                <View style={styles.actionButtonWrapWide}>
                  <View pointerEvents="none" style={[styles.actionButtonShadow, isFollowing ? styles.actionButtonShadowDanger : styles.actionButtonShadowPrimary]} />
                  <Pressable
                    onPress={toggleFollow}
                    disabled={followLoading}
                    style={({ pressed }) => [
                      styles.actionButtonFace,
                      isFollowing ? styles.followingButton : styles.followButton,
                      pressed && !followLoading && styles.actionButtonPressed,
                    ]}
                  >
                    {followLoading ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={[styles.followButtonText, isFollowing && styles.followingButtonText]}>
                        {isFollowing ? "Unfollow" : "Follow"}
                      </Text>
                    )}
                  </Pressable>
                </View>

                <View style={styles.actionButtonWrapWide}>
                  <View pointerEvents="none" style={[styles.actionButtonShadow, styles.actionButtonShadowGarden]} />
                  <Pressable
                    onPress={() => navigation.navigate("UserGarden", {
                      userId,
                      readOnly: true,
                      username: profileData?.username || "User",
                    })}
                    style={({ pressed }) => [
                      styles.actionButtonFace,
                      styles.viewGardenButton,
                      pressed && styles.actionButtonPressed,
                    ]}
                  >
                    <Ionicons name="flower-outline" size={18} color="#ffffff" />
                    <Text style={styles.viewGardenButtonText}>View Garden</Text>
                  </Pressable>
                </View>
              </>
            )}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Activity Stats</Text>
          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Overall Score</Text>
              <Text style={[styles.infoValue, styles.scoreValue]}>{profileData?.overallScore || 0} pts</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Overall App Streak</Text>
              <Text style={styles.infoValue}>{profileData?.streakCount || 0} Days</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Achievements</Text>
          {unlockedAchievements.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>This user hasn't unlocked any achievements yet.</Text>
            </View>
          ) : (
            <View style={styles.achievementsList}>
              {unlockedAchievements.map((ach, index) => (
                <View key={index} style={styles.achievementCard}>
                  <View style={styles.iconWrap}>
                    <Ionicons name={ach.icon} size={32} color="#FF9600" />
                  </View>
                  <View style={styles.achTextWrap}>
                    <Text style={styles.achievementTitle}>{ach.title}</Text>
                    <Text style={styles.achievementDesc}>{ach.desc}</Text>
                    <Text style={styles.completedText}>COMPLETED</Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screenWrap: { flex: 1, backgroundColor: theme.bg, paddingHorizontal: 16 },
  container: { flex: 1 },
  headerTopSpacer: { height: 65 },
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
  headerBtnPlaceholder: { width: 42, height: 42 },
  headerTitle: { fontSize: 22, fontWeight: "900", color: theme.text, flexShrink: 1, fontFamily: 'CeraRoundProDEMO-Black' },
  userSection: { marginBottom: 20 },
  profileCard: {
    backgroundColor: '#ffffff',
    borderRadius: 28,
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 16,
    shadowColor: '#cdcdcd',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 2,
    alignItems: "center",
  },
  // avatar removed
  userName: { fontSize: 24, fontWeight: "900", color: theme.text, margin: 10, fontFamily: 'CeraRoundProDEMO-Black' },
  profileSub: { marginTop: 4, fontSize: 13, fontWeight: "700", color: theme.text2, marginBottom: 14, fontFamily: 'CeraRoundProDEMO-Black' },
  statsCard: {
    flexDirection: "row",
    width: "100%",
    backgroundColor: '#f6fafd',
    borderRadius: 20,
    paddingVertical: 14,
    paddingHorizontal: 12,
    alignItems: "center",
    marginBottom: 14,
  },
  statItem: { flex: 1, alignItems: "center" },
  statNumber: { fontSize: 21, fontWeight: "900", color: "#000000", marginBottom: 2, fontFamily: 'CeraRoundProDEMO-Black' },
  statLabel: { fontSize: 11, color: "#6b7987", fontWeight: "900", letterSpacing: 0.8, fontFamily: 'CeraRoundProDEMO-Black' },
  statDivider: { width: 1, height: 34, backgroundColor: "#d4e1ee", marginHorizontal: 10 },
  actionButtonWrapWide: {
    width: '100%',
    height: 56,
    position: 'relative',
    marginBottom: 10,
  },
  actionButtonShadow: {
    position: 'absolute',
    top: 4,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 20,
  },
  actionButtonShadowPrimary: { backgroundColor: '#4aa93a' },
  actionButtonShadowDanger: { backgroundColor: '#c63b3b' },
  actionButtonShadowGarden: { backgroundColor: '#3b7b46' },
  actionButtonFace: {
    height: 52,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    flexDirection: 'row',
    gap: 8,
  },
  actionButtonPressed: {
    transform: [{ translateY: 4 }],
  },
  followButton: { backgroundColor: '#59d700' },
  followButtonText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  followingButton: { backgroundColor: '#e14f4f' },
  followingButtonText: { color: '#fff' },
  viewGardenButton: { backgroundColor: '#54b766' },
  viewGardenButtonText: { color: "#ffffff", fontWeight: "800", fontSize: 15 },
  section: { marginBottom: 18 },
  sectionLabel: { fontSize: 12, fontWeight: "900", color: '#000000', marginBottom: 8, textTransform: "uppercase", letterSpacing: 1, fontFamily: 'CeraRoundProDEMO-Black' },
  infoCard: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    paddingHorizontal: 14,
    shadowColor: '#cdcdcd',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 2,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#edf2f6',
  },
  infoLabel: { fontSize: 14, fontWeight: "800", color: theme.text, fontFamily: 'CeraRoundProDEMO-Black' },
  infoValue: { fontSize: 14, fontWeight: "900", color: theme.text2, fontFamily: 'CeraRoundProDEMO-Black' },
  scoreValue: { color: '#2D5A27' },
  achievementsList: { flexDirection: "column" },
  achievementCard: { flexDirection: "row", alignItems: "center", backgroundColor: "#ffffff", borderRadius: 24, padding: 14, marginBottom: 10, shadowColor: '#cdcdcd', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 1, shadowRadius: 0, elevation: 2 },
  iconWrap: { width: 62, height: 62, borderRadius: 31, justifyContent: "center", alignItems: "center", marginRight: 14, backgroundColor: "#ffe8a3" },
  achTextWrap: { flex: 1 },
  achievementTitle: { fontSize: 17, fontWeight: "900", color: theme.text, marginBottom: 3, fontFamily: 'CeraRoundProDEMO-Black' },
  achievementDesc: { fontSize: 13, color: "#677786", fontWeight: "700", lineHeight: 18, fontFamily: 'CeraRoundProDEMO-Black' },
  completedText: { marginTop: 8, fontSize: 12, fontWeight: "900", color: "#FF9600", letterSpacing: 1, fontFamily: 'CeraRoundProDEMO-Black' },
  emptyCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 16,
    shadowColor: '#cdcdcd',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 2,
  },
  emptyText: { color: theme.muted, fontStyle: 'italic', textAlign: "center" }
});