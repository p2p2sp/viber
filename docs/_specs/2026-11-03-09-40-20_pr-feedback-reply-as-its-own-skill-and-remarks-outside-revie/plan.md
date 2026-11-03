---
source: C:/Projects/viber/docs/_specs/2026-11-03-09-40-20_pr-feedback-reply-as-its-own-skill-and-remarks-outside-revie/plan.md
---

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

## Tasks

<!-- TASK -->
### T1 - List Conversation comments and review bodies as remarks
- TDD: required
- Covers: AC1
- Uses: C1, C2, C3
- Depends-on: none
- Files: viber/scripts/pr-threads.sh, tests/viber/pr-threads.test.ts
- Delivers: `pr-threads.sh` reads the pull request author, the first 100 Conversation comments and the first 100 reviews alongside the threads, prints the `REMARK=` lines of C1 and writes the remark sections of C2, with the header contract updated
- Verification: node --test tests/viber/pr-threads.test.ts -> every case passes, the new remark cases included
- DoD: a Conversation comment and a non-empty review body each print a `REMARK=` line of C1 numbered after the threads, with key `comment-<id>` or `review-<id>` of C3; a remark with an empty or whitespace-only body, or a Conversation comment opening with a viber marker, prints no `REMARK=` line and leaves `SKIPPED=` unchanged; a remark by the pull request author, by a C3 bot, or with a Conversation comment whose first line is its C3 marker prints no line and raises `SKIPPED=` by one, while a remark with a null author prints its `REMARK=` line with author `ghost`, also when the pull request author is null; `TRUNCATED=yes` when the comments or the reviews report a further page; the threads file holds one C2 section per listed remark after the thread sections; a thread opened by the pull request author or a bot is still listed as a `THREAD=` line
<!-- /TASK -->

<!-- TASK -->
### T2 - Post remark replies as pull request comments
- TDD: required
- Covers: AC2
- Uses: C3, C4
- Depends-on: none
- Files: viber/scripts/pr-reply.sh, tests/viber/pr-reply.test.ts
- Delivers: `pr-reply.sh` accepts a remark key of C3 as its second argument and posts the remark reply of C4, the thread path unchanged, with the header contract updated
- Verification: node --test tests/viber/pr-reply.test.ts -> every case passes, the new remark cases included
- DoD: a key other than digits, `comment-<digits>` or `review-<digits>` exits 2 with gh never called; a remark key with a pull request comment whose first line is its marker prints `STATUS=skip` and `REASON=exists` and posts nothing; a remark key otherwise reads the original from the C4 endpoint of its kind and posts one comment to the issue comments endpoint with the C4 body, kept under `posted/<key>.md`; the run prints `STATUS=posted` and a `REPLY_URL=` ending in `#issuecomment-<digits>`; a failed read of the original, a failed post or no well-formed URL exits 1 with one ERROR line and nothing on stdout; a bare thread id still reads and posts through the thread endpoints with the thread marker
<!-- /TASK -->

<!-- TASK -->
### T3 - Split the reply flow into the pr-feedback-reply skill
- TDD: none
- Covers: AC3, AC4, AC5
- Uses: C1, C3, C4, C5
- Depends-on: T1, T2
- Files: viber/skills/pr-feedback/SKILL.md, viber/skills/pr-feedback-reply/SKILL.md, viber/.claude-plugin/plugin.json, viber/skills/setup/assets/help.html, viber/README.md, viber/docs/files.md, docs/viber-functions.html
- Delivers: `pr-feedback` collects threads and remarks into the C5 `review.md` and only points to the reply skill; the new user-only `pr-feedback-reply` carries the push check, the ready list, the single question and the posting by key; the plugin manifest, help page and user docs describe both skills
- Verification: node --test tests/viber/help.unit.test.ts tests/portability.unit.test.ts && bash viber/skills/skill-designer/scripts/lint_skill.sh viber/skills/pr-feedback-reply && bash viber/skills/skill-designer/scripts/lint_skill.sh viber/skills/pr-feedback && grep -l "REMARK=" viber/scripts/pr-threads.sh viber/skills/pr-feedback/SKILL.md && grep -l "issuecomment" viber/scripts/pr-reply.sh viber/skills/pr-feedback-reply/SKILL.md -> both test files pass, both lints print `FAIL=0`, each grep lists both of its files
- DoD: `pr-feedback/SKILL.md` classifies `THREAD=` and `REMARK=` items alike, reports `SKIPPED=` as the count of threads and remarks left out, writes `review.md` per C5 and prints `/viber:pr-feedback-reply <PR_URL>`; `pr-feedback/SKILL.md` given `--reply` ends on one line naming `/viber:pr-feedback-reply <pull request>` and no longer holds a reply step or `pr-reply.sh` in its `allowed-tools`; `pr-feedback-reply/SKILL.md` is `disable-model-invocation: true`, allows `pr-threads.sh` and `pr-reply.sh`, stops on `PUSHED=no`, lists ready and missing replies from `review.md`, asks once and passes each section's `Comment:` key to `pr-reply.sh`, reporting the `REPLY_URL=` of a thread or remark alike and, after an exit 1 or 2, its ERROR line before going on to the next reply; `plugin.json` lists `./skills/pr-feedback-reply/` right after `./skills/pr-feedback/`; `help.html` has a `skill-pr-feedback-reply` card and command list entry in both languages and the `skill-pr-feedback` card names the remark kinds and the new reply command; `viber/README.md`, `viber/docs/files.md` and `docs/viber-functions.html` name both skills, the remark kinds and no `--reply` flag
<!-- /TASK -->

