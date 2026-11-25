/*
 * task-ready.ts - says which tasks of a landed plan may run now, and remembers
 * which task waited on which path of which other task. The entry holds no logic:
 * viber/lib/task-ready.ts reads the run and builds the lines.
 *
 * The session that builds a plan opens no file, and it scheduled from a table it
 * re-read on every return: which dependencies are done, which task runs alone,
 * how many run at once, and which task had already waited on which file, the
 * last of these kept in its own context and lost with it. One wrong reading
 * started a task too early or let two tasks wait on each other for good. This
 * script holds the rule and the memory, so the session only starts what it is
 * told. It is a script and not a step of an agent because every input is a fact
 * of the plan, of status.md or of the calls made so far, and the answer has to
 * be the same on every call. Callers run it through the wrapper task-ready.sh;
 * task-step.sh is its one caller.
 *
 * Contract:
 *   argv   : <plan-file> ready --started <mark> [--flight <id>,..]
 *                              [--held <id>,..] [--waiting <id>,..]
 *                              [--lost <id>,..]
 *            <plan-file> wait <id> --started <mark> [--flight <id>,..]
 *                             <path>[,<path>]
 *            <plan-file> is the landed <run>/plan.md, relative to the cwd or
 *            absolute, a backslash read as "/"; the run directory is the
 *            directory holding it. <mark> is the session mark (any non-empty
 *            word, "unknown" included). A list is comma-separated, the blanks
 *            around an entry cut and an empty one dropped; each flag once.
 *            --flight names the tasks running now (offered or dispatched and
 *            not yet committed), --held the tasks held after their last
 *            attempt, --waiting the tasks waiting on a path, --lost the tasks
 *            whose dispatch ended with no return; an id that is done or
 *            skipped is dropped from all four, and an id of --lost that is
 *            also in --flight or --held is no lost task (no task goes out
 *            while the caller holds it in flight). "wait" takes --flight alone:
 *            the tasks running at the return that waits, <id> among them or
 *            not. A <path> is repo-relative (a backslash read as "/", one
 *            leading "./" cut) or absolute inside the repository.
 *   cwd    : any directory inside the repository: a relative plan path resolves
 *            against it, and the waits file lives under the repository root
 *            (the cwd itself outside a repository).
 *   env    : none.
 *   reads  : the plan (the id, Depends-on, Exclusive and Files lines of its task
 *            blocks, unchecked: task-step.sh has plan-index.sh check it first),
 *            <run>/status.md (done:, skipped: and the lines "decision: <id>:
 *            sequenced after <other>: both need <path>"), the two extras files
 *            <run>/work/<id>-extra.md and -extra-review.md of every task, and
 *            <root>/.temp/viber/waits. A missing file reads as empty.
 *   writes : "wait" alone, <root>/.temp/viber/waits: the first line "started:
 *            <mark>", then one line "wait: <id> | <claimant> | <path>" per
 *            remembered path of a claimant, one line "free: <id> | <id>,<id> |
 *            <path>" per remembered path no task claims (the tasks in flight at
 *            that wait) and one line "sequence: <id> | <claimant> | <path>" per
 *            "sequence:" line printed. Lines are appended under the
 *            same mark; a file under another mark is written again from its
 *            first line, so a new session starts with no memory. A sequence
 *            line of the file counts as a sequenced line of status.md in both
 *            modes: the pair holds from the call that printed it, whenever its
 *            decision line is recorded.
 *   stdout : ready - "none", or one or both of
 *              start: <id>,<id>
 *              retry: <id>,<id>
 *            A task may start when it is neither done nor skipped, every
 *            Depends-on id is done, no sequenced line of status.md names an
 *            <other> for it that is neither done nor skipped, and it is in none
 *            of the four lists. A task of --waiting is a retry when no such
 *            line holds it and none of the tasks its last wait named (the
 *            "wait:" and "free:" lines it wrote last, with no line of another
 *            task between them) is in --flight. A task of --lost is a retry
 *            when no such line holds it, whoever is in flight: it ran until
 *            its dispatch died, so it takes its slot back before any start.
 *            The tasks in flight and the listed ones are at most 10
 *            together: the retries first, then the starts, each in plan order.
 *            A task whose Exclusive line reads true is listed only when no
 *            other task can be listed and nothing is in flight, alone, a retry
 *            before a start; while one is in flight the answer is "none".
 *            wait - the named paths in the order given, each path once: a
 *            line per path nobody is waited on for, and one line per task or
 *            set of tasks waited on, at its first path:
 *              wait: <id> | on: <claimant>
 *              wait: <id> | on: <id>,<id>
 *              sequence: <id> | after: <claimant> | path: <path>
 *              blocked: <path> | by: <claimant>
 *              unclaimed: <path>
 *            The claimant is the first task in plan order, other than <id> and
 *            neither done nor skipped, whose Files or extras file lists the
 *            path: a skipped task never finishes, so it claims nothing. A
 *            claimant that runs only after <id> (through Depends-on ids and
 *            sequenced lines, however many steps) prints "blocked:" and is not
 *            remembered: such a wait would never end. Any other claimed path is
 *            remembered, and its pair of tasks, whichever of the two waited
 *            before, prints "sequence:" with the first of its paths in this
 *            call when the waits file held a line of the pair before this call
 *            or the claimant is not in --flight (a retry sent at once would
 *            meet the same file), else "wait:".
 *            A path with no claimant is a dirty file no task lists yet. It is
 *            remembered and waited out once: "wait:" naming, in plan order,
 *            the other tasks in --flight, one line for all such paths of the
 *            call. With no other task in flight, or when <id> already waited
 *            on that path, it prints "unclaimed:" and is not remembered.
 *   stderr : one "error: ..." line on exit 2.
 *   exit   : 0 the answer was printed.
 *            2 unusable argv (the usage line), a plan file that does not exist
 *              or cannot be read, a "wait" for an id the plan does not hold, or
 *              a waits file that could not be written; nothing on stdout.
 */

import { nodeFs } from "../lib/adapters/fs.ts";
import { gitCommand } from "../lib/adapters/git.ts";
import { runTaskReady } from "../lib/task-ready.ts";

const result = runTaskReady(process.argv.slice(2), process.cwd(), { fs: nodeFs, git: gitCommand });
process.stdout.write(result.stdout);
process.stderr.write(result.stderr);
process.exitCode = result.exit;
