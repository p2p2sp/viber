/*
 * viber - skills/code-auditor/scripts/hunt-return.ts
 * Answers the return of a hunter or a critic of an audit run: one critic block per
 * claim the hunt filed, the one retry of a hunter that filed no report or of a critic
 * that left no verdict, or `NEXT: none`. The entry holds no logic:
 * viber/lib/hunt-return.ts does all of it.
 *
 * Why it exists: on each hunter return the skill listed the reports of that hunt only
 * (a hyphen and one digit right after the full id, so `A-x` never counted an `A-x-y`
 * file), stripped a leaked closing tag, built one critic brief per claim sidecar, with
 * its worktree, overlay, test rules and variant lines per lens, scope and wave, and
 * rebuilt the hunter brief by hand for the retry; on each critic return it stripped the
 * verdict file, looked for the `VERDICT:` line and rebuilt the critic brief for the
 * retry. That is mechanical work a model repeats differently every run and pays tokens
 * for. One script answers each return with the next directive, so the skill only
 * dispatches what is printed. The skill runs it through the wrapper hunt-return.sh,
 * which keeps its call line.
 *
 * What it does for `critic <hunt id>-<k>`:
 *   1. <ws>/verdicts/<hunt id>-<k>.md loses a trailing closing tag (the strip-tag core).
 *   2. A `VERDICT:` line holding one of the four verdicts (VERIFIED, REFUTED,
 *      PARTIALLY VERIFIED, INCONCLUSIVE) answers `NEXT: none`.
 *   3. A missing file, or one with no such line, the first time: the critic block of
 *      the claim once more with `retry` and its worktree suffixed `-retry`, recorded as
 *      the ledger line `critic-retried: <hunt id>-<k>`; once that line stands, the
 *      miss answers `NEXT: none` and records nothing.
 *
 * What it does for `hunter <hunt id>`:
 *   1. Every <ws>/reports/<hunt id>-<digit>.md and <hunt id>-<digit>.claim.md loses a
 *      trailing closing tag (the strip-tag core). A file of a longer id (`A-x-y-1.md` for
 *      `A-x`) is neither stripped nor counted.
 *   2. With at least one claim sidecar, one critic block per sidecar, k ascending, the
 *      critic id `<hunt id>-<k>`.
 *   3. With no sidecar and a report (`<hunt id>-0.md` or a report without sidecar),
 *      `NEXT: none`.
 *   4. With no report at all: the first time, the hunter block keep-units.sh printed
 *      for the hunt, once more with `retry` and its worktree suffixed `-retry`, recorded
 *      as the ledger line `retried: <hunt id>`; once that line stands, the miss is
 *      recorded as `no-report: <hunt id>` (once) and answered with `NEXT: none`.
 *
 * The retry brief is rebuilt from the ledger `hunt:` line of the hunt: its unit line
 * comes from `## Units` of map.md, its angle from the ledger line, and a wave 2 hunt
 * carries its seeds from seeds.md (every `Seed:` line on a unit hunt, the n-th on the
 * diff hunt `V-<n>`). A critic block of a wave 2 hunt ends on `Variant: yes`. The unit
 * re-hunt `R-U<n>` keep-units.sh --wave prints for a unit whose wave 1 hunt left
 * `no-report: U<n>` is a wave 2 unit hunt of its own: its reports are `R-U<n>-<k>`, its
 * `retried:` and `no-report:` lines name `R-U<n>`, never the unit's own hunt.
 *
 * Contract:
 *   argv   : <ws> hunter <hunt id>, or <ws> critic <hunt id>-<k> (k one digit). A
 *            missing <ws>, a mode other than `hunter` or `critic`, an id that is empty
 *            or holds a character outside [A-Za-z0-9._-], a critic id not ending in a
 *            hyphen and one digit after a non-empty hunt id, a hunt with no `hunt:`
 *            line in the ledger, or a unit hunt whose unit line is not in map.md is a
 *            usage error (exit 2).
 *   cwd    : irrelevant: every path derives from argv and the files it names, cwd
 *            only resolves a relative <ws>.
 *   env    : none.
 *   paths  : the Schema:, Test rules:, Worktree script: and Overlay script: paths are
 *            cut as text from the path the entry was started by, with forward
 *            slashes: `C:/...` on Windows whichever spelling invoked the wrapper.
 *   files  : reads <ws>/run.md (the header lines before its first `## ` heading:
 *            Lens:, Lens file:, Scope:), <ws>/ledger.md, <ws>/map.md, <ws>/seeds.md,
 *            the lens file, <ws>/reports/ and, for a critic, its verdict file
 *            <ws>/verdicts/<hunt id>-<k>.md. Writes: the hunt's report and sidecar files
 *            or the verdict file (a trailing closing tag stripped) and <ws>/ledger.md
 *            (a line appended, never rewritten).
 *   stdout : exactly one answer, in the auditor directive format:
 *              per claim NEXT: critic | id: <hunt id>-<k> | background, then the lines
 *                Claim:, Run file:, Lens file:, Out:, and for a lens reading
 *                Worktree: required Worktree script:, Worktree: and, on the diff
 *                scope, Overlay script:, then on the tests lens Test rules:, then for a
 *                wave 2 hunt Variant: yes
 *              NEXT: critic | id: <hunt id>-<k> | background | retry, then the critic
 *                lines above with the Worktree: line suffixed -retry
 *              NEXT: hunter | id: <hunt id> | background | retry, then the lines of the
 *                hunter block of keep-units.sh
 *              NEXT: none
 *            Nothing on stdout on a usage error.
 *   exit   : 0 in every case but the usage error: 2 with one `error:` line on stderr.
 */

import { nodeFs } from "../../../lib/adapters/fs.ts";
import { runHuntReturn } from "../../../lib/hunt-return.ts";

const result = runHuntReturn(process.argv.slice(2), process.argv[1], { fs: nodeFs });
process.stdout.write(result.stdout);
process.stderr.write(result.stderr);
process.exitCode = result.exit;
