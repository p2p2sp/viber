# Memory skill

A user-invoked `memory` skill that verifies, compresses, completes or rewrites the project memory of a host project outside a build.

## Goal

The plugin author is porting the older `viber` plugin (0.x) to its rewrite, `viber` 1.0. Of the skills the viber migration document lists to carry over, `memory` is the one with settled decisions and still missing: nothing in `viber` lets the user verify, compress, complete or rewrite the project memory of a host project (R2) outside a build. In `viber` the skill grew heavy: a map script computing candidate directories, a separate auditor agent per node, one writer agent per node dispatched in waves from the root down, then a reconcile pass. `viber` must do the same job without that weight.

## Requirements

- R1: A new skill `memory` exists, invoked only by the user, never by the model, with the arguments given in Contracts.
- R2: The skill treats as a node a file `CLAUDE.md` in a directory, as a section a file `CLAUDE.<topic>.md` in the node's own directory, and as the root the `CLAUDE.md` at the repository root. `CLAUDE.local.md` is the user's own file: never a section, never touched.
- R3: The skill follows the existing `rules` skill as its pattern: one script `memory.sh` with the subcommands `prepare`, `check` and `report`, and one agent `memory-editor` per target, all agents dispatched in one message.
- R4: The skill never reads a brief, a note, a node or anything an agent wrote: it acts on script lines and agent return lines only.
- R5: The result stays in the work tree: the skill and the script never stage or commit, and never offer a commit.
- R6: The agent's notes and the briefs live in `.temp/viber/<id>/memory/` at the repository root, `<id>` being the session id.
- R7: `memory-editor` is a new agent, separate from the build's `memory-writer`. It runs on the opus model at high effort, like `rules-editor`.
- R8: With no mode in the arguments, the skill asks the user once, with the options `update` and `rewrite`.
- R9: With no directory in the arguments, the skill asks for the targets: multi-select, the options being `.` (the working directory, R11) and up to 3 of its directories, a typed answer naming directories separated by spaces.
- R10: The skill asks nothing else: no approval before writing and no confirmation of `rewrite`, since everything deleted is in HEAD.
- R11: A target is a directory of the repository. As in `rules`, a path in the arguments or in a typed answer is resolved against the session's working directory, so `.` there is the working directory; in briefs, the report and the state, paths are relative to the repository root, and there `.` is the root. One `memory-editor` covers every node and section in its target directory and below it.
- R12: The agent itself decides where a node is created: only for a directory that owns contracts of its own, never because a directory exists. The script computes no candidate directories.
- R13: With nested targets (one target directory inside another), a node or section belongs to the deepest target that contains it.
- R14: In `update` mode the agent verifies each existing node and section of its target against the code, compresses it, then adds what the target lacks.
- R15: In `rewrite` mode the script deletes the nodes and sections of each target below the root, then the agent writes them from zero. The sections beside the root are never deleted; for the root itself see R23.
- R16: `rewrite` is refused as a whole when any file it would delete has uncommitted changes (untracked, staged or modified): one `REFUSED:` line per such file, nothing deleted, no brief written.
- R17: `memory-editor` applies the four conditions of the build's `memory-writer` to every line, existing or new, and cuts a line that fails any of them:
  - the code proves it (the agent read the lines);
  - it saves a reader opening more than one file, or keeps them from breaking something;
  - it does not follow from a name, a signature or the directory layout;
  - no ancestor node states it.
