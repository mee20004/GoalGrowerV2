// screens/RankScreen.js
import React, { useState, useCallback } from "react";
import { View, Text, StyleSheet, FlatList, ActivityIndicator, TouchableOpacity, Image } from "react-native";
import * as Haptics from "expo-haptics";
import { useFocusEffect } from "@react-navigation/native";
import { collection, query, orderBy, limit, getDocs, doc, getDoc } from "firebase/firestore";
import { auth, db } from "../firebaseConfig";
import { theme } from "../theme";
import Page from "../components/Page";
import Ionicons from "@expo/vector-icons/Ionicons";
import FireStreakIcon from "../assets/Icons/FireStreakIcon";

const FILTERS = [
  { key: "global", label: "Global" },
  { key: "followers", label: "Followers" },
  { key: "following", label: "Following" },
];

export default function RankScreen({ navigation }) {
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState("global");

  useFocusEffect(
    useCallback(() => {
      fetchLeaderboard(activeFilter);
    }, [activeFilter])
  );

  const fetchLeaderboard = async (filter = "global") => {
    setLoading(true);
    try {
      if (filter === "global") {
        const usersRef = collection(db, "users");
        const q = query(usersRef, orderBy("overallScore", "desc"), limit(50));
        const querySnapshot = await getDocs(q);

        const currentUid = auth.currentUser?.uid;
        let rankedUsers = querySnapshot.docs
          .map((userDoc) => ({ id: userDoc.id, ...userDoc.data() }))
          .filter((user) => !user.privateAccount || user.id === currentUid)
          .slice(0, 50);

        // Ensure the logged-in user is present if they're not in the top 50
        if (currentUid && !rankedUsers.some((user) => user.id === currentUid)) {
          const currentUserDoc = await getDoc(doc(db, "users", currentUid));
          if (currentUserDoc.exists()) {
            rankedUsers.push({ id: currentUserDoc.id, ...currentUserDoc.data() });
          }
        }

        rankedUsers = rankedUsers
          .sort((a, b) => (Number(b.overallScore) || 0) - (Number(a.overallScore) || 0))
          .map((user, index) => ({ ...user, rank: index + 1 }));

        setLeaderboard(rankedUsers);
        return;
      }

      const currentUid = auth.currentUser?.uid;
      if (!currentUid) {
        setLeaderboard([]);
        return;
      }

      const relationCollection = filter === "followers" ? "followers" : "following";
      const relationSnap = await getDocs(collection(db, "users", currentUid, relationCollection));
      const relationIds = Array.from(
        new Set(
          relationSnap.docs
            .map((relationDoc) => relationDoc.id || relationDoc.data()?.uid)
            .filter(Boolean)
        )
      );

      if (relationIds.length === 0) {
        setLeaderboard([]);
        return;
      }

      // Always include the current user
      const allIds = Array.from(new Set([...relationIds, currentUid]));
      const userDocs = await Promise.all(
        allIds.map((uid) => getDoc(doc(db, "users", uid)))
      );

      const rankedUsers = userDocs
        .filter((userDoc) => userDoc.exists())
        .map((userDoc) => ({ id: userDoc.id, ...userDoc.data() }))
        .sort((a, b) => (Number(b.overallScore) || 0) - (Number(a.overallScore) || 0))
        .slice(0, 50)
        .map((user, index) => ({ ...user, rank: index + 1 }));

      setLeaderboard(rankedUsers);
    } catch (error) {
      console.error("Error fetching leaderboard:", error);
    } finally {
      setLoading(false);
    }
  };

  const leaderboardTitle =
    activeFilter === "global"
      ? "Global Leaderboard"
      : activeFilter === "followers"
        ? "Followers Leaderboard"
        : "Following Leaderboard";

  const emptyMessage =
    activeFilter === "global"
      ? "No ranked users yet. Be the first!"
      : activeFilter === "followers"
        ? "No followers to rank yet."
        : "No following users to rank yet.";

  const triggerFilterHaptic = () => {
    Haptics.selectionAsync().catch(() => {});
  };

  const renderRankIcon = (rank) => {
    if (rank === 1) return <Text style={styles.medal}>🥇</Text>;
    if (rank === 2) return <Text style={styles.medal}>🥈</Text>;
    if (rank === 3) return <Text style={styles.medal}>🥉</Text>;
    return <Text style={styles.rankNumber}>#{rank}</Text>;
  };

  const renderItem = ({ item }) => {
    const isCurrentUser = item.id === auth.currentUser?.uid;

    return (
      <TouchableOpacity
        style={[styles.userCard, isCurrentUser && styles.currentUserCard]}
        onPress={() => {
          if (isCurrentUser) {
            navigation.navigate("ProfileTab", {
              screen: "ProfileHome",
              params: {},
            });
          } else {
            navigation.navigate("UserProfile", { userId: item.id });
          }
        }}
        activeOpacity={0.7}
      >
        <View style={styles.rankContainer}>
	  {renderRankIcon(item.rank)}
        </View>

        <View style={styles.userInfo}>
          <Text style={[styles.username, isCurrentUser && styles.currentUsername]}>
            {item.username || "Unknown"} {isCurrentUser && "(You)"}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Image source={FireStreakIcon} style={{ width: 18, height: 18, marginRight: 2 }} resizeMode="contain" />
            <Text style={styles.streakText}>{item.streakCount || 0} Day Streak</Text>
          </View>
        </View>

        <View style={styles.scoreContainer}>
          <Text style={styles.scoreNumber}>{item.overallScore || 0}</Text>
          <Text style={styles.scoreLabel}>pts</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <Page>
      <View style={styles.container}>
      <View style={styles.headerWrapper}>
        <View style={styles.headerContent}>
          <View style={styles.headerRow}>
            <Text style={styles.headerTitle}>Rank</Text>

            <View style={styles.filterRow}>
              {FILTERS.map((filter) => {
                const isActive = activeFilter === filter.key;
                return (
                  <TouchableOpacity
                    key={filter.key}
                    style={[styles.filterChip, isActive && styles.filterChipActive]}
                    onPress={() => {
                      triggerFilterHaptic();
                      setActiveFilter(filter.key);
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.filterChipText, isActive && styles.filterChipTextActive]}>{filter.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>
      </View>

      {loading ? (
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color="#2D5A27" />
        </View>
      ) : (
        <FlatList
          data={leaderboard}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <Text style={styles.emptyText}>{emptyMessage}</Text>
          }
        />
      )}
      </View>
    </Page>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  centerContent: { flex: 1, justifyContent: "center", alignItems: "center" },

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
  headerContent: {
    paddingVertical: 0,
    paddingHorizontal: 0,
    paddingLeft: 16,
    alignItems: 'stretch',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    minHeight: 44,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: theme.text,
  },
  filterRow: {
    marginTop: 0,
    flexDirection: 'row',
    gap: 4,
    alignItems: 'center',
    justifyContent: 'flex-end',
    flexWrap: 'nowrap',
    backgroundColor: '#aaaaaa00',
    borderRadius: 18,
    padding: 7,
    flexShrink: 1,
  },
  filterChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: '#dcdcdc',
    borderWidth: 1,
    borderColor: 'transparent',
    marginHorizontal: 0,
  },
  filterChipActive: {
    backgroundColor: '#28b900',
  },
  filterChipText: {
    fontSize: 14,
    fontWeight: "900",
    color: "#ffffff",
  },
  filterChipTextActive: {
    color: "#fff",
  },

  listContent: { paddingTop: 4, paddingBottom: 100, gap: 10 },

  userCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.surface,
    paddingHorizontal: 22,
    paddingVertical: 22,
    borderRadius: 32,
    marginBottom: 12,
    borderWidth: 0,
    borderColor: "#cdcdcd",
    shadowColor: '#cdcdcd',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 2,
  },
  currentUserCard: {
    borderColor: '#28b900',
    backgroundColor: '#ffffff',
    shadowColor: '#28b900',
  },

  rankContainer: { width: 40, alignItems: "center", justifyContent: "center", marginRight: 8 },
  medal: { fontSize: 28 },
  rankNumber: { fontSize: 18, fontWeight: "900", color: theme.muted },

  // avatar removed

  userInfo: { flex: 1 },
  username: { fontSize: 16, fontWeight: "900", color: theme.text, marginBottom: 4 },
  currentUsername: { color: '#28b900' },
  streakText: { fontSize: 12, fontWeight: "800", color: "#FF9600" },

  scoreContainer: { alignItems: "flex-end", justifyContent: "center" },
  scoreNumber: { fontSize: 20, fontWeight: "900", color: '#28b900' },
  scoreLabel: { fontSize: 10, fontWeight: "800", color: theme.muted, marginTop: -2 },

  emptyText: { textAlign: "center", color: theme.muted, marginTop: 40, fontStyle: "italic", fontWeight: '900', fontSize: 16 },
});