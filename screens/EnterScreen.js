
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
        onDone && onDone();
        return;
      }
      const todayKey = toKey(new Date());
      const storageKey = `lastEnterScreenDate_${userId}`;
      const lastDate = await AsyncStorage.getItem(storageKey);
      if (lastDate === todayKey) {
        setLoading(false);
        return;
      }
      await AsyncStorage.setItem(storageKey, todayKey);
      let anyGoalProcessed = false;
      for (const goal of goals) {
        anyGoalProcessed = true;
        let lastKey = getLastLoggedDateKey(goal);
        let cursor = lastKey;
        // Loop from the day after lastKey up to today (exclusive)
        while (cursor < todayKey) {
          cursor = addDaysKey(cursor, 1);
          if (goal && goal.schedule && (goal.schedule.mode || goal.schedule.type) && (goal.schedule.mode || goal.schedule.type) !== "floating") {
            const frozen = goal.isFrozenTrophyState || false;
            if (frozen) {
              // Skip lowering health or writing health log if frozen
              console.log(`[EnterScreen] Skipping health log for missed day because goal is frozen`, { userId, goalId: goal.id, cursor });
              lastKey = cursor;
              continue;
            }
            let prevHealth = 5;
            if (goal.logs && goal.logs.health && goal.logs.health[lastKey]) {
              prevHealth = goal.logs.health[lastKey].health;
            }
            let health = prevHealth - 1;
            health = Math.max(1, Math.min(5, health));
            try {
              console.log(`[EnterScreen] Awaiting logHealthForDay for missed day`, { userId, goalId: goal.id, cursor, health, frozen });
              await logHealthForDay(userId, goal.id, cursor, health, frozen, false);
              console.log(`[EnterScreen] Wrote missed health log for ${goal.id} on ${cursor}`);
              if ((goal.kind || goal.type || "completion") === "completion") {
                const isShared = !!goal?.multiUserWateringEnabled && (goal?.gardenType === "shared" || goal?.sharedGardenId);
                // Use 'logs' as collection, cursor as document ID, and add type: 'completion'
                const completionRef = doc(db, 'users', userId, 'goals', goal.id, 'logs', cursor);
                console.log(`[EnterScreen] Awaiting setDoc for missed completion`, { userId, goalId: goal.id, cursor });
                await setDoc(
                  completionRef,
                  isShared ? { users: { [userId]: false }, type: 'completion' } : { done: false, type: 'completion' },
                  { merge: true }
                );
                console.log(`[EnterScreen] Wrote missed completion log for ${goal.id} on ${cursor}`);
              }
            } catch (err) {
              // Removed Alert for missed log error
            }
            lastKey = cursor;
          }
        }
        // Always log today as not done (false) if scheduled for today
        const todayDate = new Date();
        const scheduledToday = isScheduledOn(goal, todayDate);
        const scheduleMode = goal.schedule?.mode || goal.schedule?.type;
        if (goal && scheduledToday && goal.schedule && scheduleMode && scheduleMode !== "floating") {
          const frozen = goal.isFrozenTrophyState || false;
          if (frozen) {
            // Skip lowering health or writing health log if frozen
            console.log(`[EnterScreen] Skipping today health log because goal is frozen`, { userId, goalId: goal.id, todayKey });
          } else {
            console.log('[EnterScreen] About to write today health log:', {
              userId, goalId: goal.id, todayKey, health: 'will be calculated below', frozen: 'will be calculated below'
            });
            try {
              let prevHealth = 5;
              if (goal.logs && goal.logs.health && goal.logs.health[lastKey]) {
                prevHealth = goal.logs.health[lastKey].health;
              }
              let health = prevHealth - 1;
              health = Math.max(1, Math.min(5, health));
              console.log(`[EnterScreen] Awaiting logHealthForDay for today`, { userId, goalId: goal.id, todayKey, health, frozen });
              await logHealthForDay(userId, goal.id, todayKey, health, frozen, false);
              console.log(`[EnterScreen] Wrote today health log for ${goal.id} on ${todayKey}`);
              if ((goal.kind || goal.type || "completion") === "completion") {
                const isShared = !!goal?.multiUserWateringEnabled && (goal?.gardenType === "shared" || goal?.sharedGardenId);
                // Use 'logs' as collection, todayKey as document ID, and add type: 'completion'
                const completionRef = doc(db, 'users', userId, 'goals', goal.id, 'logs', todayKey);
                console.log(`[EnterScreen] Awaiting setDoc for today completion`, { userId, goalId: goal.id, todayKey });
                await setDoc(
                  completionRef,
                  isShared ? { users: { [userId]: false }, type: 'completion' } : { done: false, type: 'completion' },
                  { merge: true }
                );
                console.log(`[EnterScreen] Wrote today completion log for ${goal.id} on ${todayKey}`);
              }
            } catch (err) {
              // Removed Alert for today log error
            }
          }
        }
      }
      // Update app streak in Firestore
      try {
        console.log('[EnterScreen] Awaiting updateAppStreak', { userId, todayKey });
        await updateAppStreak(userId, todayKey);
        console.log('[EnterScreen] updateAppStreak complete');
      } catch (err) {
        // Removed Alert for app streak error
      }
      if (!anyGoalProcessed) {
        // Removed Alert for no goals processed
      }
      onDone && onDone();
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
