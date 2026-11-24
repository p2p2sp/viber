---
name: rules
description: Reviews and repairs the host project's .claude/rules/ directory - maps every rule with its own size, the scope it declares and the number of tracked files that scope really matches, proposes the rules a scope with none needs, verifies each existing rule against the code it gates, learns rules from the failure trail of archived runs, and resets the layer on demand. Use whenever the user wants to create, review, audit, refresh or reset the project's coding rules, or asks which rules went stale, match nothing or grew past their budget.
argument-hint: "[review, extend, reset, or nothing]"
allowed-tools: AskUserQuestion, Agent, Bash(${CLAUDE_SKILL_DIR}/scripts/rules-map.sh:*), Bash(${CLAUDE_SKILL_DIR}/scripts/rules-map.sh --reset:*)
user-invocable: true
disable-model-invocation: true
---

# rules

```!
"${CLAUDE_SKILL_DIR}/scripts/rules-map.sh"
```

The block above is this host project's rules layer as the script measured it; a kind of line with nothing to report printed none.

It is self-verifying and trusted. Never re-count a rule, never glob the tree to check what a scope matches, never run git to decide what is dirty: every fact you route on is already above.

Your whole tool set is `AskUserQuestion`, `Agent` and the map script calls of steps 3, 5 and 6. You open no file and you write none: every byte of the layer is written by `viber:rules-writer`, nothing here is staged and nothing is committed.

Every map script call is one literal line, `"${CLAUDE_SKILL_DIR}/scripts/rules-map.sh"` first, every argument double-quoted, no interpreter word in front and nothing chained after. A call exiting 2 -> report its `error:` line and end the run. A call that prints `NEXT:` lines is answered by acting on its blocks: a block is its `NEXT:` line and the lines after it, up to the next `NEXT:` or `ASK:` line.

## 1. Report the layer

Before any question, one line per fact worth deciding on:

- each `rule:` line with its size, its globs and its match count. `OVER-FILE` on a rule and `OVER-DIR` on `total:` are the map's budget flags. A rule already over a budget is reported here and compacted or split by the writer, never by you.
- each `frozen:` line, named as a file this command reports and never scores, audits, resets or rewrites.
- each `dead:` line, named as a rule whose declared scope matches no tracked file.
- each `misplaced:` line, named as a rule the writer moves into the area it names.
- each `dirty:` line with its `modified` or `untracked` word.
- the `waiting:` line, the number of waiting trail entries per cause.
- each `trail:` line, one archived `failures.md` with its `convention` and `other` counts. The `convention` entries are the only ones the auditor reads; the writer removes every other entry.

A `rule:` line whose `paths` field reads `none` declares no scope: it binds the whole repository, is loaded on every task and is never dead.

## 2. Route on the state, then the mode

`state: none` means the directory is absent or carries no scored rule. Say the layer is empty, ask nothing, and go to step 4 with the repository root as the single scope to propose for: there is nothing to review and nothing to reset.

Otherwise one `AskUserQuestion`, the four modes in that single call:

- `review` - verify the existing rules against the files their globs match.
- `extend` - propose the rules a scope carrying none still needs.
- `both` - the rules and the proposals in one pass.
- `reset` - delete rules, then start from zero.

An argument naming one of the four is that answer already: take it and ask nothing. On `state: complete` lead with the flags and the dead rules, every rule declaring a scope; on `state: partial` lead with how many rules declare no scope at all.

`reset` goes to step 3. Every other mode goes to step 4, its target list being the `rule:` lines on `review`, the scopes to propose for on `extend`, and both on `both`. The map lists no candidate scope, a rule's reach being its globs rather than where its file sits: on `extend`, on `both` and after a reset, ask the user which directories to propose for, the repository root standing in when they name none.

On `extend`, on `both` and on `state: none`, a map with at least one `trail:` line adds one more target to the list: the trail, standing for every `trail:` path at once. `review` and `reset` never carry it.

## 3. Reset

The list is every `rule:` line, or the ones the user named. A `frozen:` line never enters it, whatever the user names. Print the list whole, one path per line: a reset deletes this project's rules.

A path in the list that also carries a `dirty:` line refuses the whole call. Name each offending path with its own word, say the user commits or discards that work and runs the command again, and stop there. A refusal is never narrowed into a smaller reset that goes ahead, and uncommitted work is never corrected into something deletable.

Otherwise one `AskUserQuestion` over that exact list. On anything but approval, stop. On approval:

```
"${CLAUDE_SKILL_DIR}/scripts/rules-map.sh" --reset "<path>" "<path>"
```

