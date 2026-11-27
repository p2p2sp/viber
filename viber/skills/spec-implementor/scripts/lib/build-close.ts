/*
 * build-close.ts - the close of a run, entered once no task is in flight and
 * none can start: the final review, the tests, the project memory, the project
 * rules and the QA scenarios together, the host's extensions, the summary,
 * then the end, one step after the other. The end
 * commits a partial run as it stands; a full one it strips of its work files
 * and moves to the archive.
 */

import { configPath, directoriesOf, extensionSteps, qaOn, rulesOn } from "./build-config.ts";
import { fixText, readFindings } from "./build-findings.ts";
import { readFiles } from "./build-tasks.ts";
import { isMemoryFile } from "../../../memory/scripts/lib/memory-file.ts";
import { MEMORY_LIMIT, RULES_LIMIT, growthOf, memoryPaths, rulesPaths } from "./build-growth.ts";
import { VIBER_DIR, matchingRules } from "./build-rules.ts";
import { commitRun, inRepo, leftOf, named, rel, runOf, statusOf, under, type Ctx, type Step } from "./build-state.ts";

// Repair rounds after failing tests: a suite still red after two is reported, never looped on.
const MAX_REPAIRS = 2;
// The lines of a refused commit's output kept in the outcome: the cause stands at its top.
const REFUSAL_LINES = 20;

const note = (ctx: Ctx, ...lines: string[]): void => void ctx.state.close.notes.push(...lines);

/** Thrown when git cannot read the changes from base, its message the base: build-run.ts refuses the call, which writes no state. */
export class BaseUnreadable extends Error {}

function read(text: string | null, base: string): string {
  if (text === null) throw new BaseUnreadable(base);
  return text;
}

function send(ctx: Ctx, agent: string, name: string, lines: string[], model = ""): void {
  const close = ctx.state.close;
  close.seq++;
  const id = `${name}.${close.seq}`;
  close.open.push(id);
  ctx.out.push({ agent, id, model, lines });
}

/**
 * Writes the list of files the run changed so far to `file` of the work directory and returns it. The run directory stays
 * out: its files are the build's own. Each path of `written`, the writes of an agent's earlier try outside `before`, follows as a `W` line.
 */
function changes(ctx: Ctx, file = "changes.md", written: string[] = []): string {
  const own = `${rel(ctx, ctx.specDir)}/`;
  const list = read(ctx.git.changes(ctx.root, ctx.state.base), ctx.state.base)
    .split("\n")
    .filter((line) => !line.slice(line.indexOf("\t") + 1).startsWith(own))
    .join("\n");
  ctx.fs.writeText(`${ctx.work}/${file}`, `${[list, ...written.map((path) => `W\t${path}`)].filter((line) => line !== "").join("\n")}\n`);
  return list;
}

// The change list of each writer of the trio: its own work file, so one writer's retry never rewrites another's input.
const LIST = { memory: "memory-changes.md", rules: "rules-changes.md", qa: "qa-changes.md" };

/** A writer held to a limit of net growth: the differences between the memory and the rules writer, as data. */
interface Limited {
  name: "memory" | "rules";
  agent: string;
  limit: number;
  /** The paths it may write that differ from HEAD, none of `before`: measured, listed on a retry, restored. */
  paths: (ctx: Ctx) => string[];
  /** Its notes file in the work directory and the note line that heads its lines in the outcome. */
  notes: string;
  header: string;
  /** The brief lines before a retry's `take off:`. */
  brief: (ctx: Ctx) => string[];
  message: string;
  /** What its files are called in the restore notes. */
  what: string;
  keep: (ctx: Ctx, path: string) => boolean;
  /** Runs on the reported paths outside `before` before the commit. */
  hook?: (ctx: Ctx, paths: string[]) => void;
}

