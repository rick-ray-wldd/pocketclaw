# Demand Evidence — the market research behind PocketClaw

Before building PocketClaw we wanted hard numbers, not vibes, for one question:
**do people actually want to drive Claude Code from their phone, with approvals
on the lock screen and nothing routed through someone else's cloud?**

This directory contains the small, reproducible pipeline we used to answer
that. Every demand-signal number in our positioning comes from a script in
`scripts/` hitting a public API, and every raw response is committed under
`data/` so anyone can audit or re-run the collection. The synthesized analysis
— incumbent traction, feature gaps, pricing benchmarks, target segment — is in
[market-evidence.md](./market-evidence.md).

## Demand-signal taxonomy

Each script answers one question in a four-part taxonomy:

| Signal | Question it answers | Script | Source API |
|---|---|---|---|
| **Incumbent traction** | Are existing "phone client for coding agents" products getting real adoption? | `collect-github-signals.mjs` | GitHub REST (`api.github.com/repos/...`) |
| **Feature-gap demand** | Within the leading incumbent (Happy), how often do users ask for exactly what PocketClaw ships — notifications, approvals, lock-screen surfaces, self-hosting? | `collect-github-signals.mjs` | GitHub issue search (`api.github.com/search/issues`) |
| **Market-size proxy** | How big is the pool of Claude Code users PocketClaw could serve, and how many already install a mobile companion? | `collect-npm-downloads.mjs` | npm registry + downloads API (`registry.npmjs.org`, `api.npmjs.org`) |
| **Community discussion volume** | Is "coding agent on my phone" a topic the broader developer community keeps raising unprompted? | `collect-hn-discussions.mjs` | Hacker News Search by Algolia (`hn.algolia.com/api/v1/search`) |

## How to re-run

Requirements: Node >= 20, network access. Zero npm dependencies (built-in
`fetch` only) — no install step.

```bash
cd research/demand-evidence/scripts
node collect-github-signals.mjs
node collect-hn-discussions.mjs
node collect-npm-downloads.mjs
```

Each script prints a human-readable summary to stdout and writes raw JSON
(with a `fetchedAt` timestamp) to `../data/snapshot-<YYYY-MM-DD>/<name>.json`.
Pass `--out <dir>` to write somewhere else:

```bash
node collect-github-signals.mjs --out /tmp/my-snapshot
```

Scripts exit non-zero with a clear message on network failure or rate
limiting — they never write partial or fabricated data.

### Rate-limit notes

- **GitHub core API**: 60 requests/hour unauthenticated. The script makes ~4
  core requests per run, so this is rarely an issue. Set `GITHUB_TOKEN`
  (optional, never required) to raise the limit to 5,000/hour.
- **GitHub search API**: 10 requests/minute unauthenticated. The script paces
  its 6 keyword searches at 1.5 s intervals to stay under this.
- **HN Algolia API**: generous public limits (10,000 requests/hour per IP);
  the script still sleeps 300 ms between queries.
- **npm APIs**: no published hard limit for these volumes; the script makes
  ~12 requests per run.

### Data ethics

- Public, documented, ToS-respecting APIs only — no scraping behind
  authentication, no paywalled content, no headless-browser harvesting.
- Only aggregate counts and already-public metadata (repo stats, issue
  titles, story titles, download totals) are collected. No personal data is
  recorded.
- Optional `GITHUB_TOKEN` is read from the environment and used solely as an
  `Authorization` header; it is never written to any output file.
- Raw responses are committed unmodified (field-filtered, never altered) so
  claims are auditable against the source.

## Key numbers — snapshot 2026-06-12

All figures below come from the committed run in
[`data/snapshot-2026-06-12/`](data/snapshot-2026-06-12/) (fetched
2026-06-12 UTC). Re-running will produce current values that may differ.

### Incumbent traction (GitHub)

