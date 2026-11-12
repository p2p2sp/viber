---
source: C:/Projects/viber/docs/_specs/2026-11-12-12-19-27_failure-trail-of-a-build-and-rules-learned-from-it/plan.md
---

To build this plan you must invoke skill `viber:implementor` with `source:` path as its only argument.

# Failure trail of a build and rules learned from it

## Goal

A build leaves a committed record of where its agents failed, each failure labelled with its cause, and `/viber:rules` turns the failures that repeat across runs into rules. The build close stops inventing rules from the coder's own notes, so a new rule rests on an observed failure or on the code, never on a self-report.

## Problem

Rules in `.claude/rules/` are derived from the coder's notes and from reading the code. The only record of what an agent actually got wrong (the reviewers' findings, the failing final test runs) is deleted when the run is archived. A project therefore never learns from its own failures, and the admission criterion "a delta from what a competent developer would have written anyway" is guessed instead of proven. Every team using viber pays for the same mistake again in the next run.

## Current behaviour

- `task-reviewer` and `final-reviewer` write free-form findings (location, what is wrong, the fix; Blocking first, then Minor) into `work/review-<id>-<round>.md` and `work/final-review-*.md`. `test-runner` writes the new failures of a final run into `work/tests-<round>.md`.
- The archive step drops `work/` whole and carries every other file of the run directory to the archive, `outcome.md` among them, in one commit.
- At the build close `rules-writer` reads the specification and the coders' notes, adds up to two conventions that pass the admission gate, and corrects a rule the build contradicted.
- `/viber:rules` proposes a new rule only from the code: a pattern recurring in at least three files.

### Must not change

- The reviewers' return lines (`VERDICT:`, `REVIEW:`, `REPORT:`, `EXTRA:`, `OWNER:`) and the two severity levels, Blocking and Minor.
- `archive-run.sh` and `closeout`: their output lines, exit codes and the list of what the archive drops.
- The existing lines of the rules map, their order, and exit 0 in map mode.
- The `review` and `reset` flows of `/viber:rules`, the user's approval before any write, and nothing staged or committed by it.
- The three admission criteria and the two-per-run cap for a candidate proposed from the code; the 4000 byte and 40000 byte budgets.
- `implementor` opens no file and writes no file.

## Behaviour

### S1 - A build leaves its failure trail [NEW]

A build whose reviewers blocked a task, or whose final test run failed, ends with a `failures.md` in the archive of the run.

Given a run whose `work/` holds a review report with a Blocking finding labelled `convention` and a failing final test report
When the build reaches its archiving close
Then the archive holds `failures.md` beside `outcome.md` with one entry per Blocking finding and per failing test line, and the screen close carries one line naming `/viber:rules extend`

### S2 - The build close adds no rule [CHANGED - was: rules-writer added up to two conventions per build from the coders' notes]

The build close only keeps the existing rules true.

Given a build that followed a pattern no rule records and contradicted one existing rule line
When the close dispatches `rules-writer`
Then the contradicted line is corrected, and no new rule file and no new rule line appear

### S3 - /viber:rules learns a rule from a repeated failure [NEW]

Two runs blocked on the same gap are enough evidence for a rule.

Given two archived runs whose `failures.md` each hold a `convention` entry for the same gap, and code that follows the convention today
When the user runs `/viber:rules extend`, keeps the trail target and approves the fold
Then a rule for that convention is written, and both entries are gone from their `failures.md`

### S4 - A failure against an existing rule corrects that rule [NEW]

A rule that was loaded and still broken is repaired, never doubled.

Given a `convention` entry in a file an existing rule's `paths:` cover, for the convention that rule states
When `/viber:rules extend` audits the trail and the user approves the fold
Then the existing rule is corrected, no new rule is written, and the entry is gone

### Edge cases

