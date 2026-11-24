To build this plan you must invoke skill `viber:implementor` with `source:` path as its only argument.

# A bug-or-decision gate in the Earned rule and a final review that runs no tests

## Goal

A build still writes unit and component tests for trivial cases, because the `Earned` rule of `viber/references/test-strategy.md` is a list of banned tests that never says what counts as a decision in the logic, so a case missing from the list earns a test. The rule gains a gate a coder answers before writing a test and a criterion for plain code, and names what a static check of the stack already rejects, so the rule covers the unlisted case. The planner, the coder, the reviewers and the code auditor all read this one rule, so the wording changes in one place. A build also runs its build and tests twice at its end, because `final-reviewer` proves its findings by running them just before the final test run does the same, so the final reviewer stops running anything and judges by reading.

## Acceptance criteria

1. `Earned` asks for the bug a test would catch and gives no test where there is none, or where only a deliberate change (a constant, a default or a name) would fail it.
2. `Earned` gives plain code a test only where it validates, normalises, derives, enforces or has a side effect.
3. The never-tested list of `Earned` names what the compiler, type checker, linter or schema rejects, keeps framework or third-party library behaviour, an assertion true by construction, the shape of data, a count of fields, members or entries, a type's visibility or modifiers, an export, a registration and what a user interface renders, and no longer names a default value, accessors, trivial constructors, data holders without behaviour, 1:1 mappings or a name.
4. `viber/references/test-strategy.md` and every read set holding it pass the byte caps the tests hold today, none of them raised.
5. `tests/viber/replay/done-clauses.md` holds sample rows for a clause stating a constant's value (`read`), a clause asking for a test of a constant's value (`bad`), a clause stating what the compiler rejects (`read`) and a clause asking for a test of what the type checker rejects (`bad`).
6. `viber/PRODUCT.md`, `viber/README.md` and both languages of `viber/skills/setup/assets/help.html` name what the compiler, type checker, linter or schema rejects among what a build never tests.
7. `final-reviewer` runs no build, test, type checker or linter, not one file of them, in a slice review and in a recheck alike.
8. `final-reviewer` calls a finding Blocking on what the code it read shows, and counts a finding as fact only on code it read or a search it ran, never on a command it ran.

## Scope

### File map

- modify - viber/references/test-strategy.md - the `Earned` rule of `## Proves`: the gate, the plain code criterion and the never-tested list
- modify - tests/viber/test-pyramid-prose.unit.test.ts - pins the sentences of `Earned` word for word and the removed list entries as absent; its tests read the `## Proves` section of the shipped file as text
- modify - tests/viber/replay/done-clauses.md - the by-hand replay sample of done clauses, with rows for a deliberate decision and for what a static check rejects
- modify - viber/PRODUCT.md - the maintainer guide sentence on what a build never tests
- modify - viber/README.md - the usage guide sentence on what a build never tests
- modify - viber/skills/setup/assets/help.html - the same sentence of the help page, in English and in Polish
- modify - viber/agents/final-reviewer.md - the run ban of its opening paragraph and the two sentences of `## Calibration` on what makes a finding Blocking and what makes it a fact
- modify - tests/viber/final-review-prose.unit.test.ts - pins the run ban and the two calibration sentences word for word; its tests read the shipped agent file as text

### Out of scope