const MEMORY: Limited = {
  name: "memory",
  agent: "viber:memory-writer",
  limit: MEMORY_LIMIT,
  paths: memoryPaths,
  notes: "suggest.md",
  // The suggestions reach the outcome whatever becomes of the writes.
  header: "- memory | suggested for the root CLAUDE.md:",
  brief: (ctx) => [`spec: ${ctx.specDir}/spec.md`, `notes: ${ctx.work}/notes`, `changes: ${ctx.work}/${LIST.memory}`, `suggest: ${ctx.work}/suggest.md`],
  message: "docs(viber): project memory",
  what: "nodes",
  keep: (_ctx, path) => isMemoryFile(path),
};

const RULES: Limited = {
  name: "rules",
  agent: "viber:rules-writer",
  limit: RULES_LIMIT,
  paths: rulesPaths,
  notes: "rules.md",
  // The notes reach the outcome whatever the return.
  header: "- rules | notes:",
  brief: (ctx) => [`spec: ${ctx.specDir}/spec.md`, `changes: ${ctx.work}/${LIST.rules}`, `rules notes: ${ctx.work}/rules.md`],
  message: "docs(viber): project rules",
  what: "rules",
  // Only the plugin's own files that existed at HEAD are committed.
  keep: (ctx, path) => path.startsWith(VIBER_DIR) && ctx.git.sizeAtHead(ctx.root, path) !== null,
  hook: (ctx, paths) => removeEmptied(ctx, paths),
};

/** Sends a limited writer; `over`, the bytes of a first overrun, makes it the retry, its earlier writes listed as `W`, none of `before`. */
function sendLimited(ctx: Ctx, writer: Limited, over = 0): void {
  changes(ctx, LIST[writer.name], over > 0 ? writer.paths(ctx) : []);
  ctx.fs.remove(`${ctx.work}/${writer.notes}`);
  send(ctx, writer.agent, writer.name, [...writer.brief(ctx), ...(over > 0 ? [`take off: ${over} bytes`] : [])]);
}

/** The files a fix coder changed, whatever its `FILES:` line holds: those that differ from HEAD now and did not when it was sent. */
const fresh = (ctx: Ctx): string[] => leftOf(ctx).filter((path) => !ctx.state.close.left.includes(path));

/**
 * Commits the reported files `keep` lets through, and `more`, with the run's own files and the work files `own` lets through.
 * None of them changed: no commit. A refusal is noted and the change stays in the tree.
 */
function commitFiles(ctx: Ctx, label: string, message: string, files: { paths: string[]; bad: string[] }, own: (file: string) => boolean, keep: (path: string) => boolean = () => true, more: string[] = []): void {
  const left = [...files.bad, ...files.paths.filter((path) => !keep(path))];
  if (left.length > 0) note(ctx, `- ${label} | not committed, outside what this step may write | ${left.join(", ")}`);
  const kept = [...new Set([...files.paths.filter(keep), ...more])];
  if (ctx.git.dirty(ctx.root, kept).length === 0) return;
  const done = commitRun(ctx, message, kept, own);
  if (done.kind === "refused") note(ctx, `- ${label} | git refused the commit, the change is left in the tree`, ...under(done.output).slice(0, REFUSAL_LINES));
}

/** Removes each of `paths` of length 0 under VIBER_DIR, then the directory once no entry is left. Runs before the commit, so the removal is committed. */
export function removeEmptied(ctx: Ctx, paths: string[]): void {
  for (const path of paths) {
    if (path.startsWith(VIBER_DIR) && ctx.fs.readText(`${ctx.root}/${path}`) === "") ctx.fs.remove(`${ctx.root}/${path}`);
  }
  ctx.fs.removeEmptyDir(`${ctx.root}/${VIBER_DIR.slice(0, -1)}`);
}

/** What the finalizer cannot derive from the files it reads: the state of each task, the requirements left undelivered, the test verdict, the commits. */
function facts(ctx: Ctx): string {
  const done = ctx.tasks.filter((task) => runOf(ctx, task.num).state === "done").length;
  const out = ["# Facts", "", `tasks: ${done}/${ctx.tasks.length} done`, `tests: ${ctx.state.close.tests}`, `base: ${ctx.state.base}`, "", "## Tasks", ""];
  for (const task of ctx.tasks) out.push(`- T${task.num} | ${statusOf(runOf(ctx, task.num))} | ${task.title}`);
  out.push("", "## Not delivered", "");
  const open = ctx.tasks
    .filter((task) => runOf(ctx, task.num).state !== "done")
    .flatMap((task) => [...(task.fields.get("Covers")?.value ?? "").matchAll(/\bR\d+\b/g)].map((id) => `- ${id[0]} | T${task.num} ${runOf(ctx, task.num).state}`));
  out.push(...(open.length > 0 ? open : ["- none"]), "", "## Commits", "", read(ctx.git.log(ctx.root, ctx.state.base), ctx.state.base) || "none");
  return `${out.join("\n")}\n`;
}

