# tests

- Two harnesses: `fake-ports.ts` for `lib/` modules that take the ports of spec-implementor's `lib/ports.ts` (`Fs`, `Git`, `Gh`); `temp-repo.ts` for a skill's `.ts` entry run as a child process in a real temp repository.
- Fake paths differ: `fakeFs` keys are absolute (`/r/...`, `ROOT`), `fakeGit` dirty paths and `heads` are repo-relative.
- `fakeCtx`: run `run1` under `docs/_specs/`, close step `tasks`, no `state.before` unless passed. `fakeGit` commits always succeed (`abc1234`), `sizeAtHead` is null for a path missing from `heads`, `restore` returns `restoreOk`.
- `runEntry` returns only the non-empty stdout lines: stderr and the exit code are never seen.
- `tempDir` returns the real path, so it matches the paths an entry prints; git runs with no global or system config, no excludes file and `GIT_DIR`, `GIT_WORK_TREE`, `GIT_INDEX_FILE` unset.
- Tests are characterizations: mark a deliberately changed expectation with a `// Changed on purpose: ...` comment.
- `build-close.test.ts` pins briefs, notes and commit messages byte for byte: update it with any wording change in `build-close.ts`.
- Moving a plugin file breaks the relative imports here and the repo-relative `ENTRY` paths passed to `runEntry`.
