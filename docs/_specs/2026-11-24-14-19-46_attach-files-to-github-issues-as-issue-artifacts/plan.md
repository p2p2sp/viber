---
source: C:/Projects/viber/docs/_specs/2026-11-24-14-19-46_attach-files-to-github-issues-as-issue-artifacts/plan.md
planned: C:/Users/dario/.claude-dario/plans/linear-splashing-floyd-of-7989fcbc-1abb-42cb-90b6-aa34dd5b4d37.md
---

To build this plan you must invoke skill `viber:implementor` with `source:` path as its only argument.

# Attach files to GitHub issues as issue artifacts

## Goal

viber attaches files to a GitHub issue itself, as issue artifacts (gh 2.103 and later, a GitHub private preview). `viber:prototype` attaches its HTML mockup to the issue a run is tied to, and a new skill `/viber:attach` attaches any file a user names to an issue. Where the artifact cannot be created, the user gets the browser instruction viber gives today.

## Problem

A prototype run tied to an issue posts its conclusions as a comment and then asks the user to attach the HTML mockup in the browser by hand, and viber has no way at all to attach a file a user names to an issue. Every attachment is a manual browser step the user has to remember.

## Current behaviour

- `viber:prototype`, tied to an issue with `github.issues` on, offers at its exit to post the conclusions as a comment (`viber/scripts/post-comment.sh`), then names the mockup path and asks the user to attach it to that comment in the browser, "only the browser accepts an HTML attachment".
- No skill or script attaches any other file to an issue; nothing in viber calls `gh issue artifact`.
- The header of `viber/scripts/issue-create.sh` says `gh issue create` has no `--type` flag, which gh has had since 2.94.

### Must not change

- A prototype run not tied to an issue, or one whose user picks only the hand-off to `intent`, posts nothing to GitHub.
- The conclusions comment of a prototype run is still posted when no artifact can be created, through `post-comment.sh` as today, never retried after an uncertain result.
- `issue-create.sh` still sets the issue type through the REST call it makes today.

## Behaviour

### S1 - Prototype mockup lands on its issue [CHANGED - was: the user attached the mockup in the browser]

Given a prototype run tied to issue #42 in a repository enrolled in the issue artifacts preview, with gh 2.103 or later
When the user picks, at the exit question, to post the conclusions (alone or before the hand-off to `intent`)
Then the mockup becomes a new HTML artifact on #42, a new one on every such post, and the posted comment links it under its mockup section

### S2 - Prototype mockup cannot be attached [CHANGED - was: the same browser instruction after every posted comment]

Given a prototype run tied to issue #42 where the artifact cannot be created (gh older than 2.103, or GitHub refuses it)
When the user picks to post the conclusions
Then the comment is still posted, its mockup section says the mockup is attached by hand, and the skill names the mockup path and gh's reason and asks the user to attach the file in the browser

### S3 - User attaches files to an issue [NEW]

Given an issue #42 and local files `plan.md`, `menu.html`, `flow.png` and the link `https://example.com/runbook`
When the user runs `/viber:attach 42 plan.md menu.html flow.png https://example.com/runbook`
Then each becomes one artifact on #42 (a document, an HTML document, a document carrying the image, a link) and the skill reports the link of each

### S4 - A file viber cannot attach [NEW]

Given a file `report.pdf`, or a GitHub refusal for one file, or a gh older than 2.103
When the user runs `/viber:attach 42` with it
Then every file not attached is named with its reason and the instruction to attach it in the browser on the issue, while the other files are still attached

### S5 - A pull request or a missing file [NEW]

Given a pull request #7, or a file name that does not exist
When the user runs `/viber:attach 7 plan.md`, or `/viber:attach 42 missing.md`
Then nothing is created and the skill says why: artifacts exist on issues only, or the file is missing

### Edge cases

- A number GitHub resolves to a pull request -> refused like a pull request link, before anything is created.
- An image or video file -> one Markdown document named after the file, carrying the file as its attachment.
- A gh result saying the artifact was created but one of its attachments failed -> reported as created, with gh's reason after it.

