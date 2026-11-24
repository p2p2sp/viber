# tests/harness - shared helpers every test file imports

Owns the helper modules the suites build on: the concurrent `test()` with its layer guard, the in-memory fakes of the two ports, their contract cases and the shared scene, the subprocess runner, temp dirs and throwaway git repos, PATH stubs, shell discovery, platform capability probes and PNG fixtures. It holds no test case: its own proof is `tests/harness.unit.test.ts` and `tests/harness.critical.test.ts`, one level up.

## Terms

- **Capability probe**: `canDenyRead()` (`perms.ts`) and `canSymlinkDir()` (`symlinks.ts`) answer from one real attempt on a throwaway file, memoised per process, never from the platform name; `false` is a test's skip condition, never a failure.
- **Shell**: an interpreter path or a `[path, ...prefixArgs]` argv (`busybox sh`, `bash --posix`); `forEachShell` yields either form and `RunOpts.shell` accepts both as-is.

## Relationships

- Imported by every test file through a relative `.ts` import. Internal chain: `stub.ts` -> `tmp.ts` -> `run.ts`; `fakes.ts`, `ports-contract.ts` and `scene.ts` apart, every other module imports only Node builtins (`png.ts` encodes through `node:zlib`, no image library).
- `tests/harness.unit.test.ts` covers the layer guard of `test.ts`; `tests/harness.critical.test.ts` covers `run`, `tmp`, `perms`, `stub`, `shells`, `png` and `markdown`; `paths.ts`, `symlinks.ts`, `fakes.ts`, `scene.ts` and `coreUtilsPath()` have no case there (`fakes.ts` and `scene.ts` are proven by `tests/viber/lib/`), and `canSymlinkDir()` has no importer.
- `fakes.ts` and `ports-contract.ts` import the types of `viber/lib/ports.ts`; `SCENE_STATE` in `ports-contract.ts` seeds `fakes.ts` and `scene.ts`, the one of the three that spawns (git).

## Contracts

