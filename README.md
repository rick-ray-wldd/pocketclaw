# PocketClaw

> **Your Claude Code sessions, in your pocket — approve, steer, and oversee agents from the Dynamic Island, over your own tailnet.**

PocketClaw is a pocket command center for [Claude Code](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code): an Expo iOS app paired with a Mac-side host daemon that drives Claude Agent SDK sessions. No cloud relay, no third-party servers — everything stays on your machines.

[繁體中文版說明在下方](#pocketclaw-繁體中文)

---

## Features

Four things you won't find elsewhere:

1. **Dynamic Island Live Activity with one-tap Approve** — running sessions show live progress in the Dynamic Island / Lock Screen. Medium-risk permission requests can be approved with a single tap, *without unlocking your phone*. High-risk requests deliberately **cannot** — they only offer "Open app" (security by design).
2. **Workspace-alias fast switching** — register project folders once (`pocketclaw workspace add blog ~/code/blog`), then spawn sessions from your phone by alias in two taps.
3. **The Overseer** — a meta-Claude session that digests *all* running sessions. Ask it "what's everyone doing?" or "which session is stuck?" and get a cross-session answer.
4. **Obsidian daily logs** — every session is journaled into your Obsidian vault (`PocketClaw/Daily/YYYY-MM-DD.md`) with Dataview-friendly frontmatter. Your agent history becomes part of your notes.

Plus the basics: session list with live status, full transcript streaming, kill switch, cost tracking, and an append-only audit log of every permission decision.

## Architecture

```
            ┌─────────────────────┐
            │   iPhone (Expo app) │
            │  ┌───────────────┐  │
            │  │ Live Activity │  │  App Intent (Approve / Deny)
            │  │ Dynamic Island│──┼────────────────────┐
            │  └───────────────┘  │                    │
            └─────────┬───────────┘                    │
                      │ WebSocket (events, input,      │ REST
                      │ decisions) + REST (polls)      │ POST /api/decision
                      │                                │ (medium-risk only)
        ══════════════╪═══ Tailscale tailnet ══════════╪══════════════
                      │   (private, token-authed)      │
            ┌─────────▼────────────────────────────────▼──────┐
            │           Mac host daemon (@pocketclaw/host)    │
            │   ws://host:8787/ws?token=…   /api/* (Bearer)   │
            │  ┌───────────┐ ┌───────────┐ ┌───────────────┐  │
            │  │ session 1 │ │ session 2 │ │  Overseer     │  │
            │  │ (Agent SDK│ │ (Agent SDK│ │  (meta-Claude)│  │
            │  └─────┬─────┘ └─────┬─────┘ └───────────────┘  │
            │        └──────┬──────┘                          │
            │               ▼                                 │
            │        risk tiers + audit.jsonl                 │
            └───────────────┬─────────────────────────────────┘
                            ▼
                  ┌───────────────────┐
                  │  Obsidian vault   │
                  │  PocketClaw/Daily │
                  │  PocketClaw/Sess… │
                  └───────────────────┘
```

The Live Activity's Approve button is an iOS **App Intent** that calls `POST /api/decision` directly over the tailnet — no app launch needed for medium-risk approvals.

## Quick Start

### 1. Host (Mac)

Requires Node >= 20 and a working `claude` login (Claude Code installed and authenticated).

`@pocketclaw/host` is **not yet published to npm** — install from source:

```bash
# clone and build
git clone https://github.com/rick-ray-wldd/pocketclaw.git
cd pocketclaw
npm install
npm run build

# the CLI is packages/host/dist/cli.js — alias it so the commands below work verbatim
alias pocketclaw="node $(pwd)/packages/host/dist/cli.js"

# one-time setup: generates a bearer token in ~/.pocketclaw/config.json
pocketclaw init

# register workspaces by alias
pocketclaw workspace add blog ~/code/blog
pocketclaw workspace add thesis ~/Documents/thesis

# start the daemon (binds 0.0.0.0:8787 — keep it inside your tailnet)
pocketclaw serve
```

`pocketclaw serve` prints a **pairing QR code** containing `{ host, port, token }`.

> Tip: from the repo root, `npm run host` starts the daemon directly in dev mode (no build step, via `tsx`).

### 2. App (iPhone)

PocketClaw uses native modules (Live Activities), so it needs a **dev build**, not Expo Go:

```bash
cd packages/app
npm install
npx expo prebuild -p ios
npx expo run:ios --device        # or: eas build --profile development -p ios
```

### 3. Pair

1. Make sure both devices are on the same Tailscale tailnet (or LAN).
2. Open the app → **Scan QR** → point at the QR from `pocketclaw serve`.
3. The session list appears. Tap **+** → pick a workspace alias → type a prompt → go.

## Security model

PocketClaw is **transport-private by default**: it is designed to run over a [Tailscale](https://tailscale.com) tailnet. The host binds a token-authed port and never talks to any third-party relay.

- **Token auth** — a random bearer token generated at `pocketclaw init`, stored in `~/.pocketclaw/config.json`, required on every WS connect and REST call. Compared in constant time.
- **Default-deny timeout** — unanswered permission requests are **denied** after a timeout. Silence never grants access.
- **Risk tiers** — every tool call is classified host-side:

  | Tier | Examples | Behavior |
  |---|---|---|
  | `low` | Read, Grep, Glob, WebSearch, TodoWrite, Task, NotebookRead | Auto-allowed silently, but logged |
  | `medium` | Edit, Write, non-dangerous Bash, WebFetch, `mcp__*` | Requires a decision; **approvable from the Live Activity** |
  | `high` | Bash matching `rm -rf`, `sudo`, `git push --force`, `mkfs`, `shutdown`, deploy/publish, writes to `/dev`; tools matching `delete`/`remove` | Requires a decision; Live Activity shows **"Open app" only** — never an Approve button |

- **High-risk is never approvable from the lock screen.** A destructive command should always require you to unlock the phone, open the app, and read the full input.
- **Audit log** — every permission request and decision (including auto-allows and timeouts) is appended to `~/.pocketclaw/audit.jsonl`.

Full threat model: [docs/security.md](./docs/security.md).

## Why PocketClaw? (market research)

PocketClaw wasn't built on a hunch. Before writing code, we measured demand for a phone-first Claude Code client: the traction of incumbent mobile clients, the feature gaps users actually file issues about, and the pricing benchmarks of comparable developer tooling. All of that evidence — data snapshots, the [market-evidence analysis](./research/demand-evidence/market-evidence.md), and the collection scripts — lives in [research/demand-evidence](./research/demand-evidence/). Every demand-signal number (GitHub, Hacker News, npm) is reproducible by running the scripts against public APIs; pricing benchmarks are manual citations, each with its source URL and access date.

## Documentation

- [Wire protocol v0](./docs/protocol.md)
- [Security & threat model](./docs/security.md)
- [Obsidian vault integration](./docs/obsidian.md)
- [Shipping the app to the App Store](./docs/app-store.md)
- [Research: market evidence](./research/demand-evidence/market-evidence.md) — demand analysis, data snapshots + [reproducible collection scripts](./research/demand-evidence/)
- [Contributing](./CONTRIBUTING.md)

## Roadmap

- [ ] Android app (Live Activity equivalent via ongoing notifications)
- [ ] End-to-end encryption on top of the tailnet (multi-user threat model)
- [ ] Session resume / fork from the phone
- [ ] Voice input → prompt (on-device dictation)
- [ ] Overseer scheduled digests pushed as notifications
- [ ] watchOS complication for session status
- [ ] Configurable risk-tier rules (per-workspace overrides)

## Acknowledgements & prior art

- **[Happy](https://github.com/slopus/happy)** by the slopus contributors (MIT) — the project that proved a phone-first Claude Code client is a great idea. **PocketClaw is an independent implementation, not a fork**: no source code was copied, but Happy's architecture (mobile client ↔ daemon ↔ Claude Code sessions) was a direct inspiration. See [NOTICE.md](./NOTICE.md).
- **Anthropic** — [Claude Code Remote Control](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code) and the [Claude Agent SDK](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/sdk) documentation. PocketClaw is not affiliated with or endorsed by Anthropic.

---

# PocketClaw（繁體中文）

> **把 Claude Code 裝進口袋 — 在動態島一鍵核准、隨時掌控、總覽所有 agent，全程走自己的 tailnet。**

PocketClaw 是 Claude Code 的口袋指揮中心：一個 Expo iOS App 搭配 Mac 端的 host daemon（透過 Claude Agent SDK 驅動 sessions）。沒有雲端中繼、沒有第三方伺服器 — 所有流量都留在你自己的裝置之間。

## 特色

1. **動態島 Live Activity 一鍵核准** — 進行中的 session 即時顯示在動態島／鎖定畫面。中風險的權限請求可以**不解鎖手機**直接一鍵核准；高風險請求刻意**不提供**核准按鈕，只能「開啟 App」（安全優先的設計）。
2. **Workspace 別名快速切換** — 在 Mac 上註冊一次專案資料夾（`pocketclaw workspace add blog ~/code/blog`），之後在手機上用別名兩下就能開新 session。
3. **Overseer 總管** — 一個 meta-Claude session，消化所有進行中的 session。問它「大家都在做什麼？」「哪個 session 卡住了？」就能得到跨 session 的整合答案。
4. **Obsidian 每日日誌** — 每個 session 自動寫入你的 Obsidian vault（`PocketClaw/Daily/YYYY-MM-DD.md`），附帶 Dataview 友善的 frontmatter。Agent 的工作紀錄直接成為你筆記的一部分。

另外還有：session 清單與即時狀態、完整逐字稿串流、kill 開關、成本追蹤，以及所有權限決策的 append-only 稽核紀錄。

## 快速開始

### Host（Mac）

需要 Node >= 20，且 `claude`（Claude Code）已安裝並登入。

`@pocketclaw/host` 尚未發佈到 npm，請從原始碼安裝：

```bash
git clone https://github.com/rick-ray-wldd/pocketclaw.git
cd pocketclaw
npm install && npm run build                 # 從原始碼建置
alias pocketclaw="node $(pwd)/packages/host/dist/cli.js"

pocketclaw init                              # 產生 ~/.pocketclaw/config.json 與 token
pocketclaw workspace add blog ~/code/blog    # 註冊 workspace 別名
pocketclaw serve                             # 啟動 daemon，會印出配對 QR code
```

> 提示：在 repo 根目錄執行 `npm run host` 可直接以 dev 模式（`tsx`，免建置）啟動 daemon。

### App（iPhone）

因為用到原生模組（Live Activities），需要 dev build，不能用 Expo Go：

```bash
cd packages/app
npm install
npx expo prebuild -p ios
npx expo run:ios --device
```

### 配對

1. 確認兩台裝置在同一個 Tailscale tailnet（或同一個區網）。
2. 打開 App → 掃描 `pocketclaw serve` 印出的 QR code。
3. 看到 session 清單後，點 **+** → 選 workspace 別名 → 輸入 prompt → 開始。

## 安全模型

PocketClaw 預設**傳輸層私有**：設計上跑在 Tailscale tailnet 內，host 只開一個需要 token 驗證的 port，完全不經過第三方中繼。

- **Token 驗證** — `pocketclaw init` 產生隨機 bearer token，每個 WS 連線與 REST 請求都必須帶上，以常數時間比較驗證。
- **逾時即拒絕（default-deny）** — 權限請求逾時未回應就自動拒絕，沉默永遠不等於同意。
- **風險分級** — `low` 自動放行（但記錄）；`medium` 需要決策、可從 Live Activity 核准；`high` 需要決策、**永遠不能**從鎖定畫面核准。
- **稽核紀錄** — 所有權限請求與決策都附加到 `~/.pocketclaw/audit.jsonl`。

完整威脅模型請見 [docs/security.md](./docs/security.md)。

**市場研究** — 為什麼做 PocketClaw？需求證據（同類工具的市場熱度、功能缺口、定價基準）與可重現的資料收集腳本，請見 [research/demand-evidence](./research/demand-evidence/)。

## 致謝與前人作品

- **[Happy](https://github.com/slopus/happy)**（slopus contributors，MIT）— 證明了「手機優先的 Claude Code 客戶端」是個好主意。**PocketClaw 是獨立實作，不是 fork**：沒有複製任何原始碼，但 Happy 的架構是直接的靈感來源。詳見 [NOTICE.md](./NOTICE.md)。
- **Anthropic** — Claude Code Remote Control 與 Claude Agent SDK 文件。PocketClaw 與 Anthropic 無任何隸屬或背書關係。

---

## License

MIT © 2026 Rick Ray (rick-ray-wldd) and PocketClaw contributors. See [LICENSE](./LICENSE) and [NOTICE.md](./NOTICE.md).
