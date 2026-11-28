/*
 * simple-run.ts - one call of simple.ts: reads argv, routes the return to the
 * step that awaits it, sends the next step and prints the blocks. The contract
 * lives in the header of ../simple.ts.
 */

import { isMemoryFile } from "../../../memory/scripts/lib/memory-file.ts";
import type { Tree } from "../../../planner/scripts/lib/ports.ts";
import { removeEmptied } from "../../../spec-implementor/scripts/lib/build-close.ts";
import { configPath, rulesOn } from "../../../spec-implementor/scripts/lib/build-config.ts";
import { MEMORY_LIMIT, RULES_LIMIT, growthOf, memoryPaths, rulesPaths } from "../../../spec-implementor/scripts/lib/build-growth.ts";
import { VIBER_DIR, matchingRules } from "../../../spec-implementor/scripts/lib/build-rules.ts";
import { under, type Ctx as BuildCtx } from "../../../spec-implementor/scripts/lib/build-state.ts";
import { readFiles } from "../../../spec-implementor/scripts/lib/build-tasks.ts";
import type { Fs, Git } from "../../../spec-implementor/scripts/lib/ports.ts";
import { changePaths, commitLine, leftLines, listable, pathsOf, runDirty } from "./simple-commit.ts";
import { listOf } from "./simple-list.ts";
import { parseStages, type Stage } from "./simple-stages.ts";
import { freshState, type State } from "./simple-state.ts";

const CODER = "viber:simple-coder";
const TESTS_GOAL = "goal: run the full test suite once and fix what the change broke";
const FIX_GOAL = "goal: fix every finding except the nit ones, then run the full test suite once";
const STOPPED = "The run stopped: its open step is not committed.";

const USAGE = ["usage: simple.sh <plan> <session-id> start", "       simple.sh <plan> <session-id> resume [<answer>]", "       simple.sh <plan> <session-id> <id> <WORD> [<FILES>]"].join("\n");

export interface Result {
  stdout: string;
  stderr: string;
  exit: number;
}

interface Ports {
  fs: Fs;
  git: Git;
  tree: Tree;
}

interface Block {
  head: string;
  lines: string[];
}

interface Ctx {
  root: string;
  plan: string;
  stages: Stage[];
  /** <root>/.temp/viber/<session-id>/simple */
  dir: string;
  /** The review file under <root>/.temp/viber/<session-id>/code-review/. */
  review: string;
  state: State;
  fs: Fs;
  git: Git;
  /** The files of the tree. */
  files: () => string[];
  out: Block[];
}

const refuse = (text: string): Result => ({ stdout: "", stderr: `${text}\n`, exit: 2 });
const isAbsolute = (path: string): boolean => path.startsWith("/") || /^[A-Za-z]:/.test(path);
const changedFile = (ctx: Ctx): string => `${ctx.dir}/changed.md`;
const deviationsFile = (ctx: Ctx): string => `${ctx.dir}/deviations.md`;
const lines = (text: string | null): string[] => (text ?? "").split(/\r?\n/).filter((line) => line.trim() !== "");

/** The blocked file of the step in flight: each dispatch of one step shares it, so a later coder reads the earlier reason and the user's decision on it. */
function blockedFile(ctx: Ctx): string {
  const { step, stage } = ctx.state;
  return `${ctx.dir}/blocked/${step === "stage" ? `stage${ctx.stages[stage].num}` : step}.md`;
}

/** Prints the block of the step in flight under a new id and awaits that id. */
function send(ctx: Ctx): void {
  const { state } = ctx;
  state.seq += 1;
  const stage = ctx.stages[state.stage];
  state.open = `${state.step === "stage" ? `stage${stage.num}` : state.step}.${state.seq}`;
  if (state.step === "review") {
    ctx.out.push({
      head: `SKILL: code-review | id: ${state.open}`,
      // The stages are committed by now: the review is told where the change starts.
      lines: [`review the diff that git diff ${state.base} prints (the commits of the run and the work tree), write the result to one markdown file at ${ctx.review}, each finding with its severity (important, pre_existing or nit), and return only the number of findings and the number of them that are not nit`],
    });
    return;
  }
  const common = [`changed: ${changedFile(ctx)}`, `blocked: ${blockedFile(ctx)}`, `deviations: ${deviationsFile(ctx)}`];
  const body =
    state.step === "stage" ? [`plan: ${ctx.plan}`, `stage: ${stage.num}`, ...common] : state.step === "tests" ? [...common, TESTS_GOAL] : [...common, `findings: ${ctx.review}`, FIX_GOAL];
  ctx.out.push({ head: `DISPATCH: ${CODER} | id: ${state.open}`, lines: body });
}

