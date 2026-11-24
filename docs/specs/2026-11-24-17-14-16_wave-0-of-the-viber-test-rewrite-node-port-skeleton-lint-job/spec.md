To build this plan you must invoke skill `viber:implementor` with `source:` path as its only argument.

# Wave 0 of the viber test rewrite: Node port skeleton, lint job, one fast CI workflow, config pilot

## Goal

Lay the ground the rest of the test rewrite stands on: a Node core tested in process, a deterministic lint job, one CI workflow whose test step fits in a minute, and the first script (`config.sh`) ported to it. The suite is written from scratch: no old test runs beside a new one as an oracle.

## Problem

The suite tests bash and awk logic by spawning the scripts. A spawning case has a median of 1.4 seconds on the Windows runner, an in-process case 2 milliseconds. A release waits 7 to 13 minutes on the full suite and a push run takes about 2 minutes. The owner maintains the plugin alone and pays that wait on every push and every release; left alone, it grows with every script.

## Current behaviour

Sixty-six shell scripts hold the plugin's logic. Tests come in three tiers by file name: unit (in process), critical (spawning, every operating system on a push) and logic (spawning, Linux on a push). `ci.yml` runs every tier on Linux and the unit and critical tiers on Windows and macOS. `full.yml` runs every tier on Linux and Windows nightly and as the gate `release-version.yml` waits for. Nothing lints: static checks are unit test files (`portability`, `orphan-tags`, `tiers`, five word-cap files, `rule-budget`). Node is optional: three features need it, the rest runs on bash alone.

### Must not change

- The stdout lines and the exit code 0 of `viber/scripts/config.sh`, for the block and for each of its four reports, on a machine with a usable Node.
- Every caller of `config.sh` (skills, scripts, hooks) keeps its call line.
- The session start hook's output on a machine with Node 22.18 or newer.
- The workflow name `CI`, its triggers and its concurrency group.
- A legacy test file that passed before this plan passes after it.

## Behaviour

### S1 - A push runs lint and every layer on three systems [CHANGED - was: every tier on Linux, the unit and critical tiers on Windows and macOS, no lint]

Given a commit pushed to any branch
When the `CI` workflow runs
Then a lint job reports type, workflow, shell, skill and rule findings, and a tests job on Linux, Windows and macOS runs the unit and integration files and warns when its test step took more than 60 seconds

### S2 - A release waits for the green CI of its commit [CHANGED - was: the release reran the whole suite on Linux and Windows first]

Given a release started for a commit whose `CI` run is in progress or finished
When the Release job starts
Then it waits for that run, goes on when it succeeded and fails when it did not

### S3 - The config resolves to the same lines [CHANGED - was: resolved by bash and awk inside config.sh]

Given a project with a `.claude/viber.yml`
When a skill preload or a script runs `config.sh`
Then it prints the same block or report as before, now resolved by the Node core

### S4 - A session starts on a machine without a usable Node [NEW]

Given a machine with no `node` on `PATH`, or one older than 22.18
When a session starts
Then the banner names the required version and every viber skill answers with one refusal line

### S5 - Rules written as data are checked against the tree [NEW]

Given rules listed as data, each of a type that carries a bad sample
When the lint entry runs
Then every type first proves it reports on its sample, every rule is checked against the tree, and a finding fails the run

### S6 - The legacy spawning tests run at night [CHANGED - was: on every push on Linux and before every release]

Given the test files that still spawn a shell script
When the nightly schedule or a manual dispatch starts the legacy workflow
Then they run on Linux and Windows, and no push or release waits for them

### S7 - Logic is proven without touching the machine [NEW]

Given the config logic and the fakes of the two ports
When the unit tests run
Then no file, process or network connection is touched, the cases that pass for a fake pass for its real adapter on the shared scene, and the script a caller runs only passes its arguments to that logic and prints the answer

### Edge cases