- A run with no Blocking finding and no failing final test run -> no `failures.md` is written, and one left by an earlier call is removed.
- A Blocking finding line with no cause bracket, or with a word that is no reviewer cause -> recorded with cause `unknown`.
- Failures the tree already had before the build (the baseline report) -> never in the trail.
- A second archiving close of the same run, after a blocked one -> `failures.md` holds each failure once, never doubled.
- The trail cannot be written -> the build still archives, and its final summary says the failure trail was not written.
- A gap standing in two runs that the code bears out but the gate rejects (a competent developer would do it anyway, or a tool already enforces it) -> no rule is written and its entries are removed as rejected.
- A trail with no `convention` entry -> the build prints no `/viber:rules` line.
- No archived `failures.md` -> the map prints neither a `trail:` nor a `waiting:` line.
- Archived entries of other causes only -> the map prints `waiting:` and no `trail:` line, and `/viber:rules` offers no trail target.
- A `convention` entry standing in one run only, upheld by verification -> it stays in its `failures.md` and yields no rule.
- A `convention` entry verification rejects -> it is removed from its `failures.md`.
- More than two trail candidates in one run of `/viber:rules` -> the two whose gap stands in the most runs become rules, and the entries of the others stay in their `failures.md`.
- A `failures.md` left with no entry -> deleted.

## Glossary

- Failure trail - the `failures.md` of one run: the build's failures, one entry per line. Not the review reports themselves, which the archive drops.
- Cause - the one label an entry carries, saying what would have prevented the failure.
- Handled entry - an entry a new rule or a rule correction rests on, or a `convention` entry the audit rejected: it names no convention, its code is gone, or its gap fails the admission gate. Only a handled entry leaves the trail.
- Rule ignored - a `convention` failure in a file an existing rule already covers for that convention; decided by `/viber:rules`, never by a reviewer.
- Run key - the name of the run's directory, the same in the archive.

## Acceptance criteria

1. `task-reviewer` and `final-reviewer` open every Blocking finding of a report with one line carrying exactly one of four causes: `convention`, `place`, `plan`, `task`.
2. At the archiving close a script, with no model involved, writes `failures.md` into the run directory before the run is archived, from the Blocking findings of both reviewers' reports and from the lines of the final test run reports, the latter with a cause the script assigns. A run with no such entry gets no `failures.md`.
3. The trail is written on every archiving close: no key of `.claude/viber.yml` turns it on or off.
4. At the build close `rules-writer` only corrects or removes a rule the build contradicted, and adds no convention, neither a new file nor a new line.
5. The map of `/viber:rules` prints the number of waiting trail entries per cause, and the `extend` and `both` modes, like the path of an empty layer (`state: none`), offer the trail as a target whose `convention` entries are evidence for rules. No mode is added.
6. A candidate from the trail is admitted when the same gap stands in the `failures.md` of at least two different runs and holds against the code as it stands. That evidence replaces the three-files criterion; the other two criteria still bind. A trail candidate counts toward the two-per-run cap, the gaps standing in the most runs kept first and ahead of a candidate proposed from the code.
7. A `convention` entry in a file an existing rule's `paths:` cover, for the convention that rule states, never yields a new rule: it yields a correction of that rule, decided by `/viber:rules`.
8. Once `/viber:rules` folds its findings, every handled entry is gone from its `failures.md`, a `failures.md` left with no entry is deleted, and an entry waiting for a second run stays, as does every entry of another cause.
9. When the trail of a build holds at least one `convention` entry, its final summary and its screen close carry one line naming `/viber:rules`.
10. The user documentation describes the trail in the archive, the close-time behaviour of `rules-writer` and the trail target of `/viber:rules`, in both languages of the help page.

## Scope

### File map

