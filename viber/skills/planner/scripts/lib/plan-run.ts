/*
 * plan-run.ts - the plan core: the five subcommands of plan.ts. The contract
 * lives in the header of ../plan.ts.
 */

import { LARGE_PLAN, checkMap, checkPlan, mapEntries } from "./plan-check.ts";
import { blockers, isIntegration, modelOf, orderOf, wavesOf } from "./plan-order.ts";
import { parsePlan, specIds, type Plan, type Task } from "./plan-parse.ts";
import type { Clock, Fs, Tree } from "./ports.ts";
import { configPath, directoriesOf } from "../../../spec-implementor/scripts/lib/build-config.ts";

// A map is an index the writer reads whole: past these it fills the context it was meant to spare.
const MAX_CODE_MAP = 60;
const MAX_TESTS_MAP = 20;
// The files a writer may open on top of the maps.
const MAX_READ = 8;

const USAGE = [
  "usage: plan.sh paths <spec>",
  "       plan.sh maps <code map> <tests map>",
  "       plan.sh check <draft> <spec> <code map>",
  "       plan.sh land <draft> <spec> <code map> <plan> [<issue>]",
  "       plan.sh order <plan>",
].join("\n");

export interface Result {
  stdout: string;
  stderr: string;
  exit: number;
}

interface Ports {
  fs: Fs;
  tree: Tree;
  clock: Clock;
}

const ok = (lines: string[], exit = 0): Result => ({ stdout: `${lines.join("\n")}\n`, stderr: "", exit });
const refuse = (text: string): Result => ({ stdout: "", stderr: `${text}\n`, exit: 2 });

function absolute(path: string, cwd: string): string {
  const slashed = path.replaceAll("\\", "/");
  return slashed.startsWith("/") || /^[A-Za-z]:/.test(slashed) ? slashed : `${cwd}/${slashed.replace(/^\.\//, "")}`;
}

/** The work directory of a spec's run: named by the directory holding the spec, so its work files sit beside the spec's own. */
function workDir(spec: string, root: string): string {
  return `${root}/.temp/viber/${spec.split("/").slice(-2, -1)[0] ?? "plan"}`;
}

// A part of a split change: its spec's directory ends in `-p<n>-of-<N>`.
const PART_RE = /^(.+)-p([1-9][0-9]*)-of-([1-9][0-9]*)$/;

/** The part a spec belongs to, read from the name of the directory holding it; null for a spec of an unsplit change. */
export function phaseOf(spec: string): { n: number; of: number; previous: string | null } | null {
  const parts = spec.split("/");
  const match = PART_RE.exec(parts.at(-2) ?? "");
  if (match === null) return null;
  const n = Number(match[2]);
  const of = Number(match[3]);
  if (n > of) return null;
  const previous = n > 1 ? [...parts.slice(0, -2), `${match[1]}-p${n - 1}-of-${of}`].join("/") : null;
  return { n, of, previous };
}

/**
 * The outcome of the part before, read where a build closed in full leaves it:
 * beside the spec (a run left in place) or in docs/<specifications>/. Closed in
 * full means `outcome.md` stands with no `plan.md` beside it, the copy every
 * start writes and only the full close removes. Null while that part is not
 * built, its directory absent included.
 */
function builtOutcome(previous: string, root: string, fs: Fs): string | null {
  const name = previous.slice(previous.lastIndexOf("/") + 1);
  const { specifications } = directoriesOf(fs.readText(configPath(root)));
  for (const dir of [previous, `${root}/docs/${specifications}/${name}`]) {
    const outcome = fs.readText(`${dir}/outcome.md`);
    if (outcome !== null && fs.readText(`${dir}/plan.md`) === null) return outcome;
  }
  return null;
}

/** The decision records the adr agent staged for a spec, as paths: every `.md` file of the run's `adr` directory. */
function staged(spec: string, root: string, fs: Fs): string[] {
  const dir = `${workDir(spec, root)}/adr`;
  return fs.list(dir).filter((name) => name.endsWith(".md")).map((name) => `${dir}/${name}`);
}

/** The time as `yyyyMMddHHmmss`, local. */
function stampOf(at: Date): string {
  const two = (value: number): string => String(value).padStart(2, "0");
  return [at.getFullYear(), two(at.getMonth() + 1), two(at.getDate()), two(at.getHours()), two(at.getMinutes()), two(at.getSeconds())].join("");
}

/** A task block without its `Model:` line: what the writer wrote. */
function written(task: Task): string {
  return task.block.filter((line) => !/^Model:/.test(line)).join("\n");
}