/** Adds the paths of a return's FILES to the changed file: repo-relative, once each, none under .temp/. */
function addChanged(ctx: Ctx, files: string): void {
  const known = lines(ctx.fs.readText(changedFile(ctx)));
  for (const path of pathsOf(ctx.root, files)) if (!known.includes(path)) known.push(path);
  ctx.fs.writeText(changedFile(ctx), known.map((path) => `${path}\n`).join(""));
}

/** The END lines every end carries before those of the commits: what ran and what it gave. */
function summary(ctx: Ctx): string[] {
  const { state } = ctx;
  const out = [`Stages done: ${state.stage} of ${ctx.stages.length}.`];
  const broken = lines(ctx.fs.readText(deviationsFile(ctx)));
  if (broken.length > 0) out.push("Assumed in the plan, broken by the build:", ...broken.map((line) => `  ${line.trim()}`));
  if (state.tested) out.push("The full test suite ran once and what the change broke was fixed.");
  if (state.review === "lost") out.push(`The review gave no numbers, so no finding was fixed. Review file: ${ctx.review}`);
  else if (state.review !== null) {
    out.push(`Review findings: ${state.review.count}, not nit: ${state.review.notNit}. Review file: ${ctx.review}`);
    if (state.review.notNit === 0) out.push("No finding needed a fix.");
    else if (state.fixed) out.push("The findings were fixed, except the nit ones, and the full test suite ran once more.");
    else out.push("The findings were not fixed.");
  }
  out.push(...state.notes);
  return out;
}

/** Ends the run: the lines under END, the last ones naming the commits and what still differs from HEAD. `stopped`: a coder blocked or lost twice, its step left uncommitted. */
function finish(ctx: Ctx, head: string[], stopped = false): void {
  const { state } = ctx;
  const made = stopped ? [...state.committed, STOPPED] : state.committed.length === 0 ? ["Nothing to commit."] : state.committed;
  const left = leftLines(runDirty(ctx.git.dirty(ctx.root, ["."])), state.before, lines(ctx.fs.readText(changedFile(ctx))), state.handed);
  state.end = [...head, ...summary(ctx), ...made, ...left];
  state.step = "end";
  state.open = "";
}

/** A writer held to a limit of net growth: the differences between the memory and the rules writer, as data. */
interface Writer {
  name: "memory" | "rules";
  agent: string;
  limit: number;
  /** The paths it may write that differ from HEAD, none of `before`. */
  paths: (build: BuildCtx) => string[];
  /** True for a path of its kind: the part of `kept` it is measured and restored on. */
  owns: (path: string) => boolean;
  /** Its notes file in <dir> and the END line heading its lines. */
  notes: string;
  header: string;
  /** What its files are called in the restore lines. */
  what: string;
  brief: (ctx: Ctx) => string[];
  /** True for a reported path it may write. */
  may: (ctx: Ctx, path: string) => boolean;
}

const MEMORY: Writer = {
  name: "memory",
  agent: "viber:memory-writer",
  limit: MEMORY_LIMIT,
  paths: memoryPaths,
  owns: isMemoryFile,
  notes: "suggest.md",
  header: "- memory | suggested for the root CLAUDE.md:",
  what: "nodes",
  brief: (ctx) => [`spec: ${ctx.plan}`, `changes: ${ctx.dir}/memory-changes.md`, `suggest: ${ctx.dir}/suggest.md`],
  may: (_ctx, path) => isMemoryFile(path),
};

const RULES: Writer = {
  name: "rules",
  agent: "viber:rules-writer",
  limit: RULES_LIMIT,
  paths: rulesPaths,
  owns: (path) => path.startsWith(VIBER_DIR),
  notes: "rules.md",
  header: "- rules | notes:",
  what: "rules",
  brief: (ctx) => [`spec: ${ctx.plan}`, `changes: ${ctx.dir}/rules-changes.md`, `rules notes: ${ctx.dir}/rules.md`],
  // Only the plugin's own rule files that exist at HEAD.
  may: (ctx, path) => path.startsWith(VIBER_DIR) && ctx.git.sizeAtHead(ctx.root, path) !== null,
};

