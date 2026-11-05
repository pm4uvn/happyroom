# HAPPYROOM — Product Requirements

> **Celebrate Together. Anywhere.**
> A host creates a beautiful virtual birthday room in under 30 seconds, shares a URL, and friends anywhere join as 3D avatars in a live, synchronised party — no app install and no mandatory account.

## 1. Problem & audience

Friends and families are spread across cities and time zones. Video calls feel like meetings; group chats feel flat. HAPPYROOM gives a _place_ to gather: a cozy room, a cake, a shared moment when the candles go out.

| Persona                       | Need                                             | Success looks like                                    |
| ----------------------------- | ------------------------------------------------ | ----------------------------------------------------- |
| **Host** (organiser)          | Make someone feel celebrated with minimal effort | Room created in < 60 s, invite shared in any chat app |
| **Honoree** (birthday person) | Feel surrounded by people who care               | Sees wishes, gifts, everyone at the ceremony          |
| **Guest**                     | Join instantly from a phone                      | Tap link → name + avatar → in the room in < 20 s      |

## 2. Core loop

Create Room → Customise → Share Invite → Join as Avatar → Move & Interact → Wishes & Gifts → Ceremony → Capture Memory → Share → Create Another Room.

## 3. Principles (non-negotiable)

1. Real, functional features only. No fake multiplayer, counters, social proof or mock APIs presented as real.
2. Emotional polish over feature quantity.
3. Mobile-first, browser-first. No install, no headset.
4. Guest-first: accounts are optional.
5. Private by default: rooms are unlisted and invitation-protected; slugs are never authorisation.
6. Authoritative server validates movement, roles, gifts and ceremony.
7. Responsive, accessible (WCAG 2.2 AA target), internationalised (en default, vi, ja).
8. Modular for Birthday → Wedding, Graduation, Anniversary, Corporate.
9. End-to-end MVP before advanced features.
10. Report honestly what works, what does not, and how it was verified.

## 4. MVP scope

| Area        | In MVP                                                     | Later                                                   |
| ----------- | ---------------------------------------------------------- | ------------------------------------------------------- |
| Events      | Birthday                                                   | Wedding, Graduation, Anniversary, Corporate             |
| Room        | 1 room layout, 2 theme presets, 3 cakes, 3 decorations     | More layouts, premium themes                            |
| Avatars     | 6 presets, idle/walk/wave/clap/dance/celebrate             | Customisation, GLB rigs                                 |
| Multiplayer | 10–20 concurrent per room (target, must be load-tested)    | Larger rooms, spectators                                |
| Interaction | Chat, 6 emotes, reactions, wishes, 6 free gifts            | Voice, mini-games                                       |
| Ceremony    | Synchronised candle ceremony, tap to blow                  | Microphone blow (opt-in)                                |
| Memories    | Memory wall (text + approved photos), snapshot, share card | Album export, video                                     |
| Growth      | Invites, attribution, post-party CTA, share card           | Opt-in birthday reminders                               |
| Commerce    | Data model only                                            | Premium gifts/themes after the free gift flow is proven |
| AI          | —                                                          | Optional Gemini wish suggestions                        |

## 5. Functional requirements (summary)

Detailed, testable acceptance criteria live in [ROADMAP.md](ROADMAP.md).

- **Landing**: hero with live 3D preview + 2D fallback, CTAs, 3-step explainer, theme preview, interactive demo, shareable link + QR, privacy messaging. No fake testimonials or counts.
- **Create flow**: event type → honoree name → theme → cake & decoration → time (now / scheduled + timezone) → privacy (+ optional access code) → create → share (copy, native share, QR). Guest hosts receive a recovery code; lost-session behaviour is explained.
- **Room URL**: `/r/[slug]` for display; entry requires a signed invitation grant and/or access code.
- **3D room**: cake, door/spawn, gift table, memory wall, photo booth, balloons; isometric camera with bounded orbit; collisions; joystick on mobile; WASD/arrows on desktop; adaptive quality; reduced motion; 2D fallback.
- **Realtime**: Colyseus authoritative rooms; signed join; presence; interpolation; validation; reconnect; host privileges; capacity; idle timeout; versioned protocol; heartbeat; structured logs.
- **Party UI**: desktop top bar / bottom actions / side panel; mobile full-screen with joystick, context button, bottom sheets.
- **Safety**: sanitised chat with rate limits, report/block, host kick/ban/mute/lock/remove message, wish & photo approval.
- **Ceremony**: IDLE → PREPARING → COUNTDOWN → CANDLES_OUT → CELEBRATION → COMPLETE, server timestamps, late join & reconnect safe.
- **Gifts**: free catalog (cake topper, flower bouquet, teddy bear, balloon bouquet, star, confetti box); optional message; host opens; spam/duplicate protection; catalog modelled separately from instances.
- **Snapshot & sharing**: consented canvas capture, branded share card, download/native share, no guest data in public previews.
- **Analytics**: privacy-conscious first-party events (see [ARCHITECTURE.md §7](ARCHITECTURE.md#7-analytics)).

## 6. Non-functional requirements

| Category            | Target                                                                         |
| ------------------- | ------------------------------------------------------------------------------ |
| Landing performance | LCP < 2.5 s on mid-range mobile (4G); 3D code loaded after first paint         |
| Room performance    | ≥ 30 fps on mid-range phones at low tier; ≤ 60 draw calls                      |
| Join latency        | Link tap → in room < 20 s on 4G (to be measured in M8)                         |
| Realtime            | 20 Hz server patch rate; movement validated server-side                        |
| Availability        | Health/readiness endpoints for web and game server                             |
| Privacy             | No PII in analytics; UGC never indexed; signed media URLs                      |
| Accessibility       | Keyboard operable; all scene actions also available as buttons; reduced motion |
| i18n                | All UI strings via translation keys; UTC storage; Unicode names                |

## 7. Out of scope for MVP

Public room discovery, direct messages, voice/video, payments, user-generated 3D assets, VR.
