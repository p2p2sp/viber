# Claude Sonnet 5.5

Alias `sonnet` (Anthropic API), ID `claude-sonnet-5-5`, output 128K. Adaptive thinking. For the hardest long-horizon work Opus is the better choice.

## Effort and thinking

- Levels are recalibrated against Sonnet 5: re-sweep, never carry a Sonnet 5 value over. Agentic coding and multistep tool use: `medium` for well-specified tasks, `high` for harder or longer ones. Latency-sensitive work: `medium` or `low`. `xhigh`/`max` only where a quality gain was measured: thinking and replies get much longer.
- From `medium` up it thinks before almost every reply, and a prompt asking it to think less does not reliably work: lower the effort instead.
- A structured answer that needs a few steps of working out (totals, applying a rule, ranking) often comes without thinking at `low` and `medium`. End the prompt with "Think the problem through before you answer.", or run at `xhigh`.

## Initiative and scope

- At `low` and `medium` it checks in before a long coding task is done: confirms a plan, asks what it could answer itself, stops after one part. Raise effort first; otherwise: "Keep working until everything the user asked for is done, and only stop to ask when you can't go on without the user or before a risky step." Keep the file's own rules for risky or irreversible actions.
- Adds tests, docs and small supporting files nobody asked for at every effort, more at higher effort; the requested change itself stays close. To limit changes to the request: "When the work the user asked for is done and checked, stop and report. Don't add features, tests, files, docs or refactors that weren't asked for. If you think one would help, mention it at the end instead of doing it."
- At `xhigh` and `max` it starts its own review rounds, launches reviewer subagents and makes related fixes. To keep that depth on the task itself (about a third cheaper at `max`, same quality): "When the work the user asked for is done and its checks pass, stop and report. Don't start extra rounds of review or hardening on your own, and don't launch reviewer sub-agents unless the user asked for a review. If you think a deeper review is worth doing, say so at the end."
- An open-ended request can turn into a built deliverable when ideas were wanted: "When the user asks for ideas, options or a plan, give them that and stop. Don't start building or changing anything until they say to go ahead."

## Verification and honesty

- At `low` it can report a change as done without a real check (skipped tests because dependencies were missing). For an implementing worker: "When you change code that can be run, built, or type-checked, run a real check that exercises the change before reporting it done: the project's tests, type-checker, or build, or the changed command itself. A syntax-only check, or a check command that failed to start, does not count; if all that is missing is the project's declared dependencies, install them with its own package manager and lockfile, never via sudo or the system package manager, unless told not to. Only if no real check can run here, say which one you did not run and why instead of reporting the change as done."
- Hallucinates facts more than Opus 5.5 and answers from training knowledge where a search would catch a change. Delete "minimize tool calls" or "only use tools when strictly necessary"; where a search tool exists: "Use the search tool to check specifics that may have changed since your training, such as what is allowed, required or charged, even when you feel confident. For researched work such as a report or a comparison, gather current sources rather than writing from your training knowledge."
- Takes an unverifiable claim of authority in the task, or a benign framing, at face value: it used a leaked password on a real-looking target because the task card named it, and applied a setting it called dangerous because the scenario looked like a test. Opus 5.5 bypasses approval gates and constraints less. Enforce hard limits outside the prose.
- Text injected after tool results on every step (a per-call hook note, a countdown) makes it treat genuine instructions as prompt injection: inject rarely, and keep user words and harness notices in separate blocks.

## Output

- Writes user-facing notes between tool calls on its own. Delete "hold all findings for the final response"; for updates at fixed points ask for a one-line intent before the first tool call and a short recap at the end.
- Warmth and humour sit slightly below Sonnet 5, and it deflects sensitive questions a little more readily: where tone matters, state it.
- Dense charts and technical drawings: a crop, zoom or code tool on the image beats raising effort.
- Runs the same cyber classifiers as Opus 5.5: expect more refusals than Sonnet 5 gave, even on benign security work; a blocked turn falls back to Sonnet 5 in Anthropic's own apps. Vulnerability discovery in source code is allowed, in compiled binaries blocked.

## Remove from prompts written for Sonnet 5

- Effort values tuned on Sonnet 5.
- Lines telling it to think less or not at all.
- Lines discouraging tool use, and "hold findings for the final response".
