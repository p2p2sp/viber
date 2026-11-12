To build this plan you must invoke skill `viber:implementor` with `source:` path as its only argument.

# Fix the failure trail findings of the code review

## Goal

Make the failure trail of a build record each real failure once and never lose one to a formatting slip. `/viber:rules` should empty a trail of everything it cannot learn from. The build close should point at `/viber:rules extend` only when that run can produce a rule. Three cleanups (one awk pass, a lighter config read, one test helper) and a rule rewritten without an inventory come with it.

## Problem

The code review of the failure trail build (range `bfa69e6d..HEAD`) found ten defects:

- Entries are lost (`[Convention]`, `**Blocking**`), doubled across review rounds, or written with no text.
- Trails holding any cause other than `convention` are never emptied, so `waiting:` only grows.
- The close suggests `/viber:rules extend` after a run that was never archived, and after a single run, where the auditor always returns nothing at opus cost.
- `rules-map.sh` forks two processes per archived trail and parses the whole config for one key.
- A rule hard-codes a script inventory that every new script makes false.
- The prose tests slice markdown by heading with bare `indexOf` copies that read the wrong text when the heading is missing.

## Current behaviour

`run-failures.sh` reads every `review-*.md`, `final-review-*.md` and `tests-<n>.md` of `work/`. It takes a line starting exactly `- Blocking`, matches the bracket cause exactly and case-sensitively, and writes one entry per line found, empty text included. It prints `failures: <total> convention <n> ... unknown <n>`.

The close prints `/viber:rules extend - <n> convention failures of this build wait in the failure trail` in both summary forms whenever the convention count is above 0.

`rules-map.sh` runs `config.sh` whole and re-validates the directory name. It runs one awk per archived `failures.md` and prints `trail: <path> convention <n>` only for a file holding a convention entry.

`rules-writer` removes only the convention entries named by `USED:` and `REJECTED:` lines, so a file holding any other cause is never deleted.

### Must not change

- The entry line format of `failures.md`, `- <cause> | <source> | <text>`, and the rule that `failures.md` exists only while it holds an entry.
- The exit codes of `run-failures.sh` (0, 2, 3) and its refusal of a directory with no `status.md`.
- `rules-map.sh` map mode always exits 0. Its `id:`, `state:`, `rule:`, `frozen:`, `dead:`, `dirty:`, `waiting:` and `total:` lines keep their shape and order.
- The default block `config.sh` prints with no argument.
- The trail auditor still writes a `MISS:` only for a gap standing in at least two runs, at most two per run.
- A convention entry no `USED:` line of an applied finding and no `REJECTED:` line names stays in its `failures.md`.
- The cleanup close part, when it archives the run, still moves `failures.md` into the archive.

## Behaviour

### S1 - A Blocking line written loosely still becomes an entry [CHANGED - was: an exact `- Blocking [cause]` only]

Given `review-T1-1.md` holding `- **Blocking** [ Convention ] src/a.ts:3 - reads twice`
When `run-failures.sh` runs over the run directory
Then `failures.md` holds `- convention | review-T1-1 | src/a.ts:3 - reads twice`

### S2 - A Blocking line with no text is no failure [CHANGED - was: an entry with an empty text]

Given a review report holding `- Blocking [task]`
When `run-failures.sh` runs
Then no entry is written for it

### S3 - A finding repeated across rounds of one task is one entry [CHANGED - was: one entry per round]

Given `review-T3-1.md` and `review-T3-2.md` each holding the same Blocking line
When `run-failures.sh` runs
Then `failures.md` holds that entry once, with source `review-T3-1`

### S4 - The close suggests `/viber:rules extend` only when a rule can come of it [CHANGED - was: whenever the build had a convention failure, in both forms]

Given a build whose trail holds convention entries
When the close prints its summary
Then the archived form carries the `/viber:rules extend` line only when convention entries stand in the trails of at least two runs, this one included. The screen form never carries it. `failures.md` waits silently in the run directory for a later archive.

### S5 - `/viber:rules` sees and empties every archived trail [CHANGED - was: only trails holding a convention entry, only convention entries removed]

Given archived trails holding convention, task and test entries, one of them holding test entries alone
When the user runs `/viber:rules`
Then every trail appears with its convention and other counts. With the trail target kept and the writer approved, every non-convention entry and every handled convention entry is removed. A file left with no entry is deleted.

### S6 - The archive directory is read alone [CHANGED - was: the whole config parsed for one key]

Given a project whose `.claude/viber.yml` sets `directories.specifications`
When `config.sh --specifications` runs
Then it prints that one value, and `rules-map.sh` and `run-failures.sh` read the archive from it

### S7 - The header rule names no inventory [CHANGED - was: a script count and a list of names]

Given `.claude/rules/shell-script-header.md`
When a session loads it after a new script is added
Then it is still true, naming no script count and no list of scripts

### S8 - A prose test fails on a missing heading [CHANGED - was: a silent slice of the wrong text]

Given a prose test slicing a shipped markdown file by a `##` heading that file does not carry
When the test runs
Then it fails with that heading named

### Edge cases

