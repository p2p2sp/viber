/*
 * viber - skills/code-auditor/scripts/keep-units.ts
 * Gates the mapper's map of an audit run, prints the scout batches of a scope whose
 * units exceed its budget and the hunter blocks of the kept units, recording each
 * printed hunt in the ledger. The entry holds no logic:
 * viber/lib/keep-units.ts does all of it.
 *
 * Why it exists: after the mapper returned, the skill checked the four headings of
 * map.md, retried the mapper, read the `none:` line of `## Units`, appended the map
 * to run.md and then assembled every hunter brief by hand: the angles of the lens,
 * the unit lines, the worktree and overlay lines. That is mechanical work a model
 * repeats differently every run and pays tokens for. One script answers each call
 * with the next directive, so the skill only
 * dispatches what is printed. The skill runs it through the wrapper keep-units.sh,
 * which keeps its call line.
 *
 * What it does, the first step that applies answering the call:
 *   1. Map gate. A trailing closing tag of map.md is stripped (the strip-tag core), then
 *      map.md must hold `## Conventions`, `## History`, `## Severity calibration`
 *      and `## Units` at column 0. A miss prints the mapper block once more with
 *      `retry` (ledger `mapper-retried`), the next miss the stop line
 *      `code-auditor: map unavailable after two attempts`. A `## Units` whose first
 *      line reads `none: <reason>` stops with `code-auditor: nothing to audit for
 *      <lens>: <reason>`. A passed gate appends a blank line, `## Map` and map.md
 *      verbatim to run.md and writes the ledger line `map-appended`; once that line
 *      stands the gate is not run again, so the map is appended once however often
 *      the script runs.
 *   2. Hunters, only while the ledger holds no wave 1 `hunt:` line. On the diff
 *      scope one hunter block per `### <slug>` angle of the lens's `## Hunts`, hunt
 *      id `A-<slug>`. On a directory (budget 8) or repo (budget 16) scope with no
 *      more units than the budget, one block per unit line of `## Units`, hunt id
 *      `U<n>`. Each printed hunt is appended to the ledger as
 *      `hunt: <id> | wave: 1 | unit: U<n>|none | angle: <slug>|none`. The line
 *      `hunters-at-once: 16` (4 on the tests lens) comes first. A lens reading
 *      `Worktree: required` adds the worktree script and worktree lines, and on the
 *      diff scope the overlay script line.
 *   3. Scouts and kept units, on a directory or repo scope with more units than the
 *      budget and no wave 1 `hunt:` line. With no `scouts:` ledger line, one scout
 *      block per batch of up to 8 units in map order (id S<b>, `model: sonnet` on the
 *      security lens only), recorded as the ledger line `scouts: S1,S2,...`. On the
 *      next call the units with no score line in <ws>/scores/*.md (a missing score
 *      file leaves its units unscored) go once to `S<b>-retry` batches, recorded as
 *      `scouts-retried`; when none is unscored no retry is printed. After that no call
 *      prints a scout block: the kept units, the budget's count with the highest score
 *      first, equal scores in map order, units still unscored after every scored one
 *      in map order, are printed as hunter blocks in that order. A score file loses a
 *      trailing closing tag (the strip-tag core) and every line that is not a score line
 *      (`{"unit":"U<n>","score":1-5,...}`) is skipped.
 *   4. Otherwise `NEXT: none`.
 *
 * With `--wave` (the variant wave, after synthesize.sh wrote <ws>/seeds.md) the map
 * gate and the wave 1 steps are skipped. A ledger already holding a wave 2 `hunt:`
 * line, a missing seeds.md or one with no `Seed:` line prints `NEXT: none`. Otherwise,
 * on the diff scope one hunter block per `Seed: <angle slug>: <class>` line, hunt id
 * `V-<n>` with n from 1, carrying `Angle: <that slug>` and that `Seed:` line. On a
 * directory or repo scope first one block per unit whose wave 1 hunt left a ledger
 * `no-report: U<n>` line, in map order, hunt id `R-U<n>` (the unit re-hunt), then one
 * block per unit no ledger `hunt:` line names yet, best first as in step 3 (without
 * scores, in map order), the two kinds together up to the budget, each carrying every
 * `Seed:` line. Each printed hunt is appended to the ledger as a wave 2 `hunt:` line
 * (`hunt: R-U<n> | wave: 2 | unit: U<n> | angle: none` for a re-hunt); no hunt to print
 * answers `NEXT: none`.
 *
 * Contract:
 *   argv   : <ws>, the run workspace holding run.md and map.md. Absent or empty is a
 *            usage error (exit 2). The second argument `--wave` selects the variant
 *            wave; any other further argument is ignored.
 *   cwd    : irrelevant: every path derives from argv and the files it names, cwd
 *            only resolves a relative <ws>.
 *   env    : none.
 *   paths  : the Schema:, Test rules:, Worktree script: and Overlay script: paths are
 *            cut as text from the path the entry was started by, with forward
 *            slashes: `C:/...` on Windows whichever spelling invoked the wrapper.
 *   files  : reads <ws>/run.md (the header lines before its first `## ` heading:
 *            Lens:, Lens file:, Scope:), <ws>/map.md, <ws>/scores/*.md, <ws>/ledger.md,
 *            <ws>/seeds.md (--wave) and the lens file. Writes: map.md and the score files (a trailing closing
 *            tag stripped), run.md (the map appended once) and <ws>/ledger.md (lines
 *            appended, never rewritten).
 *   stdout : exactly one answer, in the auditor directive format:
 *              NEXT: mapper | retry, then the lines Run file:, Lens file:, Signals:,
 *                Output: of the map-signals.sh block
 *              STOP: code-auditor: map unavailable after two attempts
 *              STOP: code-auditor: nothing to audit for <lens>: <reason>
 *              per batch NEXT: scout | id: S<b>[-retry][ | model: sonnet], then the
 *                lines Run file:, Lens file:, Out:, and one Unit: line per unit
 *              hunters-at-once: <n>, then per hunt NEXT: hunter | id: <id> |
 *                background and the lines Run file:, Lens file:, Schema:, Test
 *                rules:, Hunt:, Unit: or Angle:, Seed: per seed (--wave only),
 *                Reports:, and for a lens reading
 *                Worktree: required Worktree script:, Worktree:, and on the diff
 *                scope Overlay script:
 *              NEXT: none
 *   exit   : 0 in every case. 2 with one `error:` line on stderr and nothing on
 *            stdout when <ws> or <ws>/run.md is missing or the run file lacks a
 *            Lens:, Lens file: or Scope: line.
 */

import { nodeFs } from "../../../lib/adapters/fs.ts";
import { runKeepUnits } from "../../../lib/keep-units.ts";

const result = runKeepUnits(process.argv.slice(2), process.argv[1], { fs: nodeFs });
process.stdout.write(result.stdout);
process.stderr.write(result.stderr);
process.exitCode = result.exit;
