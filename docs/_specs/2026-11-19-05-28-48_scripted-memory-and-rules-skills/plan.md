---
source: /Users/dario/Projects/viber/docs/_specs/2026-11-19-05-28-48_scripted-memory-and-rules-skills/plan.md
planned: /Users/dario/.claude-p2p2/plans/crystalline-forging-prism.md
---

To build this plan you must invoke skill `viber:implementor` with `source:` path as its only argument.

# Scripted memory and rules skills

## Goal

Move the mechanical work of `/viber:memory` and `/viber:rules` (deriving the target list of a mode, composing every auditor brief, judging the form of a node, reconciling the lists of child nodes, naming misplaced rules, auditing a rule that matches nothing and deciding whether the rules layer is already true) from the model into `memory-map.sh` and `rules-map.sh`, which answer in the directive format of part 1. The models keep only judgement: what a sentence or a rule line means against the code. They read less and drift less.

## Problem

`memory/SKILL.md` (2053 words) and `rules/SKILL.md` (1848 words) make the model apply many mechanical rules by hand on every run: which map lines form the target list of each mode, the labelled lines of each auditor brief, the accounting of created and deleted nodes across waves, the root-and-area test of a misplaced rule, the five conditions of a layer already true and the `map:` lines of the writer brief. `memory-auditor` judges four form departures a script can measure, and `rules-auditor` is dispatched on a rule that matches nothing only to write `GONE`. Every hand-applied rule costs tokens against the user's usage limits and is a chance to send a wrong brief or a wrong count.

## Current behaviour

Both skills preload their map script and then work from prose. `memory`: step 2 derives the target list per mode from the `node:`, `cand:` and `unlinked:` lines, step 3 resets through `--reset` and continues with the candidates and emptied directories, step 4 classifies fix and create targets and the planned set, step 5 composes one `memory-auditor` brief per fix target, the auditor judges every `SHAPE` departure itself, and step 8 checks each node against the accounting of what every writer dispatch created or deleted, the newly written nodes being untracked and absent from the map. `rules`: step 1 names each root rule whose globs stay inside one area or whose basename carries an area prefix, step 5 composes one `rules-auditor` brief per kept target, the auditor writing `GONE` for a rule whose `matches` reads `0`, and step 6 checks the counters, the flags and the trail counts and composes the `rules-writer` brief.

### Must not change

- The map mode output of `memory-map.sh` stays byte-identical, and that of `rules-map.sh` gains only the `misplaced:` lines: every other line, its order, its exit code and the `--reset` behaviour stay as they are.
- The map mode of `memory-map.sh` never names an untracked node or section on any line but `dirty:`.
- The mode question, the reset list, its dirty refusal and its confirmation, the target approval question, the batches of at most 16 calls, the `Concurrent subagent limit reached` handling, the `VERDICT: DENIED` and no-output-line handling, the memory confirm step, the writer waves by depth and both report steps keep their behaviour.
- The `AUDIT:` line formats, the findings file names and vocabularies of both auditors, the `ENFORCE:` lines, the labelled lines of every auditor and writer brief, and the `rules-writer` `map:` content.
- `memory-node-writer`, `rules-writer`, `references/node-doctrine.md` and `references/rule-admission.md`.

## Roadmap

Part 4 of 7 - Memory and rules

1. Directive convention and the implementor task loop (built)
2. Implementor close (built)
3. Code auditor (built)
4. Memory and rules (this plan)
5. Planner validation and review
   - Every mechanical reviewer check moves into `plan-index.sh`, the input-dependent ones (`Attachment:`, `Root cause`, `Repro:`) through `--input <summary file>` and staying with the reviewer when the input is text; every error as a `FIX:` or `SPLIT:` directive, all errors in one run; the missing unnumbered-scenario check added.
   - Reviewers get Write and `out:`; `review-round.sh` aggregates verdicts (`DENIED` over `FAIL` over `PASS`), retries a member without a verdict, composes the round 2+ prompts and answers `NEXT: fix`, `NEXT: redispatch <members>` or `NEXT: exit-plan`; every round after a fix reviews the whole set, `plan-gate.sh` unchanged.
6. Intent, fixer, e2e and the rest
   - Full payload on the `dispatch:` lines; `reach.sh` prints the impact-mapper prompt; `run:` and `settle:` fields on the branch options; `--branch` answers `next: kept`, the model editing the frontmatter.
   - `tree-record.sh --save`/`--check` in `fixer`; `app-wait.sh` only waits, the launch staying with the model; `qa-ledger.sh` with an awk ASCII table; the issue or PR argument classifier called at runtime; `summary-path.sh`, `attach-lines.sh`, `threshold:` only past the accepted count, `SAY=` for `STATUS=skip`.
