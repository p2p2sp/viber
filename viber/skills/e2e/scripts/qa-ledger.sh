#!/bin/sh
#
# qa-ledger.sh - lists the scenarios of one run's qa.e2e.md handoff file with their
# automation state, prints the e2e-writer dispatch block of the next one to handle and draws
# the ASCII table of every scenario: the wrapper that runs qa-ledger.ts beside it.
#
# It exists because the ID list, the not automatable exclusion, the state read off the
# "## Automation" section, the six labelled lines of every dispatch and the final report
# lines were prose the model had to apply by hand. Those rules live in qa-ledger.ts and
# viber/lib/qa-ledger.ts, never here, so the e2e skill keeps this call line while the ledger
# is tested in process.
#
# Contract:
#   argv   : <handoff> list
#            <handoff> report
#            <handoff> next --spec-dir <dir> --base-url <url> --accounts <value> [--after QA-<nn>]
#            Handed to qa-ledger.ts as given; the handoff grammar, the options and every
#            stdout line are defined in the header of qa-ledger.ts. Under Git Bash the MSYS
#            runtime hands node a `/c/...` argument as `C:/...`.
#   cwd    : any directory: every path derives from argv (a relative <handoff> resolves
#            against it).
#   env    : PATH must resolve `node` (22.18 or newer, which runs a .ts file).
#   file   : qa-ledger.ts beside it, found from the invoked path with either separator (a
#            C:\ spelling included), and viber/lib/ three directories up; <handoff> is read
#            by qa-ledger.ts alone, never written.
#   stdout : what qa-ledger.ts prints: the id: and counts: lines of list, the table of
#            report, the NEXT: dispatch block or NEXT: commit of next.
#   stderr : one "error: ..." line on exit 2.
#   exit   : that of qa-ledger.ts: 0 on an answer; 2 with an empty stdout on a refusal. 127
#            with no `node` on PATH.
#
set -u

exec node "${0%[/\\]*}/qa-ledger.ts" "$@"
