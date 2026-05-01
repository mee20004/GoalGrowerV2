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
          setFollowing(followingSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
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
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Following</Text>
      </View>
      {loading ? (
        <ActivityIndicator size="large" color="#A88F6F" style={{ marginTop: 40 }} />
      ) : following.length === 0 ? (
        <Text style={styles.emptyText}>You aren't following anyone yet.</Text>
      ) : (
        <ScrollView>
          {following.map((user, index) => (
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
              <TouchableOpacity
                onPress={() => handleUnfollow(user.id)}
                disabled={actionLoading[user.id]}
                style={[styles.actionButton, styles.unfollowButton, { marginLeft: 10, opacity: actionLoading[user.id] ? 0.5 : 1 }]}
                accessibilityLabel="Unfollow"
              >
                <Ionicons
                  name="person-remove"
                  size={18}
                  color="#fff"
                />
              </TouchableOpacity>
            </View>
          ))}
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
  viewButtonText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  actionButton: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  unfollowButton: { backgroundColor: '#E57373' },
  emptyText: { color: theme.muted, fontStyle: 'italic', marginTop: 40, textAlign: "center", fontSize: 16 },
});