- add - viber/scripts/run-failures.sh - assembles one run's `failures.md` from its reports and prints the counts per cause
- add - tests/viber/run-failures.test.ts - the script's contract
- add - tests/viber/failure-trail-prose.unit.test.ts - the finding line and the cause labels of both reviewers
- add - tests/viber/rules-trail-prose.unit.test.ts - the trail direction across `rules-auditor`, `rule-admission.md`, `rules-writer` and the `rules` skill
- modify - viber/agents/task-reviewer.md - the shape of a finding in its report
- modify - viber/agents/final-reviewer.md - the shape of a finding in its report
- modify - viber/skills/implementor/SKILL.md - the `allowed-tools` entry of the new script
- modify - viber/skills/implementor/parts/close.md - the trail call of step 7 and its summary lines
- modify - tests/viber/close-part-prose.unit.test.ts - the trail call and its lines
- modify - viber/agents/rules-writer.md - no addition at the build close; trail findings and handled entries under the map shape
- modify - tests/viber/rules-close-prose.unit.test.ts - the spec shape adds nothing
- modify - viber/skills/rules/scripts/rules-map.sh - the `trail:` and `waiting:` lines
- modify - tests/viber/rules-map.test.ts - those lines
- modify - viber/agents/rules-auditor.md - the trail direction
- modify - viber/references/rule-admission.md - trail evidence in criterion 1 and in the calibration
- modify - viber/skills/rules/SKILL.md - the trail target
- modify - viber/README.md, viber/docs/files.md, viber/docs/configuration.md, viber/skills/setup/assets/help.html, README.md, docs/viber-functions.html - the user documentation
- modify - viber/skills/setup/assets/viber-flow-en.svg, viber/skills/setup/assets/viber-flow-pl.svg - the description line of `rules-writer` in the flow diagram
- modify - .claude/rules/shell-script-header.md - its count and list of scripts carrying a `Contract:` block

### Out of scope

- Every `CLAUDE.md` node (`viber/CLAUDE.md` and those of `agents/`, `references/`, `scripts/`, `skills/`, `hooks/`, `skills/pro-designer/`, `tests/viber/`): the build's close updates them, no task lists one.
- `viber/.claude-plugin/plugin.json`, `viber/hooks/hooks.json`, `viber/hooks/scripts/shell-guard.sh`: no agent or skill is added, renamed or given other tools, so they keep naming the same agents.
- The reviewer dispatch lines of `viber/skills/implementor/SKILL.md` and `viber/skills/implementor/fragments/final-review.true.md`: the reviewers' input labels and return lines stay.
- `viber/skills/implementor/fragments/rules.true.md` and `cleanup.true.md`: the writer's dispatch, the `OVER:` repeat and the `closeout` dispatch stay.
- `viber/agents/closeout.md` and `viber/scripts/archive-run.sh`: `failures.md` reaches the archive as any file outside the dropped list does.
- `viber/agents/task-coder.md`: it reads a review report as before.
- `.claude/rules/review-findings.md`, `.claude/rules/viber/agent-review-color.md`, `.claude/rules/plugin-manifests.md`, `.claude/rules/shell-preload-contract.md`, `.claude/rules/viber/switch-fragments.md`: each statement still holds (two levels, the review color, the manifest spelling, the call form, the seven close fragments).
- The prose and script tests `extras-prose`, `guard-prose`, `red-evidence-prose`, `repair-prose`, `final-review-prose`, `ui-tells`, `nudge-prose`, `roadmap-prose`, `ruling-prose`, `shell-guard.test.ts` and `skill-part.test.ts`: they assert text and behaviour this change keeps.
- `viber/skills/setup/templates/viber.yml`, `viber/scripts/config.sh`: no key is added.
- `/viber:memory` reading the trail: the `place` cause is recorded, nothing consumes it yet.
- Failures a coder reports itself (`REASON:`, a short `DOD:`), attempt counts, tier climbs and the red-check verdict.
- Numeric scores, weighted grades and a report page.
- Runs archived before this change: their `work/` no longer exists.
- Arbiter rulings: they stay in `rulings.md` alone.
- End-to-end tests.

## Solution requirements

