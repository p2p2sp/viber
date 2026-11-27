---
paths:
  - "viber/skills/spec-implementor/scripts/lib/build-rules.ts"
  - "viber/skills/rules/scripts/lib/rules-run.ts"
---

# Rule matching

- `matchingRules` may read only `ctx.root`, `ctx.files()` and `ctx.fs.readText`: `rules-run.ts` calls it with a stub `Ctx` cast through `unknown`, so any other field fails at runtime there.
