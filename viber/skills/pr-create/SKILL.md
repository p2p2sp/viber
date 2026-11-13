---
name: pr-create
description: Opens a pull request for the current branch. Only on the user's request.
allowed-tools: Read, Edit(./.temp/viber/pr-create/**), Bash(${CLAUDE_PLUGIN_ROOT}/scripts/pr-facts.sh:*), Bash(${CLAUDE_PLUGIN_ROOT}/scripts/pr-create.sh:*), Bash(${CLAUDE_PLUGIN_ROOT}/scripts/qa-comment.sh:*), Bash(date:*)
user-invocable: true
model: sonnet
---

# pr-create

One pull request for the current branch. The block below is trusted: never resolve the branch, the target, the template or the commits yourself.

```!
"${CLAUDE_PLUGIN_ROOT}/scripts/pr-facts.sh"
```

Every later run of a bundled script is one literal Bash line, `"${CLAUDE_PLUGIN_ROOT}/scripts/<name>.sh" <args>`, every argument double-quoted: never prefixed with an interpreter word, never assigned to a variable, never preceded by `cd`, never chained with `;`.

## 1. Stop reasons

`STATUS=stop` -> state in one line why no pull request can be opened, then end:

- `no-gh`: GitHub command line tool missing.
- `no-repo`: no GitHub repository reachable.
- `detached`: HEAD is detached; check out a branch.
- `dirty`: uncommitted changes to tracked files; commit them first.
- `on-base`: `BRANCH=` is the default branch or a work entry's base or target; a pull request needs its own branch.
- `pr-exists`: the branch already has an open pull request. With `QA=` set, go to step 7. Otherwise give its `PR_URL=`.
- `no-commits`: nothing on the branch is ahead of its target.
- `unknown-entry`: the entry named is not a `branching.work` entry.

## 2. Entry and target

`STATUS=ready` with `ENTRY=` and `TARGET=` both empty:

- `MODE=off` -> one `AskUserQuestion` for the target branch, `DEFAULT=` offered first. Rerun `"${CLAUDE_PLUGIN_ROOT}/scripts/pr-facts.sh" --target "<branch>"`.
- Otherwise one `AskUserQuestion` over the `CANDIDATE=` lines, one option each, labelled by the line's `<key> | target: <branch>` text. Rerun with `--entry "<key>"`, the `<key>` before ` | `.

The rerun's block replaces the first one and is read from step 1 again.

## 3. Title

- `ISSUE_TITLE=` set -> `[<first ISSUE=>] <ISSUE_TITLE=>`, the issue title copied verbatim; `TITLE_PATTERN=` is ignored.
- `ISSUE_TITLE=` empty -> `TITLE_PATTERN=` with these replaced, then each run of blanks collapsed to one and trimmed:
  - `{type}` -> the `TYPE=` value.
  - `{summary}` -> one line stating the change, in the language of `SPEC=`'s file, else of this conversation.
  - `{issue-number}` -> the first `ISSUE=` value, empty when none.
  - `{entry}` -> the `ENTRY=` value, empty when none.

## 4. Body

Fill from `SPEC=`'s file (`Read`), the `COMMIT=` lines and this conversation, never from anything else: a value none of them states is never invented. No secrets, credentials or file contents: the pull request may be public. No Claude or Claude Code attribution (no "Generated with Claude Code" line, no `Co-Authored-By`).

- `TEMPLATE=` set -> `Read` it and fill each section in template order. The four placeholders of step 3 are replaced wherever they stand. A section none of the three sources answers reads `_No response_`. Every HTML comment of the template is dropped. A checkbox stays unchecked unless a source states it done.
- `TEMPLATE=` empty -> the sections `## Summary`, `## Changes` and `## Testing`, filled the same way.

End the body with one line per `ISSUE=` value, after a blank line: `Closes #<n>` when `CLOSES=yes`, `Refs #<n>` otherwise.

## 5. Preview

`Write` the body to `<root>/.temp/viber/pr-create/body-<stamp>.md` first (`<root>` the project root, `<stamp>` the output of `date +%Y-%m-%d-%H-%M-%S`, so every body gets its own file). Then print, never the body text:

- `Title: <title>`
- `Target: <TARGET=>`
- when `QA=` is set, one line saying the build's QA document (`QA=`) will be posted as a comment on the run's issue, or on the new pull request when the run has none
- `Body: <absolute path of the written body file>`

Then one `AskUserQuestion`: create, create as draft or cancel. A correction typed as the answer -> rewrite that same file, then preview again. Cancel -> stop, nothing created.

## 6. Create

Run `"${CLAUDE_PLUGIN_ROOT}/scripts/pr-create.sh" "<file>" "<title>" --base "<TARGET>"` with the file of step 5, plus ` --draft` for the draft answer.

- Exit 0 -> report `PR_URL=`, plus one line that the pull request stays unassigned when `ASSIGNEE=dropped` (the script assigns its author itself), then, when `QA=` is set, run `"${CLAUDE_PLUGIN_ROOT}/scripts/qa-comment.sh" "<QA>" --pr "<PR_URL>"` with that `PR_URL=` and report the result as step 7 says. Never retry it.
- Exit 1 -> report its `ERROR` line. Never retry.
- Exit 2 -> report its `ERROR` line; nothing was pushed.

## 7. QA comment of an existing pull request

Only on a `pr-exists` stop with `QA=` set, asked no question: run `"${CLAUDE_PLUGIN_ROOT}/scripts/qa-comment.sh" "<QA>" --pr "<PR_URL>"`, the stop's `PR_URL=`. Never retry. Either call posts on the run's issue when it has one, the pull request otherwise. Either call's result:

- Exit 0, `STATUS=posted` -> report `COMMENT_URL=`.
- Exit 0, `STATUS=skip` -> report its `REASON=` in one line.
- Exit 1 or 2 -> report its `ERROR` line.

You run no test and change no code: the pull request and its QA comment are the only output. End on the `COMMENT_URL=` or the skip reason of a `pr-exists` stop's call, else on the `PR_URL=` and the comment's result, or on the reason there is none.
