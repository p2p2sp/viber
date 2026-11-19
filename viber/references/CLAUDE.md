# viber/references - shared rule and format references read at runtime

The eleven markdown files viber skills and agents read by path while they work: the plan rules (review rules and scripted ones apart), the test rules, the TDD cycle, the admission gates for decision records and `.claude/rules/`, the node doctrine, the QA document formats, the issue save steps and the UI tells checklist. No script parses them: each is prose a model holds itself to, so its wording is its contract. Skill-private references live under `skills/<skill>/references/`, never here.

## Relationships

- A skill reads a file as `${CLAUDE_PLUGIN_ROOT}/references/<file>`; an agent reads it as `<refs>/<file>`, `refs:` being the `${CLAUDE_PLUGIN_ROOT}/references` line its dispatching skill passes.
- Readers per file:
  - `plan-rules-script.md`: `planner` alone; no planner reviewer reads it.
  - `plan-rules.md`: `planner` and `planner-review`, whole; of the review set, `planner-spec-review` reads `## Spec` and `## Contracts`, `planner-graph-review` `## Graph`, `planner-task-review` `## Task`.
  - `integration-tests.md`: `planner`, `planner-review` and `planner-task-review` when the plan carries an integration test or creates or changes an adapter; `task-coder` and `task-reviewer` on a task writing or running one, creating or changing an adapter, or building the shared harness.
  - `test-strategy.md`, read by range (`Grep` for the `## ` lines, then `Read` the section): `planner`, `planner-review` and `planner-task-review` `## Layers`, `## Proves` and `## Ports`; `task-coder` whole, before its first test; `task-reviewer` `## Layers`, `## Proves` and `## Writing` (plus `## Ports` when the task's `Files` hold a port, its fake or its contract test) when the work touched tests or a fixture, and `## Ports` alone when the work reaches an external dependency; `fixer` `## Layers`, `## Proves` and `## Writing` before its reproduction test; `hunter`, and `critic` on the tests lens, `## Proves` and the `Boundary` line, through the `Test rules:` line of their briefs.
  - `tdd.md`: `task-coder` on a `TDD: required` task, before its first line of production code.
  - `qa-format.md`: `qa-writer` (writes `qa.md` and `qa.e2e.md`) and `e2e-writer` (reads one entry, writes its `## Automation` line).
  - `adr-admission.md`: `adr-screener`, dispatched through `skills/planner/references/adr-tasks.md` when `planning.adr` is on.
  - `rule-admission.md`: `rules-writer` and `rules-auditor`; it bars a `.claude/rules/` line asking for a test `test-strategy.md`'s `(blocking)` rules forbid.
  - `node-doctrine.md`: `memory-writer`, `memory-node-writer` and `memory-auditor` (its `## Template` part, for `SHAPE` findings).
  - `ui-tells.md`: `task-coder` and `task-reviewer` on a task whose `Files` render or style an interface; the short form of `skills/pro-designer/references/anti-slop.md`, which `pro-designer` reads in full.
  - `issue-save.md`: `issue-create` and the fragments `skills/fixer/fragments/issues-save.true.md` and `skills/intent/fragments/issues-done.true.md`, each passing `directory:`, `eligible:` and `content:` (an issue set: `parent:` and `parts:` in place of `content:`).

## Contracts

- `plan-rules.md` holds only `(review)` rules, ones a plan reviewer gates clause by clause and reports under the rule's name; `plan-rules-script.md` holds every `(script)` rule, one `scripts/plan-index.sh` rejects with the `FIX:` text the rule quotes. A rule tagged `(script)` with no matching check in `plan-index.sh` is enforced by nobody, and a reviewer re-checking one is paid for nothing.
- A rule ending in `(blocking)` in `test-strategy.md` or `integration-tests.md` is a Blocking finding for `task-reviewer`, `planner-review` and `planner-task-review` and binds `task-coder` and `fixer`; an untagged rule is guidance only.
- `test-strategy.md` is the one definition of the test layers and of the tests that may be written: named rules (`Public`, `State`, `Source`, `Earned`, `Boundary`, `Ported`, `Proof`...) in the four `## ` sections `Layers`, `Proves`, `Ports`, `Writing`, which readers cite by name and read by range, so a renamed section or rule breaks those reads. `plan-rules.md` and `tdd.md` point at it and define none of it.
- `plan-rules.md` sits in four `## ` sections by role, `Spec`, `Graph`, `Task`, `Contracts` (`plan-rules-script.md` in the same four): a review-set agent reads one by the `## ` line numbers it greps, so a rule belongs to the section of the role that gates it, and a section renamed breaks those reads. The plan-wide clauses moved out of `## Task` live in `Graph`'s `Sequenced`.
- `build.memory` reaches `plan-rules-script.md`'s `Memory-owned` rule through `plan-index.sh`, which runs `config.sh` itself; `planner-review`, `planner-graph-review` and `planner-task-review` receive it as their `memory:` line (`false` when missing) only for `plan-rules.md`'s `Provable` grep exclusion and the graph reviewer's `Fix` check.
- `issue-save.md` consumes the `STATUS=ready` block of `scripts/issue-templates.sh` and calls `scripts/issue-create.sh` as one literal line, reading its exit codes 0, 1, 2 and its `TYPE=dropped|error` and `PARENT=error` lines. Every preview shows the path of a body file already written, never the body text.

## Change together

- Memory budgets (4000 root, 12000 per node and section, 32000 per chain): `node-doctrine.md`, `skills/memory/scripts/memory-map.sh` (`ROOT_BUDGET`, `NODE_BUDGET`, `CHAIN_BUDGET`), `skills/memory/SKILL.md`, `agents/memory-node-writer.md` (the root's 4000), `README.md` and `tests/viber/memory-map.test.ts`.
- The test layers: `test-strategy.md`'s `## Layers` defines them, `integration-tests.md` holds the integration layer's own rules, `plan-rules.md`'s `Layers`, `Layered`, `Observable`, `Owned`, `Shared harness` and `TDD` cite them by rule name; `PRODUCT.md` names the same four layers.
- The test rules (a use case's decisions are proven by a component test on fakes; every dependency sits behind a port with one fake and a contract test; an integration test is written in its task, never run there and run once by the final test run; one test per regression, none for a name or a data shape): `test-strategy.md`, `plan-rules.md`'s `Layered`, `Observable`, `Provable` and `TDD`, `integration-tests.md`, `tdd.md` (the cycle only), `rule-admission.md`, `agents/task-coder.md`, `agents/task-reviewer.md`, `agents/test-runner.md`, `agents/hunter.md`, the `over-mocking` and `wasteful-tests` angles of the `tests` lens, the `untestable-decisions` angle of the `design` lens, and the guides (`PRODUCT.md`, `README.md`, `help.html`); `tests/viber/test-pyramid-prose.unit.test.ts` pins the prose of the reference and agent files, `lenses.unit.test.ts` the lens angles, `rules-trail-prose.unit.test.ts` `rule-admission.md`.
- The read set of `planner` (`plan-rules-script.md` included), `planner-review`, `task-coder`, `task-reviewer` and `hunter` (their files plus the sections above): `tests/viber/rule-budget.unit.test.ts` caps each in bytes, so a line added to one of those files, or to a section they read, needs room there.
- `tests/viber/replay/done-clauses.md`: the sample of done clauses a plan reviewer and coder must report or pass, kept beside the `Observable` rule and `Proves` rules it exercises.
- The end-to-end rule (written only when the user asked in their own words, run only when they asked for a run, except an existing spec whose selector a task changes, which joins that task's `Files`, is type-checked or listed plus a grep of the new selector on both sides and never run): `plan-rules.md`'s `End-to-end`, `Layers`, `TDD`, `Owned`, `test-strategy.md`'s `Requested` rule, `skills/planner/SKILL.md`, and the `Grounded` check of `planner-review` and `planner-task-review`, which search the end-to-end specs for the selectors of every component a task changes.
- `plan-rules-script.md`'s `Provable` rule bars a `Verification` running inline interpreter code or a `.temp/` script: the coder's `shell-guard.sh` (R5) refuses both.
- `issue-save.md` step 6 and the argv and exit contract in the header of `scripts/issue-create.sh`.
- `ui-tells.md` and `skills/pro-designer/references/anti-slop.md` keep the same `##` sections; `ui-tells.md` stays within 4096 bytes and names nothing of pro-designer's context (`tests/viber/ui-tells.unit.test.ts`).
- `qa-format.md`'s `qa.e2e.md` headings and `## Automation` lines and the ID handling of `skills/e2e/SKILL.md`, which lists IDs from `## UI scenarios` / `## API scenarios` and skips `## Not automatable`.

## Traps

- `plan-rules.md` and `plan-rules-script.md` carry some rule names twice (`Title`, `Exclusive`, `Provable`, `Layered`, `Reproduced`...): one half `(script)`, the other `(review)`. Editing one never removes the other.
- `test-strategy.md` (6800 bytes, its `Layers` + `Proves` + `Ports` 4000) sits at its size cap in `test-pyramid-prose.unit.test.ts` and the `tests` lens at its 9000: a rule added to one needs another cut; `plan-rules.md` is capped there at 20900.
- Every reader loads a file whole on each dispatch, `plan-rules.md` (the largest) on every planner round and single review, `plan-rules-script.md` on every planner round: a sentence added here is paid on every run.
