---
paths:
  - "viber/scripts/*.sh"
  - "viber/hooks/scripts/*.sh"
  - "viber/skills/*/scripts/*.sh"
---

# Normalize a leading ./ once

- Strip a leading `./` from a path exactly once at every site that compares one path against
  another - `${f#./}` in bash, `sub(/^\.\//, "", p)` in awk - never a repeated or looped strip.
  `viber/scripts/commit-task.sh`'s `claimants()` needs it on a plan `Files:` entry: spelled
  `./src/a.ts` there and unstripped, it never matched a later `--with src/a.ts` ownership check,
  so an open task's file could be silently claimed into another task's commit instead of being
  refused. The same single-strip contract runs in `viber/scripts/plan-index.sh:420` and
  `viber/scripts/archive-run.sh:113`.
