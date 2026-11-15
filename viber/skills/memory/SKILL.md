---
name: memory
description: Reviews and repairs the host project's CLAUDE.md cascade - maps every node with its own size and the size of the chain a reader loads with it, creates the nodes a project with none needs, verifies each existing node against the code of the area it describes, brings every node below the root within budget, and resets the layer on demand. Use whenever the user wants to create, bootstrap, initialize, refresh, audit or reset project memory, or asks which nodes went stale, lost their area or grew past their budget.
argument-hint: "[review, extend, reset, or nothing]"
allowed-tools: AskUserQuestion, Agent, Bash(${CLAUDE_SKILL_DIR}/scripts/memory-map.sh:*), Bash(${CLAUDE_SKILL_DIR}/scripts/memory-map.sh --reset:*), Read(${CLAUDE_PLUGIN_ROOT}/skills/setup/templates/claude-md-prompt.txt)
user-invocable: true
disable-model-invocation: true
---

# memory

```!
"${CLAUDE_SKILL_DIR}/scripts/memory-map.sh"
```

The block above is this host project's memory layer as the script measured it; a kind of line with nothing to report printed none.

It is self-verifying and trusted. Never re-measure a node, never walk the tree for a candidate of your own, never run git to decide what is dirty: every fact you route on is already above.

Your whole tool set is `AskUserQuestion`, `Agent`, the two map lines of step 3 and `Read` on `${CLAUDE_PLUGIN_ROOT}/skills/setup/templates/claude-md-prompt.txt` alone, in step 9. You open no other file and you write none: every byte of the cascade is written by `viber:memory-node-writer`, nothing here is staged and nothing is committed.

## 1. Report the layer

Before any question, one line per fact worth deciding on:

- each `node:` line with its two sizes and its flag. `OVER-NODE` and `OVER-CHAIN` are the map's budget flags. A node below the root already over a budget is reported here and brought within it by its writer, never by you; the root belongs to the user, so its writer only suggests what to trim.
- each `section:` line with its size and flag, under its node when one exists. A section never counts toward a chain.
- each `unlinked:` line, named as a section no reader can reach.
- each `orphan:` line, named as a node left alone in a directory whose other files are gone.
- each `dirty:` line with its `modified` or `untracked` word.
- each `cand:` line with its file count, its byte count and its `toolchain` or `plain` signal. A directory carrying its own build manifest earns a look, never an automatic node.

## 2. Route on the state, then the mode

`state: none` means no node is tracked anywhere. Say the layer is empty, ask nothing, and go to step 4 with the `cand:` lines as the target list plus the repository root and the directory of each `unlinked:` section, each directory once: there is nothing to review and nothing to reset.

Otherwise one `AskUserQuestion`, the four modes in that single call:

- `review` - verify the existing nodes against the code of their areas.
- `extend` - give the candidate directories the nodes they lack.
- `both` - the nodes and the candidates in one pass.
- `reset` - delete nodes, then start from zero.

An argument naming one of the four is that answer already: take it and ask nothing. On `state: complete` lead with the flags and the orphans; on `state: partial` lead with how many candidates carry no node.

`reset` goes to step 3. Every other mode goes to step 4, its target list being the `node:` lines on `review`, the `cand:` lines plus the directory of each `unlinked:` section with no `node:` line beside it on `extend`, and both on `both`, each directory once. Under `extend` and `both`, the repository root joins the list as a create target when the map carries no `node: CLAUDE.md` line.

## 3. Reset

The list is every `node:` line, or the ones the user named, each followed by every `section:` line in its directory, plus, when the list is every `node:` line, every `unlinked:` section with no `node:` line beside it: a node takes its sections along. Print it whole, one path per line: a reset deletes this project's memory.

A path in the list that also carries a `dirty:` line refuses the whole call. Name each offending path with its own word, say the user commits or discards that work and runs the command again, and stop there. A refusal is never narrowed into a smaller reset that goes ahead, and uncommitted work is never corrected into something deletable.

Otherwise one `AskUserQuestion` over that exact list. On anything but approval, stop. On approval, one literal line, every path double-quoted, no interpreter word in front of it and nothing chained after it:

```
"${CLAUDE_SKILL_DIR}/scripts/memory-map.sh" --reset "<path>" "<path>"
```

- exit 0 -> the `removed:` lines are the deletion. Report them, then map the layer again with the one literal line `"${CLAUDE_SKILL_DIR}/scripts/memory-map.sh"`. That fresh map replaces the one above for the rest of the run: the preloaded one still lists the deleted nodes. Continue into step 4 with its `cand:` lines plus every directory a `removed:` line emptied, the repository root among them.
- exit 3 -> nothing at all was deleted. Repeat its `refused:` lines verbatim and stop. A refusal may name a section missing from the list: one deleted and not yet committed.
- exit 2 -> the call itself was unusable. Report it and stop.

## 4. Approve the targets

Nothing is dispatched before the user has seen the target list and kept what belongs in it. Show it, one line per target, carrying what the map already measured for that path.

Then one `AskUserQuestion` over that list: all of them, or the ones the user picks. Offer the targets themselves as options while the list is short enough to show; past that, offer all of them, none of them, and take the paths a free answer names verbatim. A target the user dropped reaches no auditor and no writer. Nothing kept -> stop, having dispatched nothing and written nothing.

