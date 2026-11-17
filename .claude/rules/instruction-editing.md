---
paths:
  - "*/agents/*.md"
  - "*/skills/**/*.md"
  - "*/references/*.md"
---

# Extend an existing rule in place, not a new bullet beside it

- When a new requirement is a variant of a rule the file already states, extend that rule's own
  sentence naming the addition, instead of appending a separate bullet for it next to it: a new
  bullet is for a genuinely new rule only. `viber/references/plan-rules.md`'s `Ordered` bullet
  gained "Every route, symbol or file a task's `Verification`, `Delivers` or a done clause reads
  that another task creates or changes needs that task among its `Depends-on`, directly or
  through another" inserted into its existing sentence rather than as its own line, while the
  truly new requirements of the same change (`Consistent`, `Consumed after`) each became a new
  bullet.
