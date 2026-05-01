// WallpaperAssets.js
// Keep wallpaper image + matching preview tint together so new wallpapers stay in sync.
export const WALLPAPER_OPTIONS = [
  {
    image: require('../assets/Wallpapers/Tan_p.png'),
    previewColor: '#ffc981',
  },
  {
    image: require('../assets/Wallpapers/Blue_p.png'),
    previewColor: '#678ec1',
  },
];

// Backwards-compatible image array for existing screens.
export const WALLPAPER_ASSETS = WALLPAPER_OPTIONS.map((option) => option.image);
