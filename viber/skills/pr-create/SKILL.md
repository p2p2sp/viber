---
name: pr-create
description: Opens a pull request for the current branch. Only on the user's request.
allowed-tools: Read, Edit(./.temp/viber/pr-create/**), Bash(${CLAUDE_PLUGIN_ROOT}/scripts/pr-facts.sh:*), Bash(${CLAUDE_PLUGIN_ROOT}/scripts/pr-create.sh:*), Bash(${CLAUDE_PLUGIN_ROOT}/scripts/qa-comment.sh:*)
user-invocable: true
model: sonnet
---

# pr-create

One pull request for the current branch. The block below is trusted: never resolve the branch, the target, the template or the commits yourself.

```!
"${CLAUDE_PLUGIN_ROOT}/scripts/pr-facts.sh"
```

Every later run of a bundled script is one literal Bash line, `"${CLAUDE_PLUGIN_ROOT}/scripts/<name>.sh" <args>`, every argument double-quoted: never prefixed with an interpreter word, never assigned to a variable, never preceded by `cd`, never chained with `;`. A `RERUN=` line is that line as printed, its slot filled.

## 1. Stop

`STATUS=stop` -> say its `SAY=` line in one line, then end. `REASON=pr-exists` with `QA=` set goes to step 7 instead, asking no question.

## 2. Entry and target

`STATUS=ready` with `ASK=` printed:

- `ASK=target` -> one `AskUserQuestion` for the target branch, `DEFAULT=` offered first. Run `RERUN=` with `<branch>` replaced by the answer.
- `ASK=entry` -> one `AskUserQuestion` over the `CANDIDATE=` lines, one option each, labelled by the line's `<key> | target: <branch>` text. Run `RERUN=` with `<key>` replaced by the key before ` | `.

The rerun's block replaces the first one and is read from step 1 again.

## 3. Title

- `TITLE=` set -> that title, as printed.
- Otherwise `TITLE_TEMPLATE=` with `{summary}` replaced by one line stating the change, in the language of `SPEC=`'s file, else of this conversation.

## 4. Body

Fill from `SPEC=`'s file (`Read`), the `COMMIT=` lines and this conversation, never from anything else: a value none of them states is never invented. No secrets, credentials or file contents: the pull request may be public. No Claude or Claude Code attribution (no "Generated with Claude Code" line, no `Co-Authored-By`).

- `TEMPLATE=` set -> `Read` it and fill each section in template order. `{type}`, `{issue-number}`, `{entry}` and `{summary}` are replaced wherever they stand, from `TYPE=`, the first `ISSUE=` (empty when none), `ENTRY=` (empty when none) and the summary of step 3. A section none of the three sources answers reads `_No response_`. Every HTML comment of the template is dropped. A checkbox stays unchecked unless a source states it done.
- `TEMPLATE=` empty -> the sections `## Summary`, `## Changes` and `## Testing`, filled the same way.

End the body with a blank line, then the `FOOTER=` lines, one each, in order.

## 5. Preview

`Write` the body to `BODY_FILE=` first. Then print, never the body text:

- `Title: <title>`
- `Target: <TARGET=>`
- when `QA=` is set, one line saying the build's QA document (`QA=`) will be posted as a comment on the run's issue, or on the new pull request when the run has none
- `Body: <BODY_FILE=>`

Then one `AskUserQuestion`: create, create as draft or cancel. A correction typed as the answer -> rewrite that same file, then preview again. Cancel -> stop, nothing created.

## 6. Create

Run `"${CLAUDE_PLUGIN_ROOT}/scripts/pr-create.sh" "<file>" "<title>" --base "<TARGET>"` with the file of step 5, plus ` --draft` for the draft answer.

- Exit 0 -> report `PR_URL=`, plus one line that the pull request stays unassigned when `ASSIGNEE=dropped` (the script assigns its author itself), then, when `QA=` is set, run `"${CLAUDE_PLUGIN_ROOT}/scripts/qa-comment.sh" "<QA>" --pr "<PR_URL>"` with that `PR_URL=` and report the result as step 7 says. Never retry it.
- Exit 1 -> report its `ERROR` line. Never retry.
- Exit 2 -> report its `ERROR` line; nothing was pushed.

## 7. QA comment of an existing pull request

Only on a `pr-exists` stop with `QA=` set: run `"${CLAUDE_PLUGIN_ROOT}/scripts/qa-comment.sh" "<QA>" --pr "<PR_URL>"`, the stop's `PR_URL=`. Never retry. Either call posts on the run's issue when it has one, the pull request otherwise. Either call's result:

- Exit 0, `STATUS=posted` -> report `COMMENT_URL=`.
- Exit 0, `STATUS=skip` -> say its `SAY=` line in one line.
- Exit 1 or 2 -> report its `ERROR` line.

You run no test and change no code: the pull request and its QA comment are the only output. End on the `COMMENT_URL=` or the `SAY=` of a `pr-exists` stop's call, else on the `PR_URL=` and the comment's result, or on the reason there is none.
