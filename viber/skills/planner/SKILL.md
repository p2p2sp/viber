---
name: planner
description: Only for a viber:intent summary file path or a confirmed intent summary as text, or a viber:fixer diagnosis already in context - never the entry point. Without one, suggest the viber:intent interview and let the user decide. Turns that input into a reviewed implementation plan.
allowed-tools: Read, Write, Edit, Agent, SendMessage, Skill, EnterPlanMode, ExitPlanMode, Bash(${CLAUDE_PLUGIN_ROOT}/scripts/plan-path.sh:*), Bash(${CLAUDE_PLUGIN_ROOT}/scripts/config.sh:*), Bash(${CLAUDE_PLUGIN_ROOT}/scripts/switch-text.sh:*), Bash(${CLAUDE_SKILL_DIR}/scripts/plan-build.sh:*), Bash(date:*)
user-invocable: false
---

```!
"${CLAUDE_PLUGIN_ROOT}/scripts/config.sh"
```

# planner

Input: an understood change, as one of three: the path of an intent summary file (`.temp/viber/intent/summary-<stamp>.md`, your only argument), a confirmed `viber:intent` summary as text in context, or a `viber:fixer` diagnosis. Anything else is unresolved input however clear it reads: suggest the `viber:intent` interview in one line and stop here, never entering plan mode. Never cut or widen the scope by judgment: only the threshold check below can propose a split.

On valid input call `EnterPlanMode` first unless plan mode is already active. `Read` a summary file once, for its hand-off lines. The calls below show `--input "<summary file>"` for a summary file input: drop the flag and its value on a text input.

You read no code and compose no plan text, and you relay no content: agents write files, scripts move them, you pass paths, verdict words and the user's answers. Never `Read` the plan or a file an agent wrote unless a step says so. Work the steps through in one go: pause only where a rule asks the user or says stop.

Every bundled-script run below is one literal Bash line, every argument double-quoted: no interpreter word, variable, `cd` or `;`, `&&`, `||` chain. `<plan-path>` is the absolute path of the plan file plan mode names in its system message.

The plan-mode notice (its read-only limit, its own workflow) replaces no step here: `plan-build.sh` writes only the plan file and work files under `.temp/viber/planner/`, expected in plan mode. A script call the harness refuses: one `AskUserQuestion` quoting the refusal, retry or stop with no plan, never a plan you write yourself.

## Rules

- Dispatch: one `Agent` call per block a script printed, the agent named on its `agent:` field. The prompt is the block's lines below its `NEXT:` line, never that line, then the text of each `add:` field:
  - `add: input`: `input:` then the confirmed summary or fixer diagnosis, verbatim.
  - `add: answered`: one `Answered: <decision> -> <option>` line per user answer so far.
  - `add: lines`: what the owner is to fix, named by the step.
- A writing agent replies `OUT: <path>` above its verdict: the surveyor `VERDICT: MAPPED`, the architect and an author `VERDICT: WRITTEN`, either on a fix block `VERDICT: FIXED`. Pass that path to the next script as `<OUT path>`. The judge's reply goes to `judged` in step 4 instead.
  - A reply with no `VERDICT:` line, or with one of those verdicts and no `OUT:` line, is handled as `VERDICT: DENIED` with `REASON: no verdict returned`.
  - `VERDICT: DENIED`: one `AskUserQuestion` quoting its `REASON:` and `REFUSAL:` lines: the same dispatch again, or stop with no plan. Step 4 names the replies that ask nothing.
  - `VERDICT: DECIDE`: ask each `DECIDE: <decision> | <option> | <option> | <option>` line through its own `AskUserQuestion` with those 3 options, the first as your recommendation, one at a time; keep each answer as an `Answered:` line. Then send that agent those lines through `SendMessage` (refused, or no answer: its block dispatched again).
- A fix step is a `NEXT: fix` line or a `gaps:` line with fix blocks below it: dispatch every block in one message, run `"${CLAUDE_SKILL_DIR}/scripts/plan-build.sh" apply "<plan-path>" "<owner>=<OUT path>"`, one pair per block in the one call, `<owner>` the block's `owner:` field, then act on the directive it prints.
- A fix of your own (a step names its `add: lines`): run `"${CLAUDE_SKILL_DIR}/scripts/plan-build.sh" fix "<plan-path>"` and take the block it prints as a fix step.
- `NEXT: judge` says the plan is written and holds no defect: go on with the step you are in. Step 4 alone runs `judge`.
- A `plan-build.sh` exit 4 refused a file and wrote nothing: dispatch again the block of each agent a `FIX:` line names (`FIX: slice <k>:` that author, `FIX: owner <o>:` that fix block, any other line the one block of the command), its own `FIX:` lines appended, a fix block's below a `rejected:` line. Then run the same command with every pair, the new `OUT:` paths in place. A second exit 4 in a row: one `AskUserQuestion`, retry or stop with no plan; step 4 names the fixes that run `open` instead.
- A `plan-build.sh` exit 2: make the call its `error:` line names, once. Otherwise, and on an exit 5: show the `error:` line and stop, no hand-off.

## 1. Survey