## Glossary

- Issue artifact - a Markdown document, HTML document or link shown in the artifacts panel of a GitHub issue; not a GitHub Actions artifact and not a file attached to a comment.

## Acceptance criteria

1. A prototype run tied to an issue, whose user picks to post the conclusions, creates the mockup as a new HTML artifact on that issue on every such post and posts a comment whose mockup section links that artifact.
2. When that artifact is not created, the prototype run still posts the comment, its mockup section says the mockup is attached by hand, and the skill names the mockup path, gh's reason and the browser instruction.
3. `/viber:attach <issue> <file or link>...` creates one artifact per Markdown or text file, HTML file and http(s) link, and reports each artifact's link.
4. An image or video file given to `/viber:attach` becomes one Markdown document named after the file, carrying the file; when the file itself fails to upload, the document is reported as created with gh's reason.
5. A file of any other type, and a file GitHub refuses, is reported by `/viber:attach` with its reason and the instruction to attach it in the browser, while the other files are still attached.
6. With a gh that has no `gh issue artifact` command, `/viber:attach` attaches nothing and gives the browser instruction for every file, naming gh 2.103 as the version that brings the command.
7. A pull request reference, or a missing file, given to `/viber:attach` is refused before anything is created, the pull request with the sentence that artifacts exist on issues only.
8. Documentation criterion: `viber/README.md`, the root `README.md`, `viber/docs/configuration.md`, `docs/viber-functions.html` and the help page in both languages describe `/viber:attach` and the prototype mockup attached as an artifact, and no longer tell the user to attach the mockup by hand as the only way.
9. Comment criterion: the header of `viber/scripts/issue-create.sh` no longer says `gh issue create` has no `--type` flag.

## Scope

### File map

- add - viber/scripts/artifact-create.sh - the GitHub wrapper creating issue artifacts from local files and links (C1)
- add - tests/viber/artifact-create-fixture.ts - the SUT, the gh stub and the runner both tiers share; entry: `artifact-create.sh` argv
- add - tests/viber/artifact-create.critical.test.ts - the happy path; entry: `artifact-create.sh` argv
- add - tests/viber/artifact-create.test.ts - the rest of C1; entry: `artifact-create.sh` argv
- modify - viber/skills/prototype/SKILL.md - `allowed-tools` gains `artifact-create.sh`
- modify - viber/skills/prototype/fragments/issues-exit.true.md - creates the mockup artifact before posting the comment, and the fallback
- modify - viber/skills/prototype/templates/comment.md - a fifth section holding the artifact link or the by-hand line
- modify - tests/viber/skill-words.unit.test.ts - the prototype word cap, raised on purpose for the one `allowed-tools` entry
- add - viber/skills/attach/SKILL.md - the `/viber:attach` skill (C2)
- modify - viber/.claude-plugin/plugin.json - lists `./skills/attach/` after `./skills/commit/`
- modify - .claude/rules/plugin-manifests.md - its skill order sentence names `attach`
- modify - viber/skills/setup/assets/help.html - the `skill-attach` card and list entry; the prototype texts at the overview, the prototype guide and its card
- modify - viber/README.md - the `/viber:attach` row and the prototype bullet of "Working from GitHub issues"
- modify - README.md - the "More than the main loop" row for `/viber:attach`
- modify - viber/docs/configuration.md - the `github.issues` bullet: the mockup lands as an artifact
- modify - docs/viber-functions.html - the issues and prototype function lists
- modify - viber/scripts/issue-create.sh - its header comment on `--type`

### Out of scope

