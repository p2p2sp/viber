---
name: planner
description: Only for a confirmed viber:intent interview or a viber:fixer diagnosis already in context - never the entry point. Without one, suggest the viber:intent interview and let the user decide. Turns that input into a reviewed implementation plan - acceptance criteria, file map, then tasks carrying dependencies, contracts, verification and DoD.
allowed-tools: Read, Write, Edit, Grep, Glob, Agent, Skill, EnterPlanMode, ExitPlanMode, Bash(${CLAUDE_PLUGIN_ROOT}/scripts/plan-index.sh:*), Bash(${CLAUDE_PLUGIN_ROOT}/scripts/plan-path.sh:*), Bash(${CLAUDE_PLUGIN_ROOT}/scripts/config.sh:*), Bash(${CLAUDE_PLUGIN_ROOT}/scripts/switch-text.sh:*), Bash(date:*)
user-invocable: false
effort: high
---

```!
"${CLAUDE_PLUGIN_ROOT}/scripts/config.sh"
```

# planner

Input: an understood change already in context - a confirmed `viber:intent` interview, or a `viber:fixer` diagnosis. Anything else is unresolved input however clear it reads: suggest the `viber:intent` interview in one line and stop here, never entering plan mode. Never size the scope yourself: the threshold check below counts tasks against 30 and sizes nothing.

On valid input call `EnterPlanMode` first unless plan mode is already active.

The input carries three decisions already taken: the spec shape, whether this plan stops at a draft, and, on a round continuing an earlier draft, that draft's run key. Never reopen them.

Every bundled-script run below is one literal Bash line, every argument double-quoted, never prefixed with an interpreter word, never assigned to a variable, never preceded by `cd`, never chained with `;`, `&&` or `||`.

## 1. Map the files first

Read `${CLAUDE_PLUGIN_ROOT}/references/plan-rules.md` first, on a draft round as well, and hold the plan to every rule in it. A plan carrying an integration test also reads `${CLAUDE_PLUGIN_ROOT}/references/integration-tests.md`: the layer is designed from it as a whole.

Never plan an end-to-end test on your own: `/viber:e2e` writes them after the build. Plan one only when the input records the user explicitly asking for it, then per `plan-rules.md`'s End-to-end rule; one merely suggested, implied by a UI change or thought useful stays out of every criterion, task and `Verification`. The one exception: an existing end-to-end spec whose selector a task changes is no new test: it joins that task's `Files` per the same rule.

Never propose, write or show a mockup or prototype: plan mode writes the plan file alone, and a mockup comes from `/viber:prototype` before the interview hands off.

Before writing a task, decide which files get created, modified or deleted and what each one owns: locked-in boundaries are what lets tasks run in parallel.

- One responsibility per file, and each new file hides more than its interface exposes: a file that only forwards to another (deleting it would move no complexity, only remove a hop) is folded into its caller. Files that change together live together.
- Read the codebase for everything `plan-rules.md`'s Reach and Owned rules force into the file map, not only what the change introduces.
- A file you have to touch that has grown unwieldy may be split, as a task.

Close the step on the threshold check, on a draft round as well, before any task is written: estimate from the file map how many tasks the plan needs. At more than 30 tasks, ask through one `AskUserQuestion`: split the change into parts, or keep one plan of that many tasks.

- Split: invoke `viber:intent` through the `Skill` tool with the confirmed input verbatim followed by a `Split proposal:` block in this shape, and write no plan. Its parts come from your file map, a `viber:fixer` input puts the fix in part 1, `Open decisions:` lists each decision owed to the user that your exploration revealed, asked none of them, and it and its lines are left out when there are none.

  ```
  Split proposal:
  <n>. <part> - owns: <what it delivers>; consumes: <what earlier parts produce, or nothing>; files: <repo-relative paths>; tasks: <estimated count>
  Open decisions:
  - <decision owed to the user, one per line>
  ```

- Keep: record the estimate as the accepted count and go on.

