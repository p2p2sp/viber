---
source: /Users/dario/Projects/viber/docs/_specs/2026-11-24-17-14-16_wave-0-of-the-viber-test-rewrite-node-port-skeleton-lint-job/plan.md
planned: /Users/dario/.claude-dario/plans/humming-puzzling-dusk-of-a38707ac-8c95-4b43-b7f5-2a57d846c414.md
---

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
4. `viber/scripts/config.sh` is a wrapper that runs `config.ts` and holds no key grammar; it prints the same stdout with exit 0 for the block and each report, and its callers are unchanged; the config behaviour is proven by unit tests in process and the adapters by one contract test on the shared scene.
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

## Tasks

<!-- TASK -->
### T1 - Declare the ports with their fakes, contract cases and the layer guard
- TDD: required
- Covers: AC3
- Uses: C1, C8, C9
- Depends-on: none
- Files: viber/lib/ports.ts, tests/harness/fakes.ts, tests/harness/ports-contract.ts, tests/harness/scene.ts, tests/harness/test.ts, tests/harness.unit.test.ts, tests/viber/lib/fakes.unit.test.ts
- Delivers: the two port interfaces, one in-memory fake of each seeded from the scene state, the contract cases written against the ports alone, the shared scene that writes the same state into one throwaway git repository per test process, and a harness that refuses an unmarked test file and keeps unit files off the network
- Verification: node --test tests/viber/lib/fakes.unit.test.ts tests/harness.unit.test.ts -> every case passes
- DoD: a file given to the fake file system reads back as its text, an absent path reads as null and a path marked unreadable exists yet reads as null; the fake file system answers exists for a file and for a directory holding one, and lists the entry names of a directory sorted; the fake git answers the repository root for a cwd at or below the root it was given and null for a cwd outside it, and lists the tracked files it was given with their modes in order; the layer function of C9 gives null for a test file name carrying no layer marker of C8 that is no legacy file, and the refusal the harness runs at load throws a line naming the markers for such a name; a network connection opened from a unit file fails with a line saying unit tests stay off the network
<!-- /TASK -->

<!-- TASK -->
### T2 - Add the real adapters with their contract test
- TDD: none
- Covers: AC3, AC4
- Uses: C1, C8, C9
- Depends-on: T1
- Files: viber/lib/adapters/fs.ts, viber/lib/adapters/git.ts, tests/viber/lib/adapters.integration.test.ts, tests/tiers.unit.test.ts
- Delivers: the node:fs and git command adapters of the two ports, the integration test that hands them to the shared contract cases on the shared scene, and a tier sweep that knows the integration layer
- Verification: node --test --test-name-pattern "no such case" tests/viber/lib/adapters.integration.test.ts && grep -n "trackedFiles" viber/lib/adapters/git.ts tests/harness/ports-contract.ts && node --test tests/tiers.unit.test.ts -> the integration file loads and runs no case, the identifier is found on both sides, and the tier sweep passes
- DoD: the two adapters declare every operation of C1 and hold no decision beyond mapping the dependency's answer to the port's values; the integration test runs the contract cases of C9 against the adapters on the shared scene, one case per adapter behaviour, and builds no repository or temp dir of its own; the tier sweep counts an integration file as a tier of its own that needs no critical sibling
<!-- /TASK -->

<!-- TASK -->
### T3 - Resolve the switch block of the config in the Node core
- TDD: required
- Covers: AC3, AC4
- Uses: C1, C2, C9
- Depends-on: T1
- Files: viber/lib/config/lines.ts, viber/lib/config/block.ts, viber/lib/config/run.ts, tests/viber/config/lines.unit.test.ts, tests/viber/config/block.unit.test.ts, tests/viber/config/run.unit.test.ts
- Delivers: the config core entry printing the resolved block with every switch read from `.claude/viber.yml` through the ports
- Verification: node --test tests/viber/config/lines.unit.test.ts tests/viber/config/block.unit.test.ts tests/viber/config/run.unit.test.ts -> every case passes
- DoD: with no `.claude/viber.yml` the output is the whole block of C2 in its fixed order, every switch `false`, `build.baseline-tests: off`, both extension lines `none` and every other line at its default; a switch reads `true` only as a child of its own group spelled exactly, with the value `true` in any letter case ended by a blank, a comment or the line end, and `false` as a column-0 key, under another group or absent; `build.baseline-tests` reads `full` for `full` or `true` and `fast` for `fast`, in any letter case, and `off` for any other value; a group is a column-0 key and its children the indented key lines below it up to the next column-0 key, a blank line or a column-0 comment leaving it open, the first assignment of a child winning and a CR never reaching a value; the file is read from the repository root when the cwd is a subdirectory of the repository, and from the cwd outside a repository; an argument other than the four report flags gives the block
<!-- /TASK -->

<!-- TASK -->
### T4 - Resolve titles, directories and tiers in the config block
- TDD: required
- Covers: AC4
- Uses: C1, C2, C9
- Depends-on: T3
- Files: viber/lib/config/block.ts, tests/viber/config/block.unit.test.ts
- Delivers: the title, directory and tier lines of the block read from the file with their defaults
- Verification: node --test tests/viber/config/block.unit.test.ts -> every case passes
- DoD: a title value opening on a quote with its closing pair is everything between the two, kept whole; an unquoted title is cut at the first blank followed by `#` with trailing blanks dropped, and an empty value, a comment alone or an absent key gives the default of C2; a directory value is the first assignment inside `directories:` cut at the first blank or `#`, and a value not matching `[A-Za-z0-9._-]+`, a value of `.` or `..` or a key outside the group gives the default; a tier value, cut at the first blank or `#`, of haiku, sonnet, opus or fable in any letter case is printed lowercase and any other value gives that key's default; `tiers.min` above `tiers.max` gives both defaults
<!-- /TASK -->

