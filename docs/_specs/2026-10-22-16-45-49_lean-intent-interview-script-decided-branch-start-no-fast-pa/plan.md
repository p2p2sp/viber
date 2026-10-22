---
source: C:/Projects/viber/docs/_specs/2026-10-22-16-45-49_lean-intent-interview-script-decided-branch-start-no-fast-pa/plan.md
---

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

## Tasks

<!-- TASK -->
### T1 - Print the branch decision from plan-path.sh --start
- TDD: required
- Covers: AC4
- Uses: C1
- Depends-on: none
- Files: viber/scripts/run-branch.sh, viber/scripts/plan-path.sh, tests/viber/plan-path.test.ts
- Delivers: `--start` accepting the C1 flags and printing the C1 decision report after today's lines
- Verification: node --test --test-name-pattern "start report|decision" tests/viber/plan-path.test.ts -> every case passes, the new decision cases included
- DoD: today's `--start` lines print unchanged and in order, with `next:` and the decision lines after them only under `allowed` or `required`; an `error:` line, a draft carrying `branch:`, `--pr` and a non-none `suggested:` each settle or ask per C1 rules 1, 3, 4 and 6; `ask-entry` offers every usable entry plus `no-branch` under `allowed` or `abort` under `required`, and a run with no usable entry prints `next: none` with a note; the base check of C1 rule 7 settles at base, settles `current` on `--roadmap`, and otherwise asks with `stay` left out under `--fixer`, `switch` left out on a missing base and `current` left out under `required` on an entry base or a detached HEAD, `--fixer` under `required` with only abort left printing `next: abort`; `--settled` is applied before any `--draft` or `--pr` rule and keeps or replaces the earlier settlement per C1 rule 2 (a pull request's settlement kept, `--roadmap` still settling `current` in rule 7), `--settled nothing` with `error:` lines asking the entry question per C1 rule 1, and every `ask-base` names its entry on a `checking:` line; an unknown flag, a flag missing its value or a `--draft` path that is not a readable file exits 2 with nothing on stdout
<!-- /TASK -->

<!-- TASK -->
### T2 - Drive the intent and fixer branch start from the decision report
- TDD: none
- Covers: AC4
- Uses: C1
- Depends-on: T1
- Files: viber/skills/intent/fragments/branching-start.allowed.md, viber/skills/intent/fragments/branching-start.required.md, viber/skills/fixer/fragments/branching-start.allowed.md, viber/skills/fixer/fragments/branching-start.required.md
- Delivers: four fragments that run `--start` with the flags their skill and input call for, then show the settlement, ask the offered options through one `AskUserQuestion`, or show the errors and notes, with no decision rule of their own
- Verification: grep -c "ask-base" viber/skills/intent/fragments/branching-start.allowed.md viber/skills/intent/fragments/branching-start.required.md viber/skills/fixer/fragments/branching-start.allowed.md viber/skills/fixer/fragments/branching-start.required.md viber/scripts/run-branch.sh -> every file counts at least 1
- DoD: each fragment runs `--start` as one literal Bash line with `--fixer` in fixer and with `--draft`, `--pr` and `--roadmap` in intent where the input carries them, and the re-run after an issue save passes the same flags plus `--settled` (`nothing` when nothing was settled) and the new issue URL; each fragment maps every `next:` value of C1 to showing, asking through one `AskUserQuestion` (at most four options, any further one by free text) or stopping, and an answer to `--entry <key>` or `--checkout`; a failed `--checkout` that names uncommitted changes asks the same question again, and any other failed switch asks the same report's options without `switch`; the fixer fragments keep the exit 6 handling that depends on whether the reproduction test exists; no fragment states which options a mode or skill offers
<!-- /TASK -->

