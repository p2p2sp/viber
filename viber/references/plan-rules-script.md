# Plan rules, scripted

Every rule `plan-index.sh` rejects, under the section of `plan-rules.md` it belongs to. Only `planner` reads this file: it holds the plan to these beside `plan-rules.md`, and no reviewer reads it.

## Spec

- Attachments: each name of the frontmatter `attachments:` map is one path component of letters, digits, `_`, `.` and `-` opening on a letter or digit (`^[A-Za-z0-9][A-Za-z0-9_.-]*$`) and unique once case folded, and a `DoD` naming `attachments/<name>` has a `<name>` entry in the map; `plan-index.sh` rejects each, with `error: attachments: name "<name>" is not one path component of letters, digits, _, . and - opening on a letter or digit - rename it (Attachments)`, `error: attachments: name "<name>" repeats an earlier one - rename one of them (Attachments)` or `error: task <id>: DoD names attachments/<name>, absent from the attachments map - add a <name> entry or drop the reference (Attachments)`. (script)
- Filled: no slot of the planner templates (a `<...>` span such as `<title>`, `<n>` or `<repo-relative path>`) is left in the plan text outside fenced blocks, HTML comments, backtick spans and the `## Contracts` appendix; `plan-index.sh` rejects it, with `error: line <n>: template slot <slot> left unfilled - replace it (Filled)`. (script)

## Graph

- Ids: task ids are `T1`, `T2`, … in order; `plan-index.sh` rejects any other, with `error: task <id>: id must be T<k>, the <k>th task block in order - renumber the tasks (Ids)`. (script)
- Depends: `Depends-on` references lower-numbered tasks only, which keeps the graph acyclic. (script)
- Minimal: no `Depends-on` entry names a task already reached through another entry of the same line. (script)
- Read after: a task whose `Verification`, `Delivers` or `DoD` names a file a lower-numbered task's `Files` lists depends on that task, directly or through another, and never names a file the tree does not hold that only a higher-numbered task lists; the `Delivers` of a decision record task (every `Files` path under `docs/adr/`) may name paths other tasks list. `plan-index.sh` rejects each, with `error: task <id> reads <path>, listed by <other>, but has no dependency path to <other> - add <other> to its Depends-on` or `error: task <id> reads <path>, which only the later task <other> creates - move the reading after <other> (Read after)`. (script)
- Disjoint: tasks with no dependency path between them never list the same file, since they run at the same time. (script)
- Leaf: an Exclusive task is never named in another task's `Depends-on` - it runs last, so nothing may depend on it. (script)
- Covers: every acceptance criterion is covered by at least one task's `Covers`, and every token there, written `AC<n>`, is an acceptance criterion. (script)

## Task

- Title: a task title never opens with a commit type prefix (`feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore` or `revert`, case folded, an optional `(scope)`, an optional `!`, then `:`); `plan-index.sh` rejects it, with `error: task <id>: title opens with the commit type prefix "<prefix>" - drop it, the commit subject is "<id> - <title>" (Title)`. (script)
- Paths: `Files` is one comma-separated line of exact repo-relative file paths, no globs, no directories, no annotations, no quoting; a bracket wrapping a whole path segment (`[id]`, `[...slug]`, `[[...slug]]`) is part of the file's own name, written exactly as on disk. (script)
- Exclusive: the `Exclusive:` line, when present, carries no value but `true`. (script)
- Hard: the `Hard:` line, when present, names its reason. (script)
- Uses: every task carries `Uses:`, naming existing contract blocks or `none`. (script)
- Supplied: a contract block whose id appears in a task's `DoD` or `Delivers` is in that task's `Uses`; `plan-index.sh` rejects a task whose `DoD` or `Delivers` names a block id missing from its `Uses`, with `error: task <id>: <DoD|Delivers> names <block id>, missing from its Uses - add it to Uses`. (script)
- Provable: a `Verification` command is written bare, as the task template shows, because `red-check.sh` runs the text as it stands; `plan-index.sh` rejects one wrapped in backticks, with `error: task <id>: Verification is wrapped in backticks - write the command bare (Provable)`. A `Verification` running inline interpreter code (`python -c`, `python3 -c`, `node -e`, `ruby -e`, `perl -e`) or a script under `.temp/` is rejected too, since the coder's shell refuses both, with `error: task <id>: Verification runs inline interpreter code "<token>" - run a project test or script instead (Provable)` or `error: task <id>: Verification runs <path> under .temp/ - run a project test or script instead (Provable)`. A task whose `Verification` runs `git grep` without `--untracked` over a `Files` path the tree does not hold yet has a command that never reads that file; `plan-index.sh` rejects it, with `error: task <id>: Verification runs git grep without --untracked over <path>, which this task creates and git grep never reads - add --untracked or use grep (Provable)`. (script)
- Memory-owned: with the `build.memory` switch on, no task lists a `CLAUDE.md` in its `Files`, whatever the host's own instructions ask, no exception, the root `CLAUDE.md` included, since the build's close updates every one; `plan-index.sh` rejects it, with `error: task <id>: Files lists <path> while build.memory is on - drop it, the build close updates every CLAUDE.md (Memory-owned)`. (script)
- Reproduced: a `Repro:` path is one of the same task's `Files`, and the task carrying it is `TDD: none`. (script)
- Self-proven: a `DoD` clause naming another task of the same plan, outside backticks, is a finding; `plan-index.sh` rejects it. (script)
- Layered: a task whose `Files` writes a file under an integration test directory (a directory segment `integration` or matching `integration[-_.]?tests?`, or a file name holding `.integration.`) has a `Verification` command, other than a `grep`, `git grep` or `rg`, naming that file or a directory of it at or below that directory; `plan-index.sh` rejects one without it, with `error: task <id>: Files writes <path> under an integration test directory, which no Verification command names - list or type-check that file or its test project there (Layered)`. (script)

## Contracts

- Blocks: contract block ids are `C1`, `C2`, … in order; `plan-index.sh` rejects any other, with `error: contract <id>: id must be C<k>, the <k>th block in order - renumber the blocks (Blocks)`. (script)
- Block body: a block opens with a `File:` line. (script)
- Named: every block is named by at least one task's `Uses`. (script)
- Homed: every `File:` path is in some task's `Files` unless the tree already holds it. (script)
- Seen: at least one task holding a block's `File:` path names that block in its `Uses`. (script)
- Consumed after: a task naming a block in `Uses` depends, directly or transitively, on every lower-numbered task holding that block's `File:` path and naming it in its own `Uses`. (script)