- Pull requests: GitHub accepts an artifact under a pull request number through REST, but does not show it on the pull request, and `gh` refuses it; `/viber:attach` refuses a pull request reference.
- `.url` Internet Shortcut files: only http(s) links given as arguments become links.
- The `Attachment:` hand-off lines of `intent`, `fixer` and `planner`, the plan's `attachments:` map and the run directory's `attachments/`.
- The intent summary comment (`intent/references/issue.md`), `qa-comment.sh`, `issue-create`, `pr-create`.
- Editing or replacing an existing artifact.
- `viber/docs/files.md`: `/viber:attach` writes no file in the host project, and the prototype writes the files it writes today.
- `viber/README.md` line 22 (the bare `Bash` allow): `/viber:attach` pre-approves its one script in its own `allowed-tools`.
- The `CLAUDE.md` nodes naming the GitHub wrappers and the skill list: the build close updates them.

## Solution requirements

- Works on Windows (Git Bash) and macOS.
- No gh version check before the attempt: an old gh is recognised from the failed attempt itself.
- A GitHub refusal of one file never stops the other files.
- A failed GitHub call is never retried, by the script or by a skill.
- `/viber:attach` works whatever the value of `github.issues`.

## Tasks

<!-- TASK -->
### T1 - Create issue artifacts from files and links through one wrapper
- TDD: required
- Covers: AC3, AC4, AC5
- Uses: C1
- Depends-on: none
- Files: viber/scripts/artifact-create.sh, tests/viber/artifact-create-fixture.ts, tests/viber/artifact-create.critical.test.ts, tests/viber/artifact-create.test.ts
- Delivers: `artifact-create.sh <issue> <file or link>...`, resolving the issue URL and creating one issue artifact per argument, with one result block per argument, as C1 states.
- Verification: node --test tests/viber/artifact-create.critical.test.ts tests/viber/artifact-create.test.ts tests/portability.unit.test.ts -> every case passes, and git ls-files -s viber/scripts/artifact-create.sh -> 100755
- DoD: a Markdown file, an HTML file and an http(s) link given for an issue create one artifact each on the issue URL and print one `CREATED=<issue URL>/artifacts/<n>` line each in argument order, exit 0; an image or video file creates one Markdown document named after the file carrying it through `--attach`; a gh `created` result line with a reason prints `CREATED=<link>` then `REASON=<gh reason>`, exit 1; a file of any other type prints `REFUSED=<file>` and reaches no gh call, the other arguments still processed, exit 1; a gh `failed` result line, or a create call printing no result line that is not the C1 unknown-command output, prints `FAILED=<file>` then `REASON=<gh reason>`, the next argument still processed, exit 1
<!-- /TASK -->

<!-- TASK -->
### T2 - Refuse what the wrapper cannot attach before creating anything
- TDD: required
- Covers: AC6, AC7
- Uses: C1
- Depends-on: T1
- Files: viber/scripts/artifact-create.sh, tests/viber/artifact-create.test.ts
- Delivers: the exits of `artifact-create.sh` that create nothing: a gh without the artifact command, a failed issue lookup, a pull request reference and a missing file, as C1 states.
- Verification: node --test tests/viber/artifact-create.test.ts tests/viber/artifact-create.critical.test.ts -> every case passes
- DoD: a first create call answered by the C1 unknown-command output exits 3 with the C1 gh-too-old `ERROR` line, empty stdout and no further gh call; an issue lookup that fails exits 1 with one `ERROR artifact-create.sh:` line carrying gh's message and empty stdout; a `.../pull/<N>` reference, or a number whose lookup returns a `/pull/` URL, exits 2 with the C1 pull request `ERROR` line and no create call; a file argument that does not exist exits 2 with one `ERROR` line naming it and no gh call
<!-- /TASK -->