- A `node` older than 22.18 -> the banner note names the version found.
- A `node` whose version does not parse -> treated as no Node.
- No usable Node and no readable manifest -> the refusal text is injected alone.
- No `node` on `PATH` when `config.sh` runs -> it prints nothing and exits 0.
- A test step longer than 60 seconds -> a warning annotation and a job summary line, the job passes.
- A released commit with no `CI` run -> the release fails with a line saying so.
- A `FAIL` line of the skill lint that is not on the exceptions list -> the skill lint script exits 1.
- A rule type whose bad sample yields no finding -> the rule run fails before any rule of that type runs.
- A test file with no layer marker that is no legacy file -> it fails at load.

## Glossary

- Layer - what a test file may touch, told by its name: unit (nothing outside the test process) or integration (one real dependency). Not a tier: tiers are the legacy split.
- Legacy test - a test file that spawns a shell script. Runs only in the legacy workflow, until its script is ported.
- Port - the boundary the logic reaches the outside world through. This plan has two: the file system and git.
- Fake - the one in-memory stand-in of a port, shared by every unit test.
- Contract case - a test written against a port alone, passed by its fake and by its real adapter.
- Shared scene - the one throwaway git repository a test process builds once and every integration case reads.
- Core - the Node modules holding the logic; they never touch the outside world themselves.
- Entry - a script that only reads its arguments, calls the core, prints and exits.
- Rule type - a check implemented in code, with a bad sample proving it reports.
- Rule instance - one use of a rule type, written as data: an id, parameters and the reason.

## Acceptance criteria

1. The test step of every tests job (Linux, Windows, macOS) reports a warning annotation and a job summary line when it takes more than 60 seconds, and the job still passes.
2. One CI workflow holds a lint job and the tests of every layer on the three systems; `full.yml` and the shard script are gone; the release waits only for the `CI` run of its commit.
3. The port skeleton exists: a core importing no file system or process module, the file system and git ports each with a real adapter and a fake passing the same contract cases, and an entry holding no logic.
4. `viber/scripts/config.sh` is a wrapper that runs `config.ts` and holds no key grammar; it prints the same stdout with exit 0 for the block and each report, and its callers are unchanged; the config behaviour is proven by unit tests in process and the adapters by one contract test on the shared scene. [D1]
5. The lint job runs `tsc --noEmit`, actionlint, shellcheck over the two scripts that stay shell after the whole port (`.github/scripts/release.sh` and `viber/hooks/scripts/session-start.sh`), the skill lint over viber's own skills and agents failing on any `FAIL` outside the exceptions list, and the rule runner with the types `cap`, `token-contract`, `forbidden`, `ref-exists` and `layering`, each with a self-check; the caps of the five word-cap files and of `rule-budget`, and the sweeps `portability`, `orphan-tags` and `tiers`, are rules.
6. Without Node 22.18 or newer the session start hook names the requirement in its banner and injects the text that makes every viber skill refuse with one line; `README.md`, `viber/README.md` and the help page state Node 22.18 or newer as required.
7. The legacy tests run in a workflow of their own, nightly and on demand, that no push and no release waits for.

## Scope

### File map

