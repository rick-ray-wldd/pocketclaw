# Obsidian Integration

The PocketClaw host journals every session into your Obsidian vault, turning agent
activity into durable, searchable, Dataview-queryable notes.

## Configuration

Point the host at your vault in `~/.pocketclaw/config.json`:

```json
{
  "token": "…",
  "port": 8787,
  "vaultPath": "/Users/me/Obsidian/MainVault"
}
```

If `vaultPath` is unset, Obsidian logging is disabled (everything else still works).
The host writes plain Markdown files — Obsidian does not need to be running, and no
plugin is required.

## Vault structure

```
<vault>/
└── PocketClaw/
    ├── Daily/
    │   ├── 2026-06-10.md
    │   └── 2026-06-11.md
    └── Sessions/
        ├── 2026-06-11-sess_42-fix-the-rss-feed.md
        └── 2026-06-11-sess_43-thesis-bibliography.md
```

### Daily notes — `PocketClaw/Daily/YYYY-MM-DD.md`

One file per day. The host maintains a sessions table between HTML comment markers,
so **anything you write outside the markers is preserved** — the host only rewrites
the region between them.

Example (`PocketClaw/Daily/2026-06-11.md`):

```markdown
---
type: pocketclaw-daily
date: 2026-06-11
sessions: 2
total_cost_usd: 0.87
---

# PocketClaw — 2026-06-11

<!-- pocketclaw:sessions:start -->
| Session | Workspace | Status | Todos | Cost | Link |
|---|---|---|---|---|---|
| fix the RSS feed | blog | done | 5/5 | $0.41 | [[2026-06-11-sess_42-fix-the-rss-feed]] |
| thesis bibliography | thesis | running | 2/6 | $0.46 | [[2026-06-11-sess_43-thesis-bibliography]] |
<!-- pocketclaw:sessions:end -->

## My own notes
Anything down here is yours — PocketClaw never touches text outside the markers.
```

The markers are exactly:

```
<!-- pocketclaw:sessions:start -->
<!-- pocketclaw:sessions:end -->
```

### Session notes — `PocketClaw/Sessions/YYYY-MM-DD-<id>-<slug>.md`

One file per session, appended as the session progresses. Example:

```markdown
---
type: pocketclaw-session
session_id: sess_42
title: fix the RSS feed
workspace: blog
workspace_path: /Users/me/code/blog
status: done
started: 2026-06-11T09:23:00+08:00
updated: 2026-06-11T09:41:00+08:00
cost_usd: 0.41
todos_done: 5
todos_total: 5
---

# fix the RSS feed

## Timeline

- **09:23** `status` → running
- **09:24** `tool_use` Read — `src/feed.ts`
- **09:26** assistant: Found the bug — pubDate uses local time instead of UTC.
- **09:27** `tool_use` Edit — `feed.ts: replace pubDate format` *(medium — approved from Live Activity)*
- **09:31** `tool_result` Bash ok — `npm test → 14 passed`
- **09:41** `status` → done

## Summary

Fixed RFC-822 date formatting in the RSS feed and added a regression test.
```

## The "today" REST endpoint

The app's daily-log screen uses:

```
GET /api/obsidian/today
→ { "path": "PocketClaw/Daily/2026-06-11.md", "markdown": "…" }
```

`path` is vault-relative, so the app can build an `obsidian://open?vault=…&file=…`
deep link if you have Obsidian on your phone with a synced vault.

## Dataview recipes

The frontmatter is designed for [Dataview](https://blacksmithgu.github.io/obsidian-dataview/).
Useful queries:

All sessions this week, costliest first:

````markdown
```dataview
TABLE workspace, status, cost_usd, todos_done + "/" + todos_total AS todos
FROM "PocketClaw/Sessions"
WHERE type = "pocketclaw-session" AND started >= date(today) - dur(7 days)
SORT cost_usd DESC
```
````

Monthly spend:

````markdown
```dataview
TABLE sum(rows.total_cost_usd) AS "USD"
FROM "PocketClaw/Daily"
WHERE type = "pocketclaw-daily"
GROUP BY dateformat(date, "yyyy-MM") AS month
```
````

Sessions that ended in error:

````markdown
```dataview
LIST FROM "PocketClaw/Sessions" WHERE status = "error"
```
````

## Notes & caveats

- Frontmatter keys are stable API: `type`, `date`, `sessions`, `total_cost_usd`
  (daily) and `type`, `session_id`, `title`, `workspace`, `workspace_path`,
  `status`, `started`, `updated`, `cost_usd`, `todos_done`, `todos_total` (session).
- Timestamps in frontmatter are ISO 8601 with local offset (Dataview parses these
  natively); the wire protocol itself uses epoch milliseconds.
- If you sync your vault (iCloud / Obsidian Sync / Syncthing), the host's writes are
  ordinary file writes and sync like any other note.
- Filenames slugify the session title (lowercase, hyphens, ASCII-ish); collisions
  are disambiguated by the session id already embedded in the name.
