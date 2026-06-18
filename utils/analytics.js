import { Platform } from "react-native";
import {
  getAnalytics,
  getAppInstanceId,
  logEvent,
  logScreenView as logFirebaseScreenView,
  setAnalyticsCollectionEnabled,
  setUserId,
  setUserProperty,
} from "@react-native-firebase/analytics";

const isNative = Platform.OS === "ios" || Platform.OS === "android";
let initialized = false;

function getAnalyticsInstance() {
  return getAnalytics();
}

export async function initializeAnalytics() {
  if (!isNative || initialized) return;
  initialized = true;

  try {
    const analytics = getAnalyticsInstance();
    await setAnalyticsCollectionEnabled(analytics, true);

    if (__DEV__) {
      const instanceId = await getAppInstanceId(analytics);
      console.log("[analytics] collection enabled, app instance:", instanceId);
    }
  } catch (error) {
    if (__DEV__) console.warn("[analytics] initialize failed", error);
  }
}

export async function logAnalyticsEvent(name, params = {}) {
  if (!isNative) return;
  try {
    await logEvent(getAnalyticsInstance(), name, params);
    if (__DEV__) console.log("[analytics] event", name, params);
  } catch (error) {
    if (__DEV__) console.warn("[analytics]", name, error);
  }
}

export async function setAnalyticsUserId(uid) {
  if (!isNative) return;
  try {
    await setUserId(getAnalyticsInstance(), uid || null);
  } catch (error) {
    if (__DEV__) console.warn("[analytics] setUserId", error);
  }
}

export async function setAnalyticsUserProperty(name, value) {
  if (!isNative) return;
  try {
    await setUserProperty(getAnalyticsInstance(), name, value ?? null);
  } catch (error) {
    if (__DEV__) console.warn("[analytics] setUserProperty", name, error);
  }
}

export async function logScreenView(screenName) {
  if (!isNative || !screenName) return;
  try {
    await logFirebaseScreenView(getAnalyticsInstance(), {
      screen_name: screenName,
      screen_class: screenName,
    });
    if (__DEV__) console.log("[analytics] screen_view", screenName);
  } catch (error) {
    if (__DEV__) console.warn("[analytics] logScreenView", screenName, error);
  }
}

export function getActiveRouteName(navigationRef) {
  const rootState = navigationRef?.getRootState?.();
  if (!rootState) return null;

  let state = rootState;
  while (state?.routes?.length) {
    const route = state.routes[state.index ?? 0];
    if (!route) return null;
    if (!route.state) return route.name;
    state = route.state;
  }

  return null;
}