| Repo | Stars | Forks | Open issues | License | Created | Last push |
|---|---:|---:|---:|---|---|---|
| [slopus/happy](https://github.com/slopus/happy) | 21,829 | 1,821 | 769 | MIT | 2025-07-18 | 2026-06-10 |
| [omnara-ai/omnara](https://github.com/omnara-ai/omnara) | 2,643 | 195 | 55 | Apache-2.0 | 2025-07-09 | 2026-01-19 |

Reading: the category leader gained ~21.8k stars in under a year — strong
evidence the product category is wanted, not niche.

### Feature-gap demand (issue keyword search in slopus/happy)

| Keyword | Matching issues & PRs¹ | Representative open issue |
|---|---:|---|
| "approve" | 73 | [#1094](https://github.com/slopus/happy/issues/1094) auto-approve tool-name matching |
| "self-host" / "self hosted" | 68 | [#246](https://github.com/slopus/happy/issues/246) "Self-hosting is thoroughly broken" |
| "notification" | 52 | [#1383](https://github.com/slopus/happy/issues/1383) push notifications not arriving when Claude needs attention |
| "lock screen" / "live activity" | 1 | [#338](https://github.com/slopus/happy/issues/338) iOS Live Activities (open feature request) |

Spot-checked pain points (both **open** at snapshot time) that directly shaped
PocketClaw's LAN-first, no-relay architecture:

- [slopus/happy#953](https://github.com/slopus/happy/issues/953) — "Self-hosted
  server missing POST /v1/sessions/:id/messages — mobile app cannot send
  messages"
- [slopus/happy#1123](https://github.com/slopus/happy/issues/1123) —
  "happy-cli: remote permission approvals get stuck loading in Claude/Codex"

¹ Counts come from the GitHub `search/issues` API, whose totals include pull
requests as well as issues.

Reading: the most demanded capabilities in the incumbent's tracker —
approvals, self-hosting, reliable notifications, Live Activities — are exactly
PocketClaw's core feature set, and several remain unresolved there.

### Market-size proxy (npm downloads)

| Package | Role | Downloads, last month | Downloads, last week |
|---|---|---:|---:|
| `@anthropic-ai/claude-code` | addressable market (every PocketClaw user runs this) | 37,858,923 | 11,059,994 |
| `happy` | incumbent CLI (slopus/happy, current name) | 14,287 | 3,540 |
| `happy-coder` | incumbent CLI (former name; deprecated rename stub) | 5,747 | 1,126 |
| `omnara` | incumbent CLI (npm package deprecated; distribution moved off npm, so counts understate usage) | 478 | 33 |

Reading: a ~38M-download/month host CLI versus ~20k/month for the leading
mobile companion suggests a large, mostly unserved market rather than a
saturated one.

### Community discussion volume (Hacker News)

| Query | Matching stories | Highest-signal story |
|---|---:|---|
| "claude code remote" | 197 | "Claude Code Remote Control" — 544 points, 313 comments (2026-02-25) |
| "claude code phone" | 159 | "What is the best way to use Claude Code from my phone?" (2025-11-02) |
| "claude code mobile" | 127 | "How I Use Claude Code on My Phone with Termux and Tailscale" (2025-10-20) |
| "ai agent approve phone" | 7 | "Show HN: Polpo – Control Claude Code (and other agents) from your phone" (2026-02-28) |

Reading: hundreds of organic stories about running Claude Code remotely —
including a 544-point front-page discussion — plus a steady stream of DIY
Termux/Tailscale/tmux workarounds, indicate developers want this badly enough
to hand-roll it. PocketClaw productizes that workaround.

## Directory layout

```
research/demand-evidence/
├── README.md                      ← this file (methodology + how to re-run)
├── market-evidence.md             ← synthesized analysis: incumbents, gaps, pricing, segment
├── scripts/
│   ├── lib.mjs                    ← shared fetch/output helpers
│   ├── collect-github-signals.mjs
│   ├── collect-hn-discussions.mjs
│   └── collect-npm-downloads.mjs
└── data/
    └── snapshot-2026-06-12/       ← committed raw output of the run above
        ├── github-signals.json
        ├── hn-discussions.json
        └── npm-downloads.json
```
