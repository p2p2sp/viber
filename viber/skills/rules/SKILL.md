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

Your whole tool set is `AskUserQuestion`, `Agent` and the two map lines of step 3. You open no file and you write none: every byte of the layer is written by `viber:rules-writer`, nothing here is staged and nothing is committed.

## 1. Report the layer

Before any question, one line per fact worth deciding on:

- each `rule:` line with its size, its globs and its match count. `OVER-FILE` is past 4000 bytes, and `total:` closes on `OVER-DIR` past 40000 over the directory. A rule already over a budget is reported here and compacted or split by the writer, never by you.
- each `frozen:` line, named as a file this command reports and never scores, audits, resets or rewrites.
- each `dead:` line, named as a rule whose declared scope matches no tracked file.
- each `dirty:` line with its `modified` or `untracked` word.
- the `waiting:` line, the number of waiting trail entries per cause.
- each `trail:` line, one archived `failures.md` with its `convention` and `other` counts. The `convention` entries are the only ones the auditor reads; the writer removes every other entry.

The root of the directory holds the shared rules, each subdirectory one area's. Name each root `rule:` line whose globs all stay inside one area, or whose basename carries an area as a prefix: the writer moves it into that area's directory.

A `rule:` line whose `paths` field reads `none` declares no scope: it binds the whole repository, is loaded on every task and is never dead.

## 2. Route on the state, then the mode

`state: none` means the directory is absent or carries no scored rule. Say the layer is empty, ask nothing, and go to step 4 with the repository root as the single scope to propose for: there is nothing to review and nothing to reset.

Otherwise one `AskUserQuestion`, the four modes in that single call:

- `review` - verify the existing rules against the files their globs match.
- `extend` - propose the rules a scope carrying none still needs.
- `both` - the rules and the proposals in one pass.
- `reset` - delete rules, then start from zero.

An argument naming one of the four is that answer already: take it and ask nothing. On `state: complete` lead with the flags and the dead rules, every rule declaring a scope; on `state: partial` lead with how many rules declare no scope at all.

`reset` goes to step 3. Every other mode goes to step 4, its target list being the `rule:` lines on `review`, the scopes to propose for on `extend`, and both on `both`. The map lists no candidate scope, a rule's reach being its globs rather than where its file sits: on `extend` ask the user which directories to propose for, the repository root standing in when they name none.

On `extend`, on `both` and on `state: none`, a map with at least one `trail:` line adds one more target to the list: the trail, standing for every `trail:` path at once. `review` and `reset` never carry it.

## 3. Reset

The list is every `rule:` line, or the ones the user named. A `frozen:` line never enters it, whatever the user names. Print the list whole, one path per line: a reset deletes this project's rules.

A path in the list that also carries a `dirty:` line refuses the whole call. Name each offending path with its own word, say the user commits or discards that work and runs the command again, and stop there. A refusal is never narrowed into a smaller reset that goes ahead, and uncommitted work is never corrected into something deletable.

Otherwise one `AskUserQuestion` over that exact list. On anything but approval, stop. On approval, one literal line, every path double-quoted, no interpreter word in front of it and nothing chained after it:

```
"${CLAUDE_SKILL_DIR}/scripts/rules-map.sh" --reset "<path>" "<path>"
```

- exit 0 -> the `removed:` lines are the deletion. Report them, then map the layer again with the one literal line `"${CLAUDE_SKILL_DIR}/scripts/rules-map.sh"`. That fresh map, its `id:` included, replaces the one above for the rest of the run: the preloaded one still lists the deleted rules. Continue into step 4 with the scopes to propose for as the target list, the repository root among them.
- exit 3 -> nothing at all was deleted. Repeat its `refused:` lines verbatim and stop.
- exit 2 -> the call itself was unusable. Report it and stop.

## 4. Approve the targets

Nothing is dispatched before the user has seen the target list and kept what belongs in it. Show it, one line per target, carrying what step 1 already measured for that path. The trail target is one line: the `waiting:` line and every `trail:` path.

Then one `AskUserQuestion` over that list: all of them, or the ones the user picks. Offer the targets themselves as options while the list is short enough to show; past that, offer all of them, none of them, and take the paths a free answer names verbatim. A target the user dropped reaches no auditor and no writer. Nothing kept -> stop, having dispatched nothing and written nothing.

