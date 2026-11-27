---
name: planner
description: Run only by the spec skill.
allowed-tools: Agent, AskUserQuestion, EnterPlanMode, ExitPlanMode, Bash(${CLAUDE_SKILL_DIR}/scripts/plan.sh:*)
---

# planner

Turn the spec at `$ARGUMENTS` into a checked, reviewed plan. Agents map the code, write the plan and review it; `plan.sh` checks and lands it. Never read the spec, a map, the draft, the plan or a review yourself, and never write plan text.

- `plan.sh` below is `"${CLAUDE_SKILL_DIR}/scripts/plan.sh"`: run each call as that one line, every argument double-quoted, nothing chained.
- Every dispatch is a new `Agent` call, never a `SendMessage` to an earlier agent: each starts on an empty context.
- `<draft>` is the path of the writer's last `DRAFT:` line, `<code-map>` and `<tests-map>` the paths of the mappers' `MAP:` lines: in plan mode an agent writes to a file of its own.

## 1. Map

1. Run `plan.sh paths "<spec>"`. Its `draft:`, `code-map:`, `tests-map:` and `review:` lines are the paths this run hands to its agents.
   - `OPEN: P<n> is not built`: show the user that line and end the turn.
2. Dispatch `viber:plan-mapper` twice in one message: `spec: <spec>`, `lens: code`, `map: <the code-map: path>`, and `spec: <spec>`, `lens: tests`, `map: <the tests-map: path>`. Each returns `MAP: <path>`.
   - `paths` printed an `adr:` line: dispatch `viber:adr` in that same message with `spec: <spec>`, `out: <the adr: path>` and `stamp: <the stamp: value>`. Its return changes no step.
3. Run `plan.sh maps "<code-map>" "<tests-map>"`. On `CONFLICT:` lines ask the Conflict question with those lines, then on `OVER:` lines the Size question with those lines.

## 2. Draft

1. Dispatch `viber:plan-writer` with `spec: <spec>`, `code-map: <path>`, `tests-map: <path>`, `template: ${CLAUDE_SKILL_DIR}/references/plan-template.md` and `draft: <the draft: path, then the last DRAFT: path>`. It returns `DRAFT: <path>`.
2. Run `plan.sh check "<draft>" "<spec>" "<code-map>"` after every writer return, until it prints `PASS`.
   - `OPEN:` lines: put each to the user, then dispatch the writer with the same five lines plus `answers:` and one line per answer.
   - `FIX:` lines: dispatch the writer with the same five lines plus `fix:` and the script's output.
   - Third failed check in a row: show the user the lines and the draft path, and stop.
   - A `LARGE:` line under `PASS`: ask the Size question with that line, once per run.

## 3. Land and review

Plan mode starts here at the latest; its own workflow does not apply: explore nothing, write no plan text.

1. Call `EnterPlanMode` unless plan mode is already on. Its notice names the plan file, `<plan>`.
2. Run `plan.sh land "<draft>" "<spec>" "<code-map>" "<plan>"`. It prints `LANDED: <plan>` and `changed: <value>`.
   - The conversation names a GitHub issue (`#123`, a number or an issue link, never a pull request): add it as a fifth argument, on every landing. With none, `land` gives a later part the issue of the part before.
   - `FIX:` or `OPEN:` lines: handle them as in step 2 of Draft, then land again.
   - The harness refuses the call: ask the Refused question, never write the plan yourself.
3. Dispatch `viber:plan-reviewer` with `plan: <plan>`, `spec: <spec>` and `report: <review>`; from the second review on add `changed: <value>`. It returns `VERDICT: PASS` or `VERDICT: FAIL`, and `REVIEW: <path>`.
   - `PASS`: call `ExitPlanMode`.
   - First `FAIL`: dispatch the writer with its five lines plus `review: <REVIEW path>`, land its draft, then review again.
   - Second `FAIL`, or a landing that prints `changed: none` after a `FAIL`: ask the Failed question. Never call `ExitPlanMode` on a `FAIL`.
4. A hook guards `ExitPlanMode`: on a refusal do the step its reason names. The user rejects the plan and asks for a change: dispatch the writer with its five lines plus `fix:` and the user's words, land its draft, review with `changed:`, then call `ExitPlanMode` again.

## Questions

Each through one `AskUserQuestion` call, every field in the conversation's language.

```
Conflict
header: "Spec"
question: "The code contradicts the spec: <the CONFLICT: lines>. Fix the spec, or plan it as written?"
options:
  - label: "Fix the spec"
    description: "Stop here, correct the spec at <spec>, plan again"
  - label: "Plan it as written"
    description: "Go on, the spec stands over the code"

Size
header: "Plan size"
question: "<the OVER: or LARGE: lines>. Split the spec, or plan it whole?"
options:
  - label: "Split the spec"
    description: "Stop here, cut the spec into smaller ones, plan each"
  - label: "Plan it whole"
    description: "Go on with one plan of this size"

Refused
header: "Plan"
question: "The harness refused to write the plan file: <the refusal>. Retry?"
options:
  - label: "Retry"
    description: "Run the same call again once it is allowed"
  - label: "Stop"
    description: "End here with no plan, the draft stays at <draft>"

Failed
header: "Review"
question: "The plan review still fails: <REVIEW path>. What next?"
options:
  - label: "Fix again"
    description: "One more fix by the writer, then one more review"
  - label: "Stop"
    description: "End here, the plan stays unapproved at <plan>"
```

- Fix the spec, Split the spec, or Stop: invoke nothing, end the turn.
- Fix again: repeat the first-`FAIL` step once.
