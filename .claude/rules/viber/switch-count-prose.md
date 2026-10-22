---
paths:
  - "viber/docs/configuration.md"
  - "viber/skills/setup/assets/help.html"
---

# Update the switch-count sentence with every switch add or remove

- A new (or removed) config switch changes the count named in the "N of M on" summary sentence in
  both `viber/docs/configuration.md`'s "Switches" section (now "seven of the ten on and
  `build.qa`, `github.issues` and `build.baseline-tests` off") and `help.html`'s own summary
  paragraph in BOTH languages. None of these three lines is ever listed in a task's own
  Delivers/DoD, so they go stale silently unless read and fixed by hand. Name each switch by its
  group (`build.qa`).