/**
 * The landed plan text: the hand-off line, the title, the spec, its part when
 * the change is split, the plan's own
 * path, the run's issue when it has one, the staged decision records, the
 * waves, then each task with its model.
 * Accepting a plan clears the context, so its text alone tells the build which
 * file to run and which records to move.
 */
function landedText(plan: Plan, spec: string, path: string, issue: string | null, records: string[], tree: string[]): string {
  const waves = wavesOf(orderOf(plan.tasks, tree));
  const phase = phaseOf(spec);
  const out = ["Invoke the viber:spec-implementor skill to implement this plan.", "", `# ${plan.title}`, "", `Spec: ${spec}`, ...(phase === null ? [] : [`Phase: P${phase.n} of ${phase.of}`]), `Plan: ${path}`, ...(issue === null ? [] : [`Issue: ${issue}`]), ...records.map((record) => `ADR: ${record}`), "", "## Order", ""];
  waves.forEach((wave, index) => out.push(`- Wave ${index + 1}: ${wave.map((num) => `T${num}`).join(", ")}`));
  out.push("", "## Tasks");
  for (const task of plan.tasks) {
    const block = written(task).split("\n");
    const dod = block.findIndex((line) => /^DoD:/.test(line));
    block.splice(dod, 0, `Model: ${modelOf(task)}`);
    out.push("", ...block);
  }
  return `${out.join("\n")}\n`;
}

/** Reads and checks a draft; `lines` is empty when it passes. */
function checked(draft: string, spec: string, map: string, cwd: string, ports: Ports): { plan: Plan; tree: string[]; lines: string[] } | Result {
  const text = ports.fs.readText(draft);
  if (text === null) return refuse(`plan.sh: cannot read ${draft}`);
  const specText = ports.fs.readText(spec);
  if (specText === null) return refuse(`plan.sh: cannot read ${spec}`);
  const mapText = ports.fs.readText(map);
  if (mapText === null) return refuse(`plan.sh: cannot read ${map}`);
  const ids = specIds(specText);
  if (![...ids].some((id) => id.startsWith("R"))) return refuse(`plan.sh: ${spec} holds no '- R<n>: ' item`);
  const tree = ports.tree.files(ports.tree.root(cwd));
  const plan = parsePlan(text);
  const result = checkPlan(plan, ids, tree);
  return { plan, tree, lines: [...result.open, ...result.fix, ...checkMap(plan, mapText, tree)] };
}