/** The part of the build's Ctx the reused build modules read: root, files(), fs, git and `state.before`, so ownDirty leaves the user's files out of every measure, `W` list and restore. */
const buildCtx = (ctx: Ctx): BuildCtx => ({ root: ctx.root, files: ctx.files, fs: ctx.fs, git: ctx.git, state: { before: ctx.state.before } }) as unknown as BuildCtx;

const snapshotOf = (ctx: Ctx, path: string): string => `${ctx.dir}/kept/${path}`;
const goneAtEntry = (ctx: Ctx, path: string): boolean => (ctx.state.gone ?? []).includes(path);

/** A `kept` path's text on entering the writers step, null when it was absent. */
const entryText = (ctx: Ctx, path: string): string | null => (goneAtEntry(ctx, path) ? null : ctx.fs.readText(snapshotOf(ctx, path)));

/** True when a writer changed the path: a `kept` one against its entry snapshot, any other against HEAD. */
const touched = (ctx: Ctx, path: string): boolean => !ctx.state.kept.includes(path) || ctx.fs.readText(`${ctx.root}/${path}`) !== entryText(ctx, path);

/** The writer's files that changed since entering the writers step, none of `before`. */
function writtenBy(ctx: Ctx, writer: Writer): string[] {
  const dirty = writer.paths(buildCtx(ctx)).map((path) => path.replaceAll("\\", "/"));
  return [...new Set([...dirty, ...ctx.state.kept.filter(writer.owns)])].filter((path) => touched(ctx, path));
}

/** The net growth of the paths since entering the writers step: against HEAD, less what each `kept` one had grown from HEAD by then. */
function growthSinceEntry(ctx: Ctx, paths: string[]): number {
  let atEntry = 0;
  for (const path of paths.filter((each) => ctx.state.kept.includes(each))) {
    atEntry += Buffer.byteLength(entryText(ctx, path) ?? "", "utf8") - (ctx.git.sizeAtHead(ctx.root, path) ?? 0);
  }
  return growthOf(buildCtx(ctx), paths) - atEntry;
}

/** Sends a writer; `over`, the bytes of a first overrun, makes it the retry, its earlier writes listed as `W`. Its own list file, so a retry never rewrites the other's input. */
function sendWriter(ctx: Ctx, writer: Writer, over = 0): void {
  const { state } = ctx;
  const written = over > 0 ? writtenBy(ctx, writer).map((path) => `W\t${path}`) : [];
  ctx.fs.writeText(`${ctx.dir}/${writer.name}-changes.md`, [...state.listed, ...written].map((line) => `${line}\n`).join(""));
  ctx.fs.remove(`${ctx.dir}/${writer.notes}`);
  state.seq += 1;
  const id = `${writer.name}.${state.seq}`;
  state.waiting.push(id);
  ctx.out.push({ head: `DISPATCH: ${writer.agent} | id: ${id}`, lines: [...writer.brief(ctx), ...(over > 0 ? [`take off: ${over} bytes`] : [])] });
}

/**
 * The place between the last code-changing step and the end: sends the memory writer when the change list is not
 * empty and the rules writer when `build.rules` is not `false` and a changed path matches a rule; neither, their commit.
 */
function writers(ctx: Ctx): void {
  const { state } = ctx;
  state.step = "writers";
  state.open = "";
  // What a coder of this run changed and no commit took is still dirty: snapshotted, so each writer is measured and restored from here.
  const build = buildCtx(ctx);
  state.kept = [...new Set([...memoryPaths(build), ...rulesPaths(build)].map((path) => path.replaceAll("\\", "/")))];
  state.gone = [];
  for (const path of state.kept) {
    const text = ctx.fs.readText(`${ctx.root}/${path}`);
    if (text === null) state.gone.push(path);
    else ctx.fs.writeText(snapshotOf(ctx, path), text);
  }
  const reported = lines(ctx.fs.readText(changedFile(ctx)));
  const status = (path: string): string => (!ctx.fs.exists(`${ctx.root}/${path}`) ? "D" : ctx.git.sizeAtHead(ctx.root, path) === null ? "A" : "M");
  // What the commits of the run hold, then what still differs from HEAD.
  const committed = lines(ctx.git.changes(ctx.root, state.base));
  const held = committed.flatMap((line) => line.split("\t").slice(1));
  const dirty = ctx.git
    .dirty(ctx.root, ["."])
    .map((path) => path.replaceAll("\\", "/"))
    .filter((path) => !path.startsWith(".temp/") && !held.includes(path) && (!state.before.includes(path) || reported.includes(path)))
    .map((path) => `${status(path)}\t${path}`);
  state.listed = [...committed, ...dirty];
  if (state.listed.length > 0) sendWriter(ctx, MEMORY);
  if (rulesOn(ctx.fs.readText(configPath(ctx.root))) && matchingRules(build, state.listed.join("\n")).length > 0) sendWriter(ctx, RULES);
  if (state.waiting.length === 0) commitWriters(ctx);
}

