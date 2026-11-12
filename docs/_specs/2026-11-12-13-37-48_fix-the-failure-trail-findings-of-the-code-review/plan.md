---
source: C:/Projects/viber/docs/_specs/2026-11-12-13-37-48_fix-the-failure-trail-findings-of-the-code-review/plan.md
---

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

## Tasks

<!-- TASK -->
### T1 - Slice prose tests by heading through one shared helper
- TDD: required
- Covers: AC11
- Uses: C4
- Depends-on: none
- Files: tests/harness/markdown.ts, tests/harness.test.ts, tests/viber/rules-trail-prose.unit.test.ts, tests/viber/failure-trail-prose.unit.test.ts, tests/viber/close-part-prose.unit.test.ts, tests/viber/rules-close-prose.unit.test.ts
- Delivers: the C4 helper with its proof, and the four prose tests slicing every `##` heading section through it with every existing assertion kept.
- Verification: node --test tests/harness.test.ts tests/viber/rules-trail-prose.unit.test.ts tests/viber/failure-trail-prose.unit.test.ts tests/viber/close-part-prose.unit.test.ts tests/viber/rules-close-prose.unit.test.ts -> every test passes, the new helper cases included
- DoD: `section` returns the text from the heading line up to the next `## ` line or the end; `section` throws an `Error` whose message holds the heading when no line starts with `## <heading>`; `rules-trail-prose.unit.test.ts` declares no `auditorSection`, `writerSection`, `skillSection` or own `section` function and imports `section`; `failure-trail-prose`'s `## Output` slice, `close-part-prose`'s `## 3.`, `## 5.` and `## 7.` slices of the close part and its `## 5 to 7. Close and archive` slice of `SKILL.md` and `rules-close-prose`'s `## Write`, `## Budget` and `## Calibration` slices go through `section`; every existing test of the four files still passes.
<!-- /TASK -->

<!-- TASK -->
### T2 - Report the archive directory alone from config.sh
- TDD: required
- Covers: AC8
- Uses: C2
- Depends-on: none
- Files: viber/scripts/config.sh, tests/viber/config.test.ts
- Delivers: a `--specifications` argument printing the resolved `directories.specifications` value per C2, documented in the header contract.
- Verification: node --test tests/viber/config.test.ts -> every test passes, the new `--specifications` cases included
- DoD: with no config file `config.sh --specifications` prints `specs` and exits 0; a valid `directories.specifications` value under `directories:` is printed as written; an invalid value (a slash, `..`) or the key outside its group prints `specs`; the output is exactly one line even with a `.claude/viber.local.yml` present; the branch returns before the switches block, the local file and the extensions are read; the header `argv` and `stdout` paragraphs name `--specifications` and the no-argument block is unchanged.
<!-- /TASK -->

<!-- TASK -->
### T3 - Read a loosely written Blocking line into one entry
- TDD: required
- Covers: AC4, AC5
- Uses: C1
- Depends-on: none
- Files: viber/scripts/run-failures.sh, tests/viber/run-failures.test.ts
- Delivers: Blocking line parsing per C1 (bold marker, case and space tolerant cause, no entry for empty text) and the header paragraph describing it.
- Verification: node --test tests/viber/run-failures.test.ts -> every test passes, the new parsing cases included
- DoD: `- Blocking [Convention] x` yields cause `convention`; `- Blocking [ task ] x` yields cause `task`; `- **Blocking** [plan] x` yields cause `plan` with text `x`; `- Blocking [task]` and a bare `- Blocking` yield no entry; the header's entries paragraph states these rules.
<!-- /TASK -->

<!-- TASK -->
### T4 - Keep one entry for a finding repeated across review rounds
- TDD: required
- Covers: AC6
- Uses: C1
- Depends-on: T3
- Files: viber/scripts/run-failures.sh, tests/viber/run-failures.test.ts
- Delivers: deduplication of Blocking entries per C1's round rule, and the header paragraph describing it.
- Verification: node --test tests/viber/run-failures.test.ts -> every test passes, the new deduplication cases included
- DoD: the same Blocking line in `review-T3-1.md` and `review-T3-2.md` yields one entry with source `review-T3-1`; in `review-T2-2.md` and `review-T2-10.md` one entry with source `review-T2-2`; in `review-T1-1.md` and `review-T2-1.md` two entries; the same line twice in one report, or in `final-review-1.md` and `final-review-2.md`, two entries; two identical lines of `tests-1.md` two entries; the counts line counts the entries written.
<!-- /TASK -->