A dead rule is offered like any other: the auditor decides whether its scope really went, and the writer is what removes the file.

## 5. Audit

One `Agent` call per approved target, `subagent_type: viber:rules-auditor`, no `model:` line - the agent's own frontmatter is its strength. The calls go out in batches: at most 16 in one message, run in parallel, the next message only after every call of the previous one returned. A call the harness refuses with `Concurrent subagent limit reached` never ran: it goes into the next message, no later message carries more calls than the previous one had accepted, and it is neither a missing output line nor a `VERDICT: DENIED`. Five labelled lines each and nothing else:

```
target: <the rule's own path, or the literal none for a scope with no rule>
scope: <the globs the map printed for that rule, or the directory to propose for>
matches: <the n of that rule's `matches <n>` field, or the literal none for a scope with no rule>
out: .temp/viber/<id>/
refs: ${CLAUDE_PLUGIN_ROOT}/references
```

`<id>` is the `id:` value of the map above. A rule whose `paths` field reads `none` gates the whole repository: pass `**` as its scope and `none` as its matches. A scope with no rule is the proposing direction: `target: none`, `scope` that directory, `matches: none`, and only missing conventions can come back.

A kept trail target gets one `viber:rules-auditor` call only when a kept `trail:` line has a `convention` count above 0, the same five lines with `target: trail`, `scope` being those `trail:` paths, comma-separated, and `matches: none`.

Each call returns one line:

```
AUDIT: <area> stale <n> gone <n> unverifiable <n> drop <n> miss <n> -> <findings file> | none
AUDIT: trail miss <n> ignored <n> rejected <n> -> <findings file> | none
```

The second form answers the trail target alone.

Report the `AUDIT:` line for each target verbatim. Read none of those files - the writer does.

An `Agent` call here or in step 6 that returns none of its output lines (no `AUDIT:` line from an auditor, no `VERDICT:` line from the writer) is that step's `VERDICT: DENIED` with `REASON: no verdict returned`.

A call returning `VERDICT: DENIED` instead -> one `AskUserQuestion` naming the target and the refused call from its `REASON:` line: permission added and retry, drop that target, or stop.

## 6. Confirm, then the writer

Every returned line carrying five zero counters, a trail line carrying its three zero counters (`miss`, `ignored`, `rejected`), or `-> none`, with no kept rule named in step 1 as misplaced, no kept rule flagged `OVER-FILE` and no `OVER-DIR` on `total:`, means the layer is already true and no scope earned a new rule. With no kept `trail:` line carrying an `other` count above 0, say so in one line, dispatch no writer, and stop.

Otherwise one `AskUserQuestion` over the counters just reported, the over-budget flags, the moves named in step 1 and the `other` entries of each kept trail: fold them in, or stop. A kept `trail:` line with an `other` count above 0 reaches the writer even with every audit counter at 0. Only on approval, one `Agent` call, `subagent_type: viber:rules-writer`, no `model:` line, three labelled lines and nothing else:

```
map: <the map's id:, state: and total: lines plus every rule: and dead: line of a kept target and every trail: line of a kept trail target, verbatim>
notes: .temp/viber/<id>/
refs: ${CLAUDE_PLUGIN_ROOT}/references
```

`VERDICT: DENIED` -> one `AskUserQuestion` naming the refused call from its `REASON:` line: permission added and retry, or stop.

## 7. Report

Repeat what the writer returned and add nothing to it:

- `FILES:` -> the rules it created, corrected, moved or removed and every `failures.md` it changed or deleted, one path per line.
- `OVER:` -> repeat each line verbatim.
- `MOVE:` -> repeat each line verbatim: a fact removed from a rule that its `CLAUDE.md` node does not hold yet. This run never writes that node; `/viber:memory` over those paths records it, except the root `CLAUDE.md`, which is the user's to record: `/viber:memory` only suggests a change to it.
- `VERDICT: NONE` -> nothing in the layer needed changing.
- `VERDICT: DENIED` -> its `REASON:` line verbatim.
- each target dropped in step 5 on `VERDICT: DENIED`, with its `REASON:` line.

Close on one line: those files sit in the working tree, unstaged and uncommitted, and committing them is the user's next step.