- `test.ts`: cases collect at load and register in one suite named after the file's basename; per-file concurrency is `P2P2_TEST_CONCURRENCY`, else `min(4, os.availableParallelism())`. At load it also refuses the running file when `layerOf` finds no layer (`refuseUnmarked`: neither `.unit.test.ts`, `.integration.test.ts`, `.critical.test.ts`, a plain `.test.ts` with a critical sibling nor `release.test.ts`), and for a unit file replaces `net.Socket.prototype.connect` by a throw.
- `fakeFs`, `fakeGit` and `fakeScene` (`fakes.ts`) are the one in-memory stand-in of each port, seeded from `SCENE_STATE`; `fsContract` and `gitContract` (`ports-contract.ts`) are the cases a fake and a real adapter both pass; `sharedScene()` (`scene.ts`) writes `SCENE_STATE` into one git repository per test process and is read-only by contract.
- `runScript(script, args, opts)` always spawns, never imports, and never rejects: it resolves `{ stdout, stderr, status }`, `status` `null` for a spawn failure (its message in `stderr`) or a kill by the timeout (default 60000 ms, SIGTERM). On win32 a run ending on an NTSTATUS crash code (`isWindowsCrash`: status 0x80000000 or above) is started once more; a script's own exit code is never retried.
- The child's environment is only a fixed base list (`PATH`, `HOME`, `USERPROFILE`, the temp vars, the Windows system vars, `LANG`, `LC_ALL`) plus `opts.env`; anything else a script reads must come through `opts.env`. `opts.stubDirs` are prepended to `PATH`.
- Interpreter order: `opts.shell`; a `.ts`/`.js`-family extension -> `process.execPath`; on win32 the file's `#!` interpreter resolved by name from `PATH` (a bare command name looked up in `opts.stubDirs` first); otherwise the script or command is executed directly.
- On win32 a run through a shell whose argv holds `*`, `?` or `[` and no `"` gets `MSYS=noglob` (unless `opts.env` sets `MSYS`): the MSYS runtime of a bash.exe otherwise expands such an argument against the working directory before the script runs.
- On win32 an argument holding `\r` or `\n`, and every argument of an argv holding both a glob character and a `"` (under `noglob` MSYS misreads the `\"` node writes), travels as `P2P2_ARGV<n>` and a `-c` preamble restores it to argv, only for a script run through a shell (`opts.shell` or a `bash`/`sh` shebang); any other script gets it truncated or expanded, so its case must skip on win32.
- `withTempDir(prefix, fn)` hands `fn` the dir by its real path (`fs.realpathSync.native`), never by an alias of the temp root (a Windows 8.3 name such as `RUNNER~1`, the macOS `/var` symlink), and removes it once `fn` settles, throw included, retrying a busy or refilled dir.
- `withGitRepo(fn, { bare })` copies a per-process template made by one `git init` (its hooks dir removed): branch `main`, `gpgsign = false`, auto maintenance and auto gc off (a detached run would write into the dir during its removal), `HOME`/`USERPROFILE`/`GIT_CONFIG_GLOBAL` inside the temp dir, `GIT_CONFIG_NOSYSTEM=1`, fixed author and committer (`test@p2p2.invalid`, `2020-01-01T00:00:00Z`). `repo.git()` runs with `repo.env`.
- `withStub(name, body, fn)` writes an executable `#!/bin/sh` stub, plus on win32 a `name.cmd` shim that calls it through `bash`; its dir goes into `opts.stubDirs`.
- `shellUtilsPath()` returns the first `PATH` dir resolving `grep`, plus the first one resolving `bash` when that differs, and throws when none does. It is not tool-free: on POSIX that dir also ships `git`. `coreUtilsPath()` is that value behind a process-lifetime temp dir holding a `node` shim (plus `node.cmd` on win32), so a script needing `node` finds the running one.
- `forEachShell(kind, fn)` runs `fn` once per shell, one after another, and returns a `ShellSkip[]` for every absent or unrun one, never throwing. `bash` means one bash per distinct major version; `posix` means `/bin/sh`, `dash`, `busybox sh`, `bash --posix`, a candidate resolving to a binary already run skipped (`/bin/sh` is `dash` on Ubuntu). Discovery is memoised per `PATH` value.
- `fullShellMatrix(env, file)` decides how many shells a run takes: every one for a `*.critical.test.ts` file when `CI` is `true` or `1`, and for every file under `P2P2_SHELL_MATRIX=full`; otherwise, and under `P2P2_SHELL_MATRIX=first`, the first shell present alone. `FULL_SHELL_MATRIX` is that answer for the running file.
- `denyRead(file)` returns `false`, leaving the file readable, whenever the deny cannot be verified by a failed read (a POSIX root run, a filesystem or policy dropping the ACE). Windows denies with `icacls /deny`, spawned directly, never through a shell. `restoreRead(file)` never throws and is safe on a file never denied.
- `section(text, heading)` (`markdown.ts`) returns the first line starting `## ` + heading (a prefix match, so `5.` also matches `5 to 7.`) up to the next `## ` line, a newline kept before it, and throws an error naming the heading when no line starts so; `rules-trail-prose`, `failure-trail-prose`, `close-part-prose` and `rules-close-prose` slice through it.
- `slash(value)` rewrites every backslash as `/`; a test comparing a path a script printed slashes both sides.
- `writePng(width, height, rgba)` emits 8-bit, non-interlaced, filter-0 RGBA and throws on a non-positive size or an `rgba` length other than `width * height * 4`.

## Change together

- `withStub`'s stub keeps a `#!` line: `run.ts` accepts a `stubDirs` entry on win32 only when it has one, so a stub written without it is skipped and the real binary runs.

## Traps

- A script under test run without `repo.env` in `opts.env` sees the developer's real `HOME` and `~/.gitconfig`: only `repo.git()` carries the isolation on its own.
- `opts.stubDirs` only prepends, so it cannot prove a tool absent: pin `opts.env.PATH` to `shellUtilsPath()` first, then prepend the one stub to put back. A case staging a missing Node must use `shellUtilsPath()`: `coreUtilsPath()` always finds `node`.
- A process spawn is the suite's dominant cost on Windows, which is why the git template is copied, its config written as a file and shell discovery memoised; a new helper avoids per-call spawns the same way.
- A denied file left denied blocks removal of its temp dir on Windows: call `restoreRead` in the case's `finally`.
- The `withGitRepo` template has no hooks: a case needing one writes it into its own copy.
- `withGitRepo` keeps its global git config as `.gitconfig-global` in the repo directory itself: a case asserting on untracked files must exclude it through `.git/info/exclude`, or it is listed.
- `png.ts`'s header names a `decodePng` that exists nowhere; `tests/harness.critical.test.ts` decodes with `inflateSync` itself.