<!-- TASK -->
### T5 - Resolve the build.extensions map into steps
- TDD: required
- Covers: AC4
- Uses: C1, C2, C9
- Depends-on: T4
- Files: viber/lib/config/extensions.ts, viber/lib/config/lines.ts, viber/lib/config/block.ts, tests/viber/config/extensions.unit.test.ts
- Delivers: the `build.extensions` and `build.extensions-missing` lines of the block
- Verification: node --test tests/viber/config/extensions.unit.test.ts -> every case passes
- DoD: an entry of the `extensions:` map under `build:` whose name matches `^[a-z0-9][a-z0-9-]*$` and whose agent file exists under `.claude/agents/` of the repository is found, and every other name is missing; consecutive found entries marked `parallel: true` in any letter case join into one step with ` + `, a found entry not marked parallel is a step alone, and the first `parallel` of an entry wins; missing names are dropped before the steps are grouped and listed on `build.extensions-missing` in listed order, each line reading `none` when it has no name; the map ends at the first line that is neither blank nor a comment and is indented no deeper than its key, a value after the key other than a comment gives no entry, the first key line of the map sets the entry depth, a deeper key line is an option of the entry above, a shallower one is ignored and an entry's inline value is ignored; a name counts once, at its first entry with that entry's option, and a map outside `build:` gives no name; a line of the map is never read as a child of `build:`, so an entry named like a switch changes no switch
<!-- /TASK -->

<!-- TASK -->
### T6 - Print the branching report
- TDD: required
- Covers: AC4
- Uses: C1, C2, C3, C9
- Depends-on: T5
- Files: viber/lib/config/branching.ts, viber/lib/config/run.ts, viber/lib/config/block.ts, tests/viber/config/branching.unit.test.ts
- Delivers: the `--branching` report and the `branching.mode` line of the block
- Verification: node --test tests/viber/config/branching.unit.test.ts -> every case passes
- DoD: `--branching` prints the `mode:` line first, `off` unless the direct child `mode` of `branching:` reads off, allowed or required in any letter case, printed lowercase, and `mode: off` alone with no file or no group; one `entry:` line per valid work entry in file order with its base, name and target, each value cut and matched as C3 states; a work entry with an invalid key, a missing or invalid field or the `{issue}` placeholder is dropped and prints its `error:` lines of C3 in base, name, target order; one `map:` line per mapping naming a valid entry and the `error:` line of C3 for a mapping naming none; a `base:` or `name:` directly under `branching:` prints the legacy `error:` line of C3, and a mode other than off with no valid entry prints `error: no valid branching.work entry`; the `branching.mode` line of the block carries the mode this report prints
<!-- /TASK -->

<!-- TASK -->
### T7 - Print the red-check, questions and specifications reports
- TDD: required
- Covers: AC4
- Uses: C1, C2, C4, C9
- Depends-on: T6
- Files: viber/lib/config/reports.ts, viber/lib/config/run.ts, viber/lib/config/block.ts, tests/viber/config/reports.unit.test.ts
- Delivers: the three one-purpose reports of the config
- Verification: node --test tests/viber/config/reports.unit.test.ts -> every case passes
- DoD: `--red-check` prints exactly the two lines of C4, both lists at their defaults with no file; a list value is cut at the first blank followed by `#`, its entries joined by one space, and an empty value or a comment alone gives the default list; `--questions` prints the value of `planning.questions-per-round`, cut at the first blank or `#`, when it matches `^([1-9]|10|all)$` and `5` for any other value or none; `--specifications` prints the `directories.specifications` value resolved as the block resolves it, `specs` for an invalid one
<!-- /TASK -->

<!-- TASK -->
### T8 - Apply the local config file overrides
- TDD: required
- Covers: AC4
- Uses: C1, C2, C4, C9
- Depends-on: T7
- Files: viber/lib/config/local.ts, viber/lib/config/block.ts, viber/lib/config/reports.ts, viber/lib/config/run.ts, tests/viber/config/local.unit.test.ts
- Delivers: the five overrides of `.claude/viber.local.yml` and the local line of the block
- Verification: node --test tests/viber/config/local.unit.test.ts -> every case passes
- DoD: a valid local value of `tiers.min`, `tiers.max`, `build.baseline-tests`, `github.issues` or `planning.questions-per-round` replaces that one shared value, in the block and in `--questions`; an empty or invalid local value leaves the shared value; when the local file exists the second line of the block is the local line of C2, naming the overridden keys in block order and the ignored keys in file order, each key once, `none` for an empty list; the min above max reset runs on the merged range; a local file that exists and cannot be read prints `# local: none | ignored: none`; `--branching` and `--red-check` print the same with and without a local file
<!-- /TASK -->