<!-- TASK -->
### T3 - Attach the prototype mockup to its issue as an HTML artifact
- TDD: none
- Covers: AC1, AC2
- Uses: C1
- Depends-on: T2
- Files: viber/skills/prototype/SKILL.md, viber/skills/prototype/fragments/issues-exit.true.md, viber/skills/prototype/templates/comment.md, tests/viber/skill-words.unit.test.ts
- Delivers: the prototype exit that, on posting the conclusions of a run tied to an issue, creates the mockup artifact first and links it from the comment, falling back to the browser instruction.
- Verification: grep -n "artifact-create.sh" viber/skills/prototype/SKILL.md viber/skills/prototype/fragments/issues-exit.true.md viber/scripts/artifact-create.sh -> a line in each of the three files, grep -n "keep all five" viber/skills/prototype/templates/comment.md -> one line, and node --test tests/viber/skill-words.unit.test.ts tests/portability.unit.test.ts -> every case passes
- DoD: `prototype/SKILL.md` `allowed-tools` lists `Bash(${CLAUDE_PLUGIN_ROOT}/scripts/artifact-create.sh:*)`; `issues-exit.true.md` runs `"${CLAUDE_PLUGIN_ROOT}/scripts/artifact-create.sh" "<URL>" "<mockup path>"` once per post, before writing the comment, on each option that posts the comment; on exit 0 the comment's mockup section holds the `CREATED=` link; on any other exit the comment is still posted with its mockup section saying the mockup is attached by hand, and the skill reports gh's reason (`REASON=` or the `ERROR` line) and the mockup path and asks the user to attach it in the browser; `templates/comment.md` holds a mockup section as its fifth heading and its fill rules say "keep all five" and name the artifact link or the by-hand line; the prototype cap of `skill-words.unit.test.ts` is raised to the file's new word count
<!-- /TASK -->

<!-- TASK -->
### T4 - Add the /viber:attach skill
- TDD: none
- Covers: AC3, AC4, AC5, AC6, AC7
- Uses: C1, C2
- Depends-on: T2
- Files: viber/skills/attach/SKILL.md, viber/.claude-plugin/plugin.json, viber/skills/setup/assets/help.html, .claude/rules/plugin-manifests.md
- Delivers: the `/viber:attach` skill, which runs `artifact-create.sh` once on the user's issue and files and reports each result, listed in `plugin.json`, in the skill order of `plugin-manifests.md` and carded on the help page.
- Verification: grep -n "artifact-create.sh" viber/skills/attach/SKILL.md viber/scripts/artifact-create.sh -> a line in each, and node --test tests/viber/help.unit.test.ts tests/portability.unit.test.ts -> every case passes
- DoD: `attach/SKILL.md` carries the frontmatter of C2 and runs `"${CLAUDE_PLUGIN_ROOT}/scripts/artifact-create.sh" <issue> <files>` as one literal line; it reports every `CREATED=` link, with its `REASON=` when one follows; it names every `REFUSED=` and `FAILED=` file with its reason and the instruction to attach it in the browser on the issue; on exit 3 it gives that instruction for every file and names gh 2.103; on exit 2 or an exit 1 with no stdout it reports the `ERROR` line and never retries; `plugin.json` lists `./skills/attach/` after `./skills/commit/`, the skill order sentence of `.claude/rules/plugin-manifests.md` names `attach` after `commit`, and `help.html` holds a `skill-attach` card and list entry in both languages, the card's `Switches` saying it works whatever `github.issues` reads
<!-- /TASK -->

<!-- TASK -->
### T5 - Describe issue artifacts in the user guides
- TDD: none
- Covers: AC8
- Uses: none
- Depends-on: T4
- Files: viber/README.md, README.md, viber/docs/configuration.md, docs/viber-functions.html, viber/skills/setup/assets/help.html
- Delivers: the user guides describing `/viber:attach` and the prototype mockup attached as an artifact, with the browser as the fallback.
- Verification: grep -n "viber:attach" viber/README.md README.md docs/viber-functions.html -> a line in each, grep -n "./skills/attach/" viber/.claude-plugin/plugin.json -> one line, grep -c "browser accepts\|yourself in the browser\|Makietę dołącz" viber/README.md viber/skills/setup/assets/help.html docs/viber-functions.html -> 0 in each, grep -n "artifact" viber/docs/configuration.md -> a line, and node --test tests/viber/help.unit.test.ts -> every case passes
- DoD: `viber/README.md` has a `/viber:attach` row in "Start a change" and its "Working from GitHub issues" prototype bullet says the mockup lands on the issue as an HTML artifact, with the browser as the fallback; the root `README.md` has a "More than the main loop" row for `/viber:attach`; `viber/docs/configuration.md`'s `github.issues` bullet says the posted conclusions carry the mockup as an artifact; `docs/viber-functions.html` lists `/viber:attach` and the mockup artifact in place of the by-hand line; `help.html` says the same at the overview, the prototype guide and the prototype card `Switches`, in both languages, worded without "browser accepts", "yourself in the browser" or "Makietę dołącz"
<!-- /TASK -->

