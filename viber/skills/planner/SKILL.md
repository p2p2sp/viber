---
name: planner
description: Only for a viber:intent summary file path or a confirmed intent summary as text, or a viber:fixer diagnosis already in context - never the entry point. Without one, suggest the viber:intent interview and let the user decide. Turns that input into a reviewed implementation plan.
allowed-tools: Read, Write, Edit, Grep, Glob, Agent, Skill, EnterPlanMode, ExitPlanMode, Bash(${CLAUDE_PLUGIN_ROOT}/scripts/plan-index.sh:*), Bash(${CLAUDE_PLUGIN_ROOT}/scripts/plan-path.sh:*), Bash(${CLAUDE_PLUGIN_ROOT}/scripts/config.sh:*), Bash(${CLAUDE_PLUGIN_ROOT}/scripts/switch-text.sh:*), Bash(${CLAUDE_SKILL_DIR}/scripts/reach.sh:*), Bash(${CLAUDE_SKILL_DIR}/scripts/review-round.sh:*), Bash(date:*)
user-invocable: false
effort: high
---

```!
"${CLAUDE_PLUGIN_ROOT}/scripts/config.sh"
```

# planner

Input: an understood change, as one of three: the path of an intent summary file (`.temp/viber/intent/summary-<stamp>.md`, your only argument), a confirmed `viber:intent` summary as text in context, or a `viber:fixer` diagnosis. Anything else is unresolved input however clear it reads: suggest the `viber:intent` interview in one line and stop here, never entering plan mode. Never cut or widen the scope by judgment: only the threshold check below can propose a split.

A summary file path is read first: its content is the input everywhere below. On valid input call `EnterPlanMode` first unless plan mode is already active.

The spec shape is yours to pick. A `viber:fixer` diagnosis is `spec-lite`. An intent summary is `spec-full` when it holds any of: a new application or subsystem, an accepted roadmap, behaviour with more than one path or named edge cases, new domain concepts; else `spec-lite`.

Every bundled-script run below is one literal Bash line, every argument double-quoted: no interpreter word, variable, `cd` or `;`, `&&`, `||` chain.

## 1. Map the files first

Read `${CLAUDE_PLUGIN_ROOT}/references/plan-rules.md` and `${CLAUDE_PLUGIN_ROOT}/references/plan-rules-script.md` first and hold the plan to every rule in both. Before a task is written, read `## Layers`, `## Proves` and `## Ports` of `${CLAUDE_PLUGIN_ROOT}/references/test-strategy.md` by range: `Grep` the file for its `## ` lines, then `Read` each of the three sections. A plan carrying an integration test or creating or changing an adapter also reads `${CLAUDE_PLUGIN_ROOT}/references/integration-tests.md`.

Plan an end-to-end test only when the input records the user explicitly asking for it, then per `plan-rules.md`'s End-to-end rule; one suggested, implied by a UI change or thought useful stays out of every criterion, task and `Verification`. The one exception: an existing end-to-end spec whose selector a task changes is no new test: it joins that task's `Files` per the same rule.

Never propose, write or show a mockup or prototype.

Before writing a task, decide which files are created, modified or deleted and what each owns, so tasks can run in parallel.

- One responsibility per file; files that change together live together (`Lean` decides what a new file may be).
- Read the codebase for everything `plan-rules.md`'s Reach and Owned rules force into the file map.
- A file you have to touch that has grown unwieldy may be split, as a task.

Then map the reach of the change:

- Skip it only when the change adds, modifies, moves or deletes no file or symbol.
- Otherwise list the targets: one repo-relative path for a whole file the change modifies, moves or deletes, `<path> | <symbol>` for one symbol of it, a symbol only where its name, signature, type or observable behaviour changes for its callers, or `<path> | new` for each file the change adds.
- Run `"${CLAUDE_SKILL_DIR}/scripts/reach.sh" --plan "<absolute path of the plan file>" "<target>" "<target>"` as one literal line, one double-quoted argument per target as listed. Its one write under `.temp/viber/planner/` is expected in plan mode.
- Then dispatch `viber:impact-mapper` with the lines below the `NEXT: dispatch` line as printed.
- Every `REF:` line it returns lands in a task's `Files`, through the file map, or under `### Out of scope` naming the behaviour that reference keeps.
- `VERDICT: NONE` adds nothing.
- `VERDICT: DENIED` or no `VERDICT:` line: one `AskUserQuestion` naming the refused call from its `REASON:` line (`no verdict returned` without one): permission added and retry, or go on without the map.

Close the step on the threshold check before any task is written: estimate the task count from the file map; at more than 30, ask through one `AskUserQuestion`: split the change into parts, or keep one plan of that many tasks.

- Split: invoke `viber:intent` through the `Skill` tool with the summary file path, else the summary text or fixer diagnosis verbatim, followed by a `Split proposal:` block in this shape, and write no plan. Its parts come from your file map (a `viber:fixer` input puts the fix in part 1); `Open decisions:` lists each decision owed to the user that you found and did not ask, and is left out when there are none.

  ```
  Split proposal:
  <n>. <part> - owns: <what it delivers>; consumes: <what earlier parts produce, or nothing>; files: <repo-relative paths>; tasks: <estimated count>
  Open decisions:
  - <decision owed to the user, one per line>
  ```

- Keep: record the estimate as the accepted count and go on.

After the threshold question, and only on a plan that goes on, ask each decision owed to the user that you found: a behaviour, scope or product choice the input leaves open. An implementation choice (a file, a name, a library, a structure, an algorithm) is never asked: it stays with you. Each decision gets its own `AskUserQuestion` with 3 options, your recommendation first, one at a time. Plan on every answer, keeping each as an `Answered:` line.

