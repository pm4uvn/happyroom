import { describe, expect, it } from "vitest";
import {
  blowCandles,
  candlesLit,
  createCeremonyState,
  DEFAULT_CEREMONY_TIMINGS as T,
  restartCeremony,
  startCeremony,
  tickCeremony,
  type CeremonyActor,
} from "./ceremony.js";

const host: CeremonyActor = { participantId: "h1", role: "host" };
const cohost: CeremonyActor = { participantId: "c1", role: "cohost" };
const guest: CeremonyActor = { participantId: "g1", role: "guest" };
const t0 = 1_700_000_000_000;

function startedAt(now = t0) {
  const r = startCeremony(createCeremonyState(now), host, now);
  if (!r.ok) throw new Error("start failed");
  return r.state;
}

describe("ceremony state machine", () => {
  it("starts in IDLE with candles lit", () => {
    const s = createCeremonyState(t0);
    expect(s.phase).toBe("IDLE");
    expect(candlesLit(s)).toBe(true);
  });

  it("only the host can start", () => {
    expect(startCeremony(createCeremonyState(t0), guest, t0)).toMatchObject({ ok: false, code: "forbidden" });
    expect(startCeremony(createCeremonyState(t0), cohost, t0)).toMatchObject({
      ok: false,
      code: "forbidden",
    });
    const r = startCeremony(createCeremonyState(t0), host, t0);
    expect(r.ok && r.state.phase).toBe("PREPARING");
    expect(r.ok && r.state.run).toBe(1);
  });

  it("cannot start twice", () => {
    expect(startCeremony(startedAt(), host, t0 + 10)).toMatchObject({
      ok: false,
      code: "invalid_transition",
    });
  });

  it("advances PREPARING → COUNTDOWN on the server timer with exact timestamps", () => {
    const { state } = tickCeremony(startedAt(), t0 + T.preparingMs);
    expect(state.phase).toBe("COUNTDOWN");
    expect(state.phaseStartedAt).toBe(t0 + T.preparingMs);
    expect(state.countdownEndsAt).toBe(t0 + T.preparingMs + T.countdownMs);
  });

  it("rejects blowing before the countdown reaches zero", () => {
    const s = tickCeremony(startedAt(), t0 + T.preparingMs).state;
    expect(blowCandles(s, guest, t0 + T.preparingMs + 1000)).toMatchObject({ ok: false, code: "too_early" });
  });

  it("any participant can blow once the countdown ends; candles go out", () => {
    const s = tickCeremony(startedAt(), t0 + T.preparingMs).state;
    const r = blowCandles(s, guest, t0 + T.preparingMs + T.countdownMs + 50);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.phase).toBe("CANDLES_OUT");
    expect(r.state.blownBy).toBe("g1");
    expect(candlesLit(r.state)).toBe(false);
  });

  it("a blow request arriving late still applies the timers first", () => {
    // Client sends blow after the server should already have moved to COUNTDOWN.
    const r = blowCandles(startedAt(), guest, t0 + T.preparingMs + T.countdownMs + 10);
    expect(r.ok && r.state.phase).toBe("CANDLES_OUT");
  });

  it("host-only blow policy rejects guests", () => {
    const s = tickCeremony(startedAt(), t0 + T.preparingMs).state;
    expect(blowCandles(s, guest, t0 + T.preparingMs + T.countdownMs, T, "host")).toMatchObject({
      ok: false,
      code: "forbidden",
    });
  });

  it("the server blows automatically when nobody does within the window", () => {
    const deadline = t0 + T.preparingMs + T.countdownMs + T.blowWindowMs;
    const { state } = tickCeremony(startedAt(), deadline);
    expect(state.phase).toBe("CANDLES_OUT");
    expect(state.autoBlown).toBe(true);
  });

  it("a late tick catches up through every phase to COMPLETE", () => {
    const { state, transitions } = tickCeremony(startedAt(), t0 + 10 * 60_000);
    expect(state.phase).toBe("COMPLETE");
    expect(transitions).toEqual(["COUNTDOWN", "CANDLES_OUT", "CELEBRATION", "COMPLETE"]);
    expect(state.phaseEndsAt).toBeNull();
  });

  it("only the first blow wins (duplicate blows are invalid)", () => {
    const s = tickCeremony(startedAt(), t0 + T.preparingMs).state;
    const at = t0 + T.preparingMs + T.countdownMs;
    const first = blowCandles(s, guest, at);
    if (!first.ok) throw new Error("first blow failed");
    expect(blowCandles(first.state, host, at + 10)).toMatchObject({ ok: false, code: "invalid_transition" });
  });

  it("tick is idempotent for the same time", () => {
    const s = startedAt();
    const a = tickCeremony(s, t0 + 100);
    expect(a.changed).toBe(false);
    expect(a.state).toBe(s);
  });

  it("host can restart from COMPLETE and the run counter increments", () => {
    const done = tickCeremony(startedAt(), t0 + 10 * 60_000).state;
    expect(restartCeremony(done, guest, t0 + 10 * 60_000)).toMatchObject({ ok: false, code: "forbidden" });
    const r = restartCeremony(done, host, t0 + 10 * 60_000);
    expect(r.ok && r.state.phase).toBe("PREPARING");
    expect(r.ok && r.state.run).toBe(2);
    expect(r.ok && r.state.autoBlown).toBe(false);
  });

  it("restart is not allowed mid-countdown", () => {
    const s = tickCeremony(startedAt(), t0 + T.preparingMs).state;
    expect(restartCeremony(s, host, t0 + T.preparingMs)).toMatchObject({
      ok: false,
      code: "invalid_transition",
    });
  });
});
