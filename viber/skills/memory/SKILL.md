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

Your whole tool set is `AskUserQuestion`, `Agent`, the map script calls of steps 2, 3, 4 and 8 and `Read` on `${CLAUDE_PLUGIN_ROOT}/skills/setup/templates/claude-md-prompt.txt` alone, in step 9. You open no other file and you write none: every byte of the cascade is written by `viber:memory-node-writer`, nothing here is staged and nothing is committed.

Every map script call is one literal line, `"${CLAUDE_SKILL_DIR}/scripts/memory-map.sh"` first, every path double-quoted, no interpreter word in front and nothing chained after. A call exiting 2 -> report its `error:` line and end the run. A call that prints `NEXT:` lines is answered by acting on its blocks: a block is its `NEXT:` line and the lines after it, up to the next `NEXT:` line.

## 1. Report the layer

Before any question, one line per fact worth deciding on:

- each `node:` line with its two sizes and its flag. `OVER-NODE` and `OVER-CHAIN` are the map's budget flags. A node below the root already over a budget is reported here and brought within it by its writer, never by you; the root belongs to the user, so its writer only suggests what to trim.
- each `section:` line with its size and flag, under its node when one exists. A section never counts toward a chain.
- each `unlinked:` line, named as a section no reader can reach.
- each `orphan:` line, named as a node left alone in a directory whose other files are gone.
- each `dirty:` line with its `modified` or `untracked` word.
- each `cand:` line with its file count, its byte count and its `toolchain` or `plain` signal. A directory carrying its own build manifest earns a look, never an automatic node.

## 2. Route on the state, then the mode

`state: none` means no node is tracked anywhere. Say the layer is empty, ask nothing, run `"${CLAUDE_SKILL_DIR}/scripts/memory-map.sh" --targets extend` and go to step 4: there is nothing to review and nothing to reset.

Otherwise one `AskUserQuestion`, the four modes in that single call:

- `review` - verify the existing nodes against the code of their areas.
- `extend` - give the candidate directories the nodes they lack.
- `both` - the nodes and the candidates in one pass.
- `reset` - delete nodes, then start from zero.

An argument naming one of the four is that answer already: take it and ask nothing. On `state: complete` lead with the flags and the orphans; on `state: partial` lead with how many candidates carry no node.

`reset` goes to step 3. Every other mode runs `"${CLAUDE_SKILL_DIR}/scripts/memory-map.sh" --targets <mode>`, `<mode>` being `review`, `extend` or `both`, and goes to step 4.

## 3. Reset

The list is every `node:` line, or the ones the user named, each followed by every `section:` line in its directory, plus, when the list is every `node:` line, every `unlinked:` section with no `node:` line beside it: a node takes its sections along. Print it whole, one path per line: a reset deletes this project's memory.

A path in the list that also carries a `dirty:` line refuses the whole call. Name each offending path with its own word, say the user commits or discards that work and runs the command again, and stop there. A refusal is never narrowed into a smaller reset that goes ahead, and uncommitted work is never corrected into something deletable.

Otherwise one `AskUserQuestion` over that exact list. On anything but approval, stop. On approval:

```
"${CLAUDE_SKILL_DIR}/scripts/memory-map.sh" --reset "<path>" "<path>"
```

- exit 0 -> the `removed:` lines are the deletion. Report them, then run `"${CLAUDE_SKILL_DIR}/scripts/memory-map.sh" --targets reset` with one `--removed "<path>"` per `removed:` path line, node or section, the count line left out, and continue into step 4. The map above still lists the deleted nodes and is no longer a source of any fact but its `id:`.
- exit 3 -> nothing at all was deleted. Repeat its `refused:` lines verbatim and stop. A refusal may name a section missing from the list: one deleted and not yet committed.
- exit 2 -> the call itself was unusable. Report it and stop.

## 4. Approve the targets