7. Git, GitHub and the rest
   - `factory.sh answer`, `approve`, `reject` with `MISMATCH` falling back to keys; `verdict-nudge.sh` reads the `VERDICT:` values from the agent file; `commit.sh` runs its own self-check and prints the result line, `commit-selfcheck.sh` removed; `commit-context.sh` gives the ready footer and `RUN:`.
   - `pr-reply.sh --list`/`--all` under one confirmation, never retrying; `build_report.mjs --prompts` writes prompt files under `.temp/`; `issue-create.sh --template`; `pr-facts.sh` `TITLE=`, `TITLE_TEMPLATE=`, `FOOTER=`, `BODY_FILE=`, `SAY=`, `ASK` with `RERUN=`; `bootstrap.sh` `ASK`/`RUN`; `shell-guard.sh` returns the corrected command.
   - Every part: the directive format of part 1, a pure refactor, a word cap on the skill it touches.

## Behaviour

### S1 - The memory target list comes from the script [CHANGED - was: the model derived it from the map lines per mode]

Given a layer with the nodes `CLAUDE.md` and `src/CLAUDE.md` and the candidate `lib`
When the skill runs `memory-map.sh --targets both`
Then stdout is one `target: fix` line per node with its two sizes and flag, one `target: create lib/CLAUDE.md` line with the candidate's counts, and `NEXT: approve`

### S2 - The memory auditor briefs carry the form departures [CHANGED - was: the model composed each brief and the auditor judged every form departure]

Given the kept fix target `src/CLAUDE.md`, whose file holds `## Contracts` before `## Terms` and an empty `## Traps`
When the skill runs `memory-map.sh --targets review --id <id> --keep src/CLAUDE.md`
Then stdout is the `planned:` line and one `NEXT: memory-auditor` block for `src/CLAUDE.md` carrying `shape: CLAUDE.md: out of order: Contracts` and `shape: CLAUDE.md: empty heading: Traps`, and the auditor writes both as `SHAPE:` lines, judging only the title itself

### S3 - Reconciling the lists of child nodes [CHANGED - was: the model kept account of every writer return and judged each node itself]

Given a run whose create wave wrote the untracked node `src/api/CLAUDE.md` below the fix target `src/CLAUDE.md`, which no dispatch rewrote
When the skill runs `memory-map.sh --reconcile` with the planned set and the wave returns
Then stdout is one `NEXT: memory-node-writer` block for `src/CLAUDE.md` with `findings: none` and a `planned:` line naming `src/api/CLAUDE.md`, and the next call, naming that node `--done`, prints `NEXT: none`

### S4 - A misplaced rule is named by the map [CHANGED - was: the model judged the globs and the basename]

Given the root rule `.claude/rules/structure.md` declaring `paths: tests/**`
When the rules map runs
Then it prints `misplaced: .claude/rules/structure.md tests`

### S5 - A rule matching nothing is gone without an auditor [CHANGED - was: an auditor was dispatched to write GONE]

Given the kept targets `.claude/rules/old.md`, which matches no tracked file, and `.claude/rules/api.md`, which matches 4
When the skill runs `rules-map.sh --brief <id>` with both
Then `<out>old-audit.md` holds one `GONE:` line, stdout carries its `AUDIT:` line and one `NEXT: rules-auditor` block for `api.md` alone, and the removal still waits for the user's fold-in answer

### S6 - The rules layer is confirmed by the script [CHANGED - was: the model checked five conditions and composed the writer brief]

Given every findings file of the kept targets holds only `OK` and `UNVERIFIABLE` lines and no kept rule is flagged, misplaced or carries a trail `other` count
When the skill runs `rules-map.sh --confirm <id>` with those targets
Then stdout is the `STOP:` line of a layer already true; with one `STALE:` line present it is that target's counters, the fold-in `ASK:` line and the `NEXT: rules-writer` block instead

### Edge cases

- A `--keep` path that is no target of the mode -> exit 2, one `error:` line, empty stdout.
- A mode with no target at all -> `NEXT: none`, no `target:` line.
- A directory holding a section on a `dirty:` line -> never a `target: create` line.
- A `## ` line inside a fenced code block -> no heading; a heading followed only by a `### ` heading and its text -> not empty.
- The root `CLAUDE.md` or a section beside it -> no `shape:` line.
- A section carrying `## Sections` -> `heading outside the template: Sections`.
- `--reconcile` with no node off -> `NEXT: none`; the root -> never off.
- A writer return whose `FILES:` names a node absent from the tree -> that node counts as deleted.
- A user's own untracked node no dispatch wrote and outside the planned set -> invisible to `--reconcile` too.
- A rule whose glob opens on a wildcard, or whose globs open on two different segments -> no `misplaced:` line from its globs.
- A rule whose `paths` reads `none` -> `scope: **`, `matches: none`; a trail target with no `convention` count above 0 -> no block.
- A frozen rule, or a path that is neither a rule, a directory nor `trail`, passed to `--brief` or `--confirm` -> exit 2.
- A kept target with no findings file -> all its counters read 0 in `--confirm`.

