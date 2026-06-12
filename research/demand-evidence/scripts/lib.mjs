// Shared helpers for the PocketClaw demand-evidence collectors.
// Node >= 20, ESM, zero dependencies (built-in fetch only).

import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

/** Returns YYYY-MM-DD in UTC for snapshot folder naming. */
export function snapshotDate(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

/**
 * Parses `--out <dir>` from argv. Falls back to
 * `<repo>/research/demand-evidence/data/snapshot-<date>/`.
 */
export function resolveOutDir(argv = process.argv.slice(2)) {
  const i = argv.indexOf("--out");
  if (i !== -1) {
    const dir = argv[i + 1];
    if (!dir) {
      console.error("error: --out requires a directory argument");
      process.exit(2);
    }
    return path.resolve(dir);
  }
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.join(here, "..", "data", `snapshot-${snapshotDate()}`);
}

/**
 * GET a JSON endpoint. Throws a descriptive Error on network failure or
 * unexpected HTTP status. `okStatuses` lets callers treat e.g. 404 as data.
 */
export async function fetchJson(url, { headers = {}, okStatuses = [200] } = {}) {
  let res;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": "pocketclaw-demand-evidence", ...headers },
    });
  } catch (cause) {
    throw new Error(
      `network failure fetching ${url} — are you offline? (${cause.message ?? cause})`,
      { cause },
    );
  }
  if (!okStatuses.includes(res.status)) {
    const body = await res.text().catch(() => "");
    const hint =
      res.status === 403 || res.status === 429
        ? " (likely rate-limited; wait a minute or set GITHUB_TOKEN for GitHub endpoints)"
        : "";
    throw new Error(`HTTP ${res.status} from ${url}${hint}\n${body.slice(0, 300)}`);
  }
  return { status: res.status, json: res.status === 204 ? null : await res.json() };
}

/** Optional GitHub auth: respected when GITHUB_TOKEN is set, never required. */
export function githubHeaders() {
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  return headers;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Writes pretty-printed JSON to <outDir>/<name> and returns the full path. */
export async function writeSnapshot(outDir, name, payload) {
  await mkdir(outDir, { recursive: true });
  const file = path.join(outDir, name);
  await writeFile(file, JSON.stringify(payload, null, 2) + "\n", "utf8");
  return file;
}

/** Uniform top-level runner: clear message + non-zero exit on failure. */
export function run(main) {
  main().catch((err) => {
    console.error(`\nFAILED: ${err.message}`);
    process.exit(1);
  });
}