After the threshold question, and only on a plan that goes on, ask each decision owed to the user that your exploration revealed: a behaviour, scope or product choice the input leaves open, which the user may want otherwise. An implementation choice (a file, a name, a library, a structure, an algorithm) is never asked: it stays with you. Each decision gets its own `AskUserQuestion` with 3 options, your recommendation first, one at a time, each only after the previous answer. Plan on every answer, and keep each as an `Answered:` line for step 3.

## 2. Write the plan

The specification half is `${CLAUDE_SKILL_DIR}/templates/spec-lite.md` or `${CLAUDE_SKILL_DIR}/templates/spec-full.md`, whichever shape the input names; the task half is `${CLAUDE_SKILL_DIR}/templates/tasks.md` under either. Fill the spec, append the task half under it, and write the result into the plan file plan mode names in its system message, the only file you may write while planning. Keep every section and every HTML marker of both templates, except one a template comment says to drop; add no section of your own.

Fill the frontmatter per its placeholders: `source:` is the only way back to the file once approval clears this context; `issue:` comes only from the input's `Issue:` line and the `attachments:` entries only from its `Attachment:` lines, never from the scope, and a draft round carries both over (below). Each `Attachment:` line is one entry: a unique name that is the file's or directory's own name (letters, digits, `_`, `.` and `-`, opening on a letter or digit), changed only to avoid a repeat, then the line's path. A task needing one of those files names `attachments/<name>` in its `DoD`, `attachments/<name>/` for a directory; a task needing none names none.

A round continuing a draft reads `docs/<directories.runs>/<key>/plan.md` first and carries its specification over, changing only what the input's remarks change - its `issue:` line and its `attachments:` block travel with the rest of that specification unless a remark changes them - and writes the key into the frontmatter's `into:` key; any other plan drops that line.

An input carrying a roadmap, or a `Roadmap: <path>` line (read that `roadmap.md`), fills `## Roadmap` per its template comment and repeats every later entry under `### Out of scope`; no roadmap in the input means no such section. What a later entry brings stays absent: no task delivers a stand-in for it, no acceptance criterion depends on it, nothing is stubbed, mocked or temporarily substituted. A part is never a release: no acceptance criterion needs a working application between parts.

A plan stopping at a draft writes the specification half alone: no `## Tasks`, no `## Contracts` appendix, no decision record screening.

Every plan but a draft then runs `"${CLAUDE_PLUGIN_ROOT}/scripts/plan-index.sh" "<plan-path>"`. It must exit 0: fix whatever it reports and re-run.

Then run the threshold check again on the written plan: count the rows under the `tasks:` header of that output. Ask the step 1 question again only when the count is above 30 and above the accepted count, if the user accepted one; the answers act as in step 1, and a keep records the new count as the accepted one. A draft writes no task and skips this check.

```!
"${CLAUDE_PLUGIN_ROOT}/scripts/switch-text.sh" planning.adr "${CLAUDE_SKILL_DIR}" adr
```

Show the user the full path of the written plan.

```!
"${CLAUDE_PLUGIN_ROOT}/scripts/switch-text.sh" branching.""mode "${CLAUDE_SKILL_DIR}" branching
```

A draft goes to step 3 next; every other plan dispatches the review below.

## 3. Review gate

Count the rows under the `tasks:` header of the `plan-index.sh` output of this round.

- A draft, and a plan of 12 tasks or fewer: dispatch the `viber:planner-review` agent alone, as below.
- A plan of more than 12 tasks: dispatch the review set, as further below.

Dispatch the `viber:planner-review` agent with the plan path, `refs: ${CLAUDE_PLUGIN_ROOT}/references`, `memory: <value>` (the `build.memory:` line of the config block resolved above), and the line:

```
input:
<the confirmed viber:intent summary or viber:fixer diagnosis in context, verbatim>
Answered: <decision> -> <chosen option>
```

One `Answered:` line after the summary for every answer the user gave you, from step 1 and from a `VERDICT: FAIL` finding alike, none when there are none.

A draft adds the line `scope: spec`. From round 2 on, also pass the previous findings verbatim and one line per fix you applied.

