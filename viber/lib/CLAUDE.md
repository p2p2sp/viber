# viber/lib - the Node core of the plugin's scripts, behind three ports

Owns the Node modules holding script logic (the config core under `config/`, `arg-kind.ts`, `switch-text.ts`, `attach-lines.ts`, `summary-path.ts`, `strip-tag.ts`, `skill-part.ts`, `handoff-path.ts`, `qa-ledger.ts`, `run-changes.ts`, `tree-record.ts`, `diff-files.ts`, and the helpers two of them share, `abs-path.ts`, `stamp.ts`, `byte-order.ts` and `repo-prefix.ts`), the port types and their real adapters. It owns no entry (`../scripts/<name>.ts`, `../skills/<skill>/scripts/<name>.ts`) and no fake (`tests/harness/fakes.ts`).

## Terms

- Core: every module outside `adapters/` and `ports.ts`; it imports no file system, process, network or OS module and reaches the outside only through a port.
- Port: `Fs` (reads `readText`, `readBytes`, `exists`, `kind`, `realPath`, `listDir`; writes `makeDir`, `writeBytes`), `Git` (`repoRoot`, `trackedFiles`, `branch`, `commit`, `symbolicRef`, `mergeBase`, `firstAdded`, `changedFiles`, `untrackedFiles`, `status`, all reads) and `Clock` (`now`) in `ports.ts`. The ports for GitHub and the environment arrive with the first script that needs them.
- Adapter: `adapters/fs.ts` (`nodeFs`), `adapters/git.ts` (`gitCommand`) and `adapters/clock.ts` (`systemClock`); the first two map every failure to the port's empty answer (`null`, `false`, an empty list).

## Relationships

- `config/run.ts` `runConfig(argv, cwd, ports)` is the one public entry of the config core: it returns the whole stdout and never throws. `../scripts/config.ts` calls it with the adapters and prints; `../scripts/config.sh` runs that entry.
- `arg-kind.ts` `runArgKind(argv)` touches no port and returns stdout, stderr and the exit code; `switch-text.ts` `runSwitchText(argv, cwd, ports)` takes its value from `runConfig` and returns the whole stdout. Each has its entry `../scripts/<name>.ts`, run by the wrapper `../scripts/<name>.sh`.
- `attach-lines.ts` `runAttachLines(argv, cwd, ports)` (`Fs`, `Git`) and `summary-path.ts` `runSummaryPath(argv, cwd, ports)` (`Fs`, `Git`, `Clock`) return stdout, stderr and the exit code; `strip-tag.ts` `runStripTag(argv, ports)` (`Fs`) returns nothing. Entries and wrappers: `../scripts/attach-lines.ts`, `../skills/intent/scripts/summary-path.ts` and `../skills/code-auditor/scripts/strip-tag.ts`, each beside the `.sh` of its name.
- `skill-part.ts` `runSkillPart(argv, cwd, ports)` (`Fs`, `Git`) calls `runSwitchText` in process for each fragment block and takes `pluginRootOf` from `switch-text.ts`; `qa-ledger.ts` `runQaLedger(argv, cwd, script, ports)` (`Fs`) takes the path its entry was started by (`process.argv[1]`) and cuts the plugin root from it; both return stdout, stderr and the exit code. `handoff-path.ts` `runHandoffPath(argv, cwd, ports)` (`Fs`, `Git`, `Clock`) returns the whole stdout. Entries and wrappers: `../scripts/skill-part.ts`, `../skills/handoff/scripts/handoff-path.ts` and `../skills/e2e/scripts/qa-ledger.ts`, each beside the `.sh` of its name.
- `run-changes.ts` `runRunChanges(argv, cwd, ports)` (`Git`), `tree-record.ts` `runTreeRecord(argv, cwd, ports)` and `diff-files.ts` `runDiffFiles(argv, cwd, ports)` (both `Fs`, `Git`) return stdout, stderr and the exit code. Entries and wrappers: `../scripts/run-changes.ts`, `../skills/fixer/scripts/tree-record.ts` and `../skills/code-auditor/scripts/diff-files.ts`, each beside the `.sh` of its name.
- `abs-path.ts` `absolutePath(path, cwd)` spells a path one way for `attach-lines.ts`, `qa-ledger.ts`, `run-changes.ts` and `diff-files.ts`; `stamp.ts` `stampOf(at)` is the file name stamp of `summary-path.ts` and `handoff-path.ts`; `byte-order.ts` `byteOrder(a, b)` sorts the path lists of `tree-record.ts` and `diff-files.ts`; `repo-prefix.ts` `repoPrefix(dir, root, fs)` places the cwd of `tree-record.ts` and the root argument of `diff-files.ts` below the repository root. A helper gets a module of its own once a second core needs it.
- `tools/lint/run.ts` reads its tree through the same adapters.
- Tests: `tests/viber/config/<module>.unit.test.ts` per config module, `tests/viber/lib/<module>.unit.test.ts` per module outside `config/` (the `layering/core` rule holds both), `tests/viber/lib/fakes.unit.test.ts` and `tests/viber/lib/adapters.integration.test.ts`.

