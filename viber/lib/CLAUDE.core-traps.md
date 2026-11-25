# viber/lib - editing a core outside the plan and build cores

Read for a change to the config core, a code-auditor core (`frame.ts`, `diff-files.ts`, `keep-units.ts`, `hunt-return.ts`, `hunt-brief.ts`, `synthesize.ts`, `strip-tag.ts`, `worktree.ts`), `memory-map.ts`, `rules-map.ts`, `commit.ts`, `commit-context.ts`, `merge-settings.ts`, `extension.ts`, `qa-ledger.ts`, `lint_skill.ts`, `run-failures.ts`, `run-changes.ts` or `tree-record.ts`. It holds what each of them does at an edge that its code does not show at a glance.

## Relationships

- `runSynthesize`, `runKeepUnits` and `runHuntReturn` take no cwd: each derives every path from its workspace argument. `runLintSkill` and `runWorktree` take none either: a relative target of the skill lint resolves against the process cwd in the adapter and is printed as given.
- `GitWrite` is taken by `runCommit`, `runArchiveRun`, `runWorktree` and `runPlanIndex` (for `--split`) alone; `Clock` by the cores that stamp a file name, a run or a map id (`summary-path.ts`, `handoff-path.ts`, `frame.ts`, `plan-build.ts`, `rules-map.ts`, `memory-map.ts`).

## Traps

- Config: a value is cut at the first blank or `#`, so a quoted name holding a blank reports its cut text, and an empty quote pair for a title gives the default. The red-check lists cut a value at a blank followed by `#`, `--questions` at the first blank or `#`: the two rules differ on purpose.
- Config: the map lines of `build.extensions` are classified in `config/lines.ts`, and `readChildren` skips them, so no map line is read as a child of `build:`. A `.claude/viber.local.yml` that is a directory prints `# local: none | ignored: none`.
- `runExtension` splices the two lines of `--add` into the bytes of `viber.yml`: a byte that is no valid UTF-8 elsewhere in the file stays as it is, and a write that fails answers `STATUS=stale`, never `added`.
- `runRunFailures` lower-cases a `- Blocking [<cause>]` word letter by letter in ASCII: a full Unicode fold would turn a Kelvin sign into `k` and admit a cause that is none.
- `runRunChanges` hands a run directory that does not read as below the root to `Git.firstAdded` as written, so git follows a link before it refuses the path; `runDiffFiles` answers `NOT_A_REPO` inside a `.git` directory and in a bare repository, where `Git.repoRoot` finds no work tree.
- `runQaLedger` counts a length in code points: a column of accented text stays aligned, a wide character still takes two cells on screen.
- `runCommit` ends on git's own exit of the first step that failed and prints nothing then; a path outside the repository is `Nothing to commit`. A new file whose name is no valid UTF-8 fails the staging of a named directory; the whole-tree commit takes it.
- `runFrame` asks `Fs.kind` for the root itself when the scope is the root, never `<root>/.`, and prints the `RUN:` line even when the workspace could not be written.
- `runKeepUnits` and `runHuntReturn` read the score files in name order, `S1-retry.md` before `S1.md`.
- `runRulesMap` tells a link by its real path, as `runLintSkill` does but ignoring case: it lists a linked `.md` file, enters no linked directory and reads a linked `.claude/rules` or archive as empty.
- `runLintSkill` tells a link by its real path (an entry whose `Fs.realPath` is not its directory's real path plus its own name) and neither reads nor follows one.
- `runMemoryMap` reads a node it cannot open as 0 bytes, yet counts an unreadable file toward its candidate directory (`Fs.size` needs no read right); a submodule entry counts toward none.
- `runMergeSettings` names no system error: the port answers `false` or `null`, so its messages say which path could not be read, created or written. `writeBytes` keeps no file mode: the settings backup takes the default one.
- `runStripTag` reads the last line as one byte per character: a byte outside ASCII on that line never counts as a blank or a tag character.
