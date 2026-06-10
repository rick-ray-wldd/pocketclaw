#!/usr/bin/env node
/**
 * PocketClaw host CLI.
 *
 *   pocketclaw serve                          start the daemon
 *   pocketclaw init                           create config + print pairing JSON & QR
 *   pocketclaw workspace add <alias> <path>   register a workspace
 *   pocketclaw workspace list
 *   pocketclaw workspace remove <alias>
 *   pocketclaw doctor                         environment checks
 */
import { spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import os from "node:os";
import qrcode from "qrcode-terminal";
import {
  configExists,
  configPath,
  createConfig,
  ensureDirs,
  loadConfig,
  VERSION,
} from "./config.js";
import { errorMessage, log } from "./log.js";
import { startHost } from "./server.js";
import { WorkspaceRegistry } from "./workspaces.js";

const USAGE = `pocketclaw v${VERSION}

Usage:
  pocketclaw serve
  pocketclaw init
  pocketclaw workspace add <alias> <path>
  pocketclaw workspace list
  pocketclaw workspace remove <alias>
  pocketclaw doctor
`;

/** Prefer a Tailscale CGNAT address (100.64/10), then any non-internal IPv4. */
function pickHostAddress(): string {
  const candidates: string[] = [];
  for (const interfaces of Object.values(os.networkInterfaces())) {
    for (const net of interfaces ?? []) {
      if (net.family === "IPv4" && !net.internal) candidates.push(net.address);
    }
  }
  return candidates.find((addr) => addr.startsWith("100.")) ?? candidates[0] ?? "localhost";
}

async function cmdServe(): Promise<void> {
  const config = loadConfig();
  const host = await startHost(config);
  const shutdown = (): void => {
    log.info("Shutting down…");
    void host.close().then(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

function cmdInit(): void {
  ensureDirs();
  let config;
  if (configExists()) {
    config = loadConfig();
    log.info(`Config already exists at ${configPath()} — reusing its token.`);
  } else {
    config = createConfig();
    log.info(`Created ${configPath()}`);
  }
  const pairing = { url: `ws://${pickHostAddress()}:${config.port}`, token: config.token };
  // Pairing JSON on stdout (machine readable), QR below it for the iOS app.
  console.log(JSON.stringify(pairing, null, 2));
  qrcode.generate(JSON.stringify(pairing), { small: true });
}

function cmdWorkspace(args: string[]): void {
  const registry = new WorkspaceRegistry();
  const [sub, alias, dir] = args;
  switch (sub) {
    case "add": {
      if (!alias || !dir) {
        console.error("Usage: pocketclaw workspace add <alias> <path>");
        process.exitCode = 1;
        return;
      }
      const workspace = registry.add(alias, dir);
      console.log(`Added workspace "${workspace.alias}" -> ${workspace.path}`);
      return;
    }
    case "list": {
      const workspaces = registry.list();
      if (workspaces.length === 0) {
        console.log("No workspaces. Add one with: pocketclaw workspace add <alias> <path>");
        return;
      }
      for (const w of workspaces) {
        const lastUsed = w.lastUsedAt ? new Date(w.lastUsedAt).toLocaleString() : "never";
        console.log(`${w.alias.padEnd(20)} ${w.path}  (last used: ${lastUsed})`);
      }
      return;
    }
    case "remove": {
      if (!alias) {
        console.error("Usage: pocketclaw workspace remove <alias>");
        process.exitCode = 1;
        return;
      }
      if (registry.remove(alias)) console.log(`Removed workspace "${alias}"`);
      else {
        console.error(`Unknown workspace alias: ${alias}`);
        process.exitCode = 1;
      }
      return;
    }
    default:
      console.error(USAGE);
      process.exitCode = 1;
  }
}

async function cmdDoctor(): Promise<void> {
  interface Check {
    name: string;
    ok: boolean;
    detail: string;
    fatal: boolean;
  }
  const checks: Check[] = [];

  // Config
  if (configExists()) {
    try {
      const config = loadConfig();
      checks.push({ name: "config", ok: true, detail: `${configPath()} (port ${config.port})`, fatal: false });
      if (config.vaultPath) {
        const exists = existsSync(config.vaultPath) && statSync(config.vaultPath).isDirectory();
        checks.push({
          name: "vault",
          ok: exists,
          detail: exists ? config.vaultPath : `vaultPath not found: ${config.vaultPath}`,
          fatal: false,
        });
      } else {
        checks.push({ name: "vault", ok: true, detail: "vaultPath not set (Obsidian logging disabled)", fatal: false });
      }
    } catch (err) {
      checks.push({ name: "config", ok: false, detail: errorMessage(err), fatal: true });
    }
  } else {
    checks.push({ name: "config", ok: false, detail: `missing — run "pocketclaw init"`, fatal: true });
  }

  // claude CLI (used by the overseer)
  const probe = spawnSync("claude", ["--version"], { encoding: "utf8", timeout: 15_000 });
  if (probe.error || probe.status !== 0) {
    checks.push({
      name: "claude CLI",
      ok: false,
      detail: probe.error ? errorMessage(probe.error) : `exit code ${probe.status}`,
      fatal: false,
    });
  } else {
    checks.push({ name: "claude CLI", ok: true, detail: probe.stdout.trim(), fatal: false });
  }

  // Agent SDK (used by sessions)
  try {
    const moduleName = "@anthropic-ai/claude-agent-sdk";
    await import(moduleName);
    checks.push({ name: "agent SDK", ok: true, detail: moduleName, fatal: false });
  } catch (err) {
    checks.push({ name: "agent SDK", ok: false, detail: errorMessage(err), fatal: true });
  }

  // Workspaces
  try {
    const count = new WorkspaceRegistry().list().length;
    checks.push({ name: "workspaces", ok: true, detail: `${count} registered`, fatal: false });
  } catch (err) {
    checks.push({ name: "workspaces", ok: false, detail: errorMessage(err), fatal: false });
  }

  let failed = false;
  for (const check of checks) {
    console.log(`${check.ok ? "[ok]  " : "[fail]"} ${check.name.padEnd(12)} ${check.detail}`);
    if (!check.ok && check.fatal) failed = true;
  }
  if (failed) process.exitCode = 1;
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);
  switch (command) {
    case "serve":
      await cmdServe();
      break;
    case "init":
      cmdInit();
      break;
    case "workspace":
      cmdWorkspace(rest);
      break;
    case "doctor":
      await cmdDoctor();
      break;
    default:
      console.error(USAGE);
      process.exitCode = command ? 1 : 0;
  }
}

main().catch((err) => {
  log.error(errorMessage(err));
  process.exit(1);
});