<!-- TASK -->
### T9 - Add the config entry and turn config.sh into its wrapper
- TDD: required
- Covers: AC3, AC4
- Uses: C1, C2, C5
- Depends-on: T2, T8
- Files: viber/scripts/config.ts, viber/scripts/config.sh, tests/viber/config.critical.test.ts, tests/viber/config.test.ts, tests/viber/config-fixture.ts, tests/harness/stub.ts, tests/viber/merge-settings.test.ts, tests/viber/task-step.test.ts, .github/scripts/test-shard.ts
- Delivers: the entry that runs the config core on the real adapters, `config.sh` reduced to the wrapper of C5 with a header that keeps its purpose, its reason and a Contract block, the contract of the grammar carried by the header of the entry, the legacy logic file of the old grammar deleted with its weight entry in the shard script and the header of the config fixture naming only the file that still uses it, and a harness whose core utilities path reaches the running Node through a directory holding a `node` shim alone, its former value kept as the shell utilities path
- Verification: node --test tests/viber/config.critical.test.ts && node --test --test-name-pattern "node" tests/viber/merge-settings.test.ts && node --test --test-name-pattern "red-check" tests/viber/task-step.test.ts && node --test tests/github/test-shard.unit.test.ts && grep -n "runConfig" viber/scripts/config.ts viber/lib/config/run.ts && grep -n "Contract:" viber/scripts/config.sh viber/scripts/config.ts -> every selected case passes and each identifier is found in both files
- DoD: `config.sh` run in a project prints the block the core resolves for that project and exits 0; a report flag given to `config.sh` prints that report; under the shell utilities path of the harness, which holds no `node`, `config.sh` prints nothing and exits 0, the case skipped where `node` shares a directory with those utilities; under the core utilities path of the harness `config.sh` prints the block, so a legacy case that pins `PATH` to it keeps its config output; the legacy cases of `task-step` that run a copied plugin still read the project's switches, their copy holding `config.ts` and the core beside the scripts; the cases of `merge-settings` that stage a missing Node still run without one, staged by the shell utilities path
<!-- /TASK -->

<!-- TASK -->
### T10 - Build the rule engine, its entry and the cap rule type
- TDD: required
- Covers: AC5
- Uses: C1, C6, C9
- Depends-on: T2
- Files: tools/lint/engine.ts, tools/lint/tree.ts, tools/lint/run.ts, tools/lint/rules/cap.ts, tests/tools/lint/tree-fixture.ts, tests/tools/lint/engine.unit.test.ts, tests/tools/lint/cap.unit.test.ts
- Delivers: the engine that runs rule instances against a tree after proving each selected type on its bad sample, the entry that discovers types and data and prints, the tree fixture of the rule tests, and the `cap` type
- Verification: node --test tests/tools/lint/engine.unit.test.ts tests/tools/lint/cap.unit.test.ts -> every case passes
- DoD: a rule whose check reports gives one finding line in the form of C6 and status 1; a run with no finding gives status 0 and the summary line of C6; a selected rule type whose bad sample yields no finding prints the self-check line of C6, fails the run, and no rule of that type runs; a selected rule naming a type that does not exist prints the unknown type line of C6 with status 1, and an argument selecting no rule gives status 2; a file over its word cap is reported with its count and its cap, and one exactly at the cap passes; a read set over its byte cap is reported with its bytes and its cap, counting whole files and named sections as C6 states
<!-- /TASK -->

<!-- TASK -->
### T11 - Move the word and byte caps into rule data
- TDD: none
- Covers: AC5
- Uses: C6
- Depends-on: T10
- Files: tools/lint/data/caps.ts, tests/viber/implementor-words.unit.test.ts, tests/viber/memory-rules-words.unit.test.ts, tests/viber/planner-words.unit.test.ts, tests/viber/skill-words.unit.test.ts, tests/viber/code-auditor-words.unit.test.ts, tests/viber/rule-budget.unit.test.ts
- Delivers: every word cap of the five word-cap test files and every byte cap of the rule budget test as `cap` rule instances, the six test files gone
- Verification: node tools/lint/run.ts cap && grep -n "1775" tools/lint/data/caps.ts -> the lint exits 0 and the planner cap is in the data
- DoD: each cap of the six test files is one `cap` rule with the same files, sections and number, its reason for the number kept in the rule's `why`; the six test files are deleted; the `cap` rules pass on the tree
<!-- /TASK -->

<!-- TASK -->
### T12 - Add the token-contract and forbidden rule types and the dash rule
- TDD: required
- Covers: AC5
- Uses: C6
- Depends-on: T10
- Files: tools/lint/rules/token-contract.ts, tools/lint/rules/forbidden.ts, tools/lint/data/dashes.ts, tests/tools/lint/token-contract.unit.test.ts, tests/tools/lint/forbidden.unit.test.ts
- Delivers: the two rule types, each with its bad sample, and the rule that keeps the em dash and the en dash out of the tracked text files
- Verification: node --test tests/tools/lint/token-contract.unit.test.ts tests/tools/lint/forbidden.unit.test.ts && node tools/lint/run.ts forbidden -> every case passes and the lint exits 0
- DoD: a listed file lacking the token of a token-contract rule is reported with the file and the token; a listed file the tree does not hold is reported; a tracked file under the include globs of a forbidden rule holding one of its tokens is reported with the line; a file under the exclude globs of a forbidden rule is not reported; the dash rule sweeps the tracked text files outside `docs/`, excludes `viber/hooks/content/manifest.md`, `tests/viber/ui-tells.unit.test.ts` and its own data file, which name the two characters, and reports nothing on the tree
<!-- /TASK -->

