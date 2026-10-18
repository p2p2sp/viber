---
source: <absolute path of THIS plan file, the one plan mode named, forward slashes only (a Windows drive as C:/)>
into: <run key of the draft this round continues; drop the line otherwise>
issue: <full issue URL the run is tied to; drop the line otherwise>
attachments:
  <name>: <absolute path from one of the input's Attachment: lines; one entry per line, drop the whole block when the input has none>
---

To build this plan you must invoke skill `viber:implementor` with `source:` path as its only argument.

# <change title>

## Goal

<2-4 sentences: what gets built and why. No description of the solution.>

## Roadmap

<!-- Only when the change was split into parts; otherwise drop this section.
     The build cuts it into roadmap.md, never into spec.md. Every later part
     lists the decisions settled for it as indented lines; a plan continuing
     the roadmap marks the earlier parts (built) and moves its own part's
     decisions into its specification. A part that has an issue carries
     `   - Issue: <full issue URL>` as the first indented line under it, before
     its decisions; a part with none carries no such line. -->

Part <n> of <N> - <this part>

1. <part> (built)
2. <part> (this plan)
   - Issue: <full issue URL of this part's sub-issue>
3. <part>
   - Issue: <full issue URL of this part's sub-issue>
   - <decision settled for this part>

## Root cause

<!-- Only when the input is a `viber:fixer` diagnosis or code-auditor findings
     (`.temp/viber/code-auditor/`); drop this section otherwise. 1-3 sentences:
     the cause of the defect, not its symptom, as the diagnosis or finding states it. -->

<why the defect happens>

## Acceptance criteria

1. <observable condition that can be checked>
2. <...>

## Scope

### File map

- add | modify | delete - <path> - <what this file owns>

### Out of scope

- <what this change does not touch>
