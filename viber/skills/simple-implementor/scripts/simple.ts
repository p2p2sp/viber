/*
 * simple.ts - drives the simple flow of a settled plan one event at a time.
 * The entry holds no logic: lib/simple-run.ts routes the call.
 *
 * It exists because what the flow decides between two agents is a fact of the
 * plan and of the returns: which stage runs next, what a coder is handed, when
 * a dispatch is retried, whether the findings are fixed, what is committed,
 * what is left in the tree, when the run ends.
 * The simple-implementor skill only reports each return and sends the blocks
 * printed in answer. Free text never passes through the skill: reasons and
 * findings travel in files.
 *
 * Contract:
 *   argv   : <plan> <session-id> start
 *            <plan> <session-id> resume [<answer>]
 *            <plan> <session-id> <id> <WORD> [<FILES>]
 *            every argument double-quoted by the caller.
 *            <plan>       : the plan file (the plan-mode file, outside the
 *                           repository); a relative path resolves against the
 *                           cwd. Read on every call. Its format: free lines (the
 *                           settled facts; a `Plan:` line among them is not
 *                           read), then one heading `## <n>. <goal>` per stage in
 *                           order, each optionally followed by a line
 *                           `Files: <paths>` (comma-separated). No fact lies
 *                           under a heading.
 *            <session-id> : the session's id, letters, digits, `.`, `_`, `-`.
 *            start        : opens the run at stage 1, always: no resume, an
 *                           earlier state and work files of the session, and
 *                           its review file, are removed first.
 *            resume       : reopens a stopped run at the step that stopped
 *                           it, its tries at 0, and prints that step's block
 *                           under a new id; the plan is read anew, so a line
 *                           changed in it since the stop counts. <answer>: the
 *                           user's decision on the reason, appended to the
 *                           step's blocked file as one line `Decision:
 *                           <answer>`, blanks and line breaks each run to one
 *                           blank; left out or blank, nothing is appended.
 *                           With no stopped run it changes nothing: it prints
 *                           `WAIT`, or the END again once the run ended.
 *            <id>         : the `id:` of the block that sent the return.
 *            <WORD>       : a coder's return: the word of its `STATUS:` line
 *                           (`DONE`, `BLOCKED`), `LOST` when it held none.
 *                           The review's return: `FOUND`, `LOST` when the
 *                           review gave no numbers. A writer's return: the
 *                           word of its `STATUS:` line (`UPDATED`, `NONE`).
 *                           A commit's return: `DONE`; the word is not read.
 *            <FILES>      : a coder's or a writer's return: the value of its
 *                           `FILES:` line, paths separated by commas; left out
 *                           when it held none. The review's return with
 *                           `FOUND`: the two numbers as `<findings> <not nit>`
 *                           (e.g. `"5 2"`).
 *            A return whose <id> is not the one awaited (a stale or repeated
 *            return, an unknown id) changes nothing: it prints `WAIT`, or the
 *            END again once the run ended.
 *   cwd    : any directory inside the host project, a git repository with a
 *            commit.
 *   reads  : the plan, git status, HEAD and HEAD sizes, the names `git diff`
 *            gives from <base> to HEAD, the files below <dir>,
 *            .claude/viber.yml (`build.rules`), the rule files under
 *            .claude/rules/ and the memory files and rule files the writers
 *            wrote.
 *   writes : <dir> is <root>/.temp/viber/<session-id>/simple/, never committed.
 *            <dir>/state.json : the run between two calls: the step, the stage
 *                      in flight, the awaited ids and their sequence number,
 *                      the tries of the dispatch in flight, `before` (the
 *                      repo-relative paths that differed from HEAD at `start`:
 *                      the user's own files), `base` (HEAD at `start`), `kept`
 *                      (the memory files and files under .claude/rules/viber/
 *                      that differed from HEAD on entering the writers step,
 *                      none of `before`: a coder of this run changed them and
 *                      no commit took them) and `gone` (those of `kept`
 *                      absent from disk then), the change list, the
 *                      writers' overrun counters, the review's numbers, the
 *                      paths of the commit awaited and HEAD when it was sent,
 *                      every path a commit block named, the commits' lines,
 *                      the step a stop left open, the END lines.
 *            <dir>/kept/<path> : the content of each `kept` path present on
 *                      entering the writers step, written on that entry.
 *            <dir>/memory-changes.md, <dir>/rules-changes.md : each writer's
 *                      own change list, rewritten on each of its dispatches
 *                      only: first the lines of `git diff --name-status
 *                      <base> HEAD` (what the commits of the run hold, both
 *                      paths of a rename), then one `<status>\t<path>` line a
 *                      repo-relative path, none of those, that differs from
 *                      HEAD on entering the writers step and is either not in
 *                      `before` or named in some coder return's FILES, never
 *                      one under .temp/; <status> `A` (HEAD lacks it), `D`
 *                      (gone from disk) or `M`. On a retry, a `W\t<path>`
 *                      line follows for each of that writer's earlier writes
 *                      (see limits).
 *            <dir>/suggest.md, <dir>/rules.md : not written by the script:
 *                      the memory writer's suggestions for the root CLAUDE.md
 *                      and the rules writer's notes; removed before each of
 *                      that writer's dispatches.
 *            the work tree: a rule file under .claude/rules/viber/ the rules
 *                      writer reported at zero bytes is removed, then that
 *                      directory once empty; a writer's files are restored
 *                      on its second overrun, a `kept` one from its entry
 *                      snapshot (removed when `gone`), any other from HEAD.
 *                      Never a file of `before`.
 *            <dir>/changed.md : one repo-relative path a line: the FILES of
 *                      every awaited coder return so far, each once, `\`
 *                      turned to `/`, a <root>/ prefix cut, paths under .temp/
 *                      dropped. Written empty on `start`.
 *            <dir>/blocked/<key>.md : the file a coder appends its reason to
 *                      on `BLOCKED`; the script only appends the `Decision:`
 *                      line of a `resume`. <key> is `stage<n>`, `tests` or
 *                      `fix`; every dispatch of one step shares it, so a
 *                      later coder reads the earlier reason and the decision.
 *            <dir>/deviations.md : not written by the script: one line for
 *                      each assumed fact of the plan (a line `Assumed: ...`)
 *                      a coder broke to deliver its goal.
 *            <root>/.temp/viber/<session-id>/code-review/review.md : not
 *                      written by the script: the file the review writes to.
 *            git    : the script commits nothing: the commit skill commits the
 *                      paths of each `SKILL: viber:commit` block.
 *   stdout : blocks, a blank line between two:
 *              TASKS
 *              <status> | <subject>
 *            first, when the call changed the session's task list: one line
 *            for each entry whose status it changed, every entry on `start`
 *            and on a `resume` that reopens a run, none with `END`. <status>
 *            is `pending`, `in_progress` or `completed`. The entries, in order: one a stage, subject
 *            `T<n> - <goal>` (of its heading); `Full test run`; `Code
 *            review`, `in_progress` through the fix of its findings too;
 *            `Update project memory`; `Update project rules`, unless
 *            `build.rules` of .claude/viber.yml is `false`; `Commit memory
 *            and rules`, `in_progress` while the commit of the writers' files
 *            is awaited, never `completed`. The entry of a stage, of the full
 *            test run and of the review stays `in_progress` through the
 *            commit of its step. A writer's entry is `completed` once the writers
 *            step runs and no dispatch of its own is awaited, one never sent
 *            too. An entry dispatched again stays `in_progress`.
 *            Then one of:
 *              DISPATCH: viber:simple-coder | id: <id>
 *              <body lines: the agent's prompt, verbatim>
 *            a stage, body:
 *              plan: <plan, absolute, forward slashes>
 *              stage: <n>
 *              changed: <dir>/changed.md
 *              blocked: <dir>/blocked/stage<n>.md
 *              deviations: <dir>/deviations.md
 *            the full test run, body:
 *              changed: <dir>/changed.md
 *              blocked: <dir>/blocked/tests.md
 *              deviations: <dir>/deviations.md
 *              goal: run the full test suite once and fix what the change broke
 *            the fix of the findings, body:
 *              changed: <dir>/changed.md
 *              blocked: <dir>/blocked/fix.md
 *              deviations: <dir>/deviations.md
 *              findings: <review file>
 *              goal: fix every finding except the nit ones, then run the full test suite once
 *            or the writers, one block each, both in one printout when both
 *            are sent:
 *              DISPATCH: viber:memory-writer | id: memory.<seq>
 *              spec: <plan>
 *              changes: <dir>/memory-changes.md
 *              suggest: <dir>/suggest.md
 *              [take off: <n> bytes]
 *              DISPATCH: viber:rules-writer | id: rules.<seq>
 *              spec: <plan>
 *              changes: <dir>/rules-changes.md
 *              rules notes: <dir>/rules.md
 *              [take off: <n> bytes]
 *            `take off:` only on the retry after a first overrun;
 *            or
 *              SKILL: code-review | id: <id>
 *              <one line: the arguments of the skill, verbatim>
 *            its line: `review the diff that git diff <base> prints (the
 *            commits of the run and the work tree), write the result to one
 *            markdown file at <review file>, each finding with its severity
 *            (important, pre_existing or nit), and return only the number of
 *            findings and the number of them that are not nit`;
 *            or
 *              SKILL: viber:commit | id: <id>
 *              <one line: the arguments of the skill, verbatim>
 *            its line: the paths of one commit, separated by spaces;
 *            or the single line `WAIT` (nothing to send: a return not
 *            awaited, or one writer returned and the other is awaited);
 *            or `END` followed by plain lines the caller shows the user, each
 *            path as it is, in this order:
 *              `<Stage <n>|The full test run|The fix of the findings> is
 *              blocked.` (a `BLOCKED`) or `... did not finish after a second
 *              try.` (a second lost return), then each non-blank line of its
 *              blocked file or `No reason was written.` (only on a stop);
 *              `Stages done: <k> of <total>.`;
 *              `Assumed in the plan, broken by the build:` then each
 *              non-blank line of deviations.md indented by two spaces (only
 *              when it holds one);
 *              `The full test suite ran once and what the change broke was
 *              fixed.` (once the test run returned DONE);
 *              `Review findings: <n>, not nit: <m>. Review file: <review
 *              file>` and then `No finding needed a fix.`, `The findings were
 *              fixed, except the nit ones, and the full test suite ran once
 *              more.` or `The findings were not fixed.`; or `The review gave
 *              no numbers, so no finding was fixed. Review file: <review
 *              file>` (once the review returned);
 *              the writers' lines, in the order their returns came, <name>
 *              `memory` or `rules`:
 *                `- memory | suggested for the root CLAUDE.md:` then each
 *                non-blank line of suggest.md indented by two spaces, on each
 *                return that found it;
 *                `- rules | notes:` then each non-blank line of rules.md
 *                indented by two spaces, likewise;
 *                `- <name> | <n> bytes over the limit, the writer dispatched
 *                once more`;
 *                `- <name> | <n> bytes over the limit after the retry, the
 *                <nodes|rules> are restored to HEAD, any changed before the
 *                writers ran left as they are` when no `kept` file is
 *                restored, else `..., the <nodes|rules> are restored to
 *                HEAD, those a coder of this run changed to their state
 *                before the writers, any changed before the run left as they
 *                are`; then `- <name> | restore to HEAD failed, the
 *                <nodes|rules> are left in the tree` when git failed, and
 *                `- <name> | restore to the state before the writers failed,
 *                the <nodes|rules> are left in the tree` when a snapshot
 *                could not be written back;
 *                `- <name> | updated | <paths>`: the reported paths it may
 *                write, none of `before`;
 *                `- <name> | left in the tree, outside what this step may
 *                write | <paths>`: each reported path it may not write, or
 *                that is no file of the repository or lies under .temp/;
 *                `- <name> | nothing to update` (`NONE`);
 *                `- <name> | the writer returned <WORD>` (any other word);
 *              the commits' lines, one for each commit block sent, in
 *              order: `<subject> committed: <short sha>.` when HEAD moved
 *              between its block and its return, `<subject> not committed.`
 *              when it did not; <subject> is `Stage <n> is`, `The fixes of
 *              the full test run are`, `The fix of the findings is` or `The
 *              writers' files are`; then `The run stopped: its open step is
 *              not committed.` (only on a stop), or `Nothing to commit.`
 *              alone (no stop, no commit block sent);
 *              what still differs from HEAD, none under .temp/, paths
 *              separated by `, `:
 *                `Left uncommitted: <paths>`: the paths, none of `before`,
 *                that a coder reported or a commit block named;
 *                `Left uncommitted, changed before the run too: <paths>`:
 *                the paths of `before` a coder reported;
 *                `Left uncommitted, reported by no coder: <paths>`: the
 *                paths, none of `before`, that no coder reported and no
 *                commit block named.
 *              A path of `before` no coder reported is never named.
 *            <id> is `stage<n>.<seq>`, `tests.<seq>`, `review.<seq>`,
 *            `fix.<seq>`, `memory.<seq>`, `rules.<seq>` or `commit.<seq>`,
 *            <seq> rising with every block of the run.
 *            The rules behind the blocks:
 *              order  : the stages one at a time in plan order, never two
 *                       together; after the last stage's `DONE` the full test
 *                       run; after its `DONE` the review; with <not nit> above
 *                       0 the fix, else the writers; after the fix's `DONE`
 *                       the writers; after the writers their commit. Each
 *                       stage, the full test run and the fix is followed by
 *                       its own commit before the next step. Never a second
 *                       review.
 *              retry  : a coder's `BLOCKED` ends the run at once (the stop
 *                       lines): it waits for a decision, which the same block
 *                       again does not bring. Any other return that is no
 *                       `DONE` (`LOST`) prints the same block once more under
 *                       a new id; the second in a row ends the run. Its FILES
 *                       are added to changed.md either way. A stopped run
 *                       keeps its state, its work files and the commits made:
 *                       `resume` reopens it.
 *              review : `FOUND` with two numbers records them; `LOST`, any
 *                       other word or a value that is not two numbers is a
 *                       review that gave no numbers: no fix, the writers.
 *              writers: after the last code-changing step (the fix, or the
 *                       review when no fix runs or it gave no numbers),
 *                       before their commit; a stopped run sends none. The
 *                       memory writer when the change list is not empty; the
 *                       rules writer when
 *                       `build.rules` of .claude/viber.yml is not `false` and
 *                       a listed path matches a `paths:` glob of a rule under
 *                       .claude/rules/. Neither: their commit. They return in
 *                       any order; their commit follows the last.
 *              protect: `before` is never the writers': never measured,
 *                       listed as `W`, restored or removed.
 *              limits : on each return, the net growth in bytes since
 *                       entering the writers step of the writer's files, none
 *                       of `before`: the memory files (600) or the files under
 *                       .claude/rules/viber/ (200); a `kept` file counts
 *                       against its entry snapshot, any other against HEAD.
 *                       A first overrun sends that writer once more, on its
 *                       own counter, with `take off: <n> bytes` and the files
 *                       it changed as `W` lines (a `kept` one only when it
 *                       differs from its snapshot); a second restores those,
 *                       a `kept` one to its snapshot, any other from HEAD.
 *              may    : the memory writer may write memory files; the rules
 *                       writer files under .claude/rules/viber/ that exist
 *                       at HEAD. Any other reported path is left in the
 *                       tree and noted.
 *              commits: one block at a time, each only when it holds a
 *                       path. After the `DONE` of a stage, of the full test
 *                       run and of the fix: the paths that differ from HEAD,
 *                       are listed in changed.md and are none of `before`, so
 *                       a path an earlier commit did not take rides along;
 *                       the next step follows its return, or the `DONE` at
 *                       once when it holds no path. After the writers: the
 *                       files a writer changed since entering the writers
 *                       step and may write, none of `before`. A path holding
 *                       a blank, a comma or an apostrophe is in none: the
 *                       commit skill cannot read it in a list. A step that
 *                       stopped the run is not committed; the commits before
 *                       it stay. The script never reads what the skill
 *                       returned: a commit is made when HEAD moved.
 *   stderr : one line naming the cause when the exit is 2, the usage on a call
 *            that matches no form.
 *   exit   : 0 with blocks on stdout; 2 on bad usage, a bad session id, an
 *            unreadable plan, a plan with no stage heading, a `start` outside a
 *            git repository with a commit, a return or a `resume` before
 *            `start`, or a state or a `Decision:` line that cannot be read or
 *            written (stdout empty).
 */

import { projectTree } from "../../planner/scripts/lib/adapters/tree.ts";
import { nodeFs } from "../../spec-implementor/scripts/lib/adapters/fs.ts";
import { gitCommand } from "../../spec-implementor/scripts/lib/adapters/git.ts";
import { runSimple } from "./lib/simple-run.ts";

const result = runSimple(process.argv.slice(2), process.cwd(), { fs: nodeFs, git: gitCommand, tree: projectTree });
process.stdout.write(result.stdout);
process.stderr.write(result.stderr);
process.exitCode = result.exit;
