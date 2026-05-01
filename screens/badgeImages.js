// Utility to map trophy tier to badge image
export const BADGE_IMAGES = {
  bronze: require('../assets/Icons/Badge_Bronze.png'),
  silver: require('../assets/Icons/Badge_Silver.png'),
  gold: require('../assets/Icons/Badge_Gold.png'),
  platinum: require('../assets/Icons/Badge_Platinum.png'),
};

export function getBadgeImageForTrophyKey(key) {
  switch (key) {
    case 'bronze':
      return BADGE_IMAGES.bronze;
    case 'silver':
      return BADGE_IMAGES.silver;
    case 'gold':
      return BADGE_IMAGES.gold;
    case 'platinum':
      return BADGE_IMAGES.platinum;
    default:
      return BADGE_IMAGES.bronze;
  }
}
