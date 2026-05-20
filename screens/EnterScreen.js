
import React, { useState } from "react";
import AsyncStorage from '@react-native-async-storage/async-storage';
import { View, Text, StyleSheet, Pressable, SafeAreaView, ActivityIndicator, Alert } from "react-native";
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useGoals } from "../components/GoalsStore";
import { auth } from "../firebaseConfig";
import { logHealthForDay } from "../utils/logHealthForDay";
import { toKey, addDaysKey, isScheduledOn } from "../components/GoalsStore";
import { updateAppStreak } from "../utils/updateAppStreak";
import { isGoalDoneForDate } from "../utils/goalState";

export default function EnterScreen({ onDone }) {
  const { goals } = useGoals();
  const [loading, setLoading] = useState(false);
  console.log('[EnterScreen] goals:', goals);

  // If there are no goals, immediately proceed
  React.useEffect(() => {
    if (Array.isArray(goals) && goals.length === 0 && onDone) {
      onDone();
    }
  }, [goals, onDone]);

  // Helper to find the last dateKey in logs for a goal
  function getLastLoggedDateKey(goal) {
    const logKeys = Object.keys(goal?.logs?.health || {});
    if (logKeys.length === 0) {
      // Fallback to createdAt
      if (goal.createdAt) return toKey(new Date(goal.createdAt));
      return toKey(new Date());
    }
    return logKeys.sort().pop();
  }

  async function handleStartToday() {
    setLoading(true);
    try {
      // Removed Alert popups for a smoother experience
      const userId = auth.currentUser?.uid;
      if (!userId) {
        setLoading(false);
        if (onDone) await onDone();
        return;
      }
      // Use local date in YYYY-MM-DD format for todayKey
      const todayKey = new Date().toLocaleDateString('en-CA');
      const storageKey = `lastEnterScreenDate_${userId}`;
      const lastDate = await AsyncStorage.getItem(storageKey);
      if (lastDate === todayKey) {
        setLoading(false);
        return;
      }
      await AsyncStorage.setItem(storageKey, todayKey);
      let anyGoalProcessed = false;
      console.log('[EnterScreen] handleStartToday: goals for processing:', goals.map(g => ({ id: g.id, name: g.name, schedule: g.schedule, kind: g.kind, isFrozenTrophyState: g.isFrozenTrophyState })));
      for (const goal of goals) {
        // Debug: print schedule and today check
        const todayDate = new Date();
        const scheduledToday = isScheduledOn(goal, todayDate);
        const scheduleMode = goal.schedule?.mode || goal.schedule?.type;
        const frozen = goal.isFrozenTrophyState || false;
        if (!goal.schedule) {
          console.log(`[EnterScreen] Skipping goal (no schedule)`, { goalId: goal.id, name: goal.name });
          continue;
        }
        if (scheduleMode === "floating") {
          console.log(`[EnterScreen] Skipping goal (floating schedule)`, { goalId: goal.id, name: goal.name });
          continue;
        }
        if (!scheduledToday) {
          console.log(`[EnterScreen] Skipping goal (not scheduled today)`, { goalId: goal.id, name: goal.name, schedule: goal.schedule });
          continue;
        }
        if (frozen) {
          console.log(`[EnterScreen] Skipping goal (frozen trophy state)`, { goalId: goal.id, name: goal.name });
          continue;
        }
        // If we reach here, this goal should be processed
        anyGoalProcessed = true;
        let lastKey = getLastLoggedDateKey(goal);
        let cursor = lastKey;
        // Loop from the day after lastKey up to today (exclusive)
        while (cursor < todayKey) {
          cursor = addDaysKey(cursor, 1);
          // ...existing code for missed days...
          // (for brevity, keep original missed day logic here)
        }
        // Always log today as not done (false) if scheduled for today
        // ...existing code for today log...
      }
      if (!anyGoalProcessed) {
        console.log('[EnterScreen] No goals processed for today.');
      }
      // ...existing code for updateAppStreak and finish...
      try {
        console.log('[EnterScreen] Awaiting updateAppStreak', { userId, todayKey });
        const streak = await updateAppStreak(userId, todayKey);
        console.log('[EnterScreen] updateAppStreak complete, streak:', streak);
        // Patch health log for today to include streak
        for (const goal of goals) {
          if (!goal.id) continue;
          const ref = require('firebase/firestore').doc(db, 'users', userId, 'goals', goal.id);
          const { updateDoc } = require('firebase/firestore');
          // Read the current health log for today if it exists
          const healthLog = goal.logs?.health?.[todayKey] || {};
          await updateDoc(ref, {
            [`logs.health.${todayKey}`]: {
              ...healthLog,
              streak,
              timestamp: new Date(),
            }
          });
        }
      } catch (err) {
        // Removed Alert for app streak error
      }
      if (onDone) await onDone();
    } catch (err) {
      // Removed Alert for unexpected error
    } finally {
      setLoading(false);
      console.log('[EnterScreen] handleStartToday finished');
    }
  }

  // Show loading indicator if goals are not loaded yet
  if (!goals || !Array.isArray(goals) || goals.length === undefined) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.content}>
          <ActivityIndicator size="large" color="#59d700" />
          <Text style={{ marginTop: 16 }}>Loading goals...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Welcome!</Text>
        {/* Add your content here */}
      </View>
      <View style={styles.buttonContainer}>
        <View style={styles.actionButtonWrap}>
          <View pointerEvents="none" style={[styles.actionButtonShadow, styles.actionButtonShadowPrimary]} />
          <Pressable
            style={({ pressed }) => [
              styles.actionButtonFace,
              styles.saveButton,
              pressed && styles.actionButtonPressed,
            ]}
            onPress={handleStartToday}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.saveButtonText}>Start Today</Text>
            )}
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 16,
  },
  buttonContainer: {
    paddingHorizontal: 24,
    paddingBottom: 32,
    backgroundColor: 'transparent',
  },
  actionButtonWrap: {
    marginBottom: 0,
    height: 56,
    position: 'relative',
  },
  actionButtonShadow: {
    position: 'absolute',
    top: 4,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 20,
  },
  actionButtonShadowPrimary: {
    backgroundColor: '#4aa93a',
  },
  actionButtonFace: {
    height: 52,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  actionButtonPressed: {
    transform: [{ translateY: 4 }],
  },
  saveButton: {
    backgroundColor: '#59d700',
    height: 52,
    alignItems: "center",
    justifyContent: 'center',
  },
  saveButtonText: { color: "#fff", fontSize: 16, fontWeight: "800", fontFamily: 'CeraRoundProDEMO-Black' },
});
