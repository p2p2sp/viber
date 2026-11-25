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