<!-- TASK -->
### T6 - Correct the --type note in the issue-create header
- TDD: none
- Covers: AC9
- Uses: none
- Depends-on: none
- Files: viber/scripts/issue-create.sh
- Delivers: the header comment of `issue-create.sh` stating that it sets the type through REST, with no claim that `gh issue create` lacks `--type`.
- Verification: grep -c "no \`--type\` flag" viber/scripts/issue-create.sh -> 0, grep -n "X PATCH" viber/scripts/issue-create.sh -> the PATCH call still present, and node --test tests/viber/issue-create.critical.test.ts -> every case passes
- DoD: the header no longer says `gh issue create` has no `--type` flag; the header still names the REST PATCH that sets the type
<!-- /TASK -->

## Contracts

### C1 - artifact-create.sh

File: viber/scripts/artifact-create.sh

```
#!/bin/sh, POSIX, mode 100755, header with a Contract: block
artifact-create.sh <issue> <file or link>...
  <issue>: <N>, #<N> or https://<host>/<owner>/<repo>/issues/<N> (a #... fragment or ?... query dropped);
           https://<host>/<owner>/<repo>/pull/<N> -> exit 2 (pull request line)
  <file or link>: one or more; an http(s) link, or a path resolved from the cwd that must exist
  lookup: gh issue view <issue> --json url --jq .url -> the issue URL; a URL holding /pull/ -> exit 2 (pull request line)
  per argument, in order, one gh call on the issue URL; non-TTY output, one result line:
    <status> TAB <number> TAB <name> TAB <source> TAB <reason>     (status: created | failed)
    .md .markdown .txt, .html .htm, http(s) link
        -> gh issue artifact create <issue URL> <file or link>
    .png .jpg .jpeg .gif .mp4 .mov .webm
        -> gh issue artifact create <issue URL> --name <file base name> --body <file base name> --attach <file>
    any other extension -> no gh call
  unknown-command output (gh before 2.103): exit status non-zero and output holding
    unknown command "artifact" for "gh issue"
stdout, one block per argument, in argument order:
  CREATED=<issue URL>/artifacts/<number>   status created
  REASON=<reason>                          after CREATED= when the reason is non-empty
  REFUSED=<file>                           an extension outside the table
  FAILED=<file>                            status failed, or no result line
  REASON=<reason or gh output on one line> after FAILED=
exit: 0 every argument CREATED with an empty reason
      1 any REFUSED, FAILED or CREATED with a reason; or the lookup failed (ERROR line, empty stdout)
      2 bad arguments, a missing file or a pull request (ERROR line, empty stdout, no create call)
      3 the unknown-command output on the first create call (ERROR line, empty stdout, no further call)
stderr, one line each:
  ERROR artifact-create.sh: <issue> is a pull request; artifacts exist on issues only
  ERROR artifact-create.sh: gh has no issue artifact command; it needs gh 2.103 or later
  ERROR artifact-create.sh: file not found: <file>
  ERROR artifact-create.sh: issue lookup failed: <gh output on one line>
```

### C2 - attach skill frontmatter

File: viber/skills/attach/SKILL.md

```
name: attach
description: Attaches files or links the user names (Markdown, text, HTML, images, video, links) to a GitHub issue as issue artifacts. Use when the user asks to attach, upload or add a file to an issue.
argument-hint: "<issue number or URL> <file or link>..."
allowed-tools: Bash(${CLAUDE_PLUGIN_ROOT}/scripts/artifact-create.sh:*)
model: sonnet
```
