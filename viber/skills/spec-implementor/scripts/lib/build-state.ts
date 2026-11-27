/*
 * build-state.ts - what one run remembers between two calls (state.json), the
 * context one call works in, outcome.md as a function of that state, and the
 * commit that carries both.
 */

import type { Task } from "../../../planner/scripts/lib/plan-parse.ts";
import type { Tree } from "../../../planner/scripts/lib/ports.ts";
import type { Committed, Fs, Gh, Git } from "./ports.ts";

export type TaskState = "todo" | "coder" | "review" | "done" | "held" | "skipped";

export interface TaskRun {
  state: TaskState;
  /** The coder returns that failed (BLOCKED, LOST, the tree check) since the last one that passed. */
  attempt: number;
  /** The fix rounds a failed review or a refused commit opened. */
  round: number;
  /** The reviews that returned no usable report. */
  lost: number;
  /** The dispatches so far, kept over a restart so no id is ever issued twice. */
  seq: number;
  /** The id of the dispatch awaited. */
  open: string | null;
  /** The tasks this one runs after. */
  after: number[];
  /** The paths outside `Files` its coder reported in `FILES:`. */
  extra: string[];
  sha: string | null;
  /** The fix file the coder is handed. This path and the two below are relative to the work directory: the state is committed and read on another machine. */
  fix: string | null;
  /** The fix file of the last failed review or refused commit: what the next review rechecks. */
  previous: string | null;
  /** The report the review awaited writes. */
  report: string | null;
  /** Why it is held or skipped; on done its marks: no-change, unreviewed. */
  why: string;
  /** Its lines of outcome.md. */
  notes: string[];
}

// `writers` sends the memory, rules and QA writers together. `memory` and `rules` are the steps of a state written before it: resumed as `writers`.
export type Step = "tasks" | "final-review" | "final-fix" | "tests" | "test-fix" | "writers" | "memory" | "rules" | "extensions" | "finalize" | "end";

export interface Close {
  step: Step;
  /** The ids of the dispatches awaited. */
  open: string[];
  seq: number;
  /** The repair rounds the failing tests opened. */
  round: number;
  /** The overrun dispatches of the memory and of the rules writer in a row, each its own: a second one restores that writer's files outside `before` from HEAD. A state written before it holds `overrun` instead. */
  overruns: { memory: number; rules: number };
  /** The extension steps finished. */
  ext: number;
  /** PASS, FAIL, SKIP, or `not run`. */
  tests: string;
  /** True when a task is held or skipped: the run is summed up, never archived. */
  partial: boolean;
  /** The Critical findings of the final review, kept until its fix returns. */
  found: string[];
  /** What leftOf gave when a fix coder was sent: a file it gives after the return and did not then is that coder's change. */
  left: string[];
  notes: string[];
  /** The lines under END. */
  end: string[];
}

export interface State {
  /** HEAD at the first start. */
  base: string;
  /** The files that differed from HEAD at the first start: the user's own, which the run never reports and the memory and rules steps of the close never measure, restore, remove or commit. A state written before this field has none. */
  before?: string[];
  tasks: Record<string, TaskRun>;
  close: Close;
}

export interface Block {
  agent: string;
  id: string;
  /** Empty: the agent's own model. */
  model: string;
  lines: string[];
}

/** A part of a split change: part `n` of `of`. */
export interface Phase {
  n: number;
  of: number;
}

/** The part a plan's `Phase: P<n> of <N>` line names, as plan.sh land writes it; null with none or another form. */
export function phaseOf(plan: string): Phase | null {
  const match = /^Phase:[ \t]*P([1-9][0-9]*) of ([1-9][0-9]*)\s*$/m.exec(plan);
  if (match === null) return null;
  const [n, of] = [Number(match[1]), Number(match[2])];
  return n <= of ? { n, of } : null;
}

export interface Ctx {
  root: string;
  /** The name of the directory holding the spec. */
  name: string;
  /** `work/` in the run directory: the state and every work file of the build. */
  work: string;
  /** The run directory: the one holding the spec. */
  specDir: string;
  refs: string;
  title: string;
  /** The run's issue from the plan's `Issue:` line, as gh takes it (a number or an issue link); null with none. */
  issue: string | null;
  /** The run's part of a split change from the plan's `Phase:` line (`P<n> of <N>`); null with none. */
  phase: Phase | null;
  tasks: Task[];
  state: State;
  /** The dispatches this call prints. */
  out: Block[];
  /** The files of the tree, listed once a call. */
  files(): string[];
  fs: Fs;
  git: Git;
  gh: Gh;
  tree: Tree;
}

export const freshTask = (after: number[], seq: number): TaskRun => ({ state: "todo", attempt: 0, round: 0, lost: 0, seq, open: null, after, extra: [], sha: null, fix: null, previous: null, report: null, why: "", notes: [] });

