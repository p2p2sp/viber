# viber/skills - editing the planner and its plan-build script

Read for a change to `planner/SKILL.md`, its fragments or `references/adr-tasks.md`, to `planner/scripts/plan-build.sh` (its entry `plan-build.ts`, its core `viber/lib/plan-build.ts`), or to a dispatch block `planner` sends. It covers what the session and the script each do, not the agents' own files nor the plan gate.

## Terms

- Block: the lines the script prints for one `Agent` dispatch, opening on `NEXT: dispatch | agent: viber:<name>`. The prompt is every line below that line, then the text of each `add:` field it names (`input`, `answered`, `lines`); the `NEXT:` line is never sent.
- `<dir>`: `<repository root>/.temp/viber/planner`, where the script keeps its state file `plan-build` and its work files, every one an `.md` file.
- Slice: a run of the areas of the survey that one `plan-author` reads once, cut by `outline` within 8 estimated tasks and 200000 bytes of existing files. One slice: that author writes the whole plan (an unframed plan). Two or more: `plan-architect` writes the frame first (the specification half, the contract blocks two or more slices share, one `SLICE:` line per slice).
- Owner: who wrote a stretch of the plan and so fixes it, a slice number or `frame`, kept per task and contract block in `<dir>/owners.md`. Every owner of an unframed plan is slice 1.
- Fix step: a `NEXT: fix` line or a `gaps:` line with one fix block per owner below it; the session dispatches every block in one message and reports all the files in one `apply` call.

## Relationships

- The commands in the order `planner/SKILL.md` runs them: `survey`, `outline` (step 1), `frame` on a framed plan (step 2), `assemble` (step 3), `judge` and `judged` (step 4), with `apply` after every fix step, `open` when a fix cannot be had (of a review round, or of a change made once the review is over), `keep` after the user kept a size past the limit and `fix` for a change of the session's own (accepted decision records, the user's change after a refused `ExitPlanMode`).
- `assemble` and `apply` validate the plan in process with the plan-index core, so `planner` makes no `plan-index.sh` call.

## Contracts

- The header of `plan-build.ts` is the contract: every command, printed line, work file, block line and exit code. This section repeats none of it.
- `planner` reads no code, composes no plan text and relays no content: agents write files, the script moves them, and the session passes paths, verdict words and the user's answers. It never reads the plan or a file an agent wrote, with three exceptions: a summary file once, for its hand-off lines; the first 3 lines of an existing plan file, only when the `Write` of its stub is refused; the frontmatter alone, before the branch step's `Edit`.
- Every bundled-script run of `planner` is one literal Bash line with every argument double-quoted, so `plan-gate.sh` finds in the session transcript the call that answered a verdict by its line: `plan-build.sh`, then `apply` or `open`, then the plan path, or `judged`, the plan path and the word `none` or `DENIED`, the subcommand and the word quoted or not.
- The script counts the review rounds, the session none: `judge` opens round 1 and round 2, no command opens or accepts a third, and the counter starts again only at the `assemble` that follows a `survey`. No command prints an `ASK:` line, and in round 2 and for a change made once the review is over no branch of the skill asks the user: a refused fix file, a `VERDICT: DENIED` or a `DECIDE:` reply runs `open`. In round 1 a `VERDICT: DENIED` of the judge or of a fix dispatch is still the user's to answer.
- `ExitPlanMode` is called only on `NEXT: exit-plan`, which is always followed by one `OPEN:` line per open item and nothing else; the session shows them as one list first.
- The script alone writes `## Open items`, the last section above `## Tasks`: the open critical problems, then the notes, at most 3 per task, the rest kept as plan notes naming their task.
- No author writes a dependency or an order: `assemble` and `apply` move a task behind the task that writes what it uses, whichever slice wrote which (a ring of tasks is a `FIX: cycle:` defect of the frame, or of the one author who wrote them all), number the tasks `T1..`, read the task ids of their `Delivers`, `Verification` and `DoD` lines through the new numbers, rename each `L<n>` block to the next free `C<k>` and write every `- Depends-on:` line.
- `SendMessage` carries only the `Answered:` lines of a `VERDICT: DECIDE` back to the architect or author that asked; refused or unanswered, its block is dispatched again. Every dispatch of the judge is a new `Agent` call: the plan gate pairs a verdict only with a dispatch.
- A finding or a defect goes to the owner of the text it names, as a fix block carrying that owner's `notes:` file (the `FACT:` lines of its author file): the fix is a new dispatch that reads no code file a `FACT:` line covers. Nothing depends on resuming an agent.
- Exits: 0; 2 on misuse, or when a work file cannot be written or the plan file cannot be read (the skill makes the call the `error:` line names once, else stops); 4 when what an agent wrote cannot be used, a file of its that cannot be read included (nothing written; a `FIX: slice <k>:` or `FIX: owner <o>:` line names whose block the session sends again with the lines, any other `FIX:` line the one block of the command); 5 when the plan file cannot be written, which stops the planner with no hand-off. Stdout is empty on every error.
- The fragments `branching.*`, `branching-fix.*` and `adr.true.md` and `references/adr-tasks.md` wait for `NEXT: judge` from `assemble` or from the `apply` of the last fix step; the two files of a `branching` pair stay byte-identical. `branching-fix.*` runs the branch command again after the fix of round 1 alone, so no branch question follows round 2.

