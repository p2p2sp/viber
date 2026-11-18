## Roadmap

Part 1 of 7 - Directive convention and the implementor task loop

1. Directive convention and the implementor task loop (this plan)
2. Implementor close
   - `run-summary.sh` replaces `run-clock.sh` and `run-tokens.sh`, both removed.
   - `commit-task.sh --leftovers` writes the leftovers section; `closeout` keeps only the drift filter and `outcome.md`; `commit-task.sh --repair` routes files to tasks itself.
   - `plan-index.sh --final-review` and `--slice`; the `--split` profile prints each task's tier and subject, and `haiku?` only for `TDD: none`, at most 2 files and no `hard`, the model confirming.
   - `run-changes.sh` and `run-suite.sh` (the run in the background plus the wait) for `test-runner`; the extensions steps and `qa: kept` from scripts.
3. Code auditor
   - `critic` and `scout` get Write and an `out:` path; `synthesize.sh` points at `MERGE?` pairs and the model decides; scripts in POSIX sh and awk; the hunter pool stays with the model.
   - `map-signals.sh`, `hunt-return.sh`, `frame.sh`, `keep-units.sh`, the trailing closing-tag strip in scripts.
4. Memory and rules
   - Untracked `CLAUDE.md` nodes visible only to `memory-map.sh --reconcile`; `memory-map.sh --targets` and `shape:` lines in the auditor brief, the auditor still judging the title sentences.
   - A rule matching nothing is `GONE` without an auditor, its removal still confirmed by the user; `rules-map.sh` `misplaced:`, `--brief`, `--confirm`.
5. Planner validation and review
   - Every mechanical reviewer check moves into `plan-index.sh`, the input-dependent ones (`Attachment:`, `Root cause`, `Repro:`) through `--input <summary file>` and staying with the reviewer when the input is text; every error as a `FIX:` or `SPLIT:` directive, all errors in one run; the missing unnumbered-scenario check added.
   - Reviewers get Write and `out:`; `review-round.sh` aggregates verdicts (`DENIED` over `FAIL` over `PASS`), retries a member without a verdict, composes the round 2+ prompts and answers `NEXT: fix`, `NEXT: redispatch <members>` or `NEXT: exit-plan`; every round after a fix reviews the whole set, `plan-gate.sh` unchanged.
6. Intent, fixer, e2e and the rest
   - Full payload on the `dispatch:` lines; `reach.sh` prints the impact-mapper prompt; `run:` and `settle:` fields on the branch options; `--branch` answers `next: kept`, the model editing the frontmatter.
   - `tree-record.sh --save`/`--check` in `fixer`; `app-wait.sh` only waits, the launch staying with the model; `qa-ledger.sh` with an awk ASCII table; the issue or PR argument classifier called at runtime; `summary-path.sh`, `attach-lines.sh`, `threshold:` only past the accepted count, `SAY=` for `STATUS=skip`.
7. Git, GitHub and the rest
   - `factory.sh answer`, `approve`, `reject` with `MISMATCH` falling back to keys; `verdict-nudge.sh` reads the `VERDICT:` values from the agent file; `commit.sh` runs its own self-check and prints the result line, `commit-selfcheck.sh` removed; `commit-context.sh` gives the ready footer and `RUN:`.
   - `pr-reply.sh --list`/`--all` under one confirmation, never retrying; `build_report.mjs --prompts` writes prompt files under `.temp/`; `issue-create.sh --template`; `pr-facts.sh` `TITLE=`, `TITLE_TEMPLATE=`, `FOOTER=`, `BODY_FILE=`, `SAY=`, `ASK` with `RERUN=`; `bootstrap.sh` `ASK`/`RUN`; `shell-guard.sh` returns the corrected command.
   - Every part: the directive format of part 1, a pure refactor, a word cap on the skill it touches.
