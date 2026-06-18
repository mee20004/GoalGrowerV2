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
  {
    image: require('../assets/Wallpapers/flowers_p.png'),
    previewColor: '#f5d9c8',
  },
  {
    image: require('../assets/Wallpapers/grass_p.png'),
    previewColor: '#a8c686',
  },
  {
    image: require('../assets/Wallpapers/coral_p.png'),
    previewColor: '#f0c4a8',
  },
  {
    image: require('../assets/Wallpapers/greenLines_p.png'),
    previewColor: '#9aaa78',
  },
  {
    image: require('../assets/Wallpapers/waves_p.png'),
    previewColor: '#7eb0d8',
  },
];

// Backwards-compatible image array for existing screens.
export const WALLPAPER_ASSETS = WALLPAPER_OPTIONS.map((option) => option.image);
