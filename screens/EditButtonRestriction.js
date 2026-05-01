import React, { useEffect, useState } from "react";
import { Pressable } from "react-native";
import * as Haptics from "expo-haptics";
import Ionicons from "@expo/vector-icons/Ionicons";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../firebaseConfig";
import { theme } from "../theme";

export default function EditButtonRestriction({ goal, sharedGardens, openEditModal }) {
  const [editDisabled, setEditDisabled] = useState(false);

  useEffect(() => {
    let ignore = false;
    async function checkRestriction() {
      if (goal?.sharedGardenId) {
        let sharedGarden = sharedGardens.find(g => g.id === goal.sharedGardenId);
        if (!sharedGarden) {
          // Fetch directly if not in sharedGardens
          const snap = await getDoc(doc(db, "sharedGardens", goal.sharedGardenId));
          sharedGarden = snap.exists() ? snap.data() : null;
        }
        const isOwner = sharedGarden && sharedGarden.ownerId === auth.currentUser?.uid;
        if (!ignore && sharedGarden && sharedGarden.restrictEditPlants && !isOwner) {
          setEditDisabled(true);
          return;
        }
      }
      if (!ignore) setEditDisabled(false);
    }
    checkRestriction();
    return () => { ignore = true; };
  }, [goal?.sharedGardenId, sharedGardens, auth.currentUser?.uid]);

  return (
    <Pressable
      onPress={() => {
        if (editDisabled) return;
        Haptics.selectionAsync().catch(() => {});
        openEditModal?.();
      }}
      hitSlop={20}
      style={[{ opacity: editDisabled ? 0.4 : 1 }, { padding: 8 }]}
      disabled={editDisabled}
      accessibilityLabel={editDisabled ? "Editing is disabled for this shared garden." : undefined}
    >
      <Ionicons name="create-outline" size={22} color={editDisabled ? theme.muted : theme.accent} />
    </Pressable>
  );
}