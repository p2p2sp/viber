/*
 * plan-build.ts - the plan-build core: prints the dispatch blocks of the
 * planner's writing agents and moves what they wrote, file to file, into the
 * plan. The contract lives in the header of
 * ../skills/planner/scripts/plan-build.ts.
 */

import { runConfig } from "./config/run.ts";
import { linesOf, listOf, parsePlan, rangeOf, slicesOf, textOf } from "./plan-text.ts";
import type { Plan, PlanBlock, PlanTask, Slice } from "./plan-text.ts";
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

const USAGE = "plan-build.sh <survey|outline|skeleton|slices|merge|apply|fix> <plan> [arguments]";
const DIR = ".temp/viber/planner";
/** A plan the user is asked to split: more tasks, or more files in the survey, than these. */
const TASK_LIMIT = 30;
const FILE_LIMIT = 60;
/** The architect writes a plan of this many tasks or fewer whole, with no task author. */
const WHOLE_LIMIT = 8;
const PENDING = "PENDING";
/** The three lines that frame an edit block of a fix file. */
const MARKS = ["@@ EDIT", "@@ WITH", "@@ END"];
/** The work files of one plan: a survey removes them unless it goes on with a phase of that plan. */
const WORK = /^(outline|decisions|reach-paths|reach-.*|slice-.*|findings-.*|review-.*|fixes|gaps|survey|architect|tasks-.*|fix)\.md$/s;

const enc = (lines: string[]): Uint8Array => new TextEncoder().encode(textOf(lines));
const ok = (lines: string[]): BuildResult => ({ stdout: textOf(lines), stderr: "", exit: 0 });
const fail = (exit: number, lines: string[]): BuildResult => ({ stdout: "", stderr: textOf(lines), exit });
const misuse = (reason: string): BuildResult => fail(2, [`error: ${reason}`]);

function readState(dir: string, fs: Fs): State {
  const state: State = { plan: "", input: "", candidates: "", split: false };
  for (const line of linesOf(fs.readText(`${dir}/plan-build`) ?? "")) {
    if (line.startsWith("plan: ")) state.plan = line.slice(6);
    if (line.startsWith("input: ")) state.input = line.slice(7);
    if (line.startsWith("candidates: ")) state.candidates = line.slice(12);
    if (line === "split: yes") state.split = true;
  }
  return state;
}

function writeState(ctx: Context): boolean {
  const { plan, input, candidates, split } = ctx.state;
  return ctx.ports.fs.writeBytes(`${ctx.dir}/plan-build`, enc([`plan: ${plan}`, `input: ${input}`, `candidates: ${candidates}`, `split: ${split ? "yes" : "no"}`]));
}

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
function flags(rest: string[], valued: string[], bare: string[]): { values: Map<string, string[]>; set: Set<string>; args: string[] } | string {
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
    } else if (bare.includes(word)) set.add(word);
    else if (word.startsWith("--")) return `unknown argument: ${word}`;
    else args.push(word);
  }
  return { values, set, args };
}

/** The lines every block opens on: run-summary.sh finds a planning transcript by its first line. */
const head = (ctx: Context): string[] => [`plan: ${ctx.plan}`, `refs: ${ctx.plugin}/references`];
const inputLine = (ctx: Context): string[] => (ctx.state.input === "" ? [] : [`input: ${ctx.state.input}`]);
const addInput = (ctx: Context): string => (ctx.state.input === "" ? " | add: input" : "");
const candidatesLine = (ctx: Context): string[] => (ctx.state.candidates === "" ? [] : [`candidates: ${ctx.state.candidates}`]);

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
    ctx.state = { plan: ctx.plan, input: "", candidates: "", split: false };
  }
  ctx.state.input = read.values.get("--input")?.[0] ?? "";
  if (!writeState(ctx)) return misuse(`cannot write ${DIR}/plan-build`);
  const outline = resumed && fs.kind(`${ctx.dir}/outline.md`) === "file" ? [`outline: ${ctx.dir}/outline.md`] : [];
  return ok([`NEXT: dispatch | agent: viber:plan-surveyor${addInput(ctx)}`, ...head(ctx), ...outline, `out: ${ctx.dir}/survey.md`, ...inputLine(ctx)]);
}

