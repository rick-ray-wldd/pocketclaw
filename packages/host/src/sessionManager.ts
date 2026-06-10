/**
 * SessionManager — spawn/list/kill Claude Code sessions, keep a per-session
 * ring buffer of the last 200 SessionEvents, track status transitions, and
 * persist events to ~/.pocketclaw/sessions/<id>.jsonl.
 */
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { appendFile } from "node:fs/promises";
import path from "node:path";
import type { SessionEvent, SessionStatus, SessionSummary, Workspace } from "@pocketclaw/shared";
import { spawnSession, type AdapterSession, type CanUseToolFn } from "./claudeAdapter.js";
import { log, truncate } from "./log.js";
import type { PermissionBroker } from "./permissionBroker.js";

const RING_SIZE = 200;

export interface SessionHooks {
  /** Fired whenever any SessionSummary field changes. */
  onChange(sessions: SessionSummary[]): void;
  /** Fired for every recorded SessionEvent. */
  onEvent(sessionId: string, event: SessionEvent): void;
  /** Fired exactly once when a session ends (done or error). */
  onEnd(summary: SessionSummary, events: SessionEvent[], filesTouched: string[]): void;
}

interface InternalSession {
  summary: SessionSummary;
  adapter?: AdapterSession;
  ring: SessionEvent[];
  filesTouched: Set<string>;
  ended: boolean;
}

export interface SessionManagerOptions {
  broker: PermissionBroker;
  dir: string;
  hooks: SessionHooks;
}

/** Tools whose input names a file we consider "touched". */
const FILE_TOOLS = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);

function deriveTitle(alias: string, prompt?: string): string {
  const words = prompt?.trim().split(/\s+/).slice(0, 6).join(" ") ?? "";
  return words ? truncate(`${alias}: ${words}`, 64) : `${alias} session`;
}

export class SessionManager {
  private readonly sessions = new Map<string, InternalSession>();

  constructor(private readonly opts: SessionManagerOptions) {
    mkdirSync(opts.dir, { recursive: true });
  }

  list(): SessionSummary[] {
    return [...this.sessions.values()]
      .map((s) => ({ ...s.summary }))
      .sort((a, b) => b.startedAt - a.startedAt);
  }

  titleOf(sessionId: string): string {
    return this.sessions.get(sessionId)?.summary.title ?? "unknown session";
  }

  getEvents(sessionId: string): SessionEvent[] {
    return [...(this.sessions.get(sessionId)?.ring ?? [])];
  }

  async spawn(workspace: Workspace, prompt?: string): Promise<SessionSummary> {
    const id = randomUUID();
    const now = Date.now();
    const summary: SessionSummary = {
      id,
      title: deriveTitle(workspace.alias, prompt),
      workspace,
      // Promptless sessions sit idle until the first input arrives.
      status: prompt === undefined ? "waiting_input" : "starting",
      lastMessage: "",
      startedAt: now,
      updatedAt: now,
    };
    const internal: InternalSession = { summary, ring: [], filesTouched: new Set(), ended: false };
    this.sessions.set(id, internal);
    this.emitChange();

    const brokerHandle = this.opts.broker.handle(id);
    const canUseTool: CanUseToolFn = async (tool, input) => {
      this.noteToolInput(internal, tool, input);
      return brokerHandle(tool, input);
    };

    const adapter = await spawnSession({ cwd: workspace.path, initialPrompt: prompt, canUseTool });
    internal.adapter = adapter;
    void this.pump(internal, adapter);
    log.info(`Spawned session ${id} in ${workspace.path} (${summary.title})`);
    return { ...summary };
  }

  /** Send another user turn into a live session. */
  input(sessionId: string, text: string): boolean {
    const internal = this.sessions.get(sessionId);
    if (!internal?.adapter || internal.ended) return false;
    internal.adapter.send(text);
    this.setStatus(internal, "running");
    return true;
  }