`Write` the plan file as three lines, `---`, `source: <plan-path>`, `---`, always: it arms the plan gate. Refused: `Read` its first 3 lines, `Write` again. From here on the plan changes only through `plan-build.sh` and the branch step.

Run `"${CLAUDE_SKILL_DIR}/scripts/plan-build.sh" survey "<plan-path>" --input "<summary file>"`, adding `--phase` for an input carrying phases or a `Phases:` line, dispatch its block, then run `"${CLAUDE_SKILL_DIR}/scripts/plan-build.sh" outline "<plan-path>" "<OUT path>"`.

Close the step on the threshold check before anything else: on a `threshold:` line, ask through one `AskUserQuestion`: split the change into phases, or keep one plan of that size. With no `Split proposal:` block in the output the options are keep or stop: you compose no phase.

- Split: invoke `viber:intent` through the `Skill` tool with the summary file path, else the summary text or fixer diagnosis verbatim, followed by the `Split proposal:` block as printed, from that line to the one above `NEXT:`, and write no plan.
- Keep: run `"${CLAUDE_SKILL_DIR}/scripts/plan-build.sh" keep "<plan-path>" "<count>"`, `<count>` the number on the `TASKS:` line, and go on.

Then, only on a plan that goes on, ask each `DECIDE:` line `outline` printed as the `VERDICT: DECIDE` rule asks one, with no agent to send the answers to.

## 2. Write the plan

Dispatch the block `outline` printed: the architect's for a change cut into slices, else the block of its one author.

- The architect's `VERDICT: WRITTEN`: run `"${CLAUDE_SKILL_DIR}/scripts/plan-build.sh" frame "<plan-path>" "<OUT path>"`, then dispatch every author block it prints in one message.

## 3. Assemble

Run `"${CLAUDE_SKILL_DIR}/scripts/plan-build.sh" assemble "<plan-path>" "<slice>=<OUT path>"`, one pair per author block in the one call, `<slice>` the block's `slice:` field. Count no row and order no task yourself.

- A `threshold:` line: ask the step 1 question again, a keep running `keep` with that line's count.
- A `gaps:` line or `NEXT: fix | defects`: a fix step.

```!
"${CLAUDE_PLUGIN_ROOT}/scripts/switch-text.sh" planning.adr "${CLAUDE_SKILL_DIR}" adr
```

Show the user the full path of the written plan.

```!
"${CLAUDE_PLUGIN_ROOT}/scripts/switch-text.sh" branching.""mode "${CLAUDE_SKILL_DIR}" branching
```

## 4. Review gate

At most two review rounds, counted by the script. Run `"${CLAUDE_SKILL_DIR}/scripts/plan-build.sh" judge "<plan-path>"` and dispatch the judge block it prints. Every dispatch of the judge is a new `Agent` call, never a `SendMessage` to an earlier judge: the plan gate pairs a verdict only with a dispatch.

Report the reply with `"${CLAUDE_SKILL_DIR}/scripts/plan-build.sh" judged "<plan-path>" "<word>" --out "<OUT path>"`: `<word>` is the `VERDICT:` word of the reply (`PASS`, `FAIL`, `DENIED`), or `none` without one or for a `FAIL` with no `OUT:` line; a reply with no `OUT:` line drops `--out` and its value. A `DENIED` reply to a block carrying `round: 1` follows the `VERDICT: DENIED` rule instead and is never reported. Show the user the `judge:` line, then act on the directive either call printed:

- `NEXT: judged | none`: report that reply again as `none`, with no `--out`.
- `NEXT: redispatch`: dispatch the block under it, then report that reply the same way.
- `NEXT: fix | round: <r>`: a fix step, and so is each fix step its `apply` prints before the round ends.
  - Round 1: a second exit 4 in a row of that `apply` runs `"${CLAUDE_SKILL_DIR}/scripts/plan-build.sh" open "<plan-path>"` in place of the question; act on what it prints.
  - Round 2, and every fix step after a `NEXT: exit-plan`: ask the user nothing. A refused fix file (the first exit 4), a `VERDICT: DENIED` or a `DECIDE:` reply runs `open`.
- `NEXT: judge`: run `judge` again, for the second and last round.
- `NEXT: exit-plan`: go to step 5 with the `OPEN:` lines under it.
- `STOP:`: stop, no hand-off.

```!
"${CLAUDE_PLUGIN_ROOT}/scripts/switch-text.sh" branching.""mode "${CLAUDE_SKILL_DIR}" branching-fix
```

## 5. Hand off

Call `ExitPlanMode` only on a `NEXT: exit-plan`, after showing the user its `OPEN:` lines as one list, the `critical` ones named as open critical problems. A change the user asks for after a refused `ExitPlanMode` is a fix of your own whose `add: lines` is `change:` then what to change; after it call `ExitPlanMode` again, with no review round and no question.

Then name `viber:implementor` as the next step, the path shown in step 3 being the whole handover. Nothing runs here.

A plan that changes a UI or an endpoint and carries no end-to-end task adds one line to its hand-off:

```!
"${CLAUDE_PLUGIN_ROOT}/scripts/switch-text.sh" build.qa "${CLAUDE_SKILL_DIR}" qa-e2e
```
