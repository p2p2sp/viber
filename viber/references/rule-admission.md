# Rule admission

The gate every convention passes on each way into `.claude/rules/`, a new file or a line added to an existing one, and again whenever an existing line is audited. It settles admission and nothing else: what an admitted rule then says, how narrow its `paths:` globs are and what the directory can still afford are decided where the rule is written.

## The three criteria

All three hold, or the candidate is not a rule.

1. The pattern recurs in at least three different files, and the candidate carries one of them as the real example that proves it: the file and the line where the project already does it this way. Fewer is a choice made once or twice, and a pattern nobody can point at is a preference.
2. The rule is a delta from what a competent developer joining this project would have written anyway. A sentence such a developer would have followed without reading it costs context on every task that loads the rule and buys nothing back.
3. Nothing else already enforces it. Where a formatter, a linter, a compiler, a type, a schema, a validation or a test fails on the violation, that tool is the enforcement and the rule is a second source of truth that drifts on its own.

## Calibration

At most two new conventions per run, a new file and a line added to an existing rule each counting as one. Zero, one or two is the ordinary outcome; several candidates standing at once is the signal that the bar slipped, not that the project grew several conventions at the same time: keep the two with the strongest evidence in the code and drop the rest.

## Never a rule

- Formatting a formatter owns: indentation, quote style, line width, import order, trailing commas.
- Naming a type, a schema or the compiler enforces.
- Anything visible from one look at the directory: the layout, where the tests live, what a folder is called.
- A convention that binds everywhere anyway: the language's own idiom, the framework's documented default, what every project in the ecosystem does.
- A preference stated in a plan, an interview or a review and never carried into the code.
- A fact about one place: a command, a tool's quirk, one module's API or invariants, a trap met once (a race, a flaky interaction). It belongs to the `CLAUDE.md` node over that place, whatever the node holds today.
- Anything a `CLAUDE.md` node over the rule's scope already states.
- History: what a convention replaced, a rename, a migration, what the code used to do. A rule says only what holds now; git and the project's ADRs carry the rest.

## The silent drop

A candidate failing one criterion leaves no trace. No message to the user, no line in a findings file, no note that it was considered and rejected. A dropped candidate reported anyway costs the same reading as the rule it failed to become, and pays nothing back.

An existing line failing the gate is the exception: it is reported, because every task its rule loads on already pays for it in context.