<!-- TASK -->
### T3 - Rewrite intent as a round-based interview handing off a summary file
- TDD: required
- Covers: AC1, AC2, AC3, AC5, AC6, AC7, AC10
- Uses: C2
- Depends-on: none
- Files: viber/skills/intent/SKILL.md, viber/skills/intent/parts/done.md, viber/skills/intent/fragments/fast-path.true.md, viber/skills/intent/fragments/issues-input.false.md, viber/skills/intent/fragments/issues-input.true.md, viber/skills/intent/references/prove.md, tests/viber/fast-path-prose.unit.test.ts, tests/viber/intent-prose.unit.test.ts
- Delivers: an `intent` skill that interviews in rounds, gets facts from Explore, takes any context plus the closed signal list, proposes no spec shape, has no fast path, prints its end text from `parts/done.md`, hands off through the C2 summary file outside plan mode and as text inside it, under a unit test capping its start text
- Verification: node --test tests/viber/intent-prose.unit.test.ts tests/portability.unit.test.ts -> pass
- DoD: `SKILL.md` states the round rule of S1 (every decision whose prerequisites are settled, numbered, three options, recommendation first, worded so "yes" accepts it, dependent decisions in a later round) and dispatches the built-in Explore agent with no `model:` for repository facts with only dependent questions waiting, keeping the headings `## Returning to a draft`, `## The interview` and `## Done` that the references point at; it names the closed signal list of AC2, one sentence turning each path under the repository's `.temp/` that the arguments name into an `Attachment:` line (a path elsewhere none), and for a `Split proposal:` input that names a summary file it reads that file so its `Issue:`, `Attachment:`, `Work:` and `Branch:` lines carry over unchanged, and it holds no spec shape section, no `planning.fast-path` call and no "one question" rule, while `fast-path.true.md` and `fast-path-prose.unit.test.ts` are deleted and the frontmatter description neither says "one question at a time" nor suggests plain plan mode; `## Done` runs `skill-part.sh` once for `done`, `parts/done.md` holds the `issues-done` and `branching-handoff` fragment calls, and `SKILL.md` holds neither; the hand-off, reached after any issue save and branch re-settle and never after a "Stop" answer, writes the C2 summary file with `Write` (allowed by `allowed-tools`, as is `skill-part.sh`) and invokes `viber:planner` with its absolute path alone, and inside plan mode restates the confirmed summary verbatim in the invocation instead, while `issues-input.false.md` forbids only issue bodies and comments and `issues-input.true.md` names the summary file among the files written; `prove.md` dispatches one prover per question of a round in one message; the test caps the word count of `SKILL.md` plus `issues-input.false.md` (the fragments the template defaults select) at the count after this rewrite times 1.1, rounded up
<!-- /TASK -->

<!-- TASK -->
### T4 - Feed the planner and its reviewers from the summary file
- TDD: none
- Covers: AC3, AC6
- Uses: C2, C4
- Depends-on: T3
- Files: viber/skills/planner/SKILL.md, viber/agents/planner-review.md, viber/agents/planner-spec-review.md, viber/agents/adr-screener.md, viber/skills/planner/references/adr-tasks.md
- Delivers: a planner that takes an intent summary file path, a confirmed summary as text or a fixer diagnosis as its input, picks the spec shape itself, splits by handing `intent` the path or the text, and passes reviewers the C4 `input:` block; reviewers and the screener that read the input from that file
- Verification: grep -c "intent/summary-" viber/skills/planner/SKILL.md viber/skills/intent/SKILL.md viber/agents/planner-review.md viber/agents/planner-spec-review.md viber/agents/adr-screener.md viber/skills/planner/references/adr-tasks.md -> every file counts at least 1
- DoD: `planner/SKILL.md`, its frontmatter description included, accepts an intent summary file path, a confirmed intent summary as text or a fixer diagnosis as input, and reads a named summary file first; it picks `spec-full` or `spec-lite` by the criteria `intent` held (new application or subsystem, accepted roadmap, behaviour with more than one path or named edge cases, new domain concepts) and keeps `spec-lite` for a fixer diagnosis; its split invocation passes the summary file path, or the summary text or fixer diagnosis verbatim when there is no file, then the `Split proposal:` block; the `input:` block it passes reviewers and the screener follows C4; `planner-review.md`, `planner-spec-review.md`, `adr-screener.md` and `adr-tasks.md` read a one-line `input:` naming a file under `.temp/viber/intent/summary-` as that file's content
<!-- /TASK -->

<!-- TASK -->
### T5 - Replace the plain plan switch and drop the fast path switch
- TDD: required
- Covers: AC7, AC8
- Uses: C3
- Depends-on: T3
- Files: viber/scripts/config.sh, viber/scripts/switch-text.sh, viber/skills/setup/scripts/bootstrap.sh, viber/skills/setup/templates/viber.yml, .claude/viber.yml, viber/docs/configuration.md, viber/skills/setup/assets/help.html, .claude/rules/viber/switch-count-prose.md, tests/viber/config.test.ts, tests/viber/bootstrap.test.ts, tests/viber/switch-text.test.ts, tests/portability.unit.test.ts
- Delivers: config resolution, the switch whitelist, the template and setup's key list on C3; the configuration page, the help page's switch entries and the switch count sentence matching it
- Verification: node --test tests/viber/config.test.ts tests/viber/bootstrap.test.ts tests/viber/switch-text.test.ts tests/portability.unit.test.ts tests/viber/help.unit.test.ts -> pass
- DoD: `config.sh` prints the C3 switch block, `planning.outside-plan-review` reading `true` only from that key inside `planning:`, and prints no `planning.fast-path` or `planning.plain-plan-review` line whatever the file holds; `switch-text.sh` accepts `planning.outside-plan-review` and refuses both removed keys; the template carries `schema: 5` and `outside-plan-review: true` under `planning:` with neither removed key, and its key list is recorded as schema 5; setup appends `outside-plan-review: true` to a file still carrying the old keys and leaves those lines standing, a flat column-0 `plain-plan-review:` or `fast-path:` line included (no longer moved into `planning:`); this repository's `.claude/viber.yml` carries `schema: 5` and `outside-plan-review: true` with its `plain-plan-review` and `fast-path` lines and their comments removed; `configuration.md`, `help.html`'s switch entries and `switch-count-prose.md` name the new switch, drop both removed ones and state the new count, and every `help.html` link to a removed switch id points at `key-planning-outside-plan-review` or, for the fast path, is unlinked with its surrounding text kept
<!-- /TASK -->

