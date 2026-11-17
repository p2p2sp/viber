# Plan rules, scripted

Every rule `plan-index.sh` rejects, under the section of `plan-rules.md` it belongs to. Only `planner` reads this file: it holds the plan to these beside `plan-rules.md`, and no reviewer reads it.

## Graph

- Ids: task ids are `T1`, `T2`, … in order; `plan-index.sh` rejects any other, with `error: task <id>: id must be T<k>, the <k>th task block in order - renumber the tasks (Ids)`. (script)
- Depends: `Depends-on` references lower-numbered tasks only, which keeps the graph acyclic. (script)
- Minimal: no `Depends-on` entry names a task already reached through another entry of the same line. (script)
- Read after: a task whose `Verification` or `DoD` names a file a lower-numbered task's `Files` lists depends on that task, directly or through another. (script)
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
- Provable: a task whose `Verification` runs `git grep` without `--untracked` over a `Files` path the tree does not hold yet has a command that never reads that file; `plan-index.sh` rejects it, with `error: task <id>: Verification runs git grep without --untracked over <path>, which this task creates and git grep never reads - add --untracked or use grep (Provable)`. (script)
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
