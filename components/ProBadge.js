import React from "react";
import { Image } from "react-native";

const PRO_BADGE = require("../assets/Icons/ProBadge.png");
const BADGE_ASPECT = 2.35;

export default function ProBadge({ height = 24 }) {
  return (
    <Image
      source={PRO_BADGE}
      style={{ height, width: height * BADGE_ASPECT }}
      resizeMode="contain"
    />
  );
}