## Glossary

- Directive block - one block of script output: a directive line (`NEXT:`, `ASK:` or `STOP:`) and the body lines after it, which the skill sends verbatim; the format of part 1.
- Target line - one line of `--targets` naming a fix target (an existing node) or a create target (the `CLAUDE.md` a directory lacks), with what the map measured for it.
- Shape line - one form departure of a node or section the script measured, handed to `memory-auditor` in its brief.
- Write wave - the `memory-node-writer` dispatches of step 7; a reconcile wave is one of step 8.
- Off node - a node whose list of child nodes no longer matches the nodes below it after the write waves, by the rule of today's step 8.
- Misplaced rule - a rule the writer moves into an area's directory or renames without its area prefix.

## Acceptance criteria

1. `memory-map.sh --targets <mode>` prints the target lines today's steps 2 to 4 derive for `review`, `extend`, `both` and, after a reset, `reset` with its `--removed` paths, then `NEXT: approve`, or `NEXT: none` when there is no target.
2. With `--id` and `--keep`, `--targets` prints the planned set and one `memory-auditor` block per kept fix target carrying today's four labelled lines, or `NEXT: none` when no fix target is kept.
3. Each `memory-auditor` block carries one `shape:` line per heading outside the template, heading out of order and empty heading of the node and of each section beside it, and none for the root or a section beside it.
4. `memory-auditor` copies each `shape:` line of its input as a `SHAPE:` finding and judges only the title and its opening sentences itself.
5. `memory-map.sh --reconcile` judges the off nodes by today's step 8 rule, seeing the untracked nodes the run wrote, and prints the reconcile writer blocks one wave per call, deepest first, each `planned:` counting what the earlier waves created or deleted, then `NEXT: none`.
6. The rules map prints one `misplaced:` line per root rule whose globs each hold a `/` and all open on one literal path segment, per root rule whose basename opens on `<area>-` for an area directory of `.claude/rules/`, and per area rule whose basename opens on its own area.
7. `rules-map.sh --brief` prints one `rules-auditor` block per kept target with today's five labelled lines, and for a rule matching no tracked file writes its `GONE:` findings file and prints its `AUDIT:` line with no block.
8. `rules-map.sh --confirm` answers with the stop line when every condition of today's step 6 holds, and otherwise with the counters, the fold-in question and the `rules-writer` block carrying today's `map:`, `notes:` and `refs:` lines.
9. `rules-auditor` holds no branch for a rule whose `matches` reads `0`.
10. `memory/SKILL.md` and `rules/SKILL.md` run the map scripts and act on their directives, composing no auditor brief; each of `memory/SKILL.md`, `rules/SKILL.md`, `memory-auditor.md` and `rules-auditor.md` stays within a word cap below its count before this plan (2053, 1848, 736 and 1463 words).

## Scope

### File map

- modify - viber/skills/memory/scripts/memory-map.sh - the `--targets` and `--reconcile` modes and their header
- modify - tests/viber/memory-map.test.ts - the cases of both new modes
- modify - viber/skills/rules/scripts/rules-map.sh - the `misplaced:` line, the `--brief` and `--confirm` modes and their header
- modify - tests/viber/rules-map.test.ts - the `misplaced:` cases and the cases of both new modes
- modify - viber/agents/memory-auditor.md - copies the `shape:` lines, judges the title only
- modify - viber/agents/rules-auditor.md - no branch for a rule matching nothing
- modify - viber/skills/memory/SKILL.md - runs the script modes and acts on their directives
- modify - viber/skills/rules/SKILL.md - runs the script modes and acts on their directives
- modify - tests/viber/rules-trail-prose.unit.test.ts - its step 5 and step 6 assertions leave for `rules-map.test.ts`
- add - tests/viber/memory-rules-words.unit.test.ts - the four word caps

### Out of scope

