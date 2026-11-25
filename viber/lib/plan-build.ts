/*
 * plan-build.ts - the plan-build core: prints the dispatch blocks of the
 * planner's writing agents and of the plan judge, cuts a mapped change into the
 * slices its authors get, assembles what they wrote into the plan, each task
 * behind what it needs and with its computed dependencies, holds every reach
 * file to a place in it, routes every
 * defect and finding to the owner of the text it names, and counts the review
 * rounds. The contract lives in the header
 * of ../skills/planner/scripts/plan-build.ts.
 */

import { absolutePath } from "./abs-path.ts";
import { runConfig } from "./config/run.ts";
import { arrangeTasks, dependsValue, orderTasks, type GraphTask } from "./plan-graph.ts";
import { namesPath } from "./plan-index/check.ts";
import { readPlan as readDoc } from "./plan-index/read.ts";
import { planDefects, templateSlots } from "./plan-index/run.ts";
import { bare, entriesOf, trim } from "./plan-index/text.ts";
import { FIXED_AFTER, cutAuthor, cutFrame, cutSliceText, frameSlicesOf, linesOf, listOf, mapTasks, openItemsOf, parsePlan, renameIn, renameTaskIds, renameTokens, renumberTasks, reorderTasks, sectionOf, textOf, withDepends, withOpenItems } from "./plan-text.ts";
import type { FrameSlice, OpenItem, Plan, PlanBlock, PlanTask } from "./plan-text.ts";
import { rootAbove } from "./plugin-root.ts";
import type { Clock, Fs, Git } from "./ports.ts";
import { collectReach, targetPath } from "./reach.ts";
import { stampOf } from "./stamp.ts";
import { runStripTag } from "./strip-tag.ts";

export interface BuildResult {
  stdout: string;
  stderr: string;
  exit: number;
}

interface Ports {
  fs: Fs;
  git: Git;
  clock: Clock;
}

interface State {
  plan: string;
  input: string;
  candidates: string;
  /** The last outline of this plan printed a split proposal: the one state a phase goes on from. */
  split: boolean;
  /** The review rounds opened so far: 0, 1 or 2, never more. */
  round: number;
  /** What the open round waits for: the verdict of its judge, the fix of its critical problems, the fix another owner still owes after that one, or nothing; done once the review of this plan text is over. */
  await: "judge" | "fix" | "gaps" | "none" | "done";
  /** The judge of the open round was sent again once, after a reply with no usable verdict. */
  retry: boolean;
  /** The task count the user kept past the limit; null for none. */
  accepted: number | null;
  /** The slices the outline cut the change into: one author each, a frame for two or more. */
  slices: number;
  /** The frame was corrected once: a later gap in it stays open. */
  frameFixes: boolean;
  /** A survey ran and no plan was assembled since: the next assemble writes a new plan text, whose review starts at round 0. */
  surveyed: boolean;
}

interface Context {
  plan: string;
  rest: string[];
  root: string;
  dir: string;
  plugin: string;
  state: State;
  ports: Ports;
}

const USAGE = "plan-build.sh <survey|outline|frame|assemble|keep|judge|judged|apply|open|fix> <plan> [arguments]";
const DIR = ".temp/viber/planner";
/** A plan the user is asked to split: more tasks, or more files in the survey, than these. */
const TASK_LIMIT = 30;
const FILE_LIMIT = 60;
/** One author writes a slice: at most this many estimated tasks, and this many bytes of existing files, about 50k tokens of code read once. */
const SLICE_TASKS = 8;
const SLICE_BYTES = 200000;
/** The three lines that frame an edit block of a fix file. */
const MARKS = ["@@ EDIT", "@@ WITH", "@@ END"];
/** The work files of one plan, every .md file of the directory: a survey removes them unless it goes on with a phase of that plan. */
const WORK = /\.md$/s;
/** A plan is reviewed in at most this many rounds: no command opens or accepts another. */
const LAST_ROUND = 2;
/** The owner of the specification half and of the shared contract blocks of a framed plan. */
const FRAME = "frame";

const enc = (lines: string[]): Uint8Array => new TextEncoder().encode(textOf(lines));
const ok = (lines: string[]): BuildResult => ({ stdout: textOf(lines), stderr: "", exit: 0 });
const fail = (exit: number, lines: string[]): BuildResult => ({ stdout: "", stderr: textOf(lines), exit });
const misuse = (reason: string): BuildResult => fail(2, [`error: ${reason}`]);

function readState(dir: string, fs: Fs): State {
  const state: State = { plan: "", input: "", candidates: "", split: false, round: 0, await: "none", retry: false, accepted: null, slices: 0, frameFixes: false, surveyed: false };
  for (const line of linesOf(fs.readText(`${dir}/plan-build`) ?? "")) {
    if (line.startsWith("plan: ")) state.plan = line.slice(6);
    if (line.startsWith("input: ")) state.input = line.slice(7);
    if (line.startsWith("candidates: ")) state.candidates = line.slice(12);
    if (line === "split: yes") state.split = true;
    if (line === "round: 1" || line === "round: 2") state.round = Number(line.slice(7));
    if (line === "await: judge" || line === "await: fix" || line === "await: gaps" || line === "await: done") state.await = line.slice(7) as State["await"];
    if (line === "retry: 1") state.retry = true;
    if (/^accepted: \d+$/.test(line)) state.accepted = Number(line.slice(10));
    if (/^slices: \d+$/.test(line)) state.slices = Number(line.slice(8));
    if (line === "frame-fixes: 1") state.frameFixes = true;
    if (line === "surveyed: 1") state.surveyed = true;
  }
  return state;
}

function writeState(ctx: Context): boolean {
  const { plan, input, candidates, split, round, retry, accepted, slices, frameFixes, surveyed } = ctx.state;
  const lines = [
    `plan: ${plan}`,
    `input: ${input}`,
    `candidates: ${candidates}`,
    `split: ${split ? "yes" : "no"}`,
    `round: ${round}`,
    `await: ${ctx.state.await}`,
    `retry: ${retry ? 1 : 0}`,
    `accepted: ${accepted ?? "none"}`,
    `slices: ${slices}`,
    `frame-fixes: ${frameFixes ? 1 : 0}`,
    `surveyed: ${surveyed ? 1 : 0}`,
  ];
  return ctx.ports.fs.writeBytes(`${ctx.dir}/plan-build`, enc(lines));
}

const stateLost = (): BuildResult => misuse(`cannot write ${DIR}/plan-build`);
const planLost = (ctx: Context): BuildResult => fail(5, [`error: cannot write the plan file: ${ctx.plan}`]);
/** A file an agent was to write and the script cannot read: what the agent wrote cannot be used, whichever command reads it. */
const unread = (file: string, owner = ""): string => `FIX: ${owner}cannot read ${file}`;

/** The text of a file an agent wrote, a leaked closing tag on its last line dropped first; null when it cannot be read. */
function agentLines(file: string, fs: Fs): string[] | null {
  runStripTag([file], { fs });
  const text = fs.readText(file);
  return text === null ? null : linesOf(text);
}

function memoryOf(ctx: Context): string {
  const line = runConfig([], ctx.root, ctx.ports)
    .split("\n")
    .find((row) => row.startsWith("build.memory: "));
  return line === undefined ? "false" : line.slice(14).trim();
}

/** The value after each occurrence of a flag, and the arguments that are no flag or flag value. */
function flags(rest: string[], valued: string[], plain: string[]): { values: Map<string, string[]>; set: Set<string>; args: string[] } | string {
  const values = new Map<string, string[]>();
  const set = new Set<string>();
  const args: string[] = [];
  for (let at = 0; at < rest.length; at++) {
    const word = rest[at];
    if (valued.includes(word)) {
      const value = rest[at + 1];
      if (value === undefined || value === "" || value.startsWith("--")) return `${word} needs a value`;
      values.set(word, [...(values.get(word) ?? []), value]);
      at += 1;
    } else if (plain.includes(word)) set.add(word);
    else if (word.startsWith("--")) return `unknown argument: ${word}`;
    else args.push(word);
  }
  return { values, set, args };
}

/** The `<key>=<file>` arguments of a command, in order; a string names the argument that is none, or the key given twice. */
function pairsOf(rest: string[], key: RegExp): { key: string; file: string }[] | string {
  const pairs: { key: string; file: string }[] = [];
  for (const arg of rest) {
    const cut = arg.indexOf("=");
    if (cut < 1 || cut === arg.length - 1 || !key.test(arg.slice(0, cut))) return `got: ${arg}`;
    if (pairs.some((pair) => pair.key === arg.slice(0, cut))) return `${arg.slice(0, cut)} is named twice`;
    pairs.push({ key: arg.slice(0, cut), file: arg.slice(cut + 1) });
  }
  return pairs;
}

/** A change cut into more than one slice has a frame: its owner holds what no slice owns. */
const framed = (ctx: Context): boolean => ctx.state.slices > 1;
const baseOwner = (ctx: Context): string => (framed(ctx) ? FRAME : "1");

/** The lines every block opens on: run-summary.sh finds a planning transcript by its first line. */
const head = (ctx: Context): string[] => [`plan: ${ctx.plan}`, `refs: ${ctx.plugin}/references`];
const writingHead = (ctx: Context): string[] => [...head(ctx), `templates: ${ctx.plugin}/skills/planner/templates`, `memory: ${memoryOf(ctx)}`];
const inputLine = (ctx: Context): string[] => (ctx.state.input === "" ? [] : [`input: ${ctx.state.input}`]);
const addInput = (ctx: Context): string => (ctx.state.input === "" ? " | add: input" : "");
const candidatesLine = (ctx: Context): string[] => (ctx.state.candidates === "" ? [] : [`candidates: ${ctx.state.candidates}`]);
const fileLine = (ctx: Context, label: string, name: string): string[] => (ctx.ports.fs.kind(`${ctx.dir}/${name}`) === "file" ? [`${label}: ${ctx.dir}/${name}`] : []);