- R18: The four conditions of R17 are written in the agent file itself. There is no shared reference file and no fixed template of headings: a node keeps its own voice and order.
- R19: A node or a section holds at most 6000 bytes. A chain holds at most 16000 bytes, a chain being the root, plus every ancestor node, plus the node itself; sections do not count toward a chain. These are half the budgets of `viber`.
- R20: Enforcement follows `rules`: `check` runs after the agents return and prints one `BACK:` line per target with violations (format in Contracts), a violation being a file over a budget of R19 (`take off:`) or an unlinked section (R33). The skill dispatches that brief's agent again with the prompt `brief: <brief>` and one `back:` line per violation, then runs `check` again. `check` prints `DONE` when it printed no `BACK:` line.
- R21: A target is sent back once only: a later `check` with violations of a target already sent back prints nothing for it and records them for the report: a second overrun as an `OVER:` line, a section still unlinked as R33 states. Nothing is restored or deleted: the user decides before committing.
- R22: When a chain is over its budget because of the root alone, or because of an ancestor node outside the agent's target, the agent cuts nothing for it: the report carries an `OVER:` line naming that ancestor with its size.
- R23: An existing root is the user's: neither the script nor an agent ever edits or deletes it, in either mode.
- R24: When the root exists and a target resolves to the repository root (R11), the agent of that target verifies the root against the code and writes `claude:` lines to its note (a false sentence with what holds now, a sentence to remove). A target `.` named in a working directory below the root is that directory, not the root. The report shows the `claude:` lines under a `CLAUDE.md` section, as the `rules` report does.
- R25: When the root exists and no target resolves to the repository root, the root is not verified, only read so that nodes do not repeat it.
- R26: When the root is missing, `memory` creates it: `prepare` adds a separate brief `mode: root`, given to a `memory-editor` of its own dispatched in the same message as the others, whatever targets and mode were named.
- R27: When the root is missing, every other agent gets a line `root: new` and writes no build or test command into a node.
- R28: A created root holds, in this order: one sentence naming what the project is; the build command; the command of the whole test suite; the command of a single test file; at most 5 traps spanning the whole repository that the code does not show. It never holds a directory map, an index of nodes or a list of sections.
- R29: Every command of a created root is taken literally from the project's own scripts and configuration, never guessed. An item with no command found is left out with no placeholder and listed in the report under a section `Missing in CLAUDE.md`.
- R30: A created root holds at most 2000 bytes.
- R31: An orphan is a node or section in a directory that, together with its subdirectories, holds no tracked file other than `CLAUDE*.md` files. `prepare` deletes each orphan in both modes, with no agent; an orphan with uncommitted changes is kept. The report lists them under a section `Orphan nodes` as `deleted:` or `kept, uncommitted:` lines. This mirrors the dead rules of `rules`.
- R32: Nothing loads a section automatically, so a section its node does not point to is unreachable. `memory-editor` keeps sections reachable: every section has, in its node, one line naming the file and the activity before which it must be read; a line pointing to a file that does not exist is removed; a section with no node beside it is folded into a new node or deleted.
- R33: `check` reports a section its node does not point to as an `unlinked:` violation, sent to the agent in the same single send-back as the budget violations (R20). As `no paths:` in `rules`, a section still unlinked after the send-back is recorded for the report (R21) as a line `unlinked: <file>`, shown in the report section `Over budget`, the same one that holds the `OVER:` lines.
- R34: The agent creates a new section only when its node would exceed the node budget of R19.
- R35: The `setup` skill's line for a host project with no root `CLAUDE.md` reads `CLAUDE.md: missing - run /viber:memory, which writes it`. [CHANGED - was: `CLAUDE.md: missing - run /init, which writes it`]
- R36: The viber migration document is corrected: the `memory` skill is built, the `rules` skill is no longer listed as work to do, and the settled rules of this change replace the earlier wording where they differ. [CHANGED - was: it says the `memory` skill creates the root `CLAUDE.md` only when it does not exist, and its section "Memory i rules" still speaks of the `rules` skill as work to do although it is built]
- R37: The overview document and this repository's root `CLAUDE.md` describe the new skill, its script and its agent, including which labels and lines must change together across the script, the skill and the agent.

## Out of scope

- No candidate map, no auditor agents, no waves, no reconcile, no `reset` mode, no `review` or `extend` mode of `viber`.
- The `viber` file `node-doctrine.md` and its heading template are not carried over.
- No total budget across all nodes and no per-run growth room: only the node, section and chain budgets (R19) and the root budget (R30).
- The build's `memory-writer` stays unchanged. It remains the only writer of project memory inside a build (close step of `spec-implementor`): it writes only nodes and sections below the root, capped at 600 bytes of net growth per build, and sends root changes to the outcome as suggestions. It gets no section rule (D7).
- No change to `build-growth.ts` or to the 600-byte limit of a build.

