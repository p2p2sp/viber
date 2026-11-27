---
name: fixer
description: Traces a reported bug to its root cause and proves it with a failing test, then hands the diagnosis to the planner - it applies no fix itself. Use whenever the user reports a bug and wants to fix it. Not for a fix the user asked to apply directly, without a plan.
allowed-tools: Read, Grep, Glob, Bash, Write, Edit, Skill
---

# Fixer

Run `ExitPlanMode` first, if plan mode is active.

Prove the reported bug with one failing test. Running this skill approves writing that test: edit no other file.

1. Find the root cause in the code. Ask the user only what the code cannot show.
2. Write one test in the project's test suite, at the lowest layer that shows the bug, asserting the expected behaviour.
3. Run it. Red is a failure on that assertion: fix a typo, import or harness failure and rerun.

## Not red

Delete the test, tell the user what you checked and why the bug is unproven, stop.

## Red

Tell the user in one sentence the bug, its root cause and the test's path, then invoke the `viber:simple-plan` skill. It carries as settled: the root cause, the test's path, the fix turns that test green without editing it.
