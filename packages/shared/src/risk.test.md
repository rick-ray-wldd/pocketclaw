# `computeRiskTier` — expected behavior table

Reviewer documentation only (not executed by a test runner). Each row is a
representative call to `computeRiskTier(tool, input)` from `src/risk.ts` and
the tier it must return.

| #  | `tool`                          | `input`                                                | Expected tier | Why |
|----|---------------------------------|--------------------------------------------------------|---------------|-----|
| 1  | `Read`                          | `{ "file_path": "/etc/hosts" }`                        | `low`         | In the low-risk allowlist; auto-allowed (but logged). |
| 2  | `Grep`                          | `{ "pattern": "TODO", "path": "src" }`                 | `low`         | Read-only search tool. |
| 3  | `WebSearch`                     | `{ "query": "zod discriminated union" }`               | `low`         | No local side effects. |
| 4  | `TodoWrite`                     | `{ "todos": [] }`                                      | `low`         | Explicitly allowlisted despite the "Write" in its name. |
| 5  | `Bash`                          | `{ "command": "ls -la" }`                              | `medium`      | Bash, but command does not match `DANGEROUS_BASH_REGEX`. |
| 6  | `Bash`                          | `{ "command": "rm -rf node_modules" }`                 | `high`        | Matches `rm\s+-rf`. |
| 7  | `Bash`                          | `{ "command": "sudo systemsetup -setremotelogin on" }` | `high`        | Matches `sudo`. |
| 8  | `Bash`                          | `{ "command": "git push --force origin main" }`        | `high`        | Matches `git\s+push\s+--force` (and `--force`). |
| 9  | `Bash`                          | `{ "command": "npm publish" }`                         | `high`        | Matches `publish`. |
| 10 | `Edit`                          | `{ "file_path": "src/app.ts", ... }`                   | `medium`      | Mutating tool, not allowlisted, not destructive-named. |
| 11 | `mcp__github__create_issue`     | `{ "title": "bug" }`                                   | `medium`      | `mcp__*` tools default to medium. |
| 12 | `mcp__filesystem__delete_file`  | `{ "path": "/tmp/x" }`                                 | `high`        | Tool name matches `/delete|remove/i`. |

Edge notes:

- `Bash` with a missing or non-string `command` falls back to `medium`
  (it still requires a human decision; never auto-allowed).
- The destructive-name check (`/delete|remove/i`) runs first, so a
  hypothetical tool named `RemoveThing` is `high` even if someone later
  adds it to the low allowlist by mistake.
- `DANGEROUS_BASH_REGEX` is case-insensitive: `SUDO reboot` is `high`.
- Live Activity rule (enforced app-side): `high` requests show only
  "Open app" — never an inline Approve button.