/**
 * Ends the run and sets the lines under END. A partial run is committed as it
 * stands, so another machine resumes it. A full one inside the repository
 * loses its work files, moves from docs/<runs>/ to docs/<specifications>/ (one
 * lying elsewhere, or whose archive exists, stays in place), leaving no empty
 * docs/<runs>/, and is committed.
 */
function end(ctx: Ctx): void {
  const close = ctx.state.close;
  const open = ctx.tasks.filter((task) => runOf(ctx, task.num).state !== "done").length;
  close.end = [`Tasks: ${ctx.tasks.length}. With problems: ${open}.`];
  if (close.tests === "FAIL") close.end.push("The tests fail.");
  const left = leftOf(ctx);
  if (left.length > 0) close.end.push(`Left uncommitted: ${left.join(", ")}`);
  if (!(ctx.fs.readText(`${ctx.specDir}/outcome.md`) ?? "").includes("## Summary")) close.end.push("The outcome has no summary.");

  let dir = ctx.specDir;
  const refused = (): string => `Git refused the commit: ${rel(ctx, dir)} is left uncommitted.`;
  if (close.partial) {
    // The commit holds the lines under END too, so the tree is clean after it.
    close.end.push(`Outcome: ${rel(ctx, dir)}/outcome.md`);
    if (commitRun(ctx, `chore(viber): run state ${ctx.name}`, inRepo(ctx) ? [rel(ctx, dir)] : [], () => true).kind === "refused") close.end.splice(-1, 0, refused());
    return;
  }
  if (inRepo(ctx)) {
    // The work files and the scratch of the spec and planner skills served the run only: the archive keeps the spec, its mockup, the outcome and the QA scenarios.
    for (const path of [ctx.work, `${dir}/plan.md`, `${ctx.root}/.temp/viber/${ctx.name}`]) ctx.fs.remove(path);
    const { runs, specifications } = directoriesOf(ctx.fs.readText(configPath(ctx.root)));
    const archive = `${ctx.root}/docs/${specifications}/${ctx.name}`;
    if (dir === `${ctx.root}/docs/${runs}/${ctx.name}` && !ctx.fs.exists(archive) && ctx.fs.move(dir, archive)) {
      dir = archive;
      ctx.fs.removeEmptyDir(`${ctx.root}/docs/${runs}`);
    }
    const paths = [...new Set([rel(ctx, ctx.specDir), rel(ctx, dir)])];
    if (ctx.git.commit(ctx.root, `chore(viber): archive ${ctx.name}`, paths).kind === "refused") close.end.push(refused());
  }
  close.end.push(`Outcome: ${rel(ctx, dir)}/outcome.md`);
}

