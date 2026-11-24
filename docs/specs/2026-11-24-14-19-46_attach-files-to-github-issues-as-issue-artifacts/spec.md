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
