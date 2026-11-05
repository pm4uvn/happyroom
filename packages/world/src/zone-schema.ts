import { z } from "zod";

/**
 * Zone definition — the data contract for every place in HAPPYROOM World.
 *
 * Authoring source: packages/world/zones/*.zone.json (validated by this schema).
 * Runtime source: the `world_zones.definition` column, written by `pnpm world:sync`.
 * Adding a zone = a JSON file (+ optional GLB assets) and a sync. No engine changes.
 *
 * Coordinates: metres, Y-up, ground at y = 0 (glTF/Three.js convention; Blender exports with +Y up).
 */

const id = z.string().regex(/^[a-z0-9_]{2,48}$/, "ids are lowercase snake_case");
const vec3 = z.tuple([z.number(), z.number(), z.number()]);
const localized = z.object({ en: z.string().min(1), vi: z.string().min(1), ja: z.string().min(1) });

export const rectSchema = z
  .object({ minX: z.number(), maxX: z.number(), minZ: z.number(), maxZ: z.number() })
  .refine((r) => r.maxX > r.minX && r.maxZ > r.minZ, "empty rectangle");
export type Rect = z.infer<typeof rectSchema>;

/** Floor-plane collider. Boxes are axis-aligned after the object's (90°-step) rotation is applied. */
export const colliderSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("circle"), radius: z.number().positive() }),
  z.object({ kind: z.literal("box"), width: z.number().positive(), depth: z.number().positive() }),
]);
export type ColliderShape = z.infer<typeof colliderSchema>;

export const interactionSchema = z.object({
  /** Radius (m) within which the "Interact" prompt appears. */
  radius: z.number().positive().max(10),
  /** Translation key for the prompt label, e.g. "world.interact.read_sign". */
  promptKey: z.string().min(1),
  action: z.discriminatedUnion("type", [
    z.object({ type: z.literal("message"), messageKey: z.string().min(1) }),
    z.object({ type: z.literal("portal"), portalId: id }),
  ]),
});

/**
 * A placed object. `type` selects the procedural stand-in; `asset` (optional) replaces it with an
 * imported GLB node or file while keeping the same stable `id` (gameplay references ids only).
 */
export const zoneObjectSchema = z.object({
  id,
  type: z.enum([
    "tree",
    "pine",
    "bench",
    "flowerbed",
    "street_lamp",
    "fountain",
    "signpost",
    "birthday_house",
    "hedge",
    "planter",
    "gazebo",
    "arch",
    "rock",
    "expansion_marker",
  ]),
  position: vec3,
  /** Rotation around Y in degrees (multiples of 90 keep box colliders exact). */
  rotationY: z.number().default(0),
  scale: z.number().positive().default(1),
  collider: colliderSchema.optional(),
  /** Blocks camera line-of-sight (camera pulls in front of it). */
  occludesCamera: z.boolean().default(false),
  interaction: interactionSchema.optional(),
  asset: z.object({ url: z.string().min(1), node: z.string().optional() }).optional(),
  /** Free-form per-type parameters (colours, text keys…). */
  props: z.record(z.string(), z.unknown()).default({}),
});
export type ZoneObject = z.infer<typeof zoneObjectSchema>;

export const terrainSchema = z.object({
  id,
  material: z.enum(["grass", "path", "plaza_stone", "water", "sand", "wood_deck", "flower_soil"]),
  shape: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("rect"), rect: rectSchema }),
    z.object({
      kind: z.literal("circle"),
      center: z.tuple([z.number(), z.number()]),
      radius: z.number().positive(),
    }),
  ]),
  /** Non-walkable terrain (e.g. water) is added to the collision set. */
  walkable: z.boolean().default(true),
});
export type Terrain = z.infer<typeof terrainSchema>;

export const spawnPointSchema = z.object({
  id,
  x: z.number(),
  z: z.number(),
  rotY: z.number().default(0),
  default: z.boolean().default(false),
});
export type SpawnPoint = z.infer<typeof spawnPointSchema>;

export const portalSchema = z.object({
  id,
  position: z.tuple([z.number(), z.number()]),
  radius: z.number().positive().max(6),
  promptKey: z.string().min(1),
  target: z.discriminatedUnion("kind", [
    /** Another public zone of this world. */
    z.object({ kind: z.literal("zone"), zoneId: id, spawnId: id }),
    /** The Birthday House: opens the private-party menu (parties are NOT public zones). */
    z.object({ kind: z.literal("birthday_house") }),
  ]),
  /** Where players re-appear in THIS zone when they come back through this portal. */
  returnSpawnId: id,
});
export type Portal = z.infer<typeof portalSchema>;

export const zoneDefinitionSchema = z
  .object({
    zoneId: id,
    worldId: id,
    displayName: localized,
    version: z.string().regex(/^\d+\.\d+\.\d+$/),
    bounds: rectSchema,
    environmentPreset: z.enum(["plaza_day", "garden_golden_hour", "night_festival"]),
    maxPlayers: z.number().int().min(2).max(100),
    publishedStatus: z.enum(["draft", "published", "archived"]),
    permissions: z.object({
      /** Anyone signed in may enter. Private content (e.g. birthday parties) never lives in a public zone. */
      public: z.boolean(),
      chat: z.enum(["everyone", "off"]).default("everyone"),
      minAgeBand: z.enum(["under13", "teen", "adult"]).default("under13"),
    }),
    assets: z
      .object({
        environment: z.string().optional(),
        collision: z.string().optional(),
        navmesh: z.string().optional(),
      })
      .default({}),
    spawnPoints: z.array(spawnPointSchema).min(1),
    portals: z.array(portalSchema).default([]),
    terrain: z.array(terrainSchema).default([]),
    objects: z.array(zoneObjectSchema).default([]),
    expansionAreas: z.array(z.object({ id, rect: rectSchema, labelKey: z.string() })).default([]),
  })
  .superRefine((zone, ctx) => {
    const ids = new Set<string>();
    for (const o of [...zone.objects, ...zone.terrain, ...zone.portals, ...zone.spawnPoints]) {
      if (ids.has(o.id)) ctx.addIssue({ code: "custom", message: `duplicate id "${o.id}"` });
      ids.add(o.id);
    }
    if (zone.spawnPoints.filter((s) => s.default).length !== 1) {
      ctx.addIssue({ code: "custom", message: "exactly one default spawn point is required" });
    }
    const spawnIds = new Set(zone.spawnPoints.map((s) => s.id));
    for (const p of zone.portals) {
      if (!spawnIds.has(p.returnSpawnId))
        ctx.addIssue({ code: "custom", message: `portal ${p.id}: unknown returnSpawnId` });
    }
    for (const o of zone.objects) {
      const a = o.interaction?.action;
      if (a?.type === "portal" && !zone.portals.some((p) => p.id === a.portalId)) {
        ctx.addIssue({ code: "custom", message: `object ${o.id}: unknown portal ${a.portalId}` });
      }
    }
  });
export type ZoneDefinition = z.output<typeof zoneDefinitionSchema>;
export type ZoneDefinitionInput = z.input<typeof zoneDefinitionSchema>;

export function parseZoneDefinition(input: unknown): ZoneDefinition {
  return zoneDefinitionSchema.parse(input);
}
