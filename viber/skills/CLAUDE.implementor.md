# viber/skills - editing the implementor skill

Read for a change to `implementor/SKILL.md`, its `parts/close.md` or its fragments. It covers what the session leaves to scripts and where its text is pinned, not the scripts' own contracts (`viber/scripts/CLAUDE.md`) nor the agents' files.

## Contracts

- `implementor` schedules nothing itself: one `task-step.sh "<plan>" "-" "<started>" ready` call, alone in a message, at the start and after every message that answered a `NEXT: done`, `NEXT: hold`, `NEXT: wait` or a skip, lists the tasks to start (`start`) and to send again (`retry coder --waited`). A coder's `WAIT:` line goes back as `--wait "<path>,..."`, and `NEXT: wait | on: <id>` holds the task, asking nothing and ending no attempt, until a `ready` call lists it. The `--decide` line of a pair put in sequence, standing ahead of that block, asks nothing either when it exits non-zero: it is named in the final summary and the block acted on. A coder or reviewer that returned no output at all is reported as `lost`, never judged: the script answers a `NEXT: ready` block listing the task again, the same round's `NEXT: review` block when its reviewer is the one lost, or the next attempt's block after a second loss in a row.
- Its `close` part is printed before the first action of step 5, 6 or 7 (an `abort` reaching step 7 included), and its step 3 builds the close entries of the task list from the config block's switches, never from the part.
- `scripts/task-step.sh` runs `run-failures.sh --lessons` on the session's first `start` and after every reviewer `VERDICT: FAIL`, and `plan-index.sh --dispatch` prints the list as `run-lessons:` on every task coder dispatch, never a reviewer one; the final-review fix coder (`fragments/final-review.true.md`) and the repair coder (`parts/close.md`) make their own `run-failures.sh --lessons` call right before the dispatch.
- The `DECIDE:` flow: on attempts 1 to 4 a coder's `DECIDE:` goes to `arbiter` at once, never in the repair pass, and the same coder is resumed by `SendMessage` with its `decision:` lines in the same attempt; a refused `SendMessage` or a failed resumed coder falls to the next attempt, a resumed coder's second `DECIDE:` to the arbiter again.
- The `parts/close.md` summary adds `attempts:` and `arbiter:` lines after the lines of the summary call (the `tokens:` lines, `rounds:`, then one `refused:` line per path a task commit refused: the body carries no warning of that kind), reaching `closeout`'s `summary:` and `outcome.md`.
- The `NEXT: extension` blocks and `NEXT: qa-kept` that `plan-index.sh --split` prints are carried from step 2 to step 6, never acted on before it; `fragments/extensions.on.md` sends each extension block as printed.

## Commands

- The prose pinned in the skill: `node --test tests/viber/ready-prose.unit.test.ts tests/viber/close-part-prose.unit.test.ts`.

## Change together

- A directive of step 4 (`NEXT: ready`, `coder`, `review`, `commit`, `done`, `wait`, `hold`, `arbiter`, `resume`, `carry-out`), an event (`lost` among them) and an event flag (`--wait`, `--with`, `--defer`, `--decide`): `implementor/SKILL.md` and `scripts/task-step.sh`, whose header lists them.

## Traps

- The pointer sentence of `implementor/SKILL.md` keeps the lower-case phrase "before the first action of step 5, 6 or 7": `tests/viber/close-part-prose.unit.test.ts` pins it, and a reworded pointer lets an `abort` reach step 7 with the part never printed.
- The word count of `implementor/SKILL.md` is capped by `cap/implementor-skill` of `tools/lint/data/caps.ts`: a sentence added to step 4 needs room there.
