# ADR 0001: Monorepo with pnpm workspaces and Turborepo

- Status: Accepted
- Date: 2026-11-04

## Context

Web app, game server and shared logic must agree on schemas, enums, the realtime protocol and the room layout.

## Decision

One repository with `apps/*`, `packages/*` and `tests/`. `packages/shared` and `packages/game-core` compile to ESM (`NodeNext`) so the Node game server can import them; `packages/ui` ships TSX source consumed via `transpilePackages`. Turborepo orders `build → lint/typecheck/test`.

## Consequences

- single source of truth (enum parity is tested against SQL). − shared packages must be built before dependants typecheck (handled by turbo `dependsOn: ["^build"]`).