- Parts 5 to 7 of the roadmap: planner validation and review; intent, fixer, e2e and the rest; git, GitHub and the rest.
- The 6 failing cases of `tests/viber/skill-part.test.ts` on a Windows checkout.
- The archived runs under `docs/specs/`.
- The memory confirm step and the write waves stay with the model, which copies the `planned:` line into each writer dispatch.
- `viber/references/node-doctrine.md`: its `## Template` headings stay as they are, and the script holds the same list.
- `viber/agents/memory-node-writer.md`, `viber/agents/rules-writer.md`, `viber/references/rule-admission.md` and `viber/skills/implementor/fragments/rules.true.md`: their input and behaviour stay.
- `viber/README.md`, `viber/docs/files.md`, `viber/docs/configuration.md`, `viber/skills/setup/assets/help.html`, `viber/skills/setup/SKILL.md`, `docs/viber-functions.html` and `viber/.claude-plugin/plugin.json`: what a user runs and sees stays as described, and no agent is added or renamed.
- `.claude/rules/shell-preload-contract.md`, `.claude/rules/shell-loop-substitution.md` and `.claude/rules/plugin-manifests.md`: the preloads and `${CLAUDE_SKILL_DIR}` calls they name stay valid; the `memory-map.sh` line number one cites shifts, which the build's rules step keeps current.
- `tests/viber/nudge-prose.unit.test.ts` and `tests/viber/guard-prose.unit.test.ts`: the `no verdict returned` fallback and the tool set sentence without `SendMessage` stay in both skills, and `memory-node-writer` is untouched.
- `tests/viber/replay/plan-review/`: archived plans no test reads.
- The `CLAUDE.md` nodes naming the two skills, their scripts and agents (`viber/CLAUDE.md`, `viber/agents/CLAUDE.md`, `viber/references/CLAUDE.md`, `viber/scripts/CLAUDE.md`, `viber/skills/CLAUDE.md`, `viber/skills/CLAUDE.code-auditor.md`, `tests/viber/CLAUDE.md`): the build's memory step updates every one.

## Solution requirements

- Pure refactor: every rule under `Must not change` keeps its exact semantics, and each new mode's output is proven against what the prose produced for the same layer. One intended deviation: the `AUDIT:` line of a rule matching nothing reads `gone 1` (one `GONE:` line) where the auditor counted one per checkable line; the writer acts the same, a `GONE` finding removing nothing alone.
- An output telling the model what to do next is a directive block of C1; a fact the model only reports is a `<key>: <value>` report line.
- Both scripts stay `#!/usr/bin/env bash` and keep their `set -u` line (Answered: shell -> keep bash). They work under bash 3.2 on macOS and Git Bash on Windows, keep mode 100755, use no heredoc, pass shell values to awk through `ENVIRON`, and the map mode keeps exiting 0 in every data condition.
- A new mode with unusable arguments exits 2 with one `error:` line on stderr and an empty stdout.
- No argument the model composes carries an apostrophe: only mode words, the map id, repo-relative paths and comma-separated path lists.
- Each script's cases stay in its own `tests/viber/<script>.test.ts`, spawning the bash SUT in a throwaway repository, the host's only layer for a shell script; the word caps are a `*.unit.test.ts`.
- An area of `misplaced:` is the literal first path segment shared by every glob, or the name of an area directory of `.claude/rules/` (Answered: area -> glob segment plus area prefix).

## Tasks

<!-- TASK -->
### T1 - List the memory targets of a mode
- TDD: required
- Covers: AC1
- Uses: C1, C2
- Depends-on: none
- Files: viber/skills/memory/scripts/memory-map.sh, tests/viber/memory-map.test.ts
- Delivers: the `--targets <mode>` call of `memory-map.sh` printing the target lines of `review`, `extend`, `both` and `reset`, then `NEXT: approve` or `NEXT: none`.
- Verification: node --test tests/viber/memory-map.test.ts -> every case passes, the `--targets` cases among them
- DoD: `--targets review` prints one `target: fix` line per `node:` line of the map, root first then by depth; `--targets extend` prints one `target: create` line per candidate, per directory of an `unlinked:` section with no node beside it and for the repository root when the map carries no `node: CLAUDE.md`, `--targets both` prints the fix lines then the create lines of both lists; `--targets reset --removed <path>...` prints one create line per candidate and per directory a `--removed` node or section path empties, the root among them when `CLAUDE.md` or a root section is named, and `reset` with no `--removed` path exits 2; in every mode each directory gets one create line, the candidate form winning over the unlinked form, that over the removed form and that over the root form, and a directory holding a section on a `dirty:` line gets no create line; the output ends on `NEXT: approve`, or is `NEXT: none` alone when no target line results; an unknown mode or a `--removed` path outside `reset` exits 2 with one `error:` line and an empty stdout, and the map mode output stays byte-identical
<!-- /TASK -->

<!-- TASK -->
### T2 - Brief the memory auditors with their shape lines
- TDD: required
- Covers: AC2, AC3
- Uses: C1, C2, C3
- Depends-on: T1
- Files: viber/skills/memory/scripts/memory-map.sh, tests/viber/memory-map.test.ts
- Delivers: the `--id` and `--keep` flags of `--targets`, printing the planned set and one `memory-auditor` block per kept fix target with its `shape:` lines.
- Verification: node --test tests/viber/memory-map.test.ts -> every case passes, the `--keep` and `shape:` cases among them
- DoD: with `--id <id> --keep <path>...` stdout opens on `planned:` naming every `node:` path of the map plus the node of every kept create target, root first then by depth; one `NEXT: memory-auditor` block follows per kept fix target in the same order with its `target:`, `scope:`, `out:` and `refs:` lines, and `NEXT: none` closes an output holding no such block; a block carries one `shape:` line per `## ` heading outside the template list, per listed heading followed later by one the list puts ahead of it and per heading with nothing but blank lines before the next `# ` or `## ` line outside a fence or the end of the file (a `###` or deeper line is content), for the node and each tracked section beside it in that order; no `shape:` line comes from a `## ` line inside a fenced block, from the root node, from a section beside it or from an untracked section, and a section's `## Sections` is a heading outside the template; a `--keep` path that is no target of the mode, `--keep` without `--id` or `--id` without `--keep` exits 2 with one `error:` line and an empty stdout
<!-- /TASK -->

