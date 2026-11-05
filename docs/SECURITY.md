# HAPPYROOM — Security, Privacy & Safety

Status legend: ✅ implemented & tested · ⏳ designed, milestone noted

## Threat model (summary)

| Threat                                                        | Mitigation                                                                                                                 |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Uninvited people entering a room by guessing/sharing the slug | Slug is display-only; entry requires an invitation grant and/or access code, then a signed join grant (⏳ M2/M4)           |
| Leaked Supabase anon key reads private data                   | RLS on all tables + revoked privileges; only catalogs and own rows readable (✅ tested)                                    |
| Forged client actions (start ceremony, kick, open gifts)      | Server-side `can()` policy for every action; host-only ceremony control (✅ unit-tested logic, ⏳ wired in M4)             |
| Speed hacks / teleporting / walking through walls             | `validateMove` speed cap with tolerance, bounds, obstacle push-out (✅ unit-tested)                                        |
| Spam (chat, wishes, gifts, invites, room creation)            | Token-bucket limits per participant/IP (✅ logic, ✅ applied to analytics ingestion; ⏳ Redis-backed shared limiter M2-05) |
| Duplicate gift submissions                                    | Idempotency key + unique constraint (✅ tested)                                                                            |
| Spoofed names (bidi overrides, invisible chars)               | Unicode NFC normalisation, control/bidi/zero-width stripping, grapheme limits (✅ tested)                                  |
| XSS via UGC                                                   | UGC stored as plain text, rendered by React/DOM text only; never `dangerouslySetInnerHTML`                                 |
| Clickjacking                                                  | `X-Frame-Options: DENY` (✅ E2E-tested)                                                                                    |
| Personal media leaking publicly                               | Private bucket, signed short-lived URLs, host approval, `noindex` on rooms, robots disallow (⏳ M5; headers ✅)            |
| Secrets in logs                                               | Logger redacts token/secret/code/grant/cookie keys (✅ tested); never log request bodies                                   |
| Stale or tampered clients                                     | Versioned protocol; out-of-range versions rejected with `client_outdated` (⏳ M4)                                          |

## Implemented controls (M2–M6)

- Join API (`POST /api/rooms/:slug/join`): membership, invitation-token (hashed), access-code (scrypt, constant-time) checks; bans; room lock; per-client+room rate limit; returns a 15-minute HMAC grant.
- Game server `onAuth`: grant signature/expiry/audience, party id match, protocol version, DB ban/removal check, lock and capacity.
- Every client message is Zod-validated; privileged actions go through `can()`; the host can never be kicked; co-hosts cannot act on each other.
- Unapproved wishes are never placed in the shared state; they are sent only to moderators.
- Room pages: `noindex`, `no-referrer`, invite token removed from the address bar after use; honoree name hidden from visitors without access.
- Party photos contain only the 3D render, party title and the public site URL — never invite links.

Known gaps: matchmaking will instantiate (but not admit anyone to) a room for any existing party UUID without a grant — party UUIDs are not public, but a per-IP limit on the matchmaking route is still TODO. `GAME_ALLOWED_ORIGINS` must be set in production.

## HAPPYROOM World safety (implemented)

- **Identity**: guest profiles, username/password (scrypt, timing-equalised, rate-limited per username), optional Google via Supabase (server verifies the token with Supabase; token never stored). Sessions: httpOnly `hr_player` cookie, SHA-256 stored.
- **Zone access**: `/api/world/enter` checks the profile, zone published status and `minAgeBand`; issues a 10-minute world grant (distinct audience from party grants). The game server re-verifies it and rejects banned profiles.
- **Chat**: sanitised, ≤ 200 graphemes, 5 per 10 s, profanity screen; delivered per recipient — never between blocked pairs, never to/from players with chat off; **under-13 accounts have no public chat** (enforced on the server, the API and the UI). Not persisted.
- **Block / report**: `/api/world/block`, `/api/world/report` (evidence = the reported line) → `player_blocks`, `player_reports`, `world_events`.
- **No unsolicited DMs**, no public discovery of private birthday parties (they are never world zones), presence only for players in the same zone instance.
- **Movement / portals** validated server-side (speed cap, colliders, portal proximity on authoritative positions).
- Gaps: self-declared age band (no age assurance), no moderator console yet (W-08), per-process rate limits.

