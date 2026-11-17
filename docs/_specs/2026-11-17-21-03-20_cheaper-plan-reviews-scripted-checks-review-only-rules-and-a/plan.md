---
source: /Users/dario/Projects/viber/docs/_specs/2026-11-17-21-03-20_cheaper-plan-reviews-scripted-checks-review-only-rules-and-a/plan.md
planned: /Users/dario/.claude-p2p2/plans/stateless-swinging-honey.md
---

To build this plan you must invoke skill `viber:implementor` with `source:` path as its only argument.

# Cheaper plan reviews: scripted checks, review-only rules and a candidate list for the reach map

## Goal

Planning should spend fewer tokens and finish sooner, mostly in the plan review, without catching fewer defects. Every check a script can decide moves out of the reviewers' reasoning into `plan-index.sh`, reviewers stop reading the rules the script enforces, reviewers search the code only where a plan changes something callers see, a script collects the reference candidates the reach map classifies, and the token report counts the planning agents so the effect shows.

## Problem

A sample of 8 `planner-review` dispatches spent 22-30 thousand output tokens each, mostly reasoning, with 40-55 `Read` and 30-50 `Grep` calls, and every failed round repeats it from scratch; a plan past 12 tasks runs 3 to 6 such reviewers at once. One `impact-mapper` run spent 64 thousand output tokens over 43 turns. Part of that reasoning decides things a regular expression decides (task and block numbering, a commit prefix in a title, a backticked command, a `CLAUDE.md` in `Files`, the `attachments:` map), and each reviewer reads `plan-rules.md` with its 20 `(script)` rules, which no reviewer gates. Reviewers are told to explore the codebase broadly, repeating the reference search the reach map already did, and the planner counts tasks and computes review slices by hand. The token report never counts a planning agent, so none of this is measurable after a build.

## Current behaviour

- `viber/scripts/plan-index.sh` rejects only the `(script)` rules of `viber/references/plan-rules.md`; numbering, titles, backticked or interpreter `Verification` commands, `CLAUDE.md` in `Files`, the `attachments:` map and unfilled template slots are left to the reviewers, and its read-after check reads `Verification` and `DoD` but not `Delivers`, and only files of lower-numbered tasks.
- `viber/skills/planner/SKILL.md` counts the rows under `tasks:` to choose between `planner-review` and the review set, computes the `ceil(n / 8)` slices itself and checks the 30-task threshold by the same count.
- `plan-rules.md` holds `(review)` and `(script)` rules side by side in its four sections; `planner-review` reads the whole file, each review-set agent reads its sections by range, `(script)` rules included.
- `planner-review`, `planner-task-review` and `planner-spec-review` explore the codebase broadly, including files the plan does not name.
- `viber/agents/impact-mapper.md` runs every search itself from a `targets:` block.
- `viber/scripts/run-tokens.sh` sums tokens only for agents whose prompt names the run directory, which no planning agent does; it counts `planner-review` and `planner-graph-review` dispatches as review rounds only.

### Must not change

- The stdout index of `plan-index.sh` under `--split`, under `--extra` and on a plain call with `status.md` beside the plan (a landed run plan): `red-check.sh`, `closeout` and `implementor` parse it.
- Every check of `plan-index.sh` keeps its exemption for a landed plan, `--split` and `--extra`; a new check applies to a fresh plan only.
- `viber/hooks/scripts/plan-gate.sh` and the review slices it requires.
- The `REF:` output lines of `impact-mapper` and the verdict lines of every planner reviewer.

## Behaviour

### S1 - A mechanical plan defect is rejected before review [NEW]

The planner writes a plan with a defect a script can decide; `plan-index.sh` refuses it with an error naming the fix, and no reviewer ever reasons about it.

Given a fresh plan whose task ids skip a number, whose contract ids skip a number, whose task title opens with `feat:`, whose `Verification` is wrapped in backticks, runs `node -e` or a script under `.temp/`, or whose `Files` list a `CLAUDE.md` while `build.memory` is on
When the planner runs `plan-index.sh` on it
Then it exits 4 with the matching C1 error, and the same plan with that defect fixed exits 0

### S2 - Attachments and template slots are checked by the script [NEW]

Given a fresh plan whose `attachments:` map holds an invalid or repeated name, whose `DoD` names an attachment the map does not hold, or which still carries a slot of the planner templates in its text
When the planner runs `plan-index.sh` on it
Then it exits 4 with the matching C1 error

### S3 - A task reading what no earlier task delivers is rejected [CHANGED - was: read-after read only `Verification` and `DoD`, and only files of lower-numbered tasks]

Given a fresh plan whose task `Delivers` names a file a lower-numbered task lists with no dependency path between them, or whose task names a file the tree does not hold that only a higher-numbered task lists
When the planner runs `plan-index.sh` on it
Then it exits 4 with the C1 error naming the reader, the path and the other task

### S4 - The index says which review to dispatch [CHANGED - was: the planner counted tasks and computed slices]

Given a fresh plan of 13 tasks
When the planner runs `plan-index.sh` on it
Then the index ends on the C2 review instruction naming the spec, graph and two task-review dispatches, and the planner dispatches exactly those

### S5 - A reviewer never sees a scripted rule [CHANGED - was: every reviewer read the `(script)` rules too]

Given a plan of 13 tasks
When the planner dispatches the review set
Then each member gates the review rules of its sections and no `(script)` rule reaches it, while the planner still holds the plan to both

### S6 - A reviewer searches only where the plan changes what callers see [CHANGED - was: explore the codebase broadly]

Given a plan changing the signature of one function
When `planner-review` checks it
Then it searches the callers of that function and confirms each lands in a task's `Files` or under `### Out of scope`, and reads no file only to learn the area

### S7 - The reach map starts from a candidate list [CHANGED - was: `impact-mapper` ran every search itself]

Given a change modifying `viber/scripts/plan-index.sh`
When the planner maps its reach
Then the candidates of C4 are collected by a script, `impact-mapper` keeps the real references and drops the false hits, and searches itself only where the candidates name a gap

### S8 - The token report counts the planning agents [CHANGED - was: no planning agent counted]

