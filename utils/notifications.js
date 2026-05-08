import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebaseConfig';

// Configure how notifications should behave when received
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

/**
 * Default notification settings structure
 */
export const DEFAULT_NOTIFICATION_SETTINGS = {
  notificationsEnabled: true,
  notificationMode: 'global', // 'global' or 'individual'
  globalTime: 9, // 9 AM
  globalTimeMinute: 0,
  dailyReminderEnabled: true,
  perGoalNotifications: {}, // { goalId: { enabled: true, time: 9, timeMinute: 0, frequency: 'daily' } }
};

/**
 * Request user permission for notifications
 * Returns true if permission granted, false otherwise
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

/**
 * Get user's notification settings from Firestore
 */
export async function getNotificationSettings() {
  try {
    if (!auth.currentUser) return DEFAULT_NOTIFICATION_SETTINGS;
    
    const settingsDoc = await getDoc(doc(db, 'users', auth.currentUser.uid, 'settings', 'notifications'));
    
    if (settingsDoc.exists()) {
      return { ...DEFAULT_NOTIFICATION_SETTINGS, ...settingsDoc.data() };
    }
    
    return DEFAULT_NOTIFICATION_SETTINGS;
  } catch (error) {
    console.error('Error getting notification settings:', error);
    return DEFAULT_NOTIFICATION_SETTINGS;
  }
}

/**
 * Save user's notification settings to Firestore
 */
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

/**
 * Toggle notifications on/off globally
 */
export async function toggleNotificationsGlobally(enabled) {
  try {
    const settings = await getNotificationSettings();
    settings.notificationsEnabled = enabled;
    
    if (enabled) {
      // Cancel all and reschedule when enabling
      await cancelAllScheduledNotifications();
      await scheduleDailyGoalNotification();
    } else {
      // Cancel all when disabling
      await cancelAllScheduledNotifications();
    }
    
    await saveNotificationSettings(settings);
    return true;
  } catch (error) {
    console.error('Error toggling notifications:', error);
    return false;
  }
}

/**
 * Update global notification time
 */
export async function updateGlobalNotificationTime(hour, minute = 0) {
  try {
    const settings = await getNotificationSettings();
    settings.globalTime = hour;
    settings.globalTimeMinute = minute;
    
    await saveNotificationSettings(settings);
    
    // Reschedule daily notification with new time
    await cancelAllScheduledNotifications();
    if (settings.notificationsEnabled && settings.dailyReminderEnabled) {
      await scheduleDailyGoalNotification();
    }
    
    return true;
  } catch (error) {
    console.error('Error updating notification time:', error);
    return false;
  }
}

/**
 * Schedule a daily notification at specified time (or user's preferred time)
 * Uses customizable time from notification settings
 */
export async function scheduleDailyGoalNotification() {
  try {
    const settings = await getNotificationSettings();
    
    // If notifications are disabled, don't schedule
    if (!settings.notificationsEnabled || !settings.dailyReminderEnabled) {
      return null;
    }

    // Cancel any existing daily notifications
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const dailyGoalNotifications = scheduled.filter(
      (notif) => notif.content.data?.type === 'daily_goal_reminder'
    );
    
    for (const notif of dailyGoalNotifications) {
      await Notifications.cancelNotificationAsync(notif.identifier);
    }

    // Calculate seconds until target time
    const now = new Date();
    const targetTime = new Date();
    targetTime.setHours(settings.globalTime, settings.globalTimeMinute, 0, 0);

    // If it's past the target time today, schedule for tomorrow
    if (now > targetTime) {
      targetTime.setDate(targetTime.getDate() + 1);
    }

    const secondsUntilNotification = Math.floor((targetTime - now) / 1000);

    const messages = [
      `It's time to work on your goals! 🌱`,
      `Good morning! Check in with your goals today.`,
      `Your plants are waiting! Time to achieve your goals. 🌿`,
      `Rise and shine! Let's accomplish something great today.`,
      `Time to nurture your goals! Check your progress. 💚`,
      `Watering time! Check your goals and grow today. 💧`,
    ];

    const randomMessage = messages[Math.floor(Math.random() * messages.length)];

    // Schedule the notification
    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: '🌱 Time to Check Your Goals!',
        body: randomMessage,
        data: {
          type: 'daily_goal_reminder',
          timestamp: new Date().toISOString(),
        },
        sound: true,
        badge: 1,
      },
      trigger: {
        type: 'daily',
        hour: settings.globalTime,
        minute: settings.globalTimeMinute,
      },
    });

    console.log('Daily goal notification scheduled at', settings.globalTime + ':' + String(settings.globalTimeMinute).padStart(2, '0'));
    
    // Store the notification ID for reference
    await AsyncStorage.setItem('dailyGoalNotificationId', notificationId);

    return notificationId;
  } catch (error) {
    console.error('Error scheduling daily notification:', error);
    return null;
  }
}

