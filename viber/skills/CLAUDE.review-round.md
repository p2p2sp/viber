# viber/skills - editing the planner's dispatch scripts

Read for a change to `planner/scripts/plan-build.sh` (its entry `plan-build.ts`, its core `viber/lib/plan-build.ts`), to `planner/scripts/review-round.sh`, or to a dispatch block `planner` sends. It covers what the two scripts print, keep and write, not the agents' own files.

## Terms

- Block: the lines a script prints for one `Agent` dispatch, opening on a `NEXT:` line that names the agent (`NEXT: dispatch | agent: viber:<name>` from `plan-build.sh`, `NEXT: review | member: <k> | agent: viber:<name> | round: <r>` from `review-round.sh`). The prompt is every line below that line, then the text of each `add:` field it names; the `NEXT:` line is never sent.
- `<dir>`: `<repository root>/.temp/viber/planner`, where both scripts keep their state (`plan-build`, `review-round`) and work files.
- Part: the stretch of the plan one reviewer gates, cut by `plan_part_sum` of `viber/scripts/plan-parts.sh`.

## Contracts

- The header of `plan-build.ts` and the header of `review-round.sh` are the two contracts: every command, event, printed line, file and exit code.
- Every block opens on `plan: <plan>` and `refs: <plugin root>/references` and carries `out:`, the file its agent writes when plan mode names it none of its own.
- The `add:` fields: `input` (`input:` then the confirmed summary or diagnosis verbatim, only when no summary file was given: with one the block carries the `input: <summary file>` line), `answered` (one `Answered: <decision> -> <option>` line per answer) and, on a fixer block naming neither findings nor gaps, `lines` (what the fixer is to fix).
- `plan-build.sh survey <plan> [--input <summary file>] [--phase]` prints the `plan-surveyor` block and removes the work files of the last survey first. Only `--phase` on the plan path of that survey keeps them and adds `outline: <dir>/outline.md` when that file exists: the path alone tells no phase from a plan abandoned earlier in the session.
- `plan-build.sh outline <plan> <survey file>` copies the survey to `<dir>/outline.md`, searches its `TARGET:` lines and prints `TASKS:`, `FILES:`, a `threshold:` line past 30 tasks and one past 60 files, each `DECIDE:` line, a `Split proposal:` block only with a `threshold:` line and `PHASE:` lines, then the `plan-architect` block: `mode: whole` at 8 tasks or fewer, else `mode: skeleton`.
- The reach search of `outline` writes `<dir>/reach-<stamp>.md` (the candidates: every hit line, at most 200 per target) and `<dir>/reach-paths.md` (one `<path> | <hit count>` line per file); a target's own file and everything under `.temp/` are left out, and with no usable `TARGET:` line `reach-paths.md` is removed and no block carries `reach:` or `candidates:`.
- `plan-build.sh skeleton <plan> <architect file>` writes the lines above `<!-- DECISIONS -->` into the plan file and the lines below into `<dir>/decisions.md`, and prints `mode: skeleton` when a task holds `PENDING` as its `Verification` or `DoD`, else `mode: whole`.
- `plan-build.sh slices <plan>` cuts the tasks into `ceil(n / 8)` runs, writes one brief per run (`<dir>/slice-<first id>-<last id>.md`: Must not change, the Acceptance criteria its tasks cover, its Tasks, the Contracts they use, their File map lines and the Reach sections of their files) and prints one `plan-detailer` block per run.
- `plan-build.sh merge <plan> <first id>-<last id>=<task file>...` puts only the `- Verification:` and `- DoD:` lines into the tasks of the plan, writes the `GAP:` lines to `<dir>/gaps.md` and the briefs again, and prints `merged:`, `pending:` for tasks still holding `PENDING` and, with gaps, `gaps:` and the `plan-fixer` block.
- `plan-build.sh apply <plan> <fix file>` applies every `@@ EDIT` / `@@ WITH` / `@@ END` block in order, all or none: the lines up to `@@ WITH` must occur exactly once in the plan, trailing blanks ignored. It writes the `fix:` lines to `<dir>/fixes.md` and the briefs again when the plan has some. A marker line out of that order, or no `fix:` line outside the blocks, refuses the whole file (exit 4).
- `plan-build.sh fix <plan> [--findings <file>]... [--brief <file>]... [--gaps]` prints the `plan-fixer` block; `review-round.sh` and `merge` print the same block themselves.
- `plan-build.sh` exits 0, 2 on misuse, outside a repository or a file it cannot read or write, 4 when what an agent wrote cannot be used (nothing is written, one stderr `FIX:` line per defect) and 5 when the plan file itself cannot be written; stdout is empty on every error.
- `review-round.sh <plan> start|returned|retry-denied|stop` answers in `member:` report lines and `NEXT:`, `MINOR:`, `ASK:` and `STOP:` lines; a misuse exits 2 with one `error:` line and an empty stdout, the state left as it was.
- `start` runs `plan-index.sh` on the plan and takes one member per `dispatch:` line: `planner-review` for a plan of 12 tasks or fewer, else the spec, graph and task reviewers. It counts and cuts nothing itself. Outside the skeleton stage it adds `--detailed`, so a task still holding `PENDING` refuses the start (exit 2, the `FIX:` lines of `plan-index.sh` on stderr).
- `start` opens round 1, carrying no previous findings, on `--fresh`, with no state or with the state of another plan path, and removes the `findings-*.md` and `review-*.md` files of `<dir>`. It opens round r+1 only when the last answer was `NEXT: fix`, `NEXT: detail` or `NEXT: exit-plan`; any other state is refused.
- Round r+1 prints only the blocks of the members without a PASS and of those whose part of the plan differs from the part they passed on (the `cksum` kept per member in the state file); the others keep their PASS, except `planner-review`, sent every time: the plan gate pairs its verdict with a dispatch made after the last plan write, a write that changed no text included. The whole set is printed when the `dispatch:` lines differ from the members of the state, and a round with no member to send prints `NEXT: exit-plan` at once.
- `start --answered` also sends the members that read the `Answered:` lines, `planner-review` and `planner-spec-review`, whatever verdict they hold.
- A block of a round after `NEXT: fix` or `NEXT: exit-plan` carries `previous: <dir>/findings-<k>.md` and `fixes: <dir>/fixes.md` where those files exist; a round after `NEXT: detail`, one after a member returned no verdict at all, and one whose `dispatch:` lines differ from the members of the state carry neither; the last also removes every `findings-*.md`, which are numbered by member and would reach another reviewer.
- `start --fresh --skeleton` opens the skeleton stage: only `planner-spec-review` and `planner-graph-review` are sent, until `NEXT: detail`; a plan of 12 tasks or fewer has nothing to send there and gets `NEXT: detail` at once.
- Every block carries `sum: <crc>-<bytes>`, the checksum of that member's part of the plan at its dispatch.
- A `start` outside the skeleton stage with a task reviewer among its members runs `plan-build.sh slices` itself, so the briefs hold the plan as it stands. A task reviewer's block carries `brief:` when its slice brief exists; a block with no brief carries `reach:` when `reach-paths.md` exists, and each block `candidates:` when the `plan-build` state names a candidates file.
- `returned <k>=<PASS|FAIL|DENIED|none> --out <k>=<file>` copies a member's findings file to `<dir>/findings-<k>.md`; a PASS without one removes that file, and a FAIL without a readable one counts as `none`.
- `returned` prints one `member: <k> | viber:<name> | <verdict> | blocking: <n> | minor: <m>` line per member given a verdict, its findings file last when it has one.
- A member at its first `none` of a round is sent again (`NEXT: redispatch`); its second counts as FAIL, is named on `no-verdict:` and removes its findings file.
- Once every awaited member holds a verdict the first that applies is printed: `ASK:` on any DENIED, `NEXT: fix` on any FAIL, `NEXT: detail` when the skeleton stage passed, else `NEXT: exit-plan` with one `MINOR:` line per Minor finding ending in `(inferred)`, `(untouched)` or `(behaviour)`.
- A member sent in the round that holds a PASS while its findings file holds a Minor line ending in `(behaviour)` counts as FAIL, once per member and plan, and is named on `behaviour:`.
- `NEXT: fix` is followed by the `plan-fixer` block over the findings files of the failed members and the briefs of the task reviewers among them; with no findings file among them the line stands alone and the next `start` sends those members again.

