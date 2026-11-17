# Plan review replay

By-hand kit that measures the plan reviewers and `impact-mapper` twice: before the release that scripts the plan-review checks, on the installed plugin 0.95.2, and after it, on the released plugin. No test reads it. `expected.md` holds what each run must produce; the three plans are `plan-a.md`, `plan-b.md` and `plan-c.md`, each recovered from an archived run and each carrying planted defects no `plan-index.sh` check rejects.

## What the kit does not measure

`Faithful` is not measured. The summary each reviewer gets as `input:` is rebuilt from the `spec.md` of the plan's own archived run, so the plan answers it by construction.

## The tree both runs read

Each plan is read against a worktree at the parent of the commit that decomposed it, the tree its planner saw. `expected.md` records its references against that tree. Create one per plan from the repository root and run the dispatches of that plan from inside it:

| Plan | Decompose commit | Tree (its parent) | Worktree command |
| --- | --- | --- | --- |
| `plan-a.md` | `7325c99c` | `b1d9eb5d` | `git worktree add --detach .temp/viber/replay/plan-a b1d9eb5d` |
| `plan-b.md` | `9aaa056b` | `7eaadf7c` | `git worktree add --detach .temp/viber/replay/plan-b 7eaadf7c` |
| `plan-c.md` | `f3bff883` | `18bcac81` | `git worktree add --detach .temp/viber/replay/plan-c 18bcac81` |

Remove each with `git worktree remove .temp/viber/replay/<plan>` when its two runs are done. The plan files stay in the main checkout: every dispatch names the plan by its absolute path there, and the reviewer searches the code from the worktree it runs in.

Run every dispatch in a fresh Claude Code session started in the plan's worktree, so no earlier dispatch's reading is in context.

## Dispatch lines

Each plan passes `plan-index.sh` with `review: single` and `dispatch: viber:planner-review`, so one reviewer reads it. Check the live instruction first: `viber/scripts/plan-index.sh <plan path>` prints it last. `refs:` is the `references` directory of the plugin under test: the installed 0.95.2 for the run before the release, the released plugin for the run after it.

`viber:planner-review`:

```
plan: <absolute path of tests/viber/replay/plan-review/plan-a.md>
refs: <references directory of the plugin under test>
memory: true
input:
<the summary of the plan's section in expected.md, verbatim>
```

A plan of more than 12 tasks gets the review set instead, each member with the same plan path and `refs:`, and the plan gate requires every member. The replay plans never reach it, so the lines are kept here for a later plan:

- `viber:planner-spec-review`: `input:` with the summary, as above.
- `viber:planner-graph-review`: `memory: true`.
- `viber:planner-task-review`: `memory: true` and the `tasks: T<a>-T<b>` value of its line of the instruction.

`viber:impact-mapper`, once per plan, with the targets of its section in `expected.md`:

- Before the release, on the installed plugin 0.95.2, `targets:` alone:

```
targets:
<each target of the plan's section in expected.md, one per line>
```

- After the release, run `skills/planner/scripts/reach.sh` of the released plugin from inside the plan's worktree on the same targets, one quoted argument per target. It prints `candidates: <path>` and `hits: <n> lines in <m> files`. Dispatch with that path and the plan path:

```
plan: <absolute path of the plan file>
candidates: <path printed by reach.sh>
targets:
<the same targets>
```

## Recording a run

For each dispatch, record in a table per plan and per phase (before, after): the findings of a reviewer or the `REF:` lines of `impact-mapper`, verbatim; the `subagent_tokens` and the `tool_uses` the host reports for that dispatch; and, after the release, the `hits:` line of the `reach.sh` run.

A run passes only when every defect and every reference of the plan's section in `expected.md` is reported: a reviewer finding names the defect's file or task under the rule `expected.md` lists, and `impact-mapper` returns a `REF:` line for each listed file and target. Extra findings and extra `REF:` lines do not fail a run.

Compare the two phases per plan: the defects and references the after run reports against the before run (none lost), and the drop of `subagent_tokens` and `tool_uses` per dispatch. Report a pass and the two figures per dispatch for each phase.
