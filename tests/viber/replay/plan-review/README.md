# Plan review replay

By-hand kit that measures the plan reviewers and the reach search of two plugin versions against each other: a baseline (an installed release) and the plugin under test. No test reads it. `expected.md` holds what each run must produce; the three plans are `plan-a.md`, `plan-b.md` and `plan-c.md`, each recovered from an archived run and each carrying planted defects no `plan-index.sh` check rejects. `plan-c.md` leaves out one slice of its run, the one whose task changed an agent file the plugin does not ship.

## What the kit does not measure

`Faithful` is not measured. The summary each reviewer gets as `input:` is rebuilt from the `spec.md` of the plan's own archived run, so the plan answers it by construction.

The plan authors (`plan-surveyor`, `plan-architect`, `plan-detailer`, `plan-fixer`) are not measured: the plans are given, and the reach targets are those `expected.md` lists.

## The tree both runs read

Each plan is read against a worktree at the parent of the commit that decomposed it, the tree its planner saw. `expected.md` records its references against that tree. Create one per plan from the repository root and run the reach search and the dispatches of that plan from inside it:

| Plan | Decompose commit | Tree (its parent) | Worktree command |
| --- | --- | --- | --- |
| `plan-a.md` | `7325c99c` | `b1d9eb5d` | `git worktree add --detach .temp/viber/replay/plan-a b1d9eb5d` |
| `plan-b.md` | `9aaa056b` | `7eaadf7c` | `git worktree add --detach .temp/viber/replay/plan-b 7eaadf7c` |
| `plan-c.md` | `f3bff883` | `18bcac81` | `git worktree add --detach .temp/viber/replay/plan-c 18bcac81` |

Remove each with `git worktree remove .temp/viber/replay/<plan>` when its two runs are done. The plan files stay in the main checkout: every dispatch names the plan by its absolute path there, and the reviewer searches the code from the worktree it runs in.

Run every dispatch in a fresh Claude Code session started in the plan's worktree, so no earlier dispatch's reading is in context.

## The reach search

Once per plan and plugin version, before the review dispatch. The search is a script, no agent classifies its hits:

1. Write an outline file anywhere outside the repositories, holding `TASKS: 1` and one `TARGET: <target>` line per target of the plan's section in `expected.md`, the target as written there.
2. From inside the plan's worktree run `skills/planner/scripts/plan-build.sh outline "<absolute path of the plan file>" "<outline file>"` of the plugin under test. It writes its work files under `.temp/viber/planner/` of that worktree and prints the lines `reach: <path of reach-paths.md>` and `candidates: <path of the candidates file>` in the block that closes its output.

`reach-paths.md` holds one `## <target>` section per target with one `<path> | <hit count>` line per file referring to it; the candidates file holds the hit lines, `<path>:<line>: <text>`.

A baseline plugin with no `plan-build.sh` has no reach search of this form: record its reach as not measured and dispatch its reviewer without the two lines.

## Dispatch lines

Each plan holds 12 tasks or fewer, so one reviewer, `viber:planner-review`, reads it. `refs:` is the `references` directory of the plugin under test, and the lines are the ones the `## Input` of its `planner-review.md` names: a baseline whose reviewer names fewer gets only those.

`viber:planner-review`:

```
plan: <absolute path of tests/viber/replay/plan-review/plan-a.md>
refs: <references directory of the plugin under test>
memory: true
reach: <path of reach-paths.md, as the reach search printed it>
candidates: <path of the candidates file, as the reach search printed it>
out: <absolute path of a file under .temp/viber/replay/ for the findings>
input:
<the summary of the plan's section in expected.md, verbatim>
```

The reviewer writes its findings to the `out:` file and replies `OUT: <that path>` above its `VERDICT:` line; with no finding at all it writes no file and replies `VERDICT: PASS` alone. The `sum:` line of a live dispatch is left out: it serves the plan gate and no reviewer reads it.

A plan of more than 12 tasks gets the review set instead, each member with the same plan path, `refs:` and `out:` line of its own, and the plan gate requires every member. The replay plans never reach it, so the lines are kept here for a later plan:

- `viber:planner-spec-review`: `reach:`, `candidates:` and `input:` with the summary, as above.
- `viber:planner-graph-review`: `memory: true`, `reach:` and `candidates:`.
- `viber:planner-task-review`: `memory: true`, the `tasks: T<a>-T<b>` value of its slice, `candidates:` and `brief:` with the slice file `skills/planner/scripts/plan-build.sh slices "<absolute path of the plan file>"` writes for that range.

## Recording a run

For each plan and plugin version, record in a table: the sections of `reach-paths.md`, verbatim; the findings file of the reviewer, verbatim; and the `subagent_tokens` and the `tool_uses` the host reports for that dispatch.

A run passes only when every defect and every reference of the plan's section in `expected.md` is reported: a reviewer finding names the defect's file or task under the rule `expected.md` lists, and `reach-paths.md` holds a line for each listed file under its target. Extra findings and extra reach lines do not fail a run.

Compare the two versions per plan: the defects and references the plugin under test reports against the baseline (none lost), and the change of `subagent_tokens` and `tool_uses` per dispatch. Report a pass and the two figures per dispatch for each version.
