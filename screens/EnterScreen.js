
import React, { useState } from "react";
import AsyncStorage from '@react-native-async-storage/async-storage';
import { View, Text, StyleSheet, SafeAreaView, ActivityIndicator } from "react-native";
import HapticPressable from "../components/HapticPressable";
import { useGoals } from "../components/GoalsStore";
import { auth } from "../firebaseConfig";
import { toKey } from "../components/GoalsStore";
import { updateAppStreak } from "../utils/updateAppStreak";
import { backfillGoalHealthLogs } from "../utils/backfillGoalHealthLogs";

export default function EnterScreen({ onDone }) {
  const { goals } = useGoals();
  const [loading, setLoading] = useState(false);
  console.log('[EnterScreen] goals:', goals);

  async function handleStartToday() {
    setLoading(true);
    try {
      const userId = auth.currentUser?.uid;
      if (!userId) {
        setLoading(false);
        if (onDone) await onDone();
        return;
      }
      const todayKey = toKey(new Date());
      const storageKey = `lastEnterScreenDate_${userId}`;
      const lastDate = await AsyncStorage.getItem(storageKey);
      if (lastDate === todayKey) {
        setLoading(false);
        if (onDone) await onDone();
        return;
      }
      await AsyncStorage.setItem(storageKey, todayKey);

      let goalsBackfilled = 0;
      for (const goal of goals) {
        if (!goal?.id) continue;
        try {
          const result = await backfillGoalHealthLogs(userId, goal, todayKey);
          if (result?.wrote) goalsBackfilled += 1;
        } catch (err) {
          console.error('[EnterScreen] backfill failed for goal', {
            goalId: goal.id,
            error: err?.message || String(err),
          });
        }
      }
      console.log('[EnterScreen] Backfill complete', { goalsBackfilled, totalGoals: goals.length });

      try {
        console.log('[EnterScreen] Awaiting updateAppStreak', { userId, todayKey });
        const streak = await updateAppStreak(userId, todayKey);
        console.log('[EnterScreen] updateAppStreak complete, streak:', streak);
      } catch (err) {
        console.error('[EnterScreen] updateAppStreak error', err?.message || String(err));
      }

      if (onDone) await onDone();
    } catch (err) {
      console.error('[EnterScreen] handleStartToday error', err?.message || String(err));
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
      </View>
      <View style={styles.buttonContainer}>
        <View style={styles.actionButtonWrap}>
          <View pointerEvents="none" style={[styles.actionButtonShadow, styles.actionButtonShadowPrimary]} />
          <HapticPressable
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
          </HapticPressable>
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
