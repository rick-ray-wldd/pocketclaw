# pocketclaw-app

iOS-first Expo client for the PocketClaw host: session cards wall, chat-style
session view with permission banner, approvals queue, overseer screen, QR
pairing — plus a Live Activity (Dynamic Island) with Approve/Deny buttons for
medium-risk permission requests.

Inspired by Happy (slopus/happy, MIT). No code copied; protocol/UX inspiration only.

## Dev workflow

```bash
# 1. Install everything from the monorepo root (npm workspaces)
cd ../.. && npm i

# 2. Generate the ios/ project (also generates the PocketClawWidget target
#    via @bacons/apple-targets and links the local live-activity module)
cd packages/app
npx expo prebuild -p ios

# 3. One-time: open the Xcode workspace and confirm signing for BOTH targets
#    (PocketClaw app + PocketClawWidget widget extension). Both need the
#    App Group "group.com.rickray.pocketclaw" on your team.
open ios/PocketClaw.xcworkspace

# 4. Build & run
npx expo run:ios          # or run from Xcode
```

Then open Settings in the app and either paste the host URL + token or scan
the pairing QR (`{"url":"ws://<mac>:8787","token":"..."}`) printed by the host.

## Live Activities

- Require a **real device or an iOS 17+ simulator**; the Dynamic Island
  Approve/Deny buttons use `LiveActivityIntent` (iOS 17+).
- **Push Notifications capability is NOT required** — activities are started
  locally via ActivityKit from the app process.
- The widget's App Intents read the host URL + token from the App Group
  (`group.com.rickray.pocketclaw`), written whenever you save Settings, and
  POST `/api/decision` directly — approvals work even with the app backgrounded.
- High-risk requests never show Approve on the activity; they deep-link to
  `pocketclaw://session/<id>` instead (handled by expo-router).

## Architecture

- `app/` — expo-router screens (wall, session chat, approvals, overseer, settings)
- `src/state/store.ts` — zustand mirror of the host state
- `src/net/ws.ts` — reconnecting WebSocket (1s→30s backoff + jitter), parses
  `HostMessage` with the zod schemas from `@pocketclaw/shared`
- `src/net/api.ts` — REST helpers (decision / sessions / obsidian / health)
- `src/live-activity/` — TS controller; `modules/live-activity/` — Expo local
  native module (ActivityKit); `targets/widget/` — the widget extension
  (SwiftUI views + App Intents)

## Notes

- No binary image assets are checked in; the UI uses emoji + text. If you want
  a home-screen icon, add `assets/icon.png` (1024×1024) and reference it as
  `"icon": "./assets/icon.png"` in `app.json`.
- `PocketClawActivityAttributes` is intentionally duplicated in
  `modules/live-activity/ios/LiveActivityModule.swift` (app target) and
  `targets/widget/Attributes.swift` (widget target) — ActivityKit matches them
  by type name; keep both in sync.
