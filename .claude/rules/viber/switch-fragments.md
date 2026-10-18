---
paths:
  - "viber/skills/*/SKILL.md"
---

# Preload a switch fragment where its text belongs

- Call `scripts/switch-text.sh` inline at the exact spot in the body where that switch's text
  belongs, never once at the top composing every fragment for the whole skill. `fixer/SKILL.md`
  preloads `issues-report` at "## Resolving the report" and a separate `issues-diagnosis` call
  further down at the diagnosis handoff payload; `triage/SKILL.md` makes three separate calls
  (`issues-read`, `issues-next`, `issues-publish`) at its three matching steps; `implementor/SKILL.md`
  calls `baseline-run` at the task dispatch step, and `parts/close.md` (printed on demand by
  `scripts/skill-part.sh`) calls `final-review`, `baseline-close`, `memory`, `rules`, `qa`,
  `extensions` and `cleanup`, each where its own text applies.