  async kill(sessionId: string): Promise<boolean> {
    const internal = this.sessions.get(sessionId);
    if (!internal) return false;
    if (internal.adapter && !internal.ended) await internal.adapter.kill();
    return true;
  }

  /** Status update from outside the event pump (used by the PermissionBroker). */
  setExternalStatus(sessionId: string, status: SessionStatus): void {
    const internal = this.sessions.get(sessionId);
    if (!internal || internal.ended) return;
    this.setStatus(internal, status);
  }

  private async pump(internal: InternalSession, adapter: AdapterSession): Promise<void> {
    let fatal = false;
    for await (const event of adapter.events) {
      switch (event.kind) {
        case "assistant_text":
          internal.summary.lastMessage = truncate(event.text.trim(), 300);
          if (internal.summary.status === "starting") this.setStatus(internal, "running");
          this.record(internal, { kind: "assistant_text", text: event.text });
          this.emitChange();
          break;
        case "tool_use":
          if (internal.summary.status === "starting") this.setStatus(internal, "running");
          this.record(internal, { kind: "tool_use", tool: event.tool, inputPreview: event.inputPreview });
          break;
        case "tool_result":
          this.record(internal, { kind: "tool_result", tool: event.tool, ok: event.ok, preview: event.preview });
          break;
        case "turn_end":
          if (event.costUsd !== undefined) {
            internal.summary.costUsd = event.costUsd;
          }
          // Session stays alive in streaming-input mode: wait for the next turn.
          this.setStatus(internal, event.isError ? "error" : "waiting_input");
          break;
        case "fatal":
          fatal = true;
          internal.summary.lastMessage = truncate(event.message, 300);
          this.setStatus(internal, "error");
          break;
      }
    }
    this.finish(internal, fatal ? "error" : undefined);
  }

  private finish(internal: InternalSession, forced?: SessionStatus): void {
    if (internal.ended) return;
    internal.ended = true;
    const final: SessionStatus = forced ?? (internal.summary.status === "error" ? "error" : "done");
    this.setStatus(internal, final, { allowEnded: true });
    this.opts.hooks.onEnd({ ...internal.summary }, [...internal.ring], [...internal.filesTouched]);
    log.info(`Session ${internal.summary.id} ended: ${final}`);
  }

  private setStatus(internal: InternalSession, status: SessionStatus, opts?: { allowEnded?: boolean }): void {
    if (internal.ended && !opts?.allowEnded) return;
    if (internal.summary.status === status) return;
    internal.summary.status = status;
    this.record(internal, { kind: "status", status });
    this.emitChange();
  }

  private record(internal: InternalSession, event: SessionEvent): void {
    internal.ring.push(event);
    if (internal.ring.length > RING_SIZE) internal.ring.shift();
    internal.summary.updatedAt = Date.now();
    const line = `${JSON.stringify({ ts: Date.now(), ...event })}\n`;
    appendFile(path.join(this.opts.dir, `${internal.summary.id}.jsonl`), line).catch((err) =>
      log.warn(`event persist failed for ${internal.summary.id}:`, err)
    );
    this.opts.hooks.onEvent(internal.summary.id, event);
  }

  /** Inspect full tool inputs (the ring only stores previews) for todo/file tracking. */
  private noteToolInput(internal: InternalSession, tool: string, input: Record<string, unknown>): void {
    if (tool === "TodoWrite") {
      const todos = input.todos;
      if (Array.isArray(todos)) {
        const total = todos.length;
        const done = todos.filter(
          (t) => typeof t === "object" && t !== null && (t as { status?: unknown }).status === "completed"
        ).length;
        internal.summary.todo = { done, total };
        this.emitChange();
      }
      return;
    }
    if (FILE_TOOLS.has(tool)) {
      const filePath = input.file_path ?? input.notebook_path;
      if (typeof filePath === "string" && filePath) internal.filesTouched.add(filePath);
    }
  }

  private emitChange(): void {
    this.opts.hooks.onChange(this.list());
  }
}
