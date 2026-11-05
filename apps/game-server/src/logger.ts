/** Structured JSON logs with defensive redaction (never log grants, tokens or UGC bodies). */
type Level = "debug" | "info" | "warn" | "error";
const SENSITIVE = /token|secret|password|grant|code|authorization|cookie|body|message|text/i;

function redact(v: unknown, depth = 0): unknown {
  if (depth > 4) return "[depth]";
  if (v instanceof Error) return { name: v.name, message: v.message };
  if (Array.isArray(v)) return v.map((x) => redact(x, depth + 1));
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v))
      out[k] = SENSITIVE.test(k) ? "[redacted]" : redact(val, depth + 1);
    return out;
  }
  return v;
}

function write(level: Level, msg: string, fields?: Record<string, unknown>) {
  if (level === "debug" && process.env.NODE_ENV === "production") return;
  if (process.env.NODE_ENV === "test" && level !== "error") return;
  const line = JSON.stringify({
    level,
    time: new Date().toISOString(),
    service: "game-server",
    msg,
    ...(fields ? (redact(fields) as object) : {}),
  });
  if (level === "error" || level === "warn") console.error(line);
  // eslint-disable-next-line no-console -- structured logs go to stdout
  else console.log(line);
}

export const log = {
  debug: (m: string, f?: Record<string, unknown>) => write("debug", m, f),
  info: (m: string, f?: Record<string, unknown>) => write("info", m, f),
  warn: (m: string, f?: Record<string, unknown>) => write("warn", m, f),
  error: (m: string, f?: Record<string, unknown>) => write("error", m, f),
};
