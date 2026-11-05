# ADR 0007: First-party, privacy-conscious analytics

- Status: Accepted
- Date: 2026-11-04

## Context

Growth metrics are needed, but the product handles personal celebrations and possibly minors.

## Decision

A strict event schema (no free text, unknown keys rejected) and a first-party ingestion endpoint writing to PostgreSQL. No identifier is attached without consent; GPC/DNT are honoured. Dashboards read SQL views over real events only. PostHog may be added as an optional, consent-gated forwarder.

## Consequences

- data minimisation, no third-party dependency for core metrics. − retention cohorts only cover consenting visitors and must be labelled as such.