## Credentials

| Credential           | Lifetime                               | Storage                                                                 |
| -------------------- | -------------------------------------- | ----------------------------------------------------------------------- |
| Guest session secret | 30 days sliding                        | `httpOnly; Secure; SameSite=Lax` cookie; `sha256` in DB                 |
| Host recovery code   | until used/rotated                     | shown once; `sha256` in DB                                              |
| Invitation token     | optional expiry / max uses / revocable | URL query; `sha256` in DB                                               |
| Access code          | room lifetime                          | scrypt hash; compared in constant time; rate-limited                    |
| Join grant           | 15 minutes                             | signed (HMAC-SHA256, `JOIN_GRANT_SIGNING_KEY`), verified by game server |

All secrets come from environment variables (`.env.example` lists them; none are committed). `.env*` files are git-ignored.

## Authorisation layers

1. **Web API**: Zod validation → session lookup → room membership/role → policy (`can`) → rate limit → write.
2. **Game server**: join-grant verification → ban/lock/capacity (`canJoin`) → per-message schema validation → `can()` → rate limit.
3. **Database**: RLS + revoked grants as the backstop for browser keys; constraints for integrity.

## Privacy

- Rooms are unlisted; no discovery, no public directory, no DMs.
- Analytics: no names, messages, IPs, tokens or free text; strict schemas reject unknown keys; no identifier without consent; GPC/DNT honoured (✅ tested).
- Rate-limit keys are SHA-256 hashes of the client IP, held in memory only.
- Share previews never include guest information; the honoree name only with host opt-in (✅ tested).
- Media: explicit upload consent, deletion support, purge queue so bytes are removed with rows.
- Data retention: see [DATABASE.md](DATABASE.md#retention-happyroom_run_retentionnow).
- Optional birthday reminders require explicit consent (`reminders_consented_at`) and one-click opt-out; month/day only, never the birth year.

## Child safety & legal review (must happen before a public launch that permits minors)

HAPPYROOM does not collect age. Before public launch:

- Evaluate COPPA (US), GDPR-K / Art. 8 age of digital consent (EU, 13–16), UK Age Appropriate Design Code, Vietnam Decree 13/2023 on personal data, Japan APPI.
- Decide on an age gate or "13+ / with parental supervision" terms; keep high-privacy defaults regardless.
- Keep: no public discovery, no DMs, host approval for media and wishes, report/block on every participant.

## Moderation & abuse operations

**In-room (host/co-host)**: mute, remove, ban (by guest session/user), lock room, disable gifts/chat, remove messages, approve/reject wishes and photos.

**Reports**: every participant can report a participant, chat message, wish, gift or media item. Reports store an evidence snapshot (chat is otherwise not persisted) and are de-duplicated per reporter/target.

**Operator runbook (M5/M8)**:

1. Triage `moderation_reports where status = 'open'` daily; severity order: self_harm, sexual (esp. involving minors), violence, hate, harassment, spam.
2. Content involving child sexual abuse: preserve evidence, do **not** redistribute, report to the relevant authority (e.g. NCMEC in the US) per legal counsel's procedure, delete media.
3. Actions: remove content (`status = 'removed'`), ban participant, archive room, enqueue media purge; record `resolved_by`, `resolution_note`.
4. Self-harm reports: show localised help resources to the reporter; escalate per policy.
5. Repeat abuse across rooms: block the guest session and, where available, the user account.

**Known limitations**: guest bans can be evaded by a new browser profile. Mitigations: access codes, room lock, invite revocation, rate limits.

## Account & media deletion requests

- Registered users: delete account from settings (⏳ M8-08) → `auth.users` deletion cascades; orders anonymised.
- Guests: delete own wishes/photos in-room (⏳ M5-07); hosts can delete the whole room (cascade + media purge).
- Email-based requests are handled by operators using the same SQL paths.
