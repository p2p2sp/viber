/*
 * build-tasks.ts - the task loop: which tasks start, what a coder's and a
 * reviewer's return leads to, when a task is committed and when it is held.
 * Every decision is a rule over the state, the tree and the report file.
 */

import { fileEntries, isIntegration, modelOf, ownedFiles } from "../../../planner/scripts/lib/plan-order.ts";
import type { Task } from "../../../planner/scripts/lib/plan-parse.ts";
import { fixText, readFindings } from "./build-findings.ts";
import { commitRun, runOf, under, type Ctx } from "./build-state.ts";

// Agents at once: past it their returns pile up in the one context that routes them.
const MAX_FLIGHT = 5;
// Coder returns that may fail in a row: the second runs on the strongest model, a third would repeat it.
const MAX_ATTEMPTS = 2;
// Fix rounds after a failed review or a refused commit: findings standing after two are not the coder's to settle.
const MAX_ROUNDS = 2;
// Reviews that may return nothing before the task is committed unreviewed.
const MAX_LOST = 2;

const flying = (ctx: Ctx): Task[] => ctx.tasks.filter((task) => ["coder", "review"].includes(runOf(ctx, task.num).state));

/** A task that changes no runtime behaviour has nothing a review could prove. */
const reviewed = (task: Task): boolean => task.fields.get("TDD")?.value !== "none (no-runtime)";

/** The `ui:` line of a task carrying `UI:`: the ui-designer skill's references, beside the plugin's shared ones, whose files that line names. */
const uiLine = (ctx: Ctx, task: Task): string[] => (task.fields.has("UI") ? [`ui: ${ctx.refs.replace(/\/[^/]+$/, "")}/skills/ui-designer/references`] : []);

/** What the task commits: its `Files`, a glob as the files it matches now, and the paths its coder reported. */
export function taskPaths(ctx: Ctx, task: Task): string[] {
  return [...new Set([...ownedFiles(task, ctx.files()), ...runOf(ctx, task.num).extra])];
}

