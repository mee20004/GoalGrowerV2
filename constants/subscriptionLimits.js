export const PRO_MONTHLY_COIN_GRANT = 200;

export const FREE_LIMITS = {
  activeGoals: 5,
  gardenPages: 2,
  sharedGardensCreated: 1,
  sharedGardensJoined: 1,
};

export const PRO_LIMITS = {
  activeGoals: 30,
  gardenPages: 7,
  sharedGardensCreated: 3,
  sharedGardensJoined: 5,
};

export const STORAGE_PAGE_ID = "storage";

export function getLimitsForTier(isPro) {
  return isPro ? PRO_LIMITS : FREE_LIMITS;
}

export const PRO_BENEFITS_SUMMARY =
  `Up to ${PRO_LIMITS.activeGoals} active goals, ${PRO_LIMITS.gardenPages} garden pages, `
  + `create ${PRO_LIMITS.sharedGardensCreated} shared gardens, join ${PRO_LIMITS.sharedGardensJoined} others, `
  + `and ${PRO_MONTHLY_COIN_GRANT} coins every month.`;

export const FREE_LIMITS_SUMMARY =
  `Up to ${FREE_LIMITS.activeGoals} active goals, ${FREE_LIMITS.gardenPages} garden pages, `
  + `create ${FREE_LIMITS.sharedGardensCreated} shared garden, and join ${FREE_LIMITS.sharedGardensJoined} other.`;

