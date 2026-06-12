# PocketClaw — Project Instructions

Pocket command center for Claude Code: an Expo iOS app + a Mac-side host daemon.
Dynamic Island approvals, workspace switching, an Overseer session, Obsidian daily logs.
Independent implementation inspired by Happy (github.com/slopus/happy, MIT) — see NOTICE.md.
**No source code may be copied from Happy.** When adapting a non-trivial pattern, annotate
`// Pattern inspired by slopus/happy (MIT)`.

## Layout (npm workspaces monorepo)

```
packages/shared   @pocketclaw/shared — zod wire protocol + risk tiers (SOURCE OF TRUTH)
packages/host     @pocketclaw/host   — Node daemon: Agent SDK sessions, permission broker,
                                       workspaces, Obsidian logger, Overseer (bin: pocketclaw)
packages/app      pocketclaw-app     — Expo SDK 54 app (expo-router, zustand) +
                                       iOS Live Activity (targets/widget, modules/live-activity)
docs/             protocol.md, security.md, app-store.md, obsidian.md
```

## Commands

```bash
npm install                 # root; builds shared+host via prepare scripts
npm run build               # tsc for shared + host
npm run typecheck           # all three workspaces — must stay green
node packages/host/dist/cli.js {init|serve|workspace|doctor}
npm run app                 # expo start (packages/app)
```

Host runtime state lives in `~/.pocketclaw/` (config.json, workspaces.json, audit.jsonl,
sessions/*.jsonl). Default port 8787, bearer-token auth, intended for tailnet use only.

## Hard rules (do not weaken)

1. **Protocol changes** must update all four places together: `packages/shared/src/protocol.ts`
   (zod, authoritative), host handlers, app client, `docs/protocol.md`.
2. **High-tier permissions can never be approved via REST** (the Live Activity path).
   `PermissionBroker.resolveDecision` returns `"forbidden"` → HTTP 403. Only the WS channel
   (app foreground) may approve high. The widget must never render an Approve button for high.
3. **Default-deny**: pending permissions time out to deny after 180s. Keep it.
4. **Audit completeness**: every decision (incl. low-tier auto-allows) appends requestId,
   sessionId, tool, full input, tier, behavior, source to audit.jsonl.
5. TypeScript strict everywhere; shared+host are NodeNext ESM (imports need `.js` extensions).
6. React is pinned via root `overrides` to 19.1.0 (Expo SDK 54). Don't introduce a second copy.

## Current status (2026-06-11)

- v0.1.0 published to github.com/rick-ray-wldd/pocketclaw; typecheck green; CLI smoke-tested.
- NOT yet verified end-to-end: real Agent SDK session traffic through `src/claudeAdapter.ts`
  (field mapping may need fixes), Expo Go full loop, Live Activity on device
  (needs appleTeamId in app.json + `expo prebuild -p ios`), Obsidian writes (vaultPath unset).
- Next steps and broader context: see `../HANDOFF.md` (kept outside the repo on purpose)
  and ../pocketclaw-on-happy-blueprint.md.
