import { Platform, NativeModules } from "react-native";

const isNative = Platform.OS === "ios" || Platform.OS === "android";
const hasRnFirebaseNativeModule = isNative && !!NativeModules.RNFBAppModule;

let initialized = false;
let firebaseAnalyticsModule = null;

function getFirebaseAnalyticsModule() {
  if (!hasRnFirebaseNativeModule) return null;
  if (!firebaseAnalyticsModule) {
    try {
      firebaseAnalyticsModule = require("@react-native-firebase/analytics");
    } catch (error) {
      if (__DEV__) {
        console.warn(
          "[analytics] React Native Firebase is not available in this build. Reinstall with `npx expo run:ios`.",
          error
        );
      }
      return null;
    }
  }
  return firebaseAnalyticsModule;
}

function getAnalyticsInstance() {
  const mod = getFirebaseAnalyticsModule();
  return mod ? mod.getAnalytics() : null;
}

export async function initializeAnalytics() {
  if (!hasRnFirebaseNativeModule || initialized) return;
  initialized = true;

  const mod = getFirebaseAnalyticsModule();
  const analytics = getAnalyticsInstance();
  if (!mod || !analytics) return;

  try {
    await mod.setAnalyticsCollectionEnabled(analytics, true);

    if (__DEV__) {
      const instanceId = await mod.getAppInstanceId(analytics);
      console.log("[analytics] collection enabled, app instance:", instanceId);
    }
  } catch (error) {
    if (__DEV__) console.warn("[analytics] initialize failed", error);
  }
}

export async function logAnalyticsEvent(name, params = {}) {
  const mod = getFirebaseAnalyticsModule();
  const analytics = getAnalyticsInstance();
  if (!mod || !analytics) return;

  try {
    await mod.logEvent(analytics, name, params);
    if (__DEV__) console.log("[analytics] event", name, params);
  } catch (error) {
    if (__DEV__) console.warn("[analytics]", name, error);
  }
}

export async function setAnalyticsUserId(uid) {
  const mod = getFirebaseAnalyticsModule();
  const analytics = getAnalyticsInstance();
  if (!mod || !analytics) return;

  try {
    await mod.setUserId(analytics, uid || null);
  } catch (error) {
    if (__DEV__) console.warn("[analytics] setUserId", error);
  }
}

export async function setAnalyticsUserProperty(name, value) {
  const mod = getFirebaseAnalyticsModule();
  const analytics = getAnalyticsInstance();
  if (!mod || !analytics) return;

  try {
    await mod.setUserProperty(analytics, name, value ?? null);
  } catch (error) {
    if (__DEV__) console.warn("[analytics] setUserProperty", name, error);
  }
}

export async function logScreenView(screenName) {
  const mod = getFirebaseAnalyticsModule();
  const analytics = getAnalyticsInstance();
  if (!mod || !analytics || !screenName) return;

  try {
    await mod.logScreenView(analytics, {
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
