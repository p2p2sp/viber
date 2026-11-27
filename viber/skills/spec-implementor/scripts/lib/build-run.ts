/*
 * build-run.ts - one call of build.ts: reads argv, takes the run's lock, routes
 * the event to the task or the close step that awaits it and prints the blocks.
 * The contract lives in the header of ../build.ts.
 */

import { orderOf } from "../../../planner/scripts/lib/plan-order.ts";
import { parsePlan } from "../../../planner/scripts/lib/plan-parse.ts";
import type { Tree } from "../../../planner/scripts/lib/ports.ts";
import { landRecords } from "./build-adr.ts";
import { BaseUnreadable, closeEvent, closeStep } from "./build-close.ts";
import { configPath, directoriesOf } from "./build-config.ts";
import { cutTask, MOCKUP, readSpec } from "./build-cut.ts";
import { listOf } from "./build-list.ts";
import { commitRun, freshClose, freshTask, inRepo, leftOf, rel, save, under, type Ctx, type State } from "./build-state.ts";
import { dispatchReady, finishCommits, taskEvent, tasksInFlight } from "./build-tasks.ts";
import type { Fs, Gh, Git } from "./ports.ts";

// A call waits this long for the one before it: a commit whose hooks run the linter holds the lock for a while.
const LOCK_WAIT_MS = 90_000;
// The lines of a refused commit's output kept in the outcome: the cause stands at its top.
const REFUSAL_LINES = 20;

const USAGE = ["usage: build.sh <plan> start", "       build.sh <plan> <id> <WORD> [<FILES>]"].join("\n");

export interface Result {
  stdout: string;
  stderr: string;
  exit: number;
}

interface Ports {
  fs: Fs;
  git: Git;
  gh: Gh;
  tree: Tree;
}

const refuse = (text: string): Result => ({ stdout: "", stderr: `${text}\n`, exit: 2 });
const unreadable = (base: string): Result => refuse(`build.sh: cannot read the changes from ${base}: fetch that commit (git fetch --unshallow in a shallow clone), then call again`);
const isAbsolute = (path: string): boolean => path.startsWith("/") || /^[A-Za-z]:/.test(path);
const ended = (lines: string[]): Result => ({ stdout: `${["END", ...lines].join("\n")}\n`, stderr: "", exit: 0 });

/** The blocks of the call: END once the run is closed, else the task-list entries it changed, then its dispatches or WAIT. */
function printed(ctx: Ctx, list: string[]): Result {
  if (ctx.out.length === 0 && ctx.state.close.step === "end") return ended(ctx.state.close.end);
  const tasks = list.length === 0 ? [] : [["TASKS", ...list].join("\n")];
  const blocks = ctx.out.map((block) => [`DISPATCH: ${block.agent} | id: ${block.id}${block.model === "" ? "" : ` | model: ${block.model}`}`, ...block.lines].join("\n"));
  return { stdout: `${[...tasks, ...(blocks.length === 0 ? ["WAIT"] : blocks)].join("\n\n")}\n`, stderr: "", exit: 0 };
}

