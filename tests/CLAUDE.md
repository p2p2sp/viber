# tests - dev-time regression suites for the plugin scripts

Owns every automated check in the repository: the per-plugin suites, the `release.sh` suite and the repo-wide static sweeps. It sits outside every plugin and never ships.

## Terms

- **Tier**: where and how often a test file runs, told by its name alone. `*.unit.test.ts` (unit) spawns nothing. `*.critical.test.ts` (critical) holds the few spawning cases every operating system runs on every push. Any other `*.test.ts` (logic) holds the rest of a script's contract and runs on Linux.
- **Critical case**: a case whose failure means lost or corrupted user work (a commit, move, delete, overwrite or push taking more than it should), an open gate (a hook letting through what it must block), a break only one platform shows (a drive-letter, backslash or MSYS path spelling, a `.cmd` shim), or a script that no longer starts (one happy path per script). Rule matrices, error wording, exit-code variants and edge spellings are logic.
- **A script's test**: the pair `<name>.test.ts` and `<name>.critical.test.ts`, with the helpers both need in `<name>-fixture.ts`. A node naming `<name>.test.ts` for a script means the pair.
- **Sweep**: a static, repo-wide test (`portability`, `orphan-tags`, `tiers`) that enumerates files and checks each against pure-function rules, instead of running a script. `portability` and `orphan-tags` read the git index, `tiers` reads the working tree.
- **SUT**: the shipped script a test file exercises, resolved once with `path.resolve(import.meta.dirname, "../../<plugin>/...")`, in the fixture when the script has one.

## Relationships

- Child nodes: `tests/harness/CLAUDE.md` (shared helpers), `tests/viber/CLAUDE.md` (viber's suite).
- Which suite a change reaches:
  - a viber script, hook, `.ts` or `.mjs` module -> its test under `tests/viber/`;
  - `.github/scripts/release.sh` -> `tests/github/release.test.ts`, a logic file with no critical sibling: the script runs only in the release workflow, on `ubuntu-latest`;
  - `.github/scripts/test-shard.ts` (the weighted split of the Windows jobs of `full.yml`) -> `tests/github/test-shard.unit.test.ts`, which also fails on a `WEIGHTS` entry naming no tracked test file;
  - `tools/agent-context.ts` (a dev command that ships with no plugin) -> `tests/tools/`: `agent-context.unit.test.ts` runs on the fake reader of `agent-context-fixture.ts`, `agent-context.critical.test.ts` runs the disk adapter `readRuns` on a temp directory;
  - any tracked `*.sh` / `*.ts` outside `tests/` and `docs/`, and every `!` preload in a `SKILL.md` -> `tests/portability.unit.test.ts` (shebang, no CRLF, `100755` exec bit when invoked without an interpreter word, quoted glob arguments in preloads, no bash-only syntax in `#!/bin/sh`, no unguarded GNU-only tools);
  - any tracked file outside `docs/` -> `tests/orphan-tags.unit.test.ts` (a line that is only `</name>` with no `<name` opener in the same file);
  - any test file added, renamed or moved between tiers -> `tests/tiers.unit.test.ts`;
  - anything under `tests/harness/` -> `tests/harness.critical.test.ts`, then every suite, since all of them import it.
- CI: `.github/workflows/ci.yml` runs every tier on `ubuntu-latest` and the unit and critical tiers on `windows-latest` and `macos-latest`, on every push and pull request. `.github/workflows/full.yml` runs every tier on Linux and Windows (5 Windows jobs, files dealt out by `.github/scripts/test-shard.ts` by measured time) with `P2P2_SHELL_MATRIX=full`, nightly, on demand and as the `Full` job `release-version.yml` waits for.

## Contracts

- Every test file imports `test` from `harness/test.ts`, never from `node:test`: cases register synchronously at load (no top-level `await` before a `test()` call) and share no mutable state, because a file's cases run concurrently.
- Tier by filename: `*.unit.test.ts` runs no shipped script (at most a read-only git query); a file that spawns a SUT is `*.critical.test.ts` or plain `*.test.ts`, by what its cases protect.
- `tests/tiers.unit.test.ts` holds every logic file to a critical sibling (a `LINUX_ONLY` entry with its reason is the one way out) and the critical tier to `CRITICAL_BUDGET` `test(` call sites, a loop counting once; the budget is raised only on purpose.
- A fixture (`<name>-fixture.ts`) holds what both tiers of one script need and no case; a helper only one tier uses stays in that tier's file.
- A case keeps full isolation in every tier: its own temp dir or repository copy, nothing shared with another case. What a tier saves is spawned scripts, never isolation.
- Every sweep rule is a pure function with a self-check that proves it fires on a synthetic bad sample; a new rule comes with its self-check, so a green run is never vacuous.
- No test reaches the network or touches this repo's working tree: a `gh` is always a `withStub`, every push goes to a local `--bare` remote, every write lands in a temp dir.
- `readerContract` in `tests/tools/agent-context-fixture.ts` is the one contract both the fake reader and the disk adapter pass: a change to the transcript reading port changes the fixture, the fake and the adapter together.
- A test whose tool is missing on `PATH` skips, never fails (`release.test.ts` skips wholesale without `jq` or `bash`).

## Commands

- One sweep or the harness proof: `node --test tests/portability.unit.test.ts`, `node --test tests/harness.critical.test.ts`.
- One case: add `--test-name-pattern "<case name>"`; each case keeps its own name inside its file's suite.
- Cases per file at once: `P2P2_TEST_CONCURRENCY` (default 4), multiplied by `--test-concurrency` (files at once).
- The shell matrix of a run: `P2P2_SHELL_MATRIX=full` (every shell for every file) or `first` (one shell everywhere); unset, a critical file takes every shell when `CI` is set and any other run takes the first.

## Traps

- `portability` and `orphan-tags` read the git index: a new, untracked script or `SKILL.md` is not checked until it is `git add`ed, and a test file renamed on disk only fails `orphan-tags` on the path the index still lists.
- A spawned script is what the suite costs, an order of magnitude more under Git Bash than on Linux: a fork inside a bash script runs tens of milliseconds there. A temp dir or a repository copy costs milliseconds, so sharing a fixture between cases buys nothing.
- A case in the logic tier never runs on macOS and runs on Windows only in `full.yml`: a case proving platform behaviour belongs in the critical file. A path-spelling case that names a file only under Git Bash (`C:\...`, `/c/...`) skips off Windows, so the Windows leg alone runs it.
- A critical case runs under every shell present in CI and under one shell locally: `CI=true` reproduces the CI matrix on a developer machine.
- `docs/` is outside the `portability` and `orphan-tags` sweeps: the archived superdev sources there are never checked.
