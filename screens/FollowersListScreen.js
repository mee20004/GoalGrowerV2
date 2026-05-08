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
      <View style={styles.headerTopSpacer} />
      <View style={styles.headerWrapper}>
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.headerBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="chevron-back" size={26} color={theme.accent} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Followers</Text>
          <View style={styles.headerBtnPlaceholder} />
        </View>
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
              <View key={user.id || index} style={styles.userCard}>
                <View style={styles.userRow}>
                  {/* Avatar removed for cleaner look */}
                  <View style={styles.userInfo}>
                    <Text style={styles.username}>{user.username || user.id}</Text>
                  </View>
                  <View style={styles.buttonGroup}>
                    <TouchableOpacity
                      style={styles.viewButton}
                      onPress={() => navigation.navigate("UserProfile", { userId: user.id || user.uid })}
                    >
                      <Text style={styles.viewButtonText}>View Profile</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleFollowAction(user.id, isFollowing)}
                      disabled={actionLoading[user.id]}
                      style={[styles.actionButton, isFollowing ? styles.unfollowButton : styles.followBackButton, actionLoading[user.id] && styles.disabledButton]}
                      accessibilityLabel={isFollowing ? "Unfollow" : "Follow back"}
                    >
                      <Text style={styles.actionButtonText}>{isFollowing ? "Unfollow" : "Follow back"}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
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
  headerTopSpacer: { height: 40 },
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
  headerBtnPlaceholder: {
    width: 42,
    height: 42,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "900",
    color: theme.text,
    flexShrink: 1,
    fontFamily: 'CeraRoundProDEMO-Black',
    letterSpacing: 0.1,
  },
  userCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    shadowColor: '#4c6782',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.16,
    shadowRadius: 0,
    elevation: 3,
    marginBottom: 14,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  userRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 6,
    gap: 8,
  },
  // userAvatar removed
  userInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  username: {
    fontSize: 16,
    fontWeight: "900",
    color: theme.text,
    fontFamily: 'CeraRoundProDEMO-Black',
    letterSpacing: 0.1,
    paddingVertical: 8,
  },
  buttonGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginLeft: 'auto',
  },
  viewButton: {
    backgroundColor: '#28b900',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    shadowColor: '#28b900',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 2,
    marginRight: 4,
    minWidth: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewButtonText: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 15,
    fontFamily: 'CeraRoundProDEMO-Black',
    letterSpacing: 0.2,
    marginLeft: 2,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    shadowColor: '#4B9CD3',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.10,
    shadowRadius: 4,
    elevation: 2,
    marginLeft: 4,
    minWidth: 80,
    justifyContent: 'center',
  },
  followBackButton: {
    backgroundColor: '#4B9CD3',
  },
  unfollowButton: {
    backgroundColor: '#E57373',
  },
  actionButtonText: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 14,
    fontFamily: 'CeraRoundProDEMO-Black',
    letterSpacing: 0.2,
    marginLeft: 0,
    textAlign: 'center',
  },
  disabledButton: {
    opacity: 0.5,
  },
  emptyText: { color: theme.muted, fontStyle: 'italic', marginTop: 40, textAlign: "center", fontSize: 16 },
});
