# Conventional Commits - subject & footer authoring

## Subject - `type(scope): description`

- `type` ∈ {feat, fix, refactor, docs, chore, test} - match what the diff DOES.
- `scope` - one word naming the module or area, in parens (`auth`, `agents`). Drop the parens entirely when no single scope fits; a forced scope is worse than none.
- `description` - imperative, lowercase, one line, no trailing period; what the change does, the way a reviewer skimming `git log` reads it.
- Subject only by default. Add the footer only as below; never invent a body.

## Issue footer

The context's "Issue footer" section holds the footer line: `Refs: #N[, #N]...`, or `none`. Copy it verbatim, never derive or guess a number.

Put the footer inside the message string itself: subject line, one blank line, then the footer line. On `none` the message is the subject alone - never append an empty footer.