function survey(ctx: Context): BuildResult {
  const read = flags(ctx.rest, ["--input"], ["--phase"]);
  if (typeof read === "string") return misuse(`survey: ${read}`);
  if (read.args.length > 0) return misuse(`survey: unexpected argument: ${read.args[0]}`);
  const { fs } = ctx.ports;
  // The same path alone proves nothing: plan mode names one plan file for a whole session, an abandoned plan included.
  // A phase goes on only from the outline that proposed the split it was cut from.
  const resumed = read.set.has("--phase") && ctx.state.plan === ctx.plan && ctx.state.split;
  if (!resumed) {
    for (const name of fs.listDir(ctx.dir)) if (WORK.test(name)) fs.remove(`${ctx.dir}/${name}`);
    ctx.state = { ...ctx.state, plan: ctx.plan, input: "", candidates: "", split: false, accepted: null, slices: 0, frameFixes: false };
  }
  // A survey writes no plan text: the round counter starts again only at the assemble that follows it.
  ctx.state.surveyed = true;
  ctx.state.input = read.values.get("--input")?.[0] ?? "";
  if (!writeState(ctx)) return stateLost();
  const outline = resumed ? fileLine(ctx, "outline", "outline.md") : [];
  return ok([`NEXT: dispatch | agent: viber:plan-surveyor${addInput(ctx)}`, ...head(ctx), ...outline, `out: ${ctx.dir}/survey.md`, ...inputLine(ctx)]);
}

/** One slice of the map: the areas an author writes, the bytes of their existing files and those files. */
interface MapSlice {
  slice: number;
  areas: string[];
  bytes: number;
  paths: string[];
}

/** The slices of `<dir>/slices.md`, one "SLICE: <k> | <area>[, <area>] | <bytes> | <path>, <path>..." line each. */
function readMap(ctx: Context): MapSlice[] {
  return linesOf(ctx.ports.fs.readText(`${ctx.dir}/slices.md`) ?? "").flatMap((line) => {
    const row = /^SLICE: (\d+) \| (.*) \| (\d+) \|(.*)$/.exec(line);
    return row === null ? [] : [{ slice: Number(row[1]), areas: listOf(row[2]), bytes: Number(row[3]), paths: listOf(row[4]) }];
  });
}

interface Area {
  name: string;
  tasks: number;
  files: { path: string; bytes: number }[];
}

/**
 * The areas of a map cut into slices, in map order: consecutive areas join one
 * slice while it stays within both limits, an area past the byte limit alone is
 * cut into runs of its files, and one past the task limit alone stays whole.
 */
function cutSlices(areas: Area[]): MapSlice[] {
  const slices: (MapSlice & { tasks: number })[] = [];
  let open: (MapSlice & { tasks: number }) | null = null;
  const start = (area: Area): MapSlice & { tasks: number } => {
    const slice = { slice: slices.length + 1, areas: [area.name], bytes: 0, paths: [], tasks: 0 };
    slices.push(slice);
    return slice;
  };
  for (const area of areas) {
    const bytes = area.files.reduce((sum, file) => sum + file.bytes, 0);
    if (bytes > SLICE_BYTES) {
      open = null;
      let run: (MapSlice & { tasks: number }) | null = null;
      for (const file of area.files) {
        if (run === null || run.bytes + file.bytes > SLICE_BYTES) run = start(area);
        run.bytes += file.bytes;
        run.paths.push(file.path);
      }
      continue;
    }
    if (open === null || open.tasks + area.tasks > SLICE_TASKS || open.bytes + bytes > SLICE_BYTES) open = start(area);
    else open.areas.push(area.name);
    open.tasks += area.tasks;
    open.bytes += bytes;
    open.paths.push(...area.files.map((file) => file.path));
  }
  return slices.map(({ slice, areas: names, bytes, paths }) => ({ slice, areas: names, bytes, paths }));
}

/** The cells of a "<label>: a | b | c" line of the survey, below its label. */
const cellsOf = (line: string): string[] => line.split("|").map((cell) => cell.trim());
const surveyLines = (lines: string[], label: string): string[] => lines.filter((line) => line.startsWith(label)).map((line) => line.slice(label.length).trim());

/** The block of the author of one slice: the whole plan of a change that fits one slice, else the tasks of its slice from a brief. */
function authorBlock(ctx: Context, slice: number, mode: "whole" | "slice"): string[] {
  const whole = mode === "whole";
  return [
    `NEXT: dispatch | agent: viber:plan-author | slice: ${slice} | add: answered${whole ? addInput(ctx) : ""}`,
    ...writingHead(ctx),
    `mode: ${mode}`,
    `slice: ${slice}`,
    ...(whole ? [`outline: ${ctx.dir}/outline.md`, ...fileLine(ctx, "reach", "reach-paths.md")] : [`brief: ${ctx.dir}/slice-${slice}.md`]),
    ...candidatesLine(ctx),
    `out: ${ctx.dir}/author-${slice}.md`,
    ...(whole ? inputLine(ctx) : []),
  ];
}

function outline(ctx: Context): BuildResult {
  const file = ctx.rest[0];
  if (file === undefined || ctx.rest.length !== 1) return misuse("outline: name the survey file");
  const { fs } = ctx.ports;
  const lines = agentLines(file, fs);
  if (lines === null) return fail(4, [unread(file)]);
  const areas = surveyLines(lines, "AREA: ").map(cellsOf);
  const files = surveyLines(lines, "FILE: ").map(cellsOf);
  const defects = [
    ...(areas.length > 0 ? [] : ['FIX: the survey file holds no AREA: line - write one "AREA: <name> | <estimated tasks> | <what it delivers>" per area']),
    ...areas.filter(([, tasks]) => !/^\d+$/.test(tasks ?? "")).map(([name]) => `FIX: AREA ${name}: its task estimate is no number - write "AREA: <name> | <estimated tasks> | <what it delivers>"`),
    ...files.filter(([, , area]) => !areas.some(([name]) => name === area)).map(([, path, area]) => `FIX: FILE ${path ?? ""}: its area "${area ?? ""}" is on no AREA: line`),
  ];
  if (defects.length > 0) return fail(4, defects);
  const tasks = areas.reduce((sum, [, count]) => sum + Number(count), 0);
  const targets = surveyLines(lines, "TARGET: ").filter((target) => targetPath(target) !== "");
  const decides = surveyLines(lines, "DECIDE: ");
  const phases = surveyLines(lines, "PHASE: ");
  // A file the change adds is read by no author: only an existing one counts toward a slice.
  const sized = (action: string, path: string): number => (action === "add" ? 0 : (fs.size(`${ctx.root}/${path}`) ?? 0));
  const map = cutSlices(areas.map(([name, count]) => ({ name, tasks: Number(count), files: files.filter(([, , area]) => area === name).map(([action, path]) => ({ path, bytes: sized(action, path) })) })));

  if (file !== `${ctx.dir}/outline.md` && !fs.writeBytes(`${ctx.dir}/outline.md`, enc(lines))) return misuse(`cannot write ${DIR}/outline.md`);
  if (!fs.writeBytes(`${ctx.dir}/slices.md`, enc(map.map((slice) => `SLICE: ${slice.slice} | ${slice.areas.join(", ")} | ${slice.bytes} | ${slice.paths.join(", ")}`)))) return misuse(`cannot write ${DIR}/slices.md`);
  ctx.state.candidates = "";
  fs.remove(`${ctx.dir}/reach-paths.md`);
  if (targets.length > 0) {
    const candidates = `${ctx.dir}/reach-${stampOf(ctx.ports.clock.now())}.md`;
    const reach = collectReach(targets, ctx.root, ctx.ports.git, candidates);
    // A paths page with no section names nothing to place: a change whose every target is a file it adds has none.
    if (!fs.writeBytes(candidates, enc(reach.candidates)) || (reach.paths.length > 0 && !fs.writeBytes(`${ctx.dir}/reach-paths.md`, enc(reach.paths)))) return misuse(`cannot write the reach files under ${DIR}`);
    ctx.state.candidates = candidates;
  }
  const thresholds = [...(tasks > TASK_LIMIT ? [`threshold: ${tasks} tasks, past ${TASK_LIMIT}`] : []), ...(files.length > FILE_LIMIT ? [`threshold: ${files.length} files, past ${FILE_LIMIT}`] : [])];
  const proposal = thresholds.length > 0 && phases.length > 0 ? ["Split proposal:", ...phases, ...(decides.length > 0 ? ["Open decisions:", ...decides.map((line) => `- ${line.split("|")[0].trim()}`)] : [])] : [];
  ctx.state.split = proposal.length > 0;
  ctx.state.slices = map.length;
  if (!writeState(ctx)) return stateLost();
  const frameBlock = [
    `NEXT: dispatch | agent: viber:plan-architect | add: answered${addInput(ctx)}`,
    ...writingHead(ctx),
    `outline: ${ctx.dir}/outline.md`,
    `slices: ${ctx.dir}/slices.md`,
    ...fileLine(ctx, "reach", "reach-paths.md"),
    ...candidatesLine(ctx),
    `out: ${ctx.dir}/frame.md`,
    ...inputLine(ctx),
  ];
  return ok([`TASKS: ${tasks}`, `FILES: ${files.length}`, `SLICES: ${map.length}`, ...thresholds, ...decides.map((line) => `DECIDE: ${line}`), ...proposal, ...(map.length > 1 ? frameBlock : authorBlock(ctx, 1, "whole"))]);
}

/** Who owns each task and contract block of the plan, by id: a slice number, or the frame. An id the file lacks belongs to the base owner. */
function readOwners(ctx: Context): Map<string, string> {
  const owners = new Map<string, string>();
  for (const line of linesOf(ctx.ports.fs.readText(`${ctx.dir}/owners.md`) ?? "")) {
    const row = /^(\S+) \| (\S+)$/.exec(line);
    if (row !== null) owners.set(row[1], row[2]);
  }
  return owners;
}

