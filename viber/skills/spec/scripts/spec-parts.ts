/*
 * spec-parts.ts - cuts the intent file of a change split into parts into one
 * intent file per part, each with its own spec directory. The entry holds the
 * file I/O; lib/spec-parts.ts cuts and names.
 *
 * It exists because a part is carried only by its directory name
 * (`<stamp>_<slug>-p<n>-of-<N>`): no later skill or agent reasons about the
 * split, so the cut and the names are a fixed format, not a judgement.
 *
 * Contract:
 *   argv   : <spec> <intent> [<mockup>] - the `spec:` and `intent:` paths one
 *            `spec-paths.sh <slug>` call printed (no mockup passed to it), and
 *            the mockup the skill would have passed it. Every `\` made `/`.
 *   reads  : <intent>: non-blank lines under the headings `## All` (at most
 *            one, optional: the facts shared by every part) and
 *            `## P<n> - <title>` (one per part). A `# <title>` on the first
 *            non-blank line is left out. Any other `## ` heading or a
 *            non-blank line under no heading is an error.
 *   checks : at least 2 parts, numbered 1..N in file order with no gap, each
 *            holding at least one line; with <mockup>, at least one part's cut
 *            intent text holding `prototype.html`.
 *   writes : per part n of N, with <name> the directory name of <spec> and
 *            <intent> and <part> = <name>-p<n>-of-<N>:
 *              <intent dir>/../<part>/intent.md - the `## All` lines, then the
 *                lines under `## P<n>`, in file order, `I` numbers as written,
 *                no heading.
 *              <spec dir>/../<part>/prototype.html - a copy of <mockup>, only
 *                when given and the part's cut intent text holds
 *                `prototype.html`.
 *   stdout : per part, in order:
 *              spec: <spec dir>/../<part>/spec.md
 *              intent: <intent dir>/../<part>/intent.md
 *              review: <intent dir>/../<part>/spec-review.md
 *              prototype: <spec dir>/../<part>/prototype.html  (copied only)
 *            On a failed check: one `ERROR: <what>` line per problem, nothing
 *            written.
 *   stderr : the usage or I/O problem when the exit is 2 or 1.
 *   exit   : 0 cut, 1 a failed check or a failed write, 2 bad usage, an
 *            unreadable <intent> or <mockup>.
 */

import fs from "node:fs";
import { dirname } from "node:path";
import { cutIntent, partPaths } from "./lib/spec-parts.ts";

const args = process.argv.slice(2).map((arg) => arg.replaceAll("\\", "/"));
const usage = (why: string): void => {
  process.stderr.write(`spec-parts.sh: ${why}\nusage: spec-parts.sh <spec> <intent> [<mockup>]\n`);
  process.exitCode = 2;
};

function main(): void {
  if (args.length < 2 || args.length > 3) return usage("wrong number of arguments");
  const [spec, intent, mockup] = args;
  if (partPaths(spec, intent, 1, 2) === null) return usage("<spec> and <intent> must end in <name>/spec.md and <name>/intent.md");
  let text: string;
  try {
    text = fs.readFileSync(intent, "utf-8");
  } catch {
    return usage(`cannot read the intent file ${intent}`);
  }
  if (mockup !== undefined && !(fs.existsSync(mockup) && fs.statSync(mockup).isFile())) return usage(`cannot read the mockup ${mockup}`);

  const cut = cutIntent(text);
  if (!cut.ok) {
    for (const error of cut.errors) console.log(`ERROR: ${error}`);
    process.exitCode = 1;
    return;
  }
  // A mockup no part names would reach no spec: the build would run without the approved prototype.
  if (mockup !== undefined && !cut.parts.some((part) => part.text.includes("prototype.html"))) {
    console.log("ERROR: the mockup is named by no part");
    process.exitCode = 1;
    return;
  }
  const out: string[] = [];
  for (const part of cut.parts) {
    const paths = partPaths(spec, intent, part.n, cut.parts.length)!;
    const copy = mockup !== undefined && part.text.includes("prototype.html");
    try {
      fs.mkdirSync(dirname(paths.intent), { recursive: true });
      fs.writeFileSync(paths.intent, part.text);
      if (copy) {
        fs.mkdirSync(dirname(paths.prototype), { recursive: true });
        fs.copyFileSync(mockup, paths.prototype);
      }
    } catch {
      process.stderr.write(`spec-parts.sh: cannot write the files of P${part.n}\n`);
      process.exitCode = 1;
      return;
    }
    out.push(`spec: ${paths.spec}`, `intent: ${paths.intent}`, `review: ${paths.review}`);
    if (copy) out.push(`prototype: ${paths.prototype}`);
  }
  console.log(out.join("\n"));
}

main();
