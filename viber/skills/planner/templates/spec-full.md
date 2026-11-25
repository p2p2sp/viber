---
source: <absolute path of THIS plan file, the one plan mode named, forward slashes only (a Windows drive as C:/)>
issue: <full issue URL the run is tied to; drop the line otherwise>
attachments:
  <name>: <absolute path from one of the input's Attachment: lines; one entry per line, drop the whole block when the input has none>
---

To build this plan you must invoke skill `viber:implementor` with `source:` path as its only argument.

# <change title>

## Goal

<2-4 sentences: what gets built and why. No description of the solution.>

## Problem

<What breaks or is missing today, and for whom. The cost of leaving it alone.>

## Current behaviour

<How the area behaves today, in plain language. "Nothing yet" for a new capability.>

<!-- Every line under the next heading travels into EVERY task file, so it is a
     coder's standing boundary rather than a wish: name only behaviour this
     plan's own file map could break, and keep the list short. -->

### Must not change

- <behaviour that already works and has to keep working>

## Phases

<!-- Only when the change was split into phases; otherwise drop this section.
     The build cuts it into phases.md, never into spec.md. Every later phase
     lists the decisions settled for it as indented lines; a plan continuing
     the list marks the earlier phases (built) and moves its own phase's
     decisions into its specification. A phase that has an issue carries
     `   - Issue: <full issue URL>` as the first indented line under it, before
     its decisions; a phase with none carries no such line. -->

Phase <n> of <N> - <this phase>

1. <phase> (built)
2. <phase> (this plan)
   - Issue: <full issue URL of this phase's sub-issue>
3. <phase>
   - Issue: <full issue URL of this phase's sub-issue>
   - <decision settled for this phase>

## Behaviour

<!-- One block per scenario worth proving. Tag a scenario that touches an existing
     capability: [NEW], [CHANGED - was: <what it did>] or [REMOVED - reason: <why>].
     An untagged block is new behaviour in a new area. -->

### S1 - <scenario title> [NEW]

<What happens, in plain language, from the outside.>

Given <the starting situation>
When <what the actor does>
Then <what they observe>

### S2 - <scenario title> [CHANGED - was: <old behaviour>]

<...>

Given <...>
When <...>
Then <...>

### Edge cases

- <the unusual input, the empty case, the limit> -> <what happens>

## Glossary

<!-- Only the terms this change introduces or redefines, one line each, in plain
     language. A term a coder has to name in the code gets its own "## Contracts"
     block as well - the glossary is for shared understanding, the contract is
     what reaches a coder. -->

- <term> - <what it means here, and what it is not>

## Root cause

<!-- Only when the input is a `viber:fixer` diagnosis, code-auditor findings
     (`.temp/viber/code-auditor/`) or an input carrying a `Root cause:` line; drop this
     section otherwise. 1-3 sentences: the cause of the defect, not its symptom, as the
     diagnosis, finding or `Root cause:` line states it. -->

<why the defect happens>

## Acceptance criteria

1. <observable condition that can be checked>
2. <...>

## Scope

### File map

- add | modify | delete - <path> - <what this file owns>

### Out of scope

- <what this change does not touch>

## Solution requirements

- <what binds the solution: compatibility, data, performance, a deadline>
