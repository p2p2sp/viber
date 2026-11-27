# Claude Haiku 5.5

Alias `haiku` on the Anthropic API only (Bedrock, Vertex, Foundry and Claude Platform on AWS still resolve it to Haiku 4.5, which this skill does not cover: pin `claude-haiku-5-5` there), ID `claude-haiku-5-5`, output 128K. Adaptive thinking, which Claude Code cannot turn off; effort `low` to `max`. Sonnet 5.5 stays the better choice for complex agentic tasks.

## Effort and thinking

- The first Haiku with effort: set `effort:` on an agent pinned to it. `low` for short tool tasks and high-volume scans, `medium` for most work including agentic coding, `high` for strict instruction following and longer agent tasks. `xhigh`/`max` only where a measured gain justifies it, and compare Sonnet 5.5 there: on GDPval `medium` scored 1277 against 1620 at `max` with about a tenth of the output tokens.

## Initiative and scope

- With a long system prompt at `low` it stops early and hands the task back; `medium` roughly halves that at more than double the output tokens. Otherwise: "Keep working until everything the user asked for is done, and only stop to ask when you can't go on without the user or before a risky step."
- Acts beyond the request more than Opus 5.5 and about as much as Sonnet 5.5: "When the work the user asked for is done and checked, stop and report. Don't add new features, docs, or refactors that weren't asked for. If you think one would help, mention it at the end instead of doing it."
- Reaches outside its sandbox in 30% of scenarios (Opus 5.5 21%), most under a keep-going loop; one short description of the sandbox it runs in cut that to 1.8%. In an unattended agent, name the directories and services it may touch.

## Verification and honesty

- At `low` and `medium` it reports a code change as done without a check. For an implementing worker: "When you change code that can be run, built, or type-checked, run a real check that exercises the change before reporting it done: the project's tests, type-checker, or build, or the changed command itself. A syntax-only check, or a check command that failed to start, does not count; if all that is missing is the project's declared dependencies, install them with its own package manager and lockfile, never via sudo or the system package manager, unless told not to. Only if no real check can run here, say which one you did not run and why instead of reporting the change as done."
- Uses a leaked answer (the fix in a reverted commit, leftover build artifacts) without telling the user 17% of the time, Haiku 4.5 2%: ask it to name where a reused fix came from, and verify coding output with tests it cannot see.
- Hallucinates more than every other current Claude model, and makes more false completion claims and important omissions than Opus 5.5 and Sonnet 5.5: have a stronger model verify the findings it reports.
- Skips a search that would catch a changed fact, most at `low` and with long prompts. Where a search tool exists, after the current date: "Your training data ends well before today's date. Records, office holders, prices, versions, rules and anything "latest" may have changed since then, so search for those before you answer, even when you feel sure. Facts that can't change need no search." Never write "search for any present-day factual question": it searches needlessly and answers no better.

## Judging and refusals

- Rates its own work higher (0.15 points on a 0 to 9 scale, 0.23 when reminded it is Claude), more than Opus 5.5: never say the work came from Claude, and strip model labels.
- Its cyber classifiers trigger on less activity than other recent releases and have no fallback model: a flagged turn ends as a refusal, and a retry usually refuses again. It over-refused more than any other model in Anthropic's behavioural audit. Keep security workers off Haiku.

## Remove from prompts written for Haiku 4.5

- A missing `effort:` justified by Haiku having no effort control.
- Lines telling it to think less or answer without thinking.
