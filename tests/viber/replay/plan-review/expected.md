# Expected results of the plan review replay

Each plan section holds the `input:` summary its `planner-review` dispatch carries, the planted defects a
reviewer must report, and the reach references `impact-mapper` must return. A run passes only when every
defect and every reference of its plan is reported; extra findings and extra `REF:` lines never fail it.
Line numbers are those of the plan's tree (`README.md` pins it) and may drift by a line or two.
After the release, the `candidates:` file `reach.sh` writes for a plan's targets lists the file of each reference below as a candidate line, so `impact-mapper` keeps it from there.

Defect format: `<id> | <rule a reviewer reports it under> | <where> | <what is missing>`.
Reference format: `REF: <path>:<line> | <kind> | <target as written>`, the kind being any that fits.

## plan-a.md

Tree: the parent of `7325c99c`, `b1d9eb5d`.

input:
```
# Four diagnosis and enforcement practices taken from pstack into viber

Goal: Give viber four working practices that pstack (github.com/cursor/plugins, `pstack/`) carries and viber lacks: sharper bug diagnosis in `fixer` and in a retrying `task-coder`, a proposal for an enforcing check instead of a prose rule in `/viber:rules`, a pinned behaviour for a refactor task, and a repository-wide proof for a mechanical change spread over many files.

Acceptance criteria:
1. `fixer` writes down and directly checks the premise shared by two hypotheses refuted by the same check before forming a third.
2. `fixer` decides whether the state reaching the divergence is legitimate and places the fix direction by that decision, never on a guard at the symptom.
3. `fixer` finds the change that broke a behaviour the report says used to work, through `git log -L` or `git bisect`.
4. `fixer` may add temporary instrumentation to production code only when reading the code cannot give the actual value, the session manifest allowing it, and hands off only when `git status` shows no path changed since it started but the reproduction test.
5. The `fixer` diagnosis carries a `Same defect elsewhere` field, and the user picks which of its places enter the plan before the handoff.
6. On a retry of a task, `task-coder` writes the premise its failed earlier attempt and a red round of its own share on the same check into its notes and checks it directly before the next fix.
7. `rules-auditor` returns an `ENFORCE:` proposal naming the check for a new candidate a lint rule, a type or a test could enforce, with no rule and no code written for it, and `/viber:rules` reports that line; `rule-admission.md` states the exception.
8. `plan-rules.md` makes a behaviour-preserving restructuring task `TDD: none`, pinned by its existing tests or by a characterization test it writes first.
9. `plan-rules.md` proves a mechanical change across more than five files with a grep for the old form, on the last task carrying it, over every tracked file outside the run and archive directories and, with `build.memory` on, outside the `CLAUDE.md` nodes.
10. The help page (both languages) and `docs/viber-functions.html` describe the `fixer` place choice and the `rules` check proposal.

Must not change:
- Every sentence an existing `tests/viber/*-prose.unit.test.ts` pins stays word for word, except the cap lines this plan names.
- The `AUDIT:` line shapes of `rules-auditor` and the findings-file vocabulary `rules-writer` reads.
- The verdict `rules-auditor` gives an existing rule line it audits.
- The `RED:` and `red-check:` contract and `hooks/scripts/shell-guard.sh` rules R1 to R5.
- A `fixer` handoff still leaves no change of its own in the tree but the RED reproduction test, and never touches a path that was already changed before it started.
- The `task-coder` and `planner` read sets of `tests/viber/rule-budget.unit.test.ts` stay within their present caps.
```

Defects:

- A1 | Reach | `### Out of scope` and every task `Files` | `viber/skills/planner/SKILL.md`, `viber/skills/intent/SKILL.md` and `viber/hooks/scripts/plan-hints.sh` name `viber:fixer` and its diagnosis (the planner reads the picked places of the diagnosis text, a caller of the changed `fixer` diagnosis), yet sit in neither a task's `Files` nor `### Out of scope`.

Reach targets:

- Target `viber/skills/fixer/SKILL.md | viber:fixer`:
  - REF: viber/skills/planner/SKILL.md:15,21,57 | string | viber/skills/fixer/SKILL.md | viber:fixer
  - REF: viber/skills/intent/SKILL.md:3 | string | viber/skills/fixer/SKILL.md | viber:fixer
  - REF: viber/hooks/scripts/plan-hints.sh:11,37,79 | string | viber/skills/fixer/SKILL.md | viber:fixer
  - REF: viber/agents/planner-review.md:19 | documentation | viber/skills/fixer/SKILL.md | viber:fixer
  - REF: viber/agents/planner-spec-review.md:19 | documentation | viber/skills/fixer/SKILL.md | viber:fixer
  - REF: viber/agents/adr-screener.md:22 | documentation | viber/skills/fixer/SKILL.md | viber:fixer

## plan-b.md

Tree: the parent of `9aaa056b`, `7eaadf7c`.

input:
```
# Token report, re-review from earlier findings and a continuation sentence in viber builds

Goal: Make a finished viber build say how many tokens its agents spent, by role and model, so the tier policy and the review waivers can be judged on numbers. Make the second and later review rounds of a task start from the findings of the round before, so a failed round costs less. Make the close of a roadmap part say outright that the work continues, so a person or a supervising session does not read the build as the end.

Acceptance criteria:
1. The build summary written to `outcome.md` carries the tokens the run's agents spent, one line per agent role and model with input, output, cache read and cache write counts, summed by a script over the agent transcripts of every session whose first prompt names the run directory; it reports tokens only, no price, and no `.claude/viber.yml` key turns it on or off.
2. The token report ends on one line saying what is not counted, the main session first; when the transcripts cannot be read the report is one `tokens: unavailable` line and the build closes as it does today.
3. From its second round on, a task's reviewer gets the path of the previous report and first checks each of its Blocking findings against the code: one still standing ends the round on `VERDICT: FAIL` with those findings alone and no full gate, and with all of them fixed the full gate runs as today. The reviewer stays a fresh agent in every round.
4. With a further roadmap part left, both close forms print one sentence telling the reader to continue the work right before the `/viber:intent <path>/roadmap.md` or `/viber:intent <dir>/roadmap.md` line; with no further part, and on the screen form after `abort`, the sentence does not appear. Nothing starts by itself.

Must not change:
- Every sentence an existing `tests/viber/*-prose.unit.test.ts` pins stays word for word.
- The finding item format of `task-reviewer` (`- Blocking [<cause>] <path>:<line> - <what is wrong>`, `- Minor ...`) and its two severity levels.
- The archived close prints on screen only the lines it prints today plus the continuation sentence: no token line reaches the screen there.
- The order of the archived close: closing sentence, `/viber:rules extend` line, next-part command.
- The coder dispatch lines and what a coder receives after a failed review.
```

Defects:

- B1 | Reach | `### Out of scope` and every task `Files` | `.claude/rules/review-findings.md` names `viber/agents/task-reviewer.md` (its Calibration is quoted there) and `.claude/rules/shell-preload-contract.md` names `viber/skills/implementor/SKILL.md`; the plan changes both files and leaves both rules files in neither a task's `Files` nor `### Out of scope`.

Reach targets:

- Target `viber/agents/task-reviewer.md`:
  - REF: .claude/rules/review-findings.md:3,13 | rule | viber/agents/task-reviewer.md
  - REF: .claude/rules/viber/agent-review-color.md:10 | rule | viber/agents/task-reviewer.md
  - REF: docs/viber-functions.html:486 | documentation | viber/agents/task-reviewer.md
- Target `viber/skills/implementor/SKILL.md`:
  - REF: .claude/rules/shell-preload-contract.md:10 | rule | viber/skills/implementor/SKILL.md
  - REF: .claude/rules/viber/switch-fragments.md:11 | rule | viber/skills/implementor/SKILL.md

## plan-c.md

Tree: the parent of `f3bff883`, `18bcac81`.

input:
```
# Sharper plans and fewer wasted build attempts

Goal: Plans should pass their review in fewer rounds and builds should waste fewer coder attempts. The planner sees the code its change reaches, `plan-index.sh` rejects two mechanical plan mistakes, coders learn the test rules earlier tasks of the same run broke, a reviewer flags a whole class of a test-rule breach at once, a coder stalled on a contradiction gets the arbiter's ruling and continues, and the archive records the numbers that show whether it worked.

Acceptance criteria:
1. The planner maps the reach also of a change that only adds files, and `impact-mapper` returns implementers and subclasses of a changed type, the places constructing it, and the existing files that enumerate, count or link the set a new file joins.
2. `plan-index.sh` rejects a task writing a file under an integration test directory whose `Verification` has no build or listing step for it - no command other than a `grep`, `git grep` or `rg` naming the file or a directory of it at or below that test directory - and a task whose `Verification` runs `git grep` without `--untracked` over a file the task creates.
3. Every coder dispatched after a failed task review that named test-strategy rules, the final-review fix coder and the repair coder included, carries a `run-lessons:` line with those rules and their counts, printed by `run-failures.sh --lessons`; reviewers carry none.
4. `task-reviewer` names a test-strategy rule as test-strategy `<Name>`, lists in one finding every test the task wrote or changed that breaks that rule, and never keeps a test that breaks a rule it raised.
5. A `DECIDE:` on attempts 1 to 4 goes to the arbiter at once and the same coder is resumed with the ruling in the same attempt; the coder finishes every clause the dispute does not touch before returning `DECIDE:`.
6. The final summary, and so `outcome.md`, carries the plan review rounds, the attempts of every task needing more than one, and the number of rulings.

Must not change:
- The `- Blocking [<cause>] <path>:<line> - <what is wrong>` item line and its four causes, and the `failures.md` trail and its `failures:` line.
- `hooks/scripts/plan-gate.sh` and the rule that every review-set member passes after the last plan write.
- The repair pass: a `DECIDE:` there is never sent to the arbiter, and a failed repair pass goes to `case: cap`.
- The 5-attempt limit, the tier climb per attempt, and attempt 5 holding the task without an arbiter.
```

Defects:

- C1 | Reach | `### Out of scope` and the `Files` of T1, T2 and T6 | `.claude/rules/shell-path-strip.md` and `.claude/rules/shell-awk-quoting.md` name `viber/scripts/plan-index.sh` (and `shell-awk-quoting.md` names `viber/scripts/plan-path.sh`), both scripts changed by T1, T2 and T6; the rules files sit in neither a task's `Files` nor `### Out of scope`.
- C2 | Reach | `### Out of scope` and every task `Files` | callers and users of `plan-path.sh`, changed by T6 to write a `planned:` line into the landed copy: `viber/scripts/archive-run.sh`, `viber/scripts/red-check.sh`, `viber/scripts/run-branch.sh`, `tests/viber/commit-task.test.ts` and `tests/viber/plan-gate.test.ts` sit in neither a task's `Files` nor `### Out of scope`.
- C3 | Ordered | T7 `Depends-on` | T7 reads the `planned:` line of `plan.md` that T6 writes, and its `Depends-on` is `none`; it needs T6 among its dependencies.

Reach targets:

- Target `viber/scripts/plan-index.sh`:
  - REF: .claude/rules/shell-path-strip.md:15 | rule | viber/scripts/plan-index.sh
  - REF: .claude/rules/shell-awk-quoting.md:13 | rule | viber/scripts/plan-index.sh
- Target `viber/scripts/plan-path.sh`:
  - REF: .claude/rules/shell-awk-quoting.md:16 | rule | viber/scripts/plan-path.sh
  - REF: viber/scripts/archive-run.sh:33 | documentation | viber/scripts/plan-path.sh
  - REF: viber/scripts/red-check.sh:28 | documentation | viber/scripts/plan-path.sh
  - REF: viber/scripts/run-branch.sh:3 | documentation | viber/scripts/plan-path.sh
  - REF: tests/viber/commit-task.test.ts:85 | test | viber/scripts/plan-path.sh
  - REF: tests/viber/plan-gate.test.ts:83 | test | viber/scripts/plan-path.sh