- `implementor` learns the trail's counts from the script's stdout, never from a file.
- Every script runs under Git Bash on Windows and on macOS (bash 3.2), with no heredoc.
- Tokens are a design constraint: assembling and counting the trail is a script's work, and the reviewers' instructions grow by the cause list alone.
- Every document says what holds now, never what changed.
- `failures.md` and the trail audit file carry names the harness lets an agent write (not opening on `report`, `summary`, `findings` or `analysis`).
- The `build.rules` switch keeps gating the `rules-writer` dispatch of the build close.

## Tasks

<!-- TASK -->
### T1 - Label every blocking finding with its cause
- TDD: required
- Covers: AC1
- Uses: C1, C2
- Depends-on: none
- Files: viber/agents/task-reviewer.md, viber/agents/final-reviewer.md, tests/viber/failure-trail-prose.unit.test.ts
- Delivers: Both reviewers write every finding of a report as a C1 item, each Blocking one carrying exactly one reviewer cause of C2.
- Verification: node --test tests/viber/failure-trail-prose.unit.test.ts tests/viber/repair-prose.unit.test.ts tests/viber/extras-prose.unit.test.ts tests/viber/red-evidence-prose.unit.test.ts tests/viber/final-review-prose.unit.test.ts tests/viber/ui-tells.unit.test.ts -> every case passes
- DoD: the `## Output` of `task-reviewer.md` states the C1 item for a Blocking and for a Minor finding, its first line whole on one line; the `## Output` of `final-reviewer.md` states the same C1 item; each of the two files lists the four reviewer causes of C2 with their meanings, in the same wording in both; each of the two files states exactly one cause per Blocking finding, `task` when none of the other three clearly fits; in both files a Minor finding carries no cause
<!-- /TASK -->

<!-- TASK -->
### T2 - Write the failure trail from the review reports
- TDD: required
- Covers: AC2
- Uses: C1, C2, C3, C4
- Depends-on: T1
- Files: viber/scripts/run-failures.sh, tests/viber/run-failures.test.ts
- Delivers: A script that turns the Blocking findings of a run's review reports into its `failures.md` and prints the counts per cause.
- Verification: node --test tests/viber/run-failures.test.ts -> every case passes
- DoD: a C1 Blocking first line of `work/review-*.md` or `work/final-review-*.md` becomes one C3 entry carrying its cause, source and text, entries ordered by source name in byte order, then by report order; a Blocking first line with no bracket, or a bracket holding no reviewer cause of C2, is recorded with cause `unknown`, and a Minor line or a continuation line yields no entry; stdout is the one C4 line, each count matching the entries written; with no entry the call writes no `failures.md` and removes one already there, and with entries it replaces the file whole; no argument, more than one, a directory that does not exist or one holding no `status.md` exits 2 and writes nothing, and a `failures.md` that cannot be written or removed exits 3, each with one `error:` line on stderr and nothing on stdout; the script is tracked 100755, LF-only, and opens with a header carrying a `Contract:` block
<!-- /TASK -->

<!-- TASK -->
### T3 - Add the final test run failures to the trail
- TDD: required
- Covers: AC2
- Uses: C2, C3, C4
- Depends-on: T2
- Files: viber/scripts/run-failures.sh, tests/viber/run-failures.test.ts
- Delivers: The failing lines of a run's final test reports enter its `failures.md` with the cause `test`.
- Verification: node --test tests/viber/run-failures.test.ts -> every case passes
- DoD: each non-blank line of a `work/tests-<digits>.md` report becomes one C3 entry with cause `test` and its source, a leading `- ` or `* ` marker removed; `work/tests-baseline.md` yields no entry; the `test` count of the C4 line matches the entries written
<!-- /TASK -->