/** Enters a step: sends its agents, or moves on when it has nothing to do. */
function enter(ctx: Ctx, step: Step): void {
  const close = ctx.state.close;
  const work = ctx.work;
  const spec = `spec: ${ctx.specDir}/spec.md`;
  const plan = `plan: ${ctx.specDir}/plan.md`;
  close.step = step;

  if (step === "final-review") {
    if (changes(ctx) === "") return enter(ctx, "tests");
    ctx.fs.remove(`${work}/review/final.md`);
    send(ctx, "viber:final-reviewer", "final-review", [spec, plan, `base: ${ctx.state.base}`, `changes: ${work}/changes.md`, `report: ${work}/review/final.md`]);
  } else if (step === "final-fix") {
    close.left = leftOf(ctx);
    send(ctx, "viber:task-coder", "final-fix", [spec, `fix: ${work}/fix/final-review.md`, `notes: ${work}/notes/final-fix.md`, `blocked: ${work}/blocked/final-fix.md`, `refs: ${ctx.refs}`], "opus");
  } else if (step === "tests") {
    ctx.fs.remove(`${work}/review/tests.md`);
    send(ctx, "viber:final-tester", "tests", [`report: ${work}/review/tests.md`]);
  } else if (step === "test-fix") {
    changes(ctx);
    close.left = leftOf(ctx);
    // No list of failures from before the run exists: the coder tells them apart by the diff from base.
    send(
      ctx,
      "viber:task-coder",
      "test-fix",
      [spec, `fix: ${work}/fix/tests-${close.round}.md`, `base: ${ctx.state.base}`, `changes: ${work}/changes.md`, `notes: ${work}/notes/test-fix.md`, `blocked: ${work}/blocked/test-fix.md`, `refs: ${ctx.refs}`],
      "opus",
    );
  } else if (step === "writers") {
    // Entered afresh, a resume too: the writes of an earlier try stay in the tree and count toward the limits; the files of `before` never count.
    close.overruns = { memory: 0, rules: 0 };
    const yaml = ctx.fs.readText(configPath(ctx.root));
    const listed = changes(ctx);
    // No change: no memory writer. `build.rules: false` or no matching rule: no rules writer. `build.qa` other than `true`: no QA writer.
    if (listed !== "") sendLimited(ctx, MEMORY);
    if (rulesOn(yaml) && matchingRules(ctx, listed).length > 0) sendLimited(ctx, RULES);
    if (qaOn(yaml)) {
      changes(ctx, LIST.qa);
      send(ctx, "viber:qa-writer", "qa", [spec, `notes: ${work}/notes`, `changes: ${work}/${LIST.qa}`, `refs: ${ctx.refs}`, `out: ${ctx.specDir}`]);
    }
    if (close.open.length === 0) enter(ctx, "extensions");
  } else if (step === "extensions") {
    const { steps, bad } = extensionSteps(ctx.fs.readText(configPath(ctx.root)));
    if (close.ext === 0 && bad.length > 0) note(ctx, `- extensions | no agent name, not run | ${bad.join(", ")}`);
    for (; close.ext < steps.length; close.ext++) {
      const names = steps[close.ext].filter((name) => ctx.fs.exists(`${ctx.root}/.claude/agents/${name}.md`));
      const missing = steps[close.ext].filter((name) => !names.includes(name));
      if (missing.length > 0) note(ctx, `- extensions | no .claude/agents file, not run | ${missing.join(", ")}`);
      if (names.length === 0) continue;
      changes(ctx);
      for (const name of names) {
        send(ctx, name, `ext.${name}`, [spec, plan, `outcome: ${ctx.specDir}/outcome.md`, `notes: ${work}/notes`, `changes: ${work}/changes.md`, `out: ${work}/ext/${name}`]);
      }
      return;
    }
    enter(ctx, "finalize");
  } else if (step === "finalize") {
    ctx.fs.writeText(`${work}/facts.md`, facts(ctx));
    send(ctx, "viber:finalizer", "finalize", [spec, plan, `outcome: ${ctx.specDir}/outcome.md`, `facts: ${work}/facts.md`, `notes: ${work}/notes`]);
  } else if (step === "end") end(ctx);
}

/** Moves the close on. A run with a held or skipped task goes straight to its summary, so a later start resumes it. */
export function closeStep(ctx: Ctx): void {
  const close = ctx.state.close;
  if (close.open.length > 0 || close.step === "end") return;
  // A state written before the joint step resumes it from its start.
  if (close.step === "memory" || close.step === "rules") return enter(ctx, "writers");
  if (close.step !== "tasks") return enter(ctx, close.step);
  close.partial = ctx.tasks.some((task) => runOf(ctx, task.num).state !== "done");
  enter(ctx, close.partial ? "finalize" : "final-review");
}