/** The paths of a `FILES:` value as repo-relative ones; `bad` holds, as written, each that is no file of the repository (a directory included) or lies under .temp/. */
export function readFiles(ctx: Ctx, value: string): { paths: string[]; bad: string[] } {
  const paths: string[] = [];
  const bad: string[] = [];
  for (const raw of value.split(",").map((part) => part.trim().replace(/^[`'"]+|[`'"]+$/g, ""))) {
    if (raw === "" || raw === "none") continue;
    let path = raw.replaceAll("\\", "/").replace(/^\.\//, "").replace(/\/$/, "");
    if (path.startsWith(`${ctx.root}/`)) path = path.slice(ctx.root.length + 1);
    const inside = path !== "" && !path.startsWith("/") && !/^[A-Za-z]:/.test(path) && !path.split("/").includes("..") && !path.startsWith(".temp/");
    // A directory reads as no text and has no size at HEAD; a deleted file has one.
    const file = ctx.fs.exists(`${ctx.root}/${path}`) ? ctx.fs.readText(`${ctx.root}/${path}`) !== null : ctx.git.sizeAtHead(ctx.root, path) !== null;
    if (inside && file) paths.push(path);
    else bad.push(raw);
  }
  return { paths, bad };
}

/**
 * Holds the tree to the task's `Files` and reads the coder's `FILES:`. Returns
 * the fix lines of what is wrong, none when the tree passes. A reported path
 * another unfinished task owns or reported is that task's to commit: noted,
 * never taken.
 */
function treeCheck(ctx: Ctx, task: Task, value: string): string[] {
  const run = runOf(ctx, task.num);
  const lines: string[] = [];
  const item = (where: string, what: string, fix: string) => lines.push(`- Critical | ${where} | Files | ${what} | ${fix}`);
  for (const entry of fileEntries(task.fields.get("Files")?.value ?? "").entries) {
    if (entry.kind === "glob") continue;
    const there = ctx.fs.exists(`${ctx.root}/${entry.path}`);
    if (entry.kind === "create" && !there) item(entry.path, "Files marks it '+' and the tree does not hold it", "create it");
    if (entry.kind === "delete" && there) item(entry.path, "Files marks it '-' and the tree still holds it", "delete it");
    if (entry.kind === "modify" && !there) item(entry.path, "Files names it and the tree does not hold it", "restore it and make the task's change in it");
  }
  const files = readFiles(ctx, value);
  for (const raw of files.bad) item("-", `FILES names '${raw}', which is no file of this repository outside .temp/`, "return in FILES only repo-relative paths of files this task changed");
  const own = ownedFiles(task, ctx.files());
  for (const path of files.paths) {
    if (own.has(path) || run.extra.includes(path)) continue;
    const owner = ctx.tasks.find((each) => each.num !== task.num && runOf(ctx, each.num).state !== "done" && (ownedFiles(each, ctx.files()).has(path) || runOf(ctx, each.num).extra.includes(path)));
    if (owner === undefined) run.extra.push(path);
    else {
      const where = ownedFiles(owner, ctx.files()).has(path) ? "in Files of" : "reported by";
      const note = `- conflict | ${path} | ${where} T${owner.num}, left out of the commit of T${task.num}`;
      if (!run.notes.includes(note)) run.notes.push(note);
    }
  }
  return lines;
}

/** Sends the task's coder: on the plan's model the first time, on the strongest every time after. */
function sendCoder(ctx: Ctx, task: Task): void {
  const run = runOf(ctx, task.num);
  const model = run.seq === 0 ? task.fields.get("Model")?.value || modelOf(task) : "opus";
  run.state = "coder";
  run.seq++;
  run.open = `T${task.num}.coder.${run.seq}`;
  ctx.out.push({
    agent: "viber:task-coder",
    id: run.open,
    model,
    lines: [
      `task: ${ctx.work}/tasks/T${task.num}.md`,
      ...(run.fix === null ? [] : [`fix: ${ctx.work}/${run.fix}`]),
      `notes: ${ctx.work}/notes/T${task.num}.md`,
      `blocked: ${ctx.work}/blocked/T${task.num}.md`,
      `refs: ${ctx.refs}`,
      ...uiLine(ctx, task),
    ],
  });
}

/** Sends the task's reviewer; after a failed round it rechecks that round's findings against the coder's notes. */
function sendReviewer(ctx: Ctx, task: Task): void {
  const run = runOf(ctx, task.num);
  run.state = "review";
  run.seq++;
  run.open = `T${task.num}.review.${run.seq}`;
  run.report = `review/T${task.num}-${run.seq}.md`;
  ctx.fs.remove(`${ctx.work}/${run.report}`);
  ctx.out.push({
    agent: "viber:task-reviewer",
    id: run.open,
    model: "",
    lines: [
      `task: ${ctx.work}/tasks/T${task.num}.md`,
      `diff: ${ctx.work}/diff/T${task.num}.diff`,
      `report: ${ctx.work}/${run.report}`,
      `refs: ${ctx.refs}`,
      ...uiLine(ctx, task),
      ...(run.previous === null ? [] : [`previous: ${ctx.work}/${run.previous}`, `notes: ${ctx.work}/notes/T${task.num}.md`]),
    ],
  });
}

/** Holds the task with what is left of it, and skips every task that runs after a held or skipped one. */
function hold(ctx: Ctx, task: Task, why: string, standing: string): void {
  const run = runOf(ctx, task.num);
  run.state = "held";
  run.open = null;
  run.why = why;
  run.notes.push(`- held | ${why}`, ...standing.split("\n").filter((line) => line.trim() !== ""));
  if (why === "coder blocked") run.notes.push("- blocked | the coder's reason:", ...under(ctx.fs.readText(`${ctx.work}/blocked/T${task.num}.md`) ?? "none written"));
  const left = ctx.git.dirty(ctx.root, taskPaths(ctx, task));
  if (left.length > 0) run.notes.push(`- left in the tree | ${left.join(", ")}`);
  // `after` names lower numbers only, so one pass in plan order reaches every dependant.
  for (const each of ctx.tasks) {
    const theirs = runOf(ctx, each.num);
    const cause = theirs.after.find((num) => ["held", "skipped"].includes(runOf(ctx, num).state));
    if (theirs.state === "todo" && cause !== undefined) {
      theirs.state = "skipped";
      theirs.why = `after T${cause}`;
    }
  }
}

/** One more failed coder return: the coder again, or the task held at the limit. */
function retry(ctx: Ctx, task: Task, why: string): void {
  const run = runOf(ctx, task.num);
  run.attempt++;
  if (run.attempt >= MAX_ATTEMPTS) hold(ctx, task, why, run.fix === null ? "" : (ctx.fs.readText(`${ctx.work}/${run.fix}`) ?? ""));
  else sendCoder(ctx, task);
}

/** Opens a fix round on the findings, or holds the task when its rounds are spent. */
function fixRound(ctx: Ctx, task: Task, why: string, findings: string): void {
  const run = runOf(ctx, task.num);
  if (run.round >= MAX_ROUNDS) return hold(ctx, task, why, findings);
  run.round++;
  run.fix = `fix/T${task.num}-${run.round}.md`;
  run.previous = run.fix;
  ctx.fs.writeText(`${ctx.work}/${run.fix}`, findings);
  sendCoder(ctx, task);
}

/** Commits a done task's paths with the run's own files and its work files (notes, blocked, diff, reports, fix files). A hook that refuses the commit opens a fix round on what it printed. */
function commitDone(ctx: Ctx, task: Task, paths: string[]): void {
  const run = runOf(ctx, task.num);
  const done = commitRun(ctx, `T${task.num} - ${task.title}`, paths, (file) => new RegExp(`^(notes|blocked|diff|review|fix)/T${task.num}[.-]`).test(file));
  if (done.kind === "refused") {
    run.why = "";
    const item = "- Critical | - | Commit | git refused the commit of this task, its output is on the lines below | change the code until the commit passes, never the hook or its configuration";
    return fixRound(ctx, task, "commit refused", `${[item, ...under(done.output)].join("\n")}\n`);
  }
  run.sha = done.kind === "done" ? done.sha : null;
}

/**
 * Commits the task's paths, the state carrying the task as done. A task that
 * changed nothing is done with no commit: the run's files alone would make one.
 */
function commitTask(ctx: Ctx, task: Task, mark: string): void {
  const run = runOf(ctx, task.num);
  const paths = taskPaths(ctx, task);
  const changed = ctx.git.dirty(ctx.root, paths).length > 0;
  run.state = "done";
  run.open = null;
  run.why = [changed ? "" : "no-change", mark].filter((part) => part !== "").join(", ");
  if (changed) commitDone(ctx, task, paths);
}

/**
 * The commit of a done task the state holds no sha of, `log` being `git log
 * --oneline <base>..HEAD` as lines: its sha is read from the line of its subject
 * (a run resumed from its commits, a commit whose call died after git made it).
 * With none and its paths still differing from HEAD, the call that committed it
 * died first: they are committed now. A task done with no change, or whose
 * paths are clean, is left as it is. Returns the numbers of the tasks it gave a
 * sha or a commit try: the call that died in their commit printed no entry.
 */
export function finishCommits(ctx: Ctx, log: string[]): number[] {
  const finished: number[] = [];
  for (const task of ctx.tasks) {
    const run = runOf(ctx, task.num);
    if (run.state !== "done" || run.sha !== null || run.why.includes("no-change")) continue;
    run.sha = log.find((line) => line.slice(line.indexOf(" ") + 1) === `T${task.num} - ${task.title}`)?.split(" ")[0] ?? null;
    if (run.sha !== null) {
      finished.push(task.num);
      continue;
    }
    const paths = taskPaths(ctx, task);
    if (ctx.git.dirty(ctx.root, paths).length === 0) continue;
    commitDone(ctx, task, paths);
    finished.push(task.num);
  }
  return finished;
}

function coderBack(ctx: Ctx, task: Task, word: string, files: string): void {
  const run = runOf(ctx, task.num);
  if (word !== "DONE") return retry(ctx, task, word === "BLOCKED" ? "coder blocked" : "coder lost");
  const wrong = treeCheck(ctx, task, files);
  if (wrong.length > 0) {
    // The findings of the round stand until a review clears them: the coder gets them with the tree's.
    const standing = run.previous === null ? "" : (ctx.fs.readText(`${ctx.work}/${run.previous}`) ?? "");
    run.fix = `fix/T${task.num}-check.md`;
    ctx.fs.writeText(`${ctx.work}/${run.fix}`, `${wrong.join("\n")}\n${standing}`);
    return retry(ctx, task, "tree check");
  }
  run.attempt = 0;
  ctx.fs.remove(`${ctx.work}/blocked/T${task.num}.md`);
  ctx.fs.writeText(`${ctx.work}/diff/T${task.num}.diff`, ctx.git.diff(ctx.root, taskPaths(ctx, task)));
  if (reviewed(task)) sendReviewer(ctx, task);
  else commitTask(ctx, task, "");
}

function reviewBack(ctx: Ctx, task: Task, word: string): void {
  const run = runOf(ctx, task.num);
  const report = run.report === null ? null : ctx.fs.readText(`${ctx.work}/${run.report}`);
  const found = readFindings(report ?? "");
  // The report is the verdict. With none, or one with nothing to fix under no VERDICT line, the review said nothing.
  const silent = report === null ? word !== "PASS" : found.critical.length === 0 && word !== "PASS" && word !== "FAIL";
  if (silent) {
    run.lost++;
    if (run.lost >= MAX_LOST) commitTask(ctx, task, "unreviewed");
    else sendReviewer(ctx, task);
    return;
  }
  run.notes.push(...found.minor, ...found.malformed.map((line) => `- malformed | ${line.replace(/^- /, "")}`));
  if (found.critical.length > 0) return fixRound(ctx, task, "review", fixText(found.critical));
  if (word === "FAIL") run.notes.push("- review | returned FAIL with no finding a coder can act on");
  commitTask(ctx, task, "");
}

/** Starts every task whose turn has come: all it runs after are done, one integration task at a time. */
export function dispatchReady(ctx: Ctx): void {
  for (const task of ctx.tasks) {
    const run = runOf(ctx, task.num);
    if (run.state !== "todo" || !run.after.every((num) => runOf(ctx, num)?.state === "done")) continue;
    const inFlight = flying(ctx);
    if (inFlight.length >= MAX_FLIGHT) return;
    // Integration tests share real dependencies: two tasks running them at once break each other.
    if (isIntegration(task) && inFlight.some(isIntegration)) continue;
    sendCoder(ctx, task);
  }
}

export const tasksInFlight = (ctx: Ctx): boolean => flying(ctx).length > 0;

/** The return of the dispatch `id`. One the task does not await (a repeat, a stale agent) changes nothing: a done task its call left uncommitted is finishCommits' to commit. */
export function taskEvent(ctx: Ctx, num: number, id: string, word: string, files: string): void {
  const task = ctx.tasks.find((each) => each.num === num);
  if (task === undefined || runOf(ctx, num).open !== id) return;
  if (runOf(ctx, num).state === "coder") coderBack(ctx, task, word, files);
  else reviewBack(ctx, task, word);
}
