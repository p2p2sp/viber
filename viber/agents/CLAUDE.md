# viber/agents - the twenty-six subagents viber's skills dispatch

This directory owns one markdown file per agent registered in `viber/.claude-plugin/plugin.json` `agents[]`: each a single-purpose worker taking labelled lines and returning fixed lines. The dispatching side (what a skill sends, when, at what tier) belongs to the skills node; the reference files the agents read belong to the references node.

## Terms

- Labelled input: every agent's `## Input` names the `label: value` lines its dispatch carries and what each one means; a multi-line value (`input:`, `question:`, `summary:`, `brief:`) runs to the end of the prompt. The dispatching skill sends exactly those lines and nothing else.
- `refs:`: the plugin reference directory (`${CLAUDE_PLUGIN_ROOT}/references`), from which an agent reads the reference files its body names.
- Auditor agents: the four `code-auditor` agents (`mapper`, `scout`, `hunter`, `critic`). They take another form: a `# <Name> - <role>` heading, `## Inputs you are given`, `## Hard rules`, no tools paragraph, no `DENIED` line.
- Coder notes: `<run>/work/<task id>-coder.md`, the at-most-8-line notes `task-coder` writes, read as `*-coder.md` by `task-reviewer`, `final-reviewer`, `closeout`, `memory-writer`, `rules-writer` and `qa-writer`.

- Review set: `planner-spec-review`, `planner-graph-review` (reads from `## Tasks` on) and `planner-task-review` (a slice of at most 8 consecutive tasks) review a planner plan past 12 tasks, each reading only its own `plan-rules.md` sections and its part of the plan; `planner-review` reviews every other plan.

## Relationships

- Reference reads: which agent reads which `<refs>/` file is listed per file in `references/CLAUDE.md`. `hunter` writes to the schema of `skills/code-auditor/references/synthesis.md`; `hunter` and `critic` get a clean checkout only for a lens reading `Worktree: required`, through `skills/code-auditor/scripts/worktree.sh` and, on the diff scope, `diff-overlay.sh`. `mapper`, `scout`, `hunter` and `critic` read the run file and one lens file of `skills/code-auditor/references/lenses/`; `mapper` also reads the `signals.md` that `skills/code-auditor/scripts/map-signals.sh` builds from that lens's `<lens>.signals.md`, and runs no signal command itself.
- Skill calls from agents: `prototype-writer` invokes `impeccable`, else `viber:pro-designer`, when either is in its skill listing.

## Contracts

- Strength: `task-coder` and `task-reviewer` get the task's tier as `model`, `final-reviewer` `sonnet` clamped into the tiers range, `scout` `sonnet` on the security lens; every other dispatch passes no `model`, so the frontmatter `model:` and `effort:` decide. `mapper`, `hunter` and `critic` carry `model: inherit` and run at the session's model; `scout` is pinned to `haiku`.
- Every non-auditor agent carries the tools paragraph ("Your tools are ...: call each one directly, never through ToolSearch ...") naming exactly its `tools:` list; an agent holding `Bash` adds the sentence that `No such tool available` on `Glob` or `Grep` means using `find` and `grep` through `Bash`, and `mapper`, `hunter` and `critic` state that fallback under `## Hard rules`. The same paragraph, and their hard rules for those three, add that a refusal whose reason opens with `viber guard:` is a correction to apply, never a denial.
- Agents sharing the working tree (`task-coder`, `task-reviewer`, `final-reviewer`) keep git read-only (`status`, `diff`, `log`, `show`), never `stash`, `checkout`, `restore` or `clean`: one stash stack serves every coder. `task-coder`'s only index writes are `git rm -r -q --` and `git update-index --chmod=+x --`. Each guarded rule is one line in the agent, enforced by `hooks/scripts/shell-guard.sh` (the coder: no chained command, no `rm`, no file write or inline or `.temp/` interpreter code through `Bash`, the four git subcommands; both reviewers: the git subcommands only), whose header holds the rationale.
- Write scope: a reviewer or auditor writes only its report or findings file, and only on the verdict its `## Output` names (`task-reviewer` and `final-reviewer` write nothing on `PASS`; `planner-review`, the three review-set agents, `outside-plan-review`, `impact-mapper`, `adr-screener`, and `researcher` write nothing at all, `critic` nothing outside its reserved worktree but its `Out:` verdict file, `scout` only its `Out:` score file), except that `task-reviewer` also appends its `EXTRA:` paths to its `extras` file on either verdict; `arbiter` writes only its `ruling` file, the four output lines whole; `closeout` edits only `spec.md`, writes `outcome.md`, then makes one `commit-task.sh --leftovers` call (which rewrites `outcome.md` from its heading line on) before its one literal `archive-run.sh` call; `e2e-writer` writes one spec file plus its status line under `## Automation` of `qa.e2e.md`.
- Plan review reads no scripted check: `planner-review`, `planner-spec-review`, `planner-graph-review` and `planner-task-review` read `plan-rules.md` only, so a check `plan-index.sh` decides (numbering, commit prefix, backticked or interpreter `Verification`, `CLAUDE.md` in `Files`, attachment names, template slots) stays out of their prompts. The first, second and fourth search the code only for callers of the symbols whose signature or observable behaviour the plan changes and for documents and `.claude/rules/` files naming a path it moves, modifies or deletes (the `Grounded` end-to-end spec search excepted), and read a file only to confirm a hit or check a task against the code it modifies; `planner-graph-review` and `outside-plan-review` keep their broad exploration.
- Join keys: `scout` echoes `unit` (the `U<n>` id) byte-identical to the unit line it was given; `critic` is handed only the `.claim.md` sidecar (`LOCATION`, `CLASS`, `## Reproduce`), never the hunter's report.