/** The return of the close dispatch `id`. One the close does not await changes nothing. */
export function closeEvent(ctx: Ctx, id: string, word: string, files: string): void {
  const close = ctx.state.close;
  if (!close.open.includes(id)) return;
  close.open = close.open.filter((each) => each !== id);
  const work = ctx.work;

  // The trio is recognised by the id: its writers return in any order, and extensions wait for the last.
  if (/^(memory|rules|qa)\./.test(id)) {
    trioEvent(ctx, id, word, files);
    if (close.open.length === 0) enter(ctx, "extensions");
  } else if (close.step === "final-review") {
    const report = ctx.fs.readText(`${work}/review/final.md`);
    const found = readFindings(report ?? "");
    if (report === null && word !== "PASS") note(ctx, "- final review | returned no report");
    note(ctx, ...found.minor.map((line) => line.replace(/^- /, "- final review | ")), ...found.malformed.map((line) => `- final review | malformed | ${line.replace(/^- /, "")}`));
    if (found.critical.length === 0) return enter(ctx, "tests");
    close.found = found.critical;
    ctx.fs.writeText(`${work}/fix/final-review.md`, fixText(found.critical));
    enter(ctx, "final-fix");
  } else if (close.step === "final-fix") {
    // One fix and no second review: the findings stay in the outcome either way.
    note(ctx, `- final review | ${word === "DONE" ? "fixed, not reviewed again" : `not fixed, the coder returned ${word}`}:`, ...close.found.flatMap((finding) => under(finding)));
    close.found = [];
    if (word === "DONE") commitFiles(ctx, "final review", "fix(viber): final review", readFiles(ctx, files), named("review/final.md", "fix/final-review.md", "notes/final-fix.md", "blocked/final-fix.md"), () => true, fresh(ctx));
    enter(ctx, "tests");
  } else if (close.step === "tests") {
    const found = readFindings(ctx.fs.readText(`${work}/review/tests.md`) ?? "");
    if (word === "PASS" || word === "SKIP") {
      close.tests = word;
      return enter(ctx, "writers");
    }
    if (word !== "FAIL" && found.critical.length === 0) {
      note(ctx, "- tests | the tester returned no verdict");
      return enter(ctx, "writers");
    }
    close.tests = "FAIL";
    if (found.critical.length > 0 && close.round < MAX_REPAIRS) {
      close.round++;
      ctx.fs.writeText(`${work}/fix/tests-${close.round}.md`, fixText(found.critical));
      return enter(ctx, "test-fix");
    }
    note(ctx, `- tests | failing after ${close.round} repair rounds:`, ...found.critical.flatMap((finding) => under(finding)));
    enter(ctx, "writers");
  } else if (close.step === "test-fix") {
    if (word !== "DONE") {
      note(ctx, `- tests | failing, the repair coder returned ${word}:`, ...under(ctx.fs.readText(`${work}/fix/tests-${close.round}.md`) ?? ""));
      return enter(ctx, "writers");
    }
    commitFiles(ctx, "tests", "fix(viber): post-test repair", readFiles(ctx, files), named("review/tests.md", `fix/tests-${close.round}.md`, "notes/test-fix.md", "blocked/test-fix.md"), () => true, fresh(ctx));
    enter(ctx, "tests");
  } else if (close.step === "extensions") {
    const name = id.slice("ext.".length, id.lastIndexOf("."));
    if (word === "WRITTEN") commitFiles(ctx, `extension ${name}`, `chore(viber): extension ${name}`, readFiles(ctx, files), named(`ext/${name}`));
    else if (word !== "NONE") note(ctx, `- extension ${name} | returned ${word}`);
    if (close.open.length > 0) return;
    close.ext++;
    enter(ctx, "extensions");
  } else if (close.step === "finalize") enter(ctx, "end");
}

