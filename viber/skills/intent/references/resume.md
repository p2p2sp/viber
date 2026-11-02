# Resume a roadmap

A `roadmap.md` the user points at is resumed, not interviewed again: its first entry with no `(built)` or `(this plan)` marker is the next part, and its listed decisions are settled and cost no question. Ask only what the builds since changed and that part's open unknowns, in the rounds of the skill's `## The interview`. A part is never a release: nothing is published until the last part is built, so never ask what works between parts, how to ship this one, or what stands in for a later part - no stub, mock or temporary alternative. The summary carries that part's decisions as settled, the later parts as boundaries, and closes on the line `Roadmap: <repo-relative path of roadmap.md>`.

When that entry's first indented line is `Issue: <full issue URL>`, that URL is the run's issue from the start: the branching start step and the summary's `Issue:` line carry it. An entry with no such line ties the run to no issue.
