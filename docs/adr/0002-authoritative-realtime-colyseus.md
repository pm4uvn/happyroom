# ADR 0002: Authoritative realtime with Colyseus

- Status: Accepted
- Date: 2026-11-04

## Context

Parties need synchronised movement, ceremony timing and anti-abuse. Peer-to-peer or client-authoritative sync cannot enforce roles, rate limits or movement rules.

## Decision

Colyseus 0.18 rooms are authoritative. All game rules live in `packages/game-core` as pure, clock-injected functions (ceremony state machine, permissions, movement validation, token buckets) so they are unit-tested independently of networking. Clients send intents; the server validates and broadcasts state with server timestamps.

## Consequences

- testable rules, cheap to reason about. − one more deployable service; horizontal scaling needs Redis presence and must be load-tested before claiming 20-user capacity.
