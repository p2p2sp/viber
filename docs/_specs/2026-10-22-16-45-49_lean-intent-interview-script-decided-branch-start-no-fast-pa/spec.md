To build this plan you must invoke skill `viber:implementor` with `source:` path as its only argument.

# Lean intent interview, script-decided branch start, no fast path and no plain plan path

## Goal

Make `viber:intent` a short, round-based interview that hands the planner a summary file, so planning takes fewer turns and less context. Move the branch decision table out of skill prose into `plan-path.sh --start`, drop the fast path, and stop treating plain plan mode as a viber path while keeping a reviewer for any plan written outside the planner.

## Problem

`intent` loads about 3500 words at start and mixes the interview with branch settlement, issue handling and a build path (the fast path). It asks one question per message, reads code in the main thread, and its hand-off summary is retyped (rewritten, translated, expanded) in 5 of 5 audited hand-offs. Plain plan mode is a weaker build path (no memory, rules or closeout) that viber still promotes, limits to 8 files and hints. Every extra turn and every extra word is re-read by every later planning turn.

## Current behaviour

- `intent` asks exactly one question per message, with three numbered options, and reads code itself.
- `intent` proposes `spec-full` or `spec-lite`; the planner takes the shape from the input.
- `intent` hands off by restating its summary verbatim inside the `viber:planner` invocation; the planner passes it verbatim to its reviewers as `input:`.
- With `planning.fast-path` on, `intent` can design and build a small change itself and run `test-runner`.
- `intent` and `fixer` settle the run branch by applying a prose decision table (four fragments) to the raw `plan-path.sh --start` report.
- The issue and branch hand-off fragments load at skill start although they are used only at the end.
- A plan written outside the planner is gated by `plain-plan-review` under `planning.plain-plan-review`, refused past 8 repository files, and hinted with five plain plan rules.

### Must not change

- The plan gate's planner path: a planner plan answers only to `planner-review` or the review set, as today.
- Every line `plan-path.sh --start` prints today, in today's order; `--branch`, `--checkout` and `--land` behave as today.
- `intent`'s split (`split.md`), draft and roadmap resume (`resume.md`), and issue save and comment flows.
- `fixer` hands its diagnosis to the planner as text, with `Spec shape - spec-lite`.

## Behaviour

### S1 - The interview asks in rounds [CHANGED - was: one question per message]

Given an intent with several open decisions, some depending on others
When `intent` asks
Then one message carries every decision whose prerequisites are settled, each numbered with three options, the recommendation first and worded so "yes" accepts it; a decision depending on one still open waits for a later round.

### S2 - Facts come from Explore [CHANGED - was: intent reads the code itself]

Given a question needing a fact from the repository
When `intent` prepares a round
Then it dispatches the built-in Explore agent with its default model for that fact, and only the questions needing it wait.

### S3 - The summary travels as a file [CHANGED - was: restated verbatim in the invocation]

Given a confirmed summary, its issue saved and its branch settled as the user chose
When `intent` hands off to the planner
Then it writes the summary file and invokes `viber:planner` with that file's path; the planner and its reviewers read the input from that file. A run the user stops at "what next" writes no file.

### S4 - Intent inside plan mode keeps the text hand-off [NEW]

Given `intent` running while plan mode is active, where only the plan file may be written
When it hands off
Then it restates the confirmed summary verbatim in the planner invocation, as before, and the planner and its reviewers take that text as the input.

### S5 - The planner picks the spec shape [CHANGED - was: intent proposed it]

Given an intent summary naming no spec shape
When the planner writes the plan
Then it picks `spec-full` or `spec-lite` by the criteria it now holds; a fixer diagnosis keeps `spec-lite`.

### S6 - The branch start is decided by the script [CHANGED - was: a prose table in four fragments]

Given branching `allowed` or `required`
When `intent` or `fixer` settles the run branch
Then the user sees the same settlements and the same questions with the same answers as today, but the choice of what to settle or ask comes from the branch report, and the skill only shows or asks it.

### S7 - The end-of-interview instructions load at the end [CHANGED - was: loaded at skill start]

Given an interview reaching its end
When the summary is confirmed
Then the issue and branch hand-off instructions enter the model's context only then, and the user sees the same issue and hand-off steps as today.

### S8 - Any context starts the interview [CHANGED - was: rules spread over the skill]

Given a conversation, a pasted note or a file path before `/viber:intent`
When the interview starts
Then `intent` takes everything in context as content, reacts only to the named signals (a split proposal, an issue reference, a draft or roadmap, attached files, the prove switch), and, as today, lists each path under the repository's `.temp/` that the arguments name as an attachment of the summary, a path elsewhere getting none.

### S9 - The interview cannot quietly grow back [NEW]

Given a later edit that adds words to the instructions `intent` loads at start
When the unit tier runs
Then it fails once those words pass the cap set by this plan, until the cap is raised on purpose.

### S10 - No fast path [REMOVED - reason: a quick change is asked for directly, outside intent]

