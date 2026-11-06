import type { EventType } from "@happyroom/shared";

/** Globe colours (sRGB hex). Kept in sync with the night tokens in packages/ui tokens.css. */
export const GLOBE_COLORS = {
  oceanDeep: "#040718",
  oceanLit: "#0e1846",
  landDark: "#20255a",
  landLit: "#5a5ec4",
  coastGlow: "#5fd9ff",
  coast: "#8be8f4",
  border: "#c9b9ff",
  grid: "#aab4d6",
  rim: "#6d7cff",
  atmosphere: "#5f8dff",
  cluster: "#e9f9ff",
  selected: "#ffc861",
} as const;

export const TYPE_COLORS: Record<EventType, string> = {
  birthday: "#ffc861",
  wedding: "#ff9ec2",
  graduation: "#4fd8eb",
  anniversary: "#c9b9ff",
  corporate: "#7ee0b8",
};
