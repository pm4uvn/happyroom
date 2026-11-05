# ADR 0006: Internationalisation without locale-prefixed URLs

- Status: Accepted
- Date: 2026-11-04

## Context

Invite links are shared across languages; `/vi/r/abc` vs `/r/abc` would fragment them.

## Decision

next-intl in "without i18n routing" mode. Locale = preference cookie → `Accept-Language` → English. All strings are translation keys; catalogs are checked for key and placeholder parity in CI. Timestamps are stored in UTC and formatted with the event's or viewer's time zone.

## Consequences

- one canonical link per room. − the marketing page is not indexed per language (acceptable: rooms are never indexed).
