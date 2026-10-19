# Split a larger scope

Ask no detail question yet. Split it as a mechanical cut of that one specification - a part is never a release, and size is the only reason to cut, never a theme, a milestone or a risky piece set apart. Every part holds an estimated 8 tasks or more: merge a smaller one into its neighbour, and a split left with one part is no split. Propose the split, one line per part - what it owns, what it consumes from the ones before it, its estimated task count - plus the order, then ask through one `AskUserQuestion`: `Accept` or `Correct`, the correction typed in its free-text field. `Correct` with nothing typed -> ask in prose what to correct. Correct it until the user accepts it.

- Order the parts so each one consumes only what earlier ones produced. Two pieces that cannot be ordered that way are not independent and belong to one part.
- A part boundary is not a delivery. The cut exists only because one plan cannot hold the whole scope: nothing is published between parts, and the capability is finished only when its last part is built. What a later part brings is absent until its own build, never replaced by a stub, a mock, a hardcoded value or a temporary alternative, and no criterion may need a working application between parts. So never ask what works between parts, how to release or ship a part, or what to use instead, and never let an answer invent one: the absence belongs in the boundaries, as out of scope.

Once the split is accepted, interview every part in order, each with the questions of the skill's `## The interview`. A question that hangs on code an earlier part writes is not asked: it becomes an unknown for that part, resolved at the start of that part's own plan.

## The summary

A split intent opens its `## Done` summary with the accepted roadmap, one line per part plus which one this cycle covers, carrying under each later part the decisions settled for it and its open unknowns, and names every later part among the boundaries; its cap is 15 lines plus up to 5 per later part carrying its decisions.

Once a part's sub-issue exists, its roadmap line carries `   - Issue: <full issue URL>` as the first indented line under it, before its decisions, this cycle's part included; a part with no sub-issue carries no such line, and an `Issue:` line adds to the cap one line per part.