Add no behaviour, rule or narrowing that neither the input nor an `Answered:` line states: such a gap is asked as above, or named under `### Out of scope`.

## 2. Write the plan

The specification half is `${CLAUDE_SKILL_DIR}/templates/spec-lite.md` or `${CLAUDE_SKILL_DIR}/templates/spec-full.md`, whichever shape you picked; the task half is `${CLAUDE_SKILL_DIR}/templates/tasks.md` under either. Fill the spec, append the task half under it, and write the result into the plan file plan mode names in its system message, the only file you may write while planning besides the candidates file `reach.sh` wrote and the state file `review-round.sh` writes, both under `.temp/viber/planner/` (expected in plan mode). Keep every section and HTML marker of both templates unless a template comment says to drop it; add no section.

Fill the frontmatter per its placeholders: `source:` is the only way back to the file once approval clears this context; `issue:` comes only from the input's `Issue:` line, `attachments:` only from its `Attachment:` lines. Each `Attachment:` line is one entry: the file's or directory's own name (changed only to avoid a repeat), then its path. A task needing one of those files names `attachments/<name>` in its `DoD`, `attachments/<name>/` for a directory; a task needing none names none.

An input carrying a roadmap, or a `Roadmap: <path>` line (read that `roadmap.md`), fills `## Roadmap` per its template comment and repeats every later entry under `### Out of scope`; no roadmap means no such section. What a later entry brings stays absent: no stand-in, stub or mock of it, no criterion depending on it. A part is never a release: no criterion needs a working application between parts.

Then run `"${CLAUDE_PLUGIN_ROOT}/scripts/plan-index.sh" "<plan-path>"`, adding `--input "<summary file>"` on a summary file input. It must exit 0, each stderr line one defect: fix every `FIX:` line, split every task a `SPLIT:` line names, then re-run.

`plan-index.sh` prints a `threshold:` line only past 30 tasks. Once the user kept a plan, add `--accepted "<accepted count>"` to every `plan-index.sh` call. Ask the step 1 question again on every `threshold:` line of that output, a keep recording that line's count as the accepted one. Count no row yourself.

```!
"${CLAUDE_PLUGIN_ROOT}/scripts/switch-text.sh" planning.adr "${CLAUDE_SKILL_DIR}" adr
```

Show the user the full path of the written plan.

```!
"${CLAUDE_PLUGIN_ROOT}/scripts/switch-text.sh" branching.""mode "${CLAUDE_SKILL_DIR}" branching
```

## 3. Review gate

Run `"${CLAUDE_SKILL_DIR}/scripts/review-round.sh" "<plan-path>" start`, adding `--input "<summary file>"` on a summary file input, and `--fresh` after a user's answer and after any plan write following `NEXT: exit-plan`. Each block it prints opens on a `NEXT: review` line.

Dispatch every block in one message, one `Agent` call per block, the agent named on its `agent:` field. The prompt is the block's lines below its `NEXT:` line, never that line, then the text of each `add:` field:

- `add: input`: `input:` then the confirmed summary or fixer diagnosis, verbatim.
- `add: answered`: one `Answered: <decision> -> <option>` line per user answer (step 1 or a finding), none when none.
- `add: previous`: `previous findings:`, every member's previous findings verbatim, one `fix: <line>` per fix you applied.

Every round and retry is a new `Agent` dispatch, never a `SendMessage` to an earlier reviewer: the plan gate counts only dispatches after the last plan write.

Report the replies with `"${CLAUDE_SKILL_DIR}/scripts/review-round.sh" "<plan-path>" returned <k>=<word> <k>=<word>`: `<k>` the block's `member:`, `<word>` the `VERDICT:` word of its reply (`PASS`, `FAIL`, `DENIED`) or `none` without one. Act on what it prints:

- `NEXT: redispatch`: dispatch the blocks under it, then report those replies the same way.
- `NEXT: fix`: show every member's findings. Fix every Blocking finding, and every Minor one showing a change of a behaviour today's code has that neither the input nor an `Answered:` line asks for, across its whole class in the plan; any other Minor one only where a Blocking fix rewrites its text. Re-run `plan-index.sh` after every fix as in step 2, then `start` again. A finding needing a decision only the user can make is asked first through one `AskUserQuestion`; keep its answer as an `Answered:` line and run `start` with `--fresh`.
- `NEXT: exit-plan`: go to step 4 without writing the plan again; its Minor findings stay unapplied, except one showing such an unasked change of today's behaviour: report it first with `"${CLAUDE_SKILL_DIR}/scripts/review-round.sh" "<plan-path>" override <k>` and act on the `NEXT: fix` it prints.
- `ASK:`: one `AskUserQuestion` naming the refused call from the `REASON:` line of the `DENIED` reply: permission added runs its `retry-denied` event, stop its `stop` event; act on what they print.
- `STOP:`: the plan stays unreviewed, no hand-off.

```!
"${CLAUDE_PLUGIN_ROOT}/scripts/switch-text.sh" branching.""mode "${CLAUDE_SKILL_DIR}" branching-fix
```

## 4. Hand off

Call `ExitPlanMode` only on a `NEXT: exit-plan` of a round started after your last write to the plan file. Every later write voids it, whatever caused it (the user's remark on a refused `ExitPlanMode`, an answer, a Minor finding, your own second thought): re-run `plan-index.sh` as in step 2, then step 3 from `start --fresh` (with `--input "<summary file>"` on a summary file input) before the next `ExitPlanMode`.

Then name `viber:implementor` as the next step, the path shown in step 2 being the whole handover. Nothing runs here.

A plan that changes a UI or an endpoint and carries no end-to-end task adds one line to its hand-off:

```!
"${CLAUDE_PLUGIN_ROOT}/scripts/switch-text.sh" build.qa "${CLAUDE_SKILL_DIR}" qa-e2e
```