<!-- TASK -->
### T6 - Review a plan written outside the planner through outside-plan-review
- TDD: required
- Covers: AC3, AC9
- Uses: C3, C4
- Depends-on: T4, T5
- Files: viber/hooks/scripts/plan-gate.sh, viber/hooks/scripts/plan-hints.sh, viber/hooks/content/plan-hints.md, viber/hooks/hooks.json, viber/agents/plain-plan-review.md, viber/agents/outside-plan-review.md, viber/.claude-plugin/plugin.json, viber/skills/setup/assets/help.html, tests/viber/plan-gate.test.ts, tests/viber/plan-hints.test.ts, tests/viber/shell-guard.test.ts, tests/viber/verdict-nudge.test.ts
- Delivers: the gate's outside plan path armed by `planning.outside-plan-review` and satisfied by `outside-plan-review`, with no file limit; a one-rule hint; the renamed agent without the closing-review check, registered and listed on the help page
- Verification: node --test tests/viber/plan-gate.test.ts tests/viber/plan-hints.test.ts tests/viber/shell-guard.test.ts tests/viber/verdict-nudge.test.ts tests/viber/help.unit.test.ts -> pass
- DoD: with `planning.outside-plan-review: true` a plan outside the planner is denied until a `viber:outside-plan-review` or unprefixed `outside-plan-review` PASS on its current version, and allowed with the switch off or absent; such a plan naming 9 or more repository files is allowed on its PASS, the gate counting no files; `plan-hints.md` holds only the rule to dispatch `outside-plan-review` after every plan write and get its PASS before `ExitPlanMode` under `planning.outside-plan-review`, and `plan-hints.sh` injects it as today; `outside-plan-review.md` replaces `plain-plan-review.md` with the same frontmatter fields under the new name, no `Reviewed` check and no closing-review clause in its calibration, registered in `plugin.json`; `hooks.json`'s description and `help.html`'s agent line name `outside-plan-review` and `planning.outside-plan-review` and state no file limit, every `help.html` link to `agent-plain-plan-review` pointing at `agent-outside-plan-review`; the planner path's deny texts describe `input:` as in C4 (the summary file path, the summary text or the bug diagnosis)
<!-- /TASK -->

<!-- TASK -->
### T7 - Describe the pipeline without the fast path and plain plan mode
- TDD: none
- Covers: AC7, AC9
- Uses: none
- Depends-on: T6
- Files: viber/hooks/content/manifest.md, viber/agents/test-runner.md, viber/README.md, README.md, viber/skills/setup/assets/help.html, viber/skills/setup/assets/viber-flow-en.svg, viber/skills/setup/assets/viber-flow-pl.svg, docs/viber-functions.html, .claude/rules/viber/agent-review-color.md
- Delivers: every user and maintainer document describing intent without the fast path, the planner taking a summary file and choosing the spec shape, and a plan outside the planner as reviewed only
- Verification: node --test tests/viber/help.unit.test.ts tests/orphan-tags.unit.test.ts && grep -c "outside-plan-review" viber/.claude-plugin/plugin.json viber/skills/setup/assets/help.html .claude/rules/viber/agent-review-color.md -> tests pass and every file counts at least 1
- DoD: `manifest.md` names only `viber:fixer`'s reproduction test as an exception to writing no code before a plan; `test-runner.md`'s description names only the implementor skill as its caller; `viber/README.md`, `README.md` and `docs/viber-functions.html` hold no fast path section or sentence and no plain plan mode path, and name `planning.outside-plan-review` where they list switches; `help.html` holds no fast path text in either language, describes plain plan mode only as a plan the gate reviews through `outside-plan-review`, and its intent and planner cards describe rounds, the summary file and the planner's spec shape choice; both flow diagrams hold no plain plan block, no plain build block and no fast path block, and their gate text names no fast path design; `README.md`, `viber/README.md`, both flow diagrams, `help.html`'s getting-started walk and `docs/viber-functions.html` describe the interview as asking in rounds, never "one question at a time", "one question per message" or "jedno pytanie naraz", and `docs/viber-functions.html` has the planner, not `intent`, choose the spec shape, with no escalation after the sixth question, and describes the hand-off as a summary file rather than the summary restated verbatim; `agent-review-color.md` names `outside-plan-review.md`
<!-- /TASK -->

