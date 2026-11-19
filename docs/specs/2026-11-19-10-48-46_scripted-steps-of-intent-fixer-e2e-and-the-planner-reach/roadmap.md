## Roadmap

Part 6 of 7 - Intent, fixer, e2e and the rest

1. Directive convention and the implementor task loop (built)
2. Implementor close (built)
3. Code auditor (built)
4. Memory and rules (built)
5. Planner validation and review (built)
6. Intent, fixer, e2e and the rest (this plan)
7. Git, GitHub and the rest
   - `factory.sh answer`, `approve`, `reject` with `MISMATCH` falling back to keys; `verdict-nudge.sh` reads the `VERDICT:` values from the agent file; `commit.sh` runs its own self-check and prints the result line, `commit-selfcheck.sh` removed; `commit-context.sh` gives the ready footer and `RUN:`.
   - `pr-reply.sh --list`/`--all` under one confirmation, never retrying; `build_report.mjs --prompts` writes prompt files under `.temp/`; `issue-create.sh --template`; `pr-facts.sh` `TITLE=`, `TITLE_TEMPLATE=`, `FOOTER=`, `BODY_FILE=`, `SAY=`, `ASK` with `RERUN=`; `bootstrap.sh` `ASK`/`RUN`; `shell-guard.sh` returns the corrected command; `SAY=` for the `STATUS=skip` of `pr-reply.sh`.
   - Every part: the directive format of part 1, a pure refactor, a word cap on the skill it touches.