<!-- TASK -->
### T5 - Count the runs whose trails hold a convention failure
- TDD: required
- Covers: AC3
- Uses: C1, C2
- Depends-on: T2, T4
- Files: viber/scripts/run-failures.sh, tests/viber/run-failures.test.ts
- Delivers: the `runs <n>` field of the counts line per C1, reading archived trails under the directory `config.sh --specifications` names, and the header `reads` and `stdout` paragraphs.
- Verification: node --test tests/viber/run-failures.test.ts -> every test passes, the new runs cases included
- DoD: with no archived trail and one convention entry the line ends `runs 1`; with one archived `failures.md` holding a convention entry and one convention entry in this run it ends `runs 2`; an archived trail holding only `test` entries adds nothing; with no convention entry in this run the count is the archived trails alone; a `directories.specifications: archive` config makes it read `docs/archive/*/failures.md`, and with no reachable `config.sh` answer it reads `docs/specs/*/failures.md`; every existing stdout assertion gains the `runs` field.
<!-- /TASK -->

<!-- TASK -->
### T6 - List every archived trail with its counts in one awk pass
- TDD: required
- Covers: AC7
- Uses: C2, C3
- Depends-on: T2
- Files: viber/skills/rules/scripts/rules-map.sh, tests/viber/rules-map.test.ts
- Delivers: `trail:` lines per C3, all archived trails counted by one awk process, the archive directory read from `config.sh --specifications` with `specs` on an empty answer, and the header's reads and stdout paragraphs.
- Verification: node --test tests/viber/rules-map.test.ts -> every test passes, the changed trail cases included
- DoD: an archived trail holding 1 convention and 2 task entries prints `trail: <path> convention 1 other 2`; a trail holding only test entries prints a `trail:` line with `convention 0`; `waiting:` sums are unchanged for the same files; a `directories.specifications` value from the config is honoured and an empty `--specifications` answer reads `specs`; the script runs no awk inside a per-file loop and holds no `*[!A-Za-z0-9._-]*` directory check; the header's format line reads `trail: <repo-relative path of one archived failures.md> convention <n> other <n>`.
<!-- /TASK -->

<!-- TASK -->
### T7 - Print the rules extend line only on an archived close with failures in two runs
- TDD: required
- Covers: AC1, AC2
- Uses: C1
- Depends-on: T1, T5
- Files: viber/skills/implementor/parts/close.md, tests/viber/close-part-prose.unit.test.ts
- Delivers: step 7 prose taking the `convention` and `runs` counts from the `failures:` line. The `/viber:rules extend` line prints on the archived form only when the convention count is above 0 and the runs count is at least 2, and never on the screen form.
- Verification: node --test tests/viber/close-part-prose.unit.test.ts -> every test passes, the changed rules line cases included
- DoD: the trail call paragraph names the `runs` count of the `failures:` line; the rules line bullet belongs to the archived form only and names a `runs` count of at least 2 with a `convention` count above 0; no screen-form or both-forms paragraph carries the `/viber:rules extend` line, and the screen form gains no line of its own about the trail; the not-written line stays in both forms; the archived close bullet still orders the rules line after the closing sentence and before the next-part line.
<!-- /TASK -->

<!-- TASK -->
### T8 - Retire every non-convention trail entry in /viber:rules
- TDD: required
- Covers: AC9
- Uses: C3
- Depends-on: T1, T6
- Files: viber/skills/rules/SKILL.md, viber/agents/rules-writer.md, viber/agents/rules-auditor.md, tests/viber/rules-trail-prose.unit.test.ts
- Delivers: the rules skill routing the trail by C3's counts, the auditor's trail scope limited to trails with a convention count above 0, and the writer removing every non-convention entry of each kept trail, with the prose tests pinning each.
- Verification: node --test tests/viber/rules-trail-prose.unit.test.ts tests/viber/rules-close-prose.unit.test.ts -> every test passes, the new retirement cases included
- DoD: step 1 reports each `trail:` line with its `convention` and `other` counts; step 5 dispatches the trail auditor only when a kept `trail:` line has a `convention` count above 0, its `scope` being those paths; the auditor input names `scope` as the `trail:` paths with a convention count above 0; step 6 dispatches the writer when a kept trail has an `other` count above 0 even with every audit counter at 0; the writer removes every entry line not starting `- convention | ` from each `failures.md` a `trail:` line of its map names, its write scope naming those files; the writer still removes a convention entry only on an applied `USED:` line or a `REJECTED:` line, and a `failures.md` left with no entry line is still deleted with `rm -- <path>`.
<!-- /TASK -->