<!-- TASK -->
### T3 - Reconcile the lists of child nodes
- TDD: required
- Covers: AC5
- Uses: C1, C4
- Depends-on: T2
- Files: viber/skills/memory/scripts/memory-map.sh, tests/viber/memory-map.test.ts
- Delivers: the `--reconcile` call of `memory-map.sh`, judging the off nodes from the write wave returns and printing one reconcile wave per call.
- Verification: node --test tests/viber/memory-map.test.ts -> every case passes, the `--reconcile` cases among them
- DoD: the existing nodes are the planned paths present in the tree plus the present `CLAUDE.md` paths of a write wave `--files` list outside the planned set, an untracked node among them, and no other untracked node, and only an existing node is ever off; a node a write wave dispatch wrote is off when the existing nodes below its directory differ from the planned paths below it plus the nodes that dispatch created; a node no write wave dispatch wrote is off when any write wave dispatch created or deleted a node below its directory, and the root is never off; the call prints one `NEXT: memory-node-writer` block per off node of the deepest depth not named by a `--done` flag, with `mode: fix`, `findings: none`, `planned:` the existing nodes counting what every `--done` dispatch created or deleted and `refs:`, or `NEXT: none` when no such node remains; the `--done` returns never change which nodes are off; a missing `--planned` or a `--files` with no dispatch flag before it exits 2 with one `error:` line and an empty stdout
<!-- /TASK -->

<!-- TASK -->
### T4 - Let the memory auditor copy the shape lines
- TDD: none
- Covers: AC4
- Uses: C2, C3
- Depends-on: T3
- Files: viber/agents/memory-auditor.md
- Delivers: `memory-auditor` taking the `shape:` lines of its brief as `SHAPE:` findings and judging only the title and its opening sentences.
- Verification: grep -n "shape:" viber/agents/memory-auditor.md viber/skills/memory/scripts/memory-map.sh -> both files name the `shape:` line, the agent in its input and its `## Shape` section
- DoD: `## Input` lists the zero or more `shape: <file>: <departure>` lines after `refs:` and reads `scope: .` as the repository root, its findings slug `root`; `## Shape` writes each such line as a `SHAPE:` finding word for word and judges itself only `missing or incomplete title`, still never on the root or a section beside it; the findings vocabulary, the findings file name and the `AUDIT:` line keep their form, `shape <n>` counting both kinds
<!-- /TASK -->

<!-- TASK -->
### T5 - Drive the memory skill from the map script and cap its words
- TDD: none
- Covers: AC10
- Uses: C1, C2, C4
- Depends-on: T4
- Files: viber/skills/memory/SKILL.md, tests/viber/memory-rules-words.unit.test.ts
- Delivers: `memory/SKILL.md` running `--targets` and `--reconcile` and acting on their directives, and the word caps of `memory/SKILL.md` and `memory-auditor.md`.
- Verification: grep -n "memory-map.sh\" --targets\|memory-map.sh\" --reconcile\|--targets)\|--reconcile)" viber/skills/memory/SKILL.md viber/skills/memory/scripts/memory-map.sh; node --test tests/viber/memory-rules-words.unit.test.ts tests/viber/nudge-prose.unit.test.ts tests/portability.unit.test.ts -> the skill names both calls, the script handles both modes, and all three test files pass
- DoD: step 2 runs `--targets <mode>`, `extend` on `state: none`, and step 3 continues after a reset with `--targets reset` and one `--removed` path per `removed:` path line, node or section, the count line left out, both through the literal `"${CLAUDE_SKILL_DIR}/scripts/memory-map.sh"` prefix, with no remap of the layer; step 4 shows the `target:` lines, asks the approval question as today, then runs `--targets` again with the same mode word and `--removed` paths, `--id <id>` and one `--keep` path per kept target; step 5 sends each `NEXT: memory-auditor` body verbatim in the batches of today; step 7 copies the `planned:` line into every writer dispatch; step 8 runs `--reconcile` with the planned set and one `--fix` or `--create` flag with its `--files` list per write wave return of `VERDICT: UPDATED`, then after each reconcile wave again with one `--done` flag per reconcile return, until `NEXT: none`; a script call exiting 2 is reported with its `error:` line and ends the run; the tool set sentence still opens `Your whole tool set is`, leaves out `SendMessage` and names the map script calls of every step that runs them; the skill keeps its `no verdict returned` fallback and every behaviour under `Must not change`, and holds no target derivation and no off-node rule of its own; `memory-rules-words.unit.test.ts` holds `memory/SKILL.md` within a cap below 2053 words and `memory-auditor.md` within a cap below 736, counted by whitespace split
<!-- /TASK -->