- A `node:` target is a fix target.
- Every other target - a candidate, an emptied directory, the directory of a section with no node, the root of an empty layer - is a create target, its node being `CLAUDE.md` inside that directory.
- A directory holding a section on a `dirty:` line is never a create target: that section is the user's uncommitted work.
- An orphan is offered like any other node: the auditor decides whether its area really went, and the writer is what removes the file.
- A section is never a target of its own: it travels with the node beside it.

The planned set is every `node:` line of the map in use plus the node of every kept create target, root first, then by depth. It stays whole to the end of the run: a target dropped or confirmed later still counts in it, its node still being there.

`review` and `both` go to step 5. `reset`, `extend` and an empty layer have no fix target and go straight to step 7.

## 5. Audit

One `Agent` call per fix target, `subagent_type: viber:memory-auditor`, no `model:` line - the agent's own frontmatter is its strength. The calls go out in batches, here and in steps 7 and 8: at most 16 in one message, run in parallel, the next message only after every call of the previous one returned. A call the harness refuses with `Concurrent subagent limit reached` never ran: it goes into the next message, no later message carries more calls than the previous one had accepted, and it is neither a missing output line nor a `VERDICT: DENIED`. Four labelled lines each and nothing else:

```
target: <the node's own path>
scope: <the directory holding it, the repository root for the root node>
out: .temp/viber/<id>/
refs: ${CLAUDE_PLUGIN_ROOT}/references
```

`<id>` is the `id:` value of the map above. Create targets are never audited: their writer reads the area itself.

Each call returns one line:

```
AUDIT: <node> stale <n> gone <n> unverifiable <n> shape <n> miss <n> -> <findings file>
```

Report the `AUDIT:` line for each target verbatim. Read none of those files - the writer does.

An `Agent` call here or in step 7 or 8 that returns none of its output lines (no `AUDIT:` line from an auditor, no `VERDICT:` line from a writer) is that step's `VERDICT: DENIED` with `REASON: no verdict returned`.

A call returning `VERDICT: DENIED` instead -> one `AskUserQuestion` naming the target and the refused call from its `REASON:` line: permission added and retry, drop that target from the target list, or stop.

## 6. Confirm

A fix target whose `stale`, `gone`, `shape` and `miss` counters read 0 and whose flag reads `ok` leaves the target list: the writer keeps an `UNVERIFIABLE` sentence as it stands. One still flagged `OVER-NODE` or `OVER-CHAIN`, or with a `section:` line reading `OVER-NODE` or an `unlinked:` line in its directory, stays, zero counters or not. Nothing left in the target list -> say the layer is already true in one line and stop.

Otherwise one `AskUserQuestion` over the counters, the over-budget flags and the create targets: write them, or stop. Only on approval go on.

## 7. Write in waves

A target's depth is the number of path segments of the directory holding its node, the root being 0. One wave per depth, the root's first, then ascending. Every target of a wave gets one `Agent` call, `subagent_type: viber:memory-node-writer`, no `model:` line, sent in batches as in step 5; the next wave only after every call of the previous one returned. Five labelled lines each and nothing else:

```
mode: fix | create
node: <the target's node path>
findings: <its findings file> | none
planned: <the planned set, comma-separated, root first>
refs: ${CLAUDE_PLUGIN_ROOT}/references
```

`findings` is the path its audit returned on a fix target and `none` on a create target.

A dispatch returning `VERDICT: DENIED` -> before the next wave, one `AskUserQuestion` naming the node and the refused call from its `REASON:` line: permission added and retry, skip that node, or stop.

Keep account while the waves return, counting only paths whose file name is `CLAUDE.md` - a section path is never a node:

- a node was created when its dispatch ran in create mode and returned `VERDICT: UPDATED` with that node on `FILES:`, or when such a `FILES:` path lies outside the planned set.
- a node was deleted for each such `DELETED:` line.
- the nodes that now exist are the planned set, minus every create target not created, minus every deleted node, plus every created node outside the planned set.

## 8. Reconcile the lists of nodes

After the last wave, check every node that exists:

- The root is never off: it carries no list of nodes.
- A node one dispatch wrote is off when the nodes that now exist below its directory differ from the part of `planned:` below it plus the nodes that dispatch created.
- A node no dispatch wrote is off when any dispatch created or deleted a node below its directory.
- Each node off gets one more `viber:memory-node-writer`: `mode: fix`, `node:` its path, `findings: none`, `planned:` the nodes that now exist, `refs:` as above.
- One wave per depth, the deepest first, sent in batches as in step 5, each wave's `planned:` counting what the waves before it created or deleted.
- No node off -> dispatch nothing here.

## 9. Report

Repeat what the writers returned and add nothing to it:

- each `FILES:`, `DELETED:`, `DROPPED:`, `LIFT:`, `CHAIN:` and `SUGGEST:` line, verbatim: a `SUGGEST:` line is a change to the root or a section beside it that the user makes, never you.
- each `NO-NODE` target, named as an area that needs no node.
- each target skipped or dropped on `VERDICT: DENIED`, with its `REASON:` line.
- every call returned `VERDICT: NONE` with no `SUGGEST:` line -> nothing in the layer needed changing; with `SUGGEST:` lines -> the layer was left as it is and the listed suggestions are the user's to apply.
- each `MISSING:` line of a created root, verbatim, then, when there was one, the content of `${CLAUDE_PLUGIN_ROOT}/skills/setup/templates/claude-md-prompt.txt`, read with `Read`, verbatim in a code block.

Close on one line, only when some `FILES:` line came back: those files sit in the working tree, unstaged and uncommitted, and committing them is the user's next step.
