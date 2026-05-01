import React, { useEffect, useState, useCallback } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { collection, getDocs, doc, getDoc, setDoc, deleteDoc } from "firebase/firestore";
import { db, auth } from "../firebaseConfig";
import { theme } from "../theme";
import Ionicons from "@expo/vector-icons/Ionicons";

export default function FollowersListScreen({ route, navigation }) {
  const { userId } = route.params || {};
  const [followers, setFollowers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [followingIds, setFollowingIds] = useState([]);
  const [actionLoading, setActionLoading] = useState({});
  // Follow back or unfollow handler
  const handleFollowAction = async (targetId, isFollowing) => {
    const uid = userId || auth.currentUser?.uid;
    setActionLoading(prev => ({ ...prev, [targetId]: true }));
    try {
      if (isFollowing) {
        // Unfollow: remove from following
        await deleteDoc(doc(db, "users", uid, "following", targetId));
        setFollowingIds(prev => prev.filter(id => id !== targetId));
      } else {
        // Follow back: add to following
        await setDoc(doc(db, "users", uid, "following", targetId), { uid: targetId, timestamp: new Date() });
        setFollowingIds(prev => [...prev, targetId]);
      }
    } catch (e) {
      console.error("Error updating follow status:", e);
    } finally {
      setActionLoading(prev => ({ ...prev, [targetId]: false }));
    }
  };

  useFocusEffect(
    useCallback(() => {
      const fetchFollowersAndFollowing = async () => {
        try {
          const uid = userId || auth.currentUser?.uid;
          // Fetch followers
          const followersRef = collection(db, "users", uid, "followers");
          const followersSnap = await getDocs(followersRef);
          let followersArr = followersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          // Fetch usernames for followers missing username
          const updatedFollowers = await Promise.all(followersArr.map(async (follower) => {
            if (!follower.username) {
              try {
                const userDoc = await getDoc(doc(db, "users", follower.id));
                if (userDoc.exists()) {
                  return { ...follower, username: userDoc.data().username || follower.id };
                }
              } catch {}
            }
            return follower;
          }));
          setFollowers(updatedFollowers);

          // Fetch who the current user is following
          const followingRef = collection(db, "users", uid, "following");
          const followingSnap = await getDocs(followingRef);
          setFollowingIds(followingSnap.docs.map(doc => doc.id));
        } catch (error) {
          console.error("Error fetching followers/following list:", error);
        } finally {
          setLoading(false);
        }
      };
      fetchFollowersAndFollowing();
    }, [userId])
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Followers</Text>
      </View>
      {loading ? (
        <ActivityIndicator size="large" color="#A88F6F" style={{ marginTop: 50 }} />
      ) : followers.length === 0 ? (
        <Text style={styles.emptyText}>You have no followers yet.</Text>
      ) : (
        <ScrollView>
          {followers.map((user, index) => {
            const isFollowing = followingIds.includes(user.id);
            return (
              <View key={user.id || index} style={styles.userRow}>
                <View style={styles.userAvatar}>
                  <Ionicons name="person" size={20} color={theme.muted} />
                </View>
                <Text style={styles.listUserName}>{user.username || user.id}</Text>
                <TouchableOpacity
                  style={styles.viewButton}
                  onPress={() => navigation.navigate("UserProfile", { userId: user.id || user.uid })}
                >
                  <Text style={styles.viewButtonText}>View Profile</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleFollowAction(user.id, isFollowing)}
                  disabled={actionLoading[user.id]}
                  style={[styles.actionButton, isFollowing ? styles.unfollowButton : styles.followBackButton, { marginLeft: 10, opacity: actionLoading[user.id] ? 0.5 : 1 }]}
                  accessibilityLabel={isFollowing ? "Unfollow" : "Follow back"}
                >
                  <Ionicons
                    name={isFollowing ? "person-remove" : "person-add"}
                    size={18}
                    color={isFollowing ? "#fff" : "#fff"}
                  />
                </TouchableOpacity>
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg, padding: 16 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: 24,
    shadowColor: '#4c6782',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.16,
    shadowRadius: 0,
    elevation: 3,
    marginTop: 8,
    marginBottom: 12,
    paddingLeft: 16,
    paddingRight: 10,
    minHeight: 44,
  },
  backBtn: { marginRight: 12, padding: 4 },
  headerTitle: { fontSize: 22, fontWeight: "900", color: theme.text },
  userRow: { flexDirection: "row", alignItems: "center", backgroundColor: "#E0F7D4", borderRadius: 8, padding: 12, marginBottom: 8 },
  userAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: theme.surface, alignItems: "center", justifyContent: "center", marginRight: 12 },
  listUserName: { flex: 1, fontSize: 16, fontWeight: "700", color: theme.text },
  viewButton: { backgroundColor: "#2D5A27", paddingHorizontal: 16, paddingVertical: 6, borderRadius: 8 },
  actionButton: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  followBackButton: { backgroundColor: '#4B9CD3' },
  unfollowButton: { backgroundColor: '#E57373' },
  viewButtonText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  emptyText: { color: theme.muted, fontStyle: 'italic', marginTop: 40, textAlign: "center", fontSize: 16 },
});
