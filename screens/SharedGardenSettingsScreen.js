import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert, Switch, Pressable } from "react-native";
import * as Haptics from "expo-haptics";
// Haptic feedback for switch toggles (copied from AddGoalScreen)
const triggerSelectionHaptic = () => {
  Haptics.selectionAsync().catch(() => {});
};
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
    <View style={styles.container}>
      <View style={styles.headerTopSpacer} />
      <View style={styles.headerWrapper}>
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.headerBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="chevron-back" size={26} color={theme.accent} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Shared Settings</Text>
          <View style={styles.headerBtnPlaceholder} />
        </View>
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: 64 }}>
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Garden Permissions</Text>
        {/* ...existing code for switches... */}
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Restrict others adding people</Text>
          <Switch
            value={settings.restrictAddPeople}
            onValueChange={v => {
              triggerSelectionHaptic();
              handleSettingToggle('restrictAddPeople', v);
            }}
            disabled={!isOwner || savingSettings}
            trackColor={{ false: theme.outline, true: theme.accent }}
          />
        </View>
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Restrict others customizing</Text>
          <Switch
            value={settings.restrictCustomize}
            onValueChange={v => {
              triggerSelectionHaptic();
              handleSettingToggle('restrictCustomize', v);
            }}
            disabled={!isOwner || savingSettings}
            trackColor={{ false: theme.outline, true: theme.accent }}
          />
        </View>
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Restrict others adding/editing plants</Text>
          <Switch
            value={settings.restrictEditPlants}
            onValueChange={v => {
              triggerSelectionHaptic();
              handleSettingToggle('restrictEditPlants', v);
            }}
            disabled={!isOwner || savingSettings}
            trackColor={{ false: theme.outline, true: theme.accent }}
          />
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
      <View style={[styles.actionButtonWrap, { marginTop: 8 }]}> 
        <View pointerEvents="none" style={[styles.actionButtonShadow, styles.actionButtonShadowDanger]} />
        <Pressable
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
          style={({ pressed }) => [
            styles.actionButtonFace,
            styles.logoutButton,
            pressed && styles.actionButtonPressed,
          ]}
        >
          <Text style={styles.logoutButtonText}>{isOwner ? 'Delete Garden' : 'Leave Garden'}</Text>
        </Pressable>
      </View>
      {/* Bottom Spacer for extra margin */}
      <View style={{ height: 48 }} />
      </ScrollView>
    </View>
  );
}
const styles = StyleSheet.create({
    actionButtonWrap: {
      marginBottom: 12,
      height: 56,
      position: 'relative',
    },
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
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#cdcdcd',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 2,
  },
  sectionTitle: { fontSize: 12, fontWeight: '900', color: '#000000', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1, fontFamily: 'CeraRoundProDEMO-Black' },
  memberRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderColor: theme.outline },
  memberName: { fontSize: 15, color: theme.text2, fontWeight: '900', fontFamily: 'CeraRoundProDEMO-Black' },
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
    fontWeight: '800',
    fontSize: 15,
    marginLeft: 8,
    fontFamily: 'CeraRoundProDEMO-Black',
  },
  inviteBtn: { backgroundColor: theme.accent, borderRadius: theme.radiusSm, padding: 10 },
  inviteBtnDisabled: { backgroundColor: theme.outline },
  switchRow: { marginTop: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  switchLabel: { fontSize: 13, color: theme.text, fontFamily: 'CeraRoundProDEMO-Black' },
  permissionNote: { color: '#A0A4AA', fontSize: 12, marginTop: 8, fontStyle: 'italic', fontFamily: 'CeraRoundProDEMO-Black' },
  placeholder: { color: theme.muted2, fontSize: 16, marginTop: 20, fontFamily: 'CeraRoundProDEMO-Black' },
  actionButtonShadow: {
    position: 'absolute',
    top: 4,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 20,
  },
  actionButtonShadowDanger: {
    backgroundColor: '#d35656',
  },
  actionButtonFace: {
    height: 52,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonPressed: {
    transform: [{ translateY: 4 }],
  },
  logoutButton: {
    backgroundColor: '#ef6b6b',
    height: 52,
    alignItems: "center",
    justifyContent: 'center',
  },
  logoutButtonText: { color: "#fff", fontSize: 16, fontWeight: "800", fontFamily: 'CeraRoundProDEMO-Black' }
});
