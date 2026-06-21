import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebaseConfig';
import { toKey } from '../components/GoalsStore';
import { isGoalDoneForDate } from './goalState';

const STORAGE_KEY = 'goalReminderBadgePending';

async function loadPending() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function savePending(entries) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

async function applyBadgeCount(count) {
  try {
    await Notifications.setBadgeCountAsync(count > 0 ? 1 : 0);
  } catch (error) {
    console.warn('Could not update app badge:', error);
  }
}

function uniqueEntries(entries) {
  const seen = new Set();
  return entries.filter((entry) => {
    const key = `${entry.goalId}:${entry.dateKey}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function reminderMinutesForToday(goalSettings) {
  return (Number(goalSettings?.time) || 9) * 60 + (Number(goalSettings?.timeMinute) || 0);
}

async function getPerGoalNotificationSettings() {
  try {
    if (!auth.currentUser) return {};
    const settingsDoc = await getDoc(
      doc(db, 'users', auth.currentUser.uid, 'settings', 'notifications')
    );
    if (!settingsDoc.exists()) return {};
    return settingsDoc.data()?.perGoalNotifications || {};
  } catch {
    return {};
  }
}

export async function registerGoalReminderBadge(goalId, dateKey = toKey(new Date())) {
  if (!goalId) return;

  const pending = uniqueEntries([
    ...await loadPending(),
    { goalId, dateKey },
  ]);

  await savePending(pending);
  await applyBadgeCount(pending.length);
}

export async function syncGoalReminderBadge() {
  const uid = auth.currentUser?.uid;
  if (!uid) {
    await savePending([]);
    await applyBadgeCount(0);
    return;
  }

  const today = toKey(new Date());
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  let entries = uniqueEntries((await loadPending()).filter((entry) => entry.dateKey >= today));

  try {
    const perGoal = await getPerGoalNotificationSettings();

    for (const [goalId, goalSettings] of Object.entries(perGoal)) {
      if (!goalSettings?.enabled) continue;
      if (currentMinutes < reminderMinutesForToday(goalSettings)) continue;

      entries.push({ goalId, dateKey: today });
    }
  } catch (error) {
    console.warn('Could not read notification settings for badge sync:', error);
  }

  entries = uniqueEntries(entries);
  const goalCache = new Map();
  const pending = [];

  for (const entry of entries) {
    if (entry.dateKey < today) continue;

    let goal = goalCache.get(entry.goalId);
    if (!goal) {
      try {
        const snap = await getDoc(doc(db, 'users', uid, 'goals', entry.goalId));
        if (!snap.exists()) continue;
        goal = { id: snap.id, ...snap.data() };
        goalCache.set(entry.goalId, goal);
      } catch (error) {
        console.warn('Could not load goal for badge sync:', error);
        pending.push(entry);
        continue;
      }
    }

    if (!isGoalDoneForDate(goal, entry.dateKey, uid)) {
      pending.push(entry);
    }
  }

  await savePending(pending);
  await applyBadgeCount(pending.length);
}

export async function clearGoalReminderBadge() {
  await savePending([]);
  await applyBadgeCount(0);
}
