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
  holds "The last task carrying one mechanical change (a rename, a moved path, a changed call)
  across more than five files depends on every other task carrying it, so it names one file of
  each" inside its own bullet, as one more case of how a task gets behind another, while a
  requirement of its own (`Consistent`, `Supplied`) is a bullet of its own.
