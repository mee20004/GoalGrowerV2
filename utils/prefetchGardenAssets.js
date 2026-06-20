import { Image } from "react-native";
import { PLANT_ASSETS } from "../constants/PlantAssets";
import { POT_ASSETS } from "../constants/PotAssets";
import { FAR_BG_ASSETS } from "../constants/FarBGAssets";
import { FRAME_ASSETS } from "../constants/FrameAssets";
import { WALLPAPER_ASSETS } from "../constants/WallpaperAssets";
import { getGrowthStage, getPlantHealthState } from "./goalState";

function resolveUri(source) {
  if (!source) return null;
  return Image.resolveAssetSource(source)?.uri || null;
}

async function prefetchSource(source) {
  const uri = resolveUri(source);
  if (!uri) return;
  try {
    await Image.prefetch(uri);
  } catch (_) {
    // Ignore individual prefetch failures.
  }
}

export async function prefetchImageSources(sources) {
  const unique = [...new Set(sources.filter(Boolean))];
  await Promise.all(unique.map(prefetchSource));
}

export function getPlantImageSource(plant, today = new Date()) {
  const species = plant?.plantSpecies
    || ((plant?.type !== "completion" && plant?.type !== "quantity") ? plant?.type : "fern");
  const speciesAssets = PLANT_ASSETS[species] || PLANT_ASSETS.fern;
  const stage = getGrowthStage(plant?.totalCompletions);
  const { status } = getPlantHealthState(plant, today, null);
  return speciesAssets?.[stage]?.[status]
    || speciesAssets?.[stage]?.alive
    || PLANT_ASSETS.fern?.stage1?.alive;
}

export function collectGardenAssetSources({ plants = [], customizations = {}, pageIds = [] }) {
  const sources = [];

  const pageIdList = pageIds.length ? pageIds : ["default"];
  pageIdList.forEach((pageId) => {
    if (pageId === "storage") return;
    const custom = customizations?.[pageId] || {};
    const farBgIdx = custom.farBg ?? 0;
    const wallBgIdx = custom.wallBg ?? 0;
    const windowFrameIdx = custom.windowFrame ?? 0;
    if (FAR_BG_ASSETS[farBgIdx]) sources.push(FAR_BG_ASSETS[farBgIdx]);
    if (WALLPAPER_ASSETS[wallBgIdx]) sources.push(WALLPAPER_ASSETS[wallBgIdx]);
    if (FRAME_ASSETS[windowFrameIdx]) sources.push(FRAME_ASSETS[windowFrameIdx]);
  });

  plants.forEach((plant) => {
    if (!plant?.shelfPosition) return;
    sources.push(getPlantImageSource(plant));
    const potKey = plant.potType || plant.potStyle || "default";
    if (POT_ASSETS[potKey]) sources.push(POT_ASSETS[potKey]);
  });

  return sources;
}

let defaultAssetsPrefetched = false;

/** Warm the most common garden textures once per app session. */
export async function prefetchDefaultGardenAssets() {
  if (defaultAssetsPrefetched) return;
  defaultAssetsPrefetched = true;
  await prefetchImageSources([
    FAR_BG_ASSETS[0],
    WALLPAPER_ASSETS[0],
    FRAME_ASSETS[0],
    POT_ASSETS.default,
    PLANT_ASSETS.fern?.stage1?.alive,
  ]);
}