<!-- TASK -->
### T4 - Write the trail at the archiving close and name /viber:rules
- TDD: required
- Covers: AC2, AC3, AC9
- Uses: C4, C7
- Depends-on: T3
- Files: viber/skills/implementor/SKILL.md, viber/skills/implementor/parts/close.md, tests/viber/close-part-prose.unit.test.ts
- Delivers: The archiving close of a build calls the trail script and carries its `convention` count to the final summary and the screen as one line naming `/viber:rules`.
- Verification: node --test tests/viber/close-part-prose.unit.test.ts tests/viber/roadmap-prose.unit.test.ts tests/viber/repair-prose.unit.test.ts tests/viber/ruling-prose.unit.test.ts tests/viber/extras-prose.unit.test.ts tests/viber/red-evidence-prose.unit.test.ts -> every case passes
- DoD: the `allowed-tools` line of `SKILL.md` lists `Bash(${CLAUDE_PLUGIN_ROOT}/scripts/run-failures.sh:*)`; step 7 of `parts/close.md` makes the one C4 call with `<dir>` before the final summary is composed, under the three conditions of the cleanup close part and under no config key of its own; with a `convention` count above 0 the final summary carries the first C7 line outside its 7 lines, in both forms; the archived close prints that C7 line after the closing sentence and before the next-part line; a non-zero exit of the call puts the second C7 line in the final summary, asks nothing and goes on to the cleanup close part; a `convention` count of 0 adds no line
<!-- /TASK -->

<!-- TASK -->
### T5 - Keep rules-writer from adding rules at the build close
- TDD: required
- Covers: AC4
- Uses: none
- Depends-on: none
- Files: viber/agents/rules-writer.md, tests/viber/rules-close-prose.unit.test.ts
- Delivers: Under the spec shape `rules-writer` corrects or removes a rule the build contradicted and adds nothing.
- Verification: node --test tests/viber/rules-close-prose.unit.test.ts -> every case passes
- DoD: `## Write` states that under the spec shape the writer adds no convention, neither a new file nor a line in an existing rule; under the spec shape it still corrects a line the build contradicted, saying what now holds, and still removes a rule whose whole convention the build removed once `Grep` and `Glob` find no file following it; `## Budget` states that under the spec shape it never compacts, splits or moves and reports a corrected file left over a cap on `OVER:`, and no line of the file says the spec shape writes what passes the gate; `## Input` requires reading `rule-admission.md` under the map shape only; the frontmatter `description` and the `VERDICT: NONE` line name correcting rules instead of recording confirmed conventions, the description still ending on `Invoked only by the implementor skill and the rules skill, never directly.`
<!-- /TASK -->

<!-- TASK -->
### T6 - Report the waiting trail entries on the rules map
- TDD: required
- Covers: AC5
- Uses: C2, C3, C5
- Depends-on: T3
- Files: viber/skills/rules/scripts/rules-map.sh, tests/viber/rules-map.test.ts
- Delivers: The rules map names every archived trail holding `convention` entries and counts the waiting entries per cause.
- Verification: node --test tests/viber/rules-map.test.ts -> every case passes
- DoD: map mode prints one C5 `trail:` line per archived `failures.md` holding a `convention` entry, alphabetical by path, with that file's count; it prints the one C5 `waiting:` line summing the entries of every archived `failures.md` by cause; with no archived `failures.md` it prints neither line, and with entries of other causes only it prints `waiting:` and no `trail:` line; the archive directory is the `directories.specifications:` value printed by `scripts/config.sh`, which the script reaches through a path relative to its own directory, and it is `specs` when that call fails or prints no such line, map mode exiting 0 either way; both lines stand after the `dirty:` lines and before `total:`, map mode still exits 0, and the header's stdout block lists both; the header's `Contract:` block names the archived `failures.md` files and the `scripts/config.sh` call among what the script reads
<!-- /TASK -->

