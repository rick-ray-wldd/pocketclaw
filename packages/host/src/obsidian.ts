/**
 * ObsidianLogger — writes session digests into the user's Obsidian vault.
 *
 * Daily note   <vault>/PocketClaw/Daily/YYYY-MM-DD.md
 *   - created from a template when missing
 *   - "## Sessions" table regenerated between the pocketclaw markers
 *   - per-session "### HH:MM <title>" subsections appended on session end
 * Session note <vault>/PocketClaw/Sessions/YYYY-MM-DD-<slug>.md
 *   - fuller event digest with a [[YYYY-MM-DD]] backlink
 *
 * All methods are no-ops when vaultPath is not configured.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { SessionEvent, SessionSummary } from "@pocketclaw/shared";
import { errorMessage, log, truncate } from "./log.js";

const MARKER_START = "<!-- pocketclaw:sessions:start -->";
const MARKER_END = "<!-- pocketclaw:sessions:end -->";
const TABLE_HEADER = "| Time | Workspace | Title | Status | Cost |";
const TABLE_SEPARATOR = "| --- | --- | --- | --- | --- |";

/** Local-time YYYY-MM-DD. */
export function ymdLocal(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Local-time HH:MM. */
export function hmLocal(date: Date = new Date()): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function escapeCell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function formatCost(costUsd?: number): string {
  return costUsd !== undefined ? `$${costUsd.toFixed(4)}` : "—";
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9一-鿿]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "session"
  );
}

function dailyTemplate(ymd: string): string {
  return [
    "---",
    `date: ${ymd}`,
    "tags: [pocketclaw, daily]",
    "---",
    "",
    `# PocketClaw — ${ymd}`,
    "",
    "## Sessions",
    "",
    MARKER_START,
    TABLE_HEADER,
    TABLE_SEPARATOR,
    MARKER_END,
    "",
  ].join("\n");
}

export class ObsidianLogger {
  constructor(private readonly vaultPath?: string) {}

  enabled(): boolean {
    return typeof this.vaultPath === "string" && this.vaultPath.length > 0;
  }

  dailyPath(date: Date = new Date()): string {
    return path.join(this.vaultPath ?? "", "PocketClaw", "Daily", `${ymdLocal(date)}.md`);
  }

  /** Ensure today's daily note exists and return { path, markdown }. */
  readToday(): { path: string; markdown: string } | undefined {
    if (!this.enabled()) return undefined;
    const filePath = this.ensureDaily(new Date());
    return { path: filePath, markdown: readFileSync(filePath, "utf8") };
  }

  /** Called once per session by SessionManager hooks. */
  logSessionEnd(summary: SessionSummary, events: SessionEvent[], filesTouched: string[]): void {
    if (!this.enabled()) return;
    try {
      const noteName = this.writeSessionNote(summary, events, filesTouched);
      this.upsertDaily(summary, { subsection: true, filesTouched, sessionNote: noteName });
    } catch (err) {
      log.warn("Obsidian session log failed:", errorMessage(err));
    }
  }

  /** Daily rollup (23:55 scheduler) — refresh table rows for today's sessions. */
  writeDailyRollup(summaries: SessionSummary[]): void {
    if (!this.enabled()) return;
    const today = ymdLocal();
    try {
      for (const summary of summaries) {
        if (ymdLocal(new Date(summary.startedAt)) !== today) continue;
        this.upsertDaily(summary, { subsection: false, filesTouched: [] });
      }
      log.info(`Obsidian daily rollup written for ${today}`);
    } catch (err) {
      log.warn("Obsidian daily rollup failed:", errorMessage(err));
    }
  }

  private ensureDaily(date: Date): string {
    const filePath = this.dailyPath(date);
    mkdirSync(path.dirname(filePath), { recursive: true });
    if (!existsSync(filePath)) writeFileSync(filePath, dailyTemplate(ymdLocal(date)));
    return filePath;
  }

