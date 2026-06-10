/**
 * Host configuration: ~/.pocketclaw/config.json and well-known data paths.
 */
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export const VERSION = "0.1.0";
export const DEFAULT_PORT = 8787;

export interface HostConfig {
  /** Bearer token shared with paired clients. 32 random bytes, hex-encoded. */
  token: string;
  /** TCP port for the HTTP + WebSocket server. */
  port: number;
  /** Absolute path to the Obsidian vault root. Optional: logging is skipped when unset. */
  vaultPath?: string;
}

export function pocketclawDir(): string {
  return path.join(os.homedir(), ".pocketclaw");
}

export function configPath(): string {
  return path.join(pocketclawDir(), "config.json");
}

export function auditPath(): string {
  return path.join(pocketclawDir(), "audit.jsonl");
}

export function sessionsDir(): string {
  return path.join(pocketclawDir(), "sessions");
}

export function workspacesPath(): string {
  return path.join(pocketclawDir(), "workspaces.json");
}

/** Create ~/.pocketclaw and ~/.pocketclaw/sessions if missing. */
export function ensureDirs(): void {
  mkdirSync(sessionsDir(), { recursive: true });
}

export function configExists(): boolean {
  return existsSync(configPath());
}

/** Load and validate config.json. Throws with a helpful message when missing/invalid. */
export function loadConfig(): HostConfig {
  if (!configExists()) {
    throw new Error(`No config at ${configPath()} — run "pocketclaw init" first.`);
  }
  const raw = JSON.parse(readFileSync(configPath(), "utf8")) as Partial<HostConfig>;
  if (typeof raw.token !== "string" || raw.token.length < 16) {
    throw new Error(`Invalid token in ${configPath()} — run "pocketclaw init" to regenerate.`);
  }
  const port =
    typeof raw.port === "number" && Number.isInteger(raw.port) && raw.port > 0 && raw.port < 65536
      ? raw.port
      : DEFAULT_PORT;
  const vaultPath = typeof raw.vaultPath === "string" && raw.vaultPath.length > 0 ? raw.vaultPath : undefined;
  return { token: raw.token, port, vaultPath };
}

/** Create a fresh config with a random token. Does not overwrite an existing file. */
export function createConfig(overrides?: Partial<Pick<HostConfig, "port" | "vaultPath">>): HostConfig {
  ensureDirs();
  if (configExists()) {
    throw new Error(`Config already exists at ${configPath()}.`);
  }
  const config: HostConfig = {
    token: randomBytes(32).toString("hex"),
    port: overrides?.port ?? DEFAULT_PORT,
    ...(overrides?.vaultPath ? { vaultPath: overrides.vaultPath } : {}),
  };
  writeFileSync(configPath(), `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  return config;
}
