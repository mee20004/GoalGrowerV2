// ProfileScreen.js
import React, { useState, useCallback, useRef } from "react";
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, TextInput, Alert } from "react-native";
import * as WebBrowser from "expo-web-browser";
import HapticTouchableOpacity from "../components/HapticTouchableOpacity";
import HapticPressable from "../components/HapticPressable";
import { HapticType } from "../utils/haptics";
import { useFocusEffect } from "@react-navigation/native";
import { doc, getDoc, collection, getDocs, query, where, writeBatch, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../firebaseConfig";
import theme, { useTheme } from "../theme";
import { cpShadow } from "../utils/shadows";
import Ionicons from "@expo/vector-icons/Ionicons";
import { updateOverallScoreForUser } from "../utils/scoreUtils";
import { useSubscription } from "../components/SubscriptionProvider";
import ProBadge from "../components/ProBadge";

const FEEDBACK_URL = "https://goalgrower.userjot.com/?cursor=1&order=top&limit=10";
const FEEDBACK_FACE = "#FB923C";
const FEEDBACK_SHADOW = "#F97316";
const FEEDBACK_BUTTON_DEPTH = 4;

export default function ProfileScreen({ navigation }) {
  const { theme } = useTheme();
  const { isPro } = useSubscription();
  const [profileData, setProfileData] = useState(null);
  const [followers, setFollowers] = useState([]);
  const [following, setFollowing] = useState([]);
  const [loading, setLoading] = useState(true);
  const [friendUsername, setFriendUsername] = useState("");
  const [addingFriend, setAddingFriend] = useState(false);
  const focusActiveRef = useRef(false);

  const fetchSocialData = useCallback(async (uid, { refreshScore = true } = {}) => {
    try {
      const userRef = doc(db, "users", uid);
      const followersRef = collection(db, "users", uid, "followers");
      const followingRef = collection(db, "users", uid, "following");

      const [userSnap, followersSnap, followingSnap] = await Promise.all([
        getDoc(userRef),
        getDocs(followersRef),
        getDocs(followingRef),
      ]);

      const userData = userSnap.exists() ? userSnap.data() : {};
      setProfileData(userData);
      setFollowers(followersSnap.docs.map((followerDoc) => ({ id: followerDoc.id, ...followerDoc.data() })));
      setFollowing(followingSnap.docs.map((followingDoc) => ({ id: followingDoc.id, ...followingDoc.data() })));

      if (refreshScore) {
        void updateOverallScoreForUser(uid)
          .then((score) => {
            if (!focusActiveRef.current) return;
            setProfileData((prev) => (prev ? { ...prev, overallScore: score } : prev));
          })
          .catch((error) => {
            console.error("Error refreshing overall score:", error);
          });
      }
    } catch (error) {
      console.error("Error fetching social data:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      focusActiveRef.current = true;
      const uid = auth.currentUser?.uid;
      if (uid) {
        fetchSocialData(uid);
      }
      return () => {
        focusActiveRef.current = false;
      };
    }, [fetchSocialData])
  );

  const handleAddFriendByUsername = async () => {
    const enteredUsername = friendUsername.trim();
    if (!enteredUsername) {
      Alert.alert("Notice", "Enter a username.");
      return;
    }
    if (!auth.currentUser?.uid) return;

    setAddingFriend(true);
    try {
      const normalizedUsername = enteredUsername.toLowerCase();

      // Primary lookup: normalized search key (fast path if populated)
      const searchKeyQuery = query(collection(db, "users"), where("searchKey", "==", normalizedUsername));
      let userSnapshot = await getDocs(searchKeyQuery);

      // Fallback 1: exact username field
      if (userSnapshot.empty) {
        const usernameQuery = query(collection(db, "users"), where("username", "==", enteredUsername));
        userSnapshot = await getDocs(usernameQuery);
      }

      // Fallback 2: case-insensitive local match (for older docs without searchKey)
      let targetDoc = userSnapshot.docs.find((d) => d.id !== auth.currentUser.uid);
      if (!targetDoc) {
        const allUsersSnapshot = await getDocs(collection(db, "users"));
        targetDoc = allUsersSnapshot.docs.find((d) => {
          if (d.id === auth.currentUser.uid) return false;
          const username = String(d.data()?.username || "").trim().toLowerCase();
          return username === normalizedUsername;
        });
      }

      if (!targetDoc) {
        Alert.alert("Not found", `No user found matching "${enteredUsername}".`);
        return;
      }

      const targetUser = { id: targetDoc.id, ...targetDoc.data() };
      const myUid = auth.currentUser.uid;

      const myProfileSnap = await getDoc(doc(db, "users", myUid));
      const myUsername = myProfileSnap.exists() ? (myProfileSnap.data()?.username || "User") : "User";

      const batch = writeBatch(db);
      batch.set(doc(db, "users", myUid, "following", targetUser.id), {
        uid: targetUser.id,
        username: targetUser.username,
        followedAt: serverTimestamp(),
      });
      batch.set(doc(db, "users", targetUser.id, "followers", myUid), {
        uid: myUid,
        username: myUsername,
        followedAt: serverTimestamp(),
      });
      await batch.commit();

      setFriendUsername("");
      await fetchSocialData(myUid, { refreshScore: false });
      Alert.alert("Success", `You are now following ${targetUser.username}.`);
    } catch (error) {
      console.error("Error adding friend by username:", error);
      Alert.alert("Error", "Could not add friend right now.");
    } finally {
      setAddingFriend(false);
    }
  };

  const handleOpenFeedback = async () => {
    try {
      await WebBrowser.openBrowserAsync(FEEDBACK_URL);
    } catch (error) {
      console.error("Error opening feedback board:", error);
      Alert.alert("Unable to open", "Could not open the feedback board right now.");
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color="#A88F6F" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 64 }}>
      <View style={styles.headerTopSpacer} />
      <View style={styles.headerWrapper}>
        <View style={styles.headerRow}>
          <Text style={styles.headerTitle}>Profile</Text>
          <HapticTouchableOpacity style={styles.headerBtn} onPress={() => navigation.navigate("Settings")}> 
            <Ionicons name="settings-outline" size={22} color={theme.text2} />
          </HapticTouchableOpacity>
        </View>
      </View>

      <View style={styles.userSection}>
        <View style={styles.profileCard}>
            {/* Avatar removed */}
          <View style={styles.userNameRow}>
            <Text style={styles.userName}>{profileData?.username || "User"}</Text>
            {isPro && <ProBadge height={26} />}
          </View>

          <View style={styles.statsCard}>
            <HapticTouchableOpacity style={styles.statItem} onPress={() => navigation.navigate("FollowersListScreen")}> 
              <Text style={styles.statNumber}>{followers.length}</Text>
              <Text style={styles.statLabel}>FOLLOWERS</Text>
            </HapticTouchableOpacity>

            <View style={styles.statDivider} />

            <HapticTouchableOpacity style={styles.statItem} onPress={() => navigation.navigate("FollowingListScreen")}> 
              <Text style={styles.statNumber}>{following.length}</Text>
              <Text style={styles.statLabel}>FOLLOWING</Text>
            </HapticTouchableOpacity>
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Add Friend</Text>
        <View style={styles.infoCard}>
          <View style={styles.friendInputRow}>
            <TextInput
              style={styles.friendInput}
              placeholder="Enter exact username"
              autoCapitalize="none"
              value={friendUsername}
              onChangeText={setFriendUsername}
              onSubmitEditing={handleAddFriendByUsername}
              editable={!addingFriend}
            />
            <HapticTouchableOpacity
              style={[styles.addFriendBtn, { backgroundColor: theme.accent }, addingFriend && styles.addFriendBtnDisabled]}
              onPress={handleAddFriendByUsername}
              disabled={addingFriend}
            >
              <Text style={styles.addFriendBtnText}>{addingFriend ? "Adding..." : "Add"}</Text>
            </HapticTouchableOpacity>
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Activity Stats</Text>
        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Overall Score</Text>
            <Text style={[styles.infoValue, styles.scoreValue, { color: theme.accent }]}>{profileData?.overallScore || 0} pts</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Overall App Streak</Text>
            <Text style={styles.infoValue}>{profileData?.streakCount || 0} Days</Text>
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Feedback</Text>
        <View style={styles.feedbackButtonWrap}>
          <View
            pointerEvents="none"
            style={[styles.feedbackButtonShadow, { backgroundColor: FEEDBACK_SHADOW }]}
          />
          <HapticPressable
            haptic={HapticType.LIGHT}
            onPress={handleOpenFeedback}
            style={({ pressed }) => [
              styles.feedbackButtonFace,
              { backgroundColor: FEEDBACK_FACE },
              pressed && styles.feedbackButtonPressed,
            ]}
          >
            <View style={styles.feedbackButtonContent}>
              <View style={styles.feedbackButtonTextCol}>
                <Text style={styles.feedbackButtonTitle}>Give feedback</Text>
                <Text style={styles.feedbackButtonHint}>Share ideas, report bugs, or vote on features</Text>
              </View>
              <Ionicons name="open-outline" size={26} color="#ffffff" />
            </View>
          </HapticPressable>
        </View>
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
    ...cpShadow({ color: '#4c6782', offset: { width: 0, height: 6 }, opacity: 0.16, radius: 0, elevation: 3 }),
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
    ...cpShadow({ color: '#c3cfdb', offset: { width: 0, height: 4 }, opacity: 1, radius: 0, elevation: 1 }),
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
    ...cpShadow({ color: '#cdcdcd', offset: { width: 0, height: 6 }, opacity: 1, radius: 0, elevation: 2 }),
    alignItems: "center",
  },
  avatar: {
  },
    // avatar removed
  userNameRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    margin: 10,
  },
  userName: {
    fontSize: 24,
    fontWeight: "900",
    color: theme.text,
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
    ...cpShadow({ color: '#cdcdcd', offset: { width: 0, height: 6 }, opacity: 1, radius: 0, elevation: 2 }),
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#edf2f6',
  },
  friendInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    margin: 10,
  },
  friendInput: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#d4e1ee",
    backgroundColor: "#fff",
    paddingHorizontal: 12,
    color: theme.text,
    fontSize: 14,
    fontFamily: 'CeraRoundProDEMO-Black',
  },
  addFriendBtn: {
    height: 44,
    minWidth: 84,
    borderRadius: 12,
    backgroundColor: "#2cca00", //help
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  addFriendBtnDisabled: {
    opacity: 0.7,
  },
  addFriendBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "900",
    fontFamily: 'CeraRoundProDEMO-Black',
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
  feedbackButtonWrap: {
    position: "relative",
    paddingBottom: FEEDBACK_BUTTON_DEPTH,
  },
  feedbackButtonShadow: {
    position: "absolute",
    top: FEEDBACK_BUTTON_DEPTH,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 20,
  },
  feedbackButtonFace: {
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  feedbackButtonPressed: {
    transform: [{ translateY: FEEDBACK_BUTTON_DEPTH }],
  },
  feedbackButtonContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  feedbackButtonTextCol: {
    flex: 1,
  },
  feedbackButtonTitle: {
    fontSize: 17,
    fontWeight: "900",
    color: "#ffffff",
    fontFamily: 'CeraRoundProDEMO-Black',
  },
  feedbackButtonHint: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: "700",
    color: "rgba(255,255,255,0.88)",
    textAlign: "left",
    fontFamily: 'CeraRoundProDEMO-Black',
  },
});