- exit 0 -> the `removed:` lines are the deletion. Report them, then map the layer again with the one literal line `"${CLAUDE_SKILL_DIR}/scripts/rules-map.sh"`. That fresh map, its `id:` included, replaces the one above for the rest of the run: the preloaded one still lists the deleted rules. Continue into step 4 with the scopes to propose for as the target list, the repository root among them.
- exit 3 -> nothing at all was deleted. Repeat its `refused:` lines verbatim and stop.
- exit 2 -> the call itself was unusable. Report it and stop.

## 4. Approve the targets

Nothing is dispatched before the user has seen the target list and kept what belongs in it. Show it, one line per target, carrying what step 1 already measured for that path. The trail target is one line: the `waiting:` line and every `trail:` path.

Then one `AskUserQuestion` over that list: all of them, or the ones the user picks. Offer the targets themselves as options while the list is short enough to show; past that, offer all of them, none of them, and take the paths a free answer names verbatim. A target the user dropped reaches no auditor and no writer. Nothing kept -> stop, having dispatched nothing and written nothing.

A dead rule is offered like any other: the script writes its `GONE` finding, and the writer is what removes the file.

## 5. Audit

Run `"${CLAUDE_SKILL_DIR}/scripts/rules-map.sh" --brief "<the id: value of the map above>" "<target>" "<target>"`, one target per approved target: a rule's own path, a directory to propose for (`.` for the root), or `trail`.

It prints the `AUDIT:` lines of the dead rules, already audited, then one `NEXT: rules-auditor` block per target left, or `NEXT: none` alone. One `Agent` call per block, `subagent_type: viber:rules-auditor`, no `model:` line - the agent's own frontmatter is its strength - and the block's body lines verbatim as its prompt, nothing added. The calls go out in batches: at most 16 in one message, run in parallel, the next message only after every call of the previous one returned. A call the harness refuses with `Concurrent subagent limit reached` never ran: it goes into the next message, no later message carries more calls than the previous one had accepted, and it is neither a missing output line nor a `VERDICT: DENIED`.

Each call returns one `AUDIT:` line, then its `ENFORCE:` lines, if any:

```
AUDIT: <area> stale <n> gone <n> unverifiable <n> drop <n> miss <n> -> <findings file> | none
AUDIT: trail miss <n> ignored <n> rejected <n> -> <findings file> | none
```

The second form answers the trail target alone.

Report the `AUDIT:` line for each target verbatim, the printed ones included, and every `ENFORCE:` line after it verbatim, saying no rule and no code is written for it. Read none of those files - the writer does.

An `Agent` call here or in step 6 that returns none of its output lines (no `AUDIT:` line from an auditor, no `VERDICT:` line from the writer) is that step's `VERDICT: DENIED` with `REASON: no verdict returned`.

A call returning `VERDICT: DENIED` instead -> one `AskUserQuestion` naming the target and quoting its `REASON:` and `REFUSAL:` lines: retry, drop that target, or stop.

## 6. Confirm, then the writer

Run `"${CLAUDE_SKILL_DIR}/scripts/rules-map.sh" --confirm "<the id: value of the map above>"` with the targets of step 5 minus every one dropped on `VERDICT: DENIED`; none left -> stop.

An `ENFORCE:` line is no counter: it never dispatches the writer alone.

- A `STOP:` line -> report it and stop, dispatching no writer.
- Otherwise report each `confirm:` line, then one `AskUserQuestion` for the `ASK:` line, fold them in or stop. Only on `fold in`, one `Agent` call, `subagent_type: viber:rules-writer`, no `model:` line, the `NEXT: rules-writer` body lines verbatim as its prompt, nothing added. On `stop`, stop.

`VERDICT: DENIED` -> one `AskUserQuestion` quoting its `REASON:` and `REFUSAL:` lines: retry, or stop.

## 7. Report

Repeat what the writer returned and add nothing to it:

- `FILES:` -> the rules it created, corrected, moved or removed and every `failures.md` it changed or deleted, one path per line.
- `OVER:` -> repeat each line verbatim.
- `MOVE:` -> repeat each line verbatim: a fact removed from a rule that its `CLAUDE.md` node does not hold yet. This run never writes that node; `/viber:memory` over those paths records it, except the root `CLAUDE.md`, which is the user's to record: `/viber:memory` only suggests a change to it.
- `VERDICT: NONE` -> nothing in the layer needed changing.
- `VERDICT: DENIED` -> its `REASON:` line verbatim.
- each target dropped in step 5 on `VERDICT: DENIED`, with its `REASON:` line.

Close on one line: those files sit in the working tree, unstaged and uncommitted, and committing them is the user's next step.