- add - viber/lib/ports.ts - the two port interfaces
- add - viber/lib/adapters/fs.ts - the file system adapter over node:fs
- add - viber/lib/adapters/git.ts - the git adapter over the git command
- add - viber/lib/config/lines.ts - the group and child line grammar of `.claude/viber.yml`
- add - viber/lib/config/block.ts - the resolved block: switches, titles, directories, tiers
- add - viber/lib/config/extensions.ts - the `build.extensions` map and its steps
- add - viber/lib/config/branching.ts - the branching report
- add - viber/lib/config/reports.ts - the red-check, questions and specifications reports
- add - viber/lib/config/local.ts - the local file overrides and the local line of the block
- add - viber/lib/config/run.ts - the one public entry of the config core
- add - viber/scripts/config.ts - the config entry: argv, adapters, stdout, exit 0
- modify - viber/scripts/config.sh - becomes the wrapper that runs `config.ts`
- add - tests/harness/fakes.ts - the fake file system and fake git
- add - tests/harness/ports-contract.ts - the contract cases of both ports and the scene state they read
- add - tests/harness/scene.ts - the shared scene
- modify - tests/harness/test.ts - refuses a file with no layer marker, keeps unit files off the network
- modify - tests/harness/stub.ts - the core utilities path also reaches `node` through a shim, the shell utilities path holds the former value
- modify - tests/viber/config-fixture.ts - its header names the one file that still uses it
- modify - tests/viber/merge-settings.test.ts - legacy: stages a missing Node by the shell utilities path
- modify - tests/viber/task-step.test.ts - legacy: its copied plugin holds `config.ts` and the core
- modify - tests/harness/shells.ts - its header names the legacy workflow
- add - tests/harness.unit.test.ts - the layer marker and network refusals; calls the harness's layer function and a network connect
- add - tests/viber/lib/fakes.unit.test.ts - the fakes pass the contract cases; calls the contract functions
- add - tests/viber/lib/adapters.integration.test.ts - the adapters pass the contract cases on the shared scene; calls the contract functions
- add - tests/viber/config/run.unit.test.ts - the default block, the root the file is read from, the argument dispatch; calls the config core entry
- add - tests/viber/config/lines.unit.test.ts - groups, children, first assignment; calls the config core entry
- add - tests/viber/config/block.unit.test.ts - switches, titles, directories, tiers; calls the config core entry
- add - tests/viber/config/extensions.unit.test.ts - the extension lines; calls the config core entry
- add - tests/viber/config/branching.unit.test.ts - the branching report; calls the config core entry
- add - tests/viber/config/reports.unit.test.ts - the three small reports; calls the config core entry
- add - tests/viber/config/local.unit.test.ts - the local overrides; calls the config core entry
- modify - tests/viber/config.critical.test.ts - legacy: runs the wrapper, with and without Node; calls `config.sh` as a process
- delete - tests/viber/config.test.ts - legacy logic cases of the grammar the unit tests now prove
- modify - tests/tiers.unit.test.ts - an integration file is a tier of its own
- add - tools/lint/engine.ts - the rule engine: self-check gate, findings, status
- add - tools/lint/tree.ts - builds the tree the engine reads, from the two ports
- add - tools/lint/run.ts - the lint entry: discovers types and data, prints, exits
- add - tools/lint/rules/cap.ts - rule type: word and byte caps
- add - tools/lint/rules/token-contract.ts - rule type: a token present in every listed file
- add - tools/lint/rules/forbidden.ts - rule type: tokens absent from the swept files
- add - tools/lint/rules/ref-exists.ts - rule type: plugin paths, agent and skill names, commands and manifest entries resolve
- add - tools/lint/rules/layering.ts - rule type: core purity, thin entries, tested core, unit tests off the outside world
- add - tools/lint/rules/orphan-tags.ts - rule type: closing tag lines with no opener
- add - tools/lint/rules/script-portability.ts - rule type: shebang, CRLF, bash-only and GNU-only forms
- add - tools/lint/rules/invocations.ts - rule type: exec bits, preload quoting, fragment calls
- add - tools/lint/rules/tiers.ts - rule type: legacy tier pairing and budget, the new layers
- add - tools/lint/data/caps.ts - the migrated word and byte caps
- add - tools/lint/data/dashes.ts - the em dash and en dash kept out of the tree
- add - tools/lint/data/plugin-refs.ts - the reference rule over viber's skills, agents, hooks, manifest and help page
- add - tools/lint/data/layering.ts - the layering rule over the core, the entries and the new tests
- add - tools/lint/data/orphan-tags.ts - the orphan tag rule over the tracked files
- add - tools/lint/data/script-portability.ts - the script portability rule over the shipped scripts
- add - tools/lint/data/invocations.ts - the invocation rules over skills, parts, fragments and hooks
- add - tools/lint/data/tiers.ts - the tier rule: budget and exemptions
- add - tools/lint/data/node-requirement.ts - the Node requirement token across docs and hook content
- add - tools/lint/data/retired.ts - the retired workflow and shard file names
- add - tools/lint/skill-exceptions.txt - the known `FAIL` lines of the skill lint, each with its reason
- add - tests/tools/lint/tree-fixture.ts - builds a tree for a rule test from a map of files
- add - tests/tools/lint/engine.unit.test.ts - the engine; calls the engine entry
- add - tests/tools/lint/cap.unit.test.ts - the cap type; calls its check
- add - tests/tools/lint/token-contract.unit.test.ts - the token-contract type; calls its check
- add - tests/tools/lint/forbidden.unit.test.ts - the forbidden type; calls its check
- add - tests/tools/lint/ref-exists.unit.test.ts - the ref-exists type; calls its check
- add - tests/tools/lint/layering.unit.test.ts - the layering type; calls its check
- add - tests/tools/lint/orphan-tags.unit.test.ts - the orphan-tags type; calls its check
- add - tests/tools/lint/script-portability.unit.test.ts - the script-portability type; calls its check
- add - tests/tools/lint/invocations.unit.test.ts - the invocations type; calls its check
- add - tests/tools/lint/tiers.unit.test.ts - the tiers type; calls its check
- delete - tests/portability.unit.test.ts - moved into the script-portability and invocations rules
- delete - tests/orphan-tags.unit.test.ts - moved into the orphan-tags rule
- delete - tests/tiers.unit.test.ts - moved into the tiers rule
- delete - tests/viber/implementor-words.unit.test.ts - its caps moved into `caps.ts`
- delete - tests/viber/memory-rules-words.unit.test.ts - its caps moved into `caps.ts`
- delete - tests/viber/planner-words.unit.test.ts - its caps moved into `caps.ts`
- delete - tests/viber/skill-words.unit.test.ts - its caps moved into `caps.ts`
- delete - tests/viber/code-auditor-words.unit.test.ts - its caps moved into `caps.ts`
- delete - tests/viber/rule-budget.unit.test.ts - its caps moved into `caps.ts`
- modify - tests/viber/hunt-return.test.ts - its header names the orphan tag rule
- modify - tests/viber/keep-units.test.ts - its header names the orphan tag rule
- modify - tests/viber/strip-tag.test.ts - its header names the orphan tag rule
- modify - tests/viber/commit-task-fixture.ts - its comment names the invocations rule
- add - .github/scripts/lint-skills.sh - runs the skill lint over viber and filters the exceptions
- modify - viber/hooks/scripts/session-start.sh - the Node 22.18 check, the banner note and the injected refusal text
- add - viber/hooks/content/node-missing.md - the text that makes every skill refuse
- modify - tests/viber/session-start.critical.test.ts - the Node check cases; calls the hook as a process
- modify - tests/viber/session-start-fixture.ts - staging of an absent and an old `node`
- modify - README.md - the Node requirement
- modify - viber/README.md - the Node requirement
- modify - viber/skills/setup/assets/help.html - the Node requirement in both languages
- modify - .github/workflows/ci.yml - the lint job, the tests job on three systems, the time warning
- modify - .github/workflows/release-version.yml - waits for the `CI` run of the commit
- add - .github/workflows/legacy.yml - the nightly and manual run of the legacy tests
- delete - .github/workflows/full.yml - replaced by `legacy.yml` and the release wait
- delete - .github/scripts/test-shard.ts - the weighted shard split, no longer used
- delete - tests/github/test-shard.unit.test.ts - test of the deleted script
- modify - .claude/rules/tests-running.md - the new commands, layers, lint job and legacy workflow
- modify - .claude/rules/tests-structure.md - the layer names, fakes, contract cases, shared scene

