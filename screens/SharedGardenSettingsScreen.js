import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert, Switch } from "react-native";
import { theme } from "../theme";
import Ionicons from "@expo/vector-icons/Ionicons";
import { db, auth } from "../firebaseConfig";
import { collection, doc, getDoc, getDocs, updateDoc, arrayRemove, arrayUnion, onSnapshot, query, where, setDoc } from "firebase/firestore";

export default function SharedGardenSettingsScreen({ navigation, route }) {
  const { sharedGardenId, gardenName } = route.params || {};
  const [members, setMembers] = useState([]);
  const [settings, setSettings] = useState({
    restrictAddPeople: false,
    restrictCustomize: false,
    restrictEditPlants: false,
  });
  const [ownerId, setOwnerId] = useState(null);
  const [restrictAddPeople, setRestrictAddPeople] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [followingUsers, setFollowingUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [inviteUsername, setInviteUsername] = useState("");
  const [inviting, setInviting] = useState(false);
  const [removingId, setRemovingId] = useState("");

  // Fetch members of the shared garden
  useEffect(() => {
    if (!sharedGardenId) return;
    const unsub = onSnapshot(doc(db, "sharedGardens", sharedGardenId), async (snap) => {
      if (!snap.exists()) {
        setMembers([]);
        return;
      }
      const data = snap.data();
      const memberIds = Array.isArray(data.memberIds) ? data.memberIds : [];
      setOwnerId(data.ownerId || null);
      setRestrictAddPeople(!!data.restrictAddPeople);
      setSettings({
        restrictAddPeople: !!data.restrictAddPeople,
        restrictCustomize: !!data.restrictCustomize,
        restrictEditPlants: !!data.restrictEditPlants,
      });
      // Fetch user info for each member
      const userSnaps = await Promise.all(memberIds.map(uid => getDoc(doc(db, "users", uid))));
      setMembers(userSnaps.map(s => ({ id: s.id, ...s.data() })).filter(Boolean));
      setLoading(false);
    });
    return () => unsub();
  }, [sharedGardenId]);

  const isOwner = ownerId && auth.currentUser && ownerId === auth.currentUser.uid;
  const canAddPeople = isOwner || !restrictAddPeople;

  const handleSettingToggle = async (key, value) => {
    if (!isOwner) return;
    // Optimistically update UI
    setSettings((prev) => ({ ...prev, [key]: value }));
    setSavingSettings(true);
    try {
      await updateDoc(doc(db, "sharedGardens", sharedGardenId), {
        [key]: value
      });
    } catch (e) {
      // Revert if failed
      setSettings((prev) => ({ ...prev, [key]: !value }));
      Alert.alert("Error", "Could not update setting.");
    } finally {
      setSavingSettings(false);
    }
  };

  // Fetch following users for inviting
  useEffect(() => {
    if (!auth.currentUser) return;
    const unsub = onSnapshot(
      collection(db, 'users', auth.currentUser.uid, 'following'),
      (snap) => {
        setFollowingUsers(snap.docs.map((userDoc) => ({ id: userDoc.id, ...userDoc.data() })));
      },
      (error) => {
        console.error('Error loading following list', error);
      }
    );
    return () => unsub();
  }, []);

  const handleInvite = async (user) => {
    if (!canAddPeople) {
      Alert.alert("Restricted", "Only the owner can invite people to this garden.");
      return;
    }
    if (!user || !user.id) return;
    if (members.some(m => m.id === user.id)) {
      Alert.alert("Already a member", "This user is already in the garden.");
      return;
    }
    setInviting(true);
    try {
      await setDoc(doc(db, "users", user.id, "sharedGardenInvites", `${sharedGardenId}_${auth.currentUser.uid}`), {
        gardenId: sharedGardenId,
        gardenName: gardenName || "Shared Garden",
        invitedByUid: auth.currentUser.uid,
        invitedByUsername: auth.currentUser.displayName || "User",
        createdAt: Date.now(),
      }, { merge: true });
      Alert.alert("Invite sent", `${user.username || user.email || user.id} can now accept the invitation from their garden screen.`);
    } catch (e) {
      Alert.alert("Error", "Could not send invite.");
    } finally {
      setInviting(false);
    }
  };

  const handleRemove = async (userId) => {
    if (!canAddPeople) {
      Alert.alert("Restricted", "Only the owner can remove people from this garden.");
      return;
    }
    if (!sharedGardenId || !userId) return;
    if (userId === auth.currentUser.uid) {
      Alert.alert("Cannot remove yourself", "Use the leave garden option instead.");
      return;
    }
    setRemovingId(userId);
    try {
      await updateDoc(doc(db, "sharedGardens", sharedGardenId), {
        memberIds: arrayRemove(userId)
      });
      Alert.alert("Removed", "User has been removed from the garden.");
    } catch (e) {
      Alert.alert("Error", "Could not remove user.");
    } finally {
      setRemovingId("");
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 64 }}>
      <View style={styles.header}>
        <Ionicons name="settings-outline" size={28} color={theme.accent} style={{ marginRight: 10 }} />
        <Text style={styles.headerText}>Shared Garden Settings</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Garden Permissions</Text>
        {/* ...existing code for switches... */}
        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>Restrict others adding people</Text>
          <View style={styles.switchWrap}>
            <Switch
              value={settings.restrictAddPeople}
              onValueChange={v => handleSettingToggle('restrictAddPeople', v)}
              disabled={!isOwner || savingSettings}
              trackColor={{ true: 'rgb(231, 231, 231)', false: theme.outline }}
              thumbColor={settings.restrictAddPeople ? theme.accent : '#f4f3f4'}
              ios_backgroundColor={theme.outline}
              style={styles.switch}
            />
          </View>
        </View>
        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>Restrict others customizing</Text>
          <View style={styles.switchWrap}>
            <Switch
              value={settings.restrictCustomize}
              onValueChange={v => handleSettingToggle('restrictCustomize', v)}
              disabled={!isOwner || savingSettings}
              trackColor={{ true: 'rgb(231, 231, 231)', false: theme.outline }}
              thumbColor={settings.restrictCustomize ? theme.accent : '#f4f3f4'}
              ios_backgroundColor={theme.outline}
              style={styles.switch}
            />
          </View>
        </View>
        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>Restrict others adding/editing plants</Text>
          <View style={styles.switchWrap}>
            <Switch
              value={settings.restrictEditPlants}
              onValueChange={v => handleSettingToggle('restrictEditPlants', v)}
              disabled={!isOwner || savingSettings}
              trackColor={{ true: 'rgb(231, 231, 231)', false: theme.outline }}
              thumbColor={settings.restrictEditPlants ? theme.accent : '#f4f3f4'}
              ios_backgroundColor={theme.outline}
              style={styles.switch}
            />
          </View>
        </View>
        {!isOwner && <Text style={styles.permissionNote}>Only the garden owner can change these settings.</Text>}
      </View>
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Members</Text>
        {loading ? (
          <ActivityIndicator size="large" color={theme.accent} style={{ marginTop: 20 }} />
        ) : (
          members.length === 0 ? (
            <Text style={styles.placeholder}>No members found.</Text>
          ) : (
            members.map(item => (
              <View key={item.id} style={styles.memberRow}>
                <Text style={styles.memberName}>{item.username || item.email || item.id}</Text>
                {item.id !== auth.currentUser.uid && (
                  <TouchableOpacity style={styles.removeBtn} onPress={() => handleRemove(item.id)} disabled={removingId === item.id}>
                    <Ionicons name="remove-circle" size={26} color={theme.dangerText || '#CF3636'} />
                    <Text style={styles.removeBtnText}>Remove</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))
          )
        )}
      </View>
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Invite From Followers</Text>
        {followingUsers.filter(u => !members.some(m => m.id === u.id)).length === 0 ? (
          <Text style={styles.placeholder}>No followers available to invite.</Text>
        ) : (
          followingUsers.filter(u => !members.some(m => m.id === u.id)).map(item => (
            <View key={item.id} style={styles.memberRow}>
              <Text style={styles.memberName}>{item.username || item.email || item.id}</Text>
              <TouchableOpacity
                style={[styles.inviteBtn, (!canAddPeople ? styles.inviteBtnDisabled : null)]}
                onPress={() => handleInvite(item)}
                disabled={inviting || !canAddPeople}
              >
                <Ionicons
                  name="person-add"
                  size={22}
                  color={canAddPeople ? '#fff' : theme.muted2}
                />
              </TouchableOpacity>
            </View>
          ))
        )}
      </View>
      {/* Leave/Delete Garden Button */}
      <TouchableOpacity
        style={{
          backgroundColor: theme.dangerBg,
          borderRadius: theme.radius,
          paddingVertical: 16,
          alignItems: 'center',
          marginTop: 8,
          marginBottom: 12,
        }}
        onPress={async () => {
          if (isOwner) {
            Alert.alert(
              "Delete Garden",
              "Are you sure you want to delete this shared garden? This cannot be undone.",
              [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Delete",
                  style: "destructive",
                  onPress: async () => {
                    try {
                      await updateDoc(doc(db, "sharedGardens", sharedGardenId), { memberIds: [] });
                      await setTimeout(() => {}, 200); // Small delay to ensure update
                      await updateDoc(doc(db, "sharedGardens", sharedGardenId), { deleted: true });
                      await setTimeout(() => {}, 200); // Small delay
                      await updateDoc(doc(db, "sharedGardens", sharedGardenId), { name: "[Deleted]" });
                      // Optionally, you could use deleteDoc here if you want to fully remove the document
                      // await deleteDoc(doc(db, "sharedGardens", sharedGardenId));
                      Alert.alert("Deleted", "The shared garden has been deleted.");
                      navigation.goBack();
                    } catch (e) {
                      Alert.alert("Error", "Could not delete the garden.");
                    }
                  },
                },
              ]
            );
          } else {
            try {
              await updateDoc(doc(db, "sharedGardens", sharedGardenId), {
                memberIds: arrayRemove(auth.currentUser.uid)
              });
              Alert.alert("Left Garden", "You have left the shared garden.");
              navigation.goBack();
            } catch (e) {
              Alert.alert("Error", "Could not leave the garden.");
            }
          }
        }}
      >
        <Text style={{ color: theme.dangerText, fontWeight: 'bold', fontSize: 16 }}>
          {isOwner ? 'Delete Garden' : 'Leave Garden'}
        </Text>
      </TouchableOpacity>
      {/* Bottom Spacer for extra margin */}
      <View style={{ height: 48 }} />
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  switchWrap: {
    borderRadius: 20,
    backgroundColor: "#fff",
    padding: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 2,
    elevation: 2,
  },
  switch: {
    transform: [{ scaleX: 1.25 }, { scaleY: 1.25 }],
    borderRadius: 20,
  },
  container: { flex: 1, backgroundColor: theme.bg, padding: theme.pad },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
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
  headerText: { fontSize: 22, fontWeight: 'bold', color: theme.text },
  card: {
    backgroundColor: theme.surface,
    borderRadius: theme.radius,
    padding: theme.pad,
    marginBottom: theme.pad,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 6,
    elevation: 2,
  },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: theme.accent, marginBottom: 8 },
  memberRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderColor: theme.outline },
  memberName: { fontSize: 15, color: theme.text2, fontWeight: '600' },
  removeBtn: {
    marginLeft: 10,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.dangerBg,
    borderRadius: theme.radiusSm,
    paddingVertical: 8,
    paddingHorizontal: 18,
    minHeight: 40,
  },
  removeBtnText: {
    color: theme.dangerText,
    fontWeight: 'bold',
    fontSize: 15,
    marginLeft: 8,
  },
  inviteBtn: { backgroundColor: theme.accent, borderRadius: theme.radiusSm, padding: 10 },
  inviteBtnDisabled: { backgroundColor: theme.outline },
  settingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  settingLabel: { color: theme.text2, fontSize: 15, fontWeight: '600', flex: 1, marginRight: 10 },
  permissionNote: { color: theme.muted2, fontSize: 13, marginTop: 8, fontStyle: 'italic' },
  placeholder: { color: theme.muted2, fontSize: 16, marginTop: 20 },
});
