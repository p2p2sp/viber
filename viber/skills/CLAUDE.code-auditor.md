# viber/skills - editing the code-auditor scripts, lenses, map and agents

What binds `code-auditor/SKILL.md`, its `scripts/`, its `references/` (lens files, `<lens>.signals.md`, `synthesis.md`) and the four auditor agents to each other. The agents' own rules belong to the agents node.

## Terms

- Directive block: one output block of an auditor script, a directive line (`NEXT:`, `RUN:`, `ASK:`, `STOP:`) and the body lines after it, which `SKILL.md` sends verbatim as the agent's prompt. A fact the model only reads is a `<key>: <value>` report line.
- Ledger: `<ws>/ledger.md`, the file the scripts append to (hunts dispatched, retries spent, merge decisions, `wave-offered`), so a later call knows what an earlier one did; a script takes its state from it, never from the model.

## Relationships

- `SKILL.md` runs `frame.sh`, `map-signals.sh`, `keep-units.sh`, `hunt-return.sh` and `synthesize.sh` (then `keep-units.sh --wave` and `synthesize.sh` again) and acts only on their directives: it composes no brief and opens no lens file, report or verdict file. `keep-units.sh` and `hunt-return.sh`, the wrappers of `keep-units.ts` and `hunt-return.ts` beside them (cores of those names in `viber/lib/`, sharing `hunt-brief.ts`), strip every file an agent wrote that they parse through the strip-tag core in process; `strip-tag.sh`, run by no shipped script, is the wrapper of `strip-tag.ts` beside it (core in `viber/lib/strip-tag.ts`), exits 0 always and strips nothing without `node`. `frame.sh` is the wrapper of `frame.ts` beside it (core in `viber/lib/frame.ts`), which settles the diff scope through the diff-files core in process; `diff-files.sh`, the wrapper of `diff-files.ts` (core in `viber/lib/diff-files.ts`), is run by no shipped script. `synthesize.sh` is the wrapper of `synthesize.ts` beside it (core in `viber/lib/synthesize.ts`).

## Contracts

- `frame.sh` writes the lens file's path into `run.md`; no other file names it, and only `frame.sh`, `map-signals.sh`, `keep-units.sh`, `hunt-return.sh` and `synthesize.sh` read it. The `<lens>.signals.md` beside it holds the map-signal commands, run only by `map-signals.sh`, which hands `mapper` the finished `signals.md`. A lens's `Worktree:` line under `## Verify` (`required` or `none`) decides whether the hunter and critic blocks carry reserved worktrees from `worktree.sh` and, on the diff scope, the working tree's uncommitted changes through `diff-overlay.sh`.
- A script takes only the user's argument tokens (one holding an apostrophe passed as `--apostrophe`), ids, the workspace path and `--merge` groups, never a path or text with an apostrophe.

## Change together

- The four map headings (`## Conventions`, `## History`, `## Severity calibration`, `## Units`): `agents/mapper.md` writes them, the map gate of `viber/lib/keep-units.ts` checks them, `agents/scout.md`, `hunter.md` and `critic.md` read them.
- The lens set (`bugs`, `security`, `web-performance`, `runtime-performance`, `tests`, `design`): the files under `code-auditor/references/lenses/`, `code-auditor/SKILL.md` (description, `argument-hint`, Arguments and the numbered Lenses list), `viber/lib/frame.ts` (its lens and group tokens, the group numbers of its `NEXT: ask-lens` line), `help.html`, `tests/viber/lib/frame.unit.test.ts` and the lens name list of `tests/viber/lenses.unit.test.ts`. Each lens file keeps the four headings `## Hunts`, `## Excluded`, `## Verify`, `## Severity` in that order and no bash block, its `<lens>.signals.md` holding the bash blocks, which `tests/viber/lenses.unit.test.ts` holds. `code-auditor/README.md` (for people, no agent loads it) lists every lens, its angles by slug and an ownership table: each hand-off clause in a lens intro or `## Excluded` names a class that an angle of the receiving lens covers, and the table names that angle, so a lens or angle added, renamed or re-homed changes the README row too.
- The run header (`Lens`, `Lens file`, `Scope`, `Target root`, `Base` lines before the first `## ` of `run.md`): `viber/lib/run-header.ts` (`headerValue`, read by the keep-units and hunt-return cores), `scripts/run-header.sh` (`header_value`, sourced by `map-signals.sh` alone) and the parse inside `viber/lib/synthesize.ts`, so a header key or its spelling changes all three.
- The labelled lines of each agent brief: the `## Inputs you are given` of the agent and the block `keep-units.sh` (mapper, scout, hunter) or `hunt-return.sh` (critic, and the hunter retry) prints; a retry block is rebuilt from the ledger by the same `hunterBlock` of `viber/lib/hunt-brief.ts`.
- The hunter report, claim sidecar and critic verdict file shapes: `references/synthesis.md`, the agent that writes them and the script that reads them (`hunt-return.sh` for sidecars and verdicts, `synthesize.sh` for report head lines and verdicts); `findings.md`'s shape lives in `synthesize.sh` alone.
- The word caps of `SKILL.md`, `synthesis.md`, `critic.md`, `scout.md`, `hunter.md` and `mapper.md`: the `cap/*` rules of `tools/lint/data/caps.ts`.

## Traps

- A map-signal command in a `<lens>.signals.md` tells a test file by its path alone, never by a substring of the whole output line, and its test-or-spec filter matches a path shape (`tests/`, `.test.`, `test_`), never the bare substring `test`, which drops `src/latest.ts` and `src/inspector.ts`; `git grep -E` patterns use bracket classes, never `\b`. `tests/viber/lens-map-signals.test.ts` pins each of these cases.
- The `script-portability` lint rule reads `function NAME` and `((` anywhere in a `#!/bin/sh` file as a bashism, awk blocks included: write an awk function as `function \` plus a newline, a getline condition as `( (getline ...) > 0)` and a shell sum in its own `$(( ))`. `map-signals.sh` still runs each signal block under `bash -c`.
- Once the ledger holds `map-appended`, `keep-units.sh` skips the map gate, so a later edit of `map.md` is never re-gated or appended again; a hunt id is looked up in the ledger, so `hunt-return.sh` on an id no script dispatched exits 2.
- A hunt's reports are `<id>-<digit>.md` only: `A-x-y-1.md` is never a report of `A-x`. A hunt with only `<id>-0.md` answers `NEXT: none` and counts under `Hunts with no finding`.
- `keep-units.sh --wave` re-hunts every unit the ledger marks `no-report: U<n>` as `R-U<n>` (wave 2, `seeds.md` required like any wave 2 hunt), ahead of the kept units; `synthesize.sh` ranks `R-U<n>` right after `U<n>`. `frame.sh` records the diff scope as `diff` alone and a directory named `diff` as `./diff`, so only `Scope: diff` is the diff scope.
- On Windows `frame.sh`, `keep-units.sh` and `hunt-return.sh` print their skill and plugin paths in the `C:/` form whichever spelling invoked them (node is handed the entry path as `C:/...`).