### Out of scope

- Porting any script other than `config.sh`: every other script stays bash and keeps its legacy tests.
- Every caller of `config.sh`: the four skills that preload it, the twelve scripts and the hook that run it, the three scripts whose comments name it, and the legacy tests that stub or name it (`rules-map`, `run-failures`, `plan-index`, `plan-path`, `issue-templates`, `switch-text`, `bootstrap`, `skill-part`, `intent-prose`) stay as they are, because the file keeps its name, call form, output and exit code.
- The binding of `viber/skills/setup/templates/viber.yml` to a fixed table of every default, which the deleted `tests/viber/config.test.ts` held: it returns with the wave that ports `bootstrap.sh`, the script that writes the template into a project.
- `.claude/rules/shell-preload-contract.md` and `.claude/rules/shell-script-header.md`, `viber/BRANCHING.md`, `.claude/viber.yml` and `viber/skills/setup/templates/viber.yml`: what they say of `config.sh` stays true of the wrapper (a header with purpose, reason and a Contract block, a last line `exit 0`, the one parser of the file as seen by its callers).
- Deleting the `config.sh` wrapper: it goes in the wave that ports its callers.
- The twenty-six `*-prose.unit.test.ts` files: they stay as they are.
- Hooks other than the Node check of the session start hook.
- The ports for GitHub, the clock and the environment: each arrives with the first script that needs it.
- Tests that start a Node entry as a process, beyond the one legacy critical file of the config wrapper.
- The other cases of `tests/viber/session-start.test.ts` and of `tests/viber/bootstrap.test.ts` that run the session start hook: the hook's output with a usable Node is unchanged.
- `viber/hooks/hooks.json`: it keeps calling `session-start.sh` through `bash`.
- `pro-designer`'s `check_node.sh` and `idea-validator`'s own Node probe: they keep working under the stricter requirement.
- `tsconfig.json`: its `include` already covers the new directories.
- Every `CLAUDE.md` node naming a changed path (`CLAUDE.md`, `tests/CLAUDE.md`, `tests/harness/CLAUDE.md`, `tests/viber/CLAUDE.md`, `viber/CLAUDE.md`, `viber/hooks/CLAUDE.md`, `viber/scripts/CLAUDE.md` and its sections, `viber/references/CLAUDE.md`, `viber/agents/CLAUDE.md`, `viber/skills/CLAUDE.md` and its sections, `docs/CLAUDE.md`): the build's close rewrites them.
- The recorded plans under `tests/viber/replay/plan-review/` and the archives under `docs/specs/` and `docs/archive/`: they keep naming the old files as recorded.
- The `README.md` line naming `ci.yml` and the `.github/scripts/release.sh` comment naming `release-version.yml`: both stay true.
- Running the suite on Node 22.18 itself: the CI jobs keep Node 24.

