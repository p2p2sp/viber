# tests - dev-time regression suites for the plugin scripts

Owns every automated check of the repository: the per-plugin suites, the `release.sh` suite and the tests of `tools/lint/`. It sits outside every plugin and never ships. The repo-wide static checks are rules of `tools/lint/`, not tests.

## Terms

- **Layer**: what a test file may touch, told by its name alone. `*.unit.test.ts` runs in process, the ports replaced by fakes. `*.integration.test.ts` runs one real adapter on the shared scene.
- **Legacy test**: a file that spawns a shell script: `*.critical.test.ts`, a plain `*.test.ts` with a critical sibling, `tests/github/release.test.ts`. It runs only in `.github/workflows/legacy.yml` until its script is ported; the harness refuses any other file with no layer marker at load.
- **Critical case**: in a legacy file, a case whose failure means lost or corrupted user work (a commit, move, delete, overwrite or push taking more than it should), an open gate (a hook letting through what it must block), a break only one platform shows (a drive-letter, backslash or MSYS path spelling, a `.cmd` shim), or a script that no longer starts (one happy path per script). Rule matrices, error wording, exit-code variants and edge spellings are logic.
- **A legacy script's test**: the pair `<name>.test.ts` and `<name>.critical.test.ts`, with the helpers both need in `<name>-fixture.ts`. A node naming `<name>.test.ts` for a script means the pair.
- **Shared scene**: the one throwaway git repository a test process builds once (`tests/harness/scene.ts`) and every integration case reads, with a second repository holding a history and a changed work tree and a scratch directory beside it for the contract cases that write.
- **SUT**: the shipped script a legacy test exercises, resolved once with `path.resolve(import.meta.dirname, "../../<plugin>/...")`, in the fixture when the script has one.

## Relationships

- Child nodes: `tests/harness/CLAUDE.md` (shared helpers), `tests/viber/CLAUDE.md` (viber's suite).
- Which suite a change reaches:
  - `viber/lib/` or an entry (`viber/scripts/*.ts`, `viber/skills/intent/scripts/summary-path.ts`, `viber/skills/code-auditor/scripts/strip-tag.ts`, `viber/skills/handoff/scripts/handoff-path.ts`, `viber/skills/e2e/scripts/qa-ledger.ts`, `viber/skills/fixer/scripts/tree-record.ts`, `viber/skills/code-auditor/scripts/diff-files.ts`, `viber/skills/code-auditor/scripts/synthesize.ts`, `viber/skills/planner/scripts/reach.ts`, `viber/skills/extension/scripts/extension.ts`, `viber/skills/code-auditor/scripts/frame.ts`, `viber/skills/skill-designer/scripts/lint_skill.ts`, `viber/skills/code-auditor/scripts/keep-units.ts`, `viber/skills/code-auditor/scripts/hunt-return.ts`, `viber/skills/rules/scripts/rules-map.ts`) -> `tests/viber/config/` and `tests/viber/lib/`, in process, and the wrapper of a ported script (`config.sh`, `switch-text.sh`, `arg-kind.sh`, `attach-lines.sh`, `summary-path.sh`, `strip-tag.sh`, `skill-part.sh`, `handoff-path.sh`, `qa-ledger.sh`, `run-changes.sh`, `tree-record.sh`, `diff-files.sh`, `run-failures.sh`, `synthesize.sh`, `reach.sh`, `extension.sh`, `frame.sh`, `lint_skill.sh`, `keep-units.sh`, `hunt-return.sh`, `rules-map.sh`) -> its legacy `tests/viber/<name>.critical.test.ts`;
  - any other viber script, hook, `.ts` or `.mjs` module -> its legacy test under `tests/viber/`;
  - `.github/scripts/release.sh` -> `tests/github/release.test.ts`, a legacy logic file with no critical sibling: the script runs only in the release workflow, on `ubuntu-latest`;
  - `tools/agent-context.ts` (a dev command that ships with no plugin) -> `tests/tools/`: `agent-context.unit.test.ts` runs on the fake reader of `agent-context-fixture.ts`, `agent-context.critical.test.ts` runs the disk adapter `readRuns` on a temp directory;
  - `tools/lint/` -> `tests/tools/lint/`; the caps, sweeps and invariants over the tree are rule instances run by `node tools/lint/run.ts` (see `tools/lint/CLAUDE.md`), not test files;
  - anything under `tests/harness/` -> `tests/harness.unit.test.ts` and `tests/harness.critical.test.ts`, then every suite, since all of them import it.
- CI: `.github/workflows/ci.yml` runs a lint job and a tests job on `ubuntu-latest`, `windows-latest` and `macos-latest` (the unit and integration files), on every push and pull request; the test step warns past 60 seconds. `.github/workflows/legacy.yml` runs the legacy tests on Linux and Windows with `P2P2_SHELL_MATRIX=full`, nightly and on demand; no push and no release waits for it. `release-version.yml` waits for the `CI` run of its commit.

## Contracts

- Every test file imports `test` from `harness/test.ts`, never from `node:test`: cases register synchronously at load (no top-level `await` before a `test()` call) and share no mutable state, because a file's cases run concurrently.
- A new test is unit or integration. The unit files of `tests/viber/config`, `tests/viber/lib` and `tests/tools/lint` touch no file or process (the `layering/core` rule); the harness throws on a network connect in any unit file. An integration file builds no repository or temp dir of its own and never writes into the repository of the shared scene: a contract case that writes does it under the scene's scratch directory, in a directory of its own name.
- `fsContract`, `gitContract` and `clockContract` (`tests/harness/ports-contract.ts`) are the one contract of each port, passed by its fake (`fakes.unit.test.ts`) and by its real adapter (`adapters.integration.test.ts`): a port change changes the contract, the fake and the adapter together. `readerContract` in `tests/tools/agent-context-fixture.ts` is the same for the transcript reading port.
- A fixture (`<name>-fixture.ts`) holds what both files of one legacy script need and no case; a helper only one file uses stays there.
- A legacy case keeps full isolation: its own temp dir or repository copy, nothing shared with another case. What a unit file saves is spawned scripts, never isolation.
- No test reaches the network or touches this repo's working tree: a `gh` is always a `withStub`, every push goes to a local `--bare` remote, every write lands in a temp dir.
- A test whose tool is missing on `PATH` skips, never fails (`release.test.ts` skips wholesale without `jq` or `bash`).

## Commands

- The harness proof: `node --test tests/harness.unit.test.ts`, `node --test tests/harness.critical.test.ts`.
- One case: add `--test-name-pattern "<case name>"`; each case keeps its own name inside its file's suite.
- Cases per file at once: `P2P2_TEST_CONCURRENCY` (default 4), multiplied by `--test-concurrency` (files at once).
- The shell matrix of a legacy run: `P2P2_SHELL_MATRIX=full` (every shell for every file) or `first` (one shell everywhere); unset, a critical file takes every shell when `CI` is set and any other run takes the first.

## Traps

- A spawned script is what a legacy suite costs, an order of magnitude more under Git Bash than on Linux: a fork inside a bash script runs tens of milliseconds there. A temp dir or a repository copy costs milliseconds, so sharing a fixture between legacy cases buys nothing.
- A legacy case never runs on a push and never on macOS: behaviour only macOS shows is proven by a unit or integration file. A path-spelling case that names a file only under Git Bash (`C:\...`, `/c/...`) skips off Windows, so the Windows leg alone runs it.
- A critical case runs under every shell present when `CI=true` and under one shell otherwise: `CI=true` reproduces the CI matrix on a developer machine.
