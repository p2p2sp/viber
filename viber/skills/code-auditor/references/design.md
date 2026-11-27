# design

Structure that makes change expensive: one piece of knowledge kept in several places, code that must change together but lives apart, abstractions that grew wrong, dependencies pointing the wrong way, decisions no fast test can reach, dead or drifted code, breaks of the project's own written rules. Elsewhere: a wrong result, crash or lost failure (bugs), an exploitable flaw (security), a slow path (runtime-performance, web-performance), a weak or missing test (tests).

## Hunts

- `knowledge-duplication`: one fact (a business rule, file format, schema, constant, protocol step, validation) written in 2 or more places that must change together. Matching text alone does not count: the copies must hold the same knowledge.
- `change-preventers`: shotgun surgery (one change means edits across many files); divergent change (one file changes for unrelated reasons); god modules (large, high-churn, low cohesion); hotspot functions: a function changed in 5 or more commits (`git log -L <start>,<end>:<file>`) that nests 4 or more levels deep or runs past about 80 lines.
- `wrong-abstraction`: a shared helper that grew per-caller flags or branches, a shallow or pass-through module, callers depending on another module's internal format, an invariant that lives only in a comment.
- `boundary-coupling`: imports against a declared layer or boundary (a project rule, an ADR, or a dependency-cruiser, import-linter, ArchUnit or eslint-plugin-boundaries config no CI step enforces) or from a high fan-in module onto a high-churn one; import cycles; code reaching into another module's internals; module-level mutable state written from 2 or more modules.
- `dead-and-drifted`: exports nothing references, parameters or flags no caller sets, unreachable branches, comments contradicting the code, config keys or feature flags read in code but set to one value everywhere.
- `rule-drift`: a `CLAUDE.md`, `.claude/rules` file, ADR or CONTRIBUTING file says X and the code does Y in several places. Only an explicit written rule qualifies.
- `untestable-decisions`: a decision (a branch, a rule, a calculation, a validation) written inside code that reaches a database, queue, broker or network with no port between them, so a test reaches it only through the real dependency or a chain of doubles.

## Excluded

- Style, formatting, naming taste, anything the project's own linter, formatter or compiler configuration already enforces.
- "Could be more SOLID", "consider extracting", "for extensibility" with no concrete pain.
- A finding closable as "won't fix" at no argued cost.
- An abstraction for code in only 2 places with no co-change history.
- A finding contradicting the repository's documented conventions (a rule that plugins are self-contained makes cross-plugin copies deliberate).
- Generated, vendored, lockfile, fixture and migration files.
- Test-only duplication, unless the tests encode production knowledge.
- A wrong behaviour seen now (bugs).

## Proof

- Every cited location, quoted: it exists at those lines and says what the finding claims.
- One concrete, realistic change, a past commit where one exists, needing edits in N places today and 1 in a fixed design.
- Pain evidence, at least one: the places co-changed in 3 or more commits (`git log`); a commit fixed one copy and missed another; the change touches 3 or more files, each cited at file:line; a project rule quoted verbatim with the lines breaking it.
- Not deliberate: search `CLAUDE.md`, `.claude/rules`, ADRs and nearby comments. An intentional choice: drop the finding.
- `knowledge-duplication`, `wrong-abstraction`: the single fact all copies hold, in one sentence. Copies that change for different reasons are coincidental: drop the finding.
- `knowledge-duplication`, `wrong-abstraction`: a fix touching fewer places than it saves. One possible only as a per-caller flag or branch in shared code: drop the finding.
- `dead-and-drifted`: no reference left, dynamic ones included (strings, reflection, config, globs, plugin manifests). A commit that edited the dead code or the contradicted comment after its last caller went (`git log -L <start>,<end>:<file>`) is its change and its pain evidence.
- An import cycle: every edge cited at file:line.
- `untestable-decisions`: the decision, the port whose fake would let a component test reach it, and its tests: only integration tests assert it, its fast test builds 3 or more doubles, or none asserts it.

## Severity

Nothing is broken: at most 6, and 7-8 only when history shows the flaw already caused a bug.

- 7-8: a commit fixed one copy and a later fix had to patch another, or a fix commit names a defect the flaw invited.
- 5-6: a hotspot function or god module, co-change in 5 or more commits, or a written project rule broken in several places.
- 3-4: knowledge duplicated in 3 or more places, or co-change in 3 or more commits: every change costs N edits. A decision reachable only through the real dependency or 3 or more doubles.
- 1-2: real and local, with the 3-file change as the only pain evidence.
