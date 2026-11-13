---
name: fixer
description: Traces a reported bug to its root cause and proves it with a failing test, then hands the diagnosis to the planner - it applies no fix itself. Use whenever user reports a bug and wants to fix it. Not for a fix the user asked to apply directly, without a plan.
argument-hint: "[bug report, or an issue number/URL when github.issues is on]"
allowed-tools: Read, Write, Edit, Grep, Glob, Bash, Skill
user-invocable: true
disable-model-invocation: false
effort: high
---

# fixer

Every script run is one literal Bash line spelled as in this skill: never prefixed with an interpreter word, never assigned to a variable, never preceded by `cd`, never chained with `;`.

## The Iron Law

Three laws, in this order. None substitutes for another.

**1. Trace the entire code flow, step by step - no assumptions, no shortcuts.** Locate the entry point, follow execution line by line reading the code (never infer it), and at each step state the actual value, type or condition - never "should", "probably" or "likely". Stop at the first point where actual diverges from expected: that is the root cause, not the symptom. Confirm the divergence produces the reported symptom downstream. Symptom fixes are failure.

**2. No handoff without a failing test that reproduces the divergence.** Reading code proves what it says, never what it does. Until a test fails on the divergence found, the root cause is unconfirmed and the fix has nothing to verify it.

**3. Never apply the fix here.** Edit nothing but the reproduction test. The fix is built through `viber:planner` -> `viber:implementor`. "It is trivial" and "it is one line" are the same violation.

## The Process
1. Resolve the report (below).
2. Trace per Law 1 to the confirmed divergence.
3. Write the reproduction test and see it RED (below).
4. Write up the diagnosis (below) from the confirmed root cause.
5. When more than one fix approach is defensible, settle the choice with the user through one `AskUserQuestion` before handing off.
6. Hand off (below).

## Resolving the report
```!
"${CLAUDE_PLUGIN_ROOT}/scripts/switch-text.sh" github.issues "${CLAUDE_SKILL_DIR}" issues-report
```

```!
"${CLAUDE_PLUGIN_ROOT}/scripts/switch-text.sh" branching.""mode "${CLAUDE_SKILL_DIR}" branching-start
```

## The reproduction test
- Read `## Layers`, `## Proves` and `## Writing` of `${CLAUDE_PLUGIN_ROOT}/references/test-strategy.md` by range before writing it (`Grep` the file for its `## ` lines, then `Read` each section): every rule it marks `(blocking)` binds this test, and no later stage may change it.
- Write it in the layer `Proof` gives the diverging behaviour, never an end-to-end run of the symptom: it reaches the real dependency only where the diverging code has no port.
- **Actually run it - never simulate it mentally.**
- It must fail because the defect is present - not from a syntax error, missing import, typo, harness misconfig, or wrong fixture path.
- Passes immediately? The diagnosis is wrong or the test misses it. Return to step 2 - never weaken the assertion to force a failure.
- The test stays in the repo, RED, as the handoff evidence and the regression guard afterwards.
- It opens with a header comment of at most 5 lines: root cause as file + symbol, actual vs expected at the diverging step, fix direction. Nothing else goes in.

## The diagnosis
The handoff payload - state it in context, in this order. No report file: the part worth keeping already rides in the reproduction test's header.
- **Root cause** - file + symbol, the diverging step, actual vs expected state at that step.
- **Symptom link** - how that divergence produces what the user reported.
- **Reproduction test** - its path, the exact command that runs it, and the RED output observed. It is already in the tree; the fix must turn it GREEN, not rewrite it.
- **Fix direction** - which symbol changes and to what behavior. Name symbols, never line numbers.
- **Blast radius** - other callers or behavior that depend on the current (wrong) behavior.
- **Done condition** - repro test GREEN, every previously-passing test still green.
- **Spec shape** - `spec-lite`, always: a fixer diagnosis never proposes `spec-full`.
- **Attachments** - one line `Attachment: <absolute path, forward slashes, a Windows drive as C:/>` per path under the repository's `.temp/` that the input names; none when it names none.
```!
"${CLAUDE_PLUGIN_ROOT}/scripts/switch-text.sh" github.issues "${CLAUDE_SKILL_DIR}" issues-diagnosis
```

```!
"${CLAUDE_PLUGIN_ROOT}/scripts/switch-text.sh" branching.""mode "${CLAUDE_SKILL_DIR}" branching-handoff
```

```!
"${CLAUDE_PLUGIN_ROOT}/scripts/switch-text.sh" github.issues "${CLAUDE_SKILL_DIR}" issues-save
```

## Handoff [GATE]
Invoke the `viber:planner` skill, restating every part of the diagnosis verbatim in that invocation. Stop there.

## Bypass authorization
The reproduction test is unconditional. When reproduction is genuinely infeasible (hard race, rendering artifact, unreachable third-party state), stop and ask the user through one `AskUserQuestion` for explicit authorization to hand off without it, stating what blocks reproduction: `Authorize` or `Keep trying`. `Keep trying` -> return to step 3. Never decide this alone; "hard to test" is not infeasible.
