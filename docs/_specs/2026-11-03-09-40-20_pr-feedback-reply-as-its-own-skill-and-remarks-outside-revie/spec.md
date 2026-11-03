To build this plan you must invoke skill `viber:implementor` with `source:` path as its only argument.

# pr-feedback-reply as its own skill, and remarks outside review threads

## Goal

Posting the replies of a pull request's feedback becomes its own user-only skill, `/viber:pr-feedback-reply`, so `/viber:pr-feedback` only collects. Collecting also reaches the remarks a reviewer leaves outside review threads: the pull request's Conversation comments and the bodies of submitted reviews, so every remark can become a plan task and get a reply.

## Problem

`/viber:pr-feedback` mixes two flows behind a `--reply` flag and reads only unresolved review threads. A reviewer often writes a remark in the Conversation tab or in the summary of a review ("Request changes: please also rename X"); those remarks never reach the plan and never get an answer, so the user has to handle them by hand.

## Current behaviour

`/viber:pr-feedback <PR>` runs `pr-threads.sh`, lists the unresolved review threads not yet answered by viber, lets the user choose, writes `review.md` and invokes `viber:intent`. `/viber:pr-feedback <PR> --reply` checks the head is pushed, lists the reply files ready under `replies/`, asks once and posts each through `pr-reply.sh` into its thread, at most once per thread thanks to the marker `<!-- viber:pr-feedback <comment-id> -->`. Conversation comments and review bodies are never read.

### Must not change

- Review threads are listed as today, threads opened by the pull request author or by a bot included, and a thread whose latest comment opens with the viber marker is skipped.
- A thread reply goes through `pulls/<N>/comments/<id>/replies` with the marker `<!-- viber:pr-feedback <id> -->`, so replies already posted are still recognised.
- The `no-gh`, `no-repo` and `wrong-branch` stops and the `PUSHED=` check.
- Nothing is resolved, pushed, branched or retried.

## Behaviour

### S1 - Collect remarks outside threads [CHANGED - was: only review threads]

Given a pull request whose reviewer left an unresolved thread, a Conversation comment and a "Request changes" review with a body
When the user runs `/viber:pr-feedback <PR>` on the head branch
Then the list shows the thread, the Conversation comment and the review body, each classified, and `review.md` gets one section per chosen remark with its kind and key

### S2 - Leave out what needs no answer [NEW]

Given Conversation comments and review bodies written by the pull request author, by a bot, with an empty body, or already answered by a viber comment carrying their marker
When the user runs `/viber:pr-feedback <PR>`
Then none of them is listed; those by the author, by a bot or already answered are counted as skipped, an empty one is not counted

### S3 - Post the replies [CHANGED - was: `/viber:pr-feedback <PR> --reply`]

Given the fixes are pushed and the build wrote reply files for a thread, a Conversation comment and a review body
When the user runs `/viber:pr-feedback-reply <PR>` and confirms
Then the thread reply lands in its thread, and each other remark gets its own new pull request comment opening with its marker, quoting the remark's first line and linking to it, then the reply

### S4 - A second run posts nothing twice [NEW]

Given every reply was posted
When the user runs `/viber:pr-feedback-reply <PR>` again
Then each remark of every kind reports skip, exists; and `/viber:pr-feedback <PR>` lists none of them

### S5 - The old flag [CHANGED - was: selected the reply flow]

Given the user types `/viber:pr-feedback <PR> --reply`
When the skill reads its arguments
Then it ends on one line naming `/viber:pr-feedback-reply <PR>` and does nothing else

### Edge cases

- A review body holding only whitespace -> treated as empty, not listed.
- A Conversation comment whose first line is any viber marker -> it is a viber reply, never listed and not counted.
- A remark author with no account (`ghost`) -> not a bot, listed.
- More than 100 Conversation comments or reviews -> only the first 100 of each are read and `TRUNCATED=yes`.
- A remark whose original cannot be read when posting (deleted) -> exit 1 with one ERROR line, nothing posted, the next reply still posted.

