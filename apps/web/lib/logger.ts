/**
 * Structured JSON logger (one line per event, stdout/stderr) with defensive redaction.
 * Never pass access tokens, invite tokens, access codes, cookies or raw UGC as fields;
 * the redaction below is a safety net, not a licence to log secrets.
 */
type Level = "debug" | "info" | "warn" | "error";

const SENSITIVE_KEY =
  /token|secret|password|passcode|access_?code|authorization|cookie|grant|recovery|api_?key/i;

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 5) return "[depth]";
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (value instanceof Error) return { name: value.name, message: value.message };
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value))
      out[k] = SENSITIVE_KEY.test(k) ? "[redacted]" : redact(v, depth + 1);
    return out;
  }
  return value;
}

function write(level: Level, msg: string, fields?: Record<string, unknown>) {
  const line = JSON.stringify({
    level,
    time: new Date().toISOString(),
    service: "web",
    msg,
    ...(fields ? (redact(fields) as Record<string, unknown>) : {}),
  });
  if (level === "error" || level === "warn") console.error(line);
  else console.log(line);
}

export const logger = {
  debug: (msg: string, fields?: Record<string, unknown>) => {
    if (process.env.NODE_ENV !== "production") write("debug", msg, fields);
  },
  info: (msg: string, fields?: Record<string, unknown>) => write("info", msg, fields),
  warn: (msg: string, fields?: Record<string, unknown>) => write("warn", msg, fields),
  error: (msg: string, fields?: Record<string, unknown>) => write("error", msg, fields),
};
