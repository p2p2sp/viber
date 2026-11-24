/*
 * synthesize.ts - writes the run's findings.md from its ledger, the head lines of its reports and
 * the verdict files of its critics, and prints the summary line and the fill block. The entry
 * holds no logic: viber/lib/synthesize.ts reads the run, folds, ranks, merges and writes.
 *
 * Why it exists: folding a verdict into a finding, ranking the pool by severity, verdict,
 * confidence and hunt order, applying the cap of ten and the 4.0 floor of a full entry, and
 * counting units, hunts and coverage were rules the model applied by hand on every run, each one a
 * chance to change an entry or a count. One script applies them the same way every time; the model
 * keeps only the prose of each entry, which it fills in afterwards. The skill runs it through the
 * wrapper synthesize.sh, which keeps its call line.
 *
 * Folding, per finding (a report <hunt id>-<k>.md with k 1 to 9):
 *   REFUTED               dropped, as if it never existed.
 *   VERIFIED, PARTIALLY   confidence as filed; the critic SEVERITY becomes the severity of the
 *   VERIFIED              entry, noted beside the filed one.
 *   INCONCLUSIVE, no      filed severity; confidence one step lower (high to medium, medium to
 *   verdict line, no      low, low stays); the verdict reads INCONCLUSIVE and the STATUS line names
 *   verdict file          the missing oracle (a fill-in marker) or says the critic returned no
 *                         verdict.
 * Order: higher severity, then VERIFIED before PARTIALLY VERIFIED before INCONCLUSIVE, then higher
 * confidence, then hunt order (U<n> by n, each R-U<n> right after the U<n> findings of the same
 * unit, A-<slug> in the lens angle order, V-<n> by n, then k). The first ten findings of severity
 * 4.0 or more get a full entry; every other one goes to the further findings.
 *
 * Merging: two surviving findings of one file whose LOCATION ranges overlap or have at most 5
 * lines between them (any CLASS) are a merge pair for the model to judge. Every pair not decided
 * by the ledger is printed before anything is written. A --merge group becomes one finding: the
 * title, CLASS and name of its first member in hunt order, every member LOCATION joined on one
 * line, the highest severity, the strongest verdict and the highest confidence, one slot against
 * the cap.
 *
 * Contract:
 *   argv   : <ws> - the run workspace, <root>/.temp/viber/code-auditor/<run-id>, written with / or
 *            \ separators, a trailing separator ignored; the run id is its last component - then
 *            any number of --merge <id>,<id>[,<id>]... (a group of two or more distinct finding
 *            ids, each <hunt id>-<k>), or one --merge none, never both. Nothing else is accepted.
 *   cwd    : irrelevant: every path derives from <ws>, so cwd only resolves a relative one.
 *   env    : none.
 *   files  : reads <ws>/run.md (Lens:, Lens file:, Scope: and the units of its ## Units section),
 *            <ws>/ledger.md (the hunt:, merge: and apart: lines and the wave-offered line), the
 *            first five lines of each <ws>/reports/<hunt id>-<k>.md, each
 *            <ws>/verdicts/<hunt id>-<k>.md and the ## Hunts angle headings of the lens file. Every
 *            file is read as UTF-8, a line end of \r\n read as \n. A report of another hunt never
 *            counts: hunt A-x owns A-x-<digit>.md only, never A-x-y-1.md; an empty report file
 *            counts as none. Writes <ws>/findings.md whole; an entry whose
 *            <!-- finding: <id> --> marker already holds paragraphs there keeps them and its
 *            STATUS: line, whatever its new number. A call with --merge also appends to
 *            <ws>/ledger.md one merge: line per group, then one apart: line per pair it printed
 *            that no group joins (--merge none: every printed pair). When it offers the variant
 *            wave it writes <ws>/seeds.md (one Seed: line per distinct CLASS of a confirmed
 *            finding, in rank order) and appends wave-offered to the ledger. Nothing else is
 *            written, and nothing at all while a pair is undecided and no --merge came.
 *   stdout : with an undecided pair and no --merge, only:
 *              NEXT: merge
 *              merge?: <id> <id>
 *              finding: <id> | <LOCATION> | <CLASS> | <OBSERVED or none>
 *              finding: <id> | <LOCATION> | <CLASS> | <OBSERVED or none>
 *            one merge?: line and its two finding: lines per pair. Otherwise report lines, then
 *            one directive block:
 *              summary: units <U> | hunts <H> | confirmed <K> | not investigated <J>
 *              last-line: /viber:intent <ws>/findings.md
 *              NEXT: fill | findings: <ws>/findings.md
 *              entry: <n> | reports: <path>[, <path>] | verdict: <VERDICT> | observed: <OBSERVED or none>
 *              ASK: run the variant wave -> wave | end the run -> end
 *            last-line: only with K of 1 or more. One entry: line per full entry not filled yet,
 *            <n> its heading number, the reports of every member of a merged entry listed. With
 *            none the block is the single line NEXT: none. ASK: only with K of 1 or more, no
 *            wave-offered line in the ledger, and the diff scope or J of 1 or more; it follows the
 *            fill block. U counts the map units, H the distinct hunts of the ledger, K the
 *            findings left after folding whose verdict is VERIFIED or PARTIALLY VERIFIED, J the
 *            mapped units no hunt left a report for (0 on the diff scope, where the angle hunts
 *            take on every unit).
 *   exit   : 0 on success. 2 with one error: line on stderr and nothing on stdout when <ws> is
 *            missing or names no run.md or ledger.md, on any argument other than <ws> and
 *            --merge, on --merge none beside a group, on a group of fewer than two distinct ids,
 *            or on a --merge id naming no surviving finding, nothing written then; and when
 *            findings.md, the ledger or seeds.md cannot be written.
 */

import { nodeFs } from "../../../lib/adapters/fs.ts";
import { runSynthesize } from "../../../lib/synthesize.ts";

const result = runSynthesize(process.argv.slice(2), { fs: nodeFs });
process.stdout.write(result.stdout);
process.stderr.write(result.stderr);
process.exitCode = result.exit;
