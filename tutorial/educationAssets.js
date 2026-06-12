import { PLANT_ASSETS } from "../constants/PlantAssets";

const fern = PLANT_ASSETS.fern ?? {};

export const TUTORIAL_GROWTH_STAGE_PLANTS = [
  fern.stage1?.alive,
  fern.stage2?.alive,
  fern.stage3?.alive,
  fern.stage4?.alive,
].filter(Boolean);

export const TUTORIAL_HEALTHY_PLANT_IMAGE =
  fern.stage4?.alive ?? fern.stage3?.alive;
export const TUTORIAL_WILTING_PLANT_IMAGE =
  fern.stage4?.dying ?? fern.stage4?.dry ?? fern.stage3?.dying;

// Legacy exports
export const TUTORIAL_GROWTH_STAGE_IMAGES = TUTORIAL_GROWTH_STAGE_PLANTS;
export const TUTORIAL_GROWTH_STAGE_START = TUTORIAL_GROWTH_STAGE_PLANTS[0];
export const TUTORIAL_GROWTH_STAGE_END =
  TUTORIAL_GROWTH_STAGE_PLANTS[TUTORIAL_GROWTH_STAGE_PLANTS.length - 1];