<!-- TASK -->
### T13 - Add the ref-exists rule type over viber's references
- TDD: required
- Covers: AC5
- Uses: C6
- Depends-on: T10
- Files: tools/lint/rules/ref-exists.ts, tools/lint/data/plugin-refs.ts, tests/tools/lint/ref-exists.unit.test.ts
- Delivers: the rule type resolving the plugin paths, agent and skill names, commands and manifest entries a shipped file names, and its instance over viber
- Verification: node --test tests/tools/lint/ref-exists.unit.test.ts && node tools/lint/run.ts ref-exists -> every case passes and the lint exits 0
- DoD: a root variable path of C6 naming no tracked file or directory is reported with its line, a skill root path resolving against the skill directory of the file naming it and a placeholder remainder being skipped; a `viber:` name that is neither an agent file nor a skill directory is reported, a name inside a tag being skipped; a `/viber:` command naming no skill directory is reported; a path the `skills` or `agents` list of `plugin.json` holds that the tree does not is reported; a reference listed in the exceptions of a rule is not reported; the instance sweeps every `SKILL.md`, part, fragment and agent file of viber, `hooks.json`, `plugin.json` and the help page, and reports nothing on the tree, its one exception the template example of the `skill-designer` skill
<!-- /TASK -->

<!-- TASK -->
### T14 - Add the layering rule type over the core and the new tests
- TDD: required
- Covers: AC3, AC5
- Uses: C6, C8
- Depends-on: T9, T10
- Files: tools/lint/rules/layering.ts, tools/lint/data/layering.ts, tests/tools/lint/layering.unit.test.ts
- Delivers: the rule type that keeps the core pure, the entries thin, every core module tested and the unit tests off the outside world, and its instance
- Verification: node --test tests/tools/lint/layering.unit.test.ts && node tools/lint/run.ts layering -> every case passes and the lint exits 0
- DoD: a core module importing one of the rule's outside modules is reported with the import, and a module under the adapters globs is not; an entry file whose lines, comment and blank lines not counted, pass the entry cap is reported; a core module with no unit test file of its own name in its mapped test directory, or under no mapping at all, is reported, and a module under the adapters globs or the exempt list is not; a unit test file under the swept test directories importing one of the rule's forbidden modules is reported; the instance holds `viber/lib` as the core with `viber/lib/adapters` as adapters and `viber/lib/ports.ts` exempt, the outside modules `node:fs`, `node:child_process`, `node:os`, `node:net`, `node:http` and `node:https`, the entries `viber/scripts/*.ts` and `tools/lint/run.ts` at a cap of 40 lines, the mapping of `viber/lib/config` to `tests/viber/config`, and the unit tests of `tests/viber/config`, `tests/viber/lib` and `tests/tools/lint` forbidden `node:child_process`, `node:net`, `node:http`, `node:https` and the spawning helpers of the harness (`run.ts`, `tmp.ts`, `stub.ts`, `shells.ts`, `scene.ts`), and it reports nothing on the tree
<!-- /TASK -->

<!-- TASK -->
### T15 - Move the orphan tag sweep into a rule
- TDD: required
- Covers: AC5
- Uses: C6
- Depends-on: T10
- Files: tools/lint/rules/orphan-tags.ts, tools/lint/data/orphan-tags.ts, tests/tools/lint/orphan-tags.unit.test.ts, tests/orphan-tags.unit.test.ts, tests/viber/hunt-return.test.ts, tests/viber/keep-units.test.ts, tests/viber/strip-tag.test.ts
- Delivers: the orphan tag check as a rule type with its instance `orphan-tags/tracked` over the tracked files outside `docs/`, its own samples built from escapes so the rule passes over its own files, the sweep test file deleted and the three legacy test headers that named it naming the rule
- Verification: node --test tests/tools/lint/orphan-tags.unit.test.ts && node tools/lint/run.ts orphan-tags && grep -n "orphan-tags/tracked" tests/viber/strip-tag.test.ts tests/viber/hunt-return.test.ts tests/viber/keep-units.test.ts tools/lint/data/orphan-tags.ts && test ! -e tests/orphan-tags.unit.test.ts -> every case passes, the lint exits 0, the rule id `orphan-tags/tracked` is in all four files and the sweep file is gone
- DoD: a line holding only a closing tag with no opener of that name in the same file is reported, indented or not; a balanced tag, a namespaced tag whose opener is in the file and a closing tag named inline in prose are not reported; a binary file and a file under `docs/` are not swept
<!-- /TASK -->

<!-- TASK -->
### T16 - Move the script portability checks into a rule
- TDD: required
- Covers: AC5
- Uses: C6
- Depends-on: T10
- Files: tools/lint/rules/script-portability.ts, tools/lint/data/script-portability.ts, tests/tools/lint/script-portability.unit.test.ts
- Delivers: the shebang, line ending, bash-only and GNU-only checks as one rule type with its instance over the tracked `.sh` and `.ts` files outside `tests/` and `docs/`
- Verification: node --test tests/tools/lint/script-portability.unit.test.ts && node tools/lint/run.ts script-portability -> every case passes and the lint exits 0
- DoD: a `.sh` file with no shebang is reported and a `.ts` module with none is not; a file holding a CRLF line ending is reported; bash-only syntax in a `#!/bin/sh` script is reported, a POSIX bracket class and `$((` arithmetic are not, and a bash script is skipped; a GNU-only tool form, a gawk-only function or a bash 4 expansion is reported unless the file pairs it with its BSD counterpart; a comment line naming such a form is not reported
<!-- /TASK -->