Given any change, however small
When `intent` runs
Then it never builds; it always ends in a planner hand-off or a stop.

### S11 - A plan written outside the planner gets a review only [CHANGED - was: plain plan path with hints and an 8-file limit]

Given plan mode without the planner and `planning.outside-plan-review: true`
When the session leaves plan mode
Then the gate requires an `outside-plan-review` PASS on the current plan version, counts no files, and the hint names only that review.

### Edge cases

- A branch configuration error on the first run -> the errors are shown, nothing is asked, no branch line is handed off.
- A branch configuration error on the re-run after an issue save -> the errors are shown and the earlier settlement kept; with nothing settled yet, the entry question is asked as today.
- `fixer` under `required` where only abort is left -> it says why and stops.
- No usable entry -> it says so and asks nothing; the planner settles the entry later.
- A draft path given to the branch report that does not exist -> the report refuses it as bad input.
- A config still carrying `planning.plain-plan-review` and `planning.fast-path` -> both lines are ignored; until setup runs again, `planning.outside-plan-review` reads false and the outside-planner gate is off; setup appends `outside-plan-review: true` and leaves the old lines standing.
- A plan outside the planner naming 9 or more repository files -> allowed on its review PASS.

## Glossary

- round - one message of the interview asking every decision whose prerequisites are settled.
- summary file - the confirmed interview summary saved as a file at the hand-off, the planner's input.
- branch decision - what the branch report adds after today's lines: settle this, or ask this with these answers.
- outside plan - a plan written in plan mode without the planner; not a viber path, only reviewed.

## Acceptance criteria

1. `intent` asks in rounds per S1 and gets repository facts through the built-in Explore agent per S2.
2. `intent`'s input is any context plus a closed list of signals (`Split proposal:`, an issue reference, a draft or `roadmap.md`, `Attachment:`, `--prove`), and one sentence keeps today's attachment rule: each path under the repository's `.temp/` that the arguments name becomes an `Attachment:` line, a path elsewhere none (S8).
3. At the hand-off the confirmed summary is written to a summary file, and the planner, its reviewers and the decision record screener read the input from it (S3); inside plan mode the summary travels as text, as before (S4).
4. `plan-path.sh --start` prints the decision report for intent and fixer under `allowed` and `required`, and the four `branching-start` fragments only show or ask what it decides (S6).
5. The issue and branch hand-off fragments reach `intent` only at `## Done`, printed from `parts/done.md` (S7).
6. The planner picks the spec shape for an intent summary; `intent` proposes none (S5).
7. The fast path is gone: no fragment, no `planning.fast-path` switch, no manifest exception, `test-runner` invoked only by the implementor, and no document describes it (S10).
8. `planning.plain-plan-review` is replaced by `planning.outside-plan-review` (default true, schema 5) and `planning.fast-path` is removed from config resolution, the switch whitelist, the template and setup's key list; old lines in a user's file stay and are ignored.
9. The gate reviews an outside plan through `outside-plan-review` under the new switch, with no file limit; the hint holds only the review rule; the agent has no closing-review check; no document describes plain plan mode as a viber path (S11).
10. A unit test caps the words of `intent`'s start text (`SKILL.md` plus the fragments the template defaults select) at its size after the rewrite plus about 10% (S9).

## Scope

### File map

