import type { CeremonyPhase, ParticipantRole } from "@happyroom/shared";

/**
 * Authoritative birthday ceremony state machine.
 *
 *   IDLE ──start(host)──▶ PREPARING ──(timer)──▶ COUNTDOWN ──blow / deadline──▶ CANDLES_OUT
 *        ──(timer)──▶ CELEBRATION ──(timer)──▶ COMPLETE ──restart(host)──▶ PREPARING …
 *
 * - Pure and deterministic: every function takes `now` (server epoch ms) and returns a new state.
 * - All timestamps are server time; clients render countdowns from `phaseStartedAt` /
 *   `countdownEndsAt` corrected by their measured clock offset, so they stay coherent.
 * - Late joiners and reconnecting clients just receive the current state.
 * - `tick` may advance several phases at once if the server was paused (e.g. event-loop stall).
 */

export interface CeremonyTimings {
  preparingMs: number;
  countdownMs: number;
  /** After the countdown, how long guests have to blow before the server does it automatically. */
  blowWindowMs: number;
  candlesOutMs: number;
  celebrationMs: number;
}

export const DEFAULT_CEREMONY_TIMINGS: CeremonyTimings = {
  preparingMs: 4_000,
  countdownMs: 3_000,
  blowWindowMs: 20_000,
  candlesOutMs: 1_500,
  celebrationMs: 10_000,
};

export type BlowPolicy = "anyone" | "host";

export interface CeremonyState {
  phase: CeremonyPhase;
  /** Increments on every start/restart; lets clients ignore stale events. */
  run: number;
  phaseStartedAt: number;
  /** When the phase ends automatically, or null if it waits indefinitely. */
  phaseEndsAt: number | null;
  /** Only during COUNTDOWN: the instant blowing becomes possible. */
  countdownEndsAt: number | null;
  startedBy: string | null;
  blownBy: string | null;
  /** True if the server blew the candles because nobody did within the window. */
  autoBlown: boolean;
}

export interface CeremonyActor {
  participantId: string;
  role: ParticipantRole;
}

export type CeremonyErrorCode = "forbidden" | "invalid_transition" | "too_early";

export type CeremonyResult =
  | { ok: true; state: CeremonyState; changed: boolean }
  | { ok: false; code: CeremonyErrorCode; state: CeremonyState };

export function createCeremonyState(now: number): CeremonyState {
  return {
    phase: "IDLE",
    run: 0,
    phaseStartedAt: now,
    phaseEndsAt: null,
    countdownEndsAt: null,
    startedBy: null,
    blownBy: null,
    autoBlown: false,
  };
}

function enter(
  state: CeremonyState,
  phase: CeremonyPhase,
  at: number,
  timings: CeremonyTimings,
  patch: Partial<CeremonyState> = {},
): CeremonyState {
  let phaseEndsAt: number | null = null;
  let countdownEndsAt: number | null = null;
  switch (phase) {
    case "PREPARING":
      phaseEndsAt = at + timings.preparingMs;
      break;
    case "COUNTDOWN":
      countdownEndsAt = at + timings.countdownMs;
      phaseEndsAt = countdownEndsAt + timings.blowWindowMs;
      break;
    case "CANDLES_OUT":
      phaseEndsAt = at + timings.candlesOutMs;
      break;
    case "CELEBRATION":
      phaseEndsAt = at + timings.celebrationMs;
      break;
    case "IDLE":
    case "COMPLETE":
      phaseEndsAt = null;
      break;
  }
  return { ...state, ...patch, phase, phaseStartedAt: at, phaseEndsAt, countdownEndsAt };
}

const canControl = (actor: CeremonyActor) => actor.role === "host";

/** Host starts the ceremony from IDLE. */
export function startCeremony(
  state: CeremonyState,
  actor: CeremonyActor,
  now: number,
  timings: CeremonyTimings = DEFAULT_CEREMONY_TIMINGS,
): CeremonyResult {
  if (!canControl(actor)) return { ok: false, code: "forbidden", state };
  if (state.phase !== "IDLE") return { ok: false, code: "invalid_transition", state };
  const next = enter(state, "PREPARING", now, timings, {
    run: state.run + 1,
    startedBy: actor.participantId,
    blownBy: null,
    autoBlown: false,
  });
  return { ok: true, state: next, changed: true };
}

/** Host restarts after the celebration (or once it is complete). */
export function restartCeremony(
  state: CeremonyState,
  actor: CeremonyActor,
  now: number,
  timings: CeremonyTimings = DEFAULT_CEREMONY_TIMINGS,
): CeremonyResult {
  if (!canControl(actor)) return { ok: false, code: "forbidden", state };
  if (state.phase !== "COMPLETE" && state.phase !== "CELEBRATION") {
    return { ok: false, code: "invalid_transition", state };
  }
  const next = enter(state, "PREPARING", now, timings, {
    run: state.run + 1,
    startedBy: actor.participantId,
    blownBy: null,
    autoBlown: false,
  });
  return { ok: true, state: next, changed: true };
}

/** A participant taps "blow the candles". Accepted only after the countdown reaches zero. */
export function blowCandles(
  state: CeremonyState,
  actor: CeremonyActor,
  now: number,
  timings: CeremonyTimings = DEFAULT_CEREMONY_TIMINGS,
  policy: BlowPolicy = "anyone",
): CeremonyResult {
  const advanced = tickCeremony(state, now, timings);
  const current = advanced.state;
  if (policy === "host" && !canControl(actor)) return { ok: false, code: "forbidden", state: current };
  if (current.phase !== "COUNTDOWN") return { ok: false, code: "invalid_transition", state: current };
  if (current.countdownEndsAt !== null && now < current.countdownEndsAt) {
    return { ok: false, code: "too_early", state: current };
  }
  const next = enter(current, "CANDLES_OUT", now, timings, {
    blownBy: actor.participantId,
    autoBlown: false,
  });
  return { ok: true, state: next, changed: true };
}

/** Advance timed phases. Idempotent for a given `now`. */
export function tickCeremony(
  state: CeremonyState,
  now: number,
  timings: CeremonyTimings = DEFAULT_CEREMONY_TIMINGS,
): { state: CeremonyState; changed: boolean; transitions: CeremonyPhase[] } {
  let current = state;
  const transitions: CeremonyPhase[] = [];
  // Bounded loop: at most one pass through the timed phases.
  for (let i = 0; i < 5; i++) {
    if (current.phaseEndsAt === null || now < current.phaseEndsAt) break;
    const at = current.phaseEndsAt;
    switch (current.phase) {
      case "PREPARING":
        current = enter(current, "COUNTDOWN", at, timings);
        break;
      case "COUNTDOWN":
        current = enter(current, "CANDLES_OUT", at, timings, { blownBy: null, autoBlown: true });
        break;
      case "CANDLES_OUT":
        current = enter(current, "CELEBRATION", at, timings);
        break;
      case "CELEBRATION":
        current = enter(current, "COMPLETE", at, timings);
        break;
      default:
        return { state: current, changed: transitions.length > 0, transitions };
    }
    transitions.push(current.phase);
  }
  return { state: current, changed: transitions.length > 0, transitions };
}

/** Candles are lit in every phase before CANDLES_OUT of the current run. */
export function candlesLit(state: CeremonyState): boolean {
  return state.phase === "IDLE" || state.phase === "PREPARING" || state.phase === "COUNTDOWN";
}