<!-- TASK -->
### T6 - Name the misplaced rules in the rules map
- TDD: required
- Covers: AC6
- Uses: C5
- Depends-on: none
- Files: viber/skills/rules/scripts/rules-map.sh, tests/viber/rules-map.test.ts
- Delivers: the `misplaced:` lines of the rules map.
- Verification: node --test tests/viber/rules-map.test.ts -> every case passes, the `misplaced:` cases among them
- DoD: a non-frozen rule directly under `.claude/rules/` whose declared globs each hold a `/` and all open on the same first segment holding none of `*`, `?`, `[` or `{` prints `misplaced: <path> <that segment>`; a root rule whose globs give no such segment, a rule declaring no scope included, and whose basename opens on `<area>-` for an existing subdirectory `<area>` of `.claude/rules/` prints `misplaced: <path> <area>`; a rule inside `.claude/rules/<area>/` whose basename opens on `<area>-` prints `misplaced: <path> <area>`; a frozen rule, and a root rule whose globs give no segment and whose basename opens on no area, print no line; the lines come after the `dead:` lines, alphabetical by path, and every other map line stays byte-identical
<!-- /TASK -->

<!-- TASK -->
### T7 - Brief the rules auditors, a dead rule gone without one
- TDD: required
- Covers: AC7
- Uses: C1, C6
- Depends-on: T6
- Files: viber/skills/rules/scripts/rules-map.sh, tests/viber/rules-map.test.ts
- Delivers: the `--brief <id> <target>...` call of `rules-map.sh`.
- Verification: node --test tests/viber/rules-map.test.ts -> every case passes, the `--brief` cases among them
- DoD: a rule target whose globs match tracked files prints one `NEXT: rules-auditor` block with `target:` its path, `scope:` its globs comma-separated, `matches:` its count, `out: .temp/viber/<id>/` and `refs:`; a rule declaring no scope prints `scope: **` and `matches: none`; a rule whose globs match no tracked file prints no block, writes `.temp/viber/<id>/<slug>-audit.md` holding the one line `GONE: the rule's globs match no tracked file` and prints `AUDIT: <path> stale 0 gone 1 unverifiable 0 drop 0 miss 0 -> <that file>`; a directory target prints `target: none`, `scope:` the directory and `matches: none`; the `trail` target prints `target: trail`, `scope:` every `trail:` path with a `convention` count above 0, comma-separated, and `matches: none`, or nothing when none has one, the `AUDIT:` lines printed first, then the blocks in the order of the targets given, and `NEXT: none` closing an output holding no block; a frozen rule or a path that is neither a rule, a directory nor `trail` exits 2 with one `error:` line and an empty stdout
<!-- /TASK -->

<!-- TASK -->
### T8 - Confirm the rules layer and brief its writer
- TDD: required
- Covers: AC8
- Uses: C1, C5, C7
- Depends-on: T7
- Files: viber/skills/rules/scripts/rules-map.sh, tests/viber/rules-map.test.ts
- Delivers: the `--confirm <id> <target>...` call of `rules-map.sh`.
- Verification: node --test tests/viber/rules-map.test.ts -> every case passes, the `--confirm` cases among them
- DoD: the counters of each target are read from its findings file under `.temp/viber/<id>/`, a missing file reading all 0; when every rule and directory target has `stale`, `gone`, `drop` and `miss` at 0, the trail target `miss`, `ignored` and `rejected` at 0, no kept rule is misplaced or flagged `OVER-FILE`, `total:` carries no `OVER-DIR` and, with the trail kept, no `trail:` line carries an `other` count above 0, stdout is the C7 `STOP:` line alone; otherwise stdout is one `confirm:` line per target with a counter above 0, per misplaced or `OVER-FILE` kept rule, for `OVER-DIR` and per `trail:` line with an `other` count above 0, then the fold-in `ASK:` line, then one `NEXT: rules-writer` block whose `map:` holds the `id:` given, the `state:` and `total:` lines, every `rule:` and `dead:` line of a kept rule target and, with the trail kept, every `trail:` line, followed by `notes: .temp/viber/<id>/` and `refs:`; an unusable target exits 2 as `--brief` does
<!-- /TASK -->

