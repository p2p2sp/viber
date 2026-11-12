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
