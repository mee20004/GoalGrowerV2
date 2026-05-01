// AddFriendsScreen.js
import React, { useState, useEffect } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, FlatList, ActivityIndicator } from "react-native";
import { collection, query, where, getDocs, doc, writeBatch, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../firebaseConfig";
import { theme } from "../theme";
import Ionicons from "@expo/vector-icons/Ionicons";

export default function AddFriendsScreen({ navigation }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [myUsername, setMyUsername] = useState("Someone");

  useEffect(() => {
    const fetchMyProfile = async () => {
      if (auth.currentUser) {
        const myDoc = await getDocs(query(collection(db, "users"), where("email", "==", auth.currentUser.email)));
        if (!myDoc.empty) {
          setMyUsername(myDoc.docs[0].data().username);
        }
      }
    };
    fetchMyProfile();
  }, []);

  const handleSearch = async () => {
    if (searchQuery.trim().length < 3) return Alert.alert("Notice", "Enter at least 3 characters.");

    setLoading(true);
    setHasSearched(true);
    setSearchResults([]);

    try {
      const formattedQuery = searchQuery.trim().toLowerCase();
      const q = query(collection(db, "users"), where("searchKey", "==", formattedQuery));
      const querySnapshot = await getDocs(q);

      const results = [];
      querySnapshot.forEach((docSnap) => {
        if (docSnap.id !== auth.currentUser.uid) {
          results.push({ id: docSnap.id, ...docSnap.data() });
        }
      });

      setSearchResults(results);
    } catch (error) {
      Alert.alert("Error", "Could not search for users.");
    } finally {
      setLoading(false);
    }
  };

  const handleFollow = async (targetUser) => {
    try {
      const myUid = auth.currentUser.uid;
      const theirUid = targetUser.id;

      const batch = writeBatch(db);

      const myFollowingRef = doc(db, "users", myUid, "following", theirUid);
      batch.set(myFollowingRef, {
        uid: theirUid,
        username: targetUser.username,
        followedAt: serverTimestamp(),
      });

      const theirFollowersRef = doc(db, "users", theirUid, "followers", myUid);
      batch.set(theirFollowersRef, {
        uid: myUid,
        username: myUsername,
        followedAt: serverTimestamp(),
      });

      await batch.commit();

      Alert.alert("Success!", `You are now following ${targetUser.username}.`);
      navigation.goBack();
    } catch (error) {
      console.error("Follow Error:", error);
      Alert.alert("Error", "Could not follow user.");
    }
  };

  const renderItem = ({ item }) => (
    <View style={styles.resultRow}>
      <View style={styles.avatar}>
        <Ionicons name="person" size={20} color={theme.muted} />
      </View>
      <Text style={styles.nameText}>{item.username}</Text>
      <TouchableOpacity style={styles.followButton} onPress={() => handleFollow(item)}>
        <Text style={styles.followButtonText}>Follow</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={28} color={theme.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Find People</Text>
        <View style={{ width: 28 }} /> 
      </View>

      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Enter exact username..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCapitalize="none"
          onSubmitEditing={handleSearch}
        />
        <TouchableOpacity style={styles.searchButton} onPress={handleSearch}>
          <Ionicons name="search" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#A88F6F" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={searchResults}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ paddingTop: 20 }}
          ListEmptyComponent={
            hasSearched && <Text style={styles.emptyText}>No user found matching "{searchQuery}".</Text>
          }
        />
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
  headerTitle: { fontSize: 20, fontWeight: "700" },
  searchContainer: { flexDirection: "row", alignItems: "center" },
  searchInput: { flex: 1, height: 50, backgroundColor: "#fff", borderColor: "#ccc", borderWidth: 1, borderRadius: 8, paddingHorizontal: 16, marginRight: 8 },
  searchButton: { height: 50, width: 50, backgroundColor: "#A88F6F", borderRadius: 8, alignItems: "center", justifyContent: "center" },
  resultRow: { flexDirection: "row", alignItems: "center", backgroundColor: "#E0F7D4", borderRadius: 8, padding: 12, marginBottom: 10 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  nameText: { flex: 1, marginLeft: 12, fontWeight: "700", fontSize: 16 },
  followButton: { backgroundColor: "#A88F6F", paddingHorizontal: 16, paddingVertical: 8, borderRadius: 6 },
  followButtonText: { color: "#fff", fontWeight: "700" },
  emptyText: { textAlign: "center", color: theme.muted, marginTop: 40, fontStyle: "italic" }
});