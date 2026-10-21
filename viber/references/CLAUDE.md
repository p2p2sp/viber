# viber/references - shared rule and format references read at runtime

The ten markdown files viber skills and agents read by path while they work: the plan rules, the test rules, the TDD cycle, the admission gates for decision records and `.claude/rules/`, the node doctrine, the QA document formats, the issue save steps and the UI tells checklist. No script parses them: each is prose a model holds itself to, so its wording is its contract. Skill-private references live under `skills/<skill>/references/`, never here.

## Relationships

- A skill reads a file as `${CLAUDE_PLUGIN_ROOT}/references/<file>`; an agent reads it as `<refs>/<file>`, `refs:` being the `${CLAUDE_PLUGIN_ROOT}/references` line its dispatching skill passes.
- Readers per file:
  - `plan-rules.md`: `planner` (every round, a draft included) and `planner-review`, whole; of the review set, `planner-spec-review` reads `## Spec` and `## Contracts`, `planner-graph-review` `## Graph`, `planner-task-review` `## Task`.
  - `integration-tests.md`: `planner`, `planner-review` and `planner-task-review` when the plan carries an integration test; `task-coder` and `task-reviewer` on a task writing or running one or building the shared harness.
  - `test-strategy.md`: `task-coder` before its first test, `task-reviewer` when the work touched tests or a fixture, `fixer` before writing its reproduction test.
  - `tdd.md`: `task-coder` on a `TDD: required` task, before its first line of production code.
  - `qa-format.md`: `qa-writer` (writes `qa.md` and `qa.e2e.md`) and `e2e-writer` (reads one entry, writes its `## Automation` line).
  - `adr-admission.md`: `adr-screener`, dispatched through `skills/planner/references/adr-tasks.md` when `planning.adr` is on.
  - `rule-admission.md`: `rules-writer` and `rules-auditor`.
  - `node-doctrine.md`: `memory-writer`, `memory-node-writer` and `memory-auditor` (its `## Template` part, for `SHAPE` findings).
  - `ui-tells.md`: `task-coder` and `task-reviewer` on a task whose `Files` render or style an interface; the short form of `skills/pro-designer/references/anti-slop.md`, which `pro-designer` reads in full.
  - `issue-save.md`: `issue-create` and the fragments `skills/fixer/fragments/issues-save.true.md` and `skills/intent/fragments/issues-done.true.md`, each passing `directory:`, `eligible:` and `content:` (an issue set: `parent:` and `parts:` in place of `content:`).

## Contracts

- `plan-rules.md` tags every rule: `(script)` is a rule `scripts/plan-index.sh` rejects, `(review)` one a plan reviewer gates clause by clause and reports under the rule's name. A rule tagged `(script)` with no matching check in `plan-index.sh` is enforced by nobody.
- A rule ending in `(blocking)` in `test-strategy.md` or `integration-tests.md` is a Blocking finding for `task-reviewer`, `planner-review` and `planner-task-review` and binds `task-coder` and `fixer`; an untagged rule is guidance only.
- `plan-rules.md` sits in four `## ` sections by role, `Spec`, `Graph`, `Task`, `Contracts`: a review-set agent reads one by the `## ` line numbers it greps, so a rule belongs to the section of the role that gates it, and a section renamed breaks those reads. The plan-wide clauses moved out of `## Task` live in `Graph`'s `Sequenced`.
- `plan-rules.md`'s `Memory-owned` rule reads the `build.memory` switch, which `planner-review`, `planner-graph-review` and `planner-task-review` receive as their `memory:` line (`false` when missing).
- `issue-save.md` consumes the `STATUS=ready` block of `scripts/issue-templates.sh` and calls `scripts/issue-create.sh` as one literal line, reading its exit codes 0, 1, 2 and its `TYPE=dropped|error` and `PARENT=error` lines. Every preview shows the path of a body file already written, never the body text.

## Change together

- Memory budgets (4000 root, 12000 per node and section, 32000 per chain): `node-doctrine.md`, `skills/memory/scripts/memory-map.sh` (`ROOT_BUDGET`, `NODE_BUDGET`, `CHAIN_BUDGET`), `skills/memory/SKILL.md`, `agents/memory-node-writer.md` (the root's 4000), `README.md` and `tests/viber/memory-map.test.ts`.
- The test layers are defined in parallel wording in `plan-rules.md` (`Layers`, `Layered`, `Shared harness`, `TDD`), `test-strategy.md` (unit and component) and `integration-tests.md` (integration); `PRODUCT.md` names the same four layers.
- The end-to-end rule (written only when the user asked in their own words, run only when they asked for a run, except an existing spec whose selector a task changes, which joins that task's `Files`, is type-checked or listed plus a grep of the new selector on both sides and never run): `plan-rules.md`'s `End-to-end`, `Layers`, `TDD`, `Owned`, `test-strategy.md`'s first `(blocking)` rule, `skills/planner/SKILL.md`, and the `Grounded` check of `planner-review` and `planner-task-review`, which search the end-to-end specs for the selectors of every component a task changes.
- `plan-rules.md`'s `Provable` rule bars a `Verification` running inline interpreter code or a `.temp/` script: the coder's `shell-guard.sh` (R5) refuses both.
- `issue-save.md` step 6 and the argv and exit contract in the header of `scripts/issue-create.sh`.
- `ui-tells.md` and `skills/pro-designer/references/anti-slop.md` keep the same `##` sections; `ui-tells.md` stays within 4096 bytes and names nothing of pro-designer's context (`tests/viber/ui-tells.unit.test.ts`).
- `qa-format.md`'s `qa.e2e.md` headings and `## Automation` lines and the ID handling of `skills/e2e/SKILL.md`, which lists IDs from `## UI scenarios` / `## API scenarios` and skips `## Not automatable`.

## Traps

- `plan-rules.md` carries some rule names twice (`Exclusive`, `Reproduced`, `Block body`): one half `(script)`, the other `(review)`. Editing one never removes the other.
- Every reader loads a file whole on each dispatch, `plan-rules.md` (the largest) on every planner round and single review: a sentence added here is paid on every run.
