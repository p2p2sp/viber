---
name: fixer
description: Traces a reported bug to its root cause and proves it with a failing test, then hands the diagnosis to the planner - it applies no fix itself. Use whenever the user reports a bug and wants to fix it. Not for a fix the user asked to apply directly, without a plan.
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

**3. Never apply the fix here.** Edit nothing but the reproduction test, and temporary instrumentation of production code only when reading the code cannot state the actual value (timing, environment, persisted state), each instrumentation edit reverted through `Edit` before the handoff. The fix is built through `viber:planner` -> `viber:implementor`. "It is trivial" and "it is one line" are the same violation.

## The Process
1. Resolve the report (below).
2. Trace per Law 1 to the confirmed divergence.
3. Write the reproduction test and see it RED (below).
4. Write up the diagnosis (below) from the confirmed root cause, after you search the repository for each other place repeating the root cause's pattern beyond the reported one.
5. Settle the open choices with the user through one `AskUserQuestion` before handing off: the fix approach when more than one is defensible, and which listed `Same defect elsewhere` places enter the plan - inside that `AskUserQuestion` when the fix-approach one is asked, as its own `AskUserQuestion` otherwise; past four places it offers all of them or none and takes the places a free answer names; no place question when the field reads `none`. Then write each place's `picked` or `not picked` mark from the answer.
6. Hand off (below).

## Tracing checks
Apply these inside Law 1.
- **Shared premise** - two hypotheses refuted by the same check share a premise: write it in one sentence and check it directly before a third hypothesis.
- **Legitimate state** - at the divergence, decide whether the state reaching it is legitimate. Legitimate: the code breaking on it is the root cause. A state that should never exist: the root cause is the place producing it, and a guard at the symptom is no fix direction.
- **Used to work** - when the report says the behaviour used to work, find the commit that introduced the divergence through `git log -L` over the diverging symbol, or `git bisect` only on a tree with no uncommitted change, ended on `git bisect reset`. The diagnosis names that commit.

## Instrumentation
Apply these around every edit.
- **Record** - before your first edit run `"${CLAUDE_SKILL_DIR}/scripts/tree-record.sh" --save`: its `recorded:` paths are the record.
- **Instrument** - only per Law 3, never a file already changed in the record.

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
- Passes immediately? The diagnosis is wrong or the test misses it. Return to step 2 - never weaken the assertion to force a failure. Reproduction genuinely infeasible -> Bypass authorization below.
- The test stays in the repo, RED, as the handoff evidence and the regression guard afterwards.
- It opens with a header comment of at most 5 lines: root cause as file + symbol, actual vs expected at the diverging step, fix direction. Nothing else goes in.

## Bypass authorization
The reproduction test is unconditional. When reproduction is genuinely infeasible (hard race, rendering artifact, unreachable third-party state), stop and ask the user through one `AskUserQuestion` for explicit authorization to hand off without it, stating what blocks reproduction: `Authorize` or `Keep trying`. `Keep trying` -> return to step 3. Never decide this alone; "hard to test" is not infeasible.

## The diagnosis
The handoff payload - state it in context, in this order. No report file: the part worth keeping already rides in the reproduction test's header.
- **Root cause** - file + symbol, the diverging step, actual vs expected state at that step, and the introducing commit when the behaviour used to work.
- **Symptom link** - how that divergence produces what the user reported.
- **Reproduction test** - its path, the exact command that runs it, and the RED output observed. It is already in the tree; the fix must turn it GREEN, not rewrite it.
- **Fix direction** - which symbol changes and to what behavior. Name symbols, never line numbers.
- **Blast radius** - other callers or behavior that depend on the current (wrong) behavior.
- **Same defect elsewhere** - each other place repeating the root cause's pattern, one `<repo-relative path> | <symbol> | picked` or `<repo-relative path> | <symbol> | not picked` per place; `none` when no place repeats it. Only a `picked` place enters the plan.
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
Run `"${CLAUDE_SKILL_DIR}/scripts/tree-record.sh" --check "<reproduction test path>"`. On `STOP:`, stop, naming each `path:` line's path and leaving every recorded path untouched. On `NEXT: handoff`, invoke the `viber:planner` skill, restating every part of the diagnosis verbatim in that invocation. Stop there.
