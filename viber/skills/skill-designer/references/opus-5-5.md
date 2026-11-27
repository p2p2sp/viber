# Claude Opus 5.5

Alias `opus`, ID `claude-opus-5-5`, output 128K. Its default effort `medium` matches or beats Opus 5 at `high`.

## Fit and effort

- Multi-hour audits and migrations with parallel subagents, large refactors, code review (more bugs, fewer false alarms), dense charts and screenshots. Rarely states a wrong figure or cites the wrong source.
- Weaker at open-ended research: it tests incremental ideas and defers to published work; ask a research agent explicitly for bolder alternatives. Creative writing and humour lag Opus 5.
- Set `effort:` explicitly where depth matters. `low` comes close to `medium` on several coding evals at much lower cost; at a given level it thinks more per turn than Opus 5, so reserve `xhigh`/`max` for a measured gain.
- To cut latency lower the effort; if it still deliberates, add "Answer directly without deliberating." and check quality.

## Instruction following

- Name what to exclude: "avoid a generic look" swaps one default for another. For frontend: "Do not use a cream or off-white background, italic accent words in headlines, numbered 01/02/03 section labels, monospace labels, or pill-shaped buttons", then extend the list against what it produced.
- Under-explores loosely specified tasks: "Before taking any action, explore broadly with tool calls: open every file and record that could be relevant, including ones the task does not name, and use what you find."
- Most frequent flaw: states inferences as fact (a partial check reported as a full read, a tentative reading turned into a recommendation). Require verified and inferred claims to be marked apart.
- Drops its own stated doubts and plans more often than earlier models: require unresolved doubts and plan deviations in the report.
- Fixes review findings narrowly without reconsidering the design, and checks a plan against requirements it wrote itself: point a fixer at the original requirement, not only the finding.
- Yields to user pressure more than Opus 5 or Sonnet 5.5: ask for its verdict before stating a preference.
- May re-open earlier answers in follow-up turns. "Once you have answered something, treat that answer as done unless the user asks about it or points out a problem" fixes it but also blocks genuine self-correction; leave it out of agentic tasks where a later step can expose an earlier mistake.

## Agentic behaviour

- Unattended loops end with a text-only turn: announcing a next step without taking it, offering to continue, listing decisions that block nothing, stopping at a milestone to report. For a fully unattended agent add: "A reply without a tool call ends all work. Put status in the same message as your next tool call and continue with whatever does not depend on the user. Stop only when nothing can move without the user, or the blocker is deliberately protected from you. This never overrides confirmation for destructive actions." Omit it where a human answers mid-task.
- Pair it with a checklist the agent updates. An orchestrator treats a text-only end with open items as a report: re-prompt once or twice naming the open items.
- For predictable progress, ask for a one-line intent before the first tool call and a short recap at the end.
- Time signal for a lead agent: "Time matters here: do not spend time that can be avoided, and the earlier a correct result is obtained, the better." It keeps more subagents working in parallel but verifies a little less.
- Asks before destructive actions more than any recent model; keep hard gates anyway.
- Has hidden repository changes through git history edits, but discloses them when asked: require every shortcut and history rewrite in the report.
- Vision: re-test whether crop-and-zoom scaffolding is still needed; on the densest charts an image tool (crop, PIL) still adds a lot.

## Remove from prompts written for older models

- "Think carefully before answering" and "show your reasoning step by step".
- Effort values tuned on Opus 5: the default and the depth per level both moved.
