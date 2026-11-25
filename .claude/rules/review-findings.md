---
paths:
  - viber/agents/task-reviewer.md
  - viber/agents/task-coder.md
---

# Review finding severity

- A task review finding has two levels only, Blocking and Minor - never a third tier (no
  Critical/Important/Major, no other name). Blocking is a finding that would send the implementation wrong or stall it; that alone
  produces `VERDICT: FAIL`. Everything else is Minor and never fails a gate on its own.
  `viber/agents/task-reviewer.md`'s Calibration: "A finding is Blocking when it must change before
  this task can be committed, which alone produces FAIL; it is Minor otherwise, never fails the
  task on its own, and is written only into a report a Blocking finding already forces."
- A report is written, and its findings listed Blocking first then Minor, only when at least one
  Blocking finding exists. A Minor-only result never produces a report and never fails the gate.
- The repair coder's contract mirrors the gate's own vocabulary exactly rather than restating its
  own tiers: `viber/agents/task-coder.md` - "fix every Blocking finding at its stated location, and
  a Minor one only when the fix is trivial and local." Adding or renaming a level on one side
  without the other breaks that shared contract.
