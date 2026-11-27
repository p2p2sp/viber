---
name: simple-plan
description: Run only by the intent and fixer skills.
allowed-tools: EnterPlanMode, ExitPlanMode, Write
---

# simple-plan

Hand the confirmed understanding to a fresh context as a plan. Plan mode's own workflow does not apply: read no file, dispatch no agent, ask nothing.

1. Call `EnterPlanMode` unless plan mode is already on.
2. Write the plan to the plan file. It is all `simple-implementor` will know:
   - First line: `Invoke the viber:simple-implementor skill to implement this plan.`
   - Then everything the conversation settled, one fact per line: the problem, every required behaviour and edge case, every decision, what was left out, what must keep working, outward-facing shapes, constraints, the files the conversation named, the root cause of a bug, the failing test that proves it. Add nothing the conversation did not settle.
3. Call `ExitPlanMode`.
