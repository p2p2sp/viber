# tests/harness - shared helpers every test file imports

Owns the helper modules the suites build on: the concurrent `test()`, the subprocess runner, temp dirs and throwaway git repos, PATH stubs, shell discovery, platform capability probes and PNG fixtures. It holds no test case: its own proof is `tests/harness.test.ts`, one level up.

## Terms

- **Capability probe**: `canDenyRead()` (`perms.ts`) and `canSymlinkDir()` (`symlinks.ts`) answer from one real attempt on a throwaway file, memoised per process, never from the platform name; `false` is a test's skip condition, never a failure.
- **Shell**: an interpreter path or a `[path, ...prefixArgs]` argv (`busybox sh`, `bash --posix`); `forEachShell` yields either form and `RunOpts.shell` accepts both as-is.

## Relationships

- Imported by every test file through a relative `.ts` import. Internal chain: `stub.ts` -> `tmp.ts` -> `run.ts`; every other module imports only Node builtins (`png.ts` encodes through `node:zlib`, no image library).
- `tests/harness.test.ts` covers `run`, `tmp`, `perms`, `stub`, `shells`, `png` and `markdown`; `paths.ts`, `symlinks.ts` and `coreUtilsPath()` have no case there, and `canSymlinkDir()` has no importer.

## Contracts

- `test.ts`: cases collect at load and register in one suite named after the file's basename; per-file concurrency is `P2P2_TEST_CONCURRENCY`, else `min(4, os.availableParallelism())`.
- `runScript(script, args, opts)` always spawns, never imports, and never rejects: it resolves `{ stdout, stderr, status }`, `status` `null` for a spawn failure (its message in `stderr`) or a kill by the timeout (default 60000 ms, SIGTERM).
- The child's environment is only a fixed base list (`PATH`, `HOME`, `USERPROFILE`, the temp vars, the Windows system vars, `LANG`, `LC_ALL`) plus `opts.env`; anything else a script reads must come through `opts.env`. `opts.stubDirs` are prepended to `PATH`.
- Interpreter order: `opts.shell`; a `.ts`/`.js`-family extension -> `process.execPath`; on win32 the file's `#!` interpreter resolved by name from `PATH` (a bare command name looked up in `opts.stubDirs` first); otherwise the script or command is executed directly.
- On win32 an argument holding `\r` or `\n` travels as `P2P2_ARGV<n>` and a `-c` preamble restores it to argv, only for a script run through a shell (`opts.shell` or a `bash`/`sh` shebang); any other script gets it truncated, so its case must skip on win32.
- `withTempDir(prefix, fn)` removes the dir once `fn` settles, throw included, retrying a busy or refilled dir.
- `withGitRepo(fn, { bare })` copies a per-process template made by one `git init` (its hooks dir removed): branch `main`, `gpgsign = false`, auto maintenance and auto gc off (a detached run would write into the dir during its removal), `HOME`/`USERPROFILE`/`GIT_CONFIG_GLOBAL` inside the temp dir, `GIT_CONFIG_NOSYSTEM=1`, fixed author and committer (`test@p2p2.invalid`, `2020-01-01T00:00:00Z`). `repo.git()` runs with `repo.env`.
- `withStub(name, body, fn)` writes an executable `#!/bin/sh` stub, plus on win32 a `name.cmd` shim that calls it through `bash`; its dir goes into `opts.stubDirs`.
- `coreUtilsPath()` returns the first `PATH` dir resolving `grep`, plus the first one resolving `bash` when that differs, and throws when none does. It is not tool-free: on POSIX that dir also ships `git`.
- `forEachShell(kind, fn)` runs `fn` once per shell, one after another, and returns a `ShellSkip[]` for every absent or unrun one, never throwing. `bash` means one bash per distinct major version; `posix` means `/bin/sh`, `dash`, `busybox sh`, `bash --posix`. Discovery is memoised per `PATH` value.
- `denyRead(file)` returns `false`, leaving the file readable, whenever the deny cannot be verified by a failed read (a POSIX root run, a filesystem or policy dropping the ACE). Windows denies with `icacls /deny`, spawned directly, never through a shell. `restoreRead(file)` never throws and is safe on a file never denied.
- `section(text, heading)` (`markdown.ts`) returns the first line starting `## ` + heading (a prefix match, so `5.` also matches `5 to 7.`) up to the next `## ` line, a newline kept before it, and throws an error naming the heading when no line starts so; `rules-trail-prose`, `failure-trail-prose`, `close-part-prose` and `rules-close-prose` slice through it.
- `slash(value)` rewrites every backslash as `/`; a test comparing a path a script printed slashes both sides.
- `writePng(width, height, rgba)` emits 8-bit, non-interlaced, filter-0 RGBA and throws on a non-positive size or an `rgba` length other than `width * height * 4`.

## Change together

- `withStub`'s stub keeps a `#!` line: `run.ts` accepts a `stubDirs` entry on win32 only when it has one, so a stub written without it is skipped and the real binary runs.

## Traps

- A script under test run without `repo.env` in `opts.env` sees the developer's real `HOME` and `~/.gitconfig`: only `repo.git()` carries the isolation on its own.
- `opts.stubDirs` only prepends, so it cannot prove a tool absent: pin `opts.env.PATH` to `coreUtilsPath()` first, then prepend the one stub to put back.
- A process spawn is the suite's dominant cost on Windows, which is why the git template is copied, its config written as a file and shell discovery memoised; a new helper avoids per-call spawns the same way.
- A denied file left denied blocks removal of its temp dir on Windows: call `restoreRead` in the case's `finally`.
- The `withGitRepo` template has no hooks: a case needing one writes it into its own copy.
- `withGitRepo` keeps its global git config as `.gitconfig-global` in the repo directory itself: a case asserting on untracked files must exclude it through `.git/info/exclude`, or it is listed.
- `png.ts`'s header names a `decodePng` that exists nowhere; `tests/harness.test.ts` decodes with `inflateSync` itself.
