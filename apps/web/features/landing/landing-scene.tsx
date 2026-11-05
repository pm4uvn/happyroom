"use client";

import { useEffect, useState } from "react";
import {
  AVATAR_PRESET_IDS,
  EMOTES,
  type AvatarAnimationState,
  type EmoteId,
  type ThemeId,
} from "@happyroom/shared";
import { PartyScene } from "@/features/room-scene/party-scene";
import { Avatar } from "@/features/room-scene/avatar";
import type { QualityTier } from "@/features/room-scene/capabilities";
import { AvatarTag, createLabelRegistry, Label, LabelLayer } from "@/features/room-scene/labels";

const EMOTE_TO_ANIMATION: Record<EmoteId, AvatarAnimationState> = {
  wave: "wave",
  clap: "clap",
  dance: "dance",
  celebrate: "celebrate",
  heart: "wave",
  laugh: "clap",
};

/**
 * Six demo guests in an arc on the far side of the cake (the camera looks in from +X/+Z), so the
 * cake stays unobstructed and guests face both the cake and the viewer.
 */
const GUESTS = AVATAR_PRESET_IDS.map((preset, i) => {
  const angle = (5 * Math.PI) / 4 - 1.15 + (i / (AVATAR_PRESET_IDS.length - 1)) * 2.3;
  const r = 2.45;
  const x = Math.cos(angle) * r;
  const z = Math.sin(angle) * r;
  return { preset, x, z, rotY: Math.atan2(-x, -z) };
});

export interface LandingSceneProps {
  themeId: ThemeId;
  candlesLit: boolean;
  confettiKey: number;
  emote: { id: EmoteId; key: number } | null;
  celebrating: boolean;
  quality: QualityTier;
  reducedMotion: boolean;
  allowOrbit: boolean;
  labels: { scene: string; cake: string; avatars: Record<string, string> };
  onCakeActivate: () => void;
  onReady: () => void;
}

/** Landing-page composition of the shared party scene with local demo guests. */
export default function LandingScene(props: LandingSceneProps) {
  const animation: AvatarAnimationState = props.celebrating
    ? "celebrate"
    : props.emote
      ? EMOTE_TO_ANIMATION[props.emote.id]
      : "idle";
  const [registry] = useState(createLabelRegistry);
  const bubble = props.emote ? EMOTES[props.emote.id].icon : props.celebrating ? "🎉" : null;

  return (
    <div className="absolute inset-0">
      <PartyScene
        ariaLabel={props.labels.scene}
        themeId={props.themeId}
        cakeStyle="berry_dream"
        decoration="balloons_pastel"
        candlesLit={props.candlesLit}
        confettiKey={props.confettiKey}
        quality={props.quality}
        reducedMotion={props.reducedMotion}
        allowOrbit={props.allowOrbit}
        cakeLabel={props.labels.cake}
        onCakeActivate={props.onCakeActivate}
      >
        <SceneReady onReady={props.onReady} />
        {GUESTS.map((g, i) => (
          <Avatar
            key={g.preset}
            preset={g.preset}
            position={[g.x, 0, g.z]}
            rotationY={g.rotY}
            animation={animation}
            animationKey={props.emote?.key ?? props.confettiKey}
            label={{ id: g.preset, registry }}
            reducedMotion={props.reducedMotion}
            seed={i * 1.3}
          />
        ))}
      </PartyScene>
      <LabelLayer>
        {GUESTS.map((g) => (
          <Label key={g.preset} id={g.preset} registry={registry}>
            <AvatarTag name={props.labels.avatars[g.preset]} bubble={bubble} />
          </Label>
        ))}
      </LabelLayer>
    </div>
  );
}

/** Mounted inside the Canvas: signals that the scene graph has committed and rendered. */
function SceneReady({ onReady }: { onReady: () => void }) {
  useEffect(() => {
    const id = requestAnimationFrame(() => onReady());
    return () => cancelAnimationFrame(id);
  }, [onReady]);
  return null;
}
