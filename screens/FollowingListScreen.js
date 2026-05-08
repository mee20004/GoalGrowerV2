import React, { useEffect, useState, useCallback } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { collection, getDocs, doc, getDoc, deleteDoc } from "firebase/firestore";
import { db, auth } from "../firebaseConfig";
import { theme } from "../theme";
import Ionicons from "@expo/vector-icons/Ionicons";

export default function FollowingListScreen({ route, navigation }) {
  const { userId } = route.params || {};
  const [following, setFollowing] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState({});
  // Unfollow handler
  const handleUnfollow = async (targetId) => {
    const uid = userId || auth.currentUser?.uid;
    setActionLoading(prev => ({ ...prev, [targetId]: true }));
    try {
      await deleteDoc(doc(db, "users", uid, "following", targetId));
      setFollowing(prev => prev.filter(user => user.id !== targetId));
    } catch (e) {
      console.error("Error unfollowing:", e);
    } finally {
      setActionLoading(prev => ({ ...prev, [targetId]: false }));
    }
  };

  useFocusEffect(
    useCallback(() => {
      const fetchFollowing = async () => {
        try {
          const uid = userId || auth.currentUser?.uid;
          const followingRef = collection(db, "users", uid, "following");
          const followingSnap = await getDocs(followingRef);
          let followingArr = followingSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          // Fetch usernames for following missing username
          const updatedFollowing = await Promise.all(followingArr.map(async (user) => {
            if (!user.username) {
              try {
                const userDoc = await getDoc(doc(db, "users", user.id));
                if (userDoc.exists()) {
                  return { ...user, username: userDoc.data().username || user.id };
                }
              } catch {}
            }
            return user;
          }));
          setFollowing(updatedFollowing);
        } catch (error) {
          console.error("Error fetching following list:", error);
        } finally {
          setLoading(false);
        }
      };
      fetchFollowing();
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
          <Text style={styles.headerTitle}>Following</Text>
          <View style={styles.headerBtnPlaceholder} />
        </View>
      </View>
      {loading ? (
        <ActivityIndicator size="large" color="#A88F6F" style={{ marginTop: 50 }} />
      ) : following.length === 0 ? (
        <Text style={styles.emptyText}>You aren't following anyone yet.</Text>
      ) : (
        <ScrollView>
          {/* User rows will be updated in next steps */}
          {following.map((user, index) => (
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
                    onPress={() => handleUnfollow(user.id)}
                    disabled={actionLoading[user.id]}
                    style={[styles.actionButton, styles.unfollowButton, actionLoading[user.id] && styles.disabledButton]}
                    accessibilityLabel="Unfollow"
                  >
                    <Text style={styles.actionButtonText}>Unfollow</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ))}
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
