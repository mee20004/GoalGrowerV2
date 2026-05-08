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
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color="#A88F6F" />
      </View>
    );
  }

  const unlockedIds = profileData?.unlockedAchievements || [];
  const unlockedAchievements = ACHIEVEMENTS.filter(ach => unlockedIds.includes(ach.id));

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 64 }}>
      <View style={styles.headerTopSpacer} />
      <View style={styles.headerWrapper}>
        <View style={styles.headerRow}>
          <Text style={styles.headerTitle}>Profile</Text>
          <TouchableOpacity style={styles.headerBtn} onPress={() => navigation.navigate("Settings")}> 
            <Ionicons name="settings-outline" size={22} color={theme.text2} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.userSection}>
        <View style={styles.profileCard}>
            {/* Avatar removed */}
          <Text style={styles.userName}>{profileData?.username || "User"}</Text>

          <View style={styles.statsCard}>
            <TouchableOpacity style={styles.statItem} onPress={() => navigation.navigate("FollowersListScreen")}> 
              <Text style={styles.statNumber}>{followers.length}</Text>
              <Text style={styles.statLabel}>FOLLOWERS</Text>
            </TouchableOpacity>

            <View style={styles.statDivider} />

            <TouchableOpacity style={styles.statItem} onPress={() => navigation.navigate("FollowingListScreen")}> 
              <Text style={styles.statNumber}>{following.length}</Text>
              <Text style={styles.statLabel}>FOLLOWING</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Activity Stats</Text>
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
        <Text style={styles.sectionTitle}>Achievements</Text>
        {unlockedAchievements.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>Complete goals to start earning achievements!</Text>
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
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.bg,
    paddingHorizontal: 16,
    paddingTop: 0,
  },
  loadingWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: theme.bg,
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
  headerTitle: {
    fontSize: 22,
    fontWeight: "900",
    color: theme.text,
    flexShrink: 1,
    fontFamily: 'CeraRoundProDEMO-Black',
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
  userSection: {
    marginBottom: 20,
  },
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
  avatar: {
  },
    // avatar removed
  userName: {
    fontSize: 24,
    fontWeight: "900",
    color: theme.text,
    margin: 10,
    fontFamily: 'CeraRoundProDEMO-Black',
  },
  profileSub: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: "700",
    color: theme.text2,
    marginBottom: 14,
    fontFamily: 'CeraRoundProDEMO-Black',
  },
  statsCard: {
    flexDirection: "row",
    width: "100%",
    backgroundColor: '#f6fafd',
    borderRadius: 20,
    paddingVertical: 14,
    paddingHorizontal: 12,
    alignItems: "center",
  },
  statItem: {
    flex: 1,
    alignItems: "center",
  },
  statNumber: {
    fontSize: 21,
    fontWeight: "900",
    color: "#000000",
    marginBottom: 2,
    fontFamily: 'CeraRoundProDEMO-Black',
  },
  statLabel: {
    fontSize: 11,
    color: "#6b7987",
    fontWeight: "900",
    letterSpacing: 0.8,
    fontFamily: 'CeraRoundProDEMO-Black',
  },
  statDivider: {
    width: 1,
    height: 34,
    backgroundColor: "#d4e1ee",
    marginHorizontal: 10,
  },
  section: {
    marginBottom: 18,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "900",
    color: '#000000',
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 1,
    fontFamily: 'CeraRoundProDEMO-Black',
  },
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
  infoLabel: {
    fontSize: 14,
    fontWeight: "800",
    color: theme.text,
    fontFamily: 'CeraRoundProDEMO-Black',
  },
  infoValue: {
    fontSize: 14,
    fontWeight: "900",
    color: theme.text2,
    fontFamily: 'CeraRoundProDEMO-Black',
  },
  scoreValue: {
    color: "#000000",
  },
  achievementsList: {
    flexDirection: "column",
  },
  achievementCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 24,
    padding: 14,
    marginBottom: 10,
    shadowColor: '#cdcdcd',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 2,
  },
  iconWrap: {
    width: 62,
    height: 62,
    borderRadius: 31,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 14,
    backgroundColor: "#ffe8a3",
  },
  achTextWrap: {
    flex: 1,
  },
  achievementTitle: {
    fontSize: 17,
    fontWeight: "900",
    color: theme.text,
    marginBottom: 3,
    fontFamily: 'CeraRoundProDEMO-Black',
  },
  achievementDesc: {
    fontSize: 13,
    color: "#677786",
    fontWeight: "700",
    lineHeight: 18,
    fontFamily: 'CeraRoundProDEMO-Black',
  },
  completedText: {
    marginTop: 6,
    fontSize: 11,
    fontWeight: "900",
    color: "#FF9600",
    letterSpacing: 1,
    fontFamily: 'CeraRoundProDEMO-Black',
  },
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
  emptyText: {
    color: theme.muted,
    fontStyle: 'italic',
    textAlign: "center",
    fontFamily: 'CeraRoundProDEMO-Black',
  },
});