/** One call of build.ts. Never throws. */
export function runBuild(argv: string[], rawCwd: string, refs: string, ports: Ports): Result {
  const { fs, git, gh, tree } = ports;
  const starting = argv.length === 2 && argv[1] === "start";
  if (!starting && argv.length !== 3 && argv.length !== 4) return refuse(USAGE);
  const cwd = rawCwd.replaceAll("\\", "/").replace(/\/$/, "");
  const root = tree.root(cwd);

  const slashed = argv[0].replaceAll("\\", "/");
  const given = isAbsolute(slashed) ? [slashed] : [`${cwd}/${slashed}`, `${root}/${slashed}`];
  const planPath = given.find((path) => fs.readText(path) !== null);
  if (planPath === undefined) return refuse(`build.sh: cannot read the plan ${argv[0]}`);
  const landed = fs.readText(planPath) ?? "";
  const specLine = /^Spec:[ \t]*(\S.*?)\s*$/m.exec(landed);
  if (specLine === null) return refuse(`build.sh: ${argv[0]} holds no 'Spec: <path>' line: it is no landed plan`);
  // The run's issue, as plan.sh land writes it: `#<n>` or an issue link; anything else, a pull request link included, is none.
  const issueLine = /^Issue:[ \t]*(\S.*?)\s*$/m.exec(landed)?.[1] ?? "";
  const issue = /^#?\d+$/.test(issueLine) ? issueLine.replace(/^#/, "") : /^https:\/\/github\.com\/[^/\s]+\/[^/\s]+\/issues\/\d+$/.test(issueLine) ? issueLine : null;
  const spec = isAbsolute(specLine[1]) ? specLine[1].replaceAll("\\", "/") : `${root}/${specLine[1].replace(/^\.\//, "")}`;
  const specDir = spec.slice(0, spec.lastIndexOf("/"));
  // The run is named by the directory holding the spec, as the planner names its work files.
  const name = specDir.slice(specDir.lastIndexOf("/") + 1);
  const work = `${specDir}/work`;
  // The lock names a process of this machine: it stays out of the run directory, which is committed.
  const lock = `${root}/.temp/viber/${name}/lock`;
  // A run archived at its close left this place with its spec: the call writes nothing.
  const specText = fs.readText(spec);
  if (specText === null) {
    // A call killed in the archive commit left no state to finish from: the line names what to commit.
    const { runs, specifications } = directoriesOf(fs.readText(configPath(root)));
    const [from, archive] = [`docs/${runs}/${name}`, `docs/${specifications}/${name}`];
    if (specDir === `${root}/${from}` && fs.exists(`${root}/${archive}/spec.md`) && git.dirty(root, [from, archive]).length > 0)
      return refuse(`build.sh: the run is archived at ${archive}, the archive commit did not finish: commit ${from} and ${archive}`);
    return refuse(`build.sh: cannot read the spec ${spec}`);
  }

  if (!fs.lock(lock, LOCK_WAIT_MS)) return refuse(`build.sh: another call holds ${lock}`);
  try {
    let state: State | null = null;
    try {
      state = JSON.parse(fs.readText(`${work}/state.json`) ?? "null");
    } catch {
      return refuse(`build.sh: cannot read ${work}/state.json`);
    }
    if (!starting && state === null) return refuse(`build.sh: no run of this plan: call 'build.sh <plan> start' first`);

    const copy = `${specDir}/plan.md`;
    if (starting && planPath !== copy && !fs.writeText(copy, landed)) return refuse(`build.sh: cannot write ${copy}`);
    const plan = parsePlan(fs.readText(copy) ?? landed);
    if (plan.tasks.length === 0) return refuse(`build.sh: ${argv[0]} holds no task`);

    let listed: string[] | null = null;
    const ctx: Ctx = {
      root,
      name,
      work,
      specDir,
      refs,
      // A landed plan opens with the hand-off line, so its title is the first `# ` heading, not the first line.
      title: /^# +(\S.*?)\s*$/m.exec(landed)?.[1] ?? name,
      issue,
      tasks: plan.tasks,
      state: state ?? { base: "", tasks: {}, close: freshClose(0) },
      out: [],
      files: () => (listed ??= tree.files(root)),
      fs,
      git,
      gh,
      tree,
    };

    // A start lists every entry: the session it runs in holds none of them.
    let before = starting ? [] : listOf(ctx);

    if (starting) {
      const head = git.head(root);
      if (head === null) return refuse(`build.sh: ${root} is no git repository with a commit`);
      if (ctx.state.base === "") {
        ctx.state.base = head;
        ctx.state.before = leftOf(ctx);
      }

      // A task that is done stays done (its commit finished below when its call died in it); every other starts over, which resumes a run and retries its held tasks.
      const order = orderOf(plan.tasks, ctx.files());
      const tasks: State["tasks"] = {};
      for (const task of plan.tasks) {
        const before = ctx.state.tasks[String(task.num)];
        const after = order.after.get(task.num) ?? [];
        tasks[String(task.num)] = before?.state === "done" ? { ...before, after } : freshTask(after, before?.seq ?? 0);
      }
      // Read before any write: the done tasks' commits are finished from it once the task files are cut.
      const read = git.log(root, ctx.state.base);
      if (read === null) return unreadable(ctx.state.base);
      ctx.state.tasks = tasks;
      const allDone = plan.tasks.every((task) => tasks[String(task.num)].state === "done");
      // A close resumed mid-way re-enters its step; a fix step goes back to the check that writes its fix file.
      const step = ctx.state.close.step === "final-fix" ? "final-review" : ctx.state.close.step === "test-fix" ? "tests" : ctx.state.close.step;
      ctx.state.close = allDone ? { ...ctx.state.close, step, open: [] } : freshClose(ctx.state.close.seq);

      for (const dir of ["tasks", "diff", "review", "fix", "blocked"]) fs.remove(`${work}/${dir}`);
      const cut = readSpec(specText);
      const mockup = fs.exists(`${specDir}/${MOCKUP}`) ? rel(ctx, `${specDir}/${MOCKUP}`) : null;
      for (const task of plan.tasks) fs.writeText(`${work}/tasks/T${task.num}.md`, cutTask(task, plan.tasks, cut, mockup));
      // The run directory is committed once, before the records: a state.json at HEAD means an earlier start committed it.
      const dir = rel(ctx, specDir);
      if (inRepo(ctx) && git.sizeAtHead(root, `${dir}/work/state.json`) === null) {
        const done = commitRun(ctx, `chore(viber): start ${name}`, [dir], () => true);
        if (done.kind === "refused") ctx.state.close.notes.push(`- run directory | git refused the commit, ${dir} is left uncommitted`, ...under(done.output).slice(0, REFUSAL_LINES));
      }
      landRecords(ctx, landed);
      // The commit of a task carries the state written before its sha was known; a call killed in that commit left the task done with none.
      // The diff, review, fix and blocked files are cleared above: a commit finished here carries the task's notes alone.
      finishCommits(ctx, read.split("\n"));
    } else {
      // Checked before the event: a task or close commit would save state before the close reads the changes.
      if (git.changes(root, ctx.state.base) === null) return unreadable(ctx.state.base);
      const read = git.log(root, ctx.state.base);
      if (read === null) return unreadable(ctx.state.base);
      // Before the event: a call killed in a task's commit left the task done with no commit, and its event never comes again.
      // That call printed no entry for the task: its line is printed now, whatever the saved state held.
      const finished = finishCommits(ctx, read.split("\n"));
      before = before.filter((line) => !finished.some((num) => new RegExp(`^\\S+ \\| T${num}( \\[TDD\\])? - `).test(line)));
      const id = argv[1].trim();
      const word = argv[2].trim().toUpperCase();
      const owner = /^T(\d+)\./.exec(id);
      if (owner) taskEvent(ctx, Number(owner[1]), id, word, argv[3] ?? "");
      else closeEvent(ctx, id, word, argv[3] ?? "");
    }

    dispatchReady(ctx);
    if (ctx.out.length === 0 && !tasksInFlight(ctx)) closeStep(ctx);

    // A run closed in full inside the repository is cleaned and archived: a write would bring its work directory back.
    const archived = ctx.state.close.step === "end" && !ctx.state.close.partial && inRepo(ctx);
    if (!archived && !save(ctx)) return refuse(`build.sh: cannot write ${work}/state.json`);
    return printed(ctx, listOf(ctx).filter((line) => !before.includes(line)));
  } catch (error) {
    if (error instanceof BaseUnreadable) return unreadable(error.message);
    throw error;
  } finally {
    fs.unlock(lock);
  }
}
