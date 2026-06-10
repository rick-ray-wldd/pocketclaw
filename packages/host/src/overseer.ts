/**
 * Overseer — a meta view over all sessions.
 *
 * buildDigest() renders every SessionSummary plus its recent events as
 * markdown. ask() feeds that digest + the user's question to the local
 * `claude` CLI in headless mode and returns the concise answer. When the
 * CLI is missing or times out, it degrades to returning the digest itself.
 *
 * Also owns the 23:55 local-time daily Obsidian rollup (checked each minute).
 */
import { spawn } from "node:child_process";
import os from "node:os";
import type { SessionEvent, SessionSummary } from "@pocketclaw/shared";
import { errorMessage, log, truncate } from "./log.js";
import { ObsidianLogger, ymdLocal } from "./obsidian.js";

const ASK_TIMEOUT_MS = 120_000;
const RECENT_EVENTS = 8;

export interface OverseerOptions {
  getSummaries(): SessionSummary[];
  getEvents(sessionId: string): SessionEvent[];
  obsidian: ObsidianLogger;
  claudeBin?: string;
  timeoutMs?: number;
}

function renderEvent(event: SessionEvent): string {
  switch (event.kind) {
    case "assistant_text":
      return `- assistant: ${truncate(event.text.replace(/\s+/g, " ").trim(), 160)}`;
    case "tool_use":
      return `- tool_use ${event.tool}: ${truncate(event.inputPreview, 100)}`;
    case "tool_result":
      return `- tool_result ${event.tool} (${event.ok ? "ok" : "error"}): ${truncate(event.preview, 100)}`;
    case "status":
      return `- status -> ${event.status}`;
  }
}

export class Overseer {
  private rollupTimer?: NodeJS.Timeout;
  private lastRollupDay?: string;

  constructor(private readonly opts: OverseerOptions) {}

  /** Markdown digest of all sessions + their recent events. */
  buildDigest(): string {
    const summaries = this.opts.getSummaries();
    const lines: string[] = [`# PocketClaw digest — ${new Date().toLocaleString()}`, ""];
    if (summaries.length === 0) {
      lines.push("No sessions yet.");
      return lines.join("\n");
    }
    lines.push(`## Sessions (${summaries.length})`, "");
    for (const s of summaries) {
      lines.push(`### ${s.title} [${s.status}]`);
      lines.push(`- workspace: ${s.workspace.alias} (${s.workspace.path})`);
      lines.push(`- started: ${new Date(s.startedAt).toLocaleString()}, updated: ${new Date(s.updatedAt).toLocaleString()}`);
      if (s.costUsd !== undefined) lines.push(`- cost: $${s.costUsd.toFixed(4)}`);
      if (s.todo) lines.push(`- todos: ${s.todo.done}/${s.todo.total} done`);
      if (s.lastMessage) lines.push(`- last message: ${truncate(s.lastMessage, 200)}`);
      const recent = this.opts.getEvents(s.id).slice(-RECENT_EVENTS);
      if (recent.length > 0) {
        lines.push("- recent events:");
        for (const event of recent) lines.push(`  ${renderEvent(event)}`);
      }
      lines.push("");
    }
    return lines.join("\n");
  }

  /** Answer a question about the fleet using the local claude CLI (headless). */
  async ask(question: string): Promise<string> {
    const digest = this.buildDigest();
    const promptText = [
      digest,
      "",
      "## Question",
      question,
      "",
      "You are the PocketClaw overseer. Answer the question concisely (a few sentences at most), based only on the session digest above.",
    ].join("\n");
    const bin = this.opts.claudeBin ?? "claude";
    const timeoutMs = this.opts.timeoutMs ?? ASK_TIMEOUT_MS;

    return new Promise<string>((resolve) => {
      const child = spawn(bin, ["-p", promptText, "--output-format", "json"], {
        cwd: os.homedir(),
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      let settled = false;
      const settle = (answer: string): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(answer);
      };
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        settle(`Overseer notice: claude timed out after ${Math.round(timeoutMs / 1000)}s. Raw digest:\n\n${digest}`);
      }, timeoutMs);
      child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
      child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
      child.on("error", (err) => {
        settle(`Overseer notice: claude CLI unavailable (${errorMessage(err)}). Raw digest:\n\n${digest}`);
      });
      child.on("close", (code) => {
        if (code !== 0 && !stdout.trim()) {
          settle(`Overseer notice: claude exited with code ${code} (${truncate(stderr.trim(), 200)}). Raw digest:\n\n${digest}`);
          return;
        }
        try {
          const parsed = JSON.parse(stdout) as { result?: unknown };
          settle(typeof parsed.result === "string" ? parsed.result : stdout.trim());
        } catch {
          settle(stdout.trim() || digest);
        }
      });
    });
  }

  /** Check each minute; at 23:55 local time write the Obsidian daily rollup once. */
  startDailyRollup(): void {
    if (this.rollupTimer) return;
    this.rollupTimer = setInterval(() => {
      const now = new Date();
      const day = ymdLocal(now);
      if (now.getHours() === 23 && now.getMinutes() === 55 && this.lastRollupDay !== day) {
        this.lastRollupDay = day;
        log.info("Running 23:55 daily rollup");
        this.opts.obsidian.writeDailyRollup(this.opts.getSummaries());
      }
    }, 60_000);
    this.rollupTimer.unref?.();
  }

  stop(): void {
    if (this.rollupTimer) clearInterval(this.rollupTimer);
    this.rollupTimer = undefined;
  }
}