function outline(ctx: Context): BuildResult {
  const file = ctx.rest[0];
  if (file === undefined || ctx.rest.length !== 1) return misuse("outline: name the survey file");
  const { fs } = ctx.ports;
  const lines = agentLines(file, fs);
  if (lines === null) return misuse(`cannot read ${file}`);
  const counted = lines.map((line) => /^TASKS:[ \t]*(\d+)[ \t]*$/.exec(line)).find((match) => match !== null);
  if (counted === undefined || counted === null) return fail(4, ["FIX: the survey file holds no TASKS: line"]);
  const tasks = Number(counted[1]);
  const after = (label: string): string[] => lines.filter((line) => line.startsWith(label)).map((line) => line.slice(label.length).trim());
  const files = after("FILE: ").length;
  const targets = after("TARGET: ").filter((target) => targetPath(target) !== "");
  const decides = after("DECIDE: ");
  const phases = after("PHASE: ");

  if (file !== `${ctx.dir}/outline.md` && !fs.writeBytes(`${ctx.dir}/outline.md`, enc(lines))) return misuse(`cannot write ${DIR}/outline.md`);
  ctx.state.candidates = "";
  fs.remove(`${ctx.dir}/reach-paths.md`);
  if (targets.length > 0) {
    const reach = collectReach(targets, ctx.root, ctx.ports.git);
    const candidates = `${ctx.dir}/reach-${stampOf(ctx.ports.clock.now())}.md`;
    if (!fs.writeBytes(candidates, enc(reach.candidates)) || !fs.writeBytes(`${ctx.dir}/reach-paths.md`, enc(reach.paths))) return misuse(`cannot write the reach files under ${DIR}`);
    ctx.state.candidates = candidates;
  }
  const thresholds = [...(tasks > TASK_LIMIT ? [`threshold: ${tasks} tasks, past ${TASK_LIMIT}`] : []), ...(files > FILE_LIMIT ? [`threshold: ${files} files, past ${FILE_LIMIT}`] : [])];
  const proposal = thresholds.length > 0 && phases.length > 0 ? ["Split proposal:", ...phases, ...(decides.length > 0 ? ["Open decisions:", ...decides.map((line) => `- ${line.split("|")[0].trim()}`)] : [])] : [];
  ctx.state.split = proposal.length > 0;
  if (!writeState(ctx)) return misuse(`cannot write ${DIR}/plan-build`);
  const reachLines = targets.length > 0 ? [`reach: ${ctx.dir}/reach-paths.md`, ...candidatesLine(ctx)] : [];
  return ok([
    `TASKS: ${tasks}`,
    `FILES: ${files}`,
    ...thresholds,
    ...decides.map((line) => `DECIDE: ${line}`),
    ...proposal,
    `NEXT: dispatch | agent: viber:plan-architect | add: answered${addInput(ctx)}`,
    ...head(ctx),
    `templates: ${ctx.plugin}/skills/planner/templates`,
    `memory: ${memoryOf(ctx)}`,
    `mode: ${tasks <= WHOLE_LIMIT ? "whole" : "skeleton"}`,
    `outline: ${ctx.dir}/outline.md`,
    ...reachLines,
    `out: ${ctx.dir}/architect.md`,
    ...inputLine(ctx),
  ]);
}

const pending = (task: PlanTask): boolean => ["Verification", "DoD"].some((label) => (task.fields.get(label) ?? "").startsWith(PENDING));

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