<!-- TASK -->
### T17 - Move the invocation checks into a rule and delete the portability sweep
- TDD: required
- Covers: AC5
- Uses: C6
- Depends-on: T16
- Files: tools/lint/rules/invocations.ts, tools/lint/data/invocations.ts, tests/tools/lint/invocations.unit.test.ts, tests/portability.unit.test.ts, tests/viber/commit-task-fixture.ts
- Delivers: the exec bit, preload quoting and fragment call checks as one rule type with its instance over viber's skills, parts, fragments and `hooks.json`, the sweep test file deleted and the comment of the commit task fixture naming the rule
- Verification: node --test tests/tools/lint/invocations.unit.test.ts && node tools/lint/run.ts invocations && grep -n "invocations" tests/viber/commit-task-fixture.ts tools/lint/data/invocations.ts && test ! -e tests/portability.unit.test.ts -> every case passes, the lint exits 0, the rule id is in both files and the sweep file is gone
- DoD: a script invoked bare from a skill, part, fragment or `hooks.json` line whose index mode is 100644 is reported, and one invoked through `bash`, `sh` or `node` is not; a preload argument holding a glob character outside quotes is reported; a plugin or skill root variable outside double quotes in a preload is reported; a `switch-text.sh` call naming an unknown key, or a fragment with no file for any valid value of its key, is reported; a fragment file whose value suffix is not a valid value of the key its own skill's calls name it under is reported; a fragment file no skill of its own calls is reported
<!-- /TASK -->

<!-- TASK -->
### T18 - Move the tier checks into a rule that knows the new layers
- TDD: required
- Covers: AC5
- Uses: C6, C8
- Depends-on: T10
- Files: tools/lint/rules/tiers.ts, tools/lint/data/tiers.ts, tests/tools/lint/tiers.unit.test.ts, tests/tiers.unit.test.ts
- Delivers: the legacy tier pairing and budget checks as a rule type with its instance, unit and integration files being layers of their own, the sweep test file deleted
- Verification: node --test tests/tools/lint/tiers.unit.test.ts && node tools/lint/run.ts tiers && test ! -e tests/tiers.unit.test.ts -> every case passes, the lint exits 0 and the sweep file is gone
- DoD: a legacy logic file with no critical sibling is reported unless the rule's exemptions name it; an exemption naming a missing file, a file that is not a logic file or one that has a sibling is reported as stale; a critical file registering no case is reported; a critical tier over its budget of case sites is reported with both numbers; a unit file and an integration file need no sibling and count toward no budget
<!-- /TASK -->

<!-- TASK -->
### T19 - Run the skill lint over viber with an exceptions list
- TDD: none
- Covers: AC5
- Uses: none
- Depends-on: none
- Files: .github/scripts/lint-skills.sh, tools/lint/skill-exceptions.txt
- Delivers: the CI script that runs `lint_skill.sh` over every skill directory and agent file of viber and fails on a `FAIL` line the exceptions file does not hold; a script of the CI tooling with no plugin behaviour, proven by its two runs below and by no new legacy test file
- Verification: bash .github/scripts/lint-skills.sh && bash .github/scripts/lint-skills.sh /dev/null || echo refused -> the first run ends on a line counting 3 known exceptions and 0 new failures, the second prints the three FAIL lines and then refused
- DoD: the script runs the skill lint over every skill directory and every agent file of viber and drops the output lines about a `CLAUDE` memory file; a `FAIL` line the exceptions file does not hold is printed and the script exits 1; the exceptions file, its path the optional first argument, holds the three `FAIL` lines viber prints today, each under a comment line giving its reason; with every `FAIL` line an exception the script exits 0 and its last line counts the exceptions and the new failures; the header of the script carries its purpose, its reason and a Contract block
<!-- /TASK -->

<!-- TASK -->
### T20 - Check for Node 22.18 at session start
- TDD: required
- Covers: AC6
- Uses: C7
- Depends-on: none
- Files: viber/hooks/scripts/session-start.sh, viber/hooks/content/node-missing.md, tests/viber/session-start.critical.test.ts, tests/viber/session-start-fixture.ts
- Delivers: the session start hook naming the Node requirement and injecting the refusal text when no usable Node is on `PATH`, the refusal text read from the content directory the manifest is read from, the Contract block of the hook's header stating the note and the injected text, and a fixture that stages an absent `node` by a `PATH` built from the directories of `grep` and `bash` alone (the case skipped where `node` shares one of them) and an old one by a stub
- Verification: node --test tests/viber/session-start.critical.test.ts -> every case passes
- DoD: with no `node` on `PATH` the systemMessage ends on the banner note of C7 reading `none`, additionalContext opens with the node-missing text ahead of the manifest, and the hook exits 0; with a `node` reporting a version below 22.18 the same happens and the note names the version found; with a `node` reporting 22.18.0 or newer, a 23 or a 24 included, the output is the banner and the manifest alone; a version that does not parse is treated as no Node; with no usable Node and no readable manifest additionalContext is the node-missing text alone; with no usable Node and no readable node-missing file the banner note still prints and additionalContext is the manifest alone
<!-- /TASK -->

