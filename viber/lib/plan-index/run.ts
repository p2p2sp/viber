/*
 * run.ts - the plan-index core entry: reads the call, the plan and the state
 * beside it, and answers with the index or with one of the other modes. The
 * contract lives in the header of ../../scripts/plan-index.ts.
 */

import { absolutePath } from "../abs-path.ts";
import { runConfig } from "../config/run.ts";
import { answer, baseOf, fail, type MapAnswer } from "../map-answer.ts";
import { rootAbove } from "../plugin-root.ts";
import type { Fs, Git, GitWrite } from "../ports.ts";
import { rootRelative } from "../root-relative.ts";
import { checkPlan } from "./check.ts";
import { dispatchLines } from "./dispatch.ts";
import { finalReviewLines } from "./final-review.ts";
import { checkInput } from "./input.ts";
import { indexLines } from "./listing.ts";
import { readPlan, slotsOf } from "./read.ts";
import { scopeLines } from "./scope.ts";
import { sliceLines } from "./slice.ts";
import { decompose, writeSplit } from "./split.ts";
import { readState, type RunState } from "./state.ts";
import { bare, linesOf, words } from "./text.ts";

interface Ports {
  fs: Fs;
  git: Git;
  write: GitWrite;
}

interface Call {
  plan: string;
  split: boolean;
  extra: string | null;
  dispatch: { id: string; form: string } | null;
  slice: string | null;
  final: boolean;
  input: string | null;
  accepted: number | null;
  detailed: boolean;
}

const USAGE =
  "usage: plan-index.sh <plan-file> [--split | --extra <task-id> | --dispatch <task-id> coder|reviewer | --slice <id>[,<id>]... | --final-review | --input <summary-file>] [--accepted <n>] [--detailed]";
const TEMPLATES = ["spec-full.md", "spec-lite.md", "tasks.md"];

/** null: the arguments do not parse. */
function readCall(argv: string[]): Call | null {
  const call: Call = { plan: argv[0] ?? "", split: false, extra: null, dispatch: null, slice: null, final: false, input: null, accepted: null, detailed: false };
  for (let i = 1; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === "--split") call.split = true;
    else if (flag === "--final-review") call.final = true;
    else if (flag === "--detailed") call.detailed = true;
    else if (flag === "--dispatch") {
      const [id, form] = [argv[i + 1], argv[i + 2]];
      if (!id || form === undefined) return null;
      call.dispatch = { id, form };
      i += 2;
    } else {
      const value = argv[++i];
      if (!value) return null;
      if (flag === "--extra") call.extra = value;
      else if (flag === "--slice") call.slice = value;
      else if (flag === "--input") call.input = value;
      else if (flag === "--accepted" && /^[0-9]+$/.test(value)) call.accepted = Number(value);
      else return null;
    }
  }
  return call.plan === "" ? null : call;
}

/** The modes a call combines that do not go together, as the error words them; null for none. */
function clash({ split, extra, dispatch, slice, final, input, accepted, detailed }: Call): string | null {
  const modes = split || extra !== null || dispatch !== null || slice !== null;
  if (extra !== null && split) return "--extra cannot be combined with --split";
  if (dispatch !== null) {
    if (extra !== null || split) return "--dispatch cannot be combined with --split or --extra";
    if (dispatch.form !== "coder" && dispatch.form !== "reviewer") return `--dispatch form must be coder or reviewer, got: ${dispatch.form}`;
  }
  if (slice !== null && (extra !== null || dispatch !== null || split)) return "--slice cannot be combined with --split, --extra or --dispatch";
  if (final && modes) return "--final-review cannot be combined with --split, --extra, --dispatch or --slice";
  const beside = input !== null ? "--input" : accepted !== null ? "--accepted" : detailed ? "--detailed" : null;
  return beside !== null && (modes || final) ? `${beside} cannot be combined with --split, --extra, --dispatch, --slice or --final-review` : null;
}

/** The blocks --split prints after the index: the extension agents left to run, then the kept QA documents. */
function closeLines(plan: string, dir: string, pluginRoot: string, state: RunState, config: Map<string, string>, isFile: (path: string) => boolean): string[] {
  const closed = words(state.closed);
  const steps = (config.get("build.extensions") ?? "none")
    .split(", ")
    .map((step) => step.split(" + ").filter((name) => name !== "" && name !== "none" && !closed.includes(`extension:${name}`)))
    .filter((names) => names.length > 0);
  const docs = config.get("build.qa") === "true" && !closed.includes("qa") ? ["qa.md", "qa.e2e.md"].map((name) => `${dir}/${name}`).filter(isFile) : [];
  return [
    ...steps.flatMap((names, k) => names.flatMap((name) => [`NEXT: extension | step: ${k + 1} | name: ${name}`, `run: ${dir}`, `spec: ${dir}/spec.md`, `notes: ${dir}/work/`, `out: .temp/viber/extension-${name}/`])),
    ...(docs.length === 0 ? [] : ["NEXT: qa-kept", `RUN: "${pluginRoot}/scripts/commit-task.sh" --qa "${plan}" ${docs.map((doc) => `"${doc}"`).join(" ")}`]),
  ];
}

