/*
 * task-ready.ts - the task-ready core: which tasks of a landed plan may run now,
 * and the memory of which task waited on which path of which other task. The
 * contract lives in the header of ../scripts/task-ready.ts.
 */

import { absolutePath } from "./abs-path.ts";
import { drivePath } from "./drive-path.ts";
import { answer, fail, projectRoot, type MapAnswer } from "./map-answer.ts";
import { readPlan } from "./plan-index/read.ts";
import { readState } from "./plan-index/state.ts";
import { bare, entriesOf, linesOf, trim } from "./plan-index/text.ts";
import type { Fs, Git } from "./ports.ts";
import { rootRelative } from "./root-relative.ts";

/** Coders running tests at once saturate the CPU past this many. */
const CAP = 10;
const USAGE = "usage: task-ready.sh <plan-file> ready --started <mark> [--flight <id>,..] [--held <id>,..] [--waiting <id>,..] [--lost <id>,..] | <plan-file> wait <id> --started <mark> [--flight <id>,..] <path>[,<path>]";
const ABSOLUTE = /^(\/|[A-Za-z]:\/)/;
const SEQUENCED = /^decision: ([^ \t:]+): sequenced after ([^ \t:]+): both need (.+)$/;
/** A line of the waits file: `wait:` and `sequence:` name one other task, `free:` the tasks in flight at that wait. */
const KEPT = /^(wait|free|sequence): ([^ \t|]+) \| ([^ \t|]+) \| (.+)$/;

export interface Sequenced {
  /** The task that runs second. */
  id: string;
  /** The task it runs after. */
  after: string;
  path: string;
}

/** The pairs the `decision: <id>: sequenced after <other>: both need <path>` lines of status.md put in sequence, in file order. */
export function sequencedOf(decisions: string[]): Sequenced[] {
  return decisions.flatMap((line) => {
    const found = SEQUENCED.exec(line.replace(/\r$/, ""));
    return found === null ? [] : [{ id: found[1], after: found[2], path: found[3] }];
  });
}

type Reads = Pick<Fs, "kind" | "readText" | "realPath">;

/** A Files entry, an extras line or a named path as the repo-relative path it names: a backslash read as "/", one leading "./" cut, an absolute path below the root made relative. */
export function repoPath(raw: string, root: string, fs: Pick<Fs, "kind" | "realPath">): string {
  const path = drivePath(trim(raw).replaceAll("\\", "/"), root);
  return ABSOLUTE.test(path) ? rootRelative(absolutePath(path, root), root, fs) : bare(path);
}

/** Whether task id claims the path: its Files value, or a line of one of its two extras files under the run directory. */
export function claims(id: string, files: string, path: string, dir: string, root: string, fs: Reads): boolean {
  const extras = [`${dir}/work/${id}-extra.md`, `${dir}/work/${id}-extra-review.md`].flatMap((file) => linesOf(fs.readText(file) ?? ""));
  return [...files.split(","), ...extras].some((entry) => repoPath(entry, root, fs) === path);
}

/** The entries of a comma-separated argument, blanks around each cut, the empty ones dropped. */
const listed = (value: string): string[] => value.split(",").map(trim).filter((entry) => entry !== "");

