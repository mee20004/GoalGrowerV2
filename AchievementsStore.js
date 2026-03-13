// AchievementsStore.js

export const ACHIEVEMENTS = [
  { 
    id: "first_goal", 
    title: "First Steps", 
    desc: "Complete your very first goal.", 
    icon: "flag", // Swapped emoji for Ionicons name
    check: (stats) => stats.appStreak >= 1
  },
  { 
    id: "streak_3", 
    title: "On a Roll", 
    desc: "Reach a 3-day app streak.", 
    icon: "flame", // Swapped emoji for Ionicons name
    check: (stats) => stats.appStreak >= 3
  },
  { 
    id: "streak_7", 
    title: "1 Week Strong", 
    desc: "Reach a 7-day app streak.", 
    icon: "trophy", // Swapped emoji for Ionicons name
    check: (stats) => stats.appStreak >= 7
  },
  { 
    id: "score_100", 
    title: "Century Club", 
    desc: "Reach an overall score of 100.", 
    icon: "medal", // Swapped emoji for Ionicons name
    check: (stats) => stats.overallScore >= 100 
  }
];