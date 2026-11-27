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
   - Second line: `Plan: <the path of the plan file>`, the path the `EnterPlanMode` notice names.
   - Then everything the conversation settled, one fact per line: the problem, every required behaviour and edge case, every decision, what was left out, what must keep working, outward-facing shapes, constraints, the files the conversation named, the failing test that proves a bug. Add nothing the conversation did not settle.
   - A fact the understanding lists under `Assumed`: one line `Assumed: <the fact>`. Never write one as a plain fact: a plain fact binds the build, an assumed one yields to a stage's goal.
   - The root cause of a bug: one line `Root cause: <the cause>`.
   - After the facts, one heading `## <n>. <goal>` per stage, numbered from 1 in order, and under it a line `Files: <paths, comma-separated>` only when the conversation named the files of that stage. Nothing else goes under a heading.
   - Each stage a part a sub-agent can finish and check alone, ordered so a stage needs only the stages before it. A plan that fits one stage gets one.
3. Call `ExitPlanMode`.