## Commands

- The plan-build core, in process: `node --test tests/viber/lib/plan-build.unit.test.ts tests/viber/lib/plan-text.unit.test.ts tests/viber/lib/reach.unit.test.ts`.
- The round script, a legacy pair run by name: `node --test tests/viber/review-round.critical.test.ts`, `node --test tests/viber/review-round.test.ts`.

## Change together

- The `sum:` line: `review-round.sh` prints it from `plan_part_sum`, and `viber/hooks/scripts/plan-gate.sh` compares it through the same function, so a verdict on it survives a plan write that left its part alone. The round's own choice of who reviews again and the gate's check must agree.
- The slices: `slicesOf` of `viber/lib/plan-text.ts` (briefs, detailer blocks), the review lines of `viber/scripts/plan-index.sh` and the cut `plan-gate.sh` requires; a brief is found by a task reviewer's `tasks:` value, `slice-<tasks>.md`.
- The block labels and the `## Input` of the agent each block is sent to (`viber/agents/CLAUDE.md` lists them per label).
- The directives `planner/SKILL.md` acts on (`NEXT: redispatch`, `fix`, `detail`, `exit-plan`, `ASK:`, `STOP:`, the `threshold:`, `mode:`, `pending:` and `gaps:` lines, exits 4 and 5) and the lines the two scripts print.

## Traps

- `review-round.sh` runs `plan-build.sh fix` for the fixer block and `plan-build.sh slices` for the briefs: without `node` on `PATH` it prints `NEXT: fix` with no block after it and no block carries `brief:`.
- `plan-build.sh survey --phase` compares its `<plan>` argument as text with the path of the last survey: another spelling of the same file reads as another plan and removes the work files.
- `review-round.sh` reads the candidates file path from the `plan-build` state file, the one fact it takes from the other script's state.
- A reviewer in plan mode writes beside the plan file, so `<dir>/review-<k>.md` exists only outside plan mode, and only a round 1 `start` removes it: neither a survey of another plan nor the archive does.
