# viber/lib - the Node core of the plugin's scripts, behind four ports

Owns the Node modules holding script logic (one core per ported script, the config core under `config/`, the plan-index core under `plan-index/`, and the helpers two cores share), the port types and their real adapters. It owns no entry (`../scripts/<name>.ts`, `../skills/<skill>/scripts/<name>.ts`, `../hooks/scripts/file-guard.ts`) and no fake (`tests/harness/fakes.ts`).

## Terms

- Core: every module outside `adapters/` and `ports.ts`; it imports no file system, process, network or OS module and reaches the outside only through a port.
- Port: `Fs`, `Git` (reads only), `GitWrite` and `Clock` in `ports.ts`. No port exists for GitHub or the environment: one arrives with the first script that needs it.
- Adapter: `adapters/fs.ts` (`nodeFs`), `adapters/git.ts` (`gitCommand`), `adapters/git-write.ts` (`gitWriteCommand`) and `adapters/clock.ts` (`systemClock`); the first two map every failure to the port's empty answer (`null`, `false`, an empty list), the third answers git's exit status. `adapters/path-chunks.ts` cuts a path list for both git adapters.

## Relationships

- A core has one public `run<Name>(argv, ...)` taking only the ports it needs, called by the entry of its name with the adapters, which the `.sh` wrapper beside the entry runs. It returns stdout, stderr and the exit code, except `runConfig`, `runSwitchText`, `runHandoffPath`, `runExtension`, `runFrame` and `runCommitContext` (the whole stdout), `runFileGuard` (the stdout of the hook, from the payload text in place of an argv) and `runStripTag` (nothing).
- The path its entry was started by (`process.argv[1]`) is an argument of `runPlanBuild`, `runPlanIndex`, `runQaLedger`, `runFrame`, `runKeepUnits`, `runHuntReturn`, `runRulesMap`, `runMemoryMap` and `runCommitContext`: `rootAbove(script, levels)` of `plugin-root.ts` cuts the skill directory or the plugin root from it.
- One core calls another in process, never through a shell: `runConfig` (`config/run.ts`, the one public entry of the config core, which never throws) serves `switch-text.ts`, `run-failures.ts` and `rules-map.ts` (the archive directory), `extension.ts` (its `LISTED` and `MISSING` values, the map found with `mapClassifier` of `config/lines.ts`), `plan-build.ts` (`build.memory`) and `plan-index/run.ts`; `archive-run.ts` takes the two directory keys from `config/lines.ts` and `directory` of `config/block.ts`. `runSwitchText` serves `skill-part.ts` (each fragment block, with `pluginRootOf`), `runDiffFiles` serves `frame.ts` (the diff scope), `runStripTag` serves `keep-units.ts`, `hunt-return.ts` and `plan-build.ts` (every agent file, before it is read).
- `hunt-brief.ts` holds what `keep-units.ts` and `hunt-return.ts` share (the run, the unit and seed lines, the ledger append, the hunter block) and reads run.md through `headerValue` of `run-header.ts`; `commit-args.ts` `readSelector` reads the selector of `commit.ts` and `commit-context.ts`.
- `map-answer.ts` (the answer type, `answer`, `fail`, `projectRoot`, `baseOf`) serves `rules-map.ts`, `memory-map.ts`, `merge-settings.ts`, `commit.ts`, `archive-run.ts`, `worktree.ts`, `task-ready.ts`, `run-notes.ts` and `plan-index/`.
- Path helpers: `abs-path.ts` `absolutePath(path, cwd)` spells a path one way, as text; `drive-path.ts` `drivePath(path, root)` reads an MSYS path as its drive path; `repo-prefix.ts` `repoPrefix(dir, root, fs)` places a directory below the repository root, and `root-relative.ts` `rootRelative(path, root, fs)` folds an absolute path below it.
- Other helpers: `stamp.ts` `stampOf(at)` is the file name stamp of the summary and handoff files, the reach candidates file and the map ids; `byte-order.ts` `byteOrder(a, b)` sorts every printed list of paths and names. A helper gets a module of its own once a second core needs it.
- `tools/lint/run.ts` reads its tree through the same adapters.
- Tests: `tests/viber/config/<module>.unit.test.ts` per config module, `tests/viber/lib/<module>.unit.test.ts` per module outside `config/` (`plan-index/<module>` below it) (the `layering/core` rule holds both), `tests/viber/lib/fakes.unit.test.ts` and `tests/viber/lib/adapters.integration.test.ts`.

