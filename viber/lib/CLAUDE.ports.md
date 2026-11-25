# viber/lib - changing a port, an adapter or a fake

Read for a change to `ports.ts`, a module of `adapters/` or a fake of `tests/harness/fakes.ts`, and before relying on what a port answers at an edge (a missing path, a link, an unreadable file). It covers what the four ports promise, not what a core does with them.

## Terms

- `Fs` reads: `readText`, `readBytes`, `size`, `exists`, `kind`, `realPath`, `listDir`, `executable`, `isLink`. `Fs` writes: `setExecutable`, `makeDir`, `writeBytes`, `appendBytes`, `replace`, `move`, `removeTree`, `remove`, `removeEmptyDir`.
- `Git`, all reads: `repoRoot`, `isRepository`, `trackedFiles`, `branch`, `commit`, `shortCommit`, `indexHolds`, `headHolds`, `stagedFiles`, `report`, `symbolicRef`, `mergeBase`, `firstAdded`, `log`, `committedFiles`, `changedFiles`, `untrackedFiles`, `trackedIgnored`, `ignored`, `status`, `grep`.
- `GitWrite`: `stageTracked`, `stage`, `stageAll`, `commit`, `move`, `removeTracked`, `addWorktree`, `removeWorktree`, `pruneWorktrees`. `Clock`: `now`.

## Contracts

- `Fs.readText` and `Fs.readBytes` answer `null` for an absent path, a directory and an unreadable file alike. `Fs.kind` follows a symlink and answers `null` for anything but a regular file or a directory; `Fs.realPath` answers forward slashes, the spelling `Git.repoRoot` gives.
- `Fs.executable` answers whether this account may run the file: `false` for a file carrying no exec bit and for an absent path, `true` for every existing file on a system that keeps no such bit (Windows).
- `Fs.size` reads no content: `memory-map.ts` counts every tracked file with it, and `plan-build.ts` sizes the files of a survey with it.
- `Fs.makeDir`, `Fs.writeBytes`, `Fs.appendBytes`, `Fs.replace`, `Fs.remove` and `Fs.removeEmptyDir` answer `false` in place of throwing; `replace` renames a file over another in one step and takes no directory; `appendBytes` never rewrites what the file holds, so two calls at once lose no line, and `removeEmptyDir` takes no link and no directory holding an entry; `writeBytes` replaces the content in place and creates no directory, and `remove` is `true` for an absent path and `false` for a directory.
- `Fs.move` takes a file, a directory or a link and never replaces what stands at the target (`replace` does, files only); `Fs.removeTree` follows no link.
- `Git.branch` answers the short name of the branch HEAD stands on, one with no commit yet included, and `null` on a detached HEAD or outside a repository.
- `Git.changedFiles`, `untrackedFiles` and `status` take the top level of the work tree and answer repo-relative paths read from git with `-z`: a blank, a quote, a backslash or a non-ASCII character arrives as it is, a rename as its new path alone. `changedFiles(root, null)` compares against the empty tree. `Git.firstAdded` reads its path as a literal one, never a glob. `Git.commit`, `symbolicRef` and `mergeBase` answer `null` for a ref that names nothing. `Git.committedFiles` is empty for a merge commit.
- `Git.trackedIgnored` lists the tracked files the ignore rules exclude; `Git.ignored` judges one path by the rules alone, the index left out.
- `Git.stagedFiles` answers `null`, never an empty list, when git cannot tell; `Git.report` is text for a person, git's error in front of it.
- `Git.grep` reads the work tree, never a commit: tracked and untracked text files, an ignored and a binary one left out, each term a fixed string, a whole word under `word`. It reads git with `-z`, so a path arrives as it is and a colon in one splits nothing; no term and no repository answer the empty list.
- `GitWrite` reads every path as a literal one, relays git's output on the standard error of the process as it comes (the worktree calls hand it back) and runs hooks and signing as any git call. `commit` with paths builds a private index, so the user's other staged work stays staged; its path is `<git dir>/index.viber-commit.<pid>`, left behind only by a killed process.

## Change together

- A port method: `ports.ts`, its adapter, its fake and the contract cases of `tests/harness/ports-contract.ts` with their scene state; the fake (`tests/viber/lib/fakes.unit.test.ts`) and the adapter (`tests/viber/lib/adapters.integration.test.ts`) pass the same cases.

## Traps

- The git adapter decodes every path as UTF-8: a file name that is no valid UTF-8 arrives with U+FFFD in place of its bad bytes.
- The port cannot tell a directory from an unreadable file: a `.claude/viber.local.yml` that is a directory prints `# local: none | ignored: none`.
- `writeBytes` keeps no file mode: a file written over gets the default one.
