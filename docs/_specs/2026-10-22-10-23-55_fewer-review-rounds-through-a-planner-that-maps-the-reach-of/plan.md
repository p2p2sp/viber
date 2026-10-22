---
source: C:/Projects/viber/docs/_specs/2026-10-22-10-23-55_fewer-review-rounds-through-a-planner-that-maps-the-reach-of/plan.md
---

To build this plan you must invoke skill `viber:implementor` with `source:` path as its only argument.

# Fewer review rounds through a planner that maps the reach of its change

## Goal

The planner writes a first plan that reviewers fail less often, so a plan reaches its PASS in fewer review rounds. It gets the reach of the change from a dedicated agent before it writes a task, holds itself to the input, fixes a finding's whole class, and a script catches one class of slip that today costs a reviewer round.

## Problem

Across 27 planning sessions, about 35% of the Blocking review findings were an unanalysed reach of the change (a caller, test, mock or document outside every task's `Files`) and about 20% a plan departing from its input. Each such finding costs a review round of 5 minutes or more, and a plan needed up to 9 rounds. A `Depends-on` edge that orders nothing fails a round although it breaks no build, and a contract block named in a done clause but missing from `Uses` is caught only by a reviewer.

## Current behaviour

The planner reads the codebase for its file map on its own, with no fixed procedure, inside the main session. Nothing stops it from adding a behaviour, rule or narrowing the input never stated. On a `VERDICT: FAIL` it fixes each cited finding. `plan-rules.md`'s `Ordered` rule and the `Wired` check of `planner-review` and `planner-graph-review` make an edge that constrains nothing a Blocking finding. `plan-index.sh` checks that each `Uses` entry exists, never that a block a task names in its `DoD` or `Delivers` is in its `Uses`.

### Must not change

- `plan-index.sh` keeps every existing refusal, its exit codes and its stdout; a landed run plan (`--split`, or a plain call with `status.md` beside it) validates exactly as today.
- The plan gate (`hooks/scripts/plan-gate.sh`) decides an `ExitPlanMode` exactly as today.
- The tools paragraph, `## Calibration` and `## Output` of the four planner reviewers stay verbatim across them.

## Behaviour

### S1 - The planner maps the reach of its change before writing tasks [CHANGED - was: the planner explored on its own, with no fixed procedure]

Before writing a task, the planner hands the reach mapper every existing file and symbol the change modifies, moves or deletes, and gets back every place that refers to them.

Given a change that alters the signature of a function three files call and a test mocks
When the planner reaches the end of its file map
Then the reach mapper returns the three callers and the mocking test, and each of them sits in a task's `Files` or under `### Out of scope` with the behaviour it keeps

### S2 - A change touching no existing code skips the reach mapper [NEW]

Given a change that only adds new files and alters no existing file or symbol
When the planner reaches the end of its file map
Then no reach mapper is dispatched and the planner goes on to the threshold check

### S3 - A gap in the input becomes a question, not a rule [CHANGED - was: the planner filled a gap with a rule of its own]

Given an input that does not say whether an author may decide on their own request
When the planner meets that gap
Then it asks the user, or names the case under `### Out of scope`, and the plan states no rule about it

### S4 - A failed review is fixed by class [CHANGED - was: each cited finding was fixed alone]

Given a review finding that one task's `Files` misses a caller of a changed type
When the planner fixes it
Then it checks every task touching that type for the same miss and checks the fix against the input requirement it serves

### S5 - The script refuses a contract named outside `Uses` [NEW]

Given a task whose `DoD` names block C2 outside a backtick span while its `Uses` names only C1
When the planner runs `plan-index.sh`
Then the script exits 4 naming the task, the field and C2

### S6 - An edge that orders nothing is a Minor finding [CHANGED - was: Blocking]

Given a plan whose T3 depends on T2 while taking nothing from it
When a reviewer gates the plan
Then the edge is reported as Minor and does not fail the review on its own

### Edge cases

- The reach mapper's tool call is refused -> the planner asks once whether to add the permission and retry, or go on without the map.
- The reach mapper returns no `VERDICT:` line twice -> handled as a refusal with the reason "no verdict returned".
- A target referenced from many files -> one returned line per referring file, never one per occurrence.
- A target's own file -> never returned as a reference to itself.
- A draft round -> the reach mapper runs as on any other round.
- A contract id inside a backtick span, or one no block of the appendix carries -> the script check ignores it.

## Glossary

- Reach mapper - the agent that finds every place referring to the files and symbols a change modifies, moves or deletes; it judges nothing about the plan.
- Target - one existing file, or one symbol in it, that the change modifies, moves or deletes, handed to the reach mapper.
- Reference - one file that refers to a target, with the lines where it does and what kind of reference it is.

## Acceptance criteria

1. `plan-index.sh` exits 4 when a task's `DoD` or `Delivers` names an appendix block, as a whole token outside backtick spans, that its `Uses` does not name; the error names the task, the field and the block. A block named in `Uses`, inside backticks or absent from the appendix passes, and a landed run plan is exempt.
2. `plan-rules.md` carries that check as a `(script)` rule, and its `Ordered` rule, with the `Wired` check of `planner-review` and `planner-graph-review`, makes a `Depends-on` edge whose dependent takes nothing from its target a Minor finding.
3. A read-only `viber:impact-mapper` agent, registered in `plugin.json`, takes a list of targets and returns every reference per contract C1.
4. The planner dispatches the reach mapper on every round after its file map and before the threshold check, skips it when the change modifies, moves or deletes no existing file or symbol, puts every returned reference into a task's `Files` or under `### Out of scope` with the behaviour it keeps, and handles a refusal or a missing verdict with one question.
5. The planner adds no behaviour, rule or narrowing that neither the input nor an `Answered:` line states; such a gap is asked or goes under `### Out of scope`.
6. On a `VERDICT: FAIL` the planner fixes each Blocking finding's whole class across the plan and checks each fix against the input requirement it serves.
7. The help page, `viber/README.md` and `docs/viber-functions.html` describe the reach mapper and these planner rules.

## Scope

### File map

- modify - viber/scripts/plan-index.sh - validates that a contract named in `DoD` or `Delivers` is in `Uses`
- modify - tests/viber/plan-index.test.ts - the cases of that check
- modify - viber/references/plan-rules.md - the `(script)` rule for that check and the Minor `Ordered` edge
- modify - viber/agents/planner-review.md - its `Wired` check reports a no-op edge as Minor
- modify - viber/agents/planner-graph-review.md - the same `Wired` change
- add - viber/agents/impact-mapper.md - the reach mapper
- modify - viber/.claude-plugin/plugin.json - registers the reach mapper
- modify - viber/skills/planner/SKILL.md - dispatches the reach mapper, the faithfulness rule, the fix by class
- modify - viber/skills/setup/assets/help.html - the agent line and the planner card, `en` and `pl`
- modify - viber/README.md - the planner paragraph
- modify - docs/viber-functions.html - the planner function list

### Out of scope

- Every `CLAUDE.md` node (`viber/CLAUDE.md`, `viber/agents/CLAUDE.md`, `viber/skills/CLAUDE.md`, `viber/references/CLAUDE.md`, `viber/scripts/CLAUDE.md`): `build.memory` is on, so the build's close updates them; until then their agent lists and the `plan-rules.md` readers stay without the reach mapper.
- `viber/agents/planner-spec-review.md` and `planner-task-review.md`: they carry no `Wired` check and their `## Calibration` stays verbatim with the other two.
- `viber/hooks/scripts/plan-gate.sh` and `hooks.json`: the reach mapper is no reviewer, so the gate counts it nowhere.
- The review set structure, reviewer `effort`, the handling of Minor findings, narrower rounds 2+ and the reviewers' exploration scope.
- `viber/skills/setup/assets/viber-flow-en.svg` and `viber-flow-pl.svg`: the flow diagram keeps its planner box as it is.
- Re-dispatching the reach mapper during review rounds: a fix after a `VERDICT: FAIL` is checked by the next review round.

## Solution requirements

- Every plugin script works on Windows Git Bash and macOS; the new awk code holds no apostrophe and passes `bash -n`.
- Instructions stay short and purposeful: every token of the planner, the reach mapper and `plan-rules.md` is paid on every round.
- The real effect is measured after release by comparing the Blocking count of the first review round of new plans with the extraction in `.temp/review-audit/b2.tsv`; no task delivers that measurement.

## Tasks

<!-- TASK -->
### T1 - Refuse a contract named in a done clause but missing from Uses
- TDD: required
- Covers: AC1
- Uses: C2
- Depends-on: none
- Files: viber/scripts/plan-index.sh, tests/viber/plan-index.test.ts
- Delivers: a validation in `plan-index.sh` that refuses, with exit 4 and the C2 error line, a task whose `DoD` or `Delivers` line names a contract block of the appendix as a whole token outside backtick spans while its `Uses` does not name it; skipped like the other checks added after plans were frozen (under `--split`, `--extra` and on a plain call with `status.md` beside the plan); the header lists the case among the exit 4 refusals and among the exempted ones
- Verification: node --test --test-name-pattern "missing from its Uses" tests/viber/plan-index.test.ts && bash -n viber/scripts/plan-index.sh -> every selected test passes, at least five run, and the syntax check prints nothing
- DoD: a task whose DoD names C2 outside backticks while its Uses names only C1 exits 4 with the C2 error line for the DoD field; a task whose Delivers names C2 that way exits 4 with the C2 error line for the Delivers field; the same task with C2 added to its Uses exits 0; C2 named only inside a backtick span exits 0, and a token such as C9 with no block in the appendix exits 0; the plan with the gap still validates and decomposes under --split with exit 0
<!-- /TASK -->

<!-- TASK -->
### T2 - Make an edge that orders nothing a Minor finding and record the Uses rule
- TDD: none
- Covers: AC2
- Uses: C2
- Depends-on: T1
- Files: viber/references/plan-rules.md, viber/agents/planner-review.md, viber/agents/planner-graph-review.md
- Delivers: `plan-rules.md`'s `Ordered` rule calls a dependency that constrains nothing a Minor finding, which burns parallelism but breaks no build; a new `Supplied` bullet tagged `(script)` under `## Task`, beside the existing `(review)` one, states the C2 check; the `Wired` check of both agents ends on reporting an edge whose dependent consumes nothing from its target as Minor, every other line of both agents unchanged
- Verification: grep -n -e "is a Minor finding" -e "missing from its Uses" viber/references/plan-rules.md viber/scripts/plan-index.sh && grep -c "consumes nothing from its target as Minor" viber/agents/planner-review.md viber/agents/planner-graph-review.md && node --test tests/viber/root-cause-prose.unit.test.ts -> plan-rules.md prints both phrases, plan-index.sh prints the error phrase, each agent counts 1, every test passes
- DoD: plan-rules.md's Ordered rule names a dependency that constrains nothing a Minor finding; plan-rules.md carries a Supplied bullet tagged (script) naming the check of C2 under `## Task`; the Wired check of planner-review.md and planner-graph-review.md reports an edge whose dependent consumes nothing from its target as Minor; the tools paragraph, `## Calibration` and `## Output` of both agents are byte-identical to before
<!-- /TASK -->

<!-- TASK -->
### T3 - Add the reach mapper agent
- TDD: none
- Covers: AC3
- Uses: C1
- Depends-on: none
- Files: viber/agents/impact-mapper.md, viber/.claude-plugin/plugin.json, viber/skills/setup/assets/help.html
- Delivers: the `impact-mapper` agent: frontmatter `name: impact-mapper`, a description ending "Invoked only by the planner skill, never directly.", `tools: Read, Grep, Glob`, `model: sonnet`, `effort: high`, `color: cyan`; a body opening on its role and "Input is fully resolved - never ask the user.", read-only, the verbatim tools paragraph of the non-auditor agents, an `## Input` naming the C1 `targets:` block, the search it runs for each target (every import spelling, relative ones included, calls, tests, mocks by path, fixtures and snapshots, string references such as selectors and configuration keys, documents and `.claude/rules/` files naming the path or symbol), and an `## Output` returning the C1 lines and nothing else; registered in `plugin.json` `agents[]` after `adr-screener`; one `agent-impact-mapper` line in the help page's Planning agent list, `en` and `pl`
- Verification: node --test tests/viber/help.unit.test.ts && grep -c "impact-mapper" viber/.claude-plugin/plugin.json && grep -n -e "^tools: Read, Grep, Glob" -e "^targets:" -e "REF: " -e "VERDICT: NONE" -e "VERDICT: DENIED" -e "per referring file" -e "own file" viber/agents/impact-mapper.md -> every test passes, the count is 1, every pattern prints from the agent
- DoD: plugin.json agents[] lists ./agents/impact-mapper.md; impact-mapper.md carries the frontmatter fields in the order name, description, tools, model, effort, color with tools Read, Grep, Glob; its `## Input` names the `targets:` block of C1 and its `## Output` the FOUND, NONE and DENIED replies of C1; its `## Output` states one REF line per referring file and target and excludes a target's own file; the help page carries a line with id agent-impact-mapper in its Planning agent list with an `en` and a `pl` span
<!-- /TASK -->

<!-- TASK -->
### T4 - Map the reach before tasks, stay faithful to the input and fix by class
- TDD: none
- Covers: AC4, AC5, AC6
- Uses: C1
- Depends-on: T3
- Files: viber/skills/planner/SKILL.md
- Delivers: in step 1, after the file map bullets and before the threshold check, on every round a draft round included: unless the change modifies, moves or deletes no existing file or symbol, dispatch `viber:impact-mapper` with the C1 `targets:` block (a symbol only where its name, signature, type or observable behaviour changes for its callers); every returned reference lands in a task's `Files`, through the file map, or under `### Out of scope` naming the behaviour it keeps; `VERDICT: DENIED` gets one `AskUserQuestion`: permission added and retry, or go on without the map; a reply with no `VERDICT:` line is handled as `VERDICT: DENIED` with `REASON: no verdict returned`. After the paragraph on decisions owed to the user: add no behaviour, rule or narrowing that neither the input nor an `Answered:` line states, such a gap being asked as above or named under `### Out of scope`. In step 3's `VERDICT: FAIL` bullet: fix each Blocking finding's whole class across the plan, not only the cited place, and check each fix against the input requirement it serves
- Verification: grep -n -e "viber:impact-mapper" -e "targets:" -e "nor an .Answered:. line states" -e "whole class" viber/skills/planner/SKILL.md && grep -n "^name: impact-mapper" viber/agents/impact-mapper.md && node --test tests/viber/nudge-prose.unit.test.ts -> every pattern prints from the skill, the name line prints from the agent, every test passes
- DoD: step 1 dispatches viber:impact-mapper after the file map bullets and before the threshold check, on every round, with the C1 targets block; step 1 skips the dispatch when the change modifies, moves or deletes no existing file or symbol; step 1 puts every returned reference into a task's Files or under `### Out of scope` naming the behaviour it keeps; step 1 handles DENIED and a missing verdict with one AskUserQuestion offering a retry after a permission or going on without the map; step 1 forbids a behaviour, rule or narrowing neither the input nor an Answered line states; step 3's FAIL bullet fixes each Blocking finding's whole class and checks the fix against the input requirement
<!-- /TASK -->

<!-- TASK -->
### T5 - Describe the reach mapper and the planner rules to the user
- TDD: none
- Covers: AC7
- Uses: none
- Depends-on: T4
- Files: viber/skills/setup/assets/help.html, viber/README.md, docs/viber-functions.html
- Delivers: the help page's planner card (`id="skill-planner"`) says, in `en` and `pl`, that before writing tasks the planner has `impact-mapper` find every reference to what the change modifies, moves or deletes, and that it adds nothing the interview left unsettled; the README's planner paragraph says the same in one sentence; the planner list of `docs/viber-functions.html` gains one line for each
- Verification: grep -c "impact-mapper" viber/skills/setup/assets/help.html viber/README.md docs/viber-functions.html && grep -n "viber:impact-mapper" viber/skills/planner/SKILL.md && node --test tests/viber/help.unit.test.ts -> the help page counts at least 3, README and the functions page at least 1 each, the skill line prints, every test passes
- DoD: the planner card of help.html names impact-mapper in its `en` and its `pl` paragraph; README.md's planner paragraph names the reach mapping and the rule against unsettled additions; docs/viber-functions.html lists the reach mapping and the faithfulness rule among the planner functions
<!-- /TASK -->

## Contracts

### C1 - Reach mapper dispatch and reply

File: viber/agents/impact-mapper.md

Dispatch, the block running to the end of the prompt:

```
targets:
<repo-relative path>
<repo-relative path> | <symbol>
```

A bare path is a whole file the change modifies, moves or deletes; a path with a symbol is one symbol of it.

Reply, one of:

```
VERDICT: FOUND
REF: <repo-relative path>:<line>[,<line>...] | <kind> | <target as written>
```

`<kind>` is one of `call`, `test`, `mock`, `fixture`, `documentation`, `rule`; one `REF:` line per referring file and target.

```
VERDICT: NONE
```

```
VERDICT: DENIED
REASON: <refused tool name>: <the exact refused command, or the path for a file tool>
```

### C2 - Uses check error line

File: viber/scripts/plan-index.sh

On stderr, exit 4, one line per missing block:

```
error: task <id>: <DoD|Delivers> names <block id>, missing from its Uses - add it to Uses
```
