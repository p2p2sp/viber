/*
 * e2e.ts - the deterministic steps of the e2e skill around its e2e-writer
 * agents: which handoff, which scenario next, what the agent is briefed with,
 * whether the application answers, whether a spec ran green, and the
 * `## Automation` lines. The entry holds no logic: lib/e2e-run.ts routes the
 * call.
 *
 * It exists because a model must not pick the scenario, name the spec file,
 * choose the Playwright flags, judge a run green or write the ledger: each was
 * a place where a missed ID, a default timeout or a claimed pass went wrong.
 *
 * The handoff is a qa.e2e.md in the format of references/qa-format.md. A
 * scenario is a `### QA-<nn> <title>` entry under `## UI scenarios` or
 * `## API scenarios` that no `- QA-<nn>` line of `## Not automatable` names;
 * its state is the last `- QA-<nn>: file ...` or `- QA-<nn>: blocked ...` line
 * of `## Automation`, pending without one. <root> is the repository root, the
 * cwd outside a repository; <work> is <root>/.temp/viber/<id>/e2e/. A
 * printed path is absolute with forward slashes. No call stages or commits.
 *
 * Contract:
 *   find [<arguments>]
 *              The preload, read-only. <arguments> is the skill's argument
 *              string: a run directory, a qa.e2e.md, or nothing, which takes
 *              the qa.e2e.md of the run directory with the last name among
 *              docs/<runs>/ and docs/<specifications>/ (`directories` of
 *              .claude/viber.yml). Prints
 *                HANDOFF=<path> | none          none ends the output
 *                PENDING=<n>                    the scenarios not `file`
 *                SPEC_DIR=<repo-relative> | unknown
 *                                               the literal `testDir` of the
 *                                               one tracked playwright.config.*
 *                                               that carries one
 *                BASE=, LAUNCH=, ACCOUNTS=      the header lines of the
 *                                               handoff, `unknown` without one
 *                MISSING=playwright-cli: <install command>
 *                                               no playwright-cli on PATH
 *                MISSING=@playwright/test: <install command>
 *                                               neither <root>/package.json
 *                                               nor a tracked package.json
 *                                               names it
 *              Exit 0 always: any failure prints `HANDOFF=none`.
 *   start <id> <handoff> <test directory> <base url> <accounts>
 *              <id>: the run id, letters, digits, `.`, `_`, `-`. <test
 *              directory> is read against <root> and lies inside it.
 *              Everything is validated before any file changes. Clears <work>,
 *              writes <work>/state.json, probes <base url> once (any HTTP
 *              answer counts, as does a certificate the probe does not trust).
 *              No answer: prints `DOWN: <work>/launch.log`, the file the
 *              launch writes its output to. An answer: goes on as `next` does.
 *   wait <id> <seconds>
 *              <seconds>: 1 to 540. Probes every 2 s until an answer or the
 *              time is up. An answer: goes on as `next` does. None: prints
 *              `SILENT: <2 x seconds, at most 540>`, then `log: <line>` for
 *              the last 10 lines of launch.log.
 *   next <id> <QA> <WORD>
 *              The return of the agent of <QA>, the scenario in flight:
 *                PASS     stands only when the last `run` of its spec was
 *                         green and the spec has not changed since: writes
 *                         `- <QA>: file <repo-relative spec path>` under
 *                         `## Automation`. Otherwise it counts as any other
 *                         word, with that as the reason.
 *                BLOCKED  deletes the spec file and writes
 *                         `- <QA>: blocked - <first line of the reason file>`.
 *                any other word
 *                         the first time: prints the same DISPATCH line
 *                         again, the spec and the reason file kept. The second
 *                         time: deletes the spec file; the scenario stays
 *                         pending and the report names the reason.
 *              An ID has one `## Automation` line: the section is created at
 *              the end of the handoff, an earlier line of the ID leaves. Then
 *              the first scenario in file order that is not `file` and that
 *              this pass has not handled:
 *                DISPATCH: <QA> | brief: <work>/<QA>.md
 *              or, with none left:
 *                END
 *                <QA> | file | <spec path>
 *                <QA> | blocked | <reason>
 *                <QA> | pending | failed: <reason>     `-` when this pass did
 *                                                      not fail it
 *                counts: <f> file, <b> blocked, <p> pending
 *              one line per scenario, in file order.
 *              The brief holds one `<label>: <value>` a line, then an empty
 *              line and the scenario entry as the handoff has it:
 *                id: <QA>
 *                kind: ui | api
 *                file: <spec path>   <test directory>/<qa>-<slug>.spec.ts: the
 *                                    ID and the title lowercased, diacritics
 *                                    folded, every other run of characters one
 *                                    hyphen, the slug at most 60 characters
 *                title: <QA> <title> (covers: <the entry's Covers value>)
 *                base-url: <base url>
 *                accounts: <accounts>
 *                reason: <work>/<QA>.reason
 *                temp: <work>
 *                run: "<e2e.sh>" run "<brief>"
 *   run <brief>
 *              The agent's test run. Runs `npx playwright test <file>
 *              --reporter=line --output=<work>/test-results` from the nearest
 *              directory at or above the spec holding a playwright.config.*,
 *              else a package.json, else from <root>, for at most 540 s, its
 *              output in <work>/<QA>.log. Prints `GREEN` when it exits 0 with
 *              a passed test, else `RED`, the last 40 lines of the log and
 *              `log: <path>`. Writes <work>/<QA>.result, which `next` reads.
 *   cwd    : any directory inside the host project.
 *   exit   : 0 on every answer above; 2 with one `error: e2e.sh: ...` line on
 *            stderr on a bad argument, a <QA> that is not in flight, a call
 *            with no `start` for <id>, or a failed file operation.
 */

import { run } from "./lib/e2e-run.ts";

process.exitCode = await run(process.argv.slice(2), process.cwd(), process.argv[1].replaceAll("\\", "/").replace(/\.ts$/, ".sh"));