/** A writer's return. Over its limit, it is sent back once, on its own counter; a second overrun restores its files, a `kept` one to its entry snapshot, any other to HEAD. Once none is awaited, their commit. */
function writerEvent(ctx: Ctx, id: string, word: string, value: string): void {
  const { state } = ctx;
  state.waiting = state.waiting.filter((each) => each !== id);
  const writer = id.startsWith("memory.") ? MEMORY : RULES;
  const name = writer.name;
  const note = (...noted: string[]): void => void state.notes.push(...noted);
  const noted = under(ctx.fs.readText(`${ctx.dir}/${writer.notes}`) ?? "");
  if (noted.length > 0) note(writer.header, ...noted);
  const build = buildCtx(ctx);
  const paths = writtenBy(ctx, writer);
  const over = growthSinceEntry(ctx, paths) - writer.limit;
  if (over > 0 && state.overruns[name] === 0) {
    state.overruns[name] = 1;
    note(`- ${name} | ${over} bytes over the limit, the writer dispatched once more`);
    return sendWriter(ctx, writer, over);
  }
  if (over > 0) {
    const kept = paths.filter((path) => state.kept.includes(path));
    const head = paths.filter((path) => !state.kept.includes(path));
    note(
      kept.length === 0
        ? `- ${name} | ${over} bytes over the limit after the retry, the ${writer.what} are restored to HEAD, any changed before the writers ran left as they are`
        : `- ${name} | ${over} bytes over the limit after the retry, the ${writer.what} are restored to HEAD, those a coder of this run changed to their state before the writers, any changed before the run left as they are`,
    );
    if (head.length > 0 && !ctx.git.restore(ctx.root, head)) note(`- ${name} | restore to HEAD failed, the ${writer.what} are left in the tree`);
    let failed = false;
    for (const path of kept) {
      const text = entryText(ctx, path);
      if (goneAtEntry(ctx, path)) ctx.fs.remove(`${ctx.root}/${path}`);
      else if (text === null || !ctx.fs.writeText(`${ctx.root}/${path}`, text)) failed = true;
    }
    if (failed) note(`- ${name} | restore to the state before the writers failed, the ${writer.what} are left in the tree`);
  } else if (word === "UPDATED") {
    const files = readFiles(build, value);
    const own = files.paths.filter((path) => !state.before.includes(path));
    // A rule file emptied to zero bytes is removed, then its directory once empty.
    if (name === "rules") removeEmptied(build, own);
    const mine = own.filter((path) => writer.may(ctx, path));
    const left = [...files.bad, ...own.filter((path) => !writer.may(ctx, path))];
    if (mine.length > 0) note(`- ${name} | updated | ${mine.join(", ")}`);
    if (left.length > 0) note(`- ${name} | left in the tree, outside what this step may write | ${left.join(", ")}`);
  } else if (word === "NONE") note(`- ${name} | nothing to update`);
  else note(`- ${name} | the writer returned ${word}`);
  if (state.waiting.length === 0) commitWriters(ctx);
}

const SUBJECT = { tests: "The fixes of the full test run are", fix: "The fix of the findings is", commit: "The writers' files are" };

/** Asks the commit skill for the commit of the step in flight, the paths as the skill's arguments. */
function sendCommit(ctx: Ctx, paths: string[]): void {
  const { state } = ctx;
  state.seq += 1;
  state.open = `commit.${state.seq}`;
  state.head = ctx.git.head(ctx.root) ?? "";
  state.commit = paths;
  state.handed.push(...paths.filter((path) => !state.handed.includes(path)));
  ctx.out.push({ head: `SKILL: viber:commit | id: ${state.open}`, lines: [paths.join(" ")] });
}

