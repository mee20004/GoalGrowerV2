import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebaseConfig';

const ANDROID_CHANNEL_ID = 'goal-grower-reminders';
let listenerCleanup = null;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

/**
 * Default notification settings structure
 */
export const DEFAULT_NOTIFICATION_SETTINGS = {
  notificationsEnabled: true,
  notificationMode: 'global', // 'global' | 'individual' | 'both'
  globalTime: 9,
  globalTimeMinute: 0,
  dailyReminderEnabled: true,
  perGoalNotifications: {},
  globalCustomText: '',
  globalCustomPosition: 'prefix',
};

async function setupAndroidNotificationChannel() {
  if (Platform.OS !== 'android') return;

  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
    name: 'Goal Reminders',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#28b900',
    sound: 'default',
  });
}

function shouldScheduleGlobal(settings) {
  if (!settings?.notificationsEnabled) return false;
  const mode = settings.notificationMode || 'global';
  return (mode === 'global' || mode === 'both') && settings.dailyReminderEnabled;
}

function shouldSchedulePerGoal(settings) {
  if (!settings?.notificationsEnabled) return false;
  const mode = settings.notificationMode || 'global';
  return mode === 'individual' || mode === 'both';
}

function dailyTrigger(hour, minute) {
  return Platform.select({
    android: {
      type: 'daily',
      hour,
      minute,
      channelId: ANDROID_CHANNEL_ID,
    },
    default: {
      type: 'daily',
      hour,
      minute,
    },
  });
}

function navigateToGoals(navigationRef) {
  const nav = navigationRef?.current;
  if (!nav) return;

  try {
    nav.navigate('Tabs', {
      screen: 'Goals',
      params: { screen: 'GoalsHome' },
    });
  } catch {
    try {
      nav.navigate('Goals');
    } catch (error) {
      console.warn('Could not navigate from notification tap:', error);
    }
  }
}

/**
 * Request user permission for notifications
 */
export async function requestNotificationPermissions() {
  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    return finalStatus === 'granted';
  } catch (error) {
    console.error('Error requesting notification permissions:', error);
    return false;
  }
}

export async function getNotificationSettings() {
  try {
    if (!auth.currentUser) return DEFAULT_NOTIFICATION_SETTINGS;

    const settingsDoc = await getDoc(
      doc(db, 'users', auth.currentUser.uid, 'settings', 'notifications')
    );

    if (settingsDoc.exists()) {
      return { ...DEFAULT_NOTIFICATION_SETTINGS, ...settingsDoc.data() };
    }

    return DEFAULT_NOTIFICATION_SETTINGS;
  } catch (error) {
    console.error('Error getting notification settings:', error);
    return DEFAULT_NOTIFICATION_SETTINGS;
  }
}

export async function saveNotificationSettings(settings) {
  try {
    if (!auth.currentUser) return false;

    await setDoc(
      doc(db, 'users', auth.currentUser.uid, 'settings', 'notifications'),
      settings,
      { merge: true }
    );

    return true;
  } catch (error) {
    console.error('Error saving notification settings:', error);
    return false;
  }
}

function buildGoalNotificationBody(goalName, customText = '', customPosition = 'prefix') {
  const trimmed = (customText || '').trim();
  if (!trimmed) {
    return `Time to work on your goal: ${goalName}`;
  }
  if (customPosition === 'suffix') {
    return `${goalName} - ${trimmed}`;
  }
  return `${trimmed} - ${goalName}`;
}

async function resolveGoalName(goalId, fallbackName = '') {
  if (fallbackName) return fallbackName;

  try {
    if (!auth.currentUser) return 'Your goal';
    const goalDoc = await getDoc(doc(db, 'users', auth.currentUser.uid, 'goals', goalId));
    if (goalDoc.exists()) {
      return goalDoc.data().name || 'Your goal';
    }
  } catch (error) {
    console.warn('Could not fetch goal name for scheduling:', error);
  }

  return 'Your goal';
}

export async function cancelAllScheduledNotifications() {
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
      scheduled.map((notif) =>
        Notifications.cancelScheduledNotificationAsync(notif.identifier)
      )
    );
  } catch (error) {
    console.error('Error cancelling all notifications:', error);
  }
}

export async function cancelGoalNotification(goalId) {
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const goalNotifications = scheduled.filter(
      (notif) => notif.content.data?.goalId === goalId
    );

    await Promise.all(
      goalNotifications.map((notif) =>
        Notifications.cancelScheduledNotificationAsync(notif.identifier)
      )
    );
  } catch (error) {
    console.error('Error cancelling goal notification:', error);
  }
}