- `viber/references/plan-rules.md`: no rule added and no text changed. `Observable` keeps proving an outcome whose test `Earned` rules out by reading the code, which now reaches a done clause stating a deliberate decision. `TDD` keeps its own list of what a `TDD: none` task delivers, and `Mockup` keeps citing `Earned` by name.
- `viber/skills/code-auditor/references/lenses/tests.md`, `viber/skills/code-auditor/README.md` and `tests/viber/lenses.unit.test.ts`: unchanged. The `wasteful-tests` angle keeps ruling out a trivial test by `Earned` by name, and `hunter` and `critic` keep reading `## Proves` of `test-strategy.md`, so the new wording reaches an audit with no copy of it in the lens.
- Files that point at `test-strategy.md` or name `Earned` and restate none of its list keep pointing at it: `viber/agents/task-coder.md`, `viber/agents/task-reviewer.md` (which keeps `Earned` as an example of a rule label), `viber/agents/hunter.md`, `viber/agents/critic.md`, `viber/agents/test-runner.md`, `viber/skills/planner/SKILL.md`, `viber/skills/fixer/SKILL.md`, `viber/references/tdd.md`, `viber/references/rule-admission.md`, `viber/scripts/run-failures.sh`, `viber/skills/code-auditor/scripts/hunt-return.sh`, `viber/skills/code-auditor/scripts/keep-units.sh`, `tests/viber/e2e-prose.unit.test.ts`, `tests/viber/rules-trail-prose.unit.test.ts`. `viber/agents/planner-review.md` and `viber/agents/planner-task-review.md` keep citing `Observable`.
- `tests/viber/rule-budget.unit.test.ts`: its caps stay as they are. No byte cap of any test is raised.
- `tests/viber/replay/plan-review/plan-a.md`, `plan-b.md`, `plan-c.md` and `expected.md`, and every archived specification under `docs/specs/`: recorded, kept as recorded.
- Every `CLAUDE.md` and memory section file naming a file this plan changes (`viber/CLAUDE.md`, `viber/references/CLAUDE.md`, `viber/agents/CLAUDE.md`, `viber/agents/CLAUDE.task-flow.md`, `viber/skills/CLAUDE.md`, `viber/skills/CLAUDE.code-auditor.md`, `viber/hooks/CLAUDE.md`, `viber/scripts/CLAUDE.md`, `viber/scripts/CLAUDE.close-scripts.md`, `tests/viber/CLAUDE.md`, `viber/skills/idea-validator/CLAUDE.md`, `viber/skills/pro-designer/CLAUDE.md`): the build's close updates them.
- Files that link to or read other parts of `viber/README.md` or `help.html` keep what they do: the root `README.md`, `viber/docs/configuration.md`, `viber/docs/files.md`, `viber/skills/help/SKILL.md`, `viber/skills/setup/scripts/bootstrap.sh`, `.claude/rules/viber/switch-count-prose.md`, `tests/viber/bootstrap-fixture.ts`, `tests/viber/bootstrap.critical.test.ts`, `tests/viber/plan-gate.test.ts`, and the tests pinning other sentences of the guides (`close-part-prose`, `impact-mapper-prose`, `lessons-prose`, `ruling-prose`, `help`), which no task edits.
- A separate ban on a tautological test: `Earned` keeps "an assertion true by construction" and `Literal` keeps the literal expected value.
- A budget of tests per task, a mutation harness, the cycle of `viber/references/tdd.md`, and the integration and end-to-end rules.
- Measuring whether the gate lowers the number of tests a build writes: the first real build after the release shows it.
- Enforcing the run ban of `final-reviewer` in a hook: `viber/hooks/scripts/shell-guard.sh`, `viber/hooks/hooks.json`, `tests/viber/shell-guard.test.ts` and `tests/viber/shell-guard.critical.test.ts` keep refusing a reviewer only the four git subcommands, and the ban stays prose.
- `final-reviewer` keeps its `Bash` tool for read-only git and its `scope` line, its "Stop what you started" block word for word, its consumer search and its output lines. `tests/viber/guard-prose.unit.test.ts` and `tests/viber/failure-trail-prose.unit.test.ts` keep pinning its read-only git clause and its finding line.
- `viber/skills/implementor/fragments/final-review.true.md` keeps dispatching the final reviewer and the final test run after it as today, and `viber/.claude-plugin/plugin.json` keeps listing the agent.
- `viber/agents/task-reviewer.md` keeps running the `Verification` of its own task.
- The agent lines of `help.html`, `viber/skills/setup/assets/viber-flow-en.svg` and `viber-flow-pl.svg` keep saying what the final reviewer reviews: none says it runs a build or a test. `.claude/rules/viber/agent-review-color.md` keeps naming the agent as an example of its colour.