- modify - viber/scripts/run-branch.sh - the `--start` decision report (C1)
- modify - viber/scripts/plan-path.sh - `--start` argv and the header contract for the decision report
- modify - tests/viber/plan-path.test.ts - decision report cases
- modify - viber/skills/intent/fragments/branching-start.allowed.md - show or ask what the report decides
- modify - viber/skills/intent/fragments/branching-start.required.md - same, required mode
- modify - viber/skills/fixer/fragments/branching-start.allowed.md - same, fixer
- modify - viber/skills/fixer/fragments/branching-start.required.md - same, fixer required
- modify - viber/skills/intent/SKILL.md - the round-based interview, signals, summary file hand-off, done part pointer
- add - viber/skills/intent/parts/done.md - the end-of-interview text with the issue and branch hand-off fragment calls
- delete - viber/skills/intent/fragments/fast-path.true.md - the fast path
- modify - viber/skills/intent/fragments/issues-input.false.md - no longer forbids writing every file
- modify - viber/skills/intent/fragments/issues-input.true.md - allows the summary file beside the issue body and comment
- modify - viber/skills/intent/references/prove.md - one prover per question of a round
- delete - tests/viber/fast-path-prose.unit.test.ts - tests the removed fragment
- add - tests/viber/intent-prose.unit.test.ts - intent wiring and the word cap
- modify - viber/skills/planner/SKILL.md - summary file input, spec shape choice, split and reviewer input
- modify - viber/agents/planner-review.md - `input:` from the summary file (C4)
- modify - viber/agents/planner-spec-review.md - same
- modify - viber/agents/adr-screener.md - same
- modify - viber/skills/planner/references/adr-tasks.md - same
- modify - viber/hooks/scripts/plan-gate.sh - deny text for `input:`; outside plan path under the new switch; no file limit
- modify - viber/scripts/config.sh - switch list (C3)
- modify - viber/scripts/switch-text.sh - key whitelist (C3)
- modify - viber/skills/setup/scripts/bootstrap.sh - legacy key map
- modify - viber/skills/setup/templates/viber.yml - schema 5, new switch, no fast path
- modify - .claude/viber.yml - this repository's own config
- modify - viber/docs/configuration.md - switch table, count, details
- modify - .claude/rules/viber/switch-count-prose.md - switch count sentence
- modify - tests/viber/config.test.ts - switch list
- modify - tests/viber/bootstrap.test.ts - schema 5 key list
- modify - tests/viber/switch-text.test.ts - whitelist cases
- modify - tests/portability.unit.test.ts - switch value map
- modify - viber/hooks/scripts/plan-hints.sh - header names the outside plan review
- modify - viber/hooks/content/plan-hints.md - the review rule only
- modify - viber/hooks/hooks.json - description
- delete - viber/agents/plain-plan-review.md - renamed
- add - viber/agents/outside-plan-review.md - the reviewer of an outside plan
- modify - viber/.claude-plugin/plugin.json - agent registration
- modify - tests/viber/plan-gate.test.ts - outside plan cases, file limit cases removed
- modify - tests/viber/plan-hints.test.ts - the one-rule hint
- modify - tests/viber/shell-guard.test.ts - hooks.json description assertion
- modify - tests/viber/verdict-nudge.test.ts - hooks.json description assertion
- modify - viber/skills/setup/assets/help.html - switches, agent line, fast path and plain plan sections, intent and planner cards
- modify - viber/hooks/content/manifest.md - no fast path exception
- modify - viber/agents/test-runner.md - description
- modify - viber/README.md - fast path and plain plan sections
- modify - README.md - fast path sentence
- modify - viber/skills/setup/assets/viber-flow-en.svg - no plain plan and fast path blocks
- modify - viber/skills/setup/assets/viber-flow-pl.svg - same
- modify - docs/viber-functions.html - switches, fast path section, plain plan mentions
- modify - .claude/rules/viber/agent-review-color.md - agent example name

### Out of scope

- Every file naming `/viber:intent` as the next step or invoking it (`prototype`, `pr-feedback`, `code-auditor`, `triage`, `implementor` and `parts/close.md`, `prover.md`, `viber/docs/files.md`, `.github/ISSUE_TEMPLATE/01-bug-report.yml`): the skill keeps its name and arguments.
- `viber/BRANCHING.md`: the branch behaviour a user sees stays the same; only where it is decided moves.
- `plan-path.sh`'s other callers and modes (`archive-run.sh`, `plan-index.sh`, `red-check.sh`, `implementor`, `e2e`, planner `branching*` fragments): unchanged modes.
- `config.sh`'s other callers (`red-check.sh`, `pr-facts.sh`, `issue-templates.sh`, `extension.sh`, `archive-run.sh`, `session-start.sh`): they read other lines; the schema 5 bump makes `session-start.sh` prompt a re-run of setup as it does for any schema raise.
- The intent `branching-handoff` and `issues-done` fragments and `branching-stay-prose.unit.test.ts`: unchanged text, only loaded later.
- `fixer/SKILL.md`, `fixer` hand-off fragments: unchanged; fixer still hands off text.
- Every `CLAUDE.md` node (`viber/`, `viber/skills/`, `viber/hooks/`, `viber/agents/`, `viber/scripts/`, `viber/references/`, `tests/viber/`): updated by the build's memory close.
- Shell rules under `.claude/rules/` naming `plan-path.sh`, `config.sh` or `plan-gate.sh`: their examples stay true.
- `test-runner.md`'s report-only dispatch branch: kept as is; only its description changes.
- Users' existing `viber.yml` lines `plain-plan-review` and `fast-path`: left standing, ignored.
- `tests/viber/code-auditor.unit.test.ts` retired-token list: it keeps guarding the code-auditor skill's own retired names; the removed agent and fragment names are checked by T6's and T7's verifications.
- `roadmap-prose` and `repair-prose` tests, `docs/refactor.md` working note.
- Every other skill (`prototype`, `talk`, `pr-feedback`, `triage`, `code-auditor`, `implementor`, `e2e`, `setup` apart from its template and `bootstrap.sh`): unchanged.
- Measuring the real token gain: done after the release on 2-3 real tasks with the audit scripts, outside this build.
- The planner's own review loop (Variant B): the next plan.

## Solution requirements

- Every script works on Windows (Git Bash) and macOS, with no heredoc.
- Locally only the unit tier runs as a suite; a task's own verification may run its integration test files named one by one; the whole suite runs in CI.
- The summary a user confirmed reaches the planner unchanged, whether as a file or, inside plan mode, as text.