export async function scheduleDailyGoalNotification(settingsOverride = null) {
  try {
    const settings = settingsOverride || (await getNotificationSettings());
    if (!shouldScheduleGlobal(settings)) {
      return null;
    }

    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const dailyGoalNotifications = scheduled.filter(
      (notif) => notif.content.data?.type === 'daily_goal_reminder'
    );

    await Promise.all(
      dailyGoalNotifications.map((notif) =>
        Notifications.cancelScheduledNotificationAsync(notif.identifier)
      )
    );

    const messages = [
      "It's time to work on your goals!",
      'Good morning! Check in with your goals today.',
      'Your plants are waiting! Time to achieve your goals.',
      "Rise and shine! Let's accomplish something great today.",
      'Time to nurture your goals! Check your progress.',
      'Watering time! Check your goals and grow today.',
    ];

    const body = settings.globalCustomText?.trim()
      ? settings.globalCustomText.trim()
      : messages[Math.floor(Math.random() * messages.length)];

    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Time to Check Your Goals!',
        body,
        data: {
          type: 'daily_goal_reminder',
          timestamp: new Date().toISOString(),
        },
        sound: true,
        badge: 1,
      },
      trigger: dailyTrigger(settings.globalTime, settings.globalTimeMinute),
    });

    await AsyncStorage.setItem('dailyGoalNotificationId', notificationId);
    return notificationId;
  } catch (error) {
    console.error('Error scheduling daily notification:', error);
    return null;
  }
}

export async function scheduleGoalNotification(
  goalId,
  goalName,
  hour = 9,
  minute = 0,
  customText = '',
  customPosition = 'prefix',
  settingsOverride = null
) {
  try {
    const settings = settingsOverride || (await getNotificationSettings());
    if (!shouldSchedulePerGoal(settings)) {
      return null;
    }

    await cancelGoalNotification(goalId);

    const resolvedName = goalName || (await resolveGoalName(goalId));

    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: resolvedName,
        body: buildGoalNotificationBody(resolvedName, customText, customPosition),
        data: {
          type: 'goal_notification',
          goalId,
          goalName: resolvedName,
          timestamp: new Date().toISOString(),
        },
        sound: true,
      },
      trigger: dailyTrigger(hour, minute),
    });

    return notificationId;
  } catch (error) {
    console.error('Error scheduling goal notification:', error);
    return null;
  }
}

export async function rescheduleAllNotifications(settingsOverride = null) {
  try {
    const settings = settingsOverride || (await getNotificationSettings());

    await cancelAllScheduledNotifications();

    if (!settings.notificationsEnabled) {
      return true;
    }

    if (shouldScheduleGlobal(settings)) {
      await scheduleDailyGoalNotification(settings);
    }

    if (shouldSchedulePerGoal(settings)) {
      const perGoal = settings.perGoalNotifications || {};
      const entries = Object.entries(perGoal);

      await Promise.all(
        entries.map(async ([goalId, goalSettings]) => {
          if (!goalSettings?.enabled) return;

          const goalName = await resolveGoalName(goalId, goalSettings.goalName || '');
          await scheduleGoalNotification(
            goalId,
            goalName,
            goalSettings.time ?? 9,
            goalSettings.timeMinute ?? 0,
            goalSettings.customText,
            goalSettings.customPosition,
            settings
          );
        })
      );
    }

    return true;
  } catch (error) {
    console.error('Error rescheduling notifications:', error);
    return false;
  }
}

export async function toggleNotificationsGlobally(enabled) {
  try {
    if (enabled) {
      const granted = await requestNotificationPermissions();
      if (!granted) return false;
    }

    const settings = await getNotificationSettings();
    settings.notificationsEnabled = enabled;
    await saveNotificationSettings(settings);
    await rescheduleAllNotifications(settings);
    return true;
  } catch (error) {
    console.error('Error toggling notifications:', error);
    return false;
  }
}

export async function updateGlobalNotificationTime(hour, minute = 0) {
  try {
    const settings = await getNotificationSettings();
    settings.globalTime = hour;
    settings.globalTimeMinute = minute;

    await saveNotificationSettings(settings);
    await rescheduleAllNotifications(settings);
    return true;
  } catch (error) {
    console.error('Error updating notification time:', error);
    return false;
  }
}

export async function cancelDailyGoalNotification() {
  try {
    const notificationId = await AsyncStorage.getItem('dailyGoalNotificationId');
    if (notificationId) {
      await Notifications.cancelScheduledNotificationAsync(notificationId);
      await AsyncStorage.removeItem('dailyGoalNotificationId');
    }
  } catch (error) {
    console.error('Error cancelling daily notification:', error);
  }
}

export async function sendTestNotification(
  title = 'Test Notification',
  body = 'This is a test notification from Goal Grower!'
) {
  try {
    return await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: {
          type: 'test_notification',
          timestamp: new Date().toISOString(),
        },
        sound: true,
      },
      trigger: {
        type: 'timeInterval',
        seconds: 1,
        repeats: false,
      },
    });
  } catch (error) {
    console.error('Error sending test notification:', error);
    return null;
  }
}

