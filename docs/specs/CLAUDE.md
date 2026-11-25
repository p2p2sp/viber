# docs/specs - archive of viber's finished runs on this repo

Holds one directory per run of viber that built a change to this repo and closed, keeping what the run left worth reading later. It owns no plugin code and no contract any plugin reads at runtime; the live contracts are the plugin sources.

## Terms

- Run key: the directory name `<yyyy-mm-dd-HH-mm-ss>_<slug>`, kept unchanged from the open run `docs/_specs/<key>/`. The slug is the plan title lowercased, every other run of characters collapsed to `-`, cut at 60 characters, so a name often ends mid-word.
- Drift marker: `[D<n>]` at the end of a `spec.md` sentence the build made false, explained on one line `D<n> (#<criterion>): ...` in a section appended at the end of that file.

## Relationships

- Written only by viber's `scripts/archive-run.sh`, called by the `closeout` agent at the close of a build: it moves the run directory here in one commit, dropping `plan.md`, `status.md`, `tasks/` and `work/`. A second run with the same key is refused, never merged.
- Read by viber's `e2e` skill (newest `qa.e2e.md` by directory name across open and archived runs) and by `intent`/`planner` when the user points at a `phases.md` (or `roadmap.md`) to build its next phase.

## Contracts

- A run holds `spec.md` always, and only when the run produced them: `phases.md` or `roadmap.md` (a split change), `rulings.md` (rulings the build made itself), `qa.md`/`qa.e2e.md`, `attachments/` (the `.temp/` files the plan was built from, listed at the end of `spec.md`), and `outcome.md` (the build summary, closing on `Drift: <n>` or `Drift: none`). Runs keyed before `2026-10-02` hold no `outcome.md`.

## Traps

- An archived `spec.md` states what was promised and delivered at that run's close, never what the plugins do now: never take a contract from it, and never edit it to match later code. A later change is a new run with its own key.
- A `phases.md` or `roadmap.md` entry marked `(built)` or `(this plan)` is already delivered; the next phase is its first unmarked entry. An entry may carry `Issue: <url>` as its first indented line, the phase's sub-issue; resuming that phase ties the run to it.