/**
 * A coder step returned `DONE`: the commit of what the run's coders left in the tree (the dirty paths a coder reported,
 * none of `before`), so a path an earlier commit did not take rides along. No such path: the next step at once.
 */
function commitStep(ctx: Ctx): void {
  const paths = changePaths(runDirty(ctx.git.dirty(ctx.root, ["."])), ctx.state.before, lines(ctx.fs.readText(changedFile(ctx))), []);
  if (paths.length === 0) advance(ctx);
  else sendCommit(ctx, paths);
}

/** The place between the writers and the end: the commit of the files the writers wrote and may write. No such file: the end. */
function commitWriters(ctx: Ctx): void {
  ctx.state.step = "commit";
  const written = [...writtenBy(ctx, MEMORY), ...writtenBy(ctx, RULES).filter((path) => RULES.may(ctx, path))].filter(listable);
  if (written.length === 0) finish(ctx, []);
  else sendCommit(ctx, written);
}

/** The commit skill's return, whatever it says: the commit is made when HEAD moved. Then the step after the one it closes, or the end. */
function commitEvent(ctx: Ctx): void {
  const { state } = ctx;
  const subject = state.step === "stage" ? `Stage ${ctx.stages[state.stage].num} is` : SUBJECT[state.step as keyof typeof SUBJECT];
  state.committed.push(commitLine(subject, state.head ?? "", ctx.git.head(ctx.root)));
  delete state.commit;
  if (state.step === "commit") finish(ctx, []);
  else advance(ctx);
}

/** A coder step is closed, its commit returned or not needed: the next stage, the full test run, the review, or after the fix the writers. */
function advance(ctx: Ctx): void {
  const { state } = ctx;
  if (state.step === "fix") {
    state.fixed = true;
    return writers(ctx);
  }
  if (state.step === "tests") {
    state.tested = true;
    state.step = "review";
  } else {
    state.stage += 1;
    if (state.stage === ctx.stages.length) state.step = "tests";
  }
  send(ctx);
}

/** A coder's `BLOCKED`, or its second lost return in a row: the run ends with what its blocked file holds and keeps the step, so `resume` reopens it. */
function stop(ctx: Ctx, blocked: boolean): void {
  const { state } = ctx;
  const step = state.step as "stage" | "tests" | "fix";
  const what = step === "stage" ? `Stage ${ctx.stages[state.stage].num}` : step === "tests" ? "The full test run" : "The fix of the findings";
  const reason = lines(ctx.fs.readText(blockedFile(ctx)));
  finish(ctx, [blocked ? `${what} is blocked.` : `${what} did not finish after a second try.`, ...(reason.length === 0 ? ["No reason was written."] : reason)], true);
  state.stopped = step;
}

/** Reopens a stopped run at the step that stopped it: the user's answer joins the step's blocked file, the block goes out under a new id. False when the answer could not be written. */
function resume(ctx: Ctx, answer: string): boolean {
  const { state } = ctx;
  state.step = state.stopped ?? "stage";
  delete state.stopped;
  state.tries = 0;
  state.end = [];
  const decision = answer.replace(/\s+/g, " ").trim();
  if (decision !== "") {
    const held = ctx.fs.readText(blockedFile(ctx)) ?? "";
    if (!ctx.fs.writeText(blockedFile(ctx), `${held}${held === "" || held.endsWith("\n") ? "" : "\n"}Decision: ${decision}\n`)) return false;
  }
  send(ctx);
  return true;
}

/** The awaited return: its word moves the run on. */
function event(ctx: Ctx, id: string, word: string, value: string): void {
  const { state } = ctx;
  if (state.commit !== undefined) return commitEvent(ctx);
  if (state.step === "writers") return writerEvent(ctx, id, word, value);
  if (state.step === "review") {
    const numbers = word === "FOUND" ? /^(\d+)\s+(\d+)$/.exec(value.trim()) : null;
    state.review = numbers === null ? "lost" : { count: Number(numbers[1]), notNit: Number(numbers[2]) };
    if (state.review !== "lost" && state.review.notNit > 0) {
      state.step = "fix";
      send(ctx);
    } else writers(ctx);
    return;
  }
  addChanged(ctx, value);
  if (word !== "DONE") {
    // `BLOCKED` waits for a decision, which no second try brings; a lost return is tried once more.
    state.tries += 1;
    if (word !== "BLOCKED" && state.tries < 2) send(ctx);
    else stop(ctx, word === "BLOCKED");
    return;
  }
  state.tries = 0;
  commitStep(ctx);
}

