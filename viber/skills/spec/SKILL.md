---
name: spec
description: Run only by the intent skill.
allowed-tools: Read, Agent, AskUserQuestion, Skill, Write(./.temp/viber/**), Edit(./.temp/viber/**), Bash(${CLAUDE_SKILL_DIR}/scripts/spec-paths.sh:*), Bash(${CLAUDE_SKILL_DIR}/scripts/spec-parts.sh:*), Bash(${CLAUDE_SKILL_DIR}/scripts/spec-check.sh:*)
---

# spec

Run `ExitPlanMode` first, if plan mode is active.

Turn the confirmed understanding of one change into a checked, reviewed spec file. You write the intent file; agents write and review the spec. Never read the spec or the review yourself.

Parts: only when the confirmed understanding lists parts. Each part then gets its own intent file and spec, and runs Write and check and Review on its own.

## Intent file

1. Run `"${CLAUDE_SKILL_DIR}/scripts/spec-paths.sh" <slug>`, the slug being 2-4 lowercase words joined by hyphens. Its `spec:`, `intent:` and `review:` lines are this run's paths. A `Mockup: <path>` line in the conversation: pass the last one's path, double-quoted, as the second argument; the script copies it beside the spec as `prototype.html`. With parts, never pass the mockup here.
2. Write to the `intent:` path everything the interview settled, one fact per line, numbered `I1..In`. It is all the writer will know, so carry: the problem and who has it, every required behaviour and edge case, how changed or removed behaviour works today, every decision with its strongest rejected option, its reason and who made it, what was left out, what must keep working, outward-facing shapes, constraints, where the behaviour can be tested, the root cause of a bug. Add nothing the interview did not settle. With a mockup, one more `I` line: the screen is built as the mockup `prototype.html` shows it, every element without `data-mock` binding its structure, order, texts, states and interactions.
3. With parts: put the facts shared by every part under a `## All` heading and the facts of part n under `## P<n> - <title>`, parts numbered from 1 in the order of the understanding, every `I` line under exactly one heading. Put the mockup `I` line under each part building that screen, under `## All` when every part builds it. Then run `"${CLAUDE_SKILL_DIR}/scripts/spec-parts.sh" "<spec path>" "<intent path>"`, plus the mockup path double-quoted as the third argument. `ERROR:` lines: fix the intent file, run it again. Its `spec:`, `intent:` and `review:` lines, one group per part in part order, are the parts' paths from then on; the paths of step 1 are not used again.

## Write and check

1. With parts, dispatch the writers of all parts in one message. Dispatch `viber:spec-writer` with `intent: <path>`, `spec: <path>` and `template: ${CLAUDE_SKILL_DIR}/references/spec-template.md`. It returns `SPEC: <path>`.
2. Run `"${CLAUDE_SKILL_DIR}/scripts/spec-check.sh" <spec path>` after every writer return, until it prints `PASS`.
   - `OPEN:` lines are gaps the interview left: put each to the user, append the answers to the intent file as new `I` lines, numbered after its highest `I`. With parts, the question names its part and the answer goes to that part's intent file only, unless it is about a line from `## All`: then append it to every part's intent file under one number, after the highest `I` of all of them, and dispatch every part's writer again with its `carry I<n>` line, a part whose spec is done included, repeating its check.
     - A question covers every `I` line using the term it asks about; the new `I` line names them.
     - An answer removing or changing what another `I` line or answer relies on: ask the user what replaces it, append that answer too.
   - Then dispatch the writer again with the same three lines plus `fix:`, the script's output and one `carry I<n>` line per appended `I` line.
   - Third failed check in a row, of any part: show the user the lines and the spec path, and stop. Specs already done stay.

## Review

Dispatch `viber:spec-reviewer` with `spec: <path>`, `intent: <path>` and `report: <review path>`. It returns `VERDICT: PASS` or `VERDICT: FAIL`, and `REVIEW: <path>`.

- `FAIL`: dispatch the writer with the same three lines plus `review: <path>`, then repeat the check from Write and check. Never dispatch the reviewer a second time.

## Done

The spec is done when the review returned `PASS`, or the check printed `PASS` after the review's fix. Then ask the user how to proceed through one `AskUserQuestion` call, every field in the conversation's language.

With parts, ask once, when every part's spec is done: the question names every spec path in part order, `<spec path>` in the Stop description is all of them, and Confirm -> Planner passes the spec path of P1.

Format:

```
header: "Spec"
question: "The spec is ready: <spec path>. What next?"
multiSelect: false
options:
  - label: "Confirm -> Planner"
    description: "Write the implementation plan from this spec"
  - label: "Stop"
    description: "End here, the spec stays at <spec path>"
```

- Confirm -> Planner: invoke the `viber:planner` skill with the spec path.
- Stop: invoke nothing, end the turn.
