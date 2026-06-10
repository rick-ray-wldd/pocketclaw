/**
 * Minimal leveled logger plus small text helpers shared across the host.
 * Logs go to stderr so CLI commands can print machine-readable JSON to stdout.
 */

type Level = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<Level, number> = { debug: 0, info: 1, warn: 2, error: 3 };

function threshold(): number {
  const env = (process.env.POCKETCLAW_LOG ?? "info").toLowerCase();
  return LEVEL_ORDER[(env as Level) in LEVEL_ORDER ? (env as Level) : "info"];
}

function emit(level: Level, args: unknown[]): void {
  if (LEVEL_ORDER[level] < threshold()) return;
  const ts = new Date().toISOString();
  // eslint-disable-next-line no-console
  console.error(`[${ts}] ${level.toUpperCase().padEnd(5)}`, ...args);
}

export const log = {
  debug: (...args: unknown[]) => emit("debug", args),
  info: (...args: unknown[]) => emit("info", args),
  warn: (...args: unknown[]) => emit("warn", args),
  error: (...args: unknown[]) => emit("error", args),
};

/** Truncate a string to `max` characters, appending an ellipsis when cut. */
export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1))}…`;
}

/**
 * Render an arbitrary value as a single-line preview string.
 * Used for tool inputs/results shown on the phone and in audit trails.
 */
export function preview(value: unknown, max: number): string {
  let text: string;
  if (typeof value === "string") {
    text = value;
  } else {
    try {
      text = JSON.stringify(value) ?? String(value);
    } catch {
      text = String(value);
    }
  }
  return truncate(text.replace(/\s+/g, " ").trim(), max);
}

/** Extract a readable message from an unknown thrown value. */
export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
