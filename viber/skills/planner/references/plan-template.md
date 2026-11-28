# {{The change in a few words.}}

## Tasks

### T1 - {{Imperative title: what the task delivers. At most 64 characters: it is the subject of the task's commit.}}
Delivers: {{One behaviour a person can observe once the task is done. What, never how.}}
Covers: {{The `R<n>` and `D<n>` ids of the spec this task delivers, separated by commas.}}
Files: {{Every file the task creates, changes or deletes, its tests included, as whole repo-relative paths separated by commas: the coder touches no other file. `+<path>` for a file it creates, `-<path>` for one it deletes. A glob only for one mechanical change the code map gives as a group.}}
Blocked-by: {{`none`, or the ids of the lower-numbered tasks whose result this one needs to be built or verified.}}
TDD: {{`required` for a task that adds or changes a decision in the logic. Otherwise `none (<reason>)`: `no-runtime` (configuration, docs, a rename, scaffolding), `refactor` (the structure moves, existing tests pin the behaviour), `shape` (a type, a registration, a 1:1 mapping, a constant, an interface that only renders), `repro` (a bug fix whose failing test is already in the tree).}}
Tests: {{The highest layer the task writes or runs: `none`, `unit`, `composite` or `integration`. `integration` only for what the real dependency alone reveals: a query, a mapping, a constraint, a transaction, the wiring.}}
Seam: {{`<public entry the tests call> | <test file>`, from the tests map and the spec's Tests section, several test files separated by commas. `none` only where no test is written or run.}}
Hard: {{Conditional: delete the line on every other task. One line naming why the plan cannot settle this task's design: concurrency or ordering, security or cryptography, an algorithm whose correctness spans several modules, a migration of data in use.}}
UI: {{Conditional: only on a task that builds or changes what a user sees and covers no `R` naming `prototype.html`; delete the line on every other. The design references its surface needs, separated by commas: `accessibility`, `color`, `components-states`, `forms`, `layout-spacing`, `mobile`, `motion`, `saas-dashboards` (dashboards, tables, charts, app chrome), `tokens` (a token system of its own), `typography`.}}
DoD:
- {{One outcome a caller observes, false on the code as it stands, provable inside this task alone. Clauses in build order: on `TDD: required` one red-green cycle each, the main path first.}}
Verify: {{One bare command scoped to this task's tests, then ` => ` and the result that counts as proof. Never the whole suite.}}
