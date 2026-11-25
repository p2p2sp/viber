---
name: planner
description: Only for a viber:intent summary file path or a confirmed intent summary as text, or a viber:fixer diagnosis already in context - never the entry point. Without one, suggest the viber:intent interview and let the user decide. Turns that input into a reviewed implementation plan.
allowed-tools: Read, Write, Edit, Agent, SendMessage, Skill, EnterPlanMode, ExitPlanMode, Bash(${CLAUDE_PLUGIN_ROOT}/scripts/plan-index.sh:*), Bash(${CLAUDE_PLUGIN_ROOT}/scripts/plan-path.sh:*), Bash(${CLAUDE_PLUGIN_ROOT}/scripts/config.sh:*), Bash(${CLAUDE_PLUGIN_ROOT}/scripts/switch-text.sh:*), Bash(${CLAUDE_SKILL_DIR}/scripts/plan-build.sh:*), Bash(${CLAUDE_SKILL_DIR}/scripts/review-round.sh:*), Bash(date:*)
user-invocable: false
---

```!
"${CLAUDE_PLUGIN_ROOT}/scripts/config.sh"
```

# planner

Input: an understood change, as one of three: the path of an intent summary file (`.temp/viber/intent/summary-<stamp>.md`, your only argument), a confirmed `viber:intent` summary as text in context, or a `viber:fixer` diagnosis. Anything else is unresolved input however clear it reads: suggest the `viber:intent` interview in one line and stop here, never entering plan mode. Never cut or widen the scope by judgment: only the threshold check below can propose a split.

On valid input call `EnterPlanMode` first unless plan mode is already active. `Read` a summary file once, for its hand-off lines. The calls below show `--input "<summary file>"` for a summary file input: drop the flag and its value on a text input.

You read no code and compose no plan text, and you relay no content: agents write files, scripts move them, you pass paths, verdict words and the user's answers. Never `Read` the plan or a file an agent wrote unless a step says so. Work the steps through in one go: pause only where a rule asks the user or says stop.

Every bundled-script run below is one literal Bash line, every argument double-quoted: no interpreter word, variable, `cd` or `;`, `&&`, `||` chain. `<plan-path>` is the absolute path of the plan file plan mode names in its system message. The scripts keep their work files under `.temp/viber/planner/`: expected in plan mode.

## Rules

- Dispatch: one `Agent` call per block a script printed, the agent named on its `agent:` field. The prompt is the block's lines below its `NEXT:` line, never that line, then the text of each `add:` field:
  - `add: input`: `input:` then the confirmed summary or fixer diagnosis, verbatim.
  - `add: answered`: one `Answered: <decision> -> <option>` line per user answer so far.
  - `add: lines`: what the fixer is to fix, named by the step.
- A writing agent replies `OUT: <path>` above its verdict: the surveyor `VERDICT: MAPPED`, the architect and the detailer `VERDICT: WRITTEN`, the fixer `VERDICT: FIXED`. Pass that path to the next script as `<OUT path>`. A reviewer's reply goes to `returned` in step 4 instead.
  - A reply with no `VERDICT:` line, or with one of those verdicts and no `OUT:` line, is handled as `VERDICT: DENIED` with `REASON: no verdict returned`.
  - `VERDICT: DENIED`: one `AskUserQuestion` quoting its `REASON:` and `REFUSAL:` lines: the same dispatch again, or stop with no plan.
  - `VERDICT: DECIDE`: ask each `DECIDE: <decision> | <option> | <option> | <option>` line through its own `AskUserQuestion` with those 3 options, the first as your recommendation, one at a time; keep each answer as an `Answered:` line. Then send the architect those lines through `SendMessage` (refused, or no answer: its block dispatched again); the fixer gets its block dispatched again.