## Contracts

- The key grammar of `.claude/viber.yml` and every stdout line live in the header of `../scripts/config.ts`; the modules of `config/` split it: `lines` (groups and children), `block`, `extensions`, `branching`, `reports`, `local`.
- A fake and its adapter pass the same contract cases (`fsContract`, `gitContract`, `clockContract` in `tests/harness/ports-contract.ts`).
- `Fs.readText` and `Fs.readBytes` answer `null` for an absent path, a directory and an unreadable file alike. `Fs.kind` follows a symlink and answers `null` for anything but a regular file or a directory; `Fs.realPath` answers forward slashes, the spelling `Git.repoRoot` gives.
- `Git.branch` answers the short name of the branch HEAD stands on, one with no commit yet included, and `null` on a detached HEAD or outside a repository.
- `Git.changedFiles`, `untrackedFiles` and `status` take the top level of the work tree and answer repo-relative paths read from git with `-z`: a blank, a quote, a backslash or a non-ASCII character arrives as it is, a rename as its new path alone. `changedFiles(root, null)` compares against the empty tree. `Git.firstAdded` reads its path as a literal one, never a glob. `Git.commit`, `symbolicRef` and `mergeBase` answer `null` for a ref that names nothing.
- `Fs.makeDir` and `Fs.writeBytes` answer `false` in place of throwing; `writeBytes` replaces the content in place and creates no directory.
- The core reads the local-time fields of `Clock.now()`: a unit test builds its instant from local fields (`new Date(2026, 10, 24, 17, 14, 16)`), so it holds in every time zone.

## Change together

- A port method: `ports.ts`, its adapter, its fake in `tests/harness/fakes.ts` and the contract cases with their scene state.
- A config key or report line: the header of `../scripts/config.ts` and the module that resolves it, with its unit test.
- A switch key: the `KEYS` set of `switch-text.ts`, the header of `../scripts/switch-text.ts` and the switch table of `tools/lint/data/invocations.ts`.
- An entry under `../skills/<skill>/scripts/`: its path in the `entries` list of `tools/lint/data/layering.ts`, named whole.

## Traps

- `Fs.exists` is true for a directory: a directory named `<name>.md` under `.claude/agents/` counts as a found extension agent.
- A `.claude/viber.local.yml` that is a directory prints `# local: none | ignored: none`: the port cannot tell a directory from an unreadable file.
- A value is cut at the first blank or `#`: a quoted name holding a blank reports its cut text. An empty quote pair for a title gives the default.
- The red-check lists cut a value at a blank followed by `#`, `--questions` at the first blank or `#`: the two rules differ on purpose.
- `runSwitchText` hands the skill directory to `Fs.readText` as given, so a relative one resolves against the process cwd in the adapter; `runStripTag` hands each file path on the same way, `runSkillPart` its part file, and `runHandoffPath` its `.md` target to `Fs.exists` as written (`..` and `./` kept), so the system follows a link before a `..` after it.
- The fake file system matches a path as text: `runAttachLines` and `runQaLedger` make an argument absolute and drop `.`, `..`, doubled and trailing slashes themselves (`absolutePath`) before they ask a port, and a core module that prints a path it looked up does the same.
- `absolutePath` resolves `..` as text, before any symlink is followed: `link/../x` names the sibling of the link, not of the directory it points to.
- `byteOrder` orders by code point, the order of the UTF-8 bytes `LC_ALL=C sort` gave: the default sort of a string array differs from it for a character past U+FFFF against one of U+E000..U+FFFF.
- The git adapter decodes every path as UTF-8: a file name that is no valid UTF-8 arrives with U+FFFD in place of its bad bytes.
- `runRunChanges` hands a run directory that does not read as below the root to `Git.firstAdded` as written, so git follows a link before it refuses the path; `runDiffFiles` answers `NOT_A_REPO` inside a `.git` directory and in a bare repository, where `Git.repoRoot` finds no work tree.
- `runQaLedger` counts a length in code points: a column of accented text stays aligned, a wide character still takes two cells on screen.
- A `/c/...` argument never reaches a core under Git Bash: the MSYS runtime hands node `C:/...`, so `runHandoffPath`, `runQaLedger` and `runTreeRecord` hold no MSYS rule, and the `refs:` line of `qa-ledger` reads `C:/...` whichever spelling invoked the wrapper.
- `runStripTag` reads the last line as one byte per character: a byte outside ASCII on that line never counts as a blank or a tag character.
- The map lines of `build.extensions` are classified in `config/lines.ts`, and `readChildren` skips them, so no map line is read as a child of `build:`.
