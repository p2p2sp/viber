/*
 * build.ts - drives the build of an approved plan one event at a time. The
 * entry holds no logic: lib/build-run.ts routes the call.
 *
 * It exists because everything a build decides between two agents is a fact of
 * the plan, the tree and the files the agents wrote: which task starts, what a
 * coder is handed, whether a review passed, when a task is committed or held,
 * which step closes the run. A model that decides these drifts over a long
 * run; here the spec-implementor skill only reports each agent's return and sends
 * the blocks printed in answer. Free text never passes through the skill:
 * reasons, findings and notes travel in files.
 *
 * Contract:
 *   argv   : <plan> start
 *            <plan> <id> <WORD> [<FILES>]
 *            <plan>  : the landed plan (plan.sh land); a relative path resolves
 *                      against the cwd, then the project root. Its `Spec:` line
 *                      names the run, its `ADR:` lines the decision records
 *                      staged for it, its `Issue:` line (`#<n>` or an issue
 *                      link, none on a pull request link) the run's issue,
 *                      its `Phase: P<n> of <N>` line (plan.sh land, for a
 *                      spec directory ending in `-p<n>-of-<N>`) the part of a
 *                      split change the run builds.
 *            start   : opens the run, or resumes it: a task that is done stays
 *                      done (its commit finished, see git), every other
 *                      starts over, a held one included.
 *                      On another machine the run resumes from its commits:
 *                      <plan> is then <spec dir>/plan.md.
 *            <id>    : the `id:` of the block that sent the agent returning.
 *            <WORD>  : the word of the `STATUS:` or `VERDICT:` line of its
 *                      return, `LOST` when it returned none.
 *            <FILES> : the value of its `FILES:` line, when it returned one:
 *                      repo-relative paths separated by commas.
 *            A return no step awaits (a repeat, an unknown id) changes nothing
 *            but the commits every call finishes first (see git).
 *   cwd    : any directory inside the host project, a git repository with a
 *            commit.
 *   reads  : the plan, the spec its `Spec:` line names, the tree,
 *            .claude/viber.yml (`build.rules`, `build.qa`,
 *            `build.extensions` and `directories` only) and the files the
 *            agents wrote under <work>.
 *   writes : <spec dir> is the directory of the spec, the run directory;
 *            <name> is its name, <work> is <spec dir>/work. A state file
 *            holds no path of this machine.
 *            <spec dir>/plan.md    : the plan as started.
 *            <spec dir>/outcome.md : the state of each task and the notes of
 *                      the run, rewritten on every call until the finalizer
 *                      returned; with a `Phase:` line in the plan, the line
 *                      `Phase: P<n> of <N>` under its title, then `Issue:
 *                      <#n or link>` when the run has an issue (plan.sh land
 *                      gives it to the next part).
 *            <work>/state.json     : the run between two calls: `base` (HEAD
 *                      at the first start), `before` (the files that differed
 *                      from HEAD then), each task's state (todo, coder,
 *                      review, done, held, skipped) and counters, the close
 *                      step.
 *            <work>/tasks/T<n>.md  : the cut of a task: its block without
 *                      `Model:` and `Blocked-by:`, each DoD clause as
 *                      `- DoD.<k>:`, the `R` items of the spec its `Covers`
 *                      names, `## Mockup` with the path of <spec dir>/prototype.html
 *                      when that file exists and one of those items names it,
 *                      the spec's Out of scope, Must not change,
 *                      Decisions, Contracts, Constraints and Root cause
 *                      sections whole, and the title, `Delivers` and `Files`
 *                      of each `Blocked-by` task.
 *            <work>/diff/T<n>.diff : the task's work against HEAD, built on a
 *                      copy of the index.
 *            <work>/fix/           : what a coder is handed to fix.
 *            <work>/changes.md, facts.md : the inputs of the close agents;
 *                      memory-changes.md, rules-changes.md, qa-changes.md : the
 *                      change list of each writer of the trio.
 *            docs/adr/<name>       : on `start`, each file an `ADR:` line of
 *                      the plan names (repo-relative or absolute) is moved
 *                      here under its own name, a record of that name
 *                      replaced (lib/build-adr.ts). A file that is gone with
 *                      no record of its name here, or that cannot be moved, is
 *                      noted in the outcome.
 *            <root>/.temp/viber/<name>/lock/ : held for the length of
 *                      one call; it names a process, so it is never committed.
 *            <root>/.temp/viber/<name>/qa-comment.md : the body of the
 *                      qa comment, removed once gh returned.
 *            git    : `chore(viber): start <name>` on the first `start`,
 *                      of <spec dir> whole when it lies in the repository,
 *                      with a `Phase: P<n> of <N>` line also the existing
 *                      directories of the later parts beside it,
 *                      once its files are written, before
 *                      the records; a `start` finding <work>/state.json at
 *                      HEAD makes none, and a refusal is noted in the outcome
 *                      and retried on the next `start`. Then
 *                      `docs(viber): decision records` on `start`, of the
 *                      records under docs/adr/ the plan names that differ from
 *                      HEAD; a refusal is noted in the outcome and the records
 *                      stay in the tree. One commit a task, `T<n> - <title>`,
 *                      of its `Files` and
 *                      the paths its coder reported, none when they hold no
 *                      change. Every call, before its event, finishes the
 *                      commit of each task done with no sha and no
 *                      `no-change` (a call killed in that commit): its sha is
 *                      read from the line of its subject in `git log
 *                      <base>..HEAD`; with none and its paths still differing
 *                      from HEAD it is committed now, a refusal opening a fix
 *                      round; clean paths leave it as it is. On `start` it
 *                      runs after the work files are cleared: that commit
 *                      carries the task's notes alone. Then
 *                      `fix(viber): final review`,
 *                      `fix(viber): post-test repair`, `docs(viber):
 *                      project memory`, `docs(viber): project rules`,
 *                      `docs(viber): qa scenarios` and
 *                      `chore(viber): extension <name>` at the close, each
 *                      only when its agent changed a
 *                      file; then `chore(viber): run state <name>` or
 *                      `chore(viber): archive <name>`. When <spec dir>
 *                      lies in the repository, every other commit also takes
 *                      its plan.md, outcome.md,
 *                      <work>/state.json (the state as of that commit) and
 *                      <work>/tasks/, and of <work> only the step's own files:
 *                      a task's notes, blocked, diff, review and fix files, the
 *                      fix coder's report, fix, notes and blocked files, the
 *                      memory writer's suggest.md, the rules writer's rules.md,
 *                      each writer's own change list, an extension's
 *                      ext/<name>; never the work of another agent in flight.
 *                      The qa commit takes of <spec dir> beyond those only the
 *                      qa.md and qa.e2e.md its writer reported. `run state`
 *                      and `archive` take <spec dir> whole. Each commit takes its
 *                      paths alone through a private index and runs the hooks.
 *            end    : a run with a held or skipped task is committed as it
 *                      stands (`run state`), so `start` resumes it on any
 *                      machine. A run whose every task is done, lying in the
 *                      repository: <work>, <spec dir>/plan.md and
 *                      <root>/.temp/viber/<name> are removed, <spec dir>
 *                      moves from docs/<directories.runs>/ to
 *                      docs/<directories.specifications>/<name> (defaults
 *                      `_specs`, `specs`; one lying elsewhere, or whose archive
 *                      exists, stays in place; an emptied
 *                      docs/<directories.runs>/ is removed) and is committed
 *                      (`archive`).
 *                      The archive holds spec.md, outcome.md and the run's
 *                      prototype.html, qa.md and qa.e2e.md.
 *   stdout : blocks, a blank line between two:
 *              TASKS
 *              <status> | <subject>
 *            first, when the call changed the session's task list (lib/
 *            build-list.ts): one line for each entry whose status it changed,
 *            every entry on `start`, none with `END`. <status> is `pending`,
 *            `in_progress` or `completed`. An entry is a plan task, its
 *            subject that of its commit (`T<n> - <title>`, `T<n> [TDD] -
 *            <title>` on `TDD: required`; a held or skipped one reads
 *            `pending`), or a close step: `Final review`, `Final
 *            test run`, `Update project memory`, `Update project rules` (not
 *            with `build.rules: false`), `Write QA scenarios` (only with
 *            `build.qa: true`), `Run extensions` (only with a
 *            `build.extensions` step), `Finalize`. The three writers' entries
 *            turn `in_progress` together, each `completed` on the last return
 *            of its own writer.
 *            Then
 *              DISPATCH: <agent type> | id: <id> [| model: <model>]
 *              <body lines: the agent's prompt, verbatim>
 *            or the single line `WAIT` (agents are in flight, nothing to
 *            send), or `END` followed by the summary lines, plain sentences
 *            the skill writes in the conversation's language: `Tasks:
 *            <total>. With problems: <held and skipped>.`, `The tests fail.`
 *            on FAIL, `The outcome has no summary.`, `Git refused the commit:
 *            <dir> is left uncommitted.` when the `state` or `archive` commit
 *            was refused, `Left uncommitted: <paths>` (the files that differ
 *            from HEAD, those of `before`, of <spec dir> and of .temp/ left
 *            out), `Outcome: <path>`, then, on a run closed in full whose
 *            plan has `Phase: P<n> of <N>` with n < N, `Next: P<n+1> of <N>:
 *            docs/<directories.runs>/<stamp>_<slug>-p<n+1>-of-<N>/spec.md`
 *            (the run's name with its part suffix advanced), ending in ` is
 *            missing` when that spec is absent; none after the last part. Nothing starts it:
 *            the user calls the planner on that spec in a new session.
 *            The rules behind the blocks:
 *              start  : a task starts once every task it runs after is done
 *                       (its `Blocked-by`, each lower-numbered task sharing
 *                       a file, each whose glob matches a literal path of
 *                       the other and each whose glob matches a literal path
 *                       of an earlier task that a glob of it matches too),
 *                       at most 5 agents at once, one `Tests:
 *                       integration` task at a time. Its coder runs on its
 *                       `Model:`, every later coder of the task on opus. A
 *                       task with a `UI:` line: the body of its coder and of
 *                       its reviewer has the line `ui: <dir>`, the references
 *                       of the ui-designer skill that line names files of.
 *              coder  : after `DONE` the tree is held to `Files` (a `+` path
 *                       exists, a `-` path is gone, any other exists) and
 *                       `FILES` to files of the repository outside .temp/ (a
 *                       directory fails); a `FILES` path in the `Files` of
 *                       another unfinished task, or that one reported, is
 *                       noted as `conflict` and left out of the commit. A
 *                       failed check, `BLOCKED` and `LOST` each send the coder
 *                       once more; the second in a row holds the task.
 *              review : every task but `TDD: none (no-runtime)` is reviewed.
 *                       The report decides, the word only helps: its Critical
 *                       lines holding all five fields become the fix file, and
 *                       the task passes when that file is empty. Minor and
 *                       malformed lines go to the outcome. No report twice:
 *                       the task is committed `unreviewed`.
 *              fix    : a failed review, or a commit a hook refused (its
 *                       output is the finding), opens a fix round, at most 2 a
 *                       task. Past them the task is held.
 *              held   : the outcome takes the findings left and the paths left
 *                       in the tree, every task running after it is skipped,
 *                       the rest of the plan goes on.
 *              close  : once no task is in flight and none can start. With a
 *                       held or skipped task: the finalizer alone, then the
 *                       end with no archive. Else the final review (its
 *                       Critical findings fixed once, not reviewed again; the
 *                       run directory stays out of the changes it is handed),
 *                       the tests (at most 2 repair rounds), the memory, rules
 *                       and QA writers together (one printout, their returns in
 *                       any order, told by the id prefix `memory.`, `rules.`,
 *                       `qa.`; the next step waits for the last of them, a
 *                       send-back included), each extension step, the
 *                       finalizer, the end. A run resumed in that step, or
 *                       from a state whose close step is `memory` or `rules`,
 *                       sends the trio again. The commit of a fix coder (final
 *                       review, post-test repair) takes the files it reported
 *                       and each file that differs from HEAD after it and did
 *                       not when it was sent: a missing `FILES:` loses nothing.
 *              memory : sent when the run changed a file. The net growth in
 *                       bytes of the nodes and sections below the root against
 *                       HEAD, a deleted file negative, a new one whole (lib/
 *                       build-growth.ts), is held to 600 bytes a build. Over
 *                       it, the first return is sent back once, on a counter of
 *                       its own: a DISPATCH whose body has the line `take off:
 *                       <n> bytes`, the bytes to take off. A second overrun in
 *                       a row restores those paths to HEAD, commits nothing
 *                       and notes `<n> bytes over the limit` in the
 *                       outcome. Only the reported node files are committed.
 *                       The suggestions reach the outcome on every return.
 *                       A file of `before` is the user's: never measured,
 *                       listed as `W`, restored, removed or committed; a
 *                       reported one is noted as not committed and its edit
 *                       stays in the tree. The same holds for rules.
 *              rules  : beside memory, not with `build.rules: false`. A
 *                       changed path that a rule under .claude/rules/ covers
 *                       (its `paths:` globs, lib/build-rules.ts) sends the
 *                       rules writer: a DISPATCH whose body has the line
 *                       `rules notes: <path>`, the file its notes go to. None
 *                       matches: no dispatch. The net growth in bytes of
 *                       .claude/rules/viber/ against HEAD (lib/build-growth.ts)
 *                       is held to 200 bytes a build.
 *                       Over it, the first return is sent back once, on a
 *                       counter of its own: a DISPATCH whose body has the line
 *                       `take off: <n> bytes`, the bytes to take off. A second
 *                       overrun in a row restores the files of that directory
 *                       outside `before` to HEAD,
 *                       commits nothing and notes
 *                       `<n> bytes over the limit` in the outcome. On `UPDATED`,
 *                       each reported file of length 0 under .claude/rules/viber/
 *                       is removed, then that directory once no entry is left
 *                       (a rule the writer left with no convention). Only the
 *                       reported files under that directory that existed at HEAD
 *                       are committed, removals included; every other path is
 *                       noted as not committed. The notes reach the outcome on
 *                       every return.
 *              qa     : beside memory, only with `build.qa: true`. The body
 *                       names `spec:`, `notes:`, `changes:`, `refs:` and `out:`
 *                       (<spec dir>). On `WRITTEN`, the reported <spec dir>/qa.md
 *                       and qa.e2e.md are committed; on `NONE` nothing; any
 *                       other word is noted in the outcome. Never sent back.
 *                       With an issue, a reported qa.md that HEAD holds as it
 *                       stands after that commit is posted to it as one
 *                       comment: `gh issue view <issue> --json comments`, then,
 *                       when no comment holds the marker `<!-- viber:qa
 *                       <repo-relative path of qa.md> -->` (a resumed run),
 *                       `gh issue comment <issue> --body-file` with that marker
 *                       line, then qa.md verbatim. qa.e2e.md is never posted.
 *                       No issue: nothing posted, nothing noted. No gh, or gh
 *                       exiting non-zero: one outcome line with the cause,
 *                       never retried, the build goes on.
 *   stderr : one line naming the cause when the exit is 2, the usage on a call
 *            that matches neither form.
 *   exit   : 0 with blocks on stdout; 2 on bad usage, an unreadable plan, spec
 *            or state, a plan with no `Spec:` line or no task, an event before
 *            start, changes from base that git cannot read (a base the
 *            repository lacks: the call writes no state, its stderr line
 *            names the remedy), or a lock another call holds past 90 seconds
 *            (stdout empty). Any call on a run already archived: its spec is
 *            gone from <spec dir>. While the archive is uncommitted (a call
 *            killed in the archive commit), the stderr line names the two
 *            directories to commit.
 */

import path from "node:path";
import { projectTree } from "../../planner/scripts/lib/adapters/tree.ts";
import { nodeFs } from "./lib/adapters/fs.ts";
import { ghCommand } from "./lib/adapters/gh.ts";
import { gitCommand } from "./lib/adapters/git.ts";
import { runBuild } from "./lib/build-run.ts";

// The plugin's shared references, three directories above this file.
const refs = path.resolve(import.meta.dirname, "../../../references").replaceAll("\\", "/");
const result = runBuild(process.argv.slice(2), process.cwd(), refs, { fs: nodeFs, git: gitCommand, gh: ghCommand, tree: projectTree });
process.stdout.write(result.stdout);
process.stderr.write(result.stderr);
process.exitCode = result.exit;
