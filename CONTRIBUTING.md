# Contributing to PocketClaw

Thanks for considering a contribution! This document is intentionally short.

## Monorepo layout

```
pocketclaw/
├── packages/
│   ├── shared/   # @pocketclaw/shared — zod schemas, risk tiers (single source of truth)
│   ├── host/     # @pocketclaw/host   — Mac daemon, CLI, WS/REST server
│   └── app/      # pocketclaw-app    — Expo iOS app + Live Activity widget
├── docs/         # protocol, security, obsidian, app-store
└── .github/      # CI
```

- **npm workspaces** — run `npm install` once at the repo root.
- Node >= 20. TypeScript strict everywhere. `shared` and `host` are ESM (`"type": "module"`).
- Protocol types live in `@pocketclaw/shared` only. If you change the wire protocol,
  update `docs/protocol.md` in the same PR.

## Development

```bash
npm install
npm run typecheck        # all workspaces — must pass before any PR
npm run host             # run the host daemon in dev mode
npm run app              # start the Expo app
```

## Commits

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(host): add workspace remove command
fix(app): reconnect WS after backgrounding
docs: clarify risk tier table
```

Scopes: `host`, `app`, `shared`, `docs`, `ci`.

## Pull requests

1. One logical change per PR; keep diffs small.
2. `npm run typecheck` must pass (CI enforces this).
3. Protocol changes require updating `packages/shared` zod schemas **and** `docs/protocol.md`.
4. Security-relevant changes (auth, risk tiers, permission flow) need an explicit
   note in the PR description explaining the threat-model impact.
5. No copied code from other projects. Adapted non-trivial patterns must carry an
   attribution comment (see `NOTICE.md`).

## Code of conduct

Be kind, assume good faith, and keep discussions about code — not people.

## License

By contributing, you agree your contributions are licensed under the MIT License.