<!-- TASK -->
### T7 - Admit a rule on a failure repeated across runs
- TDD: required
- Covers: AC6
- Uses: C3, C6
- Depends-on: T3
- Files: viber/references/rule-admission.md, tests/viber/rules-trail-prose.unit.test.ts
- Delivers: The admission gate accepts a gap repeated across the trails of two runs, counts it toward the per-run cap and lets a rejected trail entry be reported.
- Verification: node --test tests/viber/rules-trail-prose.unit.test.ts -> every case passes
- DoD: criterion 1 of `rule-admission.md` names the trail evidence as its second way to pass, inside the criterion's own paragraph: the same gap in the `failures.md` of at least two different runs, each entry holding against the code as it stands, the candidate carrying a place where the code does it right as its example; `## Calibration` keeps its two-per-run sentence verbatim and states that a trail candidate counts toward it and is kept ahead of a candidate proposed from the code; `## The silent drop` names, in the paragraph of its existing exception, an entry of a trail gap the gate rejects as a second exception, reported on a C6 `REJECTED:` line so the writer removes it from its `failures.md`
<!-- /TASK -->

<!-- TASK -->
### T8 - Audit the trail of archived runs
- TDD: required
- Covers: AC6, AC7
- Uses: C3, C6
- Depends-on: T7
- Files: viber/agents/rules-auditor.md, tests/viber/rules-trail-prose.unit.test.ts
- Delivers: `rules-auditor` gains a trail direction that groups the `convention` entries of archived runs into rule candidates, rule corrections and rejected entries.
- Verification: node --test tests/viber/rules-trail-prose.unit.test.ts -> every case passes
- DoD: `rules-auditor.md` takes the C6 input, its `description` names that third direction, and in it the auditor reads only the `convention` entries of the `scope` files; it writes a C6 `MISS:` line only for a gap standing in at least two different runs, each entry checked against the code as it stands and the candidate passing the two other criteria of the gate, the line naming those runs, and at most two such lines, the gaps standing in the most runs first; it writes a C6 `IGNORED:` line, never a `MISS:`, for an entry whose file an existing rule's `paths:` cover and whose convention that rule states, never naming a frozen `_` rule, which this direction does not read; directly below each `MISS:` or `IGNORED:` line it writes one C6 `USED:` line per entry that line rests on, it writes one C6 `REJECTED:` line per entry that names no convention, whose code is gone, or whose gap fails criterion 2 or 3 of the gate however many runs it stands in, it writes no line for an entry standing in one run that verification upheld nor for an entry of a gap left past the two `MISS:` lines, and it returns the C6 `AUDIT: trail` line
<!-- /TASK -->

<!-- TASK -->
### T9 - Fold trail findings and drop handled entries
- TDD: required
- Covers: AC6, AC7, AC8
- Uses: C6
- Depends-on: T5, T8
- Files: viber/agents/rules-writer.md, tests/viber/rules-trail-prose.unit.test.ts
- Delivers: Under the map shape `rules-writer` writes the rules and corrections a trail audit found and removes every handled entry from its `failures.md`.
- Verification: node --test tests/viber/rules-trail-prose.unit.test.ts tests/viber/rules-close-prose.unit.test.ts -> every case passes
- DoD: under the map shape a C6 `MISS:` line of `_trail-audit.md` is written as a rule like any other `MISS:`, counted toward the two-per-run cap and kept ahead of a `MISS:` proposed from the code; a C6 `IGNORED:` line corrects the rule it names as the line says, that rule changeable though no `rule:` line of the map names it, and never adds a file; each C6 `USED:` line below a `MISS:` or `IGNORED:` the writer applied, and each C6 `REJECTED:` line, removes that one entry line from the `failures.md` it names, nothing else in that file changing, and a `USED:` line below a finding the writer did not apply removes nothing; a `failures.md` left with no entry line is deleted with `rm -- <path>`; every `failures.md` changed or deleted is on `FILES:`; the write scope sentence names `.claude/rules/**/*.md` plus the `failures.md` paths of `USED:` and `REJECTED:` lines under the map shape, and the Bash sentence of `## Budget` allows `rm -- <path>` on an emptied `failures.md`
<!-- /TASK -->

