---
paths:
  - "tests/**/*.test.ts"
---

# Test file structure

- Name a file by its layer: `<name>.unit.test.ts` runs in process with no outside world, the ports replaced by the fakes; `<name>.integration.test.ts` runs one adapter against its real dependency, on the shared scene. A file with neither name is legacy: `*.critical.test.ts`, a plain `*.test.ts` with a `*.critical.test.ts` sibling, and `tests/github/release.test.ts`. A legacy file spawns a shell script and runs only in `legacy.yml`. Add no new legacy file: a new test is unit or integration, and `refuseUnmarked` in `tests/harness/test.ts` throws for any other name.
- Where the fixtures live: the fakes (`fakeFs`, `fakeGit`, `fakeScene`) in `tests/harness/fakes.ts`, the contract cases every fake and adapter must pass (`fsContract`, `gitContract`) in `tests/harness/ports-contract.ts`, and the shared scene (`sharedScene`) in `tests/harness/scene.ts`. An integration test takes its repository from the shared scene and builds none of its own.
- The `tiers` rule (`tools/lint/data/tiers.ts`) holds the legacy pairing (a plain legacy `*.test.ts` has a critical sibling) and the critical budget; read the budget there, never copy it.
- Put what two legacy files of a script need in `<name>-fixture.ts`, exported, with a header block and no case; a helper one file alone uses stays in that file.
- Open every test file with a `/* ... */` header block naming the file, stating what it proves, and carrying any repo reality the reader needs.
- Import `test` from the harness and the strict assert entry point: `import { test } from "../harness/test.ts"` (never `node:test` directly - the harness one runs a file's cases concurrently) and `import assert from "node:assert/strict"`, never plain `node:assert`.
- Write flat top-level `test()` calls, all registered synchronously at load (no top-level `await`). `describe()` is used zero times in the suite - do not introduce it.
- Cases run concurrently within a file: a case shares no mutable state with another, and every harness call that returns a Promise is awaited. A callback parameter a helper forwards or calls is typed `() => void | Promise<void>` and awaited: a bare `=> void` type accepts an async function silently and drops its promise.
- Carry the `.ts` extension on every relative import: `import { fakeScene } from "../harness/fakes.ts"`. Node's type stripping resolves the real file, not an extensionless specifier.
- Name a test as a full sentence stating the input and the resulting behavior, and put the reason in parentheses when the case exists to protect against a specific mistake. Example: the unit tests of `viber/scripts/config.ts` in `tests/viber/config/`.
- The cross-platform traps (compare printed paths with `slash()`, deny reads with `denyRead()` and never `chmod`, gate symlink cases on `canSymlinkDir()`) live in `tests/CLAUDE.md`, which loads for the same files. Do not restate them here.