<!-- TASK -->
### T21 - State the Node requirement in the docs
- TDD: none
- Covers: AC6
- Uses: C6, C7
- Depends-on: T12, T20
- Files: README.md, viber/README.md, viber/skills/setup/assets/help.html, tools/lint/data/node-requirement.ts
- Delivers: the three user documents stating Node 22.18 or newer as required, and the rule that keeps the requirement token in them and in the hook content
- Verification: node tools/lint/run.ts token-contract && node --test tests/viber/help.unit.test.ts && ! grep -q -e "22\.6" -e "Node.js 18" README.md viber/README.md viber/skills/setup/assets/help.html -> the lint exits 0, the help page tests pass and the negated grep finds neither form, so the chain exits 0
- DoD: the requirements table of `README.md` states Node.js 22.18 or newer as required by every viber skill and hook, and no row names Node 22.6, Node 18 or an optional `node`; `viber/README.md` states the same requirement; the help page states it in English and in Polish and calls Node optional nowhere; a `token-contract` rule holds the token `Node.js 22.18` in the three documents and in `viber/hooks/content/node-missing.md`
<!-- /TASK -->

<!-- TASK -->
### T22 - Rebuild the CI workflow around lint and the two layers
- TDD: none
- Covers: AC1, AC2, AC5
- Uses: C6, C8
- Depends-on: T10, T19, T20
- Files: .github/workflows/ci.yml
- Delivers: the one push workflow: a lint job on Linux and a tests job on the three systems with the time warning
- Verification: grep -n "lint-skills.sh" .github/workflows/ci.yml .github/scripts/lint-skills.sh && grep -q "integration.test.ts" .github/workflows/ci.yml && grep -q "::warning::" .github/workflows/ci.yml && grep -q "GITHUB_STEP_SUMMARY" .github/workflows/ci.yml && grep -q "macos-latest" .github/workflows/ci.yml && grep -q "shellcheck" .github/workflows/ci.yml -> a match in both files, and the chain exits 0 with each of the five names in the workflow
- DoD: a lint job on ubuntu-latest runs as separate steps `tsc --noEmit` with typescript 6.0.3 and one exact `@types/node` version installed by `npm install --no-save` inside the job, actionlint at one exact release, shellcheck over `.github/scripts/release.sh` and `viber/hooks/scripts/session-start.sh`, `bash .github/scripts/lint-skills.sh` and the lint entry of C6 with no argument; a tests job runs on ubuntu-latest, windows-latest and macos-latest the push command of C8, with no shell matrix variable and no shard; a guard step fails when either glob of the push command matches no tracked file; a test step longer than 60 seconds writes a `::warning::` annotation and a job summary line naming the seconds, and the job passes; the workflow keeps its name `CI`, its triggers and its concurrency group; no step or comment names `full.yml` or a legacy tier
<!-- /TASK -->

<!-- TASK -->
### T23 - Make the release wait for the CI run of its commit
- TDD: none
- Covers: AC2
- Uses: none
- Depends-on: T22
- Files: .github/workflows/release-version.yml
- Delivers: a release workflow with no suite of its own, gated on the `CI` run of the released commit
- Verification: grep -n -e "^name: CI" -e "--workflow CI" .github/workflows/ci.yml .github/workflows/release-version.yml -> one match in each file
- DoD: the `Full` job and the `needs` naming it are gone; before the bump step the Release job finds the newest run of the workflow `CI` for the released commit and waits for it with `gh run watch --exit-status`, so a failed or cancelled run fails the release; a commit with no `CI` run fails the release with a line saying so; the job holds `actions: read` beside `contents: write`
<!-- /TASK -->

<!-- TASK -->
### T24 - Move the legacy tests to their own nightly workflow
- TDD: none
- Covers: AC2, AC7
- Uses: C8
- Depends-on: T9, T23
- Files: .github/workflows/legacy.yml, .github/workflows/full.yml, .github/scripts/test-shard.ts, tests/github/test-shard.unit.test.ts, tests/harness/shells.ts
- Delivers: the workflow running the legacy tests nightly and on demand, the full workflow and the shard script gone
- Verification: grep -n -e "P2P2_SHELL_MATRIX" -e "legacy" .github/workflows/legacy.yml tests/harness/shells.ts -> both names matched in both files
- DoD: `legacy.yml` runs on a nightly schedule and on manual dispatch only, on ubuntu-latest and windows-latest, every tracked `*.test.ts` that is neither a unit nor an integration file, under `P2P2_SHELL_MATRIX=full`; its Windows leg splits into four jobs by node's own `--test-shard`; no workflow calls it or needs it; `full.yml`, the shard script and its test are deleted; the header of `tests/harness/shells.ts` names the legacy workflow as the one setting the full shell matrix
<!-- /TASK -->

<!-- TASK -->
### T25 - Rewrite the test rules for the layers and retire the old names
- TDD: none
- Covers: AC2, AC5, AC7
- Uses: C6, C8, C9
- Depends-on: T12, T18, T24
- Files: .claude/rules/tests-running.md, .claude/rules/tests-structure.md, tools/lint/data/retired.ts
- Delivers: the two test rule files describing the layers, the lint job and the legacy workflow as they now stand, and the rule keeping the retired workflow and shard file names out of the tree
- Verification: node tools/lint/run.ts forbidden && grep -n "integration.test.ts" .claude/rules/tests-structure.md .github/workflows/ci.yml -> the lint exits 0 and the layer name is in both files
- DoD: `tests-running.md` states the push command of C8, the 40 second design budget under the 60 second warning, the lint job with its local command, and the legacy workflow as the only place a legacy file runs, and names no retired workflow, no shard and no deleted test file in its examples; `tests-structure.md` states the layers of C8, where the fakes, the contract cases and the shared scene of C9 live, that an integration test builds no repository of its own, that no new legacy file is added, and the `tiers` rule as the place holding the legacy pairing and budget, its examples naming `viber/scripts/config.ts` with its unit tests and no deleted sweep; a `forbidden` rule holds the two tokens `full.yml` and `test-shard.ts` out of every tracked file outside `docs/`, the `CLAUDE` memory files and its own data file, and passes on the tree
<!-- /TASK -->