<!-- TASK -->
### T10 - Offer the trail as a target of /viber:rules
- TDD: required
- Covers: AC5
- Uses: C5, C6
- Depends-on: T6, T9
- Files: viber/skills/rules/SKILL.md, tests/viber/rules-trail-prose.unit.test.ts
- Delivers: `/viber:rules` reports the waiting entries, offers the trail as one target on `extend` and `both`, audits it and hands its findings to the writer.
- Verification: node --test tests/viber/rules-trail-prose.unit.test.ts tests/viber/nudge-prose.unit.test.ts -> every case passes
- DoD: step 1 reports the C5 `waiting:` line and each `trail:` line, naming `convention` entries as the only ones this command reads; on `extend`, on `both` and on `state: none`, a map with at least one `trail:` line adds the trail as one target of step 4's list, and `review` and `reset` never do; step 5 dispatches one `viber:rules-auditor` for a kept trail target with the C6 input, `scope` being every `trail:` path, and reports its `AUDIT: trail` line verbatim; step 6 reads a trail line with three zero counters as it reads five zero counters, and passes every `trail:` line of a kept trail target in the writer's `map:`; the `FILES:` bullet of step 7 names the `failures.md` files the writer changed or deleted; the frontmatter `description` names learning from the failure trail
<!-- /TASK -->

<!-- TASK -->
### T11 - Describe the trail in the user documentation
- TDD: none
- Covers: AC10
- Uses: none
- Depends-on: T4, T10
- Files: viber/README.md, viber/docs/files.md, viber/docs/configuration.md, viber/skills/setup/assets/help.html, viber/skills/setup/assets/viber-flow-en.svg, viber/skills/setup/assets/viber-flow-pl.svg, README.md, docs/viber-functions.html, .claude/rules/shell-script-header.md
- Delivers: The user documentation, the flow diagram and the script header rule describe the failure trail, the close-time behaviour of `rules-writer` and the trail target of `/viber:rules`.
- Verification: node --test tests/viber/help.unit.test.ts && grep -c "failures.md" viber/README.md viber/docs/files.md viber/docs/configuration.md viber/skills/setup/assets/help.html README.md docs/viber-functions.html viber/scripts/run-failures.sh && grep -c "contradicted" viber/docs/configuration.md viber/skills/setup/assets/viber-flow-en.svg viber/agents/rules-writer.md && grep -c "run-failures.sh" .claude/rules/shell-script-header.md viber/scripts/run-failures.sh -> the test passes and every listed file counts at least 1
- DoD: `viber/docs/files.md` lists `failures.md` in the archive, says `/viber:rules` removes handled entries from it, and in its `.claude/rules/` row and its `## Memory and rules` section says a build corrects rules while `/viber:rules` adds them; `viber/docs/configuration.md` describes `build.rules` as correcting or removing the rules a build contradicted, adding none, and names `failures.md` as what `/viber:rules` learns new rules from; `viber/README.md` names `failures.md` in the archive row, the `/viber:rules` line of the archived close, and in its `.claude/rules/` row what `/viber:rules` learns beside what builds correct; `help.html` says the same in both its `en` and `pl` pieces for the archive lists, the `build.rules` key, the `rules-writer` and `rules-auditor` lines and the `/viber:rules` card; the "It learns your project" paragraph of the root `README.md` and the rules entries of `docs/viber-functions.html` name `failures.md` and rules learned from failures that repeat; the `rules-writer` description line of `viber-flow-en.svg` says the build corrects the rules it contradicted, and the same line of `viber-flow-pl.svg` says it in Polish; `.claude/rules/shell-script-header.md` counts and lists `run-failures.sh` among the scripts carrying a `Contract:` block
<!-- /TASK -->

## Contracts

### C1 - Finding item of a review report

File: viber/agents/task-reviewer.md, viber/agents/final-reviewer.md

```
- Blocking [<cause>] <path>:<line> - <what is wrong>
  <task-reviewer: how to fix | final-reviewer: the consumer or reference proving it, then the fix>
- Minor <path>:<line> - <what is wrong>
  <the same continuation lines>
```

- One item per finding, Blocking items first, then Minor.
- The first line of an item is whole on one line; the lines below it are indented.
- `<cause>` is one of the four reviewer causes of C2; a Minor item carries none.