/**
 * Schedule a per-goal notification
 */
export async function scheduleGoalNotification(goalId, goalName, hour = 9, minute = 0) {
  try {
    const settings = await getNotificationSettings();
    
    if (!settings.notificationsEnabled) {
      return null;
    }

    // Calculate seconds until target time
    const now = new Date();
    const targetTime = new Date();
    targetTime.setHours(hour, minute, 0, 0);

    if (now > targetTime) {
      targetTime.setDate(targetTime.getDate() + 1);
    }

    const secondsUntilNotification = Math.floor((targetTime - now) / 1000);

    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: `⏰ ${goalName}`,
        body: `Time to work on your goal: ${goalName}`,
        data: {
          type: 'goal_notification',
          goalId,
          goalName,
          timestamp: new Date().toISOString(),
        },
        sound: true,
      },
      trigger: {
        type: 'daily',
        hour,
        minute,
      },
    });

    return notificationId;
  } catch (error) {
    console.error('Error scheduling goal notification:', error);
    return null;
  }
}

/**
 * Cancel all scheduled notifications
 */
export async function cancelAllScheduledNotifications() {
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    for (const notif of scheduled) {
      await Notifications.cancelNotificationAsync(notif.identifier);
    }
    console.log('All notifications cancelled');
  } catch (error) {
    console.error('Error cancelling all notifications:', error);
  }
}

/**
 * Cancel the daily goal notification
 */
export async function cancelDailyGoalNotification() {
  try {
    const notificationId = await AsyncStorage.getItem('dailyGoalNotificationId');
    if (notificationId) {
      await Notifications.cancelNotificationAsync(notificationId);
      await AsyncStorage.removeItem('dailyGoalNotificationId');
      console.log('Daily goal notification cancelled');
    }
  } catch (error) {
    console.error('Error cancelling daily notification:', error);
  }
}

/**
 * Send an immediate test notification
 */
export async function sendTestNotification(title = 'Test Notification', body = 'This is a test notification from Goal Grower!') {
  try {
    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: {
          type: 'test_notification',
          timestamp: new Date().toISOString(),
        },
        sound: true,
      },
      trigger: { seconds: 1 }, // Send immediately
    });

    console.log('Test notification sent:', notificationId);
    return notificationId;
  } catch (error) {
    console.error('Error sending test notification:', error);
    return null;
  }
}

/**
 * Send a custom goal reminder notification (immediate)
 */
export async function sendGoalReminderNotification(goalName) {
  try {
    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: '🎯 Goal Reminder',
        body: `Don't forget about "${goalName}"!`,
        data: {
          type: 'goal_reminder',
          goalName,
          timestamp: new Date().toISOString(),
        },
        sound: true,
      },
      trigger: { seconds: 1 }, // Send immediately
    });

    console.log('Goal reminder sent:', notificationId);
    return notificationId;
  } catch (error) {
    console.error('Error sending goal reminder:', error);
    return null;
  }
}

/**
 * Set up notification listeners
 * Call this in your app's useEffect to handle notification interactions
 */
export function setupNotificationListeners(navigation) {
  // Handle notification received while app is open
  const notificationListener = Notifications.addNotificationReceivedListener(
    (notification) => {
      console.log('Notification received:', notification);
    }
  );

  // Handle notification tapped/selected
  const responseListener = Notifications.addNotificationResponseReceivedListener(
    (response) => {
      const data = response.notification.request.content.data;
      const notificationType = data?.type;
      
      if (notificationType === 'daily_goal_reminder' || notificationType === 'goal_reminder' || notificationType === 'goal_notification') {
        // Navigate to Goals screen when notification is tapped
        if (navigation) {
          navigation.navigate('Goals');
        }
      }
    }
  );

  // Cleanup listeners
  return () => {
    Notifications.removeNotificationSubscription(notificationListener);
    Notifications.removeNotificationSubscription(responseListener);
  };
}