Nothing is dispatched before the user has seen the target list and kept what belongs in it. The `target:` lines of the call just made are that list, `fix` for a node to verify and `create` for a node to write. Show them one line each, as printed. `NEXT: none` alone means no target: say so and stop.

Then one `AskUserQuestion` over that list: all of them, or the ones the user picks. Offer the targets themselves as options while the list is short enough to show; past that, offer all of them, none of them, and take the paths a free answer names verbatim. A target the user dropped reaches no auditor and no writer. Nothing kept -> stop, having dispatched nothing and written nothing.

Then run the same `--targets` call again, the same mode word and, on `reset`, the same `--removed` paths, with `--id "<the id: value of the map above>"` and one `--keep "<node path>"` per kept target, the path its `target:` line names after `fix` or `create`. Its `planned:` line is the planned set: it stays whole to the end of the run, a target dropped or confirmed later still counting in it.

`review` and `both` go to step 5. `reset` and `extend` have no fix target and go straight to step 7.

## 5. Audit

One `Agent` call per `NEXT: memory-auditor` block, `subagent_type: viber:memory-auditor`, no `model:` line - the agent's own frontmatter is its strength - and the block's body lines verbatim as its prompt, nothing added. The calls go out in batches, here and in steps 7 and 8: at most 16 in one message, run in parallel, the next message only after every call of the previous one returned. A call the harness refuses with `Concurrent subagent limit reached` never ran: it goes into the next message, no later message carries more calls than the previous one had accepted, and it is neither a missing output line nor a `VERDICT: DENIED`.

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
planned: <the planned: line of step 4, copied whole>
refs: ${CLAUDE_PLUGIN_ROOT}/references
```

`findings` is the path its audit returned on a fix target and `none` on a create target.

A dispatch returning `VERDICT: DENIED` -> before the next wave, one `AskUserQuestion` naming the node and the refused call from its `REASON:` line: permission added and retry, skip that node, or stop.

## 8. Reconcile the lists of nodes

After the last wave, run `"${CLAUDE_SKILL_DIR}/scripts/memory-map.sh" --reconcile --planned "<the planned set, the value of the planned: line>"` with, for each write wave dispatch that returned `VERDICT: UPDATED`, `--fix "<its node>" --files "<its FILES: paths, comma-separated>"` on a fix dispatch or `--create "<its node>" --files "<those paths>"` on a create one. A dispatch with any other verdict adds no flag.

The call answers with one `NEXT: memory-node-writer` block per node whose list of nodes is off, all of one depth, or `NEXT: none`. Send each block as one `Agent` call, `subagent_type: viber:memory-node-writer`, no `model:` line, its body lines verbatim as the prompt, in batches as in step 5. After every call of that wave returned, run the call again with every flag it carried plus one `--done "<node>" --files "<its FILES: paths, empty when none>"` per dispatch of the wave, whatever its verdict, and act on its answer the same way, until `NEXT: none`. `NEXT: none` on the first answer -> dispatch nothing here.

## 9. Report

Repeat what the writers returned and add nothing to it:

- each `FILES:`, `DELETED:`, `DROPPED:`, `LIFT:`, `CHAIN:` and `SUGGEST:` line, verbatim: a `SUGGEST:` line is a change to the root or a section beside it that the user makes, never you.
- each `NO-NODE` target, named as an area that needs no node.
- each target skipped or dropped on `VERDICT: DENIED`, with its `REASON:` line.
- every call returned `VERDICT: NONE` with no `SUGGEST:` line -> nothing in the layer needed changing; with `SUGGEST:` lines -> the layer was left as it is and the listed suggestions are the user's to apply.
- each `MISSING:` line of a created root, verbatim, then, when there was one, the content of `${CLAUDE_PLUGIN_ROOT}/skills/setup/templates/claude-md-prompt.txt`, read with `Read`, verbatim in a code block.

Close on one line, only when some `FILES:` line came back: those files sit in the working tree, unstaged and uncommitted, and committing them is the user's next step.