## Contracts

### C1 - Ports

File: viber/lib/ports.ts

```ts
export interface Fs {
  /** The file's text as UTF-8; null when the path is absent, a directory or unreadable. */
  readText(path: string): string | null;
  /** True for an existing file or directory. */
  exists(path: string): boolean;
  /** The entry names of a directory, sorted; empty when the path is absent or not a directory. */
  listDir(path: string): string[];
}

/** path: repo-relative, forward slashes. mode: as the index holds it, "100644" or "100755". */
export interface TrackedFile { path: string; mode: string }

export interface Git {
  /** The top level of the work tree holding cwd, forward slashes; null outside a repository. */
  repoRoot(cwd: string): string | null;
  /** Every file in the index of the repository at root, in index order. */
  trackedFiles(root: string): TrackedFile[];
}
```

### C2 - Config core entry and block

File: viber/lib/config/run.ts

```ts
/** The whole stdout of one config call, every line ended by "\n". Never throws. */
export function runConfig(argv: string[], cwd: string, ports: { fs: Fs; git: Git }): string
```

```
argv[0]        --branching -> C3; --red-check, --questions, --specifications -> C4; anything else, or nothing -> the block
files          <root>/.claude/viber.yml and <root>/.claude/viber.local.yml; <root> is git.repoRoot(cwd), else cwd
```

```
# viber config (resolved)
# local: <overridden> | ignored: <ignored>        only when the local file exists
planning.adr: true|false
planning.outside-plan-review: true|false
build.baseline-tests: off|fast|full
build.final-review: true|false
build.memory: true|false
build.rules: true|false
build.qa: true|false
build.cleanup: true|false
build.red-check: true|false
github.issues: true|false
github.issue-title: <pattern>                     default {summary}
github.pr-title: <pattern>                        default [{issue-number}] {summary}
build.extensions: <step>, <step> | none
build.extensions-missing: <name>, <name> | none
directories.runs: <name>                          default _specs
directories.specifications: <name>                default specs
tiers.min: haiku|sonnet|opus|fable                default haiku
tiers.max: haiku|sonnet|opus|fable                default opus
branching.mode: off|allowed|required
```

```
<overridden>   the keys that took a local value, in block order, planning.questions-per-round after tiers.max, joined by ", ", "none" when empty
<ignored>      every other direct child of a group as <group>.<key> and every column-0 key carrying a value as <key>, in file order, joined by ", ", "none" when empty
```

### C3 - Branching report

File: viber/lib/config/branching.ts

```
mode: off|allowed|required
entry: <key> | base: <branch> | name: <pattern> | target: <branch>
map: <issue type> | <entry key>
error: <reason>
```

```
order          mode: once, first; entry: once per valid work entry and map: once per mapping naming a valid entry, each in file order; then the error: lines
values         cut at the first blank or #
entry key      [A-Za-z0-9._-]+
base, target   [A-Za-z0-9._/-]+, not starting with - or /, no ..
name           one surrounding quote pair stripped, [A-Za-z0-9._/{}-]+
issue type     one surrounding quote pair stripped, kept verbatim
```

```
branching.base and branching.name are no longer read - move them into a branching.work entry
work entry <key>: invalid key: <key>
work entry <key>: missing <base|name|target>
work entry <key>: invalid <base|name|target>: <value>
work entry <key>: {issue} is now {issue-number}
issue-type-mappings: <type> names no work entry: <key>
no valid branching.work entry
```

### C4 - Config reports

File: viber/lib/config/reports.ts

```
--red-check        red-check.tests: <pattern> <pattern> ...
                   red-check.links: <directory name> ...
--questions        <1 to 10 | all>                 default 5
--specifications   <directories.specifications>    default specs
keys               build.red-check-tests, build.red-check-links, planning.questions-per-round
default tests      __tests__/ tests/ test/ *.Tests/ *.UnitTests/ *.IntegrationTests/ *.test.* *.spec.* test_*.py *_test.py *_test.go *Test.java *Test.kt conftest.py testdata/ __mocks__/ __fixtures__/ fixtures/ jest.config.* vitest.config.*
default links      node_modules
```

### C5 - Config wrapper

File: viber/scripts/config.sh

```
call        "<plugin root>/scripts/config.sh" [--branching | --red-check | --questions | --specifications]      unchanged for every caller
runs        node on the config.ts beside it, with the arguments it was given
stdout      what config.ts prints; nothing when node is absent or fails
exit        always 0
mode        100755, #!/usr/bin/env bash
```

### C6 - Lint rule shapes and entry

File: tools/lint/engine.ts, tests/tools/lint/tree-fixture.ts

