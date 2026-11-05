# ADR 0005: Procedural Three.js assets for the MVP

- Status: Accepted
- Date: 2026-11-04

## Context

No licensed professional models are available. Bundling third-party assets without clear licences is not acceptable.

## Decision

The room, cake, furniture, balloons, confetti and avatars are built from Three.js primitives in code (no textures, no GLB). Instancing keeps draw calls low. Assets that should eventually be replaced by authored GLB/glTF (with KTX2/meshopt compression) are listed in `assets/README.md`.

## Consequences

- zero licence risk, tiny download, themeable via palettes. − stylised, simpler look than authored art; avatar animation is procedural, not skeletal.