## Glossary

- Remark - a Conversation comment or a non-empty review body of the pull request; not a review thread.
- Remark key - the id viber uses for a remark or thread: `comment-<id>`, `review-<id>` or a thread's bare first comment id; it names the marker, the reply file and the posted body file.

## Acceptance criteria

1. A ready `pr-threads.sh` run prints one `REMARK=` line per Conversation comment and non-empty review body, numbered after the threads, and writes each into the threads file; empty remarks and Conversation comments opening with a viber marker are not listed and not counted; remarks by the pull request author, by a bot, or with a pull request comment opening with their marker are not listed and are counted in `SKIPPED=`; a remark with no author account is listed; `TRUNCATED=yes` when any of the three sources has a further page; threads are listed as today.
2. `pr-reply.sh` given a `comment-<id>` or `review-<id>` key posts one new pull request comment whose body is the marker, the quoted first line of the remark, its link and the reply file, and prints `STATUS=posted` with the comment URL; with a pull request comment already opening with that marker it prints `STATUS=skip`, `REASON=exists` and posts nothing; a bare id behaves as today.
3. `/viber:pr-feedback` classifies and offers threads and remarks alike, writes each chosen one into `review.md` with its kind and key, prints `/viber:pr-feedback-reply <PR_URL>` as the reply command, and ends on one line naming that command when given `--reply`.
4. `/viber:pr-feedback-reply <PR>` is a user-only skill that stops unless the head is pushed, lists ready and missing replies of every kind, asks once and posts each through `pr-reply.sh` with the section's key.
5. The help page has a `skill-pr-feedback-reply` card in English and Polish, and `viber/README.md`, `viber/docs/files.md` and `docs/viber-functions.html` describe the two skills and the remark kinds.

## Scope

### File map

- modify - viber/scripts/pr-threads.sh - reads Conversation comments, reviews and the pull request author; prints `REMARK=` lines; writes remark sections
- modify - tests/viber/pr-threads.test.ts - stub output and cases for remarks
- modify - viber/scripts/pr-reply.sh - accepts remark keys, posts remark replies as pull request comments
- modify - tests/viber/pr-reply.test.ts - stub and cases for remark replies
- modify - viber/skills/pr-feedback/SKILL.md - collect only, three kinds, new reply command, `--reply` pointer
- add - viber/skills/pr-feedback-reply/SKILL.md - the reply flow
- modify - viber/.claude-plugin/plugin.json - lists the new skill after `pr-feedback`
- modify - viber/skills/setup/assets/help.html - both cards and the command list entry
- modify - viber/README.md - command table and details
- modify - viber/docs/files.md - `.temp/viber/pr-feedback/` written by both skills
- modify - docs/viber-functions.html - the feature section

### Out of scope

- The `CLAUDE.md` nodes (`viber/CLAUDE.md`, `viber/skills/CLAUDE.md`, `viber/scripts/CLAUDE.md`, `viber/scripts/CLAUDE.github.md`): the build's memory close updates them.
- `.claude/rules/plugin-manifests.md` keeps its skill order sentence as it is (it already omits `pr-feedback`); the rules close may revise it.
- `viber/BRANCHING.md` line 50: `/viber:intent` is still started by `/viber:pr-feedback`, the sentence stays true.
- `tests/viber/root-cause-prose.unit.test.ts` only names pr-feedback in a test title; unchanged.
- The archived runs under `docs/specs/`: history, never edited.
- New `viber.yml` settings, resolving threads, paging past 100 items, changing the thread marker.

## Solution requirements

- `pr-threads.sh` and `pr-reply.sh` stay POSIX `#!/bin/sh`, pass the portability sweep, keep their exec bit and keep their header `Contract:` block true to the code.
- The new skill follows the skill-designer doctrine and passes `lint_skill.sh`.
- Every shipped text in English, no em or en dash.