## Contracts

### C1 - pr-threads.sh remark line

File: viber/scripts/pr-threads.sh

```
REMARK=<k> | <key> | <author> | conversation|review
```

Printed on a ready run after the last `THREAD=` line, one per listed remark, Conversation comments first then reviews, each oldest first; `<k>` continues the thread numbering (first remark is the thread count plus 1). `<key>` per C3. All other stdout lines keep their order and form; `SKIPPED=` counts the skipped threads plus the remarks left out as by the pull request author, by a bot or answered (an empty remark or a viber reply comment is not counted); `TRUNCATED=yes` when threads, Conversation comments or reviews report a further page.

### C2 - threads file remark section

File: viber/scripts/pr-threads.sh

```
## <k> - conversation
comment-id: <key>

### <author> - <createdAt>

<body, carriage returns dropped>
```

A review section heads `## <k> - review (<state>)`, `<state>` the review state (`APPROVED`, `CHANGES_REQUESTED`, `COMMENTED`, `DISMISSED`). Sections follow the thread sections, a blank line before each heading.

### C3 - remark key and marker

File: none

```
key    : <databaseId>            a review thread (its first comment)
         comment-<databaseId>    a Conversation comment
         review-<databaseId>     a review body
marker : <!-- viber:pr-feedback <key> -->
```

A remark is answered when a Conversation comment of the pull request has the marker as its first line. A Conversation comment whose first line opens with `<!-- viber:pr-feedback ` is a viber reply. A bot author is one whose GraphQL `__typename` is `Bot` (GraphQL gives bot logins without the `[bot]` suffix the REST API shows, so this check is the login rule). The pull request author is matched by login only when both logins are non-null; a null remark author is never the pull request author and is printed as `ghost`.

### C4 - pr-reply.sh remark reply

File: viber/scripts/pr-reply.sh

```
argv   : $1 pull request (as today); $2 key per C3; $3 reply file
read   : gh api --paginate repos/<slug>/issues/<N>/comments   (first body line of each; skip when one equals the marker)
original: comment-<id> -> repos/<slug>/issues/comments/<id>
          review-<id>  -> repos/<slug>/pulls/<N>/reviews/<id>
          (its html_url and its first non-blank body line)
post   : gh api -X POST repos/<slug>/issues/<N>/comments -F body=@<body file>
body   : <repo root>/.temp/viber/pr-feedback/<N>/posted/<key>.md
           line 1  <!-- viber:pr-feedback <key> -->
           line 2  empty
           line 3  > <first non-blank line of the original>
           line 4  empty
           line 5  <html_url of the original>
           line 6  empty
           then    the reply file verbatim
stdout : STATUS=posted / REPLY_URL=https://<host>/<owner>/<repo>/pull/<N>#issuecomment-<digits>
         or STATUS=skip / REASON=exists
exit   : as today; 1 also when reading the original fails
```

`--hostname <host>` on every call for a URL pull request, as today.

### C5 - review.md shape

File: none

```
# Review feedback: <PR_URL>
Reply command: /viber:pr-feedback-reply <PR_URL>

## <k> - <problem|question> - <where>
- Kind: thread|conversation|review
- Comment: <key>
- Outdated: yes|no                       (thread only)
- Reply file: <root>/.temp/viber/pr-feedback/<N>/replies/<key>.md
- Expected: <one line>
> <the remark, quoted>
```

`<where>` is `<path>:<line>` for a thread, `conversation` or `review` for a remark.