## Solution requirements

- Node 22.18 or newer is the hard runtime requirement of the whole plugin; TypeScript runs through Node's type stripping with no build step.
- No npm, no `package.json` and no dependency in the repository: Node built-in modules only. The lint job installs its type checker inside the job.
- Everything works on Windows, macOS and Linux.
- An integration test builds no repository or temp dir of its own: it runs on the shared scene.
- The test step is designed for 40 seconds so a slow runner stays under the 60 second warning.
- `.github/scripts/lint-skills.sh` is bash because the linter it runs is bash; it is retired with that linter's own port and is not one of the two scripts shellcheck covers.
- shellcheck and actionlint are not installed on the developer machine: their first run is the lint job of the first push, and what they report there is fixed after this plan.
- `tsc` 6.0.3 with a Node types package reports no error on the tree as it stands.
- The build's close rewrites the root `CLAUDE.md` (its "nothing lints" trap, its Git Bash rule now holding for the scripts that stay shell, its commands) and `tests/CLAUDE.md` (tiers, full isolation, the sweeps): no task lists them.
- Answered: which ports wave 0 creates -> the file system and git only, the others with the first script that needs them.
- Answered: the three FAIL lines the skill lint prints on viber today -> an exceptions list kept as data, the three files and the linter unchanged.
- Answered: whether config.sh is deleted -> it stays as a thin wrapper running config.ts, so no skill, script or legacy test changes its call.

## Deviations

D1 (AC4): a `.claude/viber.local.yml` that is a directory prints `# local: none | ignored: none` and an agent file name that is a directory counts as found, where the old `config.sh` printed no local line and required a regular file.
