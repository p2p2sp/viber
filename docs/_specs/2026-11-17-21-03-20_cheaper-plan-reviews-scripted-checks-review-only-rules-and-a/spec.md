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
