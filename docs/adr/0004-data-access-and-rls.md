# ADR 0004: Server-mediated data access with RLS as a backstop

- Status: Accepted
- Date: 2026-11-04

## Context

Supabase exposes tables to browser keys by default. Most HAPPYROOM data (rooms, participants, wishes, media) has authorisation rules that depend on guest sessions, invitations and roles that RLS cannot express cleanly.

## Decision

RLS is enabled on every public table and all privileges are revoked from `anon`/`authenticated`, except public catalogs and a user's own account/commerce rows. All room data is read and written by trusted server code with a privileged connection after explicit authorisation. RLS is ENABLED, not FORCED, so seeds and the SECURITY DEFINER retention job keep working.

## Consequences

- a leaked anon key exposes nothing private; tested in `tests/integration`. − every server route must do its own checks (shared helpers + tests in M2).