export async function sendGoalReminderNotification(goalName) {
  try {
    return await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Goal Reminder',
        body: `Don't forget about "${goalName}"!`,
        data: {
          type: 'goal_reminder',
          goalName,
          timestamp: new Date().toISOString(),
        },
        sound: true,
      },
      trigger: {
        type: 'timeInterval',
        seconds: 1,
        repeats: false,
      },
    });
  } catch (error) {
    console.error('Error sending goal reminder:', error);
    return null;
  }
}

export function setupNotificationListeners(navigationRef) {
  const notificationListener = Notifications.addNotificationReceivedListener(() => {});

  const responseListener = Notifications.addNotificationResponseReceivedListener(
    (response) => {
      const notificationType = response.notification.request.content.data?.type;

      if (
        notificationType === 'daily_goal_reminder'
        || notificationType === 'goal_reminder'
        || notificationType === 'goal_notification'
      ) {
        navigateToGoals(navigationRef);
      }
    }
  );

  return () => {
    Notifications.removeNotificationSubscription(notificationListener);
    Notifications.removeNotificationSubscription(responseListener);
  };
}

export function teardownNotificationListeners() {
  if (listenerCleanup) {
    listenerCleanup();
    listenerCleanup = null;
  }
}

export async function initializeNotifications(navigationRef) {
  try {
    await setupAndroidNotificationChannel();

    const permissionGranted = await requestNotificationPermissions();
    if (!permissionGranted) {
      return null;
    }

    const settings = await getNotificationSettings();
    if (settings.notificationsEnabled) {
      await rescheduleAllNotifications(settings);
    }

    teardownNotificationListeners();
    listenerCleanup = setupNotificationListeners(navigationRef);
    return listenerCleanup;
  } catch (error) {
    console.error('Error initializing notifications:', error);
    return null;
  }
}

export async function areNotificationsEnabled() {
  try {
    const settings = await getNotificationSettings();
    return settings.notificationsEnabled;
  } catch (error) {
    console.error('Error checking notification status:', error);
    return false;
  }
}

export async function areDailyNotificationsEnabled() {
  try {
    const settings = await getNotificationSettings();
    return settings.notificationsEnabled && settings.dailyReminderEnabled;
  } catch (error) {
    console.error('Error checking daily notification status:', error);
    return false;
  }
}

export async function getScheduledNotifications() {
  try {
    return await Notifications.getAllScheduledNotificationsAsync();
  } catch (error) {
    console.error('Error getting scheduled notifications:', error);
    return [];
  }
}

export async function getNotificationMode() {
  try {
    const settings = await getNotificationSettings();
    return settings.notificationMode || 'global';
  } catch (error) {
    console.error('Error getting notification mode:', error);
    return 'global';
  }
}

export async function setNotificationMode(mode) {
  try {
    if (!auth.currentUser) return false;

    const settings = await getNotificationSettings();
    settings.notificationMode = mode;

    await saveNotificationSettings(settings);
    await rescheduleAllNotifications(settings);
    return true;
  } catch (error) {
    console.error('Error setting notification mode:', error);
    return false;
  }
}

export async function getGoalNotificationSettings(goalId) {
  try {
    const settings = await getNotificationSettings();
    return settings.perGoalNotifications?.[goalId] || {
      enabled: false,
      time: 9,
      timeMinute: 0,
      customText: '',
      customPosition: 'prefix',
    };
  } catch (error) {
    console.error('Error getting goal notification settings:', error);
    return {
      enabled: false,
      time: 9,
      timeMinute: 0,
      customText: '',
      customPosition: 'prefix',
    };
  }
}

export async function saveGoalNotificationSettings(goalId, notificationSettings) {
  try {
    if (!auth.currentUser) return false;

    const settings = await getNotificationSettings();
    if (!settings.perGoalNotifications) {
      settings.perGoalNotifications = {};
    }

    settings.perGoalNotifications[goalId] = notificationSettings;
    await saveNotificationSettings(settings);
    await rescheduleAllNotifications(settings);
    return true;
  } catch (error) {
    console.error('Error saving goal notification settings:', error);
    return false;
  }
}

export async function removeGoalNotificationSetting(goalId) {
  try {
    if (!auth.currentUser) return false;

    const settings = await getNotificationSettings();
    if (settings.perGoalNotifications?.[goalId]) {
      delete settings.perGoalNotifications[goalId];
      await saveNotificationSettings(settings);
    }

    await cancelGoalNotification(goalId);
    await rescheduleAllNotifications(settings);
    return true;
  } catch (error) {
    console.error('Error removing goal notification setting:', error);
    return false;
  }
}
