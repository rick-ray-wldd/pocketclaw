/**
 * WorkspaceRegistry — CRUD over ~/.pocketclaw/workspaces.json.
 */
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Workspace } from "@pocketclaw/shared";
import { workspacesPath } from "./config.js";
import { log } from "./log.js";

export class WorkspaceRegistry {
  private readonly file: string;
  private workspaces: Workspace[] = [];

  constructor(file: string = workspacesPath()) {
    this.file = file;
    this.load();
  }

  private load(): void {
    if (!existsSync(this.file)) {
      this.workspaces = [];
      return;
    }
    try {
      const raw = JSON.parse(readFileSync(this.file, "utf8")) as unknown;
      this.workspaces = Array.isArray(raw)
        ? raw.filter(
            (w): w is Workspace =>
              typeof w === "object" && w !== null && typeof (w as Workspace).alias === "string" && typeof (w as Workspace).path === "string"
          )
        : [];
    } catch (err) {
      log.warn(`Could not parse ${this.file}, starting empty:`, err);
      this.workspaces = [];
    }
  }

  private save(): void {
    writeFileSync(this.file, `${JSON.stringify(this.workspaces, null, 2)}\n`);
  }

  /** Most recently used first, then alphabetical. */
  list(): Workspace[] {
    return [...this.workspaces].sort((a, b) => {
      const diff = (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0);
      return diff !== 0 ? diff : a.alias.localeCompare(b.alias);
    });
  }

  get(alias: string): Workspace | undefined {
    return this.workspaces.find((w) => w.alias === alias);
  }

  /** Add a workspace, or update the path of an existing alias. Validates the directory. */
  add(alias: string, dirPath: string): Workspace {
    const cleanAlias = alias.trim();
    if (!cleanAlias) throw new Error("Workspace alias must not be empty.");
    const resolved = path.resolve(dirPath);
    if (!existsSync(resolved) || !statSync(resolved).isDirectory()) {
      throw new Error(`Not a directory: ${resolved}`);
    }
    const existing = this.get(cleanAlias);
    if (existing) {
      existing.path = resolved;
      this.save();
      return existing;
    }
    const workspace: Workspace = { alias: cleanAlias, path: resolved };
    this.workspaces.push(workspace);
    this.save();
    return workspace;
  }

  remove(alias: string): boolean {
    const before = this.workspaces.length;
    this.workspaces = this.workspaces.filter((w) => w.alias !== alias);
    if (this.workspaces.length === before) return false;
    this.save();
    return true;
  }

  /** Bump lastUsedAt — called on spawn. */
  touch(alias: string): void {
    const workspace = this.get(alias);
    if (!workspace) return;
    workspace.lastUsedAt = Date.now();
    this.save();
  }
}