### C2 - Cause

File: viber/agents/task-reviewer.md, viber/agents/final-reviewer.md, viber/scripts/run-failures.sh

```
convention   the code works but breaks a pattern the project's own code follows in other files
place        the defect comes from a fact about one place the task does not state: a module's invariant, a tool's quirk, a trap
plan         the plan or the task file is wrong or incomplete: a file missing from Files, a wrong contract, a missing dependency
task         every other defect: a logic error, a missed DoD clause, a missing or weak test
test         assigned by run-failures.sh alone, to every line of a final test run report
unknown      assigned by run-failures.sh alone, to a Blocking first line whose bracket is missing or holds none of the four words above
```

- Reviewer causes: `convention`, `place`, `plan`, `task`.

### C3 - failures.md

File: viber/scripts/run-failures.sh

```
# Failures

- <cause> | <source> | <text>
```

- Path: `<run directory>/failures.md`; after the archive `docs/<directories.specifications>/<run key>/failures.md`.
- One entry per line; the file exists only while it holds at least one entry.
- `<cause>`: one of the six values of C2.
- `<source>`: the report's file name without `.md` (`review-<task id>-<round>`, `final-review-<slice>`, `final-review-recheck-<round>`, `tests-<round>`).
- `<text>`: for a Blocking finding, everything after the bracket on its C1 first line (after the word `Blocking` when the bracket is missing); for a test report line, the line as written.

### C4 - run-failures.sh

File: viber/scripts/run-failures.sh

```
"${CLAUDE_PLUGIN_ROOT}/scripts/run-failures.sh" "<run directory>"

stdout, exactly one line:
failures: <total> convention <n> place <n> plan <n> task <n> test <n> unknown <n>
```

- argv: one run directory, relative to the repository root or absolute.
- cwd: any directory of the host repository; a relative argument resolves against the repository root, against the cwd outside a repository.
- reads: `<run>/work/review-*.md`, `<run>/work/final-review-*.md`, `<run>/work/tests-<digits>.md`.
- writes: `<run>/failures.md` alone; no git command.
- exit 0: the trail was written, or `<total>` is 0 and no `failures.md` is left.
- exit 2: unusable argv; one `error: ...` line on stderr, nothing on stdout, nothing written.
- exit 3: `failures.md` could not be written or removed; one `error: ...` line on stderr, nothing on stdout.

### C5 - Trail lines of the rules map

File: viber/skills/rules/scripts/rules-map.sh

```
trail: <repo-relative path of one archived failures.md> convention <n>
waiting: convention <n> place <n> plan <n> task <n> test <n> unknown <n>
```

- Archived `failures.md`: `docs/<directories.specifications>/*/failures.md`.

### C6 - Trail audit

File: viber/agents/rules-auditor.md

The five labelled lines of the dispatch:

```
target: trail
scope: <every trail: path of the map, comma-separated>
matches: none
out: .temp/viber/<id>/
refs: <the plugin reference directory>
```

The findings file `<out>_trail-audit.md`, one finding per line:

```
MISS: <a convention worth a rule, carrying the example from the code that proves it> | runs <run key>, <run key>
USED: <failures.md path> | <the entry line, verbatim>
IGNORED: <rule path> | <quoted line of the rule> -> <the correction: the reworded line, or the narrower paths: globs>
USED: <failures.md path> | <the entry line, verbatim>
REJECTED: <failures.md path> | <the entry line, verbatim>
```

The return, exactly one line:

```
AUDIT: trail miss <n> ignored <n> rejected <n> -> <path of the findings file> | none
```

- A `USED:` line stands directly below the `MISS:` or `IGNORED:` line it rests on.
- Run key: the name of the directory holding the `failures.md`.

### C7 - Trail lines of the build summary

File: viber/skills/implementor/parts/close.md

```
/viber:rules extend - <n> convention failures of this build wait in the failure trail
failure trail not written: <the error: line of run-failures.sh>
```