## Commands

- `node --test tests/viber/code-auditor.unit.test.ts` after an auditor agent is added, removed or renamed: it holds every `viber:<name>` the `code-auditor` skill dispatches to `plugin.json` `agents[]`.

## Change together

- The "Stop what you started" block is verbatim in `task-coder`, `task-reviewer`, `final-reviewer`, `test-runner`, `e2e-writer` and `skills/extension/templates/extension.md`.
- The tools paragraph and the `DENIED` / `REASON: <refused tool name>: <the exact refused command, or the path for a file tool>` output wording are verbatim across every non-auditor agent (`researcher` adds the URL or query for a web tool).
- Memory audit vocabulary (`STALE`, `GONE`, `UNVERIFIABLE`, `MISS`, `SHAPE`, `OK`) and the `<out><slug>-audit.md` name (`/` -> `--`): `memory-auditor`, `memory-node-writer` and `skills/memory/SKILL.md`. The rules counterpart (adding `DROP` and `MOVE:`, and for the trail `IGNORED:`, `USED:`, `REJECTED:` in `<out>_trail-audit.md`): `rules-auditor`, `rules-writer` and `skills/rules/SKILL.md`. An `ENFORCE:` line (after the `AUDIT:` line) is no counter and never reaches a findings file or the writer: `rules-auditor` reports it.
- The clean-checkout steps (`worktree.sh add`, `diff-overlay.sh`, replay, `worktree.sh remove`, and `WORKTREE_FAILED` / `OVERLAY_FAILED` ending in `NO FINDING` for `hunter` and `INCONCLUSIVE` for `critic`): `hunter.md` and `critic.md`.
- An agent added, removed or renamed: `plugin.json` `agents[]`, every `viber:<name>` dispatch in `skills/`, and for `planner-review`, the three review-set agents and `outside-plan-review` `hooks/scripts/plan-gate.sh`.
- `planner-review`'s input labels (`refs:`, `memory:`, `input:`, a summary file path or text whose `Answered:` lines `planner/SKILL.md` writes and the Faithful rule reads): `planner-review.md`, `skills/planner/SKILL.md` and the dispatch text `hooks/scripts/plan-gate.sh` prints in its deny message. The review set's labels (`planner-task-review`'s `tasks: T<a>-T<b>`, `planner-graph-review`'s `memory:`, `planner-spec-review`'s `input:`) are written by the same two.
- `impact-mapper`'s `targets:` input (a path, `<path> | <symbol>`, `<path> | new`), its `candidates:` input (the file `skills/planner/scripts/reach.sh` writes: a `## <target as written>` section each, with `terms:`, `skipped:`, `<path>:<line>: <text>` and `truncated:` lines) and `REF:` output lines (kinds incl. `implementation`, `collection`): `impact-mapper.md`, `reach.sh`, the reach step of `skills/planner/SKILL.md` and `tests/viber/impact-mapper-prose.unit.test.ts`.
- The tools paragraph, `## Calibration`, its re-review sentence and `## Output` are verbatim across `planner-review`, `planner-spec-review`, `planner-graph-review` and `planner-task-review`; each carries `effort: high`, and the three set agents take no `scope:` line.

- The guarded one-line rules of `task-coder`, `task-reviewer` and `final-reviewer`, and `hooks/scripts/shell-guard.sh` (rules R1-R5 and their rationale): a rule added or dropped changes both.
- The `viber guard:` marker sentence: the tools paragraph above, `mapper`, `hunter` and `critic` hard rules, `skills/extension/templates/extension.md`, and the marker `kill-guard.sh` and `shell-guard.sh` open their reasons with.

## Traps

- The harness rejects a subagent's `Write` of any `.md` whose name starts with `report`, `summary`, `findings` or `analysis`; `hooks/register.tsx` writes such a file in its place for a viber agent inside the project root, yet every file an agent is told to write is named otherwise (`outcome.md`, `review-*.md`, `*-audit.md`).
- A file an agent writes that something parses (`hunter`'s report and sidecar, `mapper`'s `map.md`, `scout`'s scores, `critic`'s verdict) can end on a leaked `</content>` line: no agent reads its tail back, `strip-tag.sh` deletes it in the script that parses the file (`keep-units.sh`, `hunt-return.sh`), and a new parsed output needs the same call.
- `scout`, `mapper` and `hunter` return no `VERDICT:` line (`scores written: <path>`, `map written: <path>`, the paths written): a caller parsing them never looks for one, and for `hunter` reads the files in `reports/`, never its final message. `critic` ends on its `VERDICT:` line alone, yet the script reads the verdict file it wrote to its `Out:` path, never that message.

## Sections

- Read `CLAUDE.task-flow.md` before editing `task-coder`, `task-reviewer`, `final-reviewer` or `arbiter`: the baseline, red evidence, extras, stall, run lessons, scratch, memory, repair and re-review hand-offs between them.
