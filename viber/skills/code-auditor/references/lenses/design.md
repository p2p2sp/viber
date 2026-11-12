# Design lens
Audits structure that makes change expensive: one piece of knowledge kept in several places, code that must change together but lives apart, abstractions that grew wrong, dependencies pointing the wrong way, decisions no unit test can reach, dead or drifted code, and breaks of the project's own written rules. A wrong result, crash or lost failure belongs to the bugs lens, an exploitable flaw to the security lens, a slow path to the runtime performance or web performance lens, and a weak or missing test to the tests lens. Every finding needs a concrete change scenario plus history evidence; a finding closable as "won't fix" at no argued cost is a nit and is never filed.

## Hunts
### knowledge-duplication
One fact (a business rule, file format, schema, constant, protocol step, validation) written in 2 or more places that must change together. Matching text alone does not count: the copies must hold the same knowledge. Name the fact in one sentence.

### change-preventers
Shotgun surgery (one change means edits across many files), divergent change (one file changes for unrelated reasons), god modules (large, high-churn, low cohesion), and complex hotspot functions: a function changed in 5 or more commits (`git log -L <start>,<end>:<file>`) that nests 4 or more levels deep or runs past about 80 lines. On the diff scope, a file that co-changed with a changed file in 5 or more commits at 50% or more, which the diff leaves untouched, is shotgun-surgery evidence; a partner that now misbehaves is a bugs finding. Start from the co-change and hotspot signals.

### wrong-abstraction
A shared helper that grew per-caller flags or branches, a shallow or pass-through module, callers depending on another module's internal format, an invariant that lives only in a comment.

### boundary-coupling
Imports against a declared layer or boundary (a project rule, an ADR, or a dependency-cruiser, import-linter, ArchUnit or eslint-plugin-boundaries config no CI step enforces) or from a high fan-in module onto a high-churn one; import cycles; code reaching into another module's internals; module-level mutable state written from 2 or more modules.

### dead-and-drifted
Exports nothing references, parameters or flags no caller sets, unreachable branches, comments contradicting the code, config keys or feature flags read in code but set to one value everywhere.

### rule-drift
A `CLAUDE.md`, `.claude/rules` file, ADR or CONTRIBUTING file says X and the code does Y in several places. Only an explicit written rule qualifies; quote it.

### untestable-decisions
A decision (a branch, a rule, a calculation, a validation) written inside code that reaches a database, queue, broker or network, so a test reaches it only through the real dependency or a chain of doubles. Name the decision and the function over plain values that would hold it.

## Excluded
- Style, formatting, naming taste, anything the project's own linter, formatter or compiler configuration already enforces.
- In diff scope: old code the diff does not touch, unless it blocks the change (a variant-wave hunt excepted); citing untouched code as the other copy of a duplication the diff adds is in scope.
- "Could be more SOLID", "consider extracting", "for extensibility" without a concrete pain.
- An abstraction for code in only 2 places with no co-change history.
- A finding contradicting the repository's documented conventions (a rule that plugins are self-contained makes cross-plugin copies deliberate).
- Generated, vendored, lockfile, fixture and migration files.
- Test-only duplication, unless the tests encode production knowledge.

## Verify
Worktree: none

Nothing here is proven by running code. Refute the finding gate by gate from the repository and its git history; a failed gate is REFUTED unless stated otherwise.
1. Existence: every cited location exists at the cited lines and says what the finding claims.
2. Same knowledge: write the single fact all copies encode in one sentence. Copies that change for different reasons are coincidental: REFUTED.
3. Change scenario: one concrete, realistic change, ideally a past commit, needing edits in N places today and 1 in a fixed design.
4. Pain evidence, at least one: the pair co-changed in 3 or more commits at a coupling of at least 30%; a commit fixed one copy and missed another; the unit is a top-decile hotspot; the change scenario touches 3 or more files, each cited at file:line; the finding quotes a project rule verbatim with the lines breaking it.
5. Not deliberate: search `CLAUDE.md`, `.claude/rules`, ADRs and nearby comments for an intentional choice. An intentional one is REFUTED.
6. Fix economics: a concrete fix exists that touches fewer places than it saves and creates no wrong abstraction; one possible only as a per-caller flag or branch in shared code is REFUTED.
7. Scope of the gates: 2 and 6 bind knowledge-duplication and wrong-abstraction only. A dead-and-drifted claim passes 3 and 4 by a commit that edited the dead code or the contradicted comment after its last caller went (`git log -L <start>,<end>:<file>`), and first proves deadness against dynamic references too (strings, reflection, config, globs, plugin manifests). An import-cycle claim cites every edge at file:line. An untestable-decisions claim passes 3 by a change to the decision and 4 by its tests: only integration tests assert it, its unit test builds 3 or more doubles, or none asserts it.

Verdicts:
- VERIFIED: every gate passes.
- PARTIALLY VERIFIED: gates 1 to 3 pass but the pain evidence is weak; restate the corrected claim.
- REFUTED: a gate fails.
- INCONCLUSIVE: the finding rests on history evidence alone and that history is too thin (a shallow clone, squash-only merges, about 20 commits or fewer touching the unit), dead-code reachability depends on runtime dispatch grep cannot settle, or whether the pattern is deliberate depends on intent written down nowhere.

## Severity
Nothing is broken, so this lens caps at 6, at 8 only when history shows the flaw already caused a bug; a wrong behaviour seen now belongs to the bugs lens.
- 1-2: PARTIALLY VERIFIED only: real, local, pain evidence weak.
- 3-4: knowledge duplicated in 3 or more places, or co-change in 3 or more commits; every change costs N edits. A decision reachable only through the real dependency or 3 or more doubles.
- 5-6: a top-decile hotspot or god module, co-change in 5 or more commits at 50% or more, or a written project rule broken in several places.
- 7-8: a commit fixed one copy and a later fix had to patch another, or a fix commit names a defect the flaw invited.