/** The stdout, stderr and exit code of one task-ready call. Never throws. */
export function runTaskReady(argv: string[], cwd: string, ports: { fs: Fs; git: Pick<Git, "repoRoot"> }): MapAnswer {
  const { fs, git } = ports;
  const [given = "", mode = "", ...rest] = argv;
  const flags = new Map<string, string>();
  const waiter = mode === "wait" ? (rest.shift() ?? "") : "";
  const allowed = mode === "ready" ? ["--started", "--flight", "--held", "--waiting", "--lost"] : ["--started", "--flight"];
  while (rest.length >= 2 && allowed.includes(rest[0]) && !flags.has(rest[0])) flags.set(rest.shift() ?? "", rest.shift() ?? "");
  const mark = flags.get("--started") ?? "";
  const named = mode === "wait" && rest.length === 1 ? listed(rest[0]) : [];
  const usable = mode === "ready" ? rest.length === 0 : mode === "wait" && waiter !== "" && named.length > 0;
  if (given === "" || mark === "" || !usable) return fail(USAGE);

  const root = projectRoot(cwd, git);
  const plan = absolutePath(given.replaceAll("\\", "/"), cwd.replaceAll("\\", "/"));
  const text = fs.kind(plan) === "file" ? fs.readText(plan) : null;
  if (text === null) return fail(`plan file not found: ${given}`);
  const dir = plan.slice(0, plan.lastIndexOf("/"));

  const tasks = readPlan(linesOf(text), null).tasks.filter((task) => task.id !== "");
  const state = readState(dir, fs);
  const settled = (id: string): boolean => state.done.has(id) || state.skipped.has(id);
  const depends = (id: string): string[] => {
    const deps = tasks.find((task) => task.id === id)?.deps ?? "";
    return deps === "none" || deps === "-" ? [] : entriesOf(deps);
  };

  const store = `${root}/.temp/viber/waits`;
  const kept = linesOf(fs.readText(store) ?? "").map((line) => line.replace(/\r$/, ""));
  const current = kept[0] === `started: ${mark}`;
  const memory = current ? kept.slice(1) : [];
  const entries = memory.flatMap((line) => {
    const found = KEPT.exec(line);
    return found === null ? [] : [{ kind: found[1], id: found[2], others: listed(found[3]), path: found[4] }];
  });
  const waits = entries.filter((entry) => entry.kind === "wait").map((entry) => ({ id: entry.id, claimant: entry.others[0] ?? "" }));
  // A pair put in sequence in this session holds from the call that printed it: its decision line reaches status.md a call later, or never when that call fails.
  const sequenced = [...sequencedOf(state.decisions), ...entries.filter((entry) => entry.kind === "sequence").map((entry) => ({ id: entry.id, after: entry.others[0] ?? "", path: entry.path }))];
  const idsOf = (flag: string): Set<string> => new Set(listed(flags.get(flag) ?? "").filter((id) => !settled(id)));
  const flight = idsOf("--flight");

  if (mode === "wait") {
    if (!tasks.some((task) => task.id === waiter)) return fail(`the plan holds no task ${waiter}`);
    /** Whether task id runs only after task other: through its Depends-on ids and the sequenced pairs, however many steps. */
    const behind = (id: string, other: string, seen = new Set<string>()): boolean => {
      if (seen.has(id)) return false;
      seen.add(id);
      const before = [...depends(id), ...sequenced.filter((pair) => pair.id === id).map((pair) => pair.after)];
      return before.includes(other) || before.some((next) => behind(next, other, seen));
    };
    const met = (other: string): boolean => waits.some((wait) => (wait.id === waiter && wait.claimant === other) || (wait.id === other && wait.claimant === waiter));
    /** The other tasks running now, in plan order: whoever left a file no task claims dirty is one of them. */
    const running = tasks.map((task) => task.id).filter((id) => id !== waiter && flight.has(id));
    const waitedOn = (path: string): boolean => entries.some((entry) => entry.kind === "free" && entry.id === waiter && entry.path === path);
    const printed = new Set<string>();
    const out: string[] = [];
    /** A wait line once, however many paths it stands for. */
    const once = (line: string): void => {
      if (!out.includes(line)) out.push(line);
    };
    const fresh: string[] = [];
    for (const path of [...new Set(named.map((entry) => repoPath(entry, root, fs)))]) {
      // A skipped task never finishes, so it holds no claim.
      const claimant = tasks.find((task) => task.id !== waiter && !settled(task.id) && claims(task.id, task.files, path, dir, root, fs))?.id;
      if (claimant === undefined) {
        // A dirty file no task lists yet is waited out once, until every task now running has left flight.
        if (running.length === 0 || waitedOn(path)) out.push(`unclaimed: ${path}`);
        else {
          fresh.push(`free: ${waiter} | ${running.join(",")} | ${path}`);
          once(`wait: ${waiter} | on: ${running.join(",")}`);
        }
      } else if (behind(claimant, waiter)) out.push(`blocked: ${path} | by: ${claimant}`);
      else {
        fresh.push(`wait: ${waiter} | ${claimant} | ${path}`);
        // One return is one collision of a pair, however many paths of the claimant it names.
        if (printed.has(claimant)) continue;
        printed.add(claimant);
        // A claimant that is not running would be met again by a retry sent at once: the pair goes in sequence now.
        if (met(claimant) || !flight.has(claimant)) {
          out.push(`sequence: ${waiter} | after: ${claimant} | path: ${path}`);
          fresh.push(`sequence: ${waiter} | ${claimant} | ${path}`);
        } else once(`wait: ${waiter} | on: ${claimant}`);
      }
    }
    if (fresh.length > 0) {
      const bytes = (lines: string[]): Uint8Array => new TextEncoder().encode(lines.map((line) => `${line}\n`).join(""));
      // Appended under the current mark, so two calls at once lose no line; a file under another mark starts again.
      const written = fs.makeDir(`${root}/.temp/viber`) && (current ? fs.appendBytes(store, bytes(fresh)) : fs.writeBytes(store, bytes([`started: ${mark}`, ...fresh])));
      if (!written) return fail(`cannot write ${store}`);
    }
    return answer(out);
  }

  const held = idsOf("--held");
  const waiting = idsOf("--waiting");
  // A task whose dispatch ended with no return goes out again; one the caller still holds in flight or held never does, so no task runs twice.
  const lost = new Set([...idsOf("--lost")].filter((id) => !flight.has(id) && !held.has(id)));
  const exclusive = new Set(tasks.filter((task) => task.exclusive === "true").map((task) => task.id));
  if ([...flight].some((id) => exclusive.has(id))) return answer(["none"]);

  const heldBack = (id: string): boolean => sequenced.some((pair) => pair.id === id && !settled(pair.after));
  // Whom a task waits out: the tasks its last run of wait lines names, a claimant or the tasks in flight at a wait on a path no task claims.
  const holders = new Map<string, Set<string>>();
  let last = "";
  for (const entry of entries) {
    if (entry.id !== last) holders.set(entry.id, new Set());
    last = entry.id;
    if (entry.kind !== "sequence") for (const other of entry.others) holders.get(entry.id)?.add(other);
  }
  const open = tasks.map((task) => task.id).filter((id) => !settled(id) && !heldBack(id));
  const retry = open.filter((id) => lost.has(id) || (waiting.has(id) && ![...(holders.get(id) ?? [])].some((other) => flight.has(other))));
  const start = open.filter((id) => !flight.has(id) && !held.has(id) && !waiting.has(id) && !lost.has(id) && depends(id).every((dep) => state.done.has(dep)));

  const shared = (ids: string[]): string[] => ids.filter((id) => !exclusive.has(id));
  const room = Math.max(0, CAP - flight.size);
  let retries = shared(retry).slice(0, room);
  let starts = shared(start).slice(0, room - retries.length);
  if (shared(retry).length + shared(start).length === 0 && flight.size === 0) {
    // An Exclusive task runs alone: one at a time, only when nothing else runs or is ready.
    retries = retry.slice(0, 1);
    starts = start.slice(0, 1 - retries.length);
  }
  const out = [...(starts.length > 0 ? [`start: ${starts.join(",")}`] : []), ...(retries.length > 0 ? [`retry: ${retries.join(",")}`] : [])];
  return answer(out.length > 0 ? out : ["none"]);
}