<!-- TASK -->
### T9 - Stop handing a dead rule to the rules auditor
- TDD: none
- Covers: AC9
- Uses: C6
- Depends-on: T8
- Files: viber/agents/rules-auditor.md
- Delivers: `rules-auditor` with no branch for a `matches` of `0`.
- Verification: grep -c "skip straight to the findings file" viber/agents/rules-auditor.md; grep -n "matches: none" viber/skills/rules/scripts/rules-map.sh -> the agent count reads 0, and the script names the `matches: none` line it prints
- DoD: `## Verify - target names a path` holds no instruction for a `matches` reading `0` and still forbids re-running `Glob` to judge the scope; every other section, the vocabulary, the `AUDIT:` line and the `ENFORCE:` lines keep their text
<!-- /TASK -->

<!-- TASK -->
### T10 - Drive the rules skill from the map script and cap its words
- TDD: none
- Covers: AC10
- Uses: C1, C5, C6, C7
- Depends-on: T5, T9
- Files: viber/skills/rules/SKILL.md, tests/viber/rules-trail-prose.unit.test.ts, tests/viber/memory-rules-words.unit.test.ts
- Delivers: `rules/SKILL.md` reporting the `misplaced:` lines, running `--brief` and `--confirm` and acting on their directives, and the word caps of `rules/SKILL.md` and `rules-auditor.md`.
- Verification: grep -n "misplaced:\|rules-map.sh\" --brief\|rules-map.sh\" --confirm\|--brief)\|--confirm)" viber/skills/rules/SKILL.md viber/skills/rules/scripts/rules-map.sh; node --test tests/viber/memory-rules-words.unit.test.ts tests/viber/rules-trail-prose.unit.test.ts tests/viber/nudge-prose.unit.test.ts tests/portability.unit.test.ts -> the skill names the line and both calls, the script handles both modes, and all four test files pass
- DoD: step 1 reports each `misplaced:` line as a rule the writer moves and holds no area test of its own; step 4 still offers a dead rule for approval, saying the script writes its `GONE` and the writer removes the file; step 5 runs `--brief` with the map id and the kept targets through the literal `"${CLAUDE_SKILL_DIR}/scripts/rules-map.sh"` prefix, reports each printed `AUDIT:` line, sends each `NEXT: rules-auditor` body verbatim in the batches of today and reports every returned `AUDIT:` and `ENFORCE:` line as today; step 6 runs `--confirm` with the kept targets minus those dropped on `VERDICT: DENIED`, reports a `STOP:` line and stops, or reports the `confirm:` lines, asks the fold-in question and on that answer sends the `NEXT: rules-writer` body verbatim; a script call exiting 2 is reported with its `error:` line and ends the run; the tool set sentence still opens `Your whole tool set is`, leaves out `SendMessage` and names the map script calls of every step that runs them; the skill keeps its `no verdict returned` fallback and every behaviour under `Must not change`; `rules-trail-prose.unit.test.ts` keeps its step 1, 2, 4 and 7 assertions and drops the step 5 and step 6 ones whose text leaves the skill; `memory-rules-words.unit.test.ts` adds `rules/SKILL.md` within a cap below 1848 words and `rules-auditor.md` within a cap below 1463
<!-- /TASK -->

## Contracts

### C1 - Directive block of the map scripts

File: none

```
<key>: <value>                     report lines, only before the first directive line
NEXT: <verb>[ | <field>]...        directive line; its body of "<label>: <value>" lines runs to the next directive line
ASK: <answer> -> <token> | <answer> -> <token>
                                   directive line, one AskUserQuestion; the token names what follows the answer
STOP: <one line>                   directive line, no body; report it and stop

verbs:
  approve              one AskUserQuestion over the target: lines (memory step 4)
  memory-auditor       one Agent call, subagent_type viber:memory-auditor, prompt = the body verbatim
  memory-node-writer   one Agent call, subagent_type viber:memory-node-writer, prompt = the body verbatim (field: wave: <depth>)
  rules-auditor        one Agent call, subagent_type viber:rules-auditor, prompt = the body verbatim
  rules-writer         one Agent call, subagent_type viber:rules-writer, prompt = the body verbatim
  none                 nothing to dispatch
```

### C2 - memory-map.sh --targets

File: viber/skills/memory/scripts/memory-map.sh

```
memory-map.sh --targets review|extend|both
memory-map.sh --targets reset --removed <path> [--removed <path>]...
  any of them + --id <map id> --keep <node path> [--keep <node path>]...

without --keep:
  target: fix <node> <own> chain <chain> ok|OVER-NODE|OVER-CHAIN
  target: create <dir>/CLAUDE.md files <n> bytes <n> toolchain|plain     a candidate
  target: create <dir>/CLAUDE.md unlinked <section path>                  an unlinked section's directory
  target: create <dir>/CLAUDE.md removed                                  a directory a --removed node or section emptied
  target: create CLAUDE.md root                                           the root of a layer with no root node
  one create line per directory: candidate form over unlinked over removed over root
  NEXT: approve | NEXT: none

with --keep:
  planned: <node>,<node>,...        root first, then by depth
  NEXT: memory-auditor               one per kept fix target, same order
  target: <node>
  scope: <the directory holding it, . for the root node>
  out: .temp/viber/<map id>/
  refs: <plugin root>/references
  shape: <file>: <departure>         zero or more, C3
  NEXT: none                         when no kept target is a fix target

exit: 0; 2 with one "error: <reason>" line on stderr and an empty stdout
```

