---
name: pr-create
description: Opens a pull request for the current branch. Only on the user's request.
allowed-tools: Read, Edit(./.temp/viber/pr-create/**), Bash(${CLAUDE_PLUGIN_ROOT}/scripts/pr-facts.sh:*), Bash(${CLAUDE_PLUGIN_ROOT}/scripts/pr-create.sh:*)
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

`STATUS=stop` -> say its `SAY=` line in one line, then end.

## 2. Target

`STATUS=ready` with `ASK=target` -> one `AskUserQuestion` for the target branch, `DEFAULT=` offered first. Run `RERUN=` with `<branch>` replaced by the answer. The rerun's block replaces the first one and is read from step 1 again.

## 3. Title

- `TITLE=` set -> that title, as printed.
- Otherwise one line stating the change, in the language of this conversation.

## 4. Body

Fill from the `COMMIT=` lines and this conversation, never from anything else: a value neither states is never invented. No secrets, credentials or file contents: the pull request may be public. No Claude or Claude Code attribution (no "Generated with Claude Code" line, no `Co-Authored-By`).

- `TEMPLATE=` set -> `Read` it and fill each section in template order. `{type}`, `{issue-number}` and `{summary}` are replaced wherever they stand, from `TYPE=`, the first `ISSUE=` (empty when none) and the title of step 3. A section neither source answers reads `_No response_`. Every HTML comment of the template is dropped. A checkbox stays unchecked unless a source states it done.
- `TEMPLATE=` empty -> the sections `## Summary`, `## Changes` and `## Testing`, filled the same way.

End the body with a blank line, then the `FOOTER=` lines, one each, in order.

## 5. Preview

`Write` the body to `BODY_FILE=` first. Then print, never the body text:

- `Title: <title>`
- `Target: <TARGET=>`
- `Body: <BODY_FILE=>`

Then one `AskUserQuestion`: create, create as draft or cancel. A correction typed as the answer -> rewrite that same file, then preview again. Cancel -> stop, nothing created.

## 6. Create

Run `"${CLAUDE_PLUGIN_ROOT}/scripts/pr-create.sh" "<file>" "<title>" --base "<TARGET>"` with the file of step 5, plus ` --draft` for the draft answer, plus ` --issue "<n>"` with the first `ISSUE=` when `CLOSES=no`.

- Exit 0, `LINK=manual` -> open the answer on one line: issue #<n> needs linking by hand (pull request, Development, issue), because `LINK_REASON=`.
- Exit 0 with `--issue` and more than one `ISSUE=` -> one line naming the other issues as needing linking by hand.
- Exit 0 -> report `PR_URL=`, plus one line that the pull request stays unassigned when `ASSIGNEE=dropped` (the script assigns its author itself).
- Exit 1 -> report its `ERROR` line. Never retry.
- Exit 2 -> report its `ERROR` line; nothing was pushed.

You run no test and change no code: the pull request is the only output. End on its `PR_URL=` or on the reason there is none.
