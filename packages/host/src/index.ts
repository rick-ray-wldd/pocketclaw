/**
 * @pocketclaw/host — programmatic API.
 * The CLI (src/cli.ts) is the main entry point; this module re-exports the
 * building blocks for tests and embedding.
 */
export { VERSION, DEFAULT_PORT, loadConfig, createConfig, configExists, configPath, ensureDirs } from "./config.js";
export type { HostConfig } from "./config.js";
export { startHost, tokenEquals } from "./server.js";
export type { RunningHost } from "./server.js";
export { SessionManager } from "./sessionManager.js";
export type { SessionHooks, SessionManagerOptions } from "./sessionManager.js";
export { PermissionBroker } from "./permissionBroker.js";
export type { DecisionSource, PermissionBrokerOptions } from "./permissionBroker.js";
export { WorkspaceRegistry } from "./workspaces.js";
export { ObsidianLogger, ymdLocal, hmLocal } from "./obsidian.js";
export { Overseer } from "./overseer.js";
export type { OverseerOptions } from "./overseer.js";
export { spawnSession } from "./claudeAdapter.js";
export type { AdapterEvent, AdapterSession, CanUseToolFn, PermissionDecision, SpawnOptions } from "./claudeAdapter.js";
export { log, preview, truncate, errorMessage } from "./log.js";