- A `plan-build.sh` exit 4 refused the agent's file and wrote nothing: dispatch that agent's block again with the stderr `FIX:` lines appended (the fixer's below a `rejected:` line), then run the same command on the new `OUT:` path. A second exit 4 in a row: one `AskUserQuestion`, retry or stop with no plan.
- A `plan-build.sh` exit 5 outside step 2: show its `error:` line and stop, no hand-off.
- A fix: run `"${CLAUDE_SKILL_DIR}/scripts/plan-build.sh" fix "<plan-path>"` unless a script already printed the `viber:plan-fixer` block, dispatch that block, run `"${CLAUDE_SKILL_DIR}/scripts/plan-build.sh" apply "<plan-path>" "<OUT path>"`, then `plan-index.sh` as in step 2.

## 1. Survey

`Write` the plan file as three lines, `---`, `source: <plan-path>`, `---`, always: it arms the plan gate. Refused: `Read` its first 3 lines, `Write` again. From here on the plan changes only through `plan-build.sh` and the branch step.

Run `"${CLAUDE_SKILL_DIR}/scripts/plan-build.sh" survey "<plan-path>" --input "<summary file>"`, adding `--phase` for an input carrying phases or a `Phases:` line, dispatch its block, then run `"${CLAUDE_SKILL_DIR}/scripts/plan-build.sh" outline "<plan-path>" "<OUT path>"`.

Close the step on the threshold check before anything else: on a `threshold:` line, ask through one `AskUserQuestion`: split the change into phases, or keep one plan of that size. With no `Split proposal:` block in the output the options are keep or stop: you compose no phase.

- Split: invoke `viber:intent` through the `Skill` tool with the summary file path, else the summary text or fixer diagnosis verbatim, followed by the `Split proposal:` block as printed, from that line to the one above `NEXT:`, and write no plan.
- Keep: record the `TASKS:` count as the accepted count and go on.

Then, only on a plan that goes on, ask each `DECIDE:` line `outline` printed as the `VERDICT: DECIDE` rule does.

## 2. Write the plan

Dispatch the architect block `outline` printed. On `VERDICT: WRITTEN` run `"${CLAUDE_SKILL_DIR}/scripts/plan-build.sh" skeleton "<plan-path>" "<OUT path>"` and keep the `mode:` line it prints.

- Exit 5, the script cannot write the plan file: `Read` the `<OUT path>` file, `Write` its lines above `<!-- DECISIONS -->` into the plan file unchanged, and take `mode:` from the architect block.

Then run `"${CLAUDE_PLUGIN_ROOT}/scripts/plan-index.sh" "<plan-path>" --input "<summary file>"`. It must exit 0, each stderr line one defect: make a fix with those lines as its `add: lines`, so that the fixer can fix every `FIX:` line and split every task a `SPLIT:` line names, then re-run.

Once the user kept a plan, add `--accepted "<accepted count>"` to every `plan-index.sh` call. Ask the step 1 question again on every `threshold:` line of that output, a keep recording that line's count as the accepted one. Count no row yourself.

```!
"${CLAUDE_PLUGIN_ROOT}/scripts/switch-text.sh" planning.adr "${CLAUDE_SKILL_DIR}" adr
```

Show the user the full path of the written plan.

```!
"${CLAUDE_PLUGIN_ROOT}/scripts/switch-text.sh" branching.""mode "${CLAUDE_SKILL_DIR}" branching
```

## 3. Tasks

Only on `mode: skeleton`; `mode: whole` goes to step 4.

1. Run `"${CLAUDE_SKILL_DIR}/scripts/review-round.sh" "<plan-path>" start --fresh --skeleton --input "<summary file>"` and work the round as step 4 does until it prints `NEXT: detail`.
2. Run `"${CLAUDE_SKILL_DIR}/scripts/plan-build.sh" slices "<plan-path>"` and dispatch every block in one message.
3. Run `"${CLAUDE_SKILL_DIR}/scripts/plan-build.sh" merge "<plan-path>" "<tasks>=<OUT path>" "<tasks>=<OUT path>"`, one pair per block, `<tasks>` the block's `tasks:` value.
   - Exit 4: dispatch again only the blocks whose range a `FIX:` line names, each with its own lines, then run `merge` with every pair.
   - A `pending:` line: a block has no pair yet, run `merge` with its pair.
   - A `gaps:` line: the fixer block below it is a fix.
4. Run `plan-index.sh` as in step 2.

## 4. Review gate

Run `"${CLAUDE_SKILL_DIR}/scripts/review-round.sh" "<plan-path>" start --input "<summary file>"`, adding `--fresh` on the first run for a `mode: whole` plan and `--answered` after an answer to a finding. Each block it prints opens on a `NEXT: review` line.

Dispatch every block in one message. Every round and retry is a new `Agent` dispatch, never a `SendMessage` to an earlier reviewer: the plan gate pairs a verdict only with a dispatch.

Report the replies with `"${CLAUDE_SKILL_DIR}/scripts/review-round.sh" "<plan-path>" returned <k>=<word> <k>=<word> --out "<k>=<OUT path>"`: `<k>` the block's `member:`, `<word>` the `VERDICT:` word of its reply (`PASS`, `FAIL`, `DENIED`) or `none` without one or for a `FAIL` with no `OUT:` line, one `--out "<k>=<OUT path>"` per reply carrying an `OUT:` line. Show the user the `member:` lines it prints, then act on the directive either call printed:

- `NEXT: redispatch`: dispatch the blocks under it, then report those replies the same way.
- `NEXT: fix`: the fixer block below it is a fix, then `start` again; with no block below it there is nothing to fix, only `start` runs. After a `VERDICT: DECIDE` reply to it, a finding needing a decision only the user can make, run `start --answered` instead.
- `NEXT: detail`: step 3 goes on from its item 2.
- `NEXT: exit-plan`: go to step 5; its `MINOR:` lines stay unapplied.
- `ASK:`: one `AskUserQuestion` quoting the `REASON:` and `REFUSAL:` lines of the `DENIED` reply: retry runs `"${CLAUDE_SKILL_DIR}/scripts/review-round.sh" "<plan-path>" retry-denied`, stop runs the same line ending in `stop`; act on what they print.
- `STOP:`: the plan stays unreviewed, no hand-off.

```!
"${CLAUDE_PLUGIN_ROOT}/scripts/switch-text.sh" branching.""mode "${CLAUDE_SKILL_DIR}" branching-fix
```

## 5. Hand off

Call `ExitPlanMode` only on a `NEXT: exit-plan`, after showing the user its `MINOR:` lines as one list. Every later change voids it (the user's remark, an answer): make a fix whose `add: lines` is `change:` then what to change, then step 4 from plain `start` (it sends only the members whose part changed) before the next `ExitPlanMode`.

Then name `viber:implementor` as the next step, the path shown in step 2 being the whole handover. Nothing runs here.

A plan that changes a UI or an endpoint and carries no end-to-end task adds one line to its hand-off:

```!
"${CLAUDE_PLUGIN_ROOT}/scripts/switch-text.sh" build.qa "${CLAUDE_SKILL_DIR}" qa-e2e
```