/** One call of simple.ts. Never throws. */
export function runSimple(argv: string[], rawCwd: string, ports: Ports): Result {
  const { fs, git, tree } = ports;
  const starting = argv.length === 3 && argv[2] === "start";
  // No id is `resume`: the word tells its call from a return of four arguments.
  const resuming = (argv.length === 3 || argv.length === 4) && argv[2] === "resume";
  if (!starting && !resuming && argv.length !== 4 && argv.length !== 5) return refuse(USAGE);
  const session = argv[1].trim();
  if (!/^[A-Za-z0-9._-]+$/.test(session) || /^\.+$/.test(session)) return refuse(`simple.sh: ${argv[1]} is no session id`);
  const cwd = rawCwd.replaceAll("\\", "/").replace(/\/$/, "");
  const root = tree.root(cwd);

  const slashed = argv[0].replaceAll("\\", "/");
  const plan = isAbsolute(slashed) ? slashed : `${cwd}/${slashed}`;
  const text = fs.readText(plan);
  if (text === null) return refuse(`simple.sh: cannot read the plan ${argv[0]}`);
  const stages = parseStages(text);
  if (stages.length === 0) return refuse(`simple.sh: ${argv[0]} holds no stage heading '## <n>. <goal>'`);

  const dir = `${root}/.temp/viber/${session}/simple`;
  const stateFile = `${dir}/state.json`;
  const review = `${root}/.temp/viber/${session}/code-review/review.md`;
  let state: State | null = null;
  if (starting) {
    const base = git.head(root);
    if (base === null) return refuse(`simple.sh: ${root} is no git repository with a commit`);
    // No resume: a start clears what an earlier run of this session left.
    fs.remove(dir);
    fs.remove(review);
    state = freshState(git.dirty(root, ["."]).map((path) => path.replaceAll("\\", "/")).filter((path) => !path.startsWith(".temp/")), base);
    if (!fs.writeText(`${dir}/changed.md`, "")) return refuse(`simple.sh: cannot write ${dir}/changed.md`);
  } else {
    try {
      state = JSON.parse(fs.readText(stateFile) ?? "null");
    } catch {
      return refuse(`simple.sh: cannot read ${stateFile}`);
    }
    if (state === null) return refuse(`simple.sh: no run of this session: call 'simple.sh <plan> <session-id> start' first`);
  }

  const ctx: Ctx = { root, plan, stages, dir, review, state, fs, git, files: () => tree.files(root), out: [] };
  // A start lists every entry: the session holds none of them.
  const rules = rulesOn(fs.readText(configPath(root)));
  // A resume too: the END of the stop cleared them.
  const reopening = resuming && state.step === "end" && state.stopped !== undefined;
  const before = starting || reopening ? [] : listOf(state, stages, rules);
  if (starting) send(ctx);
  else if (reopening) {
    if (!resume(ctx, argv[3] ?? "")) return refuse(`simple.sh: cannot write ${blockedFile(ctx)}`);
  } else if (!resuming) {
    const id = argv[2].trim();
    if (state.step === "writers" ? state.waiting.includes(id) : state.step !== "end" && id === state.open) event(ctx, id, argv[3].trim().toUpperCase(), argv[4] ?? "");
  }

  if (!fs.writeText(stateFile, `${JSON.stringify(state, null, 2)}\n`)) return refuse(`simple.sh: cannot write ${stateFile}`);
  if (state.step === "end") return { stdout: `${["END", ...state.end].join("\n")}\n`, stderr: "", exit: 0 };
  const list = listOf(state, stages, rules).filter((line) => !before.includes(line));
  const tasks = list.length === 0 ? [] : [["TASKS", ...list].join("\n")];
  const blocks = ctx.out.map((block) => [block.head, ...block.lines].join("\n"));
  return { stdout: `${[...tasks, ...(blocks.length === 0 ? ["WAIT"] : blocks)].join("\n\n")}\n`, stderr: "", exit: 0 };
}
