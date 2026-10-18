---
paths:
  - "tests/**/*.ts"
  - "viber/scripts/*.sh"
  - "viber/hooks/scripts/*.sh"
  - "viber/skills/*/scripts/*.sh"
  - ".github/scripts/*.sh"
---

# Running the test suite

- Locally, run only the unit tier, on every change, from the repo root: `node --test --test-reporter=dot "tests/**/*.unit.test.ts"` (seconds; it must stay under one minute). It prints one dot per passing test and the full assertion only for a failing one. The integration tier (every other `*.test.ts`) runs in CI only: the "Run tests" step of `.github/workflows/ci.yml` runs `"tests/**/*.test.ts"`, both tiers, on every push and PR. `tests/CLAUDE.md` defines the two tiers.
- In CI, `forEachShell` runs each case under every shell present (`CI=true`, the full shell matrix: every POSIX shell and bash major); outside CI it runs the first shell present only.
- Two levels of parallelism multiply: `--test-concurrency` sets how many files run at once, and `tests/harness/test.ts` runs up to 4 cases of one file at once (`P2P2_TEST_CONCURRENCY=<n>` overrides it; `1` restores one-at-a-time, the way to rule concurrency out when a case flakes).
- Never run the integration tier, a plugin subset or the whole `"tests/**/*.test.ts"` on a developer machine: a case spawning a script costs 1-2 s on Windows and the full suite takes minutes. To debug one red CI file, name only that file: `node --test tests/viber/config.test.ts`.
- Quote every glob: `node --test "tests/**/*.unit.test.ts"`. The quotes are mandatory - the shell must not expand the glob, `node --test` resolves it itself.
- NEVER pass a bare directory. `node --test tests/viber/` does not select the files inside it: Node resolves the argument as a module path and reports the failure as a failed test named `tests\viber`, so a wrong argument reads like a red suite rather than like a usage error.
- Select a single case with `--test-name-pattern`: `node --test --test-name-pattern "a commented-out" tests/viber/config.test.ts` runs exactly 1 test.
- `--test-name-pattern` takes a JavaScript regular expression, not a literal string. Anchor it on a distinctive plain-word fragment of the test name instead of pasting the whole name, whose punctuation (`(`, `[`, `.`, `?`) is regex syntax.
- There are no suite names to filter on: `describe()` appears zero times in the test files, so `--test-name-pattern` matches top-level `test()` names only.
- `tests/` mirrors the plugin layout, so the test file whose CI result covers a shipped script is found by basename: `viber/scripts/config.sh` -> `tests/viber/config.test.ts`, `.github/scripts/release.sh` -> `tests/github/release.test.ts`. The mirror flattens a plugin's subdirectories: viber's `scripts/`, `hooks/scripts/` and every `skills/<name>/scripts/` all land in `tests/viber/` under the script's own basename (`viber/hooks/scripts/plan-gate.sh` -> `tests/viber/plan-gate.test.ts`).- There is no package.json, no npm script and no test-runner config anywhere in the repo. `node --test` runs the `.ts` files directly through Node's native TypeScript type stripping (Node v26 in use); do not add a runner, a build step or a lint step to make a test run.
