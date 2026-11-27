/*
 * plan.ts - names the work files of a plan, checks a plan draft, lands it as
 * the plan and orders its tasks. The entry holds no logic: lib/plan-run.ts
 * runs the subcommand.
 *
 * It exists because everything it decides is a fact of the text and the tree:
 * a model that checks a plan by reading misses a rule on every pass, and one
 * that copies a plan retypes it. The wave of a task, its model and the lock on
 * integration tasks are functions of the task fields, so no model spends a
 * thought on them. The planner skill runs it through the wrapper plan.sh;
 * `order` shows the order of a landed plan. The spec-implementor skill's build.ts
 * imports lib/plan-parse.ts, lib/plan-order.ts and lib/adapters/tree.ts: the
 * task block and the order have one reader.
 *
 * Contract:
 *   argv   : paths <spec> | maps <code map> <tests map> | check <draft> <spec>
 *            <code map> | land <draft> <spec> <code map> <plan> [<issue>] |
 *            order <plan>. <issue> is `#<n>`, `<n>` or a GitHub issue link.
 *            A relative path resolves against the cwd, a backslash read as "/".
 *   cwd    : any directory inside the host project: the tree is the work tree
 *            git reports for it, the cwd itself outside a repository.
 *   reads  : the files named in argv, the tree's file list (tracked and
 *            untracked, ignored left out), and for `land` the names in <work>/adr,
 *            <work> being <root>/.temp/viber/<the spec's directory name>.
 *   writes : `land` only <plan>, its directories created; `paths` removes
 *            <work>/adr.
 *   stdout :
 *     paths : `draft:`, `code-map:`, `tests-map:`, `review:`, each an absolute
 *             path under <work>/. On a spec holding a `- D<n>: ` item also
 *             `adr: <work>/adr`, the directory the adr agent stages its
 *             decision records in, and `stamp: <yyyyMMddHHmmss>`, the local
 *             time that names them. Creates nothing; removes <work>/adr, the
 *             records an earlier run of the spec staged.
 *     maps  : `PASS`, or one `CONFLICT: <path> | <what the code does> | R<n>`
 *             line per `conflict | ...` entry of the code map (the code
 *             contradicts that R), then one `OVER:` line per map past its
 *             limit: 60 entries for the code map, 8 of them marked `read`, 20
 *             for the tests map. An entry is a written line that is no `#`
 *             comment.
 *     check : `PASS`, followed by `LARGE: <n> tasks, past 20` on a plan of
 *             more than 20 tasks; or one line per problem: `OPEN: line <n>:
 *             <text>` for an `OPEN:` line of the draft, `FIX: <T<n> | line
 *             <n> | R<n> | map line <n>>: <problem>` for a broken rule.
 *             A draft is `# <title>`, optional `OPEN:` lines, `## Tasks`, then
 *             `### T<n> - <title>` blocks numbered from 1, a title of at most
 *             64 characters (the subject of the task's commit). A block holds the
 *             fields Delivers, Covers, Files, Blocked-by, TDD, Tests, Seam,
 *             DoD and Verify once each, Hard and UI optionally, Model never, and
 *             nothing else. The rules:
 *               Covers     : `R<n>`/`D<n>` ids of the spec; every R of the
 *                            spec is covered by some task.
 *               Files      : repo-relative paths separated by commas. `+`
 *                            marks a file the task creates (absent from the
 *                            tree), `-` one it deletes; an unmarked or `-`
 *                            path is in the tree or created by an earlier
 *                            task. An entry with `*` or `?` is a glob (`**`
 *                            crosses directories), unmarked, matching at least
 *                            one file.
 *               Blocked-by : `none` or lower-numbered task ids.
 *               TDD        : `required`, or `none (<reason>)` with no-runtime,
 *                            refactor, shape or repro.
 *               Tests      : none, unit, composite or integration; not none on
 *                            TDD required; integration when a Files path lies
 *                            in a directory named integration (or
 *                            integration-tests and the like) or holds
 *                            `.integration.`.
 *               Seam       : `<public entry> | <test file>` or `none`; not
 *                            none on TDD required or none (repro); the test
 *                            file is a Files entry, on repro one of the tree.
 *               UI         : names of the ui-designer skill's references
 *                            separated by commas: accessibility, color,
 *                            components-states, forms, layout-spacing, mobile,
 *                            motion, saas-dashboards, tokens, typography.
 *               DoD        : `- ` clauses on the lines below, at least one.
 *               Verify     : one line, not wrapped in backticks.
 *               Code map   : every entry but `none` and `conflict` (its path before the
 *                            first `|`, `+` and a ` (<n> files)` tail left
 *                            out) is a file some task's Files holds, a glob
 *                            as every tree file it matches.
 *     land  : the lines of `check` when the draft fails it, nothing written.
 *             Else `LANDED: <plan>` and `changed: all | none | T<n>,T<n>`:
 *             the tasks whose text differs from the plan <plan> held before,
 *             `all` when it held none. The plan written is the hand-off line
 *             `Invoke the viber:spec-implementor skill to implement this
 *             plan.`, the title, `Spec: <path>` and `Plan: <plan>`, `Issue:
 *             <#n or link>` when an <issue> is given, one
 *             `ADR: <path>` line per `.md` file of <work>/adr (each path
 *             repo-relative inside the tree; build.ts moves those files to
 *             docs/adr/ at its start), `## Order` with one `- Wave
 *             <k>: T<n>, T<n>` line per wave, then `## Tasks` with each block
 *             as written plus a `Model:` line above `DoD:`.
 *             Model: opus on a task carrying `Hard:`, haiku on TDD none
 *             (no-runtime) or none (shape) with no `UI:` line, sonnet
 *             otherwise.
 *             Wave: one past the last wave of the tasks it runs after, those
 *             being its Blocked-by, every lower-numbered task sharing a
 *             file with it (a glob counted as the files it matches),
 *             every lower-numbered task whose glob matches a literal path of
 *             it or whose literal path its glob matches, and every
 *             lower-numbered task whose glob matches a literal path of an
 *             earlier task that a glob of it matches too; a task with Tests
 *             integration moves on to the first wave holding no other such
 *             task.
 *     order : for a landed plan, one `wave <k>: T<n> T<n>` line per wave, then
 *             per task `T<n> | model: <m> | tdd: <value> | integration:
 *             true|false | after: none | T<n>, T<n> (file)`, `(file)` marking
 *             a task it follows only because they share a file, a glob of one
 *             matches a literal path of the other, or a glob of each matches
 *             the same literal path of an earlier task.
 *   stderr : one line naming the cause when the exit is 2, the usage on a
 *            call that matches no subcommand.
 *   exit   : 0 on PASS, LANDED and for paths and order; 1 with CONFLICT, OVER, OPEN or
 *            FIX lines; 2 on bad usage, an <issue> that is none, an unreadable or unwritable file, a
 *            spec with no R item or a plan with no task (stdout empty).
 */

import { systemClock } from "./lib/adapters/clock.ts";
import { nodeFs } from "./lib/adapters/fs.ts";
import { projectTree } from "./lib/adapters/tree.ts";
import { runPlan } from "./lib/plan-run.ts";

const result = runPlan(process.argv.slice(2), process.cwd(), { fs: nodeFs, tree: projectTree, clock: systemClock });
process.stdout.write(result.stdout);
process.stderr.write(result.stderr);
process.exitCode = result.exit;