The review set is dispatched in one message, one `Agent` call per member, each member getting the plan path and `refs: ${CLAUDE_PLUGIN_ROOT}/references` and:

- `viber:planner-spec-review`: the `input:` block above with its `Answered:` lines.
- `viber:planner-graph-review`: `memory: <value>` as above.
- `viber:planner-task-review`, one per slice: `memory: <value>` as above and `tasks: T<a>-T<b>`. The slices are `ceil(n / 8)` runs of consecutive tasks for `n` tasks, sizes differing by at most one, the larger first (13 -> T1-T7, T8-T13; 30 -> T1-T8, T9-T16, T17-T23, T24-T30).

From round 2 on, every member also gets every member's previous findings verbatim and one line per fix you applied. Every round after a `VERDICT: FAIL` dispatches the whole set anew, slices recounted from the plan as fixed.

Every round and every retry is a new `Agent` dispatch, never a `SendMessage` to an earlier reviewer: the plan gate counts only a dispatch made after the last plan write.

A reply with no `VERDICT:` line gets one more dispatch with the same input, that member alone; a second reply without one is handled as `VERDICT: DENIED` with `REASON: no verdict returned`.

The verdict of a round of the review set is `VERDICT: DENIED` when any member returned it, else `VERDICT: FAIL` when any returned it, else `VERDICT: PASS`. The verdicts below read the single reviewer's or the round's.

- `VERDICT: PASS` - go to step 4 without writing the plan again; its Minor findings stay unapplied.
- `VERDICT: FAIL` - show the findings, every member's of a review set round, fix every Blocking finding, and a Minor one only where a Blocking fix already rewrites its text, re-run `plan-index.sh` after every fix unless the plan is a draft, then dispatch again. A finding that needs a decision only the user can make gets asked first through one `AskUserQuestion`, and the answer, kept as an `Answered:` line, starts a fresh round 1.
- `VERDICT: DENIED` - one `AskUserQuestion` naming the refused call from its `REASON:` line: permission added and retry, dispatching again in the same round (in a review set round only the members that returned `DENIED`, the others keeping their verdicts), or stop with the plan unreviewed and no hand-off.

```!
"${CLAUDE_PLUGIN_ROOT}/scripts/switch-text.sh" branching.""mode "${CLAUDE_SKILL_DIR}" branching-fix
```

## 4. Hand off

Call `ExitPlanMode` only after a PASS from a review dispatched after your last write to the plan file; on a review set, that is the PASS of every member the round required. Every later write voids that PASS, whatever caused it - the user's remark on a refused `ExitPlanMode`, an answer to your question, a Minor finding, your own second thought: re-run `plan-index.sh` unless the plan is a draft, then dispatch step 3 again, as a fresh round 1, before the next `ExitPlanMode`.

Then exactly one case applies:

- A plan with its task half, on a change no draft preceded: name `viber:implementor` as the next step, the path shown in step 2 being the whole handover. Nothing runs here.
- A round still carrying no task half: land it below and end there, never naming `viber:implementor`: a build refuses a draft.
- A round that added the task half to a draft: land it below, then name `viber:implementor` as the next step, the landed path being the handover.

A plan with its task half that changes a UI or an endpoint and carries no end-to-end task adds one line to its hand-off:

```!
"${CLAUDE_PLUGIN_ROOT}/scripts/switch-text.sh" build.qa "${CLAUDE_SKILL_DIR}" qa-e2e
```

A change that went through a draft lands here, since nothing downstream lands a plan carrying no task - the only thing this step executes:

`"${CLAUDE_PLUGIN_ROOT}/scripts/plan-path.sh" --land "<plan-path>"`

On a non-zero exit, report the reason it printed on stderr and stop: nothing landed, so name no landed path and no next step.

```!
"${CLAUDE_PLUGIN_ROOT}/scripts/switch-text.sh" branching.""mode "${CLAUDE_SKILL_DIR}" branching-land
```

Show the user the landed path. Never run git directly yourself: the landed draft is the user's to commit.