<!-- TASK -->
### T9 - State the shell script header rule without an inventory
- TDD: none
- Covers: AC10
- Uses: none
- Depends-on: none
- Files: .claude/rules/shell-script-header.md
- Delivers: the inventory bullet rewritten as a pattern: every shipped script carries the header with its `Contract:` block, the named exception forms kept with their reason, no count and no list of script names.
- Verification: grep -c -i "thirty\|forty\|run-clock.sh\|bootstrap.sh" .claude/rules/shell-script-header.md -> 0, and grep -c "Contract:" viber/scripts/archive-run.sh -> at least 1
- DoD: the rule names no script count; the rule lists no script by name beyond `config.sh`, `commit.sh`, `plan-index.sh` and the exception scripts it already names with their form (`commit-task.sh`, `merge-settings.sh`, `worktree.sh`, `check_node.sh`, `lint_skill.sh`); the rule still says a new or substantially edited script gets the header.
<!-- /TASK -->

<!-- TASK -->
### T10 - Describe the trail behaviour in the user docs
- TDD: none
- Covers: AC12
- Uses: none
- Depends-on: T7, T8
- Files: viber/README.md, viber/docs/files.md, viber/skills/setup/assets/help.html
- Delivers: the usage guide, the file reference and both languages of the help page saying two things. The close suggests `/viber:rules extend` once convention failures stand in two runs. `/viber:rules` removes the convention entries it handled and every entry of another cause.
- Verification: node --test tests/viber/help.unit.test.ts -> every test passes, and grep -c "runs. count of at least 2" viber/skills/implementor/parts/close.md -> at least 1, and grep -c "every entry of another cause" viber/docs/files.md viber/skills/setup/assets/help.html -> at least 1 each, and grep -c "two runs" viber/README.md viber/skills/setup/assets/help.html -> at least 1 each
- DoD: `viber/docs/files.md`'s `failures.md` bullet uses the words `every entry of another cause`; `viber/README.md`'s failure trail sentence uses the words `two runs` for when the close suggests `/viber:rules extend`; the `skill-rules` card of `help.html` says both in its `en` paragraph and says both in its `pl` paragraph; `help.unit.test.ts` passes.
<!-- /TASK -->

## Contracts

### C1 - run-failures.sh entries and counts line

File: viber/scripts/run-failures.sh

```
stdout (exit 0), exactly one line:
failures: <total> convention <n> place <n> plan <n> task <n> test <n> unknown <n> runs <n>

Blocking line of a review or final review report:
  opens with "- Blocking" or "- **Blocking**", followed by the end of the line or a blank
  optional "[<cause>]" next: <cause> trimmed and lower-cased; convention | place | plan | task -> that cause, else unknown
  no bracket -> cause unknown
  text = the rest of the line, leading whitespace dropped
  empty text -> no entry

Deduplication (review-<id>-<round> reports only):
  two entries of review-<id>-<round> reports with the same <id>, different <round>,
  the same cause and the same text -> one entry, kept with the source of the lowest
  <round>, compared as a number
  entries of one report, of final-review-<n> reports and test entries are never merged

runs = number of docs/<specifications>/*/failures.md holding at least one line starting
       "- convention | ", plus 1 when this run's convention count is above 0
<specifications> = the line config.sh --specifications prints; specs when the call fails or prints nothing
```

### C2 - config.sh --specifications report

File: viber/scripts/config.sh

```
argv: --specifications
reads: the directories: group of <repo root>/.claude/viber.yml only, returning before any other pass
stdout: exactly one line, the directories.specifications value resolved as for the default block
        (default specs; invalid or outside the directories: group -> specs)
exit: 0
```

### C3 - rules-map.sh trail line

File: viber/skills/rules/scripts/rules-map.sh

```
trail: <repo-relative path of one archived failures.md> convention <n> other <n>

one line per docs/<specifications>/*/failures.md holding at least one entry of any cause,
alphabetical by path; other = place + plan + task + test + unknown of that file
```

### C4 - section helper

File: tests/harness/markdown.ts

```ts
export function section(text: string, heading: string): string
// the first line starting with "## " + heading, up to (excluding) the next line starting
// with "## ", or the end of the text; throws Error(`no "## ${heading}" heading`) when absent
```