const writeOwners = (ctx: Context, owners: Map<string, string>): boolean => ctx.ports.fs.writeBytes(`${ctx.dir}/owners.md`, enc([...owners].map(([id, owner]) => `${id} | ${owner}`)));

/** The sections of the reach paths page by the path their target names. */
function reachByPath(ctx: Context): Map<string, string[][]> {
  const sections = new Map<string, string[][]>();
  let current: string[] | null = null;
  for (const line of linesOf(ctx.ports.fs.readText(`${ctx.dir}/reach-paths.md`) ?? "")) {
    if (line.startsWith("## ")) {
      current = [line];
      const path = targetPath(line.slice(3));
      sections.set(path, [...(sections.get(path) ?? []), current]);
    } else if (current !== null) current.push(line);
  }
  return sections;
}

const blockLines = (plan: Plan, block: PlanBlock | PlanTask): string[] => plan.lines.slice(block.first, block.last + 1);
const spaced = (blocks: string[][]): string[] => blocks.flatMap((block, at) => (at === 0 ? block : ["", ...block]));

/** What the author of one slice reads in place of the whole plan, when it writes its tasks and when it fixes them. */
function briefOf(ctx: Context, plan: Plan, slice: MapSlice, frame: FrameSlice | undefined, tasks: PlanTask[], survey: string[], reach: Map<string, string[][]>): string[] {
  const named = (label: string): string[] => tasks.flatMap((task) => listOf(task.fields.get(label)));
  // Covers as plan-index.sh reads it: cut on commas and blanks, only the AC<n> words kept.
  const covers = new Set([...(frame?.covers ?? []), ...tasks.flatMap((task) => (task.fields.get("Covers") ?? "").split(/[,\s]+/).filter((word) => /^AC\d+$/.test(word)))]);
  const uses = new Set([...(frame?.uses ?? []), ...named("Uses")]);
  const files = new Set([...slice.paths, ...named("Files")].map(bare));
  const sized = surveyLines(survey, "FILE: ").filter((line) => slice.paths.includes(cellsOf(line)[1]));
  const section = (title: string, body: string[]): string[] => (body.length === 0 ? [`## ${title}`, ""] : [`## ${title}`, "", ...body, ""]);
  return [
    `# Slice ${slice.slice}`,
    "",
    ...section("Delivers", frame === undefined ? [] : [frame.delivers]),
    ...section("Must not change", plan.mustNot),
    ...section("Acceptance criteria", plan.criteria.filter((item) => covers.has(item.id)).flatMap((item) => blockLines(plan, item))),
    ...section("Tasks", spaced(tasks.map((task) => blockLines(plan, task)))),
    ...section("Contracts", spaced(plan.contracts.filter((block) => uses.has(block.id)).map((block) => blockLines(plan, block)))),
    ...section("Files", sized.map((line) => `FILE: ${line} | ${cellsOf(line)[0] === "add" ? 0 : (ctx.ports.fs.size(`${ctx.root}/${cellsOf(line)[1]}`) ?? 0)}`)),
    // A line naming two of the files is quoted once.
    ...section("File map", [...new Set([...files].flatMap((file) => (plan.fileMap.has(file) ? [plan.fileMap.get(file) as string] : [])))]),
    ...section("Reach", spaced([...files].flatMap((file) => reach.get(file) ?? []))),
    ...section("Notes", surveyLines(survey, "NOTE: ").filter((note) => slice.paths.some((path) => namesPath(note, path))).map((note) => `NOTE: ${note}`)),
  ];
}

/** Writes the brief of every slice from the plan as it stands; false when one cannot be written. An unframed plan has none: its one author reads the plan. */
function writeBriefs(ctx: Context, lines: string[], owners: Map<string, string>): boolean {
  if (!framed(ctx)) return true;
  const { fs } = ctx.ports;
  const plan = parsePlan(textOf(lines));
  const frames = frameSlicesOf(linesOf(fs.readText(`${ctx.dir}/frame-slices.md`) ?? ""));
  const survey = linesOf(fs.readText(`${ctx.dir}/outline.md`) ?? "");
  const reach = reachByPath(ctx);
  for (const slice of readMap(ctx)) {
    const tasks = plan.tasks.filter((task) => owners.get(task.id) === String(slice.slice));
    const brief = briefOf(ctx, plan, slice, frames.find((frame) => frame.slice === slice.slice), tasks, survey, reach);
    if (!fs.writeBytes(`${ctx.dir}/slice-${slice.slice}.md`, enc(brief))) return false;
  }
  return true;
}

const briefsLost = (): BuildResult => misuse(`cannot write the slice briefs under ${DIR}`);

