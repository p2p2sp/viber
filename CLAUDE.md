# P2P2 Claude Code plugins

> All files in English

Source of the `viber` Claude Code plugin, listed as the `p2p2` marketplace by `.claude-plugin/marketplace.json`; the artifacts are markdown, JSON manifests and bundled scripts.

## Owner strict rules
- Always in English: every CLAUDE.md, script, skill, agent and reference.
- Every plugin script MUST work on Windows (Git Bash) and MacOS.
- Do not use `heredoc` - it is unreliable.
- Do not use `red` color in agents (only arbiter allowed).
- Present state only: every CLAUDE.md, README, help page and `.claude/rules/` file says what holds now, never a change history (what changed, was renamed, replaced or used to hold): git keeps that.
- Tokens are a design constraint: every token a skill, agent or reference makes a model read counts against the user's Claude Code usage limits (5-hour and weekly), and an agent holding too many instructions at once drifts. Prefer the design that makes a model read and re-read less.

## Commands

- Fast (unit layer only): `node --test "tests/**/*.unit.test.ts"`
- Whole suite (unit and integration, what `ci.yml` runs on Linux, Windows and macOS on every push): `node --test "tests/**/*.unit.test.ts" "tests/**/*.integration.test.ts"`
- Lint rules (a step of the `ci.yml` lint job): `node tools/lint/run.ts`
- Single test file: `node --test tests/viber/config/block.unit.test.ts`

## Test layers

- `*.unit.test.ts`: runs in process on fakes, spawns nothing.
- `*.integration.test.ts`: runs one real adapter on the shared scene.
- Legacy (`*.critical.test.ts`, a plain `*.test.ts` with a critical sibling, `tests/github/release.test.ts`): spawns a shell script and runs only in `.github/workflows/legacy.yml`, on Linux and Windows, nightly and on demand; no push and no release waits for it. Name one file to debug it, never run the whole set locally.

## Traps

- Nothing builds: editing markdown or JSON is shipping. There is no `package.json`; `node --test` runs the `.ts` tests directly through Node's type stripping.
- `tsc --noEmit` runs only in the `ci.yml` lint job, which installs `typescript` and `@types/node` for itself. Locally `tsconfig.json` serves the editor: its `"types": ["node"]` resolves from a git-ignored `node_modules/@types/node`, so a fresh clone shows TS2688 until that package is installed by hand. `viber/hooks/register.tsx` stays out of `include`: its `claude-code` types exist only in the host.
- Editing a file here does not change the plugins loaded in the current session: they change only after a release is published and reinstalled.
- Every plugin script must work on Windows (Git Bash) and macOS: the `script-portability/shipped` lint rule sweeps shebangs, CRLF, bash-only syntax in `#!/bin/sh` scripts and GNU-only tool forms.
- `docs/archive/superdev/` is a retired plugin kept for reference: not listed, not released, not tested.