- A bare `- Blocking` -> no entry.
- The same text in `review-T1-1` and `review-T2-1` (two tasks) -> two entries.
- `review-T2-2` and `review-T2-10` holding the same finding -> one entry, source `review-T2-2` (the lowest round by number, not by byte order).
- The same text twice inside one report, or in two `final-review-<n>.md` reports -> kept as written, never merged.
- Test entries are never merged.
- A build with convention entries and no archived trail holding one -> `runs 1`, no `/viber:rules extend` line.
- A build with no convention entry and two archived trails holding one -> `runs 2`, a convention count of 0, no `/viber:rules extend` line.
- `config.sh` missing or printing nothing for `--specifications` -> both readers use `specs`.
- An archived trail holding only `test` entries -> a `trail:` line with `convention 0`. The trail target is offered, no auditor is dispatched for it, and the writer removes those entries and deletes the file.

## Glossary

- Runs count - the number of runs whose trail holds at least one convention entry: archived trails plus this run.
- Other count - the entries of one trail whose cause is not `convention`.

## Acceptance criteria

1. The screen form of the close (closeout `BLOCKED`, an accepted `DENIED`, the close part not run) prints no `/viber:rules extend` line, and `failures.md` stays in the run directory to reach the archive when the run is archived later.
2. The archived form prints the `/viber:rules extend` line only when the `convention` count is above 0 and the `runs` count is at least 2.
3. `run-failures.sh` prints a `runs <n>` field per C1.
4. A Blocking line is read per C1: cause case-insensitive, spaces inside the bracket allowed, `- **Blocking**` accepted.
5. A Blocking line with no text yields no entry.
6. A finding repeated across the review rounds of one task yields one entry, from the lowest round.
7. `rules-map.sh` prints one `trail:` line per C3 for every archived `failures.md` holding an entry. It counts every trail in one awk process and reads the archive directory from `config.sh --specifications` without validating the name itself.
8. `config.sh --specifications` prints the resolved `directories.specifications` value per C2, reading only the `directories:` group.
9. `/viber:rules` offers the trail target whenever a `trail:` line exists and audits only trails with a convention count above 0. It reaches the writer whenever a kept trail has an other count above 0. The writer removes every non-convention entry of every kept trail besides the handled convention entries, and deletes a file left with none.
10. `.claude/rules/shell-script-header.md` states its header rule with no script count and no list of script names.
11. `rules-trail-prose`, `failure-trail-prose`, `close-part-prose` and `rules-close-prose` slice by `##` heading through one shared `section(text, heading)` helper, which throws an error naming the heading when the text holds none.
12. `viber/README.md`, `viber/docs/files.md` and `help.html` (both languages) say two things. The close suggests `/viber:rules extend` once convention failures stand in two runs. `/viber:rules` removes the convention entries it handled and every entry of another cause.

## Scope

### File map

- add - tests/harness/markdown.ts - the shared `section(text, heading)` helper
- modify - tests/harness.test.ts - its proof
- modify - tests/viber/rules-trail-prose.unit.test.ts - slicing through the helper, the new trail prose
- modify - tests/viber/failure-trail-prose.unit.test.ts - slicing through the helper
- modify - tests/viber/close-part-prose.unit.test.ts - slicing through the helper, the rules line cases
- modify - tests/viber/rules-close-prose.unit.test.ts - slicing through the helper
- modify - viber/scripts/config.sh - the `--specifications` report
- modify - tests/viber/config.test.ts - its cases
- modify - viber/scripts/run-failures.sh - tolerant Blocking parsing, round deduplication, the runs count, its header contract
- modify - tests/viber/run-failures.test.ts - its cases
- modify - viber/skills/rules/scripts/rules-map.sh - one awk pass, the C3 trail line, the `--specifications` read, its header
- modify - tests/viber/rules-map.test.ts - its trail cases and header format line
- modify - viber/skills/implementor/parts/close.md - when the `/viber:rules extend` line prints
- modify - viber/skills/rules/SKILL.md - trail target routing, auditor gating, writer gate
- modify - viber/agents/rules-writer.md - retiring every non-convention entry of a kept trail
- modify - viber/agents/rules-auditor.md - the trail scope is the trails with a convention count above 0
- modify - .claude/rules/shell-script-header.md - the header rule without an inventory
- modify - viber/README.md, viber/docs/files.md, viber/skills/setup/assets/help.html - the trail behaviour for users

### Out of scope

- Every `CLAUDE.md` node naming `run-failures.sh`, `rules-map.sh` or the trail (`viber/CLAUDE.md`, `viber/scripts/CLAUDE.md`, `viber/agents/CLAUDE.md`, `tests/viber/CLAUDE.md`, `tests/harness/CLAUDE.md`): the build close's memory step records them.
- The archived `docs/specs/*/` specs, outcomes and findings: they are history and never edited.
- Migration of already archived trails: their entries keep their format and are read as they are.
- The from/to slicers of other prose tests (`ruling-prose`, `final-review-prose`, `extras-prose`, `repair-prose`, `guard-prose`, `root-cause-prose`, `test-pyramid-prose`): they keep their behaviour.
- `docs/viber-functions.html`, the root `README.md`, `viber/docs/configuration.md` and the flow SVGs: what they say about the trail stays true.
- The reviewers' `Blocking [<cause>]` wording in `task-reviewer.md` and `final-reviewer.md` is unchanged. The parser only tolerates deviations.
- End-to-end tests.

## Solution requirements

- Every script works under Git Bash on Windows and bash 3.2 on macOS, with no heredoc, and follows the repository's `.claude/rules/shell-*` rules.
- Script tests stay in the integration tier (`*.test.ts`), each task running only its own test files.
- No em dash or en dash in any file.
