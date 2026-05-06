import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';


// Configure how notifications should behave when received
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

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
 * Schedule a daily notification at 9 AM
 * This will trigger every day at 9:00 AM
 */
export async function scheduleDailyGoalNotification() {
  try {
    // First, cancel any existing daily notifications
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const dailyGoalNotifications = scheduled.filter(
      (notif) => notif.content.data?.type === 'daily_goal_reminder'
    );
    
    for (const notif of dailyGoalNotifications) {
      await Notifications.cancelNotificationAsync(notif.identifier);
    }

    // Calculate seconds until 9 AM tomorrow
    const now = new Date();
    const nineAM = new Date();
    nineAM.setHours(9, 0, 0, 0);

    // If it's past 9 AM today, schedule for tomorrow
    if (now > nineAM) {
      nineAM.setDate(nineAM.getDate() + 1);
    }

    const secondsUntilNotification = Math.floor((nineAM - now) / 1000);

    // Get user's goals count for personalized message
    const goalsCount = await AsyncStorage.getItem('goalsCount').then(
      (val) => val ? parseInt(val) : 0
    ).catch(() => 0);

    const messages = [
      `It's time to work on your goals! 🌱`,
      `Good morning! Check in with your goals today.`,
      `Your plants are waiting! Time to achieve your goals. 🌿`,
      `Rise and shine! Let's accomplish something great today.`,
      `Morning motivation: You've got ${goalsCount || 'some'} goals waiting for you!`,
      `Watering time! Check your goals and grow today. 💧`,
    ];

    const randomMessage = messages[Math.floor(Math.random() * messages.length)];

    // Schedule the notification
    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: '🌱 Check on your Plants! Make a plan to water them today! YOU GOT THIS!',
        body: randomMessage,
        data: {
          type: 'daily_goal_reminder',
          timestamp: new Date().toISOString(),
        },
        sound: true,
        badge: 1,
      },
      trigger: {
        seconds: secondsUntilNotification,
        repeats: true, // This is the key for daily repetition
      },
    });

    console.log('Daily goal notification scheduled:', notificationId);
    
    // Store the notification ID for reference
    await AsyncStorage.setItem('dailyGoalNotificationId', notificationId);

    return notificationId;
  } catch (error) {
    console.error('Error scheduling daily notification:', error);
    return null;
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
      const notificationType = response.notification.request.content.data?.type;
      
      if (notificationType === 'daily_goal_reminder') {
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
      // Schedule daily notification
      await scheduleDailyGoalNotification();
      
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
 * Send a custom goal reminder notification
 * Useful for testing or sending specific goal reminders
 */
export async function sendGoalReminderNotification(goalName) {
  try {
    await Notifications.scheduleNotificationAsync({
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
      trigger: { 
        seconds: 1, 
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, 
    }, // Send immediately
    });
  } catch (error) {
    console.error('Error sending goal reminder:', error);
  }
}

/**
 * Check if daily notifications are enabled
 */
export async function areDailyNotificationsEnabled() {
  try {
    const notificationId = await AsyncStorage.getItem('dailyGoalNotificationId');
    return !!notificationId;
  } catch (error) {
    console.error('Error checking notification status:', error);
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
