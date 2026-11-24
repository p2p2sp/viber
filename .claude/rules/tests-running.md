---
paths:
  - "tests/**/*.ts"
  - "viber/scripts/*.sh"
  - "viber/hooks/scripts/*.sh"
  - "viber/skills/*/scripts/*.sh"
  - ".github/scripts/*.sh"
  - "tools/lint/**/*.ts"
---

# Running the test suite

- The push command, from the repo root: `node --test "tests/**/*.unit.test.ts" "tests/**/*.integration.test.ts"`. It is what `.github/workflows/ci.yml` runs on Linux, Windows and macOS on every push and PR, and what a developer runs on every change. Design it to finish in 40 seconds; the workflow warns when its test step passes 60 seconds. `tests/CLAUDE.md` defines the layers.
- Add `--test-reporter=dot` locally to print one dot per passing test and the full assertion only for a failing one.
- The lint job of `ci.yml` has a local command: `node tools/lint/run.ts` runs every rule with its self-check, `node tools/lint/run.ts <type or rule id>` selects some (for example `forbidden`). It exits 0 on no finding, 1 on a finding and 2 on an argument matching no rule.
- A legacy file (`*.critical.test.ts`, a plain `*.test.ts` with a critical sibling, `tests/github/release.test.ts`) spawns a shell script and runs only in `.github/workflows/legacy.yml`, nightly and on demand: no push and no release waits for it. To debug one red legacy file, name only that file: `node --test tests/viber/commit-args.critical.test.ts`.
- In a legacy run (`CI=true`, `P2P2_SHELL_MATRIX=full`), `forEachShell` runs each case of every legacy file under every shell present: every POSIX shell and bash major. A run outside CI takes the first shell present only.
- Never run the whole legacy set on a developer machine as a routine check: a case spawning a script costs seconds on Windows and the set takes many minutes.
- `tests/harness/test.ts` runs up to 4 cases of one file at once (`P2P2_TEST_CONCURRENCY=<n>` overrides it; `1` restores one-at-a-time, the way to rule concurrency out when a case flakes).
- Quote every glob: `node --test "tests/**/*.unit.test.ts"`. The quotes are mandatory - the shell must not expand the glob, `node --test` resolves it itself.
- NEVER pass a bare directory. `node --test tests/viber/` does not select the files inside it: Node resolves the argument as a module path and reports the failure as a failed test named `tests\viber`, so a wrong argument reads like a red suite rather than like a usage error.
- Select a single case with `--test-name-pattern`: `node --test --test-name-pattern "tiers.min equal to" tests/viber/config/block.unit.test.ts`.
- `--test-name-pattern` takes a JavaScript regular expression, not a literal string. Anchor it on a distinctive plain-word fragment of the test name instead of pasting the whole name, whose punctuation (`(`, `[`, `.`, `?`) is regex syntax.
- There are no suite names to filter on: `describe()` appears zero times in the test files, so `--test-name-pattern` matches top-level `test()` names only.
- `tests/` mirrors the plugin layout: `viber/scripts/config.ts` -> `tests/viber/config/*.unit.test.ts`, `.github/scripts/release.sh` -> `tests/github/release.test.ts`.
- There is no package.json, no npm script and no test-runner config anywhere in the repo. `node --test` runs the `.ts` files directly through Node's native TypeScript type stripping; do not add a runner or a build step to make a test run.