## Contracts

- The contract of a core (argv, every printed line, exit codes) lives in the header of its entry; a core's own header only points there.
- The key grammar of `.claude/viber.yml` and every stdout line live in the header of `../scripts/config.ts`; the modules of `config/` split it: `lines` (groups and children), `block`, `extensions`, `branching`, `reports`, `local`.
- A fake and its adapter pass the same contract cases (`fsContract`, `gitContract`, `gitWriteContract`, `clockContract` in `tests/harness/ports-contract.ts`).
- The core reads the local-time fields of `Clock.now()`: a unit test builds its instant from local fields (`new Date(2026, 10, 24, 17, 14, 16)`), so it holds in every time zone.

## Change together

- A port method: `ports.ts`, its adapter, its fake in `tests/harness/fakes.ts` and the contract cases with their scene state.
- A config key or report line: the header of `../scripts/config.ts` and the module that resolves it, with its unit test.
- A switch key: the `KEYS` set of `switch-text.ts`, the header of `../scripts/switch-text.ts` and the switch table of `tools/lint/data/invocations.ts`.
- An entry under `../skills/<skill>/scripts/` or `../hooks/scripts/`: its path in the `entries` list of `tools/lint/data/layering.ts`, named whole.
- A new core module: the unit test of its name, which `layering/core` demands once the module is in the git index.

## Traps

- The fake file system matches a path as text: a core makes an argument absolute and drops `.`, `..`, doubled and trailing slashes itself (`absolutePath`) before it asks a port, and a core that prints a path it looked up does the same.
- `absolutePath` resolves `..` as text, before any symlink is followed: `link/../x` names the sibling of the link, not of the directory it points to. A core that hands a path to `Fs` as written (`..` and `./` kept) lets the system follow a link before a `..` after it: `runSwitchText` (its skill directory, resolved against the process cwd when relative), `runStripTag`, `runSkillPart` (its part file), `runHandoffPath` (its `.md` target), `runSynthesize`, `runKeepUnits` and `runHuntReturn` (the workspace and the lens file `run.md` names), `runRunFailures` (a relative run directory joined to the root) and `runPlanBuild` (every file path of its arguments).
- A `/c/...` argument never reaches a core under Git Bash: the MSYS runtime hands node `C:/...`, so no core holds an MSYS rule for an argument that is one path, and every path a core prints from one (a `refs:`, `plan:`, `scope:` or `RUN:` line, a skill or plugin path) reads `C:/...` whichever spelling invoked the wrapper. The runtime converts an argument that is one path, never a path inside a list or inside a file: `readSelector`, `plan-index/scope.ts`, `task-ready.ts` and `file-guard.ts` read `/c/...` as `C:/...` themselves (`drivePath`). It converts the argument `/` to the directory Git is installed in, so `worktree.sh` refuses it before node.
- `byteOrder` orders by code point, the order of the UTF-8 bytes `LC_ALL=C sort` gave: the default sort of a string array differs from it for a character past U+FFFF against one of U+E000..U+FFFF.
- `runSynthesize`, `runRunFailures`, `runPlanBuild` and `plan-index/` read every file as UTF-8 text and write what they read back as UTF-8: a byte that is no valid UTF-8 in a report, a hit line or the plan reaches `findings.md`, `failures.md`, the candidates file, the plan file or a task file as U+FFFD. The code-auditor ledger alone is appended to as bytes.
- `Fs.exists` is true for a directory: a directory named `<name>.md` under `.claude/agents/` counts as a found extension agent.

## Sections

- Read `CLAUDE.ports.md` before changing a port method, an adapter or a fake, or relying on what a port answers for a missing, linked or unreadable path.
- Read `CLAUDE.plan-cores.md` before editing `plan-build.ts`, `plan-text.ts`, `plan-graph.ts`, `reach.ts`, a `plan-index/` module, `task-ready.ts`, `run-notes.ts`, `file-guard.ts` or `archive-run.ts`.
- Read `CLAUDE.core-traps.md` before editing the core of the config, a code-auditor script, the memory or rules map, the commit, settings, extension, QA ledger or skill lint script.