Given a run whose `plan.md` names its `planned:` path and planning transcripts whose first line names that path
When `run-tokens.sh` runs on the run directory
Then the report carries the C5 rows for the planning roles beside the build rows

### S9 - The reviewers are measured before and after the release [NEW]

Given the replay kit and the installed plugin
When the maintainer follows its procedure before the release and again after it
Then each run records the findings, tokens and tool calls of every dispatch, and a run passes only when every planted defect is reported

### Edge cases

- A `<T>` generic inside a fenced block, a backtick span or the `## Contracts` appendix -> no Filled error.
- `build.memory` off, or no `.claude/viber.yml` -> a `CLAUDE.md` in `Files` passes the script.
- A plan of exactly 12 tasks -> the single review; a plan of 31 tasks -> the C2 threshold line as well.
- A target whose candidates pass the cap, or a term too short to search -> the candidates file says so and the mapper searches that part itself.
- A file a higher-numbered task lists that the tree already holds -> no forward-reference error (the reader reads today's file).
- A run whose only transcripts naming it are planning ones -> the planning rows and the unavailable line of the build rows, both.

## Glossary

- Script rule file - the reference holding every rule `plan-index.sh` rejects, read by the planner alone; its shape is C3.
- Candidates file - the list of possible references a script writes for the reach map, which `impact-mapper` classifies; its shape is C4.
- Review instruction - the lines closing a fresh plan's index that tell the planner which reviewers to dispatch and whether the plan passed the task threshold; its shape is C2.
- Replay kit - the plans with planted defects and the procedure that measure the reviewers and the reach map before and after this change, by hand.

## Acceptance criteria

1. On a fresh plan, `plan-index.sh` exits 4 with the C1 error, naming its fix, for task ids not `T1`, `T2`, ... in order, contract ids not `C1`, `C2`, ... in order and a task title opening with a commit type prefix; a landed plan with the same defect still validates.
2. On a fresh plan, `plan-index.sh` exits 4 with the C1 error, naming its fix, for a `Verification` wrapped in backticks, one running inline interpreter code (`python -c`, `python3 -c`, `node -e`, `ruby -e`, `perl -e`) and one running a script under `.temp/`.
3. On a fresh plan in a repository whose config resolves `build.memory: true`, a task listing a file named `CLAUDE.md` in `Files` makes `plan-index.sh` exit 4 with the C1 error, naming its fix; with `build.memory` off or no config it exits 0.
4. On a fresh plan, `plan-index.sh` exits 4 with the C1 error, naming its fix, for an `attachments:` name not matching `^[A-Za-z0-9][A-Za-z0-9_.-]*$`, a name repeated in the map (case folded) and a `DoD` naming an attachment the map does not hold.
5. On a fresh plan, `plan-index.sh` exits 4 with the C1 error, naming its fix, for a slot of the planner templates left in the plan text outside fenced blocks, HTML comments, backtick spans and the `## Contracts` appendix.
6. On a fresh plan, `plan-index.sh` exits 4 with the C1 read-after error for a `Delivers` naming a file a lower-numbered task lists with no dependency path to it, and with the C1 forward error, naming its fix, for a `Verification`, `Delivers` or `DoD` naming a file the tree does not hold that only a higher-numbered task lists.
7. The index of a fresh plan ends on the C2 review instruction, its task-review slices cut as `plan-gate.sh` cuts them; a landed plan, `--split` and `--extra` print none of it.
8. `planner/SKILL.md` dispatches the reviewers the C2 lines name and asks the threshold question on the C2 threshold line, counting no task and computing no slice itself.
9. Every `(script)` rule lives in the C3 script rule file, read by the planner alone, `plan-rules.md` keeping only review rules in its four sections; no planner reviewer reads a `(script)` rule, and none checks what AC1 to AC6 make `plan-index.sh` reject.
10. `planner-review`, `planner-task-review` and `planner-spec-review` grep callers only of the symbols whose signature or observable behaviour the plan changes (a moved or deleted file changing all of its symbols) and the documents and `.claude/rules/` files naming a path the plan modifies, moves or deletes, the end-to-end spec search of the `Grounded` check of `planner-review` and `planner-task-review` excepted; they check that each reference found sits in the `### File map`, a task's `Files` or `### Out of scope` (`planner-task-review`, reading only its own tasks, in the `### File map` or `### Out of scope`), and read a file only to confirm a hit or to check a task's change against the code it modifies; `planner-graph-review` keeps its exploration.
11. The planner runs the C4 script with the reach targets before dispatching `impact-mapper`; the mapper, given the candidates file, classifies its candidates, drops false hits, searches itself only for a target the file marks truncated or a term it skipped and for a `| new` target's globs or counts not naming its directory, and returns the same `REF:` lines.
12. `run-tokens.sh` prints the C5 rows for every `planner-review`, `planner-spec-review`, `planner-graph-review`, `planner-task-review`, `impact-mapper` and `adr-screener` transcript whose first line names the run's `planned:` path, each transcript counted once.
13. `tests/viber/replay/plan-review/` holds three plans recovered from archived runs, each passing `plan-index.sh`, which together carry a missed caller, a missed reach file (a document or `.claude/rules/` file naming a changed path) and a wrong or missing `Depends-on`, the findings and the reach references each must produce, and the procedure that measures the installed reviewers and `impact-mapper` before the release and the released ones after, comparing the findings and each dispatch's `subagent_tokens` and `tool_uses`.

## Scope

### File map

- modify - viber/scripts/plan-index.sh - the new fresh-plan checks (C1) and the review instruction (C2)
- modify - tests/viber/plan-index.test.ts - the cases proving each new check and the review instruction
- modify - viber/references/plan-rules.md - review rules only
- add - viber/references/plan-rules-script.md - every `(script)` rule (C3)
- modify - tests/viber/test-pyramid-prose.unit.test.ts - its `(script)` rule lookups and the size caps
- modify - tests/viber/guard-prose.unit.test.ts - its Provable rule lookup
- modify - tests/viber/red-check.test.ts - its backtick case on a landed plan
- modify - viber/docs/files.md - the candidates files under `.temp/viber/planner/`
- modify - tests/viber/rule-budget.unit.test.ts - the planner read set
- add - tests/viber/plan-review-prose.unit.test.ts - pins the rule reads, the dropped and kept checks, the scoped search and the planner's C2 use
- modify - viber/agents/planner-review.md - no scripted rule or check, scoped search
- modify - viber/agents/planner-spec-review.md - the same
- modify - viber/agents/planner-task-review.md - the same
- modify - viber/agents/planner-graph-review.md - no scripted rule or check
- modify - viber/skills/planner/SKILL.md - reads both rule files, acts on the C2 lines, runs `reach.sh`, hands the candidates to `impact-mapper`
- add - viber/skills/planner/scripts/reach.sh - writes the C4 candidates file
- add - tests/viber/reach.test.ts - proves `reach.sh`
- modify - viber/agents/impact-mapper.md - classifies the C4 candidates
- modify - tests/viber/impact-mapper-prose.unit.test.ts - pins the new mapper and planner wording
- modify - viber/scripts/run-tokens.sh - the C5 rows
- modify - tests/viber/run-tokens.test.ts - proves those rows
- add - tests/viber/replay/plan-review/README.md - the replay procedure
- add - tests/viber/replay/plan-review/expected.md - the findings and references each replay plan must produce
- add - tests/viber/replay/plan-review/plan-a.md, plan-b.md, plan-c.md - the replay plans

### Out of scope

- Incremental re-review (re-dispatching only the members whose scope changed) and every change to `viber/hooks/scripts/plan-gate.sh`.
- The model and `effort:` of every agent.
- `viber/agents/outside-plan-review.md` keeps its broad exploration.
- The `CLAUDE.md` nodes and section files describing these files (`viber/CLAUDE.md`, `viber/agents/CLAUDE.md`, `viber/references/CLAUDE.md`, `viber/scripts/CLAUDE.md`, `viber/scripts/CLAUDE.run-scripts.md`, `viber/skills/CLAUDE.md`, `viber/hooks/CLAUDE.md`, `tests/CLAUDE.md`, `tests/viber/CLAUDE.md`): with `build.memory` on, the build's close updates them.
- The `.claude/rules/` files naming `plan-index.sh`, `plan-rules.md`, `planner-review.md` or `planner/SKILL.md` (shell, review-findings, agent and instruction-editing rules): with `build.rules` on, the build's close corrects a line the change leaves stale.
- Every other caller of `plan-index.sh` (`implementor`, `closeout`, `red-check.sh`, `commit-task.sh`, `archive-run.sh`, `plan-path.sh`, `planner/references/adr-tasks.md` and the `adr` and `branching` fragments) and their tests (`commit-task`, `plan-path`, `archive-run`, `resume-prose`, `extras-prose`, `root-cause-prose`, `e2e-prose`): they read the index of a landed plan, only need exit 0, or pin review rules that stay in `plan-rules.md`.
- The plan gate side (`viber/hooks/scripts/plan-gate.sh`, `plan-hints.sh`, `hooks.json`, `plugin.json`, `tests/viber/plan-gate.test.ts`, `plan-hints.test.ts`) and the callers of the planner (`intent`, `fixer`, `intent-prose`): the reviewer names, inputs and the planner's arguments stay.
- The user guides (`viber/README.md`, `help.html`, the flow SVGs, `docs/viber-functions.html`): `impact-mapper` still finds every reference, the reviewers keep their roles and still gate the rules tagged `(review)`, as they describe.
- `tests/viber/close-part-prose.unit.test.ts` and `nudge-prose.unit.test.ts`: the `run-tokens.sh` call, its summary lines and the planner's `SendMessage` wording stay.

## Solution requirements

- Every script runs on Windows (Git Bash) and macOS: bash, no `jq`, no `bc`, no heredoc, values into awk through `ENVIRON`, no apostrophe inside a single-quoted awk block.
- A new script ships mode 100755 and carries the header and `Contract:` block of the other run scripts.
- An agent with read-only tools gets no `Bash`.
- Every edit to a skill or agent follows the `skill-designer` doctrine, and every edit honours the "Change together" lists of the `CLAUDE.md` nodes over the files it touches.
- The review slices of C2 equal the ones `viber/hooks/scripts/plan-gate.sh` requires for the same task count.

## Tasks

<!-- TASK -->
### T1 - Move the scripted plan rules into a file only the planner reads
- TDD: required
- Covers: AC9
- Uses: C3
- Depends-on: none
- Files: viber/references/plan-rules.md, viber/references/plan-rules-script.md, viber/skills/planner/SKILL.md, viber/agents/planner-review.md, viber/agents/planner-spec-review.md, viber/agents/planner-task-review.md, viber/agents/planner-graph-review.md, tests/viber/plan-review-prose.unit.test.ts, tests/viber/test-pyramid-prose.unit.test.ts, tests/viber/rule-budget.unit.test.ts
- Delivers: every `(script)` rule leaves `plan-rules.md` for the C3 script rule file, which the planner reads beside `plan-rules.md` and no reviewer reads
- Verification: node --test tests/viber/plan-review-prose.unit.test.ts tests/viber/test-pyramid-prose.unit.test.ts tests/viber/guard-prose.unit.test.ts tests/viber/rule-budget.unit.test.ts tests/viber/root-cause-prose.unit.test.ts tests/viber/e2e-prose.unit.test.ts tests/viber/impact-mapper-prose.unit.test.ts tests/viber/nudge-prose.unit.test.ts -> every case passes
- DoD: `plan-rules.md` holds no line ending in `(script)`, keeps every `(review)` rule in its own section, and its opening paragraph says the scripted rules live in `plan-rules-script.md`; `plan-rules-script.md` holds every rule that ended in `(script)`, word for word, under the `## ` heading of the section it came from; `planner/SKILL.md` step 1 reads `plan-rules-script.md` together with `plan-rules.md` and holds the plan to both; none of the four planner reviewers names `plan-rules-script.md` or `(script)` rules; `plan-review-prose.unit.test.ts` fails when a `(script)` line returns to `plan-rules.md`, when a reviewer names the script rule file, or when the planner stops reading it; the `test-pyramid-prose` cases that pinned a `(script)` line read it from `plan-rules-script.md`, and the planner read set of `rule-budget.unit.test.ts` counts `plan-rules-script.md`
<!-- /TASK -->

<!-- TASK -->
### T2 - Reject misnumbered tasks and blocks and a commit-typed title
- TDD: required
- Covers: AC1
- Uses: C1, C3
- Depends-on: T1
- Files: viber/scripts/plan-index.sh, tests/viber/plan-index.test.ts, viber/references/plan-rules.md, viber/references/plan-rules-script.md, tests/viber/test-pyramid-prose.unit.test.ts, tests/viber/rule-budget.unit.test.ts
- Delivers: `plan-index.sh` rejects, on a fresh plan, task ids out of `T1`, `T2`, ... order, contract ids out of `C1`, `C2`, ... order and a task title opening with a commit type prefix, each with its C1 error
- Verification: node --test tests/viber/plan-index.test.ts tests/viber/test-pyramid-prose.unit.test.ts tests/viber/rule-budget.unit.test.ts tests/viber/plan-review-prose.unit.test.ts -> every case passes
- DoD: a fresh plan whose tasks are `T1` and `T3` exits 4 with the C1 Ids error naming `T3`, and `T1`, `T2` exits 0; a fresh plan whose blocks are `C1` and `C3` exits 4 with the C1 Blocks error naming `C3`; a task titled `feat(viber): Add x`, `fix: Add x`, `Fix: Add x` or `chore!: Add x` exits 4 with the C1 Title error naming the prefix, and `Fix the parser` exits 0; each of those plans exits 0 under `--split` and as a landed plan with `status.md` beside it; `plan-rules-script.md` holds `Ids`, the numbering half of `Blocks` and the prefix half of `Title` as `(script)` rules, `plan-rules.md` dropping `Ids` and keeping of `Blocks` and `Title` only what no script decides; the `plan-index.sh` header lists the three cases among the exit-4 cases and their landed-plan exemption
<!-- /TASK -->

<!-- TASK -->
### T3 - Reject backticked, interpreter and .temp Verification commands
- TDD: required
- Covers: AC2
- Uses: C1, C3
- Depends-on: T2
- Files: viber/scripts/plan-index.sh, tests/viber/plan-index.test.ts, viber/references/plan-rules.md, viber/references/plan-rules-script.md, tests/viber/test-pyramid-prose.unit.test.ts, tests/viber/guard-prose.unit.test.ts, tests/viber/rule-budget.unit.test.ts, tests/viber/red-check.test.ts
- Delivers: `plan-index.sh` rejects, on a fresh plan, a `Verification` wrapped in backticks, one running inline interpreter code and one running a script under `.temp/`, each with its C1 error
- Verification: node --test tests/viber/plan-index.test.ts tests/viber/red-check.test.ts tests/viber/test-pyramid-prose.unit.test.ts tests/viber/guard-prose.unit.test.ts tests/viber/rule-budget.unit.test.ts tests/viber/e2e-prose.unit.test.ts tests/viber/plan-review-prose.unit.test.ts -> every case passes
- DoD: a `Verification` whose command before ` -> ` is wrapped in backticks exits 4 with the C1 backtick error; commands running `node -e`, `python -c`, `python3 -c`, `ruby -e` or `perl -e` in command position each exit 4 with the C1 interpreter error naming that token, while `node --test tests/a.test.ts` and `grep -c 'node -e' docs/a.md` exit 0; `bash .temp/run.sh` and `./.temp/run.sh` exit 4 with the C1 `.temp/` error naming the path, while `node --test x > .temp/log` and `grep x .temp/a.md` exit 0; each of those plans exits 0 under `--split` and as a landed plan, and the existing backtick-unwrapping cases of `plan-index.test.ts` and of `red-check.test.ts` seed a `status.md` beside their plan so the unwrapping of a landed run stays proven; `plan-rules-script.md` holds the three checks as one `(script)` `Provable` rule and the `Provable` rule of `plan-rules.md` no longer states them, `guard-prose.unit.test.ts` reading the interpreter sentence from the script rule; the `plan-index.sh` header lists the three cases and their exemption
<!-- /TASK -->

<!-- TASK -->
### T4 - Reject a CLAUDE.md in Files while build.memory is on
- TDD: required
- Covers: AC3
- Uses: C1, C3
- Depends-on: T3
- Files: viber/scripts/plan-index.sh, tests/viber/plan-index.test.ts, viber/references/plan-rules.md, viber/references/plan-rules-script.md, tests/viber/test-pyramid-prose.unit.test.ts, tests/viber/rule-budget.unit.test.ts
- Delivers: `plan-index.sh` rejects, on a fresh plan in a repository whose config resolves `build.memory: true`, a task listing a file named `CLAUDE.md` in `Files`, with its C1 error
- Verification: node --test tests/viber/plan-index.test.ts tests/viber/test-pyramid-prose.unit.test.ts tests/viber/rule-budget.unit.test.ts tests/viber/plan-review-prose.unit.test.ts -> every case passes
- DoD: in a repository whose `.claude/viber.yml` sets `memory: true` under `build:`, a task listing `src/CLAUDE.md` or the root `CLAUDE.md` exits 4 with the C1 Memory-owned error naming that path, while `docs/CLAUDE-notes.md` and `viber/scripts/CLAUDE.run-scripts.md` exit 0; with `memory: false` or no `.claude/viber.yml` the same plan exits 0; `memory: true` written at column 0 or under another group exits 0, since the value is the `build.memory:` line `viber/scripts/config.sh` prints, run on a fresh plan only and in the caller's cwd (the repository `plan-index.sh` already reads with `git status`), never in the plan's own directory, so a plan file outside the repository still gets the check; a landed plan with the `CLAUDE.md` entry exits 0; `Memory-owned` moves from `plan-rules.md` to `plan-rules-script.md` as a `(script)` rule; the `plan-index.sh` header lists the case, its exemption and the `config.sh` read
<!-- /TASK -->

<!-- TASK -->
### T5 - Check the attachments map and the attachments a DoD names
- TDD: required
- Covers: AC4
- Uses: C1, C3
- Depends-on: T4
- Files: viber/scripts/plan-index.sh, tests/viber/plan-index.test.ts, viber/references/plan-rules-script.md, tests/viber/rule-budget.unit.test.ts
- Delivers: `plan-index.sh` reads the frontmatter `attachments:` map of a fresh plan and rejects an invalid name, a repeated name and a `DoD` naming an attachment the map does not hold, each with its C1 error
- Verification: node --test tests/viber/plan-index.test.ts tests/viber/test-pyramid-prose.unit.test.ts tests/viber/rule-budget.unit.test.ts tests/viber/plan-review-prose.unit.test.ts -> every case passes
- DoD: a map entry named `my file.png` or `-a.png` exits 4 with the C1 invalid name error naming it; entries `a.png` and `A.png` exit 4 with the C1 repeat error naming `A.png`; a `DoD` naming `attachments/b.png` with no `b.png` entry exits 4 with the C1 DoD error, while `attachments/a.png` with an `a.png` entry and `attachments/mock/` with a `mock` entry exit 0; a plan with no frontmatter or no `attachments:` key exits 0, and a landed plan with a bad map exits 0; `plan-rules-script.md` holds the three checks as one `(script)` rule named `Attachments` under `## Spec`; the `plan-index.sh` header lists the cases and their exemption
<!-- /TASK -->

<!-- TASK -->
### T6 - Reject a template slot left in the plan
- TDD: required
- Covers: AC5
- Uses: C1, C3
- Depends-on: T5
- Files: viber/scripts/plan-index.sh, tests/viber/plan-index.test.ts, viber/references/plan-rules-script.md, tests/viber/rule-budget.unit.test.ts
- Delivers: `plan-index.sh` rejects, on a fresh plan, a slot of the planner templates left in the plan text, with its C1 error naming the line and the slot
- Verification: node --test tests/viber/plan-index.test.ts tests/viber/test-pyramid-prose.unit.test.ts tests/viber/rule-budget.unit.test.ts tests/viber/plan-review-prose.unit.test.ts -> every case passes
- DoD: a plan keeping `<2-4 sentences: what gets built and why. No description of the solution.>` under `## Goal`, or a heading `### S<n> - Login`, exits 4 with the C1 Filled error naming the line number and the slot; `<T>`, `<repo-relative path>` or `<n>` inside a fenced block, a backtick span, an HTML comment or the `## Contracts` appendix exits 0; the slots are read at run time as the `<...>` spans outside HTML comments of the three files under `viber/skills/planner/templates/`, located from the script's own directory, so a slot added to a template is checked with no change to `plan-index.sh`, and a missing templates directory skips the check; a landed plan with a slot exits 0; `plan-rules-script.md` holds the check as a `(script)` rule named `Filled` under `## Spec`; the `plan-index.sh` header lists the case and its exemption
<!-- /TASK -->

<!-- TASK -->
### T7 - Reject reading a file before the task that delivers it
- TDD: required
- Covers: AC6
- Uses: C1, C3
- Depends-on: T6
- Files: viber/scripts/plan-index.sh, tests/viber/plan-index.test.ts, viber/references/plan-rules.md, viber/references/plan-rules-script.md, tests/viber/test-pyramid-prose.unit.test.ts, tests/viber/rule-budget.unit.test.ts, tests/viber/plan-review-prose.unit.test.ts
- Delivers: the read-after check of `plan-index.sh` also reads `Delivers`, and a fresh plan whose task names a file that the tree does not hold and only higher-numbered tasks list is rejected with the C1 forward error; the review `Ordered` rule leaves files to that check
- Verification: node --test tests/viber/plan-index.test.ts tests/viber/test-pyramid-prose.unit.test.ts tests/viber/rule-budget.unit.test.ts tests/viber/plan-review-prose.unit.test.ts -> every case passes
- DoD: `T2` whose `Delivers` names `src/login.ts`, which `T1` lists, with no dependency path to `T1` exits 4 with the C1 read-after error naming `T2`, the path and `T1`, and with `Depends-on: T1` exits 0; `T1` whose `Verification`, `Delivers` or `DoD` names `src/new.ts`, absent from the tree and listed by `T2` and `T3` only, exits 4 with the C1 forward error naming `T1`, the path and `T2`, the lowest-numbered lister; the same path present in the tree exits 0, and so does a path the reading task lists itself, and a `Delivers` of a task whose every `Files` path lies under `docs/adr/` naming paths other tasks list (a decision record task of `planner/references/adr-tasks.md`) exits 0; a landed plan with either defect exits 0; the `(script)` `Read after` rule of `plan-rules-script.md` names `Delivers`, the forward case and the decision record exemption; the `Ordered` rule of `plan-rules.md` asks a `Depends-on` for each route, symbol or file another task creates or changes, a file named by its whole repo-relative path being left to `Read after` and a file named any other way (a bare file name, a file read without its path) staying the reviewer's, and `plan-review-prose.unit.test.ts` pins that
<!-- /TASK -->

<!-- TASK -->
### T8 - Print the review instruction on a fresh plan
- TDD: required
- Covers: AC7
- Uses: C2
- Depends-on: T7
- Files: viber/scripts/plan-index.sh, tests/viber/plan-index.test.ts
- Delivers: the index of a fresh plan ends on the C2 lines naming the reviewers to dispatch and, past 30 tasks, the threshold line
- Verification: node --test tests/viber/plan-index.test.ts tests/viber/red-check.test.ts -> every case passes
- DoD: a fresh plan of 12 tasks ends on `review: single` and `dispatch: viber:planner-review`; 13 tasks end on `review: set`, the spec and graph dispatch lines and the task-review lines `tasks: T1-T7` and `tasks: T8-T13`, and 30 tasks on `T1-T8`, `T9-T16`, `T17-T23`, `T24-T30`; 31 tasks add `threshold: 31 tasks, past 30`, and 30 tasks print no threshold line; a landed plan, `--split` and `--extra` print no C2 line, and the rows between `tasks:` and the first `verify:` are unchanged; the header documents the C2 lines
<!-- /TASK -->

<!-- TASK -->
### T9 - Stop the reviewers checking what plan-index rejects
- TDD: required
- Covers: AC9
- Uses: C1
- Depends-on: T7
- Files: viber/agents/planner-review.md, viber/agents/planner-spec-review.md, viber/agents/planner-graph-review.md, viber/agents/planner-task-review.md, tests/viber/plan-review-prose.unit.test.ts
- Delivers: the planner reviewers carry no check the C1 errors decide, keeping every check no script can make
- Verification: node --test tests/viber/plan-review-prose.unit.test.ts tests/viber/rule-budget.unit.test.ts tests/viber/e2e-prose.unit.test.ts tests/viber/test-pyramid-prose.unit.test.ts -> every case passes
- DoD: the `Faithful` check of `planner-review.md` and `planner-spec-review.md` keeps an `Attachment:` line of the input missing from the map and drops the name pattern, the repeated name and the attachment reference a `DoD` makes; their `Filled` check drops the template slots outside fenced blocks, backtick spans, HTML comments and contract blocks and the unnumbered scenarios, keeping a slot inside those and an example line nobody replaced; the `Wired` check of `planner-review.md` and `planner-graph-review.md` checks routes, symbols and every file not named by its whole repo-relative path (a bare file name, a file read without its path), whole-path files being left to the script, and keeps the Minor finding for an edge consuming nothing; the `memory:` input line of `planner-review.md`, `planner-graph-review.md` and `planner-task-review.md` names what still reads it (the `Provable` grep exclusion, and the graph reviewer's own check of a proposed fix), never the `Memory-owned` rule; `plan-review-prose.unit.test.ts` fails when any dropped check returns and when a kept one goes
<!-- /TASK -->

<!-- TASK -->
### T10 - Scope the reviewers' code search to what the plan changes
- TDD: required
- Covers: AC10
- Uses: none
- Depends-on: T9
- Files: viber/agents/planner-review.md, viber/agents/planner-spec-review.md, viber/agents/planner-task-review.md, tests/viber/plan-review-prose.unit.test.ts, tests/viber/rule-budget.unit.test.ts
- Delivers: `planner-review`, `planner-task-review` and `planner-spec-review` grep callers only of the symbols whose signature or observable behaviour the plan changes, a moved or deleted file changing all of its symbols, and the documents and `.claude/rules/` files naming a path the plan modifies, moves or deletes, and read a file only to confirm a hit or to check a task's change against the code it modifies
- Verification: node --test tests/viber/plan-review-prose.unit.test.ts tests/viber/e2e-prose.unit.test.ts tests/viber/test-pyramid-prose.unit.test.ts tests/viber/rule-budget.unit.test.ts -> every case passes
- DoD: none of the three agents says to explore the codebase broadly or to read files the plan does not name; each states the scoped search of `Delivers`, `planner-review.md` and `planner-task-review.md` naming the end-to-end spec search of their `Grounded` check as the one search past it and `planner-spec-review.md` naming none; `planner-review.md` and `planner-spec-review.md` make a reference the search reaches that sits in neither the `### File map`, a task's `Files` nor `### Out of scope` a finding, and `planner-task-review.md`, reading only its own task blocks, checks it against the `### File map` and `### Out of scope` alone; the `Grounded` sentences pinned by `e2e-prose.unit.test.ts` stay; `planner-graph-review.md` keeps its exploration sentence; `plan-review-prose.unit.test.ts` pins the scoped sentence in the three agents and its absence in the graph reviewer
<!-- /TASK -->

<!-- TASK -->
### T11 - Collect the reach candidates in a script
- TDD: required
- Covers: AC11
- Uses: C4
- Depends-on: none
- Files: viber/skills/planner/scripts/reach.sh, tests/viber/reach.test.ts, viber/docs/files.md
- Delivers: `reach.sh` writes the C4 candidates file for the targets it gets and prints its path and counts, and `docs/files.md` lists that write
- Verification: node --test tests/viber/reach.test.ts tests/portability.unit.test.ts -> every case passes
- DoD: in a repository where `src/b.ts` imports `./auth` and `docs/x.md` names `src/auth.ts`, `reach.sh "src/auth.ts"` writes a C4 file under `.temp/viber/planner/` whose `## src/auth.ts` section lists both with their lines and never `src/auth.ts` itself, and prints `candidates:` with the absolute path and the `hits:` line; `"src/auth.ts | parse"` lists a whole-word `parse` and never `parser`, and `"src/new/c.ts | new"` lists the files naming `src/new`; `"src/io.ts"` lists the `skipped: io` line, and a target past 200 hit lines keeps 200 and the `truncated:` line; an untracked file the repository does not ignore is searched and a file under `.temp/` never; no target or a directory outside a git repository exits 2 with one `error:` line on stderr and writes nothing, the header documenting argv, cwd, writes, stdout and exit as C4 states them; `reach.sh` is recorded `100755` (`git update-index --add --chmod=+x`), and the `.temp/viber/` row of `viber/docs/files.md` names the planner's candidates files in `.temp/viber/planner/`
<!-- /TASK -->

<!-- TASK -->
### T12 - Classify the reach candidates in impact-mapper
- TDD: required
- Covers: AC11
- Uses: C4
- Depends-on: T10, T11
- Files: viber/agents/impact-mapper.md, viber/skills/planner/SKILL.md, tests/viber/impact-mapper-prose.unit.test.ts, tests/viber/rule-budget.unit.test.ts, viber/skills/planner/scripts/reach.sh
- Delivers: the planner runs `reach.sh` before dispatching `impact-mapper` with the C4 lines, and `impact-mapper` builds its `REF:` lines from the candidates file
- Verification: node --test tests/viber/impact-mapper-prose.unit.test.ts tests/viber/rule-budget.unit.test.ts tests/viber/test-pyramid-prose.unit.test.ts tests/viber/e2e-prose.unit.test.ts tests/viber/nudge-prose.unit.test.ts tests/portability.unit.test.ts -> every case passes
- DoD: the `allowed-tools` of `planner/SKILL.md` carry `Bash(${CLAUDE_SKILL_DIR}/scripts/reach.sh:*)`, and its reach step runs `reach.sh` as one literal line with one double-quoted argument per target, saying its one write under `.temp/` is expected in plan mode (step 2's "only file you may write" sentence worded to agree), then dispatches `impact-mapper` with the C4 `plan:` and `candidates:` lines before the `targets:` block; the `## Input` of `impact-mapper.md` names `plan:` as the plan path carried for the token report and never read, and `candidates:` as the file it classifies; the mapper keeps each candidate that refers to its target with the kind it reads there and drops a name shared with an unrelated symbol, and searches itself only for a target the file marks `truncated:`, a term it lists as `skipped:` and, for a `| new` target, a glob or count that does not name its directory; on a `reach.sh` exit 2 the planner dispatches the mapper without a `candidates:` line and the mapper runs every search itself, as today, which keeps the `| new` and type-symbol search sentences `impact-mapper-prose.unit.test.ts` pins; its `REF:`, `VERDICT:` and `DENIED` lines are unchanged, and the portability sweep passes with `reach.sh` invoked bare, `git ls-files -s` reading `100755` for it; `impact-mapper-prose.unit.test.ts` pins the `reach.sh` call, the C4 dispatch lines and the classifying sentences
<!-- /TASK -->

<!-- TASK -->
### T13 - Act on the review instruction in the planner
- TDD: required
- Covers: AC8
- Uses: C2
- Depends-on: T8, T12
- Files: viber/skills/planner/SKILL.md, tests/viber/plan-review-prose.unit.test.ts, tests/viber/rule-budget.unit.test.ts
- Delivers: the planner dispatches the reviewers the C2 lines name and asks the threshold question on the C2 threshold line, counting no task and computing no slice
- Verification: node --test tests/viber/plan-review-prose.unit.test.ts tests/viber/rule-budget.unit.test.ts tests/viber/impact-mapper-prose.unit.test.ts tests/viber/e2e-prose.unit.test.ts tests/viber/nudge-prose.unit.test.ts tests/viber/test-pyramid-prose.unit.test.ts -> every case passes
- DoD: step 2 asks the threshold question again only on a `threshold:` line, and only when its count is above the accepted count if the user accepted one, never counting the `tasks:` rows; step 3 dispatches exactly the `dispatch:` lines of the last `plan-index.sh` run, a task-review dispatch carrying its line's `tasks:` value, each member with the inputs it takes today; `planner/SKILL.md` holds no `ceil`, no slice example and no 12-task count; `plan-review-prose.unit.test.ts` pins the two sentences and the absence of the count
<!-- /TASK -->

<!-- TASK -->
### T14 - Count the planning agents in the token report
- TDD: required
- Covers: AC12
- Uses: C5
- Depends-on: none
- Files: viber/scripts/run-tokens.sh, tests/viber/run-tokens.test.ts
- Delivers: `run-tokens.sh` prints the C5 rows for the planning transcripts that name the run's `planned:` path
- Verification: node --test tests/viber/run-tokens.test.ts tests/portability.unit.test.ts -> every case passes
- DoD: a run whose `plan.md` names `planned: C:/plans/p.md`, with one transcript each of `viber:planner-review`, `viber:planner-spec-review`, `viber:planner-graph-review`, `viber:planner-task-review`, `viber:impact-mapper` and `viber:adr-screener` whose first line names that path, prints a C5 row for each of those roles with the summed usage, a transcript older than the run day included; a transcript naming both the run directory and the planned path counts once; a planning transcript naming another path, one with no readable usage, and a run with no `planned:` line add no row; the planning rows come after the build rows, sorted by role then model, and before the `tokens: agents only` line; a run whose only transcripts naming it are planning ones prints the `tokens: unavailable` line the build rows print today, then the planning rows, then `rounds:`, the case "with no transcript naming the run the unavailable token line is followed by the rounds line" giving its planning transcript an assistant usage line and expecting that row there, the `rounds:` line and the build rows staying unchanged and the header documenting the rows
<!-- /TASK -->

<!-- TASK -->
### T15 - Replay plans with planted defects
- TDD: none
- Covers: AC13
- Uses: C2
- Depends-on: T8
- Files: tests/viber/replay/plan-review/plan-a.md, tests/viber/replay/plan-review/plan-b.md, tests/viber/replay/plan-review/plan-c.md
- Delivers: three plans recovered with `git show` from the decompose commits of the archived runs `2026-11-15-10-32-10_four-diagnosis-and-enforcement-practices-taken-from-pstack-i` (`7325c99c`), `2026-11-16-11-25-26_token-report-re-review-from-earlier-findings-and-a-continuat` (`9aaa056b`) and `2026-11-16-15-25-07_sharper-plans-and-fewer-wasted-build-attempts` (`f3bff883`), each with planted defects no script rejects
- Verification: ls tests/viber/replay/plan-review/plan-a.md tests/viber/replay/plan-review/plan-b.md tests/viber/replay/plan-review/plan-c.md | xargs -n1 viber/scripts/plan-index.sh | grep -c '^review: ' -> 3
- DoD: each plan passes `plan-index.sh`, its index ending on a C2 review instruction; each plan carries at least one planted defect no `plan-index.sh` check rejects; across the three plans the kit plants a caller of a changed symbol missing from every `Files` and from `### Out of scope`, a document or `.claude/rules/` file naming a changed path missing the same way, and a `Depends-on` missing for a consumed symbol
<!-- /TASK -->

<!-- TASK -->
### T16 - Replay procedure and expected results
- TDD: none
- Covers: AC13
- Uses: C2, C4
- Depends-on: T12, T15
- Files: tests/viber/replay/plan-review/README.md, tests/viber/replay/plan-review/expected.md
- Delivers: the findings and reach references each replay plan must produce, and the by-hand procedure measuring the reviewers and `impact-mapper` before the release and after it
- Verification: grep -c -e 'candidates:' -e 'plan-a.md' -e 'plan-b.md' -e 'plan-c.md' tests/viber/replay/plan-review/README.md tests/viber/replay/plan-review/expected.md viber/skills/planner/scripts/reach.sh -> README.md and expected.md count at least 4, reach.sh at least 1
- DoD: `expected.md` lists, per plan file, the summary its reviewers get as `input:` (taken from the archived run's `spec.md`), every planted defect with the rule a reviewer reports it under, and the reach targets with the referring files `impact-mapper` must return; `README.md` pins, per plan, the tree both runs read (a worktree at the parent of that plan's decompose commit, against which `expected.md` records its references), says the kit does not measure `Faithful`, since the summary comes from the plan's own run, and gives the dispatch lines: each reviewer the plan's C2 review instruction names with the plan path, `refs:` and the inputs it takes (`input:` with the summary for `planner-review` and `planner-spec-review`, `memory: true` for `planner-review`, `planner-graph-review` and `planner-task-review`, and its line's `tasks:` value for a task-review member), and `impact-mapper` with `targets:` alone on the installed plugin 0.95.2 before the release, and after it with the C4 `plan:` and `candidates:` lines a `reach.sh` run on the listed targets prints; `README.md` records each dispatch's findings or `REF:` lines, `subagent_tokens` and `tool_uses`, and counts a run as passing only when every defect and reference of `expected.md` is reported
<!-- /TASK -->

## Contracts

### C1 - plan-index fresh plan errors

File: viber/scripts/plan-index.sh

```
error: task <id>: id must be T<k>, the <k>th task block in order - renumber the tasks (Ids)
error: contract <id>: id must be C<k>, the <k>th block in order - renumber the blocks (Blocks)
error: task <id>: title opens with the commit type prefix "<prefix>" - drop it, the commit subject is "<id> - <title>" (Title)
error: task <id>: Verification is wrapped in backticks - write the command bare (Provable)
error: task <id>: Verification runs inline interpreter code "<token>" - run a project test or script instead (Provable)
error: task <id>: Verification runs <path> under .temp/ - run a project test or script instead (Provable)
error: task <id>: Files lists <path> while build.memory is on - drop it, the build close updates every CLAUDE.md (Memory-owned)
error: attachments: name "<name>" is not one path component of letters, digits, _, . and - opening on a letter or digit - rename it (Attachments)
error: attachments: name "<name>" repeats an earlier one - rename one of them (Attachments)
error: task <id>: DoD names attachments/<name>, absent from the attachments map - add a <name> entry or drop the reference (Attachments)
error: line <n>: template slot <slot> left unfilled - replace it (Filled)
error: task <id> reads <path>, listed by <other>, but has no dependency path to <other> - add <other> to its Depends-on
error: task <id> reads <path>, which only the later task <other> creates - move the reading after <other> (Read after)

<prefix>: feat, fix, docs, style, refactor, perf, test, build, ci, chore or revert,
          case folded, an optional (scope), an optional !, then ":"
inline interpreter: a command word node, python, python3, ruby or perl followed by its
                    inline code option (-e, -c); a quoted argument of another command is none
.temp/ script: a command word starting with .temp/ or ./.temp/, or the first non-option
               argument of an interpreter word (bash, sh, node, python, python3, ruby, perl)
               starting that way; a redirect target or another command's argument is none
<other> of the forward error: the lowest-numbered task listing the path
exit 4 on any of them; a fresh plan only (plain call, no status.md beside the plan)
```

### C2 - plan-index review instruction

File: viber/scripts/plan-index.sh

```
printed last, on a fresh plan only (plain call, no status.md beside the plan)

review: single                                       12 tasks or fewer
dispatch: viber:planner-review

review: set                                          more than 12 tasks
dispatch: viber:planner-spec-review
dispatch: viber:planner-graph-review
dispatch: viber:planner-task-review | tasks: T<a>-T<b>
  one per slice: ceil(n / 8) runs of consecutive tasks, sizes differing by at most one,
  the larger first (13 -> T1-T7, T8-T13; 30 -> T1-T8, T9-T16, T17-T23, T24-T30)

threshold: <n> tasks, past 30                        only when n > 30
```

### C3 - plan rule files

File: viber/references/plan-rules-script.md, viber/references/plan-rules.md

```
viber/references/plan-rules.md         every (review) rule, under ## Spec, ## Graph, ## Task
                                       and ## Contracts; read by the planner and every planner
                                       reviewer, each reviewer its own sections
viber/references/plan-rules-script.md  every (script) rule, under the same four headings;
                                       read by the planner alone, rejected by plan-index.sh
```

### C4 - reach candidates

File: viber/skills/planner/scripts/reach.sh, viber/agents/impact-mapper.md, viber/skills/planner/SKILL.md

```
reach.sh "<target>" ["<target>" ...]
  each <target> is one of:
    <repo-relative path>
    <repo-relative path> | <symbol>
    <repo-relative path> | new
  cwd    : any directory inside the repository; the script moves to its root
  writes : .temp/viber/planner/reach-<yyyy-mm-dd-HH-MM-SS>.md
  stdout : candidates: <absolute path of that file, forward slashes>
           hits: <n> lines in <m> files
  exit   : 0; 2 with no target or outside a git repository, one error: line on stderr

candidates file, one section per target in argument order:
## <target as written>
terms: <term>[, <term>...]
skipped: <term>[, <term>...]                                 (only for a term shorter than 3 characters)
<repo-relative path>:<line>: <line text, cut at 200 characters>
truncated: past 200 lines - search this target yourself      (only past the cap)

terms : path -> the path, its file name, the file name without its last extension
                (which covers ./x, ../x and x.ts imports; for an index file also its directory)
        path | symbol -> the symbol, as a whole word
        path | new -> the parent directory path
search: git grep, fixed strings, tracked and untracked files the repository does not
        ignore, binary files, the target's own file and .temp/ left out

impact-mapper dispatch:
plan: <absolute path of the plan file, carried for the token report, never read>
candidates: <path printed by reach.sh>
targets:
<the targets, as today>
```

### C5 - planning token rows

File: viber/scripts/run-tokens.sh

```
tokens: <role> <model> in <n> out <n> cache-read <n> cache-write <n>
  also for each transcript whose agentType ends in :planner-review, :planner-spec-review,
  :planner-graph-review, :planner-task-review, :impact-mapper or :adr-screener and whose
  first line names the run's planned: path (the spellings rounds accepts), with no date cut;
  a transcript counted once even when it also names the run directory; one with no
  readable usage adds no row
  the tokens: unavailable reasons are decided by the build transcripts alone; the planning
  rows print after them either way
```
