# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Claude Code plugin (markdown prompts plus scripts) in `viber/`; the repository root is its marketplace.

## Commands

No build, linter or dependencies. Tests: `node --test "tests/**/*.test.ts"` from the repo root (`node:test`, in `tests/`, outside the plugin).

- `claude --plugin-dir ./viber` - session on the working copy.
- `claude plugin validate .` - validate the manifests.
- `gh workflow run release.yml -f bump=patch|minor|major` - release; never edit the version by hand.

## Constraints

- `.ts` runs directly on Node 22.18+: `.ts` import extensions, erasable syntax only.
- Bash scripts target bash 3.2.

## Architecture

- Full flow: `intent` -> `spec` -> `planner` -> `spec-implementor`. After the tests the close sends `memory-writer`, `rules-writer` and `qa-writer` in one printout, told apart by id prefix (`memory.`, `rules.`, `qa.`); extensions wait for all three. The memory writer holds the nodes and sections below the root to 600 bytes of net growth per build (`build-growth.ts`): an overrun is sent back once with `take off: <n> bytes`, a second one is restored from HEAD. The files that differed from HEAD at the first start (`before` in `state.json`) are the user's: the memory and rules writers' steps never measure, restore, remove or commit them.
- `build-rules.ts` sends the close's `rules-writer` only when a changed path matches a `paths:` glob of a rule under `.claude/rules/`; the script commits only the `.claude/rules/viber/` files that existed at HEAD.
- `qa-writer` runs only at `build.qa: true` (`qaOn` in `lib/build-config.ts`), writes `qa.md` and `qa.e2e.md` beside `spec.md` (format `references/qa-format.md`); with an `Issue:` line the build posts the committed `qa.md` once as an issue comment marked `<!-- viber:qa <path> -->`. Change together the agent, `lib/build-close.ts` and the spec-implementor skill: its body labels, `VERDICT: WRITTEN | NONE`, the marker, both file names and the per-writer change lists `work/memory-changes.md`, `work/rules-changes.md`, `work/qa-changes.md`.
- `plan.sh land` (`lib/plan-run.ts`) writes `Issue: <#n or issue link>` under `Plan:` when the planner skill passes an issue; `lib/build-run.ts` reads it. Change the line in all three together.
- `planner` -> two `plan-mapper` (lens `code`, `tests`) -> `plan-writer` -> `plan-reviewer`. `plan.sh` checks the draft, lands it in plan mode and derives each task's wave and model: no agent writes `Model:` or `## Order`.
- A code-map `conflict | ...` entry (the code contradicts an `R`) becomes a `CONFLICT:` line of `plan.sh maps` and the skill's Conflict question; `checkMap` skips it. Change the entry in `plan-mapper`, `plan-writer`, `lib/plan-run.ts` and `lib/plan-check.ts` together, the line in the skill too.
- `adr` runs beside the mappers, only when `plan.sh paths` prints `adr:` (a spec with a `D`), and stages its records in `.temp/viber/<run>/adr/`. `plan.sh land` names each in an `ADR:` line of the plan, `lib/build-adr.ts` moves them to `docs/adr/` and commits them on `build.sh <plan> start`. Change the line, the staging directory and `docs/adr` (the agent reads it too) together.
- `plan-gate.sh` refuses `ExitPlanMode` without a `PASS` on the landed text; a `simple-plan` call after the planner's last arming event disarms it. It matches the `plan.sh land` call and its `LANDED:` line: change them together.
- The fields of `plan-template.md` must match `FIELDS` in `lib/plan-parse.ts` and the rules in the header of `plan.ts`.
- A task's optional `UI:` line names files of `skills/ui-designer/references/`: `UI_REFS` in `lib/plan-check.ts`, the template and the header of `plan.ts` list them. `build-tasks.ts` hands that directory to `task-coder` and `task-reviewer` as `ui:`.
- `spec-implementor` only relays: `build.sh` owns the task loop and the close (state in `docs/<runs>/<run>/work/state.json`, committed with every commit of the run), prints a `TASKS` block (`<status> | <subject>` lines from `lib/build-list.ts`, which the skill mirrors with the task-list tools and deletes at the end), then `DISPATCH: <agent> | id: <id> [| model: <m>]` blocks, `WAIT` or `END`, and takes each return as `<id> <WORD> [<FILES>]`. Free text travels in files only.
- Change together, in `build.ts`'s header, the skill and the agents: the block format, a body label, a return line, and the review report line (`- Critical | <place> | <kind> | <what> | <fix>`, `- Minor | ...`) that `lib/build-findings.ts` cuts.
- `build.ts` imports across skills: the planner's `lib/plan-parse.ts`, `lib/plan-order.ts` and `lib/adapters/tree.ts`, the commit skill's `lib/adapters/git-write.ts`, the memory skill's `lib/memory-file.ts`. It reads the `Spec:` line `plan.sh land` writes; the skill reads the `Plan:` line.
- Simple flow: `intent` or `fixer` -> `simple-plan` -> `simple-implementor` -> `simple-coder`.
- Direct flow: `intent` -> `implementor` -> `simple-coder`, in the same session, no plan, no review. Change a `simple-coder` label or return line in both `simple-implementor` and `implementor`.
- `code-auditor` -> one `lens-auditor` per lens; `audit-report.sh` joins their part files into the report.
- `pr-review` -> the built-in `code-review`, told to write a findings file -> `scripts/pr-review.sh post`, one review with a comment per finding. Change the keys of that file (`file`, `line`, `severity`, `summary`, `failure_scenario`) in the skill and `scripts/lib/pr-review.ts` together.
- `rules` -> `rules.sh` (`list`, `prepare`, `check`, `report`) -> one `rules-editor` per target; the result stays uncommitted in the work tree. Change together, in `rules.ts`'s header, `lib/rules-run.ts`, the skill and the agent: the brief labels `room:`, `take off:`, `no paths:`, the report line `OVER:`, the note directory `.temp/viber/<id>/rules/` and the return `STATUS: DONE`.
- `memory` -> `memory.sh` (`prepare`, `check`, `report`) -> one `memory-editor` per target, plus one in `mode: root` while the root `CLAUDE.md` is missing; the result stays uncommitted in the work tree. Change together, in `memory.ts`'s header, `lib/memory-run.ts`, the skill and the agent: the brief lines `mode: root`, `root: new`, `root: verify`, `mode:`, `repo:`, `target:`, `note:` and `other:`, the send-back lines `back: take off:` and `back: unlinked:`, the script lines `BRIEF:`, `BACK:`, `DONE`, `REFUSED:`, `OVER:`, `unlinked:`, `deleted:` and `kept, uncommitted:`, the note labels `claude:` and `missing:`, the report sections `CLAUDE.md`, `Missing in CLAUDE.md`, `Orphan nodes` and `Over budget`, the note directory `.temp/viber/<id>/memory/` and the return `STATUS: DONE`.
- `extension` -> `extension.sh` (no argument: `CONFIG=`, `AGENTS=`; `add <name>`: `STATUS=`) -> writes `.claude/agents/<name>.md` from `templates/agent.md` and one `<name>:` line into `build.extensions`; the result stays uncommitted. `extensionMap` in the spec-implementor's `lib/build-config.ts` is the only reader of that map. Change together the template and `lib/build-close.ts`: the body labels `spec:`, `plan:`, `outcome:`, `notes:`, `changes:`, `out:` and the return `VERDICT: WRITTEN | NONE`.
- `e2e` -> `e2e.sh` (`find`, `start`, `wait`, `next`, and `run` for the agent) -> one `e2e-writer` per scenario of a `qa.e2e.md`, one at a time. The script names the spec file, runs Playwright, accepts a `PASS` only on its own green run, writes the `## Automation` lines and deletes a spec that did not end green; the result stays uncommitted. Change together, in `e2e.ts`'s header, `lib/e2e-run.ts`, the skill and the agent: the script lines `HANDOFF=`, `PENDING=`, `SPEC_DIR=`, `BASE=`, `LAUNCH=`, `ACCOUNTS=`, `MISSING=`, `DOWN:`, `SILENT:`, `DISPATCH:` and `END`, the brief labels `id:`, `kind:`, `file:`, `title:`, `base-url:`, `accounts:`, `reason:`, `temp:` and `run:`, the run lines `GREEN` and `RED`, the work directory `.temp/viber/<id>/e2e/` and the return `VERDICT: PASS | BLOCKED | FAIL`. The handoff grammar the script reads is `references/qa-format.md`: change them together.
- A skill never reads its sub-agents' output: files travel by path, agents return fixed lines (`STATUS:`, `VERDICT:`). Change a dispatch label or a return line in both the agent and its skill.
- Accepting a plan clears the context: a plan must stand alone.
- Skill descriptions and `hooks/content/manifest.md` load into every session: keep them minimal.
- `spec-check.sh` sections must match `spec-template.md`.
- A mockup travels as `prototype.html` beside `spec.md`: `spec-paths.sh` copies it there, the spec names it in one `R`, `lib/build-cut.ts` adds `## Mockup` with its path to each task covering that `R`, the archive keeps it. Change the name in all of them together.
- `directories` of `.claude/viber.yml` is read twice, by the same rules: `directoriesOf` in the spec-implementor's `lib/build-config.ts` and the awk of the spec skill's `spec-paths.sh`. Change them together.
- `skills/commit/scripts`: ports and adapters. Logic only in `lib/`, the selector read only by `lib/commit-args.ts`, each entry's header comment is its contract. `commit-context.sh` always exits 0.
