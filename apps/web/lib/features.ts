/**
 * Release flags. Create/join are live since Milestone 2; set a flag to "false" to temporarily close
 * a flow (e.g. during an incident) without a deploy of new code.
 */
export const features = {
  createRoom: process.env.NEXT_PUBLIC_FEATURE_CREATE_ROOM !== "false",
  joinRoom: process.env.NEXT_PUBLIC_FEATURE_JOIN_ROOM !== "false",
} as const;

export type FeatureName = keyof typeof features;
