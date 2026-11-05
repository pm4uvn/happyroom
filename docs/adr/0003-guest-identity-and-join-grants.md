# ADR 0003: Guest identity, invitation tokens and signed join grants

- Status: Accepted
- Date: 2026-11-04

## Context

Guests must join without accounts, yet rooms must be private and the slug must never be an authorisation secret.

## Decision

Opaque random secrets (guest session, invitation token, recovery code) are stored only as SHA-256 hashes. Access codes use scrypt. After the web API authorises a join it issues a 15-minute signed join grant that the game server verifies and re-checks (ban/lock/capacity).

## Consequences

- no account friction, revocable invites, attribution per inviter. − ban evasion via a new browser is possible; mitigated by host lock, access codes and rate limits (documented in SECURITY.md).