/**
 * Initialize the notification system
 * Call this once when the app starts
 */
export async function initializeNotifications(navigation) {
  try {
    // Request permissions
    const permissionGranted = await requestNotificationPermissions();
    
    if (permissionGranted) {
      const settings = await getNotificationSettings();
      
      if (settings.notificationsEnabled) {
        // Schedule daily notification
        await scheduleDailyGoalNotification();
      }
      
      // Set up listeners
      setupNotificationListeners(navigation);
      
      console.log('Notifications initialized successfully');
    } else {
      console.log('Notification permissions not granted');
    }
  } catch (error) {
    console.error('Error initializing notifications:', error);
  }
}

/**
 * Check if notifications are enabled
 */
export async function areNotificationsEnabled() {
  try {
    const settings = await getNotificationSettings();
    return settings.notificationsEnabled;
  } catch (error) {
    console.error('Error checking notification status:', error);
    return false;
  }
}

/**
 * Check if daily notifications are enabled
 */
export async function areDailyNotificationsEnabled() {
  try {
    const settings = await getNotificationSettings();
    return settings.notificationsEnabled && settings.dailyReminderEnabled;
  } catch (error) {
    console.error('Error checking daily notification status:', error);
    return false;
  }
}

/**
 * Get all scheduled notifications
 */
export async function getScheduledNotifications() {
  try {
    return await Notifications.getAllScheduledNotificationsAsync();
  } catch (error) {
    console.error('Error getting scheduled notifications:', error);
    return [];
  }
}

/**
 * Get notification mode (global or individual)
 */
export async function getNotificationMode() {
  try {
    const settings = await getNotificationSettings();
    return settings.notificationMode || 'global';
  } catch (error) {
    console.error('Error getting notification mode:', error);
    return 'global';
  }
}

/**
 * Set notification mode (global or individual)
 */
export async function setNotificationMode(mode) {
  try {
    if (!auth.currentUser) return false;
    
    const settings = await getNotificationSettings();
    settings.notificationMode = mode;
    
    await saveNotificationSettings(settings);
    
    // Reschedule notifications based on new mode
    await cancelAllScheduledNotifications();
    if (settings.notificationsEnabled) {
      if (mode === 'global' && settings.dailyReminderEnabled) {
        await scheduleDailyGoalNotification();
      }
    }
    
    return true;
  } catch (error) {
    console.error('Error setting notification mode:', error);
    return false;
  }
}

/**
 * Get notification settings for a specific goal
 */
export async function getGoalNotificationSettings(goalId) {
  try {
    const settings = await getNotificationSettings();
    return settings.perGoalNotifications?.[goalId] || {
      enabled: false,
      time: 9,
      timeMinute: 0,
    };
  } catch (error) {
    console.error('Error getting goal notification settings:', error);
    return {
      enabled: false,
      time: 9,
      timeMinute: 0,
    };
  }
}

/**
 * Save notification settings for a specific goal
 */
export async function saveGoalNotificationSettings(goalId, notificationSettings) {
  try {
    if (!auth.currentUser) return false;
    
    const settings = await getNotificationSettings();
    if (!settings.perGoalNotifications) {
      settings.perGoalNotifications = {};
    }
    
    settings.perGoalNotifications[goalId] = notificationSettings;
    
    await saveNotificationSettings(settings);
    
    // Reschedule this goal's notification
    if (notificationSettings.enabled && settings.notificationsEnabled) {
      await scheduleGoalNotification(
        goalId,
        '', // goalName will be passed separately
        notificationSettings.time,
        notificationSettings.timeMinute
      );
    } else {
      // Cancel this goal's notification
      await cancelGoalNotification(goalId);
    }
    
    return true;
  } catch (error) {
    console.error('Error saving goal notification settings:', error);
    return false;
  }
}

/**
 * Cancel notification for a specific goal
 */
export async function cancelGoalNotification(goalId) {
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const goalNotifications = scheduled.filter(
      (notif) => notif.content.data?.goalId === goalId
    );
    
    for (const notif of goalNotifications) {
      await Notifications.cancelNotificationAsync(notif.identifier);
    }
    
    console.log(`Notifications cancelled for goal: ${goalId}`);
  } catch (error) {
    console.error('Error cancelling goal notification:', error);
  }
}

