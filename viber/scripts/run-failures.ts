/*
 * run-failures.ts - writes a run's failure trail, `failures.md`, from the reports
 * its agents left in `work/`, and prints how many failures each cause holds. The
 * entry holds no logic: viber/lib/run-failures.ts reads the reports, keeps the
 * entries and writes the file.
 *
 * A build deletes its `work/` directory when the run is archived, and with it the
 * only record of what an agent actually got wrong: the Blocking findings of the
 * two reviewers and the failing lines of the final test runs. This script copies
 * that record into one file that survives the archive, so a later run of
 * `/viber:rules` can tell a gap that repeats from a one-off. It is a script and not
 * a step of an agent because the operation is fixed - read a few files, keep the
 * lines of one shape, order them, write one file - and a model asked to do it
 * drifts: it summarises, merges, drops. Here nothing is judged: a line either has
 * the shape or it does not. Callers run it through the wrapper run-failures.sh,
 * which keeps its call line.
 *
 * Entries, one per line of `failures.md`, `- <cause> | <source> | <text>`:
 *   - a Blocking item of a review report (`- Blocking [<cause>] <path>:<line> -
 *     <what is wrong>`, the first line of the item only) opens with `- Blocking` or
 *     `- **Blocking**`, followed by the end of the line or a blank. It carries the
 *     bracket's cause, trimmed and lower-cased (blanks inside the bracket allowed),
 *     when it is one of convention, place, plan or task, else `unknown`; its text is
 *     everything after the bracket (after the word Blocking when there is no
 *     bracket), leading blanks dropped. A Blocking line with no text yields no
 *     entry. A Minor item and every indented continuation line yield nothing.
 *   - a finding repeated across the review rounds of one task is kept once: of the
 *     entries of `review-<id>-<round>` reports with the same <id> (the same task), the same cause
 *     and the same text, only the one of the lowest round stays (rounds compared as
 *     numbers, so round 2 is lower than round 10). The entries of one report, of
 *     `final-review-*` reports, of the same finding in two different tasks and
 *     every test entry are never merged.
 *   - every line of a final test run report carries the cause `test`, the line as
 *     written less a leading `- ` or `* ` marker; the report's `status:` line and
 *     its blank lines are no failure.
 * `<source>` is the report's file name without `.md`. Entries are ordered by source
 * in the order of its UTF-8 bytes, then by the order inside the report.
 *
 * `failures.md` exists only while it holds an entry: a call with none removes one
 * already there, a call with some replaces the file whole, so a second call over
 * the same reports never doubles a failure.
 *
 * `--lessons <run-dir>` is the second mode: it writes nothing and prints which rules
 * of `test-strategy.md` the failed task reviews of the run named, so a coder
 * dispatched later carries them as its `run-lessons:` line. It reads the Blocking
 * items of `review-*.md` reports only (`final-review-*` and `tests-*` reports are
 * not read), first line of the item, and takes every spelling
 * test-strategy `<Name>` on it as one mention of the rule <Name> (a rule named twice
 * on one line counts once). An item repeated across rounds is kept once, as above.
 *
 * Contract:
 *   argv   : $1 run directory (REQUIRED, exactly one): relative to the repository
 *            root or absolute; a backslash is read as `/` and trailing slashes are
 *            dropped. Or `--lessons <run-dir>`, exactly those two words, the
 *            second mode: the run directory then needs no status.md.
 *   cwd    : any directory inside the host repository - the repository root is
 *            resolved from it, because a relative argument is relative to the
 *            root. Outside a repository the cwd is the base a relative argument
 *            resolves against. No git command writes.
 *   env    : none.
 *   reads  : <run>/status.md (must exist, else the argument is no run directory),
 *            <run>/work/review-*.md, <run>/work/final-review-*.md and
 *            <run>/work/tests-<digits>.md, each as UTF-8. Any other file of work/
 *            is ignored, tests-baseline.md included. A missing work/ means no
 *            report. docs/<specifications>/<run>/failures.md of every archived run,
 *            the archived trails, for the runs count; <specifications> is the line
 *            `config.sh --specifications` prints, resolved in process by the config
 *            core (`specs` without the key).
 *   writes : <run>/failures.md alone, or removes it when no entry is left. Under
 *            `--lessons`: nothing.
 *   stdout : under `--lessons`, on exit 0 exactly one line, nothing else:
 *              lessons: <Name> x<n>[, <Name> x<n>...]
 *            sorted by count descending, then by name in byte order, or
 *              lessons: none
 *            when no review report exists or none names a rule.
 *            Otherwise on exit 0 exactly one line, nothing else:
 *              failures: <total> convention <n> place <n> plan <n> task <n> test <n> unknown <n> runs <n>
 *            each cause count is the number of entries of that cause in the file.
 *            runs is the number of archived failures.md files holding at least one
 *            line starting `- convention | `, plus 1 when this run's convention
 *            count is above 0: the runs a convention gap stood in.
 *   exit   : 0 the trail was written, or <total> is 0 and no failures.md is left;
 *              under `--lessons` the line was printed.
 *            2 unusable argv: no argument, more than two, `--lessons` with no run
 *              directory, a directory that does not exist or (outside `--lessons`)
 *              one holding no status.md; one `error: ...` line on stderr, nothing
 *              on stdout, nothing written.
 *            3 failures.md could not be written or removed; one `error: ...`
 *              line on stderr, nothing on stdout.
 */

import { nodeFs } from "../lib/adapters/fs.ts";
import { gitCommand } from "../lib/adapters/git.ts";
import { runRunFailures } from "../lib/run-failures.ts";

const result = runRunFailures(process.argv.slice(2), process.cwd(), { fs: nodeFs, git: gitCommand });
process.stdout.write(result.stdout);
process.stderr.write(result.stderr);
process.exitCode = result.exit;