/** What the author and the reviewer of one slice read in place of the whole plan. */
function briefOf(plan: Plan, slice: Slice, reach: Map<string, string[][]>): string[] {
  const tasks = plan.tasks.slice(slice.from - 1, slice.to);
  const named = (label: string): Set<string> => new Set(tasks.flatMap((task) => listOf(task.fields.get(label))));
  // Covers as plan-index.sh reads it: cut on commas and blanks, only the AC<n> words kept.
  const covers = new Set(tasks.flatMap((task) => (task.fields.get("Covers") ?? "").split(/[,\s]+/).filter((word) => /^AC\d+$/.test(word))));
  const uses = named("Uses");
  const files = new Set([...named("Files")].map((file) => file.replace(/^\.\//, "")));
  const spaced = (blocks: string[][]): string[] => blocks.flatMap((block, at) => (at === 0 ? block : ["", ...block]));
  return [
    `# Slice ${rangeOf(plan, slice)}`,
    "",
    "## Must not change",
    "",
    ...plan.mustNot,
    "",
    "## Acceptance criteria",
    "",
    ...plan.criteria.filter((item) => covers.has(item.id)).flatMap((item) => blockLines(plan, item)),
    "",
    "## Tasks",
    "",
    ...spaced(tasks.map((task) => blockLines(plan, task))),
    "",
    "## Contracts",
    "",
    ...spaced(plan.contracts.filter((block) => uses.has(block.id)).map((block) => blockLines(plan, block))),
    "",
    "## File map",
    "",
    // A line naming two of the files is quoted once.
    ...new Set([...files].flatMap((file) => (plan.fileMap.has(file) ? [plan.fileMap.get(file) as string] : []))),
    "",
    "## Reach",
    "",
    ...spaced([...files].flatMap((file) => reach.get(file) ?? [])),
  ];
}

/** Writes one brief per slice of the plan, the briefs of an earlier cut removed; null when one cannot be written. */
function writeBriefs(ctx: Context, plan: Plan): { range: string; brief: string }[] | null {
  const { fs } = ctx.ports;
  for (const name of fs.listDir(ctx.dir)) if (/^slice-.*\.md$/s.test(name)) fs.remove(`${ctx.dir}/${name}`);
  const reach = reachByPath(ctx);
  const written: { range: string; brief: string }[] = [];
  for (const slice of slicesOf(plan.tasks.length)) {
    const range = rangeOf(plan, slice);
    const brief = `${ctx.dir}/slice-${range}.md`;
    if (!fs.writeBytes(brief, enc(briefOf(plan, slice, reach)))) return null;
    written.push({ range, brief });
  }
  return written;
}

function readPlan(ctx: Context): Plan | BuildResult {
  const text = ctx.ports.fs.readText(ctx.plan);
  if (text === null) return misuse(`cannot read the plan file: ${ctx.plan}`);
  const plan = parsePlan(text);
  return plan.tasks.length === 0 ? fail(4, ["FIX: the plan holds no task block"]) : plan;
}

const isResult = (value: Plan | BuildResult): value is BuildResult => "exit" in value;

function skeleton(ctx: Context): BuildResult {
  const file = ctx.rest[0];
  if (file === undefined || ctx.rest.length !== 1) return misuse("skeleton: name the architect file");
  const { fs } = ctx.ports;
  const lines = agentLines(file, fs);
  if (lines === null) return misuse(`cannot read ${file}`);
  const cut = lines.findIndex((line) => line.trim() === "<!-- DECISIONS -->");
  const text = cut < 0 ? lines : lines.slice(0, cut);
  const decisions = cut < 0 ? [] : lines.slice(cut + 1);
  for (const part of [text, decisions]) {
    while (part.length > 0 && part[part.length - 1].trim() === "") part.pop();
    while (part.length > 0 && part[0].trim() === "") part.shift();
  }
  const plan = parsePlan(textOf(text));
  const defects = [...(text[0] === "---" ? [] : ["FIX: the plan text does not open with its frontmatter line ---"]), ...(plan.tasks.length > 0 ? [] : ["FIX: the plan text holds no task block"])];
  if (defects.length > 0) return fail(4, defects);
  if (!fs.writeBytes(ctx.plan, enc(text))) return fail(5, [`error: cannot write the plan file: ${ctx.plan}`]);
  const log = `${ctx.dir}/decisions.md`;
  if (decisions.length === 0) fs.remove(log);
  else if (!fs.writeBytes(log, enc(decisions))) return misuse(`cannot write ${DIR}/decisions.md`);
  return ok([`plan: ${ctx.plan}`, `tasks: ${plan.tasks.length}`, `mode: ${plan.tasks.some(pending) ? "skeleton" : "whole"}`, ...(decisions.length > 0 ? [`decisions: ${log}`] : [])]);
}

function slices(ctx: Context): BuildResult {
  if (ctx.rest.length > 0) return misuse(`slices: unexpected argument: ${ctx.rest[0]}`);
  const plan = readPlan(ctx);
  if (isResult(plan)) return plan;
  const briefs = writeBriefs(ctx, plan);
  if (briefs === null) return misuse(`cannot write the slice briefs under ${DIR}`);
  const memory = memoryOf(ctx);
  return ok(
    briefs.flatMap(({ range, brief }) => [
      `NEXT: dispatch | agent: viber:plan-detailer | tasks: ${range}`,
      ...head(ctx),
      `memory: ${memory}`,
      `tasks: ${range}`,
      `brief: ${brief}`,
      ...candidatesLine(ctx),
      `out: ${ctx.dir}/tasks-${range}.md`,
    ]),
  );
}

function fixBlock(ctx: Context, findings: string[], briefs: string[], gaps: boolean): string[] {
  const { fs } = ctx.ports;
  const log = `${ctx.dir}/decisions.md`;
  return [
    `NEXT: dispatch | agent: viber:plan-fixer${findings.length === 0 && !gaps ? " | add: lines" : ""} | add: answered${addInput(ctx)}`,
    ...head(ctx),
    `templates: ${ctx.plugin}/skills/planner/templates`,
    `memory: ${memoryOf(ctx)}`,
    ...(fs.kind(log) === "file" ? [`decisions: ${log}`] : []),
    ...findings.map((file) => `findings: ${file}`),
    ...briefs.map((file) => `brief: ${file}`),
    ...(gaps ? [`gaps: ${ctx.dir}/gaps.md`] : []),
    ...candidatesLine(ctx),
    `out: ${ctx.dir}/fix.md`,
    ...inputLine(ctx),
  ];
}

function fix(ctx: Context): BuildResult {
  const read = flags(ctx.rest, ["--findings", "--brief"], ["--gaps"]);
  if (typeof read === "string") return misuse(`fix: ${read}`);
  if (read.args.length > 0) return misuse(`fix: unexpected argument: ${read.args[0]}`);
  return ok(fixBlock(ctx, read.values.get("--findings") ?? [], read.values.get("--brief") ?? [], read.set.has("--gaps")));
}

/** The tasks a `<first id>-<last id>` range names, in plan order; null for an id the plan lacks or a reversed range. */
function tasksOf(plan: Plan, range: string): PlanTask[] | null {
  const ids = plan.tasks.map((task) => task.id);
  const from = ids.findIndex((id) => range.startsWith(`${id}-`) && ids.includes(range.slice(id.length + 1)));
  if (from < 0) return null;
  const to = ids.indexOf(range.slice(ids[from].length + 1));
  return to < from ? null : plan.tasks.slice(from, to + 1);
}

function merge(ctx: Context): BuildResult {
  if (ctx.rest.length === 0) return misuse("merge: name at least one <first id>-<last id>=<file>");
  const plan = readPlan(ctx);
  if (isResult(plan)) return plan;
  const { fs } = ctx.ports;
  const defects: string[] = [];
  const gaps: string[] = [];
  const filled = new Map<string, Record<string, string>>();
  for (const pair of ctx.rest) {
    const cut = pair.indexOf("=");
    if (cut < 1 || cut === pair.length - 1) return misuse(`merge: expected <first id>-<last id>=<file>, got: ${pair}`);
    const range = pair.slice(0, cut);
    const tasks = tasksOf(plan, range);
    if (tasks === null) return misuse(`merge: ${range} names no run of tasks of the plan`);
    const lines = agentLines(pair.slice(cut + 1), fs);
    if (lines === null) {
      defects.push(`FIX: ${range}: cannot read ${pair.slice(cut + 1)}`);
      continue;
    }
    const own = new Set(tasks.map((task) => task.id));
    let id = "";
    for (const line of lines) {
      const heading = /^### (\S+)/.exec(line);
      if (heading !== null) {
        id = heading[1];
        if (!own.has(id)) defects.push(`FIX: ${range}: ${id} is not a task of this slice`);
        continue;
      }
      if (line.startsWith("GAP: ")) gaps.push(line);
      const field = /^- (Verification|DoD):[ \t]*(.*)$/.exec(line);
      if (field === null || !own.has(id)) continue;
      filled.set(id, { ...filled.get(id), [field[1]]: field[2].trim() });
    }
    for (const task of tasks) {
      for (const label of ["Verification", "DoD"]) {
        const value = filled.get(task.id)?.[label] ?? "";
        if (value === "" || value.startsWith(PENDING)) defects.push(`FIX: ${range}: ${task.id} has no ${label} line`);
      }
    }
  }
  if (defects.length > 0) return fail(4, defects);

  const lines = [...plan.lines];
  // Last task first, so an inserted line moves no block still to be written.
  for (const task of [...plan.tasks].reverse()) {
    const values = filled.get(task.id);
    if (values === undefined) continue;
    for (const label of ["DoD", "Verification"]) {
      const row = `- ${label}: ${values[label]}`;
      const at = lines.findIndex((line, index) => index > task.first && index < task.last && line.startsWith(`- ${label}:`));
      if (at >= 0) lines[at] = row;
      else lines.splice(task.last, 0, row);
    }
  }
  if (!fs.writeBytes(ctx.plan, enc(lines))) return fail(5, [`error: cannot write the plan file: ${ctx.plan}`]);
  const merged = parsePlan(textOf(lines));
  if (writeBriefs(ctx, merged) === null) return misuse(`cannot write the slice briefs under ${DIR}`);
  const open = merged.tasks.filter(pending).map((task) => task.id);
  if (gaps.length === 0) fs.remove(`${ctx.dir}/gaps.md`);
  else if (!fs.writeBytes(`${ctx.dir}/gaps.md`, enc(gaps))) return misuse(`cannot write ${DIR}/gaps.md`);
  return ok([`merged: ${filled.size} tasks`, ...(open.length > 0 ? [`pending: ${open.join(", ")}`] : []), ...(gaps.length > 0 ? [`gaps: ${gaps.length}`, ...fixBlock(ctx, [], [], true)] : [])]);
}

function apply(ctx: Context): BuildResult {
  const file = ctx.rest[0];
  if (file === undefined || ctx.rest.length !== 1) return misuse("apply: name the fix file");
  const { fs } = ctx.ports;
  const source = agentLines(file, fs);
  if (source === null) return misuse(`cannot read ${file}`);
  const text = fs.readText(ctx.plan);
  if (text === null) return misuse(`cannot read the plan file: ${ctx.plan}`);

  const edits: { old: string[]; fresh: string[] }[] = [];
  const fixes: string[] = [];
  const misplaced: string[] = [];
  let part: "none" | "old" | "fresh" = "none";
  source.forEach((line, at) => {
    const mark = line.trim();
    if (part === "none" && mark === "@@ EDIT") {
      edits.push({ old: [], fresh: [] });
      part = "old";
    } else if (part === "old" && mark === "@@ WITH") part = "fresh";
    else if (part === "fresh" && mark === "@@ END") part = "none";
    // A marker anywhere else is a block cut short: read as text it would land in the plan, or delete what it matched.
    else if (MARKS.includes(mark)) misplaced.push(`FIX: line ${at + 1} of the fix file: ${mark} is out of place - a block is @@ EDIT, the text to replace, @@ WITH, the new text, @@ END`);
    else if (part === "old") edits[edits.length - 1].old.push(line);
    else if (part === "fresh") edits[edits.length - 1].fresh.push(line);
    else {
      // A fix line the fixer indented or wrote as a list item counts too: dropped, its edit would go unchecked.
      const fixed = /^[ \t]*(?:[-*][ \t]+)?(fix: .*)$/.exec(line);
      if (fixed !== null) fixes.push(fixed[1].trimEnd());
    }
  });
  if (misplaced.length > 0) return fail(4, misplaced);
  if (edits.length === 0) return fail(4, ["FIX: the fix file holds no @@ EDIT block"]);
  if (part !== "none") return fail(4, ["FIX: the last @@ EDIT block of the fix file has no @@ END line"]);
  // The reviewers of the next round check the fix lines alone: with none they would check nothing.
  if (fixes.length === 0) return fail(4, ["FIX: the fix file holds no fix: line outside its blocks - add one per fix applied, below the @@ END line of its block"]);

  let lines = linesOf(text);
  const defects: string[] = [];
  const same = (a: string, b: string): boolean => a.trimEnd() === b.trimEnd();
  edits.forEach((edit, index) => {
    if (edit.old.length === 0) {
      defects.push(`FIX: edit ${index + 1}: it names no text to replace`);
      return;
    }
    const found: number[] = [];
    for (let at = 0; at + edit.old.length <= lines.length; at++) if (edit.old.every((line, offset) => same(line, lines[at + offset]))) found.push(at);
    if (found.length !== 1) {
      defects.push(`FIX: edit ${index + 1}: its text occurs ${found.length} times in the plan, it must occur once: ${edit.old[0]}`);
      return;
    }
    lines = [...lines.slice(0, found[0]), ...edit.fresh, ...lines.slice(found[0] + edit.old.length)];
  });
  if (defects.length > 0) return fail(4, defects);
  if (!fs.writeBytes(ctx.plan, enc(lines))) return fail(5, [`error: cannot write the plan file: ${ctx.plan}`]);
  // Added to the lines of the fixes applied since the last round closed (review-round.sh removes the file there): the next round checks them all.
  const earlier = linesOf(fs.readText(`${ctx.dir}/fixes.md`) ?? "");
  if (!fs.writeBytes(`${ctx.dir}/fixes.md`, enc([...earlier, ...fixes]))) return misuse(`cannot write ${DIR}/fixes.md`);
  if (fs.listDir(ctx.dir).some((name) => /^slice-.*\.md$/s.test(name)) && writeBriefs(ctx, parsePlan(textOf(lines))) === null) return misuse(`cannot write the slice briefs under ${DIR}`);
  return ok([`applied: ${edits.length} edits`, `fixes: ${ctx.dir}/fixes.md`]);
}

const COMMANDS: Record<string, (ctx: Context) => BuildResult> = { survey, outline, skeleton, slices, merge, apply, fix };

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
