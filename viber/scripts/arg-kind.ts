/*
 * arg-kind.ts - classifies the first word of a skill's argument as a GitHub
 * issue reference or a pull request reference, by exactly the shapes
 * `issue-facts.sh` (issue) and `pr-threads.sh` (pr) accept. The entry holds no
 * logic: lib/arg-kind.ts classifies, runArgKind returns the answer.
 *
 * It exists because `intent`, `fixer` and `pr-feedback` decided from prose
 * whether their argument was an issue or pull request reference, and a wrong
 * call sent pasted text to `gh` or dropped a real reference into the free text.
 * This script applies the shape check, so the model only runs it and acts on
 * the directive it prints. It never calls gh and never reads the repository.
 * Callers run it through the wrapper arg-kind.sh, which keeps its call line.
 *
 * Contract:
 *   argv   : `issue <first word> [--more]` or `pr <first word>`. The word is
 *            passed as given, an empty word included. `--more` (issue only)
 *            says the argument holds more words after the first. Nothing else
 *            is accepted.
 *   cwd    : irrelevant: the script touches no file and runs no other command.
 *   env    : none.
 *   stdout : exit 0, one line:
 *              NEXT: issue | ref: <first word as given>   (issue) the word is <N>,
 *                  #<N> or https://<host>/<owner>/<repo>/issues/<N>, optionally
 *                  followed by a #... or ?... suffix, and `--more` was not given
 *              NEXT: text                                 (issue) anything else, an
 *                  empty word and any word given with `--more` included
 *              NEXT: pr | ref: <first word as given>      (pr) the word is <N>, #<N>
 *                  or https://<host>/<owner>/<repo>/pull/<N>, optionally followed
 *                  by a #... or ?... suffix
 *              STOP: usage                                (pr) anything else, an
 *                  empty word included
 *            The accepted shapes are those of issue-facts.sh and pr-threads.sh,
 *            including a URL behind one leading #.
 *   exit   : 0 with the line above; 2 with one `error: arg-kind.sh: ...` line on
 *            stderr and an empty stdout for an unknown kind, no word, `--more`
 *            under pr, or any further argument.
 */

import { runArgKind } from "./lib/arg-kind.ts";

const result = runArgKind(process.argv.slice(2));
process.stdout.write(result.stdout);
process.stderr.write(result.stderr);
process.exitCode = result.exit;
