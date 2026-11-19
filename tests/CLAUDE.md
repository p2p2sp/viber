# tests - dev-time regression suites for the plugin scripts

Owns every automated check in the repository: the per-plugin suites, the `release.sh` suite and the repo-wide static sweeps. It sits outside every plugin and never ships.

## Terms

- **Sweep**: a static, repo-wide test (`portability`, `orphan-tags`) that enumerates files from the git index and checks each against pure-function rules, instead of running a script.
- **SUT**: the shipped script a test file exercises, resolved from the test file with `path.resolve(import.meta.dirname, "../../<plugin>/...")`.

## Relationships

- Child nodes: `tests/harness/CLAUDE.md` (shared helpers), `tests/viber/CLAUDE.md` (viber's suite).
- Which suite a change reaches:
  - a viber script, hook, `.ts` or `.mjs` module -> its file under `tests/viber/`;
  - `.github/scripts/release.sh` -> `tests/github/release.test.ts`;
  - `tools/agent-context.ts` (a dev command that ships with no plugin) -> `tests/tools/`: `agent-context.unit.test.ts` runs on the fake reader of `agent-context-fixture.ts`, `agent-context.test.ts` runs the disk adapter `readRuns` on a temp directory;
  - any tracked `*.sh` / `*.ts` outside `tests/` and `docs/`, and every `!` preload in a `SKILL.md` -> `tests/portability.unit.test.ts` (shebang, no CRLF, `100755` exec bit when invoked without an interpreter word, quoted glob arguments in preloads, no bash-only syntax in `#!/bin/sh`, no unguarded GNU-only tools);
  - any tracked file outside `docs/` -> `tests/orphan-tags.unit.test.ts` (a line that is only `</name>` with no `<name` opener in the same file);
  - anything under `tests/harness/` -> `tests/harness.test.ts`, then every suite, since all of them import it.

## Contracts

- Every test file imports `test` from `harness/test.ts`, never from `node:test`: cases register synchronously at load (no top-level `await` before a `test()` call) and share no mutable state, because a file's cases run concurrently.
- Tier by filename: `*.unit.test.ts` runs no shipped script (at most a read-only git query); a test that spawns a SUT is integration and takes plain `*.test.ts`.
- Every sweep rule is a pure function with a self-check that proves it fires on a synthetic bad sample; a new rule comes with its self-check, so a green run is never vacuous.
- No test reaches the network or touches this repo's working tree: a `gh` is always a `withStub`, every push goes to a local `--bare` remote, every write lands in a temp dir.
- `readerContract` in `tests/tools/agent-context-fixture.ts` is the one contract both the fake reader and the disk adapter pass: a change to the transcript reading port changes the fixture, the fake and the adapter together.
- A test whose tool is missing on `PATH` skips, never fails (`release.test.ts` skips wholesale without `jq` or `bash`).

## Commands

- One sweep or the harness proof: `node --test tests/portability.unit.test.ts`, `node --test tests/harness.test.ts`.
- One case: add `--test-name-pattern "<case name>"`; each case keeps its own name inside its file's suite.
- Cases per file at once: `P2P2_TEST_CONCURRENCY` (default 4), multiplied by `--test-concurrency` (files at once).

## Traps

- Sweeps read the git index: a new, untracked script or `SKILL.md` is not checked until it is `git add`ed.
- CI on push and pull request runs Linux and Windows; macOS runs only on a manual `workflow_dispatch` of the CI workflow, so a bash 3.2 regression stays green until someone dispatches it. A path-spelling case that names a file only under Git Bash (`C:\...`, `/c/...`) skips off Windows, so the Windows leg alone runs it.
- `docs/` is outside both sweeps: the archived superdev sources there are never checked.
