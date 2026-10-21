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

- Whole test suite (both tiers, as CI runs it): `CI=true node --test --test-concurrency=12 "tests/**/*.test.ts"`
- Single test file: `node --test tests/viber/config.test.ts`
- Fast (unit tier only): `node --test "tests/**/*.unit.test.ts"`

## Test layers

- `*.unit.test.ts`: unit tier, the only one a developer machine runs.
- Every other `*.test.ts` under `tests/`: integration tier, run in CI only.

## Traps

- Nothing builds and nothing lints: editing markdown or JSON is shipping. There is no `package.json`; `node --test` runs the `.ts` tests directly through Node's type stripping.
- Editing a file here does not change the plugins loaded in the current session: they change only after a release is published and reinstalled.
- Every plugin script must work on Windows (Git Bash) and macOS: `tests/portability.unit.test.ts` sweeps shebangs, CRLF, exec bits and bash-only syntax in `#!/bin/sh` scripts.
- `docs/archive/superdev/` is a retired plugin kept for reference: not listed, not released, not tested.