// A GitHub issue: `#<n>`, `<n>` or the link of an issue; a pull request link is none.
const ISSUE_RE = /^(?:#?\d+|https:\/\/github\.com\/[^/\s]+\/[^/\s]+\/issues\/\d+)$/;

/** One call of plan.ts. Never throws. */
export function runPlan(argv: string[], rawCwd: string, ports: Ports): Result {
  const cwd = rawCwd.replaceAll("\\", "/").replace(/\/$/, "");
  const [command, ...rest] = argv;
  const args = rest.map((arg) => absolute(arg, cwd));

  if (command === "paths" && args.length === 1) {
    const spec = ports.fs.readText(args[0]);
    if (spec === null) return refuse(`plan.sh: cannot read ${args[0]}`);
    // A part builds on the ones before it: only the outcome of a full close proves the part before is built.
    const phase = phaseOf(args[0]);
    if (phase !== null && phase.previous !== null && builtOutcome(phase.previous, ports.tree.root(cwd), ports.fs) === null) return ok([`OPEN: P${phase.n - 1} is not built`], 1);
    const dir = workDir(args[0], ports.tree.root(cwd));
    const lines = [`draft: ${dir}/plan-draft.md`, `code-map: ${dir}/map-code.md`, `tests-map: ${dir}/map-tests.md`, `review: ${dir}/plan-review.md`];
    // The records an earlier run of this spec staged would land beside the ones of this run.
    ports.fs.remove(`${dir}/adr`);
    // A spec with no decision has nothing to record: no `adr:` line, no agent.
    if ([...specIds(spec)].some((id) => id.startsWith("D"))) lines.push(`adr: ${dir}/adr`, `stamp: ${stampOf(ports.clock.now())}`);
    return ok(lines);
  }

  if (command === "maps" && args.length === 2) {
    const code = ports.fs.readText(args[0]);
    if (code === null) return refuse(`plan.sh: cannot read ${args[0]}`);
    const tests = ports.fs.readText(args[1]);
    if (tests === null) return refuse(`plan.sh: cannot read ${args[1]}`);
    const entries = mapEntries(code);
    const read = entries.filter((line) => /\|\s*read\s*$/.test(line)).length;
    // A `conflict` entry is the mapper's proof that the code contradicts an R: the user's to settle before any task is cut.
    const over = entries.filter((line) => /^\s*conflict\s*\|/.test(line)).map((line) => `CONFLICT: ${line.replace(/^\s*conflict\s*\|\s*/, "").trim()}`);
    if (entries.length > MAX_CODE_MAP) over.push(`OVER: the code map holds ${entries.length} entries, the limit is ${MAX_CODE_MAP}`);
    if (read > MAX_READ) over.push(`OVER: the code map marks ${read} files 'read', the limit is ${MAX_READ}`);
    if (mapEntries(tests).length > MAX_TESTS_MAP) over.push(`OVER: the tests map holds ${mapEntries(tests).length} entries, the limit is ${MAX_TESTS_MAP}`);
    return over.length > 0 ? ok(over, 1) : ok(["PASS"]);
  }

  if (command === "check" && args.length === 3) {
    const result = checked(args[0], args[1], args[2], cwd, ports);
    if ("exit" in result) return result;
    if (result.lines.length > 0) return ok(result.lines, 1);
    const count = result.plan.tasks.length;
    return ok(count > LARGE_PLAN ? ["PASS", `LARGE: ${count} tasks, past ${LARGE_PLAN}`] : ["PASS"]);
  }

  if (command === "land" && (args.length === 4 || args.length === 5)) {
    // The issue is no path: taken as given, a bare number written as `#<n>`.
    const given = args.length === 5 ? rest[4].trim() : null;
    if (given !== null && !ISSUE_RE.test(given)) return refuse(`plan.sh: ${given} is no issue number or issue link`);
    // A later part is planned in a new session that names no issue: it inherits the one the outcome of the part before carries.
    const phase = phaseOf(args[1]);
    const inherited = given === null && phase !== null && phase.previous !== null ? /^Issue:[ \t]*(\S+)\s*$/m.exec(builtOutcome(phase.previous, ports.tree.root(cwd), ports.fs) ?? "")?.[1] ?? null : null;
    const issue = given ?? (inherited !== null && ISSUE_RE.test(inherited) ? inherited : null);
    const result = checked(args[0], args[1], args[2], cwd, ports);
    if ("exit" in result) return result;
    if (result.lines.length > 0) return ok(result.lines, 1);

    const before = new Map(parsePlan(ports.fs.readText(args[3]) ?? "").tasks.map((task) => [task.num, written(task)]));
    const changed = result.plan.tasks.filter((task) => before.get(task.num) !== written(task)).map((task) => `T${task.num}`);
    const root = ports.tree.root(cwd);
    const inTree = (path: string): string => (path.startsWith(`${root}/`) ? path.slice(root.length + 1) : path);
    const records = staged(args[1], root, ports.fs).map(inTree);
    if (!ports.fs.writeText(args[3], landedText(result.plan, inTree(args[1]), inTree(args[3]), issue === null ? null : issue.replace(/^(\d)/, "#$1"), records, result.tree))) return refuse(`plan.sh: cannot write ${args[3]}`);
    return ok([`LANDED: ${args[3]}`, `changed: ${before.size === 0 ? "all" : changed.length === 0 ? "none" : changed.join(",")}`]);
  }

  if (command === "order" && args.length === 1) {
    const text = ports.fs.readText(args[0]);
    if (text === null) return refuse(`plan.sh: cannot read ${args[0]}`);
    const plan = parsePlan(text);
    if (plan.tasks.length === 0) return refuse(`plan.sh: ${args[0]} holds no task`);
    const order = orderOf(plan.tasks, ports.tree.files(ports.tree.root(cwd)));
    const lines = wavesOf(order).map((wave, index) => `wave ${index + 1}: ${wave.map((num) => `T${num}`).join(" ")}`);
    for (const task of plan.tasks) {
      const after = order.after.get(task.num) ?? [];
      const declared = new Set(blockers(task));
      lines.push(
        [
          `T${task.num}`,
          `model: ${task.fields.get("Model")?.value || modelOf(task)}`,
          `tdd: ${task.fields.get("TDD")?.value ?? ""}`,
          `integration: ${isIntegration(task)}`,
          `after: ${after.length === 0 ? "none" : after.map((num) => `T${num}${declared.has(num) ? "" : " (file)"}`).join(", ")}`,
        ].join(" | "),
      );
    }
    return ok(lines);
  }

  return refuse(USAGE);
}