export const freshClose = (seq: number): Close => ({ step: "tasks", open: [], seq, round: 0, overruns: { memory: 0, rules: 0 }, ext: 0, tests: "not run", partial: false, found: [], left: [], notes: [], end: [] });

export const runOf = (ctx: Ctx, num: number): TaskRun => ctx.state.tasks[String(num)];

/** A path of the tree as repo-relative; any other path as it is. */
export const rel = (ctx: Ctx, path: string): string => (path.startsWith(`${ctx.root}/`) ? path.slice(ctx.root.length + 1) : path);

/** True when the run directory lies in the repository: only then is it committed, and cleaned and archived at the close. */
export const inRepo = (ctx: Ctx): boolean => ctx.specDir.startsWith(`${ctx.root}/`);

/** The paths under `paths` that differ from HEAD, none of `before`, the user's own, which the close neither measures, lists, restores, commits nor removes. A state with no `before` has none. */
export function ownDirty(ctx: Ctx, paths: string[]): string[] {
  const before = new Set(ctx.state.before ?? []);
  return ctx.git.dirty(ctx.root, paths).filter((path) => !before.has(path));
}

/** The files that differ from HEAD and are the run's to answer for: none under the run directory or .temp/, none that differed at the first start. */
export function leftOf(ctx: Ctx): string[] {
  const own = `${rel(ctx, ctx.specDir)}/`;
  return ownDirty(ctx, ["."]).filter((path) => !path.startsWith(own) && !path.startsWith(".temp/"));
}

/** A task's state in words: `done 1a2b3c4, unreviewed`, `held (review)`. */
export function statusOf(run: TaskRun): string {
  if (run.state === "done") return ["done", run.sha === null ? "" : ` ${run.sha.slice(0, 7)}`, run.why === "" ? "" : `, ${run.why}`].join("");
  return run.why === "" ? run.state : `${run.state} (${run.why})`;
}

/** Text as lines indented under a list item, the blank ones dropped. */
export const under = (text: string): string[] => text.split(/\r?\n/).filter((line) => line.trim() !== "").map((line) => `  ${line}`);

export function renderOutcome(ctx: Ctx): string {
  // A part's issue travels to the next part in the outcome: plan.sh land reads it from there.
  const issue = ctx.phase === null || ctx.issue === null ? [] : [`Issue: ${/^\d+$/.test(ctx.issue) ? `#${ctx.issue}` : ctx.issue}`];
  const out = [`# Outcome: ${ctx.title}`, ...(ctx.phase === null ? [] : ["", `Phase: P${ctx.phase.n} of ${ctx.phase.of}`, ...issue]), "", "## Tasks", ""];
  for (const task of ctx.tasks) out.push(`- T${task.num} - ${task.title}: ${statusOf(runOf(ctx, task.num))}`);
  const noted = ctx.tasks.filter((task) => runOf(ctx, task.num).notes.length > 0);
  if (noted.length > 0 || ctx.state.close.notes.length > 0) out.push("", "## Notes");
  for (const task of noted) out.push("", `### T${task.num}`, "", ...runOf(ctx, task.num).notes);
  if (ctx.state.close.notes.length > 0) out.push("", "### Close", "", ...ctx.state.close.notes);
  return `${out.join("\n")}\n`;
}

/** Writes outcome.md, until the finalizer returned and its text stands, then state.json. False when the state could not be written. */
export function save(ctx: Ctx): boolean {
  if (ctx.state.close.step !== "end") ctx.fs.writeText(`${ctx.specDir}/outcome.md`, renderOutcome(ctx));
  return ctx.fs.writeText(`${ctx.work}/state.json`, `${JSON.stringify(ctx.state, null, 2)}\n`);
}

// The files of the run directory every commit takes: those the script writes and another machine resumes from; spec.md and prototype.html ride only in the start commit.
const RUN_FILES = ["plan.md", "outcome.md", "work/state.json", "work/tasks"];

/** A test of a work-relative path: true for each of the names and for every path below one. */
export const named =
  (...names: string[]) =>
  (file: string): boolean =>
    names.some((name) => file === name || file.startsWith(`${name}/`));

/**
 * Commits the paths with the run's own files as they stand now, so every commit
 * of a run carries the state another machine resumes from (saved first: a call
 * killed in the commit leaves that state with no commit), and of the work
 * files that differ from HEAD those `own` lets through (it gets them relative to
 * the work directory): another agent's work in flight never rides along.
 */
export function commitRun(ctx: Ctx, message: string, paths: string[], own: (file: string) => boolean): Committed {
  save(ctx);
  if (!inRepo(ctx)) return ctx.git.commit(ctx.root, message, paths);
  const dir = rel(ctx, ctx.specDir);
  const work = rel(ctx, ctx.work);
  const mine = ctx.git.dirty(ctx.root, [work]).filter((path) => own(path.slice(work.length + 1)));
  return ctx.git.commit(ctx.root, message, [...paths, ...RUN_FILES.map((file) => `${dir}/${file}`), ...mine]);
}
