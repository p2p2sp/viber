# Plan review replay

By-hand kit that measures the plan judge and the reach search of two plugin versions against each other: a baseline (an installed release) and the plugin under test. No test reads it. `expected.md` holds what each run must produce; the three plans are `plan-a.md`, `plan-b.md` and `plan-c.md`, each recovered from an archived run and each carrying planted defects no `plan-index.sh` check rejects. `plan-c.md` leaves out one slice of its run, the one whose task changed an agent file the plugin does not ship.

## What the kit does not measure

A plan that contradicts its summary is not measured. The summary the judge gets as `input:` is rebuilt from the `spec.md` of the plan's own archived run, so the plan answers it by construction.

The plan authors (`plan-surveyor`, `plan-architect`, `plan-author`) are not measured: the plans are given, and the reach targets are those `expected.md` lists.

## The tree both runs read

Each plan is read against a worktree at the parent of the commit that decomposed it, the tree its planner saw. `expected.md` records its references against that tree. Create one per plan from the repository root and run the reach search of that plan from inside it:

| Plan | Decompose commit | Tree (its parent) | Worktree command |
| --- | --- | --- | --- |
| `plan-a.md` | `7325c99c` | `b1d9eb5d` | `git worktree add --detach .temp/viber/replay/plan-a b1d9eb5d` |
| `plan-b.md` | `9aaa056b` | `7eaadf7c` | `git worktree add --detach .temp/viber/replay/plan-b 7eaadf7c` |
| `plan-c.md` | `f3bff883` | `18bcac81` | `git worktree add --detach .temp/viber/replay/plan-c 18bcac81` |

Remove each with `git worktree remove .temp/viber/replay/<plan>` when its two runs are done. The plan files stay in the main checkout: every dispatch names the plan by its absolute path there.

Run every dispatch in a fresh Claude Code session, so no earlier dispatch's reading is in context. The judge reads the plan and the summary and searches no code, so only the reach search needs the worktree.

## The reach search

Once per plan and plugin version. The search is a script, no agent classifies its hits:

1. Write a survey file anywhere outside the repositories, holding the line `AREA: replay | 1 | the plan under replay` and one `TARGET: <target>` line per target of the plan's section in `expected.md`, the target as written there.
2. From inside the plan's worktree run `skills/planner/scripts/plan-build.sh outline "<absolute path of the plan file>" "<survey file>"` of the plugin under test. It writes its work files under `.temp/viber/planner/` of that worktree and prints the lines `reach: <path of reach-paths.md>` and `candidates: <path of the candidates file>` in the block that closes its output.

`reach-paths.md` holds one `## <target>` section per target with one `<path> | <hit count>` line per file referring to it; the candidates file holds the hit lines, `<path>:<line>: <text>`.

A baseline plugin whose `plan-build.sh outline` refuses that survey file has no reach search of this form: record its reach as not measured.

## Dispatch lines

One agent, `viber:plan-judge`, reads the plan, whatever its size. The lines are the ones the `## Input` of its `plan-judge.md` names: a baseline whose reviewer names other lines gets those.

`viber:plan-judge`:

```
plan: <absolute path of tests/viber/replay/plan-review/plan-a.md>
round: 1
out: <absolute path of a file under .temp/viber/replay/ for the judge file>
input:
<the summary of the plan's section in expected.md, verbatim>
```

The judge writes its judge file to the `out:` path and replies `OUT: <that path>` above its `VERDICT:` line; with nothing to report it writes no file and replies `VERDICT: PASS` alone. It gets neither reach file: a file the plan leaves unplaced is reported by the reach search, whose `reach-paths.md` the planner's `assemble` and `apply` hold every plan to.

A problem is critical, a `CRITICAL:` line, only when the plan contradicts the summary, or when a coder cannot resolve it without changing a `DoD` clause, a `## Contracts` block or a file outside its task's `Files`. Everything else the judge writes is a `NOTE:` line and never fails a run.

## Recording a run

For each plan and plugin version, record in a table: the sections of `reach-paths.md`, verbatim; the judge file, verbatim; and the `subagent_tokens` and the `tool_uses` the host reports for that dispatch.

A run passes only when every defect and every reference of the plan's section in `expected.md` is reported: `reach-paths.md` holds a line for each listed file under its target, which covers every file a `Reach` defect names, and a `CRITICAL:` line of the judge names the task of each `critical` defect. Extra judge lines and extra reach lines do not fail a run.

Compare the two versions per plan: the defects and references the plugin under test reports against the baseline (none lost), and the change of `subagent_tokens` and `tool_uses` per dispatch. Report a pass and the two figures per dispatch for each version.
