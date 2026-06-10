# @pocketclaw/host

Node daemon for the Mac that manages Claude Code sessions and serves the
PocketClaw iOS app over PocketClaw Wire Protocol v0 (WebSocket + small REST
surface).

Inspired by [Happy](https://github.com/slopus/happy) (MIT, slopus contributors).

## Quick start

```sh
pocketclaw init                      # creates ~/.pocketclaw/config.json, prints pairing JSON + QR
pocketclaw workspace add thesis ~/code/thesis
pocketclaw serve                     # ws://<host>:8787/ws?token=...  +  /api/* REST
pocketclaw doctor                    # checks claude CLI, agent SDK, config, vault
```

Set `vaultPath` in `~/.pocketclaw/config.json` to your Obsidian vault root to
enable daily notes (`PocketClaw/Daily/YYYY-MM-DD.md`) and per-session digests
(`PocketClaw/Sessions/YYYY-MM-DD-<slug>.md`). A daily rollup runs at 23:55
local time.

## Security note

The server binds `0.0.0.0` so the phone can reach it, but it is **intended for
tailnet (Tailscale) use only** — do not expose the port to the public internet.
Auth is a single bearer token (constant-time compared) carried in the WS
`?token=` query parameter and the REST `Authorization: Bearer` header. Every
permission decision is appended to `~/.pocketclaw/audit.jsonl`.

## Permission model

Tool calls from sessions go through the PermissionBroker:

- `low` risk (Read, Grep, Glob, ...) — auto-allowed, audited.
- `medium` — pushed to the app/Live Activity, approvable remotely.
- `high` (rm -rf, sudo, force-push, ...) — pushed to the app; the Live
  Activity only offers "Open app", never one-tap approve.
- No decision within 180 s — default deny.

Risk tiers are computed by `computeRiskTier` in `@pocketclaw/shared`.
