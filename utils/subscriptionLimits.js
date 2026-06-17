import { Alert } from "react-native";
import {
  FREE_LIMITS,
  getLimitsForTier,
  PRO_LIMITS,
  STORAGE_PAGE_ID,
} from "../constants/subscriptionLimits";

function buildGateResult({ allowed, feature, current, limit, proLimit, isPro }) {
  return {
    allowed,
    feature,
    current,
    limit,
    proLimit,
    upgradeRequired: !allowed && !isPro,
    reason: allowed
      ? ""
      : isPro
        ? `Pro allows up to ${limit} ${feature}. You have ${current}.`
        : `Free plan allows ${limit} ${feature}. You have ${current}. Upgrade to Pro for ${proLimit}.`,
  };
}

export function isActiveNonFrozenGoal(goal) {
  return !goal?.isFrozenTrophyState;
}

export function countActiveGoals(goals = []) {
  return goals.filter(isActiveNonFrozenGoal).length;
}

export function countOwnedSharedGardens(gardens = [], uid) {
  if (!uid) return 0;
  return gardens.filter((garden) => garden?.ownerId === uid).length;
}

export function countJoinedSharedGardens(gardens = [], uid) {
  if (!uid) return 0;
  return gardens.filter((garden) => {
    const memberIds = Array.isArray(garden?.memberIds) ? garden.memberIds : [];
    return memberIds.includes(uid) && garden?.ownerId !== uid;
  }).length;
}

export function countGardenPages(pages = []) {
  return pages.filter((page) => page?.id !== STORAGE_PAGE_ID).length;
}

export function canCreateGoal({ isPro, goals = [] }) {
  const limits = getLimitsForTier(isPro);
  const current = countActiveGoals(goals);
  const allowed = current < limits.activeGoals;
  return buildGateResult({
    allowed,
    feature: "active goals",
    current,
    limit: limits.activeGoals,
    proLimit: PRO_LIMITS.activeGoals,
    isPro,
  });
}

export function canAddGardenPage({ isPro, pages = [] }) {
  const limits = getLimitsForTier(isPro);
  const current = countGardenPages(pages);
  const allowed = current < limits.gardenPages;
  return buildGateResult({
    allowed,
    feature: "garden pages",
    current,
    limit: limits.gardenPages,
    proLimit: PRO_LIMITS.gardenPages,
    isPro,
  });
}

export function canCreateSharedGarden({ isPro, gardens = [], uid }) {
  const limits = getLimitsForTier(isPro);
  const current = countOwnedSharedGardens(gardens, uid);
  const allowed = current < limits.sharedGardensCreated;
  return buildGateResult({
    allowed,
    feature: "shared gardens you create",
    current,
    limit: limits.sharedGardensCreated,
    proLimit: PRO_LIMITS.sharedGardensCreated,
    isPro,
  });
}

export function canJoinSharedGarden({ isPro, gardens = [], uid }) {
  const limits = getLimitsForTier(isPro);
  const current = countJoinedSharedGardens(gardens, uid);
  const allowed = current < limits.sharedGardensJoined;
  return buildGateResult({
    allowed,
    feature: "shared gardens you join",
    current,
    limit: limits.sharedGardensJoined,
    proLimit: PRO_LIMITS.sharedGardensJoined,
    isPro,
  });
}

export function showSubscriptionLimitAlert(result, openDefaultPaywall) {
  if (!result || result.allowed) return false;

  const buttons = [{ text: "Not now", style: "cancel" }];
  if (result.upgradeRequired && typeof openDefaultPaywall === "function") {
    buttons.push({
      text: "Upgrade to Pro",
      onPress: openDefaultPaywall,
    });
  }

  Alert.alert("Limit reached", result.reason, buttons);
  return true;
}

export function tryNavigateToAddGoal({ navigation, isPro, goals, openDefaultPaywall, params }) {
  const result = canCreateGoal({ isPro, goals });
  if (showSubscriptionLimitAlert(result, openDefaultPaywall)) {
    return false;
  }
  navigation.navigate("AddGoal", params);
  return true;
}

export function getUsageSummary({ isPro, goals = [], gardens = [], uid }) {
  const limits = getLimitsForTier(isPro);
  return {
    limits,
    activeGoals: {
      current: countActiveGoals(goals),
      limit: limits.activeGoals,
    },
    sharedGardensCreated: {
      current: countOwnedSharedGardens(gardens, uid),
      limit: limits.sharedGardensCreated,
    },
    sharedGardensJoined: {
      current: countJoinedSharedGardens(gardens, uid),
      limit: limits.sharedGardensJoined,
    },
  };
}
