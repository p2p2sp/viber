/*
 * rules-map.ts - every deterministic fact about the host project's
 * `.claude/rules/` directory, and the one gate in front of deleting a rule
 * file. The entry holds no logic: viber/lib/rules-map.ts does all of it, and the
 * skill runs it through the wrapper rules-map.sh, which keeps its call line.
 *
 * It exists because `/viber:rules` has to know what the layer IS before it asks
 * the user anything: which rule is past its budget, which one declares a scope
 * that matches nothing, which one is frozen, and what the whole directory costs
 * a reader. Measured in the model that is character counting done in prose,
 * which is how a budget report ends up wrong. The map is also a `!` preload,
 * and a preload is permission-checked as ONE command: a compound `ls | wc |
 * git` would ask for approval per member and stall the skill load on any mode
 * that does not auto-accept.
 *
 * The delete lives here for the opposite reason - it has to be able to REFUSE.
 * A reset is judged as a whole, one unfit target leaving every file in place,
 * because a half-deleted layer is a state neither the user nor the command that
 * printed them the list can describe afterwards.
 *
 * Contract:
 *   argv   : none                  -> map mode.
 *            --reset <path> [...]   -> reset mode, repo-relative paths.
 *            --brief <id> <target> [...]
 *                                   -> brief mode: <id> is the map id of the
 *                                      run (letters, digits, `.`, `_`, `-`),
 *                                      <target> a rule path under
 *                                      .claude/rules/, a repo-relative directory
 *                                      (`.` for the root) or the word `trail`.
 *            --confirm <id> <target> [...]
 *                                   -> confirm mode: <id> and <target> as in
 *                                      brief mode; the targets given are the
 *                                      kept ones.
 *            anything else          -> refused, exit 2.
 *   cwd    : any directory inside the host project - the repository root is
 *            resolved here and every printed path is relative to it. Outside a
 *            repository the cwd IS the root and nothing is tracked there.
 *   env    : none.
 *   reads  : every `.md` of <root>/.claude/rules/ - each file at any depth, the root
 *            holding the shared rules and each subdirectory one area's, its
 *            frontmatter and its size; the git index - which of them are tracked, modified or
 *            untracked, and how many tracked paths a rule's globs match;
 *            <root>/docs/<directories.specifications>/<run>/failures.md - the
 *            archived failure trails, whose `- <cause> | ...` lines are counted;
 *            and the specifications directory of the project config, the one
 *            line `scripts/config.sh --specifications` prints, resolved in
 *            process (`specs` by default). A linked directory is never entered.
 *   writes : nothing at all in map mode. In reset mode, and only once every
 *            target has passed, the given files are deleted from the working
 *            tree, and a subdirectory left empty by them is removed with it. In
 *            brief mode, once every target has passed, one findings file
 *            `.temp/viber/<id>/<slug>-audit.md` per rule matching no tracked
 *            file. Nothing is ever staged and nothing is ever committed. In
 *            confirm mode nothing at all.
 *   stdout : map mode, in this order. A section with nothing to report prints
 *            no line at all; `total:` always prints.
 *              # viber rules map
 *              id: <yyyy-mm-dd-HH-mm-ss>
 *              state: none | partial | complete
 *              rule: <path> <chars> paths <glob>[,<glob>] matches <n> ok
 *              frozen: <path> <chars>
 *              dead: <path>
 *              misplaced: <rule path> <area>
 *              dirty: <path> modified | untracked
 *              trail: <repo-relative path of one archived failures.md> convention <n> other <n>
 *              waiting: convention <n> place <n> plan <n> task <n> test <n> unknown <n>
 *              total: <chars> ok | OVER-DIR
 *            `id` is this run's stamp, which the caller spends as
 *            `.temp/viber/<id>/`.
 *            `state` is `none` when the directory is absent or holds no
 *            non-frozen `.md`, `complete` when every non-frozen rule declares a
 *            frontmatter `paths:` key, `partial` otherwise.
 *            `rule:` is one line per non-frozen `.md`, alphabetical by full
 *            path, so an area's rules print together. `paths`
 *            carries the declared globs comma-separated, or `none` when the key
 *            is absent or declares nothing usable - a rule Claude Code loads
 *            everywhere. Then `matches <n>`, the tracked files those globs
 *            really match, a `{a,b}` group matching either branch. The line
 *            closes on `ok`, or `OVER-FILE` past 4000 bytes.
 *            `frozen:` is one line per `_*.md`: reported, never scored, never
 *            dead, never deleted.
 *            `dead:` is a non-frozen rule whose globs match no tracked file -
 *            never one that declares no scope, and never
 *            printed at all when the repository tracks nothing, where every
 *            rule would read dead and the count would say nothing about the
 *            rule.
 *            `misplaced:` is one line per non-frozen rule that sits outside the
 *            area it belongs to, alphabetical by path, after the `dead:` lines:
 *            a rule directly under the rules directory whose globs each hold a
 *            `/` and all open on one first segment holding none of `*`, `?`,
 *            `[` or `{` (that segment is the area), else one declaring no such
 *            segment, a rule with no scope included, whose basename opens on
 *            `<area>-` for an existing subdirectory of the rules directory; and
 *            a rule inside `<area>/` whose basename opens on `<area>-`.
 *            `dirty:` covers every `.md` in the directory, frozen included:
 *            uncommitted work is a fact about the file, not a score.
 *            `trail:` is one line per archived `failures.md` holding at least
 *            one entry of any cause, alphabetical by path, with that file's
 *            count of `convention` entries and of all its other causes (place,
 *            plan, task, test, unknown). `waiting:` is one line summing the entries of every
 *            archived `failures.md` by cause; it prints when at least one such
 *            file exists, a cause with no entry reading 0, and neither line
 *            prints when none exists.
 *            `total:` sums every `.md`, frozen included, and closes on `ok` or
 *            `OVER-DIR` past 40000 bytes.
 *
 *            reset mode prints one of two blocks. Refused, nothing deleted:
 *              refused: <path> not-a-rule | frozen | missing | untracked | modified
 *              refused: - no-target
 *              refused: <arg> unknown-mode
 *            or, only once every target passed:
 *              removed: <path>
 *              removed: <n>
 *            brief mode prints, in this order, the `AUDIT:` lines first, then
 *            one block per target in the order given, or `NEXT: none` alone
 *            when no block was printed. A block is the directive line and five
 *            labelled lines:
 *              NEXT: rules-auditor
 *              target: <rule path> | none | trail
 *              scope: <globs, comma-separated> | ** | <directory> | <trail paths>
 *              matches: <n> | none
 *              out: .temp/viber/<id>/
 *              refs: <plugin root>/references
 *            `<plugin root>` is the path the entry was started by cut three
 *            directories above its own, as text, with forward slashes: `C:/...` on
 *            Windows whichever spelling invoked the wrapper. The same root ends the
 *            `refs:` line of the confirm mode's writer block.
 *
 *            confirm mode reads the findings file of each target under
 *            `.temp/viber/<id>/` (`<slug>-audit.md` of a rule, `new--<slug>-audit.md`
 *            of a directory, `new--root` for `.`, `_trail-audit.md` of the trail)
 *            and counts its lines opening on `STALE:`, `GONE:`, `DROP:` and
 *            `MISS:` (rule, directory) or `MISS:`, `IGNORED:` and `REJECTED:`
 *            (trail); a missing file reads 0 everywhere. When every counter is 0,
 *            no kept rule is misplaced or `OVER-FILE`, `total:` carries no
 *            `OVER-DIR` and no kept `trail:` line has an `other` count above 0,
 *            stdout is the one line
 *              STOP: rules: the layer already holds, no writer dispatched
 *            otherwise, in this order:
 *              confirm: <target> stale <n> gone <n> drop <n> miss <n>
 *              confirm: trail miss <n> ignored <n> rejected <n>
 *              confirm: <rule path> misplaced <area>
 *              confirm: <rule path> OVER-FILE
 *              confirm: total OVER-DIR
 *              confirm: <trail path> other <n>
 *              ASK: fold in -> write | stop -> stop
 *              NEXT: rules-writer
 *              map:
 *              id: <id>
 *              state: <state>
 *              rule: / dead: lines of the kept rule targets, verbatim
 *              trail: lines, only with the trail kept, verbatim
 *              total: <chars> ok | OVER-DIR
 *              notes: .temp/viber/<id>/
 *              refs: <plugin root>/references
 *            a `confirm:` line prints only for a counter above 0.
 *            `scope: **` and `matches: none` mark a rule declaring no scope; a
 *            directory target is `target: none` with the directory as scope,
 *            one leading `./` and the trailing `/` removed (`./src/` prints
 *            `scope: src`), and `scope: .` is the repository root, whether the
 *            target was given as `.` or `./`; the trail target lists every `trail:` path with a
 *            `convention` count above 0 and prints no block when none has one.
 *            A rule whose globs match no tracked file - judged only when the
 *            repository tracks something - prints no block, its findings file
 *            holding the one line `GONE: the rule's globs match no tracked file`
 *            and its line being
 *              AUDIT: <rule path> stale 0 gone 1 unverifiable 0 drop 0 miss 0 -> .temp/viber/<id>/<slug>-audit.md
 *            where <slug> is the rule path below .claude/rules/ without `.md`,
 *            each `/` as `--`.
 *   exit   : 0 - map mode, ALWAYS, whatever it finds: it is called as a `!`
 *                preload, where a non-zero exit aborts the whole skill load.
 *                Also a reset that deleted every target it was given, and a
 *                brief or a confirm that answered.
 *            2 - unusable argv: a first argument that is not `--reset`,
 *                `--brief` or `--confirm`, or `--reset` with no target at all. A
 *                brief or confirm with an unusable id, no target, a frozen rule
 *                or a target that is
 *                neither a rule, a directory nor `trail` exits 2 as well, with
 *                one `error: <reason>` line on stderr and an empty stdout.
 *            3 - the reset was refused. Nothing was deleted.
 */

import { systemClock } from "../../../lib/adapters/clock.ts";
import { nodeFs } from "../../../lib/adapters/fs.ts";
import { gitCommand } from "../../../lib/adapters/git.ts";
import { runRulesMap } from "../../../lib/rules-map.ts";

const result = runRulesMap(process.argv.slice(2), process.cwd(), process.argv[1], { fs: nodeFs, git: gitCommand, clock: systemClock });
process.stdout.write(result.stdout);
process.stderr.write(result.stderr);
process.exitCode = result.exit;
