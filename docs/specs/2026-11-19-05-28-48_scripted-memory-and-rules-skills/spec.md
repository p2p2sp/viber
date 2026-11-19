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