## Contracts

### C1 - plan-path.sh --start decision report

File: viber/scripts/run-branch.sh, viber/scripts/plan-path.sh

```
argv: plan-path.sh --start [--fixer] [--draft <plan path>] [--pr] [--roadmap]
                   [--entry <key>] [--settled <entry key>|no-branch|current|pr|nothing]
                   [<issue URL ending in /issues/<n>>]
  --settled marks the re-run after an issue save; nothing = no settlement was reached before it
stdout, mode allowed or required: every line of today's report, unchanged and in order, then
  next: settled | kept | ask-entry | ask-base | errors | none | abort
  settled: <entry key> | no-branch | current | pr      (next: settled or kept; next: errors when --settled names a settlement)
  option: <answer> | <branch or -> | <effect on the run branch, one sentence>   (ask-entry, ask-base; one per answer)
  checking: <entry key>                                 (ask-base: the entry whose base is checked)
  note: <one sentence>                                  (zero or more)
  answers on ask-entry: <entry key> | no-branch | abort
  answers on ask-base:  switch | stay | current | abort
stdout, mode off or outside a git repository: mode: off (unchanged)
exit: 0; 2 on bad argv (today's cases, an unknown flag, a flag missing its value, a --draft path
      that is not a readable file), nothing on stdout
Rules, the first that applies:
1. any error: line -> next: errors; with --settled nothing, ask-entry instead (the rule 6
   options, ignoring suggested:), the errors still printed above.
2. --settled given (it is checked before --draft and --pr; the re-run passes the first run's
   flags too): pr, or no-branch with --pr -> kept; nothing -> rule 6; suggested: other than none
   and other than the settled key -> rule 7 for the suggested entry; otherwise kept <the given
   settlement>.
3. --draft whose frontmatter records branch: -> entry is its work: key; branch: none under allowed
   -> settled no-branch, under required -> go on to rule 4; current: equal to the recorded branch
   -> settled <work key>; otherwise ask-base with switch (to the recorded branch), stay, abort.
4. --pr: allowed -> settled no-branch; required with current-is-base: no and current: not
   detached -> settled pr; otherwise go on.
5. --entry <key> -> rule 7 for that entry.
6. suggested: other than none -> rule 7 for it; otherwise ask-entry with every usable: yes entry
   plus no-branch (allowed) or abort (required); no usable entry -> next: none, note says so.
7. Base check of one entry: at-base: yes -> settled <key>; --roadmap with current-is-base: no and
   current: not detached -> settled current; otherwise ask-base with switch (to base:; left out
   on base-exists: no), stay (left out with --fixer), current (left out under required on
   current-is-base: yes or current: detached), abort; notes for behind: above 0, dirty: yes and a
   missing base; --fixer under required with abort alone left -> next: abort, note says why.
```

### C2 - Intent summary file

File: viber/skills/intent/SKILL.md

```
path:    <project root>/.temp/viber/intent/summary-<YYYY-MM-DD-HH-MM-SS>.md, written with Write
         at the hand-off (after any issue save and branch re-settle; never on a "Stop"), outside
         plan mode only; handed to viber:planner as its only argument, absolute, forward
         slashes, a Windows drive as C:/; inside plan mode no file: the summary is restated
         verbatim in the invocation
content: the confirmed summary in the conversation's language - problem, acceptance criteria,
         out of scope, binding constraints, unknowns each with its way to resolve it - then each
         signal line that applies, one per line: Issue: <URL>, Attachment: <absolute path>,
         Work: / Branch: / the run branch line, Roadmap: <path>, the user's request to stop at a
         specification, the draft run key
split:   viber:planner invokes viber:intent with the summary file path, or with the summary text
         or fixer diagnosis verbatim when there is no file, then the Split proposal: block
```

### C3 - Planning switches

File: viber/scripts/config.sh, viber/scripts/switch-text.sh, viber/skills/setup/templates/viber.yml

```
config.sh switch block, in order:
  planning.adr, planning.outside-plan-review, build.baseline-tests, build.final-review,
  build.memory, build.rules, build.qa, build.cleanup, build.red-check, github.issues
switch-text.sh keys: the same switch keys, plus branching.mode and build.extensions
template: schema: 5
  planning:
    outside-plan-review: true
```

### C4 - Reviewer input block

File: viber/skills/planner/SKILL.md

```
input:
<absolute path of the intent summary file, alone on its line>   (an intent run outside plan mode)
<the confirmed intent summary, verbatim>                         (an intent run inside plan mode)
<the fixer diagnosis, verbatim>                                  (a fixer run)
Answered: <decision> -> <chosen option>                          (zero or more)
A one-line input naming a .md file under .temp/viber/intent/ is read as that file's content.
```