/** The return of a writer of the trio. */
function trioEvent(ctx: Ctx, id: string, word: string, files: string): void {
  // A return awaited under a state written before the joint step: its counters start here.
  ctx.state.close.overruns ??= { memory: 0, rules: 0 };
  if (id.startsWith("memory.")) limitedEvent(ctx, MEMORY, word, files);
  else if (id.startsWith("rules.")) limitedEvent(ctx, RULES, word, files);
  else if (word === "WRITTEN") {
    // Of the run directory only the two scenario files: another writer's work in flight never rides along.
    const dir = rel(ctx, ctx.specDir);
    const qa = `${dir}/qa.md`;
    commitFiles(ctx, "qa", "docs(viber): qa scenarios", readFiles(ctx, files), named(LIST.qa), (path) => path === qa || path === `${dir}/qa.e2e.md`);
    // Only a reported qa.md that HEAD holds as it stands: a refused commit posts nothing, qa.e2e.md never.
    if (ctx.issue !== null && readFiles(ctx, files).paths.includes(qa) && ctx.git.holds(ctx.root, qa) && ctx.git.dirty(ctx.root, [qa]).length === 0) postQa(ctx, qa);
  } else if (word !== "NONE") note(ctx, `- qa | the writer returned ${word}`);
}

/** The return of a limited writer. Over its limit, it is sent back once, on its own counter; a second overrun restores its files to HEAD, none of `before`. */
function limitedEvent(ctx: Ctx, writer: Limited, word: string, value: string): void {
  const close = ctx.state.close;
  const name = writer.name;
  const noted = under(ctx.fs.readText(`${ctx.work}/${writer.notes}`) ?? "");
  if (noted.length > 0) note(ctx, writer.header, ...noted);
  const paths = writer.paths(ctx);
  const over = growthOf(ctx, paths) - writer.limit;
  if (over > 0 && close.overruns[name] === 0) {
    close.overruns[name] = 1;
    note(ctx, `- ${name} | ${over} bytes over the limit, the writer dispatched once more`);
    return sendLimited(ctx, writer, over);
  }
  if (over > 0) {
    note(ctx, `- ${name} | ${over} bytes over the limit after the retry, the ${writer.what} are restored to HEAD, any the user changed before the run left as they are`);
    if (!ctx.git.restore(ctx.root, paths)) note(ctx, `- ${name} | restore to HEAD failed, the ${writer.what} are left in the tree`);
  } else if (word === "UPDATED") {
    const files = readFiles(ctx, value);
    const before = ctx.state.before ?? [];
    const user = files.paths.filter((path) => before.includes(path));
    if (user.length > 0) note(ctx, `- ${name} | not committed, the user's file before the run | ${user.join(", ")}`);
    const own = { paths: files.paths.filter((path) => !before.includes(path)), bad: files.bad };
    writer.hook?.(ctx, own.paths);
    commitFiles(ctx, name, writer.message, own, named(writer.notes, LIST[name]), (path) => writer.keep(ctx, path));
  } else if (word !== "NONE") note(ctx, `- ${name} | the writer returned ${word}`);
}

/**
 * Posts the committed qa.md to the run's issue as one comment: a marker naming
 * it, then the file verbatim. A comment of the issue holding that marker already
 * (a resumed run) posts nothing. No gh, or gh failing, is noted and the build
 * goes on; nothing is retried.
 */
function postQa(ctx: Ctx, qa: string): void {
  const issue = ctx.issue ?? "";
  const skip = (why: string, output = ""): void => note(ctx, `- qa | not posted to issue ${issue}, ${why}`, ...under(output).slice(0, REFUSAL_LINES));
  const marker = `<!-- viber:qa ${qa} -->`;
  const seen = ctx.gh.run(ctx.root, ["issue", "view", issue, "--json", "comments", "--jq", ".comments[].body"]);
  if (seen.exit === 127) return skip("gh is not installed");
  if (seen.exit !== 0) return skip("gh could not read its comments:", seen.err);
  if (seen.out.includes(marker)) return;
  // Beside the lock, out of every commit.
  const body = `${ctx.root}/.temp/viber/${ctx.name}/qa-comment.md`;
  if (!ctx.fs.writeText(body, `${marker}\n${ctx.fs.readText(`${ctx.root}/${qa}`) ?? ""}`)) return skip(`cannot write ${rel(ctx, body)}`);
  const done = ctx.gh.run(ctx.root, ["issue", "comment", issue, "--body-file", body]);
  ctx.fs.remove(body);
  if (done.exit !== 0) skip("gh could not post the comment:", `${done.err}${done.out}`);
}
