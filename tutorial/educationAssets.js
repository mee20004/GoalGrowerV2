import { PLANT_ASSETS } from "../constants/PlantAssets";

export const TUTORIAL_GROWTH_STAGE_START =
  PLANT_ASSETS.fern?.stage1?.alive ?? PLANT_ASSETS.fern?.stage2?.alive;
export const TUTORIAL_GROWTH_STAGE_END =
  PLANT_ASSETS.fern?.stage4?.alive ?? PLANT_ASSETS.fern?.stage3?.alive;

export const TUTORIAL_HEALTHY_PLANT_IMAGE =
  PLANT_ASSETS.fern?.stage3?.alive ?? PLANT_ASSETS.fern?.stage2?.alive;
export const TUTORIAL_WILTING_PLANT_IMAGE =
  PLANT_ASSETS.fern?.stage3?.dry ??
  PLANT_ASSETS.fern?.stage3?.dying ??
  PLANT_ASSETS.fern?.stage2?.dry;