function frame(ctx: Context): BuildResult {
  const file = ctx.rest[0];
  if (file === undefined || ctx.rest.length !== 1) return misuse("frame: name the frame file");
  if (!framed(ctx)) return misuse("frame: the outline cut this change into one slice - its author writes the whole plan");
  const { fs } = ctx.ports;
  const lines = agentLines(file, fs);
  if (lines === null) return fail(4, [unread(file)]);
  const cut = cutFrame(lines);
  const plan = parsePlan(textOf(cut.text));
  const map = readMap(ctx);
  const blocks = new Set(plan.contracts.map((block) => block.id));
  const defects = [
    ...(cut.text[0] === "---" ? sourceDefects(cut.text) : ["FIX: the plan text does not open with its frontmatter line ---"]),
    ...(sectionOf(cut.text, /^## Tasks[ \t]*$/) === null ? ['FIX: the plan text holds no "## Tasks" heading on a line of its own'] : []),
    ...(plan.tasks.length === 0 ? [] : ["FIX: the plan text holds a task block - the author of each slice writes its tasks"]),
    ...map.filter((slice) => !cut.slices.some((line) => line.slice === slice.slice)).map((slice) => `FIX: slice ${slice.slice} has no SLICE: line`),
    ...cut.slices.filter((line) => !map.some((slice) => slice.slice === line.slice)).map((line) => `FIX: SLICE: ${line.slice} names no slice of the slices file`),
    ...plan.criteria.filter((item) => !cut.slices.some((line) => line.covers.includes(item.id))).map((item) => `FIX: ${item.id} is on no SLICE: line`),
    ...cut.slices.flatMap((line) => line.uses.filter((id) => !blocks.has(id)).map((id) => `FIX: slice ${line.slice} uses ${id}, no contract block of the plan text`)),
  ];
  if (defects.length > 0) return fail(4, defects);
  if (!fs.writeBytes(ctx.plan, enc(cut.text))) return planLost(ctx);
  const log = `${ctx.dir}/decisions.md`;
  if (cut.decisions.length === 0) fs.remove(log);
  else if (!fs.writeBytes(log, enc(cut.decisions))) return misuse(`cannot write ${DIR}/decisions.md`);
  const kept = cut.slices.map((line) => `SLICE: ${line.slice} | covers: ${line.covers.join(", ") || "none"} | uses: ${line.uses.join(", ") || "none"} | ${line.delivers}`);
  if (!fs.writeBytes(`${ctx.dir}/frame-slices.md`, enc(kept))) return misuse(`cannot write ${DIR}/frame-slices.md`);
  const owners = new Map(plan.contracts.map((block): [string, string] => [block.id, FRAME]));
  if (!writeOwners(ctx, owners)) return misuse(`cannot write ${DIR}/owners.md`);
  if (!writeBriefs(ctx, cut.text, owners)) return briefsLost();
  return ok([`plan: ${ctx.plan}`, `slices: ${map.length}`, ...map.flatMap((slice) => authorBlock(ctx, slice.slice, "slice"))]);
}

/** The plan with these blocks at the end of the section the heading opens, a blank line between them; with no such section, as a new one at the end of the plan when a title is given. */
function intoSection(lines: string[], heading: RegExp, blocks: string[][], title: string | null): string[] {
  if (blocks.length === 0) return lines;
  const section = sectionOf(lines, heading);
  if (section === null) return title === null ? lines : [...lines, ...(lines.length > 0 && lines[lines.length - 1].trim() !== "" ? [""] : []), title, "", ...spaced(blocks)];
  let end = section.to;
  while (end > section.from + 1 && lines[end - 1].trim() === "") end -= 1;
  return [...lines.slice(0, end), "", ...spaced(blocks), ...(section.to < lines.length ? [""] : []), ...lines.slice(section.to)];
}

/** The plan with each contract block an author named L<n> under the next free C<k>, in its heading and in the Uses, Delivers and DoD lines of the tasks. */
function settleLocal(lines: string[]): string[] {
  const plan = parsePlan(textOf(lines));
  const local = plan.contracts.filter((block) => /^L\d+$/.test(block.id));
  if (local.length === 0) return lines;
  let next = Math.max(0, ...plan.contracts.map((block) => Number(/^C(\d+)$/.exec(block.id)?.[1] ?? 0))) + 1;
  const names = new Map<string, string>();
  for (const block of local) if (!names.has(block.id)) names.set(block.id, `C${next++}`);
  const out = [...lines];
  for (const block of local) out[block.first] = `### ${names.get(block.id)}${lines[block.first].slice(4 + block.id.length)}`;
  for (const task of plan.tasks) out.splice(task.first, task.last - task.first + 1, ...renameTokens(lines.slice(task.first, task.last + 1), names));
  return out;
}

/** The "### Out of scope" list of a plan: the place of its heading and of the line after its last one; null with no such heading. */
function outOfScope(lines: string[]): { at: number; to: number } | null {
  const at = lines.findIndex((line) => /^###[ \t]+Out of scope[ \t]*$/.test(line));
  if (at < 0) return null;
  let to = at + 1;
  while (to < lines.length && !/^(##|###) |^[ \t]*<!-- TASK -->/.test(lines[to])) to += 1;
  return { at, to };
}

/** The heading the script lists the reach files left outside the change under, below the lines of "### Out of scope": a task file takes that list up to the first heading below it, so these lines stay in the specification and reach no task file. */
const KEPT = "#### References kept";

/** The plan with these lines at the end of its "### Out of scope" list, under the heading KEPT, one already in the list left out; with no "### Out of scope" heading, as that list above "## Tasks". */
function withOutside(lines: string[], outside: string[]): string[] {
  const fresh = [...new Set(outside)].filter((line) => !lines.includes(line));
  if (fresh.length === 0) return lines;
  const list = outOfScope(lines);
  if (list === null) {
    const tasks = sectionOf(lines, /^## (Open items|Tasks)[ \t]*$/)?.from ?? lines.length;
    return [...lines.slice(0, tasks), "### Out of scope", "", KEPT, "", ...fresh, "", ...lines.slice(tasks)];
  }
  let end = list.to;
  while (end > list.at + 1 && lines[end - 1].trim() === "") end -= 1;
  const headed = lines.slice(list.at + 1, end).some((line) => line.trim() === KEPT);
  return [...lines.slice(0, end), ...(headed ? [] : ["", KEPT, ""]), ...fresh, ...lines.slice(end)];
}

/** The defect of a plan text whose frontmatter names no source: the plan gate tells a plan of the planner by that line, and the build is entered from it. */
function sourceDefects(lines: string[]): string[] {
  if (lines[0] !== "---") return [];
  const end = lines.indexOf("---", 1);
  return lines.slice(1, end < 0 ? lines.length : end).some((line) => /^source:[ \t]*\S/.test(line)) ? [] : ['FIX: the frontmatter holds no "source: <plan path>" line - write it, the plan path as its value'];
}

/** The line an OUTSIDE: line of an author becomes under "### Out of scope". */
const outsideLine = (line: { path: string; text: string }): string => `- ${line.path} - ${line.text}`;

/** What the dependency graph reads of a plan text: its tasks in order and the files of its contract blocks, as plan-index.sh reads them. */
function graphOf(lines: string[]): { tasks: GraphTask[]; blocks: Map<string, string[]>; ids: string[] } {
  const doc = readDoc(lines, null);
  const paths = (value: string): string[] => value.split(",").map((entry) => bare(trim(entry))).filter((path) => path !== "" && path !== "none" && path !== "-");
  const named = (value: string): string[] => entriesOf(value).filter((id) => id !== "none" && id !== "-");
  return {
    tasks: doc.tasks.map((task) => ({ files: paths(task.files), uses: named(task.uses), verification: task.verification, delivers: task.delivers, dod: task.dod })),
    blocks: new Map([...doc.contractFiles].map(([id, value]): [string, string[]] => [id, paths(value)])),
    ids: doc.tasks.map((task) => task.id),
  };
}

/** The tree holds a file at the repo-relative path. */
const heldBy =
  (ctx: Context) =>
  (path: string): boolean =>
    ctx.ports.fs.kind(`${ctx.root}/${path}`) === "file";

/**
 * The plan with its task blocks in the order in which each follows what it
 * needs, numbered T1.. in that order, every task id an author wrote in a
 * Delivers, Verification or DoD line read through the new numbers, and every
 * Depends-on line computed from Files and contract use. ids: the id each task
 * held, in the new order; order: the place each task had. groups: per place a
 * task had, whose numbering its ids were written in (the slice of its author),
 * one numbering for the whole plan when null.
 */
function finish(ctx: Context, lines: string[], groups: string[] | null = null): { lines: string[]; ids: { old: string; fresh: string }[]; order: number[] } {
  const given = graphOf(lines);
  const arranged = arrangeTasks(given.tasks, given.blocks, heldBy(ctx)).order;
  const numbered = renumberTasks(reorderTasks(lines, arranged));
  // A block the plan-index reader counts otherwise moves nothing: the blocks keep their order.
  const order = arranged.length === numbered.ids.length ? arranged : numbered.ids.map((_, at) => at);
  const groupOf = (at: number): string => (groups === null ? "" : (groups[order[at]] ?? ""));
  const names = new Map<string, Map<string, string>>();
  numbered.ids.forEach((id, at) => {
    if (id.old === "") return;
    if (!names.has(groupOf(at))) names.set(groupOf(at), new Map());
    names.get(groupOf(at))?.set(id.old, id.fresh);
  });
  const renamed = mapTasks(numbered.lines, (block, at) => renameTaskIds(block, names.get(groupOf(at)) ?? new Map()));
  const graph = graphOf(renamed);
  const fresh = numbered.ids.map((id) => id.fresh);
  return { lines: withDepends(renamed, orderTasks(graph.tasks, graph.blocks).map((deps) => dependsValue(deps, fresh))), ids: numbered.ids, order };
}

const CYCLE = "FIX: cycle: ";

/** One defect per ring of tasks that need each other, so that no order builds each after what it needs. */
function cycleDefects(ctx: Context, lines: string[]): string[] {
  const graph = graphOf(lines);
  return arrangeTasks(graph.tasks, graph.blocks, heldBy(ctx)).cycles.map(
    (ring) => `${CYCLE}${ring.map((step, at) => `${graph.ids[step.at]} needs ${step.needs} of ${graph.ids[ring[(at + 1) % ring.length].at]}`).join(", ")} - no order builds each after what it needs: move a contract block or a file so that one of them needs nothing of the next`,
  );
}

const REACH = "FIX: reach: ";
const REFERS = " refers to ";
const UNPLACED = " and sits in no task Files, no File map line and no Out of scope line - list it or write an OUTSIDE: line";

/**
 * One defect per file of the reach paths page the plan places nowhere: in no
 * task Files, on no File map line and on no Out of scope line. It names the
 * first target the file refers to; a file of several targets is one defect.
 */
function reachDefects(ctx: Context, lines: string[]): string[] {
  const page = linesOf(ctx.ports.fs.readText(`${ctx.dir}/reach-paths.md`) ?? "");
  if (page.length === 0) return [];
  const plan = parsePlan(textOf(lines));
  const listed = new Set(plan.tasks.flatMap((task) => listOf(task.fields.get("Files")).map(bare)));
  const list = outOfScope(lines);
  const outside = list === null ? [] : lines.slice(list.at + 1, list.to);
  const seen = new Set<string>();
  const defects: string[] = [];
  let target = "";
  for (const line of page) {
    if (line.startsWith("## ")) target = line.slice(3);
    const path = /^(.+) \| \d+$/.exec(line)?.[1];
    if (path === undefined || target === "" || seen.has(path)) continue;
    seen.add(path);
    if (!listed.has(path) && !plan.fileMap.has(path) && !outside.some((row) => namesPath(row, path))) defects.push(`${REACH}${path}${REFERS}${target}${UNPLACED}`);
  }
  return defects;
}

/**
 * Every defect plan-index.sh would print for this plan text as a fresh plan, the
 * checks of its summary file with them, a frontmatter naming no source, each
 * ring of tasks that need each other, then the reach files it places nowhere.
 * names: the new id of each task, read into the lines of the plan-index core.
 */
function defectsOf(ctx: Context, lines: string[], names = new Map<string, string>()): string[] {
  const { fs } = ctx.ports;
  const input = ctx.state.input === "" ? null : fs.readText(absolutePath(ctx.state.input, ctx.root));
  const found = planDefects(textOf(lines), { slots: templateSlots(ctx.plugin, fs), held: heldBy(ctx), memory: memoryOf(ctx) === "true", input });
  const cycles = cycleDefects(ctx, lines);
  // A reading no order puts after its file is part of a ring: the ring is the defect, and its owner the one who can break it.
  const kept = cycles.length === 0 ? found : found.filter((line) => !line.endsWith("(Read after)"));
  return [...sourceDefects(lines), ...[...kept, ...cycles].map((line) => renameIn(line, names)), ...reachDefects(ctx, lines)];
}

/** The owner of the text a defect line names: the task or contract block it opens on, the slice covering its criterion, the block its line number sits in, for a reach file the slice holding the file of its target, for a ring of tasks their author when one wrote them all, else the base owner. */
function ownerOfDefect(ctx: Context, line: string, lines: string[], owners: Map<string, string>): string {
  const base = baseOwner(ctx);
  if (line.startsWith(REACH) && line.endsWith(UNPLACED)) {
    const target = line.slice(line.indexOf(REFERS) + REFERS.length, -UNPLACED.length);
    const holder = framed(ctx) ? readMap(ctx).find((slice) => slice.paths.includes(targetPath(target))) : undefined;
    return holder === undefined ? base : String(holder.slice);
  }
  if (line.startsWith(CYCLE)) {
    // The author of every task of the ring can break it alone; a ring across slices is the frame's.
    const ring = new Set([...line.matchAll(/(?:^FIX: cycle: |, )(\S+) needs /g)].map((step) => owners.get(step[1]) ?? base));
    return ring.size === 1 ? [...ring][0] : base;
  }
  const named = /^(?:FIX|SPLIT): (?:tasks?|contract) ([A-Za-z0-9_-]+)/.exec(line);
  if (named !== null) return owners.get(named[1]) ?? base;
  const criterion = /^FIX: acceptance criterion (AC\d+)/.exec(line);
  if (criterion !== null && framed(ctx)) {
    const covering = frameSlicesOf(linesOf(ctx.ports.fs.readText(`${ctx.dir}/frame-slices.md`) ?? "")).find((slice) => slice.covers.includes(criterion[1]));
    return covering === undefined ? base : String(covering.slice);
  }
  const row = /^FIX: line (\d+):/.exec(line);
  if (row !== null) {
    const plan = parsePlan(textOf(lines));
    const holder = [...plan.tasks, ...plan.contracts].find((block) => block.first < Number(row[1]) && Number(row[1]) <= block.last + 1);
    return holder === undefined ? base : (owners.get(holder.id) ?? base);
  }
  return base;
}

/** The fix block of one owner: the author of a slice, or the architect for the frame. source: the files of what to fix, the findings of the owner, the gaps of the task authors or both; null leaves the lines to the planner. */
function fixBlock(ctx: Context, owner: string, source: "findings" | "gaps" | "both" | null): string[] {
  const add = `${source === null ? " | add: lines" : ""} | add: answered`;
  const told = [...(source === "findings" || source === "both" ? [`findings: ${ctx.dir}/fix-in-${owner}.md`] : []), ...(source === "gaps" || source === "both" ? [`gaps: ${ctx.dir}/gaps.md`] : [])];
  if (owner === FRAME) {
    return [
      `NEXT: dispatch | agent: viber:plan-architect | owner: ${FRAME}${add}${addInput(ctx)}`,
      ...writingHead(ctx),
      "mode: fix",
      `outline: ${ctx.dir}/outline.md`,
      `slices: ${ctx.dir}/slices.md`,
      ...fileLine(ctx, "decisions", "decisions.md"),
      ...told,
      `out: ${ctx.dir}/fix-${FRAME}.md`,
      ...inputLine(ctx),
    ];
  }
  // The one author of an unframed plan owns its specification too: it reads the plan and the input in place of a brief.
  return [
    `NEXT: dispatch | agent: viber:plan-author | owner: ${owner}${add}${framed(ctx) ? "" : addInput(ctx)}`,
    ...writingHead(ctx),
    "mode: fix",
    `slice: ${owner}`,
    ...(framed(ctx) ? [`brief: ${ctx.dir}/slice-${owner}.md`] : []),
    ...fileLine(ctx, "notes", `notes-${owner}.md`),
    ...told,
    `out: ${ctx.dir}/fix-${owner}.md`,
    ...(framed(ctx) ? [] : inputLine(ctx)),
  ];
}

const push = (pending: Map<string, string[]>, owner: string, line: string): void => void pending.set(owner, [...(pending.get(owner) ?? []), line]);
/** The frame first, then the slices in order. */
const ownerOrder = (a: string, b: string): number => (a === FRAME ? -1 : b === FRAME ? 1 : Number(a) - Number(b));

/** Writes what each owner is to fix to its `fix-in-<owner>.md` and answers the fix block of each, the frame first; null when a file cannot be written. */
function fixStep(ctx: Context, pending: Map<string, string[]>): string[] | null {
  const blocks: string[] = [];
  for (const owner of [...pending.keys()].sort(ownerOrder)) {
    if (!ctx.ports.fs.writeBytes(`${ctx.dir}/fix-in-${owner}.md`, enc(pending.get(owner) ?? []))) return null;
    blocks.push(...fixBlock(ctx, owner, "findings"));
  }
  return blocks;
}

const fixInLost = (): BuildResult => misuse(`cannot write the fix-in files under ${DIR}`);

function assemble(ctx: Context): BuildResult {
  const total = ctx.state.slices;
  if (total < 1) return misuse("assemble: no outline cut this plan into slices - run outline first");
  const pairs = pairsOf(ctx.rest, /^[1-9]\d*$/);
  if (typeof pairs === "string") return misuse(`assemble: expected <slice>=<author file>, ${pairs}`);
  const stray = pairs.find((pair) => Number(pair.key) > total);
  if (stray !== undefined) return misuse(`assemble: ${stray.key} names no slice of this plan`);
  for (let slice = 1; slice <= total; slice++) if (!pairs.some((pair) => Number(pair.key) === slice)) return misuse(`assemble: slice ${slice} has no <slice>=<author file> pair - name every slice in one call`);
  const { fs } = ctx.ports;
  const defects: string[] = [];
  const authors = pairs
    .map((pair) => ({ slice: Number(pair.key), file: pair.file, lines: agentLines(pair.file, fs) }))
    .sort((a, b) => a.slice - b.slice)
    .flatMap(({ slice, file, lines }) => {
      if (lines === null) defects.push(`FIX: slice ${slice}: cannot read ${file}`);
      return lines === null ? [] : [{ slice, ...cutAuthor(lines) }];
    });
  if (defects.length > 0) return fail(4, defects);

  const owners = new Map<string, string>();
  const taskOwners: string[] = [];
  const unnamed = (slice: number, blocks: string[][]): void => blocks.forEach((block, at) => void (block.some((line) => /^### \S+ - /.test(line)) || defects.push(`FIX: slice ${slice}: task block ${at + 1} has no "### <id> - <title>" heading`)));
  let lines: string[];
  if (!framed(ctx)) {
    lines = settleLocal(authors[0].text);
    const plan = parsePlan(textOf(lines));
    if (lines[0] !== "---") defects.push("FIX: slice 1: the plan text does not open with its frontmatter line ---");
    defects.push(...sourceDefects(lines).map((line) => line.replace(/^FIX: /, "FIX: slice 1: ")));
    if (plan.tasks.length === 0) defects.push("FIX: slice 1: the plan text holds no task block");
    unnamed(1, plan.tasks.map((task) => blockLines(plan, task)));
    taskOwners.push(...plan.tasks.map(() => "1"));
  } else {
    const text = fs.readText(ctx.plan);
    if (text === null) return misuse(`cannot read the plan file: ${ctx.plan}`);
    const plan = parsePlan(text);
    if (plan.tasks.length > 0) return misuse("assemble: the plan already holds its tasks - change it through apply");
    if (sectionOf(plan.lines, /^## Tasks[ \t]*$/) === null) return misuse('assemble: the plan holds no "## Tasks" heading - run frame first');
    for (const block of plan.contracts) owners.set(block.id, FRAME);
    lines = plan.lines;
    for (const author of authors) {
      const cut = cutSliceText(author.text);
      if (cut.tasks.length === 0) defects.push(`FIX: slice ${author.slice}: the author file holds no task block`);
      unnamed(author.slice, cut.tasks);
      lines = intoSection(lines, /^## Tasks[ \t]*$/, cut.tasks, null);
      lines = settleLocal(intoSection(lines, /^## Contracts[ \t]*$/, cut.blocks.map((block) => block.lines), "## Contracts"));
      for (const block of parsePlan(textOf(lines)).contracts) if (!owners.has(block.id)) owners.set(block.id, String(author.slice));
      taskOwners.push(...cut.tasks.map(() => String(author.slice)));
    }
  }
  if (defects.length > 0) return fail(4, defects);

  lines = withOutside(lines, authors.flatMap((author) => author.outside.map(outsideLine)));
  const gaps = authors.flatMap((author) => author.gaps.map((text) => ({ slice: author.slice, text })));
  // The frame is corrected once: a gap reported after that, or in a plan with no frame, stays open for the user.
  const correction = gaps.length > 0 && framed(ctx) && !ctx.state.frameFixes;
  if (gaps.length > 0 && !correction) lines = withOpenItems(lines, [...openItemsOf(lines), ...gaps.map((gap): OpenItem => ({ kind: "critical", where: "plan", text: `${framed(ctx) ? "frame gap" : "gap"}: ${gap.text}` }))]);
  const done = finish(ctx, lines, taskOwners);
  done.ids.forEach((id, at) => void owners.set(id.fresh, taskOwners[done.order[at]] ?? baseOwner(ctx)));
  const plan = parsePlan(textOf(done.lines));
  for (const block of plan.contracts) if (!owners.has(block.id)) owners.set(block.id, baseOwner(ctx));

  if (!fs.writeBytes(ctx.plan, enc(done.lines))) return planLost(ctx);
  for (const author of authors) {
    const notes = `${ctx.dir}/notes-${author.slice}.md`;
    if (author.facts.length === 0) fs.remove(notes);
    else if (!fs.writeBytes(notes, enc(author.facts))) return misuse(`cannot write ${DIR}/notes-${author.slice}.md`);
  }
  if (!writeOwners(ctx, owners)) return misuse(`cannot write ${DIR}/owners.md`);
  if (!correction) fs.remove(`${ctx.dir}/gaps.md`);
  else if (!fs.writeBytes(`${ctx.dir}/gaps.md`, enc(gaps.map((gap) => `GAP: slice ${gap.slice} | ${gap.text}`)))) return misuse(`cannot write ${DIR}/gaps.md`);
  if (!writeBriefs(ctx, done.lines, owners)) return briefsLost();
  // A plan text assembled after a survey is a new one: its review starts at round 0. One assembled again with no survey keeps its rounds.
  if (ctx.state.surveyed) ctx.state = { ...ctx.state, round: 0, await: "none", retry: false, surveyed: false };

  const count = plan.tasks.length;
  const holders = new Map<string, string[]>();
  for (const task of plan.tasks) for (const path of new Set(listOf(task.fields.get("Files")).map(bare))) holders.set(path, [...(holders.get(path) ?? []), task.id]);
  const report = [
    `assembled: ${count} tasks`,
    ...[...holders].filter(([, ids]) => ids.length > 1).map(([path, ids]) => `shared: ${path} | ${ids.join(", ")}`),
    ...(count > TASK_LIMIT && (ctx.state.accepted === null || count > ctx.state.accepted) ? [`threshold: ${count} tasks, past ${TASK_LIMIT}`] : []),
  ];
  const pending = new Map<string, string[]>();
  for (const line of defectsOf(ctx, done.lines)) push(pending, ownerOfDefect(ctx, line, done.lines, owners), line);
  if (correction) {
    // The architect corrects the frame once: the defects of its own text go with the gaps, or its fix would be refused for one it was never shown.
    const own = pending.get(FRAME) ?? [];
    if (own.length > 0 && !fs.writeBytes(`${ctx.dir}/fix-in-${FRAME}.md`, enc(own))) return fixInLost();
    ctx.state.frameFixes = true;
    return writeState(ctx) ? ok([...report, `gaps: ${gaps.length}`, ...fixBlock(ctx, FRAME, own.length > 0 ? "both" : "gaps")]) : stateLost();
  }
  if (!writeState(ctx)) return stateLost();
  if (pending.size === 0) return ok([...report, "NEXT: judge"]);
  const blocks = fixStep(ctx, pending);
  return blocks === null ? fixInLost() : ok([...report, "NEXT: fix | defects", ...blocks]);
}

function keep(ctx: Context): BuildResult {
  const count = ctx.rest[0];
  if (ctx.rest.length !== 1 || !/^\d+$/.test(count)) return misuse("keep: name the task count the user kept");
  ctx.state.accepted = Number(count);
  return writeState(ctx) ? ok([`accepted: ${Number(count)}`]) : stateLost();
}

function fix(ctx: Context): BuildResult {
  if (ctx.rest.length > 0) return misuse(`fix: unexpected argument: ${ctx.rest[0]}`);
  return ok(fixBlock(ctx, baseOwner(ctx), null));
}

function readPlan(ctx: Context): Plan | BuildResult {
  const text = ctx.ports.fs.readText(ctx.plan);
  if (text === null) return misuse(`cannot read the plan file: ${ctx.plan}`);
  const plan = parsePlan(text);
  return plan.tasks.length === 0 ? fail(4, ["FIX: the plan holds no task block"]) : plan;
}

const isResult = (value: Plan | BuildResult): value is BuildResult => "exit" in value;

/** What one judge file holds: the critical problems that fail the plan and the notes that do not. */
interface Judged {
  criticals: { where: string; wrong: string; line: string }[];
  notes: { where: string; text: string }[];
}

/** The CRITICAL: and NOTE: lines of a judge file, a list mark or blanks in front of one dropped; a line with no " | " names the plan. */
function readJudge(lines: string[]): Judged {
  const found: Judged = { criticals: [], notes: [] };
  for (const line of lines) {
    const row = /^[ \t]*(?:[-*][ \t]+)?(CRITICAL|NOTE):[ \t]*(.*)$/.exec(line);
    if (row === null || row[2].trim() === "") continue;
    const parts = row[2].split(" | ").map((part) => part.trim());
    const where = parts.length > 1 && parts[0] !== "" ? parts[0] : "plan";
    if (row[1] === "CRITICAL") found.criticals.push({ where, wrong: (parts.length > 1 ? parts[1] : parts[0]) || row[2].trim(), line: `CRITICAL: ${row[2].trim()}` });
    else found.notes.push({ where, text: (parts.length > 1 ? parts.slice(1).join(" | ") : parts[0]) || row[2].trim() });
  }
  return found;
}

/** The open item of a place: a task id of the plan keeps it, any other place becomes the plan, named in front of the text. */
const placed = (kind: OpenItem["kind"], where: string, text: string, ids: Set<string>): OpenItem => (where === "plan" || ids.has(where) ? { kind, where, text } : { kind, where: "plan", text: `${where} - ${text}` });

const same = (a: OpenItem, b: OpenItem): boolean => a.kind === b.kind && a.where === b.where && a.text === b.text;

/** What follows NEXT: exit-plan: one line per open item of the plan, the critical problems first. */
function openLines(lines: string[]): string[] {
  const items = openItemsOf(lines);
  return [...items.filter((item) => item.kind === "critical"), ...items.filter((item) => item.kind === "note")].map((item) => `OPEN: ${item.kind} | ${item.where} | ${item.text}`);
}

function judgeBlock(ctx: Context): string[] {
  const { round } = ctx.state;
  return [
    `NEXT: dispatch | agent: viber:plan-judge | round: ${round}${addInput(ctx)} | add: answered`,
    `plan: ${ctx.plan}`,
    `round: ${round}`,
    ...inputLine(ctx),
    // The second round reads the text the fix of the first changed, when it changed any.
    ...(round === LAST_ROUND ? fileLine(ctx, "changed", "changed.md") : []),
    `out: ${ctx.dir}/judge-${round}.md`,
  ];
}

function judge(ctx: Context): BuildResult {
  if (ctx.rest.length > 0) return misuse(`judge: unexpected argument: ${ctx.rest[0]}`);
  const plan = readPlan(ctx);
  if (isResult(plan)) return plan;
  const { state } = ctx;
  if (state.await === "judge") return ok(judgeBlock(ctx));
  if (state.await === "fix" || state.await === "gaps") return misuse(`judge: the fix of round ${state.round} is open - run apply with its fix file, or open`);
  // The review of this plan text is over: no call opens a round of it again.
  if (state.await === "done" || state.round >= LAST_ROUND) return ok(["NEXT: exit-plan", ...openLines(plan.lines)]);
  ctx.state = { ...state, round: state.round + 1, await: "judge", retry: false };
  return writeState(ctx) ? ok(judgeBlock(ctx)) : stateLost();
}

/** Ends the open round: what it waits for next, no judge sent again yet. */
function closeRound(ctx: Context, next: State["await"]): boolean {
  ctx.state = { ...ctx.state, await: next, retry: false };
  return writeState(ctx);
}

const VERDICTS = ["PASS", "FAIL", "DENIED", "none"];

function judged(ctx: Context): BuildResult {
  const read = flags(ctx.rest, ["--out"], []);
  if (typeof read === "string") return misuse(`judged: ${read}`);
  const word = read.args[0];
  if (read.args.length !== 1 || !VERDICTS.includes(word)) return misuse(`judged: expected PASS, FAIL, DENIED or none, got: ${read.args.join(" ")}`);
  if (ctx.state.await !== "judge") return misuse("no review round is open");
  const { fs } = ctx.ports;
  const { round } = ctx.state;
  const text = fs.readText(ctx.plan);
  if (text === null) return misuse(`cannot read the plan file: ${ctx.plan}`);
  const lines = linesOf(text);
  const report = (verdict: string, critical: number, notes: number): string => `judge: round ${round} | ${verdict} | critical: ${critical} | notes: ${notes}`;
  /** The last round ended with no verdict to act on: the plan says so, and the session goes on to the approval. */
  const leave = (verdict: string, what: string): BuildResult => {
    const next = withOpenItems(lines, [...openItemsOf(lines), { kind: "note", where: "plan", text: `review round ${round} ${what}` }]);
    if (!fs.writeBytes(ctx.plan, enc(next))) return planLost(ctx);
    return closeRound(ctx, "done") ? ok([report(verdict, 0, 0), "NEXT: exit-plan", ...openLines(next)]) : stateLost();
  };

  if (word === "DENIED") {
    if (round < LAST_ROUND) return misuse(`judged: a DENIED reply of round ${round} is the user's to answer - dispatch the judge block again or stop`);
    return leave("DENIED", "did not run: a tool call was refused");
  }
  const out = read.values.get("--out")?.[0];
  const source = out === undefined ? null : agentLines(out, fs);
  const found = source === null ? null : readJudge(source);
  const failed = found !== null && found.criticals.length > 0;
  const ids = new Set(parsePlan(text).tasks.map((task) => task.id));
  const notes = word === "none" ? [] : (found?.notes ?? []).map((note) => placed("note", note.where, note.text, ids));
  const next = notes.length === 0 ? lines : withOpenItems(lines, [...openItemsOf(lines), ...notes]);
  // A FAIL that names no critical problem leaves nothing to fix. It is no verdict, and it is reported as none: the plan
  // gate takes a FAIL as answered only by that call, an apply or an open, so no round is counted here. The notes its
  // file holds are placed now: the none report names no file.
  if (word === "FAIL" && !failed) {
    if (notes.length > 0 && !fs.writeBytes(ctx.plan, enc(next))) return planLost(ctx);
    return ok([report("FAIL", 0, notes.length), "NEXT: judged | none"]);
  }
  if (word === "none") {
    if (!ctx.state.retry) {
      ctx.state = { ...ctx.state, retry: true };
      return writeState(ctx) ? ok([report("none", 0, 0), "NEXT: redispatch", ...judgeBlock(ctx)]) : stateLost();
    }
    if (round >= LAST_ROUND) return leave("none", "returned no usable result");
    return closeRound(ctx, "none") ? ok([report("none", 0, 0), "STOP: the plan stays unreviewed - no hand-off"]) : stateLost();
  }

  if (notes.length > 0 && !fs.writeBytes(ctx.plan, enc(next))) return planLost(ctx);
  // The fix of this round reads the judge file from one place, wherever plan mode let the judge write it.
  const kept = `${ctx.dir}/judge-${round}.md`;
  if (source === null) fs.remove(kept);
  else if (out !== kept && !fs.writeBytes(kept, enc(source))) return misuse(`cannot write ${DIR}/judge-${round}.md`);
  if (!failed) return closeRound(ctx, "done") ? ok([report("PASS", 0, notes.length), "NEXT: exit-plan", ...openLines(next)]) : stateLost();
  // Each critical problem goes to the owner of the text it names: a task or a contract block, else the frame.
  const owners = readOwners(ctx);
  const pending = new Map<string, string[]>();
  for (const critical of found.criticals) push(pending, owners.get(critical.where) ?? baseOwner(ctx), critical.line);
  const blocks = fixStep(ctx, pending);
  if (blocks === null) return fixInLost();
  if (!closeRound(ctx, "fix")) return stateLost();
  return ok([report("FAIL", found.criticals.length, notes.length), `NEXT: fix | round: ${round}`, ...blocks]);
}

/** The place and the text of a "fix: <where> - <text>" or "unfixed: <where> - <text>" line; a line with no " - " names no place. */
function placeOf(line: string): { where: string; text: string } {
  const rest = line.slice(line.indexOf(": ") + 2).trim();
  const cut = rest.indexOf(" - ");
  return cut < 0 ? { where: "", text: rest } : { where: rest.slice(0, cut).trim(), text: rest.slice(cut + 3).trim() };
}

/** The note each fix made after the last review leaves: on its task, or on the plan with its place in front. */
const fixedNotes = (fixes: string[], ids: Set<string>): OpenItem[] =>
  fixes.map(placeOf).map((fix): OpenItem => (ids.has(fix.where) ? { kind: "note", where: fix.where, text: `${FIXED_AFTER} ${fix.text}` } : { kind: "note", where: "plan", text: `${FIXED_AFTER} ${fix.where === "" ? "" : `${fix.where} - `}${fix.text}` }));

/**
 * The open items of the plan once the fix of a review round was applied: a
 * critical problem a fix line names is closed, one no fix line names or an
 * unfixed line names stays open, and after the last round each fix leaves the
 * note that it was made after the last review.
 */
function afterFix(lines: string[], found: Judged, fixes: string[], unfixed: string[], last: boolean): string[] {
  const ids = new Set(parsePlan(textOf(lines)).tasks.map((task) => task.id));
  const fixed = fixes.map(placeOf);
  const left = unfixed.map(placeOf);
  const named = new Set(fixed.map((fix) => fix.where).filter((where) => where !== ""));
  const stays = (where: string): boolean => !named.has(where) || left.some((line) => line.where === where);
  // The problems of this round are decided again below; an older one stays unless a fix line names its place.
  const again = found.criticals.map((critical) => placed("critical", critical.where, critical.wrong, ids));
  const closed = (item: OpenItem): boolean => {
    if (item.kind !== "critical") return false;
    if (again.some((critical) => same(critical, item))) return true;
    return item.where === "plan" ? [...named].some((where) => !ids.has(where) && item.text.startsWith(`${where} - `)) : named.has(item.where);
  };
  const open: OpenItem[] = [];
  for (const critical of found.criticals) {
    if (!stays(critical.where)) continue;
    const why = left.find((line) => line.where === critical.where);
    open.push(placed("critical", critical.where, why === undefined ? critical.wrong : `${critical.wrong} (not fixed: ${why.text})`, ids));
  }
  for (const line of left) if (!found.criticals.some((critical) => critical.where === line.where)) open.push(placed("critical", line.where === "" ? "plan" : line.where, `not fixed: ${line.text}`, ids));
  return withOpenItems(lines, [...openItemsOf(lines).filter((item) => !closed(item)), ...open, ...(last ? fixedNotes(fixes, ids) : [])]);
}

/** What one fix file holds: the edits of its owner, what it says of them, what it sends to another owner and the reach files it leaves outside the change. */
interface Fix {
  owner: string;
  edits: { old: string[]; fresh: string[] }[];
  fixes: string[];
  unfixed: string[];
  gaps: { to: string; text: string }[];
  outside: { path: string; text: string }[];
}

/** A fix file read: its edit blocks and the fix:, unfixed:, GAP: and OUTSIDE: lines outside them; the defects of its form in place of it, each naming its owner. */
function readFix(owner: string, source: string[]): Fix | string[] {
  const fix: Fix = { owner, edits: [], fixes: [], unfixed: [], gaps: [], outside: [] };
  const defects: string[] = [];
  const defect = (text: string): void => void defects.push(`FIX: owner ${owner}: ${text}`);
  let part: "none" | "old" | "fresh" = "none";
  source.forEach((line, at) => {
    const mark = line.trim();
    if (part === "none" && mark === "@@ EDIT") {
      fix.edits.push({ old: [], fresh: [] });
      part = "old";
    } else if (part === "old" && mark === "@@ WITH") part = "fresh";
    else if (part === "fresh" && mark === "@@ END") part = "none";
    // A marker anywhere else is a block cut short: read as text it would land in the plan, or delete what it matched.
    else if (MARKS.includes(mark)) defect(`line ${at + 1} of the fix file: ${mark} is out of place - a block is @@ EDIT, the text to replace, @@ WITH, the new text, @@ END`);
    else if (part === "old") fix.edits[fix.edits.length - 1].old.push(line);
    else if (part === "fresh") fix.edits[fix.edits.length - 1].fresh.push(line);
    else {
      // A line the owner indented or wrote as a list item counts too: dropped, its edit would go unchecked.
      const told = /^[ \t]*(?:[-*][ \t]+)?((?:fix|unfixed): .*|GAP:.*|OUTSIDE:.*)$/.exec(line);
      if (told === null) return;
      if (told[1].startsWith("fix: ")) fix.fixes.push(told[1].trimEnd());
      else if (told[1].startsWith("unfixed: ")) fix.unfixed.push(told[1].trimEnd());
      else if (told[1].startsWith("OUTSIDE:")) {
        // As in an author file: a line with no path or no text names nothing.
        const rest = told[1].slice(8);
        const bar = rest.indexOf("|");
        if (bar > 0 && rest.slice(0, bar).trim() !== "" && rest.slice(bar + 1).trim() !== "") fix.outside.push({ path: rest.slice(0, bar).trim(), text: rest.slice(bar + 1).trim() });
      } else {
        const rest = told[1].slice(4).trim();
        const bar = rest.indexOf("|");
        if (rest !== "") fix.gaps.push(bar < 0 ? { to: "", text: rest } : { to: rest.slice(0, bar).trim(), text: rest.slice(bar + 1).trim() });
      }
    }
  });
  if (defects.length > 0) return defects;
  // A file of unfixed: or GAP: lines alone holds no edit: it only says what stays open or goes to another owner. An OUTSIDE: line is a change of its own.
  if (fix.edits.length + fix.outside.length === 0 && (fix.fixes.length > 0 || fix.unfixed.length + fix.gaps.length === 0)) return [`FIX: owner ${owner}: the fix file holds no @@ EDIT block`];
  if (part !== "none") return [`FIX: owner ${owner}: the last @@ EDIT block of the fix file has no @@ END line`];
  // The second review round reads the fix lines to find the changed text: with none it would check nothing.
  if (fix.edits.length > 0 && fix.fixes.length === 0) return [`FIX: owner ${owner}: the fix file holds no fix: line outside its blocks - add one per fix applied, below the @@ END line of its block`];
  return fix;
}

/** The open items with every task id read through the new numbering; an item of a task the plan no longer holds becomes a plan item. */
function renumberItems(lines: string[], names: Map<string, string>): string[] {
  const items = openItemsOf(lines);
  const moved = items.map((item): OpenItem => (item.where === "plan" ? item : names.has(item.where) ? { ...item, where: names.get(item.where) as string } : { kind: item.kind, where: "plan", text: `removed task - ${item.text}` }));
  return moved.every((item, at) => same(item, items[at])) ? lines : withOpenItems(lines, moved);
}

/** What the next review round reads in place of the whole plan: each fix line, then the new lines of each edit under its number; the file an earlier fix of the round left is carried on. */
function changedLines(held: string[], fixes: string[], edits: Fix["edits"], names: Map<string, string>): string[] {
  const cut = held.findIndex((line) => line.startsWith("## edit "));
  const before = held.filter((line) => line.startsWith("## edit ")).length;
  const place = (line: string): string => {
    const { where, text } = placeOf(line);
    return where === "" ? line : `fix: ${names.get(where) ?? where} - ${text}`;
  };
  const heading = (line: string): string => line.replace(/^### (\S+) - /, (whole, id: string) => (names.has(id) ? `### ${names.get(id)} - ` : whole));
  return [...(cut < 0 ? held : held.slice(0, cut)), ...fixes.map(place), ...(cut < 0 ? [] : held.slice(cut)), ...edits.flatMap((edit, at) => [`## edit ${before + at + 1}`, ...edit.fresh.map(heading)])];
}

function apply(ctx: Context): BuildResult {
  if (ctx.rest.length === 0) return misuse("apply: name at least one <owner>=<fix file>");
  const pairs = pairsOf(ctx.rest, /^(frame|[1-9]\d*)$/);
  if (typeof pairs === "string") return misuse(`apply: expected <owner>=<fix file>, ${pairs}`);
  const base = baseOwner(ctx);
  const stray = pairs.find((pair) => (framed(ctx) ? pair.key !== FRAME && Number(pair.key) > ctx.state.slices : pair.key !== "1"));
  if (stray !== undefined) return misuse(`apply: ${stray.key} names no owner of this plan`);
  const { round } = ctx.state;
  if (ctx.state.await === "judge") return misuse(`apply: the verdict of round ${round} is awaited - report it with judged`);
  const { fs } = ctx.ports;
  const text = fs.readText(ctx.plan);
  if (text === null) return misuse(`cannot read the plan file: ${ctx.plan}`);

  const fixes: Fix[] = [];
  const defects: string[] = [];
  for (const pair of pairs) {
    const source = agentLines(pair.file, fs);
    const read = source === null ? [unread(pair.file, `owner ${pair.key}: `)] : readFix(pair.key, source);
    if (Array.isArray(read)) defects.push(...read);
    else fixes.push(read);
  }
  if (defects.length > 0) return fail(4, defects);

  // The edits of each owner in turn: a task or contract block the plan did not hold before them is that owner's.
  const before = linesOf(text);
  const held = parsePlan(text);
  const owners = readOwners(ctx);
  const known = new Set([...held.tasks, ...held.contracts].map((block) => block.id));
  const equal = (a: string, b: string): boolean => a.trimEnd() === b.trimEnd();
  let lines = before;
  for (const each of fixes) {
    each.edits.forEach((edit, index) => {
      const defect = (text: string): void => void defects.push(`FIX: owner ${each.owner}: edit ${index + 1}: ${text}`);
      if (edit.old.length === 0) return defect("it names no text to replace");
      const found: number[] = [];
      for (let at = 0; at + edit.old.length <= lines.length; at++) if (edit.old.every((line, offset) => equal(line, lines[at + offset]))) found.push(at);
      if (found.length !== 1) return defect(`its text occurs ${found.length} times in the plan, it must occur once: ${edit.old[0]}`);
      lines = [...lines.slice(0, found[0]), ...edit.fresh, ...lines.slice(found[0] + edit.old.length)];
    });
    if (defects.length > 0) continue;
    lines = settleLocal(lines);
    const now = parsePlan(textOf(lines));
    const seen = new Set<string>();
    for (const task of now.tasks) {
      if (task.id === "") defects.push(`FIX: owner ${each.owner}: a task block has no "### <id> - <title>" heading`);
      else if (seen.has(task.id)) defects.push(`FIX: owner ${each.owner}: two task blocks carry the id ${task.id} - give a task you add an id no task of the plan holds, the script numbers the tasks`);
      seen.add(task.id);
    }
    for (const block of [...now.tasks, ...now.contracts]) {
      if (known.has(block.id)) continue;
      known.add(block.id);
      owners.set(block.id, each.owner);
    }
  }
  if (defects.length > 0) return fail(4, defects);
  const outside = [...new Set(fixes.flatMap((each) => each.outside.map(outsideLine)))].filter((line) => !lines.includes(line));
  lines = withOutside(lines, outside);

  // A fix that answers a review round also settles what that round leaves open, in the ids the judge read.
  const review = ctx.state.await === "fix";
  const hop = ctx.state.await === "gaps";
  const last = round >= LAST_ROUND;
  const told = fixes.flatMap((each) => each.fixes);
  // An owner a gap of the round was sent on to answers no line of the judge file: its fix lines close what was left open at their place.
  const found = review ? readJudge(linesOf(fs.readText(`${ctx.dir}/judge-${round}.md`) ?? "")) : { criticals: [], notes: [] };
  if (review || hop) lines = afterFix(lines, found, told, fixes.flatMap((each) => each.unfixed), last);

  const done = finish(ctx, lines);
  const names = new Map(done.ids.filter((id) => id.old !== "").map((id): [string, string] => [id.old, id.fresh]));
  const fresh = new Map<string, string>();
  for (const id of done.ids) fresh.set(id.fresh, owners.get(id.old) ?? base);
  for (const block of parsePlan(textOf(done.lines)).contracts) fresh.set(block.id, owners.get(block.id) ?? base);
  let out = renumberItems(done.lines, names);

  // What an owner sends on: the frame to the author of a task, an author to the frame while it is still to be corrected. Any other gap stays open.
  const pending = new Map<string, string[]>();
  const stuck: OpenItem[] = [];
  let corrected = ctx.state.frameFixes;
  for (const each of fixes) {
    for (const gap of each.gaps) {
      const id = names.get(gap.to) ?? gap.to;
      const target = fresh.get(id);
      if (gap.to === FRAME && framed(ctx) && each.owner !== FRAME && !ctx.state.frameFixes) {
        corrected = true;
        push(pending, FRAME, `GAP: ${FRAME} | ${gap.text}`);
      } else if (gap.to === FRAME) stuck.push({ kind: "critical", where: "plan", text: `${framed(ctx) ? "frame gap" : "gap"}: ${gap.text}` });
      else if (target !== undefined && target !== each.owner && each.owner === FRAME) push(pending, target, `GAP: ${id} | ${gap.text}`);
      else if (target !== undefined && /^T\d+$/.test(id)) stuck.push({ kind: "critical", where: id, text: `gap: ${gap.text}` });
      else stuck.push({ kind: "critical", where: "plan", text: `gap: ${gap.to === "" ? "" : `${gap.to} - `}${gap.text}` });
    }
  }
  if (stuck.length > 0) out = withOpenItems(out, [...openItemsOf(out), ...stuck]);

  // The candidate is checked before anything is written. An owner of this call may leave no defect of its own, and no
  // defect may be new, except one in the text of an owner a gap of this call sends on to.
  const calling = new Set(fixes.map((each) => each.owner));
  const sent = new Set(pending.keys());
  const ownerAt = (line: string): string => ownerOfDefect(ctx, line, out, fresh);
  const old = new Set(defectsOf(ctx, before, names));
  const left = defectsOf(ctx, out);
  const refused = left.filter((line) => calling.has(ownerAt(line)) || (!old.has(line) && !sent.has(ownerAt(line))));
  if (refused.length > 0) return fail(4, refused.flatMap((line) => (calling.has(ownerAt(line)) ? [ownerAt(line)] : [...calling]).map((owner) => `FIX: owner ${owner}: ${line.replace(/^FIX: /, "")}`)));
  for (const line of left) push(pending, ownerAt(line), line);

  if (!fs.writeBytes(ctx.plan, enc(out))) return planLost(ctx);
  if (!writeOwners(ctx, fresh)) return misuse(`cannot write ${DIR}/owners.md`);
  if (!writeBriefs(ctx, out, fresh)) return briefsLost();
  ctx.state.frameFixes = corrected;
  const applied = `applied: ${fixes.reduce((sum, each) => sum + each.edits.length, 0)} edits`;
  // The lines listed under Out of scope are changed text too: the next round reads them as one edit more.
  const edits = [...fixes.flatMap((each) => each.edits), ...(outside.length > 0 ? [{ old: [], fresh: outside }] : [])];
  const changed = `${ctx.dir}/changed.md`;
  if (review || hop) {
    const carried = hop ? linesOf(fs.readText(changed) ?? "") : [];
    if (last || (edits.length === 0 && carried.length === 0)) fs.remove(changed);
    else if (!fs.writeBytes(changed, enc(changedLines(carried, told, edits, names)))) return misuse(`cannot write ${DIR}/changed.md`);
  }
  const waiting = `${ctx.dir}/pending.md`;
  if (pending.size > 0) {
    const blocks = fixStep(ctx, pending);
    if (blocks === null) return fixInLost();
    // Inside a review round the owners still to fix are part of that round: open records what they leave.
    if (review || hop) {
      if (!fs.writeBytes(waiting, enc([...pending.values()].flat()))) return misuse(`cannot write ${DIR}/pending.md`);
      ctx.state.await = "gaps";
    }
    return writeState(ctx) ? ok([applied, `NEXT: fix | ${sent.size > 0 ? "gaps" : "defects"}`, ...blocks]) : stateLost();
  }
  if (review || hop) {
    fs.remove(waiting);
    if (!closeRound(ctx, last ? "done" : "none")) return stateLost();
    return ok(last ? [applied, "NEXT: exit-plan", ...openLines(out)] : [applied, "NEXT: judge"]);
  }
  if (!writeState(ctx)) return stateLost();
  // A change made once the review is over goes to the approval with no round more.
  return ok(ctx.state.await === "done" ? [applied, "NEXT: exit-plan", ...openLines(out)] : [applied, "NEXT: judge"]);
}

/** What open records for a fix given up once the review is over: the script holds no text of that change. */
const UNAPPLIED: OpenItem = { kind: "critical", where: "plan", text: "a change asked for after the review was not applied" };

/** Gives up a fix: of the open round, what it leaves staying in the plan as open critical items, or, once the review is over, of a change made after it. */
function open(ctx: Context): BuildResult {
  if (ctx.rest.length > 0) return misuse(`open: unexpected argument: ${ctx.rest[0]}`);
  if (ctx.state.await !== "fix" && ctx.state.await !== "gaps" && ctx.state.await !== "done") return misuse("open: no fix is open");
  const { fs } = ctx.ports;
  const { round } = ctx.state;
  const text = fs.readText(ctx.plan);
  if (text === null) return misuse(`cannot read the plan file: ${ctx.plan}`);
  const lines = linesOf(text);
  if (ctx.state.await === "done") {
    const kept = withOpenItems(lines, [...openItemsOf(lines), UNAPPLIED]);
    return fs.writeBytes(ctx.plan, enc(kept)) ? ok(["NEXT: exit-plan", ...openLines(kept)]) : planLost(ctx);
  }
  const ids = new Set(parsePlan(text).tasks.map((task) => task.id));
  const waiting = `${ctx.dir}/pending.md`;
  // The critical problems of the round when none of them was fixed; once they were, what the owners sent on to still owe.
  const left =
    ctx.state.await === "fix"
      ? readJudge(linesOf(fs.readText(`${ctx.dir}/judge-${round}.md`) ?? "")).criticals.map((critical) => placed("critical", critical.where, critical.wrong, ids))
      : linesOf(fs.readText(waiting) ?? "").map((line): OpenItem => {
          const gap = /^GAP: (\S+) \| (.*)$/.exec(line);
          return gap === null ? { kind: "critical", where: "plan", text: line.replace(/^(FIX|SPLIT): /, "") } : placed("critical", gap[1] === FRAME ? "plan" : gap[1], `gap: ${gap[2]}`, ids);
        });
  const next = left.length === 0 ? lines : withOpenItems(lines, [...openItemsOf(lines), ...left]);
  if (left.length > 0 && !fs.writeBytes(ctx.plan, enc(next))) return planLost(ctx);
  // A round whose fix was given up whole changed no text: the next one reads the whole plan.
  if (ctx.state.await === "fix") fs.remove(`${ctx.dir}/changed.md`);
  fs.remove(waiting);
  if (!closeRound(ctx, round >= LAST_ROUND ? "done" : "none")) return stateLost();
  return ok(round >= LAST_ROUND ? ["NEXT: exit-plan", ...openLines(next)] : ["NEXT: judge"]);
}

const COMMANDS: Record<string, (ctx: Context) => BuildResult> = { survey, outline, frame, assemble, keep, judge, judged, apply, open, fix };

/** The stdout, stderr and exit code of one plan-build call. script: the path the entry was started by. Never throws. */
export function runPlanBuild(argv: string[], cwd: string, script: string, ports: Ports): BuildResult {
  const [command, plan, ...rest] = argv;
  const run = command !== undefined && Object.hasOwn(COMMANDS, command) ? COMMANDS[command] : undefined;
  if (run === undefined || plan === undefined || plan.trim() === "") return misuse(`usage: ${USAGE}`);
  const root = ports.git.repoRoot(cwd.replaceAll("\\", "/"));
  if (root === null) return misuse("not inside a git repository");
  const top = root.replace(/\/$/, "");
  const dir = `${top}/${DIR}`;
  if (!ports.fs.makeDir(dir)) return misuse(`cannot create ${DIR}`);
  return run({ plan, rest, root: top, dir, plugin: rootAbove(script, 3), state: readState(dir, ports.fs), ports });
}
