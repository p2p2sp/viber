# Split a larger scope

Ask no detail question yet. Split it as a mechanical cut of that one specification - a phase is never a release, and size is the only reason to cut, never a theme, a milestone or a risky piece set apart. Every phase holds an estimated 8 tasks or more: merge a smaller one into its neighbour, and a split left with one phase is no split. Propose the split, one line per phase - what it owns, what it consumes from the ones before it, its estimated task count - plus the order, then ask through one `AskUserQuestion`: `Accept` or `Correct`, the correction typed in its free-text field. `Correct` with nothing typed -> ask in prose what to correct. Correct it until the user accepts it.

- Order the phases so each one consumes only what earlier ones produced. Two pieces that cannot be ordered that way are not independent and belong to one phase.
- A phase boundary is not a delivery. The cut exists only because one plan cannot hold the whole scope: nothing is published between phases, and the capability is finished only when its last phase is built. What a later phase brings is absent until its own build, never replaced by a stub, a mock, a hardcoded value or a temporary alternative, and no criterion may need a working application between phases. So never ask what works between phases, how to release or ship a phase, or what to use instead, and never let an answer invent one: the absence belongs in the boundaries, as out of scope.

Once the split is accepted, interview every phase in order, each with the questions of the skill's `## The interview`. A question that hangs on code an earlier phase writes is not asked: it becomes an unknown for that phase, resolved at the start of that phase's own plan.

## From a split proposal

An input carrying a `Split proposal:` block is the planner's cut, already sized: estimate no scope, show it, one line per phase as drafted, instead of drafting one, and ask the same `Accept` or `Correct`. The order, the files and the task counts stand until the user corrects them.

- Skip the skill's branch start step and every issue step of its `## Done`.
- When the input names a summary file (under `.temp/viber/intent/summary-`), read it.
- Hand off the input's `Issue:`, `Attachment:`, `Work:` and `Branch:` lines and its run branch line unchanged.
- Each `Open decisions:` line is asked as a numbered decision in the interview of the phase it concerns (the first one when it spans several), none dropped and none answered for the user.
- A proposal for a phase (the input carries `Phases: <path>` or `Roadmap: <path>`) replaces that phase's entry in place with the proposed phases, numbered on from its position. Every other entry and its `(built)` marker stay unchanged, and the replaced entry's `Issue:` line moves to the first new phase. Phase 1's summary carries the whole rewritten phase list and no `Phases:` line, so the planner fills `## Phases` from the summary.
- A proposal from a `viber:fixer` input keeps the fix in phase 1. Only phase 1's summary carries the diagnosis lines, one `Root cause:` and one `Repro:` line (the reproduction test's repo-relative path), as the input stated them; no later phase's summary carries either.

## The summary

A split intent opens its `## Done` summary with the accepted phase list, one line per phase plus which one this cycle covers, carrying under each later phase the decisions settled for it and its open unknowns, and names every later phase among the boundaries; its cap is 15 lines plus up to 5 per later phase carrying its decisions.

Once a phase's sub-issue exists, its phase line carries `   - Issue: <full issue URL>` as the first indented line under it, before its decisions, this cycle's phase included; a phase with no sub-issue carries no such line, and an `Issue:` line adds to the cap one line per phase.
