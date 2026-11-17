# viber/scripts - the plugin-level bundled scripts

This directory holds the scripts more than one viber skill or agent calls: the config parser, the run lifecycle, the switch fragment selector, the skill part printer and the GitHub and browser wrappers. A script of one skill lives under that skill's `scripts/`, the hook scripts under `hooks/scripts/`.

## Terms

- Run scripts: the four bash scripts of the run lifecycle, `plan-path.sh`, `plan-index.sh`, `commit-task.sh` and `archive-run.sh`, all `set -euo pipefail`, each refusal a distinct exit code.
- GitHub wrappers: the `#!/bin/sh` scripts `issue-facts.sh`, `issue-templates.sh`, `issue-create.sh`, `post-comment.sh`, `pr-facts.sh`, `pr-create.sh`, `pr-threads.sh`, `pr-reply.sh`, `qa-comment.sh` and `gh-read.sh`. Each prints its fixed `KEY=value` block only after `gh` succeeded and its output parsed (self-verifying), else one `ERROR <script>: ...` line on stderr; the bash scripts report on stderr as `error: ...`.

## Relationships

- Callers: `config.sh` is preloaded by `implementor`, `planner`, `e2e` and `intent` (`--questions`) and run by `skills/extension/scripts/extension.sh` and `hooks/scripts/plan-gate.sh`; `run-clock.sh` by `implementor` alone; `switch-text.sh` by `implementor`, `planner`, `intent`, `fixer` and `prototype`; `skill-part.sh` by `implementor` (its `close` part) and `intent` (its `done` part); `plan-path.sh` by `planner`, `implementor`, `intent` and `fixer` (`--start`/`--checkout`) and `e2e` (no argument, the latest run); `plan-index.sh` by `planner` (validate), `implementor` (`--split`), `task-reviewer` (`--extra`, through its `scope` line) and `closeout`; `commit-task.sh` by `implementor` (`--drop` included), `e2e` (`--e2e`) and `closeout` (`--outside`); `archive-run.sh` by the `closeout` agent alone; `red-check.sh` by `implementor` alone (`fragments/red-check.true.md`); `run-failures.sh` (its `--lessons` mode included) and `run-tokens.sh` by `implementor` alone.
- GitHub callers: `issue-facts.sh` by `intent`, `fixer`, `prototype`; `issue-templates.sh` and `issue-create.sh` by `issue-create`, `intent`, `fixer`; `post-comment.sh` by `intent`, `prototype`; `pr-facts.sh` and `pr-create.sh` by `pr-create`; `pr-threads.sh` by `pr-feedback` and `pr-feedback-reply`; `pr-reply.sh` by `pr-feedback-reply`; `qa-comment.sh` by `pr-create` and the `implementor` close (`qa.true.md`); `gh-read.sh` by `talk`; `open-page.sh` by `setup`, `help`, `prototype`; `check-playwright.sh` by `e2e`.
- Sibling calls: `plan-path.sh` sources `run-branch.sh`; `run-branch.sh` runs `config.sh --branching` and `sh issue-facts.sh`; `gh-read.sh issue` runs `sh issue-facts.sh`; `red-check.sh` runs `plan-index.sh` and `config.sh --red-check`.

## Contracts