  private upsertDaily(
    summary: SessionSummary,
    opts: { subsection: boolean; filesTouched: string[]; sessionNote?: string }
  ): void {
    const started = new Date(summary.startedAt);
    const filePath = this.ensureDaily(started);
    let content = readFileSync(filePath, "utf8");

    content = this.upsertTableRow(content, summary, started);

    if (opts.subsection) {
      const heading = `### ${hmLocal(started)} ${summary.title}`;
      if (!content.includes(heading)) {
        const bullets = [
          `- Workspace: ${summary.workspace.alias} (\`${summary.workspace.path}\`)`,
          `- Duration: ${formatDuration(summary.updatedAt - summary.startedAt)}`,
          `- Final status: ${summary.status}`,
        ];
        if (summary.lastMessage) bullets.push(`- Last message: ${truncate(summary.lastMessage, 300)}`);
        if (opts.filesTouched.length > 0) {
          bullets.push(`- Files touched: ${opts.filesTouched.map((f) => `\`${f}\``).join(", ")}`);
        }
        if (opts.sessionNote) bullets.push(`- Full digest: [[${opts.sessionNote}]]`);
        content = `${content.replace(/\n*$/, "\n")}\n${heading}\n\n${bullets.join("\n")}\n`;
      }
    }

    writeFileSync(filePath, content);
  }

  /** Regenerate the table between the markers, merging the row for this session. */
  private upsertTableRow(content: string, summary: SessionSummary, started: Date): string {
    const startIdx = content.indexOf(MARKER_START);
    const endIdx = content.indexOf(MARKER_END);
    if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
      // Markers were removed by hand: re-append a fresh section.
      content = `${content.replace(/\n*$/, "\n")}\n## Sessions\n\n${MARKER_START}\n${TABLE_HEADER}\n${TABLE_SEPARATOR}\n${MARKER_END}\n`;
      return this.upsertTableRow(content, summary, started);
    }

    const middle = content.slice(startIdx + MARKER_START.length, endIdx);
    const rows = new Map<string, string>();
    for (const line of middle.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("|")) continue;
      if (trimmed === TABLE_HEADER || /^\|[\s\-|]+\|$/.test(trimmed)) continue;
      // Split on unescaped pipes only — titles may contain "\|".
      const cells = trimmed.split(/(?<!\\)\|/).map((c) => c.trim());
      // cells[0] and cells[cells.length-1] are empty (leading/trailing pipes).
      const time = cells[1] ?? "";
      const title = cells[3] ?? "";
      rows.set(`${time}|${title}`, trimmed);
    }

    const time = hmLocal(started);
    const title = escapeCell(summary.title);
    const row = `| ${time} | ${escapeCell(summary.workspace.alias)} | ${title} | ${summary.status} | ${formatCost(summary.costUsd)} |`;
    rows.set(`${time}|${title}`, row);

    const sorted = [...rows.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, line]) => line);
    const section = `\n${TABLE_HEADER}\n${TABLE_SEPARATOR}\n${sorted.join("\n")}\n`;
    return content.slice(0, startIdx + MARKER_START.length) + section + content.slice(endIdx);
  }

  /** Write the full per-session note; returns the note name (without .md) for linking. */
  private writeSessionNote(summary: SessionSummary, events: SessionEvent[], filesTouched: string[]): string {
    const started = new Date(summary.startedAt);
    const ymd = ymdLocal(started);
    const noteName = `${ymd}-${slugify(summary.title)}-${summary.id.slice(0, 6)}`;
    const dir = path.join(this.vaultPath ?? "", "PocketClaw", "Sessions");
    mkdirSync(dir, { recursive: true });

    const lines: string[] = [
      "---",
      `date: ${ymd}`,
      `session: ${summary.id}`,
      `workspace: ${summary.workspace.alias}`,
      `status: ${summary.status}`,
      "tags: [pocketclaw, session]",
      "---",
      "",
      `# ${summary.title}`,
      "",
      `Daily note: [[${ymd}]]`,
      "",
      `- Workspace: ${summary.workspace.alias} (\`${summary.workspace.path}\`)`,
      `- Started: ${started.toLocaleString()}`,
      `- Duration: ${formatDuration(summary.updatedAt - summary.startedAt)}`,
      `- Final status: ${summary.status}`,
      `- Cost: ${formatCost(summary.costUsd)}`,
    ];
    if (summary.todo) lines.push(`- Todos: ${summary.todo.done}/${summary.todo.total} done`);
    if (filesTouched.length > 0) {
      lines.push(`- Files touched: ${filesTouched.map((f) => `\`${f}\``).join(", ")}`);
    }
    lines.push("", "## Event digest", "");
    for (const event of events) {
      switch (event.kind) {
        case "assistant_text":
          lines.push(`> ${truncate(event.text.trim(), 500).replace(/\n/g, "\n> ")}`, "");
          break;
        case "tool_use":
          lines.push(`- tool_use \`${event.tool}\`: ${truncate(event.inputPreview, 120)}`);
          break;
        case "tool_result":
          lines.push(`- tool_result \`${event.tool}\` (${event.ok ? "ok" : "error"}): ${truncate(event.preview, 200)}`);
          break;
        case "status":
          lines.push(`- status -> ${event.status}`);
          break;
      }
    }
    writeFileSync(path.join(dir, `${noteName}.md`), `${lines.join("\n")}\n`);
    return noteName;
  }
}
