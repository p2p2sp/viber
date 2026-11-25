# viber/agents - the planning agents and the plan review

What `plan-surveyor`, `plan-architect`, `plan-author`, `plan-judge` and `outside-plan-review` take, write and reply, and what is copied between them and `lib/plan-build.ts`. The steps that dispatch them belong to the skills node, the gate that asks for the review to the hooks node.

## Terms

- Owner: the agent that wrote a stretch of the plan and alone fixes it, `plan-architect` for the specification half and the shared contract blocks, a `plan-author` for its tasks and the blocks of its slice. A fix is a new dispatch of the owner on `mode: fix`.

## Contracts

- Carrier rule: the planning agents hold no `Bash` (`plan-surveyor` `Read, Grep, Glob, Write`; `plan-architect` and `plan-author` add `Edit`; `plan-judge` `Read, Write` alone, so it can search no code) and write their result to the plan file the plan-mode notice names as theirs, with no such notice to their `out:` path, and to no other file. The reply is `OUT: <the path written>` on its own line, then the `VERDICT:` line (`MAPPED` for the surveyor, `WRITTEN` for the architect and an author, `FIXED` for either on `mode: fix`, `PASS` or `FAIL` for the judge), and nothing else.
- A reply with no file: `plan-architect` and `plan-author` owing the user a decision on a writing dispatch reply `DECIDE: <decision> | <recommended option> | <option> | <option>` lines, then `VERDICT: DECIDE`; on `mode: fix` a problem only the user can decide is an `unfixed:` line of the fix file, never a `DECIDE:` reply. `plan-judge` with nothing to report replies `VERDICT: PASS` alone.
- Every planner dispatch block opens on `plan: <plan path>`: `scripts/run-summary.sh` counts a planning transcript only when its prompt names that path, so `plan-surveyor` carries the line without reading it.
- One rule decides what is critical: the plan contradicts the input (or an `Answered:` line), or a coder cannot resolve the problem without changing a `DoD` clause, a `## Contracts` block or a file outside its task's `Files`. `plan-judge` holds it in `## Judge` and reads the plan and the input alone, no code and no rule file; `outside-plan-review` holds it in `## Calibration` against the stated goal and keeps its broad code exploration. Everything else is a `NOTE:` line or nothing, and the second review reads only what the fixes changed.

## Commands

- `node --test tests/viber/planner-agents-prose.unit.test.ts tests/viber/planner-blocks.unit.test.ts` after a planning agent's `## Input`, `tools:` or output lines change.

## Change together

- The labels of a planning block (`plan:`, `refs:`, `templates:`, `memory:`, `mode:`, `slice:`, `brief:`, `outline:`, `slices:`, `reach:`, `candidates:`, `decisions:`, `notes:`, `findings:`, `gaps:`, `round:`, `changed:`, `out:`, `input:`): the `## Input` of the four planning agents and `lib/plan-build.ts`, which prints them (the header of `skills/planner/scripts/plan-build.ts` lists them per agent); `skills/planner/SKILL.md` appends the `add:` texts, and `tests/viber/planner-blocks.unit.test.ts` holds each block to its agent's `## Input`.
- The file each planning agent writes, its format held by the agent file and by the command of `lib/plan-build.ts` that reads it: the outline (`plan-surveyor.md`, `outline`, read again by `plan-architect.md` and by a `plan-author.md` writing a whole plan), the frame file cut at `<!-- SLICES -->` and `<!-- DECISIONS -->` (`plan-architect.md`, `frame`), the author file cut at `<!-- NOTES -->` (`plan-author.md`, `assemble`, its `FACT:` lines the `notes:` input of that author's fix), the fix file of `@@ EDIT` blocks and `fix:`, `unfixed:`, `GAP:` and `OUTSIDE:` lines (`plan-architect.md`, `plan-author.md`, `apply`) and the judge file of `VERDICT:`, `CRITICAL:` and `NOTE:` lines (`plan-judge.md`, `judged`).
- The reach targets (a path, `<path> | <symbol>`, `<path> | new`) and the candidates and paths files `lib/reach.ts` builds from them: `plan-surveyor.md`, the header of `plan-build.ts`, the `reach:` and `candidates:` inputs of `plan-architect.md` and `plan-author.md`, and `## Reach` of a slice brief. A `| new` target reaches the candidates file alone and places nothing: `plan-author.md` searches itself only for a glob or count that does not name that directory.
- What `skills/planner/SKILL.md` appends to a fix block and an owner's `## Fix` reads: a `change:` block, the `records:` block of `skills/planner/references/adr-tasks.md`, whose `rules:` line names that file for its `## Record tasks` and `## Record shape`, and a `rejected:` block of the `FIX:` lines `apply` printed for its earlier fix file.
- The `FIX:` lines of a refused file: a `plan-build.sh` exit 4 prints them, `skills/planner/SKILL.md` appends them to the next dispatch of the same block, and `plan-surveyor.md`, `plan-architect.md` and `plan-author.md` each write the whole file again.
- The review output of a plan written outside the planner (`VERDICT:`, `CRITICAL:`, `NOTE:` as text): `outside-plan-review.md` and `hooks/content/plan-hints.md`, which tells the session what to do with each line. Its second dispatch adds the `CRITICAL:` lines of the first review and what was changed for each: the `## Input` of the agent, the hint and the `dispatch_with` text of `hooks/scripts/plan-gate.sh` name it alike.

## Traps

- `plan-surveyor`, `plan-architect`, `plan-author` and `plan-judge` each sit within 6 words of the cap `tools/lint/data/caps.ts` holds them to, `outside-plan-review` within 15: a word added fails the lint until the cap is raised on purpose.
- A planning agent in plan mode may write only the plan file the harness names for it, so its `out:` path under `.temp/viber/planner/` is used only outside plan mode: the session takes the path from the `OUT:` line, never from the block it sent.
- The negative list of `plan-judge` and `outside-plan-review` names no ordering or parallel-run concern on purpose: the plan proves no parallel safety, `Depends-on` is computed by `plan-build.sh` and the build schedules by script.