/** The stdout, stderr and exit code of one plan-index call. script: the path the entry was started by. */
export function runPlanIndex(argv: string[], cwd: string, script: string, ports: Ports): MapAnswer {
  const { fs, git } = ports;
  const call = readCall(argv);
  if (call === null) return fail(USAGE);
  const refused = clash(call);
  if (refused !== null) return fail(refused);

  const here = cwd.replaceAll("\\", "/");
  const root = fs.realPath(here) ?? here;
  const disk = (path: string): string => absolutePath(path.replaceAll("\\", "/"), here);
  // disk drops a trailing slash, which names no file.
  const isFile = (path: string): boolean => !/[/\\]$/.test(path) && fs.kind(disk(path)) === "file";
  if (!isFile(call.plan)) return fail(`plan file not found: ${call.plan}`);
  if (call.input !== null && !isFile(call.input)) return fail(`input file not found: ${call.input}`);

  // The orphan exclusion and every printed path need the run directory repo-relative.
  const plan = rootRelative(bare(call.plan.replaceAll("\\", "/")), root, fs);
  const dir = /^\/[^/]*$/.test(plan) ? "/" : plan.includes("/") ? plan.slice(0, plan.lastIndexOf("/")).replace(/\/+$/, "") : ".";
  // --split rebuilds <dir>/tasks from scratch: on a loose plan it would delete a directory of the project.
  if (call.split && (baseOf(plan) !== "plan.md" || dir === "." || dir === "/")) return fail(`--split expects the run's own <dir>/plan.md, got: ${plan}`);

  const text = fs.readText(disk(plan));
  if (text === null) return fail(`plan file could not be read: ${plan}`);
  const state = readState(disk(dir), fs);
  const config = new Map(
    runConfig([], here, ports)
      .split("\n")
      .map((line): [string, string] => [line.split(": ")[0], line.slice(line.indexOf(": ") + 2)]),
  );
  const pluginRoot = rootAbove(script, 1);
  const tiers = { min: config.get("tiers.min") ?? "haiku", max: config.get("tiers.max") ?? "opus" };

  // Only the planner's own call on a plan that never landed takes the checks added after plans were frozen.
  const plain = !call.split && call.extra === null && call.dispatch === null && call.slice === null && !call.final;
  const slots = (): string[] => slotsOf(TEMPLATES.flatMap((name) => fs.readText(`${pluginRoot}/skills/planner/templates/${name}`) ?? []));
  const fresh = plain && !state.landed ? { slots: slots(), held: isFile, memory: config.get("build.memory") === "true" } : null;

  const doc = readPlan(linesOf(text), fresh);
  const defects = (more: string[], exit: number): MapAnswer => ({ stdout: "", stderr: [...doc.defects, ...more].map((line) => `${line}\n`).join(""), exit });
  if (doc.tasks.length === 0) return defects([`FIX: no <!-- TASK --> blocks in ${plan}`], 3);
  // The cut is that heading: without it tasks/ would come out empty while the index still lists every task.
  if (!doc.hasTasks) return defects([`FIX: ${plan} carries <!-- TASK --> blocks but no "## Tasks" heading - that heading is where the specification is cut off`], 4);
  const checked = checkPlan(doc, { fresh, detailed: call.detailed, held: isFile });
  const found = [...checked.defects, ...(call.input === null ? [] : checkInput(fs.readText(disk(call.input)) ?? "", doc))];
  if (doc.defects.length + found.length > 0) return defects(found, 4);

  const tasks = checked.tasks;
  const taskOf = (id: string) => tasks.find(({ task }) => task.id === id);
  if (call.extra !== null) {
    const self = taskOf(call.extra);
    if (self === undefined) return fail(`--extra: no such task: ${call.extra}`);
    const extras = fs.readText(disk(`${dir}/work/${call.extra}-extra.md`)) ?? "";
    return answer(scopeLines(self, tasks, state, extras, root, fs));
  }
  if (call.dispatch !== null) {
    const { id, form } = call.dispatch;
    if (taskOf(id) === undefined) return fail(`--dispatch: no such task: ${id}`);
    const baseline = ["fast", "full"].includes(config.get("build.baseline-tests") ?? "");
    const lessons = fs.readText(`${git.repoRoot(here) ?? here}/.temp/viber/lessons`);
    return answer(dispatchLines(tasks, state, { id, form: form === "coder" ? "coder" : "reviewer", plan, dir, pluginRoot, baseline, lessons }));
  }
  const planTasks = tasks.map(({ task }) => task);
  if (call.slice !== null) {
    const ids = words(call.slice.replaceAll(",", " "));
    if (ids.length === 0) return fail(USAGE);
    const unknown = ids.find((id) => taskOf(id) === undefined);
    if (unknown !== undefined) return fail(`--slice: no such task: ${unknown}`);
    return answer(sliceLines(planTasks, new Set(ids.map((id) => planTasks.findIndex((task) => task.id === id))), plan, here, git));
  }
  if (call.final) return answer(finalReviewLines(planTasks, state, { plan, dir, pluginRoot, tiers, memory: config.get("build.memory") ?? "false" }));

  const changed = git.status(here).map((entry) => entry.path);
  const listed = indexLines(doc, tasks, state, { plan, dir, changed, profile: call.split ? tiers : null, review: fresh === null ? null : { accepted: call.accepted } });
  if (!call.split) return answer(listed);

  // The extras files of a task not done belong to a session that is over.
  for (const { task } of tasks) {
    if (state.done.has(task.id)) continue;
    for (const name of [`${task.id}-extra.md`, `${task.id}-extra-review.md`]) fs.remove(disk(`${dir}/work/${name}`));
  }
  const printed = answer([...listed, ...closeLines(plan, dir, pluginRoot, state, config, isFile)]);
  const parts = decompose(text);
  const stuck = writeSplit({ parts, text, count: tasks.length, dir, disk, root: here }, ports);
  return stuck === null ? { ...printed, stderr: `decomposed: ${parts.tasks.length} tasks into ${dir}\n` } : { ...printed, stderr: `error: ${stuck} could not be written\n`, exit: 1 };
}