```ts
export interface Tree {
  files: TrackedFile[];                  // the index of the repository
  read(path: string): string | null;     // a file of the working tree, repo-relative
  list(dir: string): string[];           // the working tree entry names of a directory
}
/** line 0 when the finding is about the whole file. */
export interface Finding { path: string; line: number; message: string }
export interface RuleType<P> {
  name: string;
  check(tree: Tree, params: P): Finding[];
  selfCheck: { tree: Tree; params: P };  // a bad sample on which check must report
}
/** id is "<type>/<name>". */
export interface RuleInstance { id: string; type: string; params: unknown; why: string }
export function runLint(tree: Tree, types: RuleType<any>[], rules: RuleInstance[], selected: string[]): { lines: string[]; status: 0 | 1 | 2 }

// tests/tools/lint/tree-fixture.ts
export function treeOf(files: Record<string, string>, modes?: Record<string, string>): Tree   // mode 100644 unless given
```

```
finding line        <path>:<line>: [<rule id>] <message>
self-check line     self-check: <type> reported nothing on its bad sample
unknown type line   <rule id>: unknown rule type <type>
summary line        lint: <n> findings, <m> rules          always last
status              0 no finding; 1 a finding, a failed self-check or an unknown type; 2 a selected argument matching no rule
selection           an argument selects every rule whose id equals it or starts with "<argument>/"; none selects all
scope               a self-check and the unknown type check run only for the types of the selected rules
entry               node tools/lint/run.ts [<type or rule id>...]      from any directory of the repository
discovery           every tools/lint/rules/*.ts default-exports a RuleType; every tools/lint/data/*.ts exports rules: RuleInstance[]
```

```
cap params             { files: Array<{ path: string; sections?: string[] }>; unit: "words" | "bytes"; max: number }
                       words: the text split on whitespace, empty pieces dropped; bytes: UTF-8
                       a section runs from its "## " heading line to the next "## " line or the end of the file
token-contract params  { token: string; files: string[] }
forbidden params       { tokens: string[]; include: string[]; exclude: string[] }                  globs over tracked paths
ref-exists params      { sweep: string[]; pluginRoot: string; manifest?: string; except: Array<{ file: string; ref: string }> }
                       root variable path: ${CLAUDE_PLUGIN_ROOT}/ or ${CLAUDE_SKILL_DIR}/ followed by [A-Za-z0-9._/-]+, trailing "." and "/" stripped; an empty remainder is skipped
                       it resolves when a tracked path equals it or sits below it
                       name: viber:<[a-z][a-z0-9-]*> not preceded by "/" ; command: /viber:<[a-z][a-z0-9-]*>; either one directly after "<" or "</" is a tag and skipped
                       manifest: each entry of its skills and agents lists resolves against pluginRoot, a leading "./" and a trailing "/" stripped
layering params        { core: string[]; adapters: string[]; exempt: string[]; outside: string[];
                         entries: string[]; entryMaxLines: number;
                         tests: Array<{ core: string; tests: string }>;                          core module <core>/<m>.ts needs <tests>/<m>.unit.test.ts
                         unitTests: string[]; unitForbidden: string[] }
                       a module under the core globs needs a test file unless the adapters globs or the exempt list hold it; one under no tests mapping is reported
other types            the params of orphan-tags, script-portability, invocations and tiers belong to the one task that writes each type and its data
```

### C7 - Node requirement

File: viber/hooks/content/node-missing.md

```
required        Node.js 22.18 or newer: major 22 with minor 18 or higher, or any major above 22
banner note     " - Node.js 22.18 or newer is required, found <version as node -v prints it | none>"
refusal line    viber needs Node.js 22.18 or newer: install it and start a new session.
content file    plain text holding the refusal line, with no tag of its own
```

### C8 - Test layers

File: .claude/rules/tests-structure.md

```
*.unit.test.ts          in process, no outside world; ports replaced by the fakes
*.integration.test.ts   one adapter against its real dependency, on the shared scene
legacy                  *.critical.test.ts, a plain *.test.ts with a *.critical.test.ts sibling, and tests/github/release.test.ts: spawns a shell script, run only by legacy.yml
push command            node --test "tests/**/*.unit.test.ts" "tests/**/*.integration.test.ts"
```

### C9 - Port test fixtures

File: tests/harness/fakes.ts, tests/harness/ports-contract.ts, tests/harness/scene.ts, tests/harness/test.ts

```ts
// tests/harness/ports-contract.ts
/** The arranged state the fakes are seeded with and the shared scene writes: repo-relative paths. */
export const SCENE_STATE: { files: Record<string, string>; exec: string[]; untracked: string[] }
export function fsContract(label: string, make: () => { fs: Fs; root: string }): void
export function gitContract(label: string, make: () => { git: Git; root: string; outside: string }): void

// tests/harness/fakes.ts
/** files: absolute paths, forward slashes; a directory exists when a file sits below it. */
export function fakeFs(files: Record<string, string>, opts?: { unreadable?: string[] }): Fs
/** null: no repository anywhere. */
export function fakeGit(repo: { root: string; tracked: TrackedFile[] } | null): Git
export function fakeScene(root?: string): { fs: Fs; git: Git; root: string; outside: string }

// tests/harness/scene.ts
/** outside: a directory in no repository. */
export function sharedScene(): { root: string; outside: string }

// tests/harness/test.ts
export function layerOf(fileName: string, hasCriticalSibling: boolean): "unit" | "integration" | "legacy" | null
/** Throws for a name layerOf gives null for. */
export function refuseUnmarked(fileName: string, hasCriticalSibling: boolean): void
```
