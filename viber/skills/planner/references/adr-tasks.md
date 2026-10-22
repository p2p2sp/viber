# ADR tasks

What is a record is `viber:adr-screener`'s call alone: never add a line of your own to its result, never drop or reword one.

## 1. Screen

Dispatch the `viber:adr-screener` agent with these lines, `input:` last:

```
plan: <absolute path of the plan file>
refs: <the plugin reference directory>
input:
<the input block of the review dispatch, without its Answered: lines>
```

The `input:` body is the one the review dispatch carries: the summary file path alone on its line, or the summary or diagnosis verbatim. A one-line input naming a `.md` file under `.temp/viber/intent/summary-` is read as that file's content.

- A reply with no `VERDICT:` line is handled as `VERDICT: DENIED` with `REASON: no verdict returned`.
- `VERDICT: DENIED` - one `AskUserQuestion` naming the refused call from its `REASON:` line: permission added and retry, or continue with no record task.
- `VERDICT: NONE` - ask nothing, add nothing and go back to the skill.
- `VERDICT: FOUND` - ask.

## 2. Ask

One `AskUserQuestion` call, one question per line of the result, each offering accept or drop: an `ADR:` line as its decision, the rejected option and the reversal cost; a `DEPRECATE:` or `APPEND:` line as what it would change. At most four questions per call; further lines go into the next call.

- Recommend nothing, ask about each line once, never argue a dropped line back in.
- Dropping every line, or declining the questions, leaves the plan with no record task and no record criterion, exactly as under `planning.adr: false`.

## 3. Apply what was accepted

With nothing accepted, go back to the skill. Otherwise, in this order:

1. When item 2 or 3 adds a task, add one acceptance criterion for the records and point the `Covers` of every such task at it.
2. One task per accepted `ADR:` line, appended after the plan's last task, never renumbering one:
   - `Files: docs/adr/<yyyyMMddHHmmss>-<slug>.md`, the stamp from `date +%Y%m%d%H%M%S` so the path is exact - it is a commit file map, not a pattern.
   - `TDD: none`, `Uses: none`, `Depends-on: none`, and nothing ever depends on it.
   - `Delivers` carries the whole record in the shape below, `Status: accepted` dated from `date +%Y-%m-%d`, because the task file is all its writer gets. From the code it names only `### File map` paths and `## Contracts` names.
   - `Verification: test -f <path> && grep -q '^Status: accepted' <path> -> exit 0`, that path written out in full both times.
   - `DoD`: the record exists there and carries every part of the shape.
3. One task per accepted `DEPRECATE:` or `APPEND:` line, editing that existing record and never deleting it: `DEPRECATE:` rewrites its `Status:` line to `deprecated (<yyyy-mm-dd>)`, or to `superseded by <docs/adr/ path> (<yyyy-mm-dd>)` when the accepted `ADR:` line its sentence names replaces it; `APPEND:` appends the fragment.
   - A `DEPRECATE:` superseded that way merges into that `ADR:` line's task, both paths in its `Files`.
   - Any other one follows item 2 with the existing record's path as its `Files`, its `Verification` grepping that record for its new `Status:` line or a phrase of the fragment.

Then run `plan-index.sh` again; it must exit 0.

## Record shape

```
# <decision title>

Status: accepted (<yyyy-mm-dd>) | deprecated (<yyyy-mm-dd>) | superseded by <docs/adr/ path> (<yyyy-mm-dd>)

<1-3 sentences: context, decision, why>

Rejected: <strongest rival> - <why not>

Consequences: <only a non-obvious one not visible in the code; line omitted otherwise>
```
