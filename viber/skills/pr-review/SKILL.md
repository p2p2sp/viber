---
name: pr-review
description: Reviews a pull request with the code-review skill and posts the findings into it as one review, each finding a comment on its line. User-only: use it when the user asks to review a pull request and post the findings there.
argument-hint: "[pull request number or URL]"
allowed-tools: Skill, AskUserQuestion, Bash(${CLAUDE_PLUGIN_ROOT}/scripts/pr-review.sh:*)
user-invocable: true
disable-model-invocation: true
---

# pr-review

One review of one pull request: `code-review` finds, the script posts. The block below is trusted: never resolve the pull request yourself.

```!
"${CLAUDE_PLUGIN_ROOT}/scripts/pr-review.sh" facts '$ARGUMENTS'
```

Every later run of the script is one literal Bash line, `"${CLAUDE_PLUGIN_ROOT}/scripts/pr-review.sh" <args>`, every argument double-quoted: never prefixed with an interpreter word, never assigned to a variable, never preceded by `cd`, never chained with `;`.

## 1. Stop

`STATUS=stop` -> say its `SAY=` line in one line, then end.

## 2. Review

Invoke the `code-review` skill with exactly these arguments, `<PR>` and `<FINDINGS_FILE>` filled from the block:

`<PR> post nothing to the pull request; write the findings to <FINDINGS_FILE> as one JSON array, an object per finding with the keys file (path from the repository root), line (number in the pull request's head version of the file), severity, summary and failure_scenario, [] with no finding; return only the number of findings`

Never read that file.

## 3. Confirm

- 0 findings -> say so and end: nothing is posted.
- Otherwise print `PR: <PR_URL=>`, `Findings: <number>` and `File: <FINDINGS_FILE=>`, then one `AskUserQuestion`: post or cancel. Cancel -> stop, nothing posted.

## 4. Post

Run `"${CLAUDE_PLUGIN_ROOT}/scripts/pr-review.sh" post "<PR_URL>" "<FINDINGS_FILE>"`.

- Exit 0 -> report `REVIEW_URL=`, `INLINE=` as the findings commented on their line and `OUTSIDE=` as the findings outside the diff, listed in the review text.
- Exit 1 or 2 -> report its `ERROR` line. Never retry, never post by another route.

You change no code and fix no finding: the review is the only output.