## Must not change

- The `rules` skill, its script and `rules-editor` behave as before.
- The build's memory and rules close steps behave as before.
- The `setup` skill behaves as before except for the one line of R35.

## Decisions

- D1: R12, the agent deciding where nodes are created. Strongest rejected option: one agent per node with script-computed candidates as in `viber`, rejected because it needs waves from the shallowest node down and a reconcile pass, the main source of weight.
- D2: R18, the conditions living in the agent file. Strongest rejected option: a shared reference file read by both `memory-editor` and `memory-writer`, rejected to keep each agent file standing alone and small.
- D3: R21, a second overrun only reported. Strongest rejected option: restoring the target's files from HEAD on the second overrun, as the build does, rejected because here the user reviews the uncommitted result anyway.
- D4: R26, `memory` creating a missing root through a brief and an agent of its own. Strongest rejected options: refusing and sending the user to the built-in `/init`, rejected because `/init` writes a far too large file and the `viber` root rules guarded against that; and letting the agent of the target at the repository root (R11) write the root, rejected because it would force the user to name that target.
- D5: R28 and R30, the short root list at 2000 bytes. Strongest rejected option: the full `viber` root list (adding a fast test command and a layer marker convention) at 4000 bytes, rejected because no script of `viber` reads those two items and `setup` checks only the three commands.
- D6: R31, `prepare` deleting orphans with no agent. Strongest rejected option: handing orphans to the agent to decide.
- D7: The section rules of R32 to R34 apply to `memory-editor` only. Strongest rejected option: adding the same section rule to the build's `memory-writer`.
- D8: R11, the meaning of `.` and the resolution of paths as in `rules`. Strongest rejected option: `.` always meaning the repository root with every argument path resolved against it, rejected to stay identical to `rules`.
- D9: R20, one `BACK:` line per target. Strongest rejected option: one `BACK:` line per violation, grouped by the skill.
- D10: R33, a section still unlinked shown in the report section `Over budget`. Strongest rejected option: a separate report section `Unlinked sections`.

## Contracts

Invocation and script:

```
/viber:memory [update|rewrite] [directory...]
memory.sh prepare | check | report
```

Lines `check` prints (R20), a `<violation>` being `take off: <n> bytes from <file>` or `unlinked: <file>`:

```
BACK: <brief> | <violation> | <violation>...
DONE
```

Prompt of the send-back to an agent after `check` (R20, R33):

```
brief: <brief>
back: take off: <n> bytes from <file>
back: unlinked: <file>
```

Brief lines for a missing root (R26, R27):

```
mode: root
root: new
```

Agent return line and note label (R24, Constraints):

```
STATUS: DONE
claude: ...
```

Script and report lines (R16, R21, R22, R31, R33):

```
REFUSED: ...
OVER: <file> <n> bytes
unlinked: <file>
deleted: <path>
kept, uncommitted: <path>
```

Report sections (R24, R29, R31, R33): `CLAUDE.md`, `Missing in CLAUDE.md`, `Orphan nodes`, `Over budget`.

## Constraints

- Scripts follow the repository's rules: `.ts` runs directly on Node 22.18+ with `.ts` import extensions and erasable syntax only; bash wrappers target bash 3.2; no build, linter, tests or dependencies in this repository.
- A skill's description loads into every session: the `memory` description is minimal and marks the skill as user-only (R1).
- A dispatch label or a return line exists in both the agent and its skill and changes in both together. The agent returns a fixed line (`STATUS: DONE`) and free text travels in files only.

## Tests

The script is the testable seam: `memory.sh prepare`, `check` and `report`, run against a scratch git repository, show the briefs, the `REFUSED:`, `BACK:` and `OVER:` lines, the orphan deletions and the report without any model. The repository has no test suite, so this is checked by running the script by hand in a scratch repository under `.temp/`.
