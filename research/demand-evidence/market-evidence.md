# The Market Evidence Behind PocketClaw

This document is the demand research behind PocketClaw: why a phone-side command center for
Claude Code is worth building, who pays for tools like it today, and what the incumbents still
lack. Every number below was collected from a live API or web page on **2026-06-12** and is
cited with its source URL. Nothing is extrapolated from memory; where a figure could not be
verified, we say so. The collection steps are scripted and re-runnable (see
[Reproducibility](#6-reproducibility)).

---

## 1. The problem

Coding agents like Claude Code run as long-lived processes bound to a workstation, while their
human supervisor is increasingly on a phone. Supervising an agent over mobile SSH breaks down in
three structural ways — none of them fixable by "a better SSH app":

1. **Sessions die with the connection.** iOS suspends apps shortly after they leave the
   foreground: a backgrounded app gets about five seconds in its app-delegate callback, and any
   longer work requires explicitly requested, time-limited background tasks before the system
   suspends it ([Apple: "Extending your app's background execution
   time"](https://developer.apple.com/documentation/uikit/extending-your-app-s-background-execution-time),
   accessed 2026-06-12). Once a terminal app is suspended, the TCP connection drops, the remote
   TTY hangs up, and any agent session attached to that TTY dies with it — unless the user has
   manually set up `tmux` or `mosh`, which are not installed by default on macOS or most Linux
   distros.
2. **No proactive progress signal.** A terminal app has no push channel. The agent may finish a
   20-minute task — or stall on a question — and the only way to find out is to reconnect, reattach,
   and read the screen.
3. **Permission approvals demand presence.** Claude Code's tool-permission prompts are answered
   `y/n` inside the TUI. Each approval requires a live connection, an unlocked phone, and a
   foreground app switch — for a decision that is often a single tap's worth of information.

The result is a supervision loop with high latency and high friction precisely when agent
workflows are getting longer and more autonomous. This is the gap PocketClaw targets.

## 2. Incumbent traction as demand proof

The clearest evidence that this problem is real and widely felt: people already build, star,
fund, and ship products for it.

| Project | Traction (verified 2026-06-12) | What it shows |
|---|---|---|
| [slopus/happy](https://github.com/slopus/happy) | **21,829 stars**, 1,821 forks, MIT; created 2025-07-18, last push 2026-06-10 | A phone-first Claude Code client gathered ~22k stars in under a year — large, fast-growing demand for exactly this workflow |
| [omnara-ai/omnara](https://github.com/omnara-ai/omnara) | **2,643 stars**, Apache-2.0, Y Combinator S25 | Investors funded a company whose entire product is mobile agent supervision |
| [Claude Code Remote Control](https://code.claude.com/docs/en/remote-control) (Anthropic, official) | Research preview, available on Pro/Max/Team/Enterprise; mobile push notifications since CLI v2.1.110 | First-party validation: the vendor itself now ships a phone-control surface for local sessions |

Sources: GitHub REST API (`api.github.com/repos/slopus/happy`,
`api.github.com/repos/omnara-ai/omnara`), accessed 2026-06-12; Claude Code docs
(`code.claude.com/docs/en/remote-control`), accessed 2026-06-12.

## 3. Feature-gap evidence

Traction proves demand; open issues and missing features prove the demand is not yet satisfied.
Both issues below were verified live against the GitHub API on 2026-06-12:

| Issue | Title (verbatim) | State | Gap it evidences |
|---|---|---|---|
| [slopus/happy#953](https://github.com/slopus/happy/issues/953) | "Self-hosted server missing POST /v1/sessions/:id/messages — mobile app cannot send messages" | open (since 2026-03-31) | Self-hosting friction: users who want their agent traffic off third-party relays hit a wall |
| [slopus/happy#1123](https://github.com/slopus/happy/issues/1123) | "happy-cli: remote permission approvals get stuck loading in Claude/Codex" | open (since 2026-04-17) | The approval flow — the core supervision interaction — is still unreliable in the leading incumbent |

Reading the incumbents' source and docs surfaces further gaps that no player currently covers:

- **Happy's push notifications are plain title+body** — no iOS notification-category action
  buttons, no Live Activity / Dynamic Island surface. Approving still means unlocking the phone
  and opening the app. (Verified by inspecting Happy's MIT-licensed source: the Expo push
  payload is assembled without `categoryId` or any ActivityKit integration.)
- **Happy's "remember this permission" lives only inside a single query** — decisions don't
  persist across sessions, so users re-approve the same tools daily.
- **Official Remote Control** routes everything through Anthropic's API, notifications are
  "Claude decides when to push" with no per-event configuration, taps open the app rather than
  resolving an approval, the local terminal process must stay alive, and a ~10-minute network
  outage kills the session ([docs](https://code.claude.com/docs/en/remote-control), accessed
  2026-06-12).

Lock-screen / Dynamic Island one-tap approvals, risk-tiered approval policy, and a fully
self-hosted (no relay) topology are the whitespace PocketClaw occupies.

## 4. Pricing benchmarks: what this segment already pays

Willingness to pay is best read from prices people pay today. All prices in USD, verified
2026-06-12:

| Product | Price | Source | What it proves |
|---|---|---|---|
| Omnara Pro (agent supervision) | **$9/mo** (free tier: up to 10 agents/mo) | [scriptbyai.com review](https://www.scriptbyai.com/ai-agent-monitor-omnara/)* | A direct comparable already charges ~$10/mo for agent monitoring alone |
| Termius Pro (mobile SSH — the workaround tool) | **$10/mo** billed annually | [termius.com/pricing](https://termius.com/pricing) | Developers already pay $10/mo just for a nicer version of the *broken* workflow |
| Tailscale Personal | **$0** (free up to 6 users) | [tailscale.com/pricing](https://tailscale.com/pricing) | PocketClaw's transport layer costs the target user nothing |
| Claude Pro | **$20/mo** ($17/mo annual) | [claude.com/pricing](https://www.claude.com/pricing) | Entry price of the segment |
| Claude Max | **$100/mo** (5x) / **$200/mo** (20x) | [claude.com/pricing](https://www.claude.com/pricing); [support.claude.com](https://support.claude.com/en/articles/11049741-what-is-the-max-plan) | Heavy Claude Code users routinely pay $100–200/mo; a supervision layer is a small add-on against that spend |
| GitHub Copilot Pro / Pro+ | **$10/mo** / **$39/mo** | [github.com/features/copilot/plans](https://github.com/features/copilot/plans) | Baseline of normalized monthly AI-tool spend among professional developers |

\* Omnara's official pricing page ([omnara.com/pricing](https://www.omnara.com/pricing)) renders
client-side only and returned no machine-readable pricing when fetched on 2026-06-12, so the $9/mo
figure is cited from a third-party review rather than first-party copy.

**Read-through:** the target user already spends $20–$200+/month on the agent itself, and the
market has validated $9–$10/month price points for supervision (Omnara) and for the inferior
SSH workaround (Termius). A $5–10/month supervision layer — or a free OSS core with paid
convenience (App Store build, managed pairing) — sits comfortably inside demonstrated
willingness to pay.

## 5. Target segment

**Who:** professional developers who already pay for Claude Pro/Max (or API access) and run
long-lived Claude Code sessions on an always-on home or office machine, supervising from a phone.

**Size proxies (verified 2026-06-12, labeled as estimates):**

- `@anthropic-ai/claude-code` on npm: **11,059,994 downloads in the week 2026-06-05 → 2026-06-11**
  and **37,858,923 in the trailing month**
  ([api.npmjs.org](https://api.npmjs.org/downloads/point/last-week/@anthropic-ai/claude-code)).
  Downloads overcount users (CI, auto-updates), but eight-figure monthly volume puts the active
  Claude Code installed base plausibly in the hundreds of thousands to low millions — an estimate,
  not a measurement.
- **21,829 GitHub stars on slopus/happy** is a *lower bound* on developers motivated enough to
  star a phone-supervision client; its 1,821 forks suggest a meaningful self-host/tinkerer tail —
  exactly PocketClaw's beachhead.
- Anthropic's Remote Control requires a claude.ai subscription (API keys unsupported), confirming
  that the mobile-supervision audience and the paying-subscriber base are the same population.

Even capturing a low single-digit percentage of the Happy-star population as engaged users would
constitute a healthy early OSS community; conversion math beyond that is deliberately out of
scope for this document.

## 6. Reproducibility

Every demand-signal number above (GitHub repo stats, issue searches, Hacker News story counts,
npm downloads) can be re-collected with the scripts in this directory — see
[./README.md](./README.md) and [./scripts/](./scripts/) for one-command re-runs and sample output
data. The pricing benchmarks in §4 are manual web citations rather than script output; each
carries its source URL and access date so it can be re-checked by hand.
