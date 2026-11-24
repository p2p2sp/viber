/*
 * qa-ledger.ts - lists the scenarios of one run's qa.e2e.md handoff file with their
 * automation state, prints the e2e-writer dispatch block of the next one to handle and draws
 * the ASCII table of every scenario, answering in directive lines the e2e skill acts on. The
 * entry holds no logic: viber/lib/qa-ledger.ts reads the handoff, runQaLedger returns the
 * answer.
 *
 * It exists because the ID list, the not automatable exclusion, the state read off the
 * "## Automation" section, the six labelled lines of every dispatch and the final report
 * lines were prose the model had to apply by hand, and a missed ID, a skipped retry, a
 * mistyped line or a misaligned row sent the writer a wrong payload or the user a wrong
 * report. The script reads the handoff and never writes it: the e2e-writer alone writes the
 * "## Automation" lines. Callers run it through the wrapper qa-ledger.sh, which keeps its
 * call line.
 *
 * Contract:
 *   argv   : <handoff> list
 *            <handoff> report
 *            <handoff> next --spec-dir <dir> --base-url <url> --accounts <value> [--after QA-<nn>]
 *            <handoff> is the path of a qa.e2e.md; a backslash counts as a forward slash, and
 *            a `.` segment or a doubled slash is dropped and a `..` segment takes the segment
 *            before it, as text, before the path is looked up; a path ending on a slash names
 *            no file. Each option takes one non-empty value that does not start with "--"; a
 *            repeated option keeps its last value.
 *   cwd    : any directory: every path derives from argv (a relative <handoff> resolves
 *            against it).
 *   env    : none.
 *   file   : <handoff>, read only, as UTF-8. Scenarios are the "### QA-<nn> <title>" headings
 *            under "## UI scenarios" and "## API scenarios", in file order; an ID named by a
 *            "- QA-<nn>" line under "## Not automatable" is no scenario here; the state is
 *            the last "- QA-<nn>: file ..." or "- QA-<nn>: blocked ..." line of
 *            "## Automation", pending without one. A line is read without its carriage
 *            return and its trailing blanks.
 *   stdout : list ->
 *              id: QA-<nn> | file | <title>       (or blocked, or pending; one per scenario)
 *              counts: <f> file, <b> blocked, <p> pending
 *            report -> a table, one row per listed scenario in list order, then the counts line:
 *              +---------+---------+---------------------------+
 *              | ID      | State   | Detail                    |
 *              +---------+---------+---------------------------+
 *              | QA-<nn> | file    | <path of the spec file>   |
 *              | QA-<nn> | blocked | <reason>                  |
 *              | QA-<nn> | pending | -                         |
 *              +---------+---------+---------------------------+
 *              counts: <f> file, <b> blocked, <p> pending
 *              each column is as wide as its widest cell plus one space each side, cells are
 *              left-aligned, and a blocked reason past 60 characters is cut to 57 and ends in
 *              ...; a character is one code point.
 *            next -> the first scenario, after the --after one when given, whose state is
 *            blocked or pending:
 *              NEXT: dispatch | id: QA-<nn> | agent: viber:e2e-writer
 *              handoff: <absolute handoff path, forward slashes>
 *              id: QA-<nn>
 *              spec-dir: <as given>
 *              base-url: <as given>
 *              accounts: <as given>
 *              refs: <plugin root>/references
 *            <plugin root> is three directories above this script's directory, cut as text
 *            from the absolute path node started it by: forward slashes, a Windows drive as
 *            C:/ whichever spelling invoked the wrapper.
 *            and, with none left:
 *              NEXT: commit
 *            The lines below the NEXT: line are the prompt of the dispatch, sent as printed.
 *   stderr : one "error: ..." line on exit 2.
 *   exit   : 0 on every answer above; 2 with an empty stdout for a missing or unreadable
 *            handoff, an unknown mode or option (an option after list or report included), a
 *            missing --spec-dir, --base-url or --accounts, a missing option value, or an
 *            --after naming no listed scenario.
 */

import { nodeFs } from "../../../lib/adapters/fs.ts";
import { runQaLedger } from "../../../lib/qa-ledger.ts";

const result = runQaLedger(process.argv.slice(2), process.cwd(), process.argv[1], { fs: nodeFs });
process.stdout.write(result.stdout);
process.stderr.write(result.stderr);
process.exitCode = result.exit;
