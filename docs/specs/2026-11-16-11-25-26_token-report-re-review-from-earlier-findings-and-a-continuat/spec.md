To build this plan you must invoke skill `viber:implementor` with `source:` path as its only argument.

# Token report, re-review from earlier findings and a continuation sentence in viber builds

## Goal

Make a finished viber build say how many tokens its agents spent, by role and model, so the tier policy and the review waivers can be judged on numbers. Make the second and later review rounds of a task start from the findings of the round before, so a failed round costs less. Make the close of a roadmap part say outright that the work continues, so a person or a supervising session does not read the build as the end.

## Problem

- A build reports its duration and its review rounds, never its tokens. Token usage is viber's stated design constraint, yet nobody can tell whether the coder, the reviewer or the close is the expensive part of a run.
- Each review round of a task is a fresh reviewer that never sees its own earlier report: only the coder gets it. The reviewer gates the whole task again even when an earlier Blocking finding still stands, and an earlier finding can come back reworded or not at all.
- After a roadmap part is built and a further part is left, the close ends on a bare `/viber:intent` command. Nothing on screen says the work is unfinished.

## Current behaviour

`implementor` composes the final summary in step 7 of its close: seven lines (tasks committed, review rounds, test verdict, elapsed time, what memory, rules and QA recorded, the form's own line), then the `red-check:` line and the lines the steps carried. In its archived form the summary goes to `closeout`, which writes it into `outcome.md`; in its screen form it prints. No script reads agent transcripts for a build.

A task's reviewer is dispatched fresh on every round with `task:`, `notes:`, `out:`, `refs:`, `deferred:`, `decision:`, `report:`, `extras:`, `scope:` and `red:` lines. After a `VERDICT: FAIL` the returned `REVIEW` path goes to the next coder attempt as `report:`. `run-failures.sh` already keeps a finding once when two rounds of one task hold it with the same cause and the same text.

With a `next: part` index line, the archived close prints `/viber:intent <path>/roadmap.md` as its last line, and the screen form ends on `/viber:intent <dir>/roadmap.md` unless the build ended on `abort`.

### Must not change

- Every sentence an existing `tests/viber/*-prose.unit.test.ts` pins stays word for word.
- The finding item format of `task-reviewer` (`- Blocking [<cause>] <path>:<line> - <what is wrong>`, `- Minor ...`) and its two severity levels.
- The archived close prints on screen only the lines it prints today plus the continuation sentence: no token line reaches the screen there.
- The order of the archived close: closing sentence, `/viber:rules extend` line, next-part command.
- The coder dispatch lines and what a coder receives after a failed review.

## Behaviour

### S1 - The build summary reports the tokens of the run's agents [NEW]

The summary of a finished build lists what its agents spent, one line per agent role and model.

Given a build whose agents ran on two models
When the build closes and is archived
Then `outcome.md` holds one `tokens:` line per agent role and model with input, output, cache read and cache write counts
And a last `tokens:` line says the main session and the closeout agent are not counted

### S2 - A build resumed in a new session counts the agents of every session [NEW]

Given a build that started in one session and was resumed in another
When the build closes
Then the token lines sum the agents of both sessions

### S3 - Unreadable transcripts leave one line and a normal close [NEW]

Given the transcripts of the run's agents cannot be found or read
When the build closes
Then the summary carries the single line `tokens: unavailable` with its reason
And the build closes exactly as it does today

### S4 - A re-review stops at an earlier finding that still stands [CHANGED - was: every round gated the whole task from scratch, without the previous report]

Given a task whose review failed and whose coder returned a new attempt
When the next reviewer finds one of the earlier Blocking findings still standing in the code
Then it returns `VERDICT: FAIL` with a report holding only the findings still standing
And it runs none of its full checks in that round

### S5 - A re-review with every earlier finding fixed gates the task in full [CHANGED - was: every round gated the whole task from scratch, without the previous report]

Given a task whose review failed and whose coder returned a new attempt
When the next reviewer finds every earlier Blocking finding fixed
Then it gates the whole task as on a first round

### S6 - The close tells the reader to continue with the next roadmap part [CHANGED - was: the close ended on the bare `/viber:intent` command]

Given a finished build whose roadmap has a further part
When the close prints
Then one sentence telling the reader to continue the work stands right before the `/viber:intent` command
And nothing starts by itself

### Edge cases

- A transcript message written over several lines -> counted once, with the usage of its last line.
- A counted transcript with no readable role beside it -> its tokens go under the role `unknown`.
- A transcript whose first prompt does not name the run directory -> not counted.
- A counted transcript holding assistant lines but no readable usage -> the whole report is the single `tokens: unavailable` line, never a partial sum.
- The token script exits non-zero -> the summary carries `tokens: unavailable`, the build asks nothing and goes on.
- The `closeout` agent starts after the report is computed -> its tokens are absent, and the last report line says so.
- The previous report file is missing -> the reviewer gates the task in full.
- A Minor finding of the previous report -> never rechecked.
- A finding carried into the next report -> its first line is copied character for character, so the failure trail keeps it once.
- A build ended on `abort` with a further roadmap part -> the screen form prints neither the sentence nor the command.

## Glossary

- Token report - the `tokens:` lines of a build summary: what the run's agents spent, by role and model. It is not a price and not the main session's usage.
- Previous report - the findings report a task's last failed review wrote, handed to the next reviewer of that task. It is not the coder's `report:` line.
- Continuation sentence - the one sentence of a close that tells the reader to continue the work with the next roadmap part. It starts nothing.

## Acceptance criteria

1. The build summary written to `outcome.md` carries the tokens the run's agents spent, one line per agent role and model with input, output, cache read and cache write counts, summed by a script over the agent transcripts of every session whose first prompt names the run directory; it reports tokens only, no price, and no `.claude/viber.yml` key turns it on or off.
2. The token report ends on one line saying what is not counted, the main session first; when the transcripts cannot be read the report is one `tokens: unavailable` line and the build closes as it does today.
3. From its second round on, a task's reviewer gets the path of the previous report and first checks each of its Blocking findings against the code: one still standing ends the round on `VERDICT: FAIL` with those findings alone and no full gate, and with all of them fixed the full gate runs as today. The reviewer stays a fresh agent in every round.
4. With a further roadmap part left, both close forms print one sentence telling the reader to continue the work right before the `/viber:intent <path>/roadmap.md` or `/viber:intent <dir>/roadmap.md` line; with no further part, and on the screen form after `abort`, the sentence does not appear. Nothing starts by itself.

## Scope

### File map

- add - viber/scripts/run-tokens.sh - reads the agent transcripts of one run and prints its token report
- add - tests/viber/run-tokens.test.ts - the script's cases on transcript fixtures in a temp directory
- modify - viber/skills/implementor/SKILL.md - the `previous:` line of the reviewer dispatch, the `allowed-tools` entry of the token script
- modify - viber/agents/task-reviewer.md - the Input rule for the previous report
- add - tests/viber/previous-review-prose.unit.test.ts - holds the `previous:` line and the reviewer's rule together
- modify - tests/viber/rule-budget.unit.test.ts - the `task-reviewer` read set cap
- modify - viber/skills/implementor/parts/close.md - the token call and its summary lines, the continuation sentence of both close forms
- modify - tests/viber/close-part-prose.unit.test.ts - the token call, its `allowed-tools` entry and its summary lines
- modify - tests/viber/roadmap-prose.unit.test.ts - the continuation sentence before the next-part command
- modify - viber/README.md - the token report and the continuation sentence in "How a run works"
- modify - viber/docs/files.md - `outcome.md` holding the token report
- modify - viber/skills/setup/assets/help.html - the same two facts, in `en` and `pl`

### Out of scope

- The list of places a person has to look at, and rules learned from merged pull request reviews.
- A price in dollars and any price table.
- A new `.claude/viber.yml` key.
- The tokens of the main session and of the `closeout` agent.
- `final-reviewer` and the plan reviewers: their rounds stay as they are.
- Starting the next roadmap part automatically, and writing the continuation sentence into `outcome.md` or `roadmap.md`.
- `viber/scripts/run-failures.sh`: it keeps merging a repeated finding by task, cause and text, unchanged.
- `tools/agent-context.ts`: the development tool keeps its own transcript reader.
- `tests/viber/extras-prose.unit.test.ts`, `tests/viber/ruling-prose.unit.test.ts`, `tests/viber/red-evidence-prose.unit.test.ts`, `tests/viber/repair-prose.unit.test.ts` and `tests/viber/nudge-prose.unit.test.ts`: they keep passing unchanged, since every sentence they pin in the reviewer dispatch, the `allowed-tools` line, the final summary and the two next-part lines stays.
- The fragments of `viber/skills/implementor/fragments/` (`red-check.true.md`, `baseline-run.fast.md`, `baseline-run.full.md`, `cleanup.true.md`, `extensions.on.md`, `final-review.true.md`, `memory.true.md`, `qa.true.md`, `rules.true.md`): they keep adding their own lines to the reviewer dispatch and carrying their own lines to the final summary as today.
- Every `CLAUDE.md` node naming the changed files (`viber/CLAUDE.md`, `viber/scripts/CLAUDE.md`, `viber/agents/CLAUDE.md`, `viber/skills/CLAUDE.md`, `tests/viber/CLAUDE.md`): the build's close updates them.

## Solution requirements

- `implementor` opens no file: the token lines reach it as the stdout of the script, never as a file it reads.
- The script runs under Git Bash on Windows and under bash 3.2 on macOS, with no `jq` and no Node.js, and carries the header comment with its `Contract:` block.
- The transcript layout is an undocumented interface of Claude Code. Verified on this machine: `<config dir>/projects/<project>/<session>/subagents/agent-<id>.jsonl` beside `agent-<id>.meta.json` (key `agentType`), each assistant line carrying `message.id`, `message.model` and `message.usage` (`input_tokens`, `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`). Anything else yields `tokens: unavailable`.
- The failure trail counts a carried-over finding once: this rests on the reviewer copying the finding's first line character for character.
- No heredoc, no em dash and no en dash in any file; every file in English, `help.html` in `en` and `pl`.
