# Commit message

## Subject: `type(scope): description`

- `type`: one of feat, fix, refactor, docs, chore, test, by what the diff does.
- `scope`: one word naming the module or area (`auth`, `agents`). No single scope fits: drop the parentheses, never force one.
- `description`: imperative, lowercase, one line, no trailing period: what the change does, as a reviewer skimming `git log` reads it.
- Never write a body.

## Footer

- The context's "Issue footer" section holds `Resolves #N[, resolves #N]...` or `none`. Copy it verbatim, never derive a number.
- `Resolves` line: the message is the subject, one blank line, that line.
- `none`: the message is the subject alone.