- `run-branch.sh` is a library: sourced by `plan-path.sh`, never invoked, mode 100644 in the index, no `set` line of its own. Its functions return 5 with the reason on stderr and HEAD, index and tree untouched; `plan-path.sh` turns that into its own exit 5 (run branch could not be set).
- `plan-path.sh --start` under `allowed` or `required` prints `branch_report`'s lines unchanged and, after them, the decision `branch_decide` and its `decide_*` helpers build in `run-branch.sh` from `st_*` entry rows and `tl_*` tail values: `next:` (`settled`, `kept`, `ask-entry`, `ask-base`, `errors`, `none`, `abort`), `settled:`, `option:` per answer and `note:`; the `plan-path.sh` header lists the rules. A flag value beginning with `--` counts as missing (exit 2). `plan-path.sh --branch` likewise ends its report on the planner decision `branch_plan_decide` and its `plan_*` helpers build from `pb_*` entry rows and its `--work`, `--name` and `--entry` flags: `next:` (`write`, `ask`, `ask-entry`, `errors`, `stop`), `work:`, `branch:`, `show:`, `option:` and `note:`, which the planner's `branching` fragments only act on.
- `plan-path.sh --land` rewrites the landed copy's `source:` line to the copy's own path and adds `planned: <absolute path of the source plan>` right after it, unless the frontmatter already holds one (a frontmatter with no `source:` gets neither): `run-tokens.sh` finds the planning transcripts by that path.
- Exit codes of the run scripts are part of their contract, each documented in the header: `plan-path.sh` 2 argv, 3 no plan, 4 copy failed, 5 run branch, 6 unusable `attachments:` map (checked on every `--land` before the branch step); `plan-index.sh` 2 unusable plan or argv, 3 no task blocks, 4 broken task contract; `commit-task.sh` 2 bad arguments, 3 no such task, 4 no change, 5 staging or commit failed; `archive-run.sh` 2 argv outside `docs/<runs>/` or with no run key, 3 destination exists, 4 run unfinished, 5 a git step failed.
- `skill-part.sh <skill dir> <part>` prints `<skill dir>/parts/<part>.md`, running only a ```` ```! ```` block whose single body line is the exact `switch-text.sh` call shape (header) and replacing it, fences included, by that call's output; any other block prints as plain text. A fragment's output is appended as `switch-text.sh` printed it, never expanded twice; the placeholders of every other line are expanded here.
- `config.sh`'s `--branching` report is read by `run-branch.sh` and `pr-facts.sh` only, `--red-check` by `red-check.sh` only, `--specifications` by `run-failures.sh` and `rules-map.sh` only (both fall back to `specs`), `--questions` by the `intent` preload only (the default block carries no line for that key, though its `# local:` line names it); every other reader takes the default block. A report line added or renamed changes those readers.

## Commands

- Each script's test is `tests/viber/<basename>.test.ts`, integration tier (CI only). `run-branch.sh` has no file of its own: `tests/viber/plan-path.test.ts` covers it through `--branch`, `--start`, `--checkout` and `--land`.

## Traps

- `skill-part.sh` and `run-tokens.sh` are invoked bare by `implementor`, so their index mode must stay 100755: the portability exec-bit sweep fails on 100644.
- The GitHub wrappers are `#!/bin/sh` and must stay POSIX: CI runs them under every POSIX shell present, and the portability sweep flags bash-only syntax in them.
- A failed GitHub call is never retried by its caller: `post-comment.sh` exits 1 when whether the comment landed is unknown, and `pr-create.sh` exits 1 after the push may already have happened (its ERROR line names the pushed branch); `pr-reply.sh` exits 1 when a reply may or may not have landed; the caller reports.
- The portability sweep reads the awk block of `pr-threads.sh` as shell: it flags `function NAME` and `((` there, so the block defines no function (a sentinel `T` line closes the last thread) and the `--jq` filter avoids `((`.
- `issue-create.sh` never removes a created issue when applying its type or its `--parent` attach fails: the type failure is reported as `TYPE=dropped` or `TYPE=error`, the attach failure as `PARENT=error` with `PARENT_ERROR=`, always with exit 0.
- `gh-read.sh` is the read-only reader: every `gh api` call in it stays a GET (no `-X`, `-f`, `-F`), which `tests/viber/gh-read.test.ts` asserts; a write belongs in its own wrapper.

## Sections

- Read `CLAUDE.run-scripts.md` before editing `plan-index.sh`, `commit-task.sh`, `archive-run.sh`, `red-check.sh`, `run-failures.sh` or `run-tokens.sh`.
- Read `CLAUDE.github.md` before editing `qa-comment.sh`, `pr-threads.sh`, `pr-reply.sh`, `issue-facts.sh` or `post-comment.sh`.
