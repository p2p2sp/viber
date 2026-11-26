---
paths:
  - "viber/docs/configuration.md"
---

# Update the switch-count sentence with every switch add or remove

- A new (or removed) config switch changes the count named in the "N of M on" summary sentence in
  `viber/docs/configuration.md`'s "Switches" section (now "seven of the ten on and `build.qa`,
  `github.issues` and `build.baseline-tests` off"). That line is never listed in a task's own
  Delivers/DoD, so it goes stale silently unless read and fixed by hand. Name each switch by its
  group (`build.qa`).