### C3 - Shape line

File: viber/skills/memory/scripts/memory-map.sh, viber/agents/memory-auditor.md

```
shape: <CLAUDE.md | CLAUDE.<topic>.md>: heading outside the template: <heading>
shape: <CLAUDE.md | CLAUDE.<topic>.md>: out of order: <heading>
shape: <CLAUDE.md | CLAUDE.<topic>.md>: empty heading: <heading>

template list, in order: Terms, Relationships, Contracts, Commands, Change together, Traps, Sections
                         (Sections only in a node, never in a section)
<heading> = the text after "## ", trailing spaces dropped
order: the node first, then its sections alphabetically; within a file, in line order
```

### C4 - memory-map.sh --reconcile

File: viber/skills/memory/scripts/memory-map.sh

```
memory-map.sh --reconcile --planned <node>,<node>,...
    [--fix <node> --files <path>,<path>,...]...     a write wave fix dispatch that returned VERDICT: UPDATED
    [--create <node> --files <path>,<path>,...]...  a write wave create dispatch that returned VERDICT: UPDATED
    [--done <node> --files <path>,...|""]...        a reconcile dispatch that returned, any verdict

created by a dispatch: each CLAUDE.md of its --files present in the tree that is its own node on --create,
                       or lies outside --planned
deleted by a dispatch: each CLAUDE.md of its --files absent from the tree
written by a dispatch: each CLAUDE.md of its --files present in the tree
existing nodes: the --planned paths present in the tree plus the present CLAUDE.md of a write wave --files outside --planned;
                only an existing node other than the root is ever off

stdout:
  NEXT: memory-node-writer | wave: <depth>   one per off node of the deepest remaining depth
  mode: fix
  node: <node>
  findings: none
  planned: <the existing nodes, root first, then by depth>
  refs: <plugin root>/references
  NEXT: none                                 when no off node remains

exit: 0; 2 with one "error: <reason>" line on stderr and an empty stdout
```

### C5 - misplaced line

File: viber/skills/rules/scripts/rules-map.sh

```
misplaced: <rule path> <area>
  printed after the dead: lines, alphabetical by rule path
```

### C6 - rules-map.sh --brief

File: viber/skills/rules/scripts/rules-map.sh

```
rules-map.sh --brief <map id> <target> [<target>]...
  <target>: a rule path under .claude/rules/ | a repo-relative directory (. for the root) | trail

  NEXT: rules-auditor
  target: <rule path> | none | trail
  scope: <globs, comma-separated> | ** | <directory> | <trail paths, comma-separated>
  matches: <n> | none
  out: .temp/viber/<map id>/
  refs: <plugin root>/references

  a rule matching no tracked file, instead of a block:
  AUDIT: <rule path> stale 0 gone 1 unverifiable 0 drop 0 miss 0 -> .temp/viber/<map id>/<slug>-audit.md
  file content: GONE: the rule's globs match no tracked file
  <slug>: the rule path below .claude/rules/ without .md, each / as --

exit: 0; 2 with one "error: <reason>" line on stderr and an empty stdout
```

### C7 - rules-map.sh --confirm

File: viber/skills/rules/scripts/rules-map.sh

```
rules-map.sh --confirm <map id> <target> [<target>]...      targets as in C6

findings files: <slug>-audit.md (rule), new--<slug>-audit.md (directory, new--root for .), _trail-audit.md (trail)
counted lines: STALE: GONE: DROP: MISS: (rule, directory); MISS: IGNORED: REJECTED: (trail)

layer already true:
  STOP: rules: the layer already holds, no writer dispatched

otherwise:
  confirm: <target> stale <n> gone <n> drop <n> miss <n>
  confirm: trail miss <n> ignored <n> rejected <n>
  confirm: <rule path> misplaced <area>
  confirm: <rule path> OVER-FILE
  confirm: total OVER-DIR
  confirm: <trail path> other <n>
  ASK: fold in -> write | stop -> stop
  NEXT: rules-writer
  map:
  id: <map id>
  state: <state>
  rule: ...          every rule: and dead: line of a kept rule target, verbatim
  trail: ...         every trail: line, only with the trail kept
  total: <chars> ok|OVER-DIR
  notes: .temp/viber/<map id>/
  refs: <plugin root>/references

exit: 0; 2 with one "error: <reason>" line on stderr and an empty stdout
```
