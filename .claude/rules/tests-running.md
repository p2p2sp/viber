---
paths:
  - "tests/**/*.ts"
  - "viber/scripts/*.sh"
  - "viber/hooks/scripts/*.sh"
  - "viber/skills/*/scripts/*.sh"
  - ".github/scripts/*.sh"
---

# Running the test suite

- Locally, run the unit tier on every change, from the repo root: `node --test --test-reporter=dot "tests/**/*.unit.test.ts"` (seconds; it must stay under one minute). It prints one dot per passing test and the full assertion only for a failing one. `tests/CLAUDE.md` defines the three tiers.
- After changing a script, run its critical file too: `node --test tests/viber/config.critical.test.ts`. The unit and critical tiers together are what a Windows or macOS push run executes, about a minute and a half on a developer machine: `CI=true node --test --test-reporter=dot --test-concurrency=6 "tests/**/*.unit.test.ts" "tests/**/*.critical.test.ts"`.
- The logic tier (every other `*.test.ts`) is CI work: `.github/workflows/ci.yml` runs every tier on Linux and the unit and critical tiers on Windows and macOS on every push and PR, and `.github/workflows/full.yml` runs every tier on Linux and Windows nightly, on demand and before a release.
- In CI, `forEachShell` runs each case of a critical file under every shell present (`CI=true`, the full shell matrix: every POSIX shell and bash major); a logic file, and any run outside CI, takes the first shell present only. `P2P2_SHELL_MATRIX=full` gives every file the full matrix, which is how `full.yml` runs.
- Two levels of parallelism multiply: `--test-concurrency` sets how many files run at once, and `tests/harness/test.ts` runs up to 4 cases of one file at once (`P2P2_TEST_CONCURRENCY=<n>` overrides it; `1` restores one-at-a-time, the way to rule concurrency out when a case flakes).
- Never run the logic tier, a plugin subset or the whole `"tests/**/*.test.ts"` on a developer machine as a routine check: a case spawning a script costs seconds on Windows and the full suite takes many minutes. To debug one red CI file, name only that file: `node --test tests/viber/config.test.ts`.
- Quote every glob: `node --test "tests/**/*.unit.test.ts"`. The quotes are mandatory - the shell must not expand the glob, `node --test` resolves it itself.
- NEVER pass a bare directory. `node --test tests/viber/` does not select the files inside it: Node resolves the argument as a module path and reports the failure as a failed test named `tests\viber`, so a wrong argument reads like a red suite rather than like a usage error.
- Select a single case with `--test-name-pattern`: `node --test --test-name-pattern "a commented-out" tests/viber/config.test.ts` runs exactly 1 test.
- `--test-name-pattern` takes a JavaScript regular expression, not a literal string. Anchor it on a distinctive plain-word fragment of the test name instead of pasting the whole name, whose punctuation (`(`, `[`, `.`, `?`) is regex syntax.
- There are no suite names to filter on: `describe()` appears zero times in the test files, so `--test-name-pattern` matches top-level `test()` names only.
- `tests/` mirrors the plugin layout, so the test files whose CI result covers a shipped script are found by basename: `viber/scripts/config.sh` -> `tests/viber/config.test.ts` and `tests/viber/config.critical.test.ts`, `.github/scripts/release.sh` -> `tests/github/release.test.ts`. The mirror flattens a plugin's subdirectories: viber's `scripts/`, `hooks/scripts/` and every `skills/<name>/scripts/` all land in `tests/viber/` under the script's own basename (`viber/hooks/scripts/plan-gate.sh` -> `tests/viber/plan-gate.test.ts`).
- There is no package.json, no npm script and no test-runner config anywhere in the repo. `node --test` runs the `.ts` files directly through Node's native TypeScript type stripping (Node v26 in use); do not add a runner, a build step or a lint step to make a test run.
