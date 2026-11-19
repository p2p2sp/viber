# Verified audit findings of e2c5d216..HEAD (bugs and design lenses)

Every item below was reproduced by a hunter and independently verified by a critic; none existed at e2c5d216. Fixtures: `.temp/audit/critic/<area>/`. Severity is the critic's.

## Bugs

B1 (6) `viber/hooks/scripts/shell-guard.sh:593,644`: on bash 5.2 (`patsub_replacement` on) the unquoted replacement `${part//$sep/$bs$bs}` yields one backslash, so a refused command holding `\` (e.g. `grep -n "a\.b" src/x.ts && ls`) gives deny JSON that does not parse, exit 0. `tests/viber/shell-guard.test.ts` DoD.2 fails. Fix: quote the replacement `"$bs$bs"` (both sites, `redirect_suffix` too).
B2 (5) `viber/skills/memory/scripts/memory-map.sh:1047,1083-1084,1122-1123`: `--targets` cuts node and candidate paths at the first space (`${x%% *}`): `My Docs/` gives `target: create My/CLAUDE.md Docs ...`, `--keep "My Docs/CLAUDE.md"` exits 2 in extend and review.
B3 (5) `viber/skills/rules/scripts/rules-map.sh:743-745,765-767`: `--confirm` drops the `rule:` and `misplaced:` lines of a kept rule whose path holds a space; the writer is dispatched with no licence to change it (`agents/rules-writer.md:30`).
B4 (4) `viber/skills/code-auditor/scripts/frame.sh:131-145`: an existing directory given as `/c/...`, `C:\...` or `c:/...` gives `STOP: ... area directory not found`; only `C:/...` frames.
B5 (4) `viber/skills/code-auditor/scripts/synthesize.sh:549`: `Scope: ./diff` (a directory named diff, frame.sh:153) is read as the diff scope: `not investigated 0` where it is 1. keep-units.sh:360 and hunt-return.sh:173 test `= diff` only.
B6 (4) Windows plugin-root spelling: `review-round.sh:112-113` (`refs:`), `frame.sh:42`, `keep-units.sh:94`, `hunt-return.sh:80` print `/c/...` from `pwd`; `run-branch.sh:823` (decide_root) and `skills/setup/scripts/bootstrap.sh:420` print `C:/...` from `pwd` whatever the invoked spelling; `commit-context.sh` echoes the invoked spelling. Rule: `viber/scripts/CLAUDE.md` Contracts and specs 2026-11-19-10-48-46 spec.md:197, 2026-11-19-12-07-08 spec.md:188 ("never a `pwd` result"). Failing on Windows Git Bash: frame.test.ts 22/53, review-round.test.ts 11/40, hunt-return.test.ts 9/21, keep-units.test.ts 7/35, commit-context.test.ts 9, pr-facts RERUN 2, one pr-reply `--all` case.
B7 (4) `viber/skills/fixer/scripts/tree-record.sh:102`: `--check` with an absolute (`/c/`, `C:/`) or cwd-relative path of the reproduction test reports the test itself as a stray change (`STOP: changed since the record`); only repo-relative and `./` forms pass.
B8 (4) `viber/skills/e2e/scripts/app-wait.sh:92`: only sleeps count toward `<seconds>`; with probes hanging their `--max-time 5`, 10 s took 41 s wall; the `wait` reruns (240 s and up) pass the skill's 600000 ms Bash timeout before the ASK line.
B9 (4) `viber/hooks/scripts/verdict-nudge.sh:86` vs `:126`: the line test accepts `**VERDICT:** PASS` and `VERDICT:PASS`, the value test needs `VERDICT: ` plus a capital, so a valid verdict is sent back (both passed at e2c5d216).
B10 (4) `viber/hooks/scripts/shell-guard.sh:577-598` (chain_suffix): "Run instead" splits `a || b` into "a then b" (b always runs) and `cd x && y`, `export A=1 && y` into separate calls that lose cwd/env between subagent Bash calls. Header, `hooks/CLAUDE.md` and tests :70-72 currently pin the split.
B11 (3) `viber/skills/code-auditor/scripts/strip-tag.sh:44`: `sed '$d'` on Git Bash strips every CR, against the header's "every byte before it unchanged" (lines 19-22); strip-tag.test.ts CR case fails.
B12 (3) `synthesize.sh:440,623` vs `keep-units.sh:348-351`: the variant wave is offered for a unit whose hunt left no report (`no-report:`), but `keep-units.sh --wave` hunts only units no `hunt:` line names and prints `NEXT: none`.
B13 (3) `viber/scripts/attach-lines.sh:47-51`: under dash on Windows `pwd -W` fails, the `pwd -P` fallback gives `/c/...`, never matching git's `C:/...` root: every `Attachment:` line dropped, exit 0 (attach-lines.test.ts 4/7 fail when dash is the first sh).
B14 (3) `viber/skills/planner/SKILL.md:88,112` vs `:102`: prose says `start --fresh` after any plan write following `NEXT: exit-plan`, including the fix after `override`; script (review-round.sh:308-310,526), its override test and spec 2026-11-19-08-51-17 spec.md:71 expect plain `start` (round 2, `add: previous`); spec.md:73 contradicts :71.
B15 (3) `viber/skills/rules/scripts/rules-map.sh:848` vs `:710-712`: `--brief` prints `scope: ./src` as given, the auditor's slug rule (`agents/rules-auditor.md:66`) gives `new--.--src`, `--confirm` reads `new--src`: MISS findings count 0, run stops on "the layer already holds".
B16 (3) `viber/scripts/task-step.sh:619-642` (quoted_list, union): `--with "a, b"` keeps the leading space (`" src/extra2.ts"`); commit-task.sh named_path (:363-366) trims nothing, unlike extras_paths (:864-875): the path is left out of the task commit, exit 0, when the agent also skipped its extras file.

## Design

D1 (5) plugin-root spelling of printed commands derived 5 ways in 10 scripts: cut before `/scripts/` (pr-facts.sh:128, pr-reply.sh:310, task-step.sh:196, plan-index.sh:1941/2099/2269), dirname x4 (commit-context.sh:56), `cd`+`pwd -W` (bootstrap.sh:420, qa-ledger.sh:240), `pwd`+`cygpath -m` (run-branch.sh:823), `cd`+`pwd` (review-round.sh:113, frame.sh:42, keep-units.sh, hunt-return.sh). Root cause of B6.
D2 (2) node heading list duplicated: `memory-map.sh:971,973` and header :170-172 vs `viber/references/node-doctrine.md:31-37`, no Change together entry; `viber/references/CLAUDE.md:17` still says memory-auditor reads the template for SHAPE findings.
D3 (2) `header_value` byte-identical in map-signals.sh:67-73, keep-units.sh:114-120, hunt-return.sh:116-122, a fourth parse in synthesize.sh:284-291.
D4 (2) `task-step.sh:809-815,1051-1053` case_first hard-codes each close case's fallback and ignores `--options` under `--refused`; the fragments' `options:` lines hold the same fact.
D5 (2) `viber/scripts/CLAUDE.md:7` says `NEXT:`/`RUN:`/`ASK:`/`STOP:` lines belong to the bash scripts; `#!/bin/sh` `arg-kind.sh` prints them.

## Decisions taken in the interview

- All 21 items above are in scope (B1-B16, D1-D5).
- D1/B6: one shared POSIX sh helper, sourced with `.`, cutting the invoked path before `/scripts/` and returning the `C:/...` form, used by every script that prints a command, with one test pinning the spelling; the code-auditor (git + POSIX sh only) may carry its own copy or a relative source path, the planner decides.
- CI: add `windows-latest` on every push for the unit tier only; integration on Windows stays on manual dispatch.
- B10: print no "Run instead" suffix when the chain holds `||` or any part but the last opens with `cd`, `pushd`, `export`, `source`, `.` or a bare `NAME=value`; the refusal itself stays.
- B14: plain `start` (round 2, `add: previous`) after an override's fix; fix the planner prose and the contradicting spec sentence.
- B9: one shared pattern for both the line test and the value test, liberal: `VERDICT: X`, `VERDICT:X`, `**VERDICT:** X`, `` `VERDICT: X` `` all accepted.
- B7: the script normalizes the path (absolute `/c/`, `C:/`, `C:\`, and cwd-relative) to repo-relative; no prose change needed.