## Commands

- The plan-build core, in process: `node --test tests/viber/lib/plan-build.unit.test.ts tests/viber/lib/plan-text.unit.test.ts tests/viber/lib/plan-graph.unit.test.ts tests/viber/lib/reach.unit.test.ts`.
- The blocks against the `## Input` of each agent, and the skill's review rules: `node --test tests/viber/planner-blocks.unit.test.ts tests/viber/planner-agents-prose.unit.test.ts`.

## Change together

- The block lines and the `## Input` of the agent each block is sent to (`plan-surveyor`, `plan-architect`, `plan-author`, `plan-judge`): `tests/viber/planner-blocks.unit.test.ts` holds them together.
- The directives `planner/SKILL.md` acts on (`NEXT: dispatch`, `judged | none`, `redispatch`, `fix`, `judge`, `exit-plan`, `STOP:`, the `threshold:`, `gaps:` and `OPEN:` lines, exits 2, 4 and 5) and the lines the script prints.
- The files the agents write and the script cuts: the frame file (`<!-- SLICES -->`, `<!-- DECISIONS -->`), the author file (`<!-- NOTES -->`, then `FACT:`, `GAP:`, `OUTSIDE:` lines), the fix file (`@@ EDIT` / `@@ WITH` / `@@ END`, then `fix:`, `unfixed:`, `GAP:`, `OUTSIDE:` lines) and the judge file (`VERDICT:`, `CRITICAL:`, `NOTE:` lines), each in the agent that writes it and in `viber/lib/plan-text.ts` or `viber/lib/plan-build.ts`.
- The calls the plan gate accepts as the answer to a verdict (`apply`, `open`, `judged ... none`, `judged ... DENIED`): `viber/hooks/scripts/plan-gate.sh` and the directives that follow a `FAIL` or a `DENIED` of round 2 here, each of which must end on `NEXT: exit-plan` through one of those calls: `judged` answers the `FAIL` report of a file it cannot use with `NEXT: judged | none` for that reason, the `NOTE:` lines of that file placed first (the `none` report names no file). The gate reads three more lines printed here: the `round: <r>` line of the judge block (a `none` answers no `FAIL` of round 1, where the script ends on `STOP:`), the `survey` call and the `assembled: <n> tasks` line of `assemble` (the verdicts ahead of a plan assembled anew count no more, as the round counter starts again there).
- The first prompt line of every block, `plan: <plan>`: `viber/scripts/run-summary.sh` counts a planning transcript whose first line names the plan path, for the agent types it lists (`plan-judge`, `adr-screener`, `plan-surveyor`, `plan-architect`, `plan-author`).

## Traps

- `survey --phase` compares its `<plan>` argument as text with the path of the last survey: another spelling of the same file reads as another plan and removes the work files. The outline of a phase prints no split proposal, so the survey of the next phase starts from no work file.
- A survey that starts a new plan removes every `.md` file of `<dir>`: a work file meant to outlive it needs another directory. It leaves the round state alone: `await: done` (the review is over) and `surveyed` are how `judge`, `apply` and `open` tell a finished review from the gap between its two rounds.
- The lines `assemble` and `apply` list under `### Out of scope` stand below `#### References kept`: `viber/lib/plan-index/split.ts` gives a task file that list up to the first heading below it, so the heading keeps one placement line per reach file out of every task file.
- An agent in plan mode writes beside the plan file, so `<dir>/judge-<r>.md` holds a copy `judged` made; the author, frame and fix files are read where the `OUT:` line names them, and `<dir>/author-<k>.md` exists only outside plan mode.
- `judge` exits 2 while the fix of a round is open (`await: fix` or `await: gaps`): the round ends on `apply` or `open`, never on a second `judge`.
- One frame correction per plan: a `GAP:` line arriving after it becomes an open critical item, never another dispatch.
