/*
 * check.ts - the plan contract as a whole: every defect of the task blocks, of
 * the dependency graph, of the criteria, of the contract files and of the open
 * items, in a fixed order and all of them in one run, and what the index prints
 * of a sound plan.
 */

import type { Fresh, PlanDoc, PlanTask } from "./read.ts";
import { bare, clausesOf, commandOf, criteriaOf, entriesOf, trim, withoutTicks, wrapped } from "./text.ts";
import { blindGrep, integrationFloor, namesIntegration, unprovable } from "./verification.ts";

export interface CheckOpts {
  /** null: the plan is frozen, and the checks added after plans were frozen are skipped. */
  fresh: (Fresh & { memory: boolean }) | null;
  held: (path: string) => boolean;
}

/** What the index prints of one task. */
export interface Checked {
  task: PlanTask;
  /** The paths of its Files, in order. */
  files: string[];
  /** The ids of its Depends-on, in order. */
  deps: string[];
  /** The contract blocks it writes and the count of other tasks using each, in block order. */
  feeds: Array<{ block: string; count: number }>;
}

/** A task is one behaviour: a TDD one runs red-green clause by clause, so it stays small. */
const CAPS: Record<string, { files: number; clauses: number }> = { required: { files: 12, clauses: 6 }, none: { files: 25, clauses: 10 } };
const COMMIT_TYPE = /^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\([^)]*\))?!?:/i;
const PROVABLE = "run a project test or script instead (Provable)";

/** One Next.js App Router dynamic segment, its brackets part of the directory name: [id], [...slug], [[...slug]]. */
const DYNAMIC = /^(\[[A-Za-z0-9_-]+\]|\[\.\.\.[A-Za-z0-9_-]+\]|\[\[\.\.\.[A-Za-z0-9_-]+\]\])$/;

/** A pattern rather than one exact path, told by shape: "*" and "?" always, a bracket only when it wraps no whole segment. */
const patterned = (path: string): boolean => /[*?]/.test(path) || path.split("/").some((segment) => /[[\]]/.test(segment) && !DYNAMIC.test(segment));

/** True when the text holds the id as a whole token, outside backtick spans. */
const namesId = (text: string, id: string): boolean => withoutTicks(text).split(/[^A-Za-z0-9_-]/).includes(id);

/**
 * True when the text holds the path as a whole token: a longer path or a bare file
 * name inside one is none, a leading "./" and a sentence period are allowed, and a
 * backtick, a quote or a blank bound it.
 */
export function namesPath(text: string, path: string): boolean {
  const padded = `   ${text}   `;
  for (let at = padded.indexOf(path); at >= 0; at = padded.indexOf(path, at + 1)) {
    const after = padded.slice(at + path.length);
    const before = padded.slice(0, at);
    if (/(^|[^A-Za-z0-9_./-])(\.\/)?$/.test(before.slice(-3)) && !/^([A-Za-z0-9_/-]|\.[A-Za-z0-9_])/.test(after)) return true;
  }
  return false;
}

/** The well-formed names of the attachments map, each bad one a defect. */
function attachmentNames(entries: string[], defect: (text: string) => void): Set<string> {
  const names = new Set<string>();
  const folded = new Set<string>();
  for (const entry of entries) {
    const text = trim(entry);
    const name = text.includes(":") ? trim(text.slice(0, text.indexOf(":"))) : text;
    if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(name)) defect(`attachments: name "${name}" is not one path component of letters, digits, _, . and - opening on a letter or digit - rename it (Attachments)`);
    else if (folded.has(name.toLowerCase())) defect(`attachments: name "${name}" repeats an earlier one - rename one of them (Attachments)`);
    else {
      folded.add(name.toLowerCase());
      names.add(name);
    }
  }
  return names;
}

/** The names a DoD gives as attachments/<name> that the map does not hold, each once. A prefix glued to a longer path names none, and a closing sentence period is dropped. */
function missingAttachments(dod: string, names: Set<string>): string[] {
  const missing = new Set<string>();
  for (const [, full] of ` ${dod}`.matchAll(/(?<![A-Za-z0-9_./-])attachments\/([A-Za-z0-9_.-]+)/g)) {
    const name = names.has(full) ? full : full.replace(/\.+$/, "");
    if (name !== "" && !names.has(name)) missing.add(name);
  }
  return [...missing];
}

/** Every defect of the plan, and its tasks as the index prints them. */
export function checkPlan(doc: PlanDoc, opts: CheckOpts): { defects: string[]; tasks: Checked[] } {
  const { fresh, held } = opts;
  const defects: string[] = [];
  const defect = (text: string): void => void defects.push(`FIX: ${text}`);
  const oversize = (text: string): void => void defects.push(`SPLIT: ${text}`);
  const tasks = doc.tasks;
  const n = tasks.length;
  /** The place of each id; a repeated id is its last one. */
  const places = new Map<string, number>();
  const files: string[][] = tasks.map(() => []);
  const deps: string[][] = tasks.map(() => []);
  const uses: Array<Set<string>> = tasks.map(() => new Set());
  const lists = (at: number, path: string): boolean => files[at].includes(path);
  const covered = new Set<number>();
  const used = new Set<string>();
  /** The files a block with a malformed heading lists: never reported as created by no task. */
  const broken = new Set<string>();

  for (const [i, task] of tasks.entries()) {
    if (task.broken) continue;
    if (task.id === "") {
      defect(`task #${i + 1} has no id`);
      continue;
    }
    if (!/^[A-Za-z0-9_-]+$/.test(task.id)) defect(`task id "${task.id}": letters, digits, "-" and "_" only - it names the task file`);
    if (places.has(task.id)) defect(`duplicate task id: ${task.id}`);
    places.set(task.id, i);
  }
  for (const task of tasks) if (task.early && !task.broken) defect(`task ${task.id}: <!-- TASK --> block sits above the "## Tasks" heading`);
  const attachments = fresh === null ? new Set<string>() : attachmentNames(doc.attachments ?? [], defect);

  const checkFiles = (task: PlanTask, at: number): void => {
    const bad = (path: string, why: string): void => defect(`task ${task.id}: Files entry "${path}" ${why}`);
    for (const entry of task.files === "" ? [] : task.files.split(",")) {
      const path = bare(trim(entry));
      if (path === "") defect(`task ${task.id}: empty entry in Files`);
      else if (patterned(path)) bad(path, "is a glob, list exact paths");
      else if (/^[/~]/.test(path)) bad(path, "must be repo-relative");
      else if (path.endsWith("/")) bad(path, "is a directory, list each file");
      else if (/[ \t\n\v\f\r]/.test(path)) bad(path, "is not a bare path, drop the annotation");
      else if (/[`"]/.test(path)) bad(path, "is not a bare path, drop the quoting");
      else {
        files[at].push(path);
        if (fresh?.memory && /(^|\/)CLAUDE\.md$/.test(path)) defect(`task ${task.id}: Files lists ${path} while build.memory is on - drop it, the build close updates every CLAUDE.md (Memory-owned)`);
      }
    }
  };

  const checkVerification = (task: PlanTask, at: number): void => {
    const command = commandOf(task.verification);
    for (const path of files[at]) {
      const floor = integrationFloor(path);
      if (floor !== null && !namesIntegration(command, path, floor)) {
        defect(`task ${task.id}: Files writes ${path} under an integration test directory, which no Verification command names - list or type-check that file or its test project there (Layered)`);
      }
    }
    for (const path of files[at]) {
      if (!held(path) && blindGrep(command, path)) defect(`task ${task.id}: Verification runs git grep without --untracked over ${path}, which this task creates and git grep never reads - add --untracked or use grep (Provable)`);
    }
    if (wrapped(trim(task.verification.split(" -> ")[0]))) defect(`task ${task.id}: Verification is wrapped in backticks - write the command bare (Provable)`);
    const { inline, scratch } = unprovable(command);
    if (inline !== "") defect(`task ${task.id}: Verification runs inline interpreter code "${inline}" - ${PROVABLE}`);
    if (scratch !== "") defect(`task ${task.id}: Verification runs ${scratch} under .temp/ - ${PROVABLE}`);
  };

  const checkSize = (task: PlanTask, at: number): void => {
    const cap = Object.hasOwn(CAPS, task.tdd) ? CAPS[task.tdd] : null;
    if (cap === null) return;
    const clauses = clausesOf(task.dod).length;
    const past = (what: string, most: number): string => `${what}, past the ${most} a TDD: ${task.tdd} task may hold - split it, one behaviour per task`;
    if (files[at].length > cap.files) oversize(`task ${task.id}: ${past(`${files[at].length} Files`, cap.files)}`);
    if (clauses > cap.clauses) oversize(`task ${task.id}: ${past(`${clauses} DoD clauses`, cap.clauses)}; clauses are cut at each semicolon outside backticks, so a semicolon inside a list cuts a clause`);
  };

  const checkUses = (task: PlanTask, at: number): void => {
    if (task.uses === "") defect(`task ${task.id}: missing Uses - name its contract blocks, or "none"`);
    else if (task.uses !== "none" && task.uses !== "-") {
      for (const block of entriesOf(task.uses)) {
        if (!doc.contracts.includes(block)) defect(`task ${task.id}: Uses ${block}, no such contract block`);
        else {
          used.add(block);
          uses[at].add(block);
        }
      }
    }
    for (const block of fresh === null ? [] : doc.contracts) {
      if (uses[at].has(block)) continue;
      if (namesId(task.dod, block)) defect(`task ${task.id}: DoD names ${block}, missing from its Uses - add it to Uses`);
      if (namesId(task.delivers, block)) defect(`task ${task.id}: Delivers names ${block}, missing from its Uses - add it to Uses`);
    }
  };

  /** A dependency may only point at an earlier task, which makes the graph acyclic by construction. */
  const checkDeps = (task: PlanTask, at: number): void => {
    if (task.deps === "none" || task.deps === "-") return;
    for (const id of entriesOf(task.deps)) {
      const place = places.get(id);
      if (place === undefined) defect(`task ${task.id}: Depends-on ${id}, no such task`);
      else if (place >= at) defect(`task ${task.id}: Depends-on ${id} must reference an earlier task`);
      else deps[at].push(id);
    }
  };

  const checkTask = (task: PlanTask, at: number): void => {
    const { id } = task;
    if (fresh !== null) {
      if (id !== "" && id !== `T${at + 1}`) defect(`task ${id}: id must be T${at + 1}, the ${at + 1}th task block in order - renumber the tasks (Ids)`);
      const prefix = COMMIT_TYPE.exec(task.title);
      if (prefix !== null) defect(`task ${id}: title opens with the commit type prefix "${prefix[0]}" - drop it, the commit subject is "<id> - <title>" (Title)`);
    }
    if (task.tdd !== "required" && task.tdd !== "none") defect(`task ${id}: TDD must be "required" or "none", got: "${task.tdd}"`);
    if (task.exclusive !== "" && task.exclusive !== "true") defect(`task ${id}: Exclusive must be "true" or the line left out, got: "${task.exclusive}"`);
    if (task.hard === "") defect(`task ${id}: Hard needs its reason, or the line left out`);
    if (task.files === "") defect(`task ${id}: missing Files`);
    if (task.delivers === "") defect(`task ${id}: missing Delivers`);
    if (task.verification === "") defect(`task ${id}: missing Verification`);
    if (task.dod === "") defect(`task ${id}: missing DoD`);
    if (fresh !== null) {
      // A clause is proven inside the task that delivers it.
      const other = tasks.find((each) => each.id !== id && each.id !== "" && namesId(task.dod, each.id));
      if (other !== undefined) defect(`task ${id}: DoD names task ${other.id} - prove each clause inside this task, naming a file or symbol instead`);
      for (const name of doc.attachments === null ? [] : missingAttachments(task.dod, attachments)) {
        defect(`task ${id}: DoD names attachments/${name}, absent from the attachments map - add a ${name} entry or drop the reference (Attachments)`);
      }
    }
    checkFiles(task, at);
    if (fresh !== null) {
      if (task.verification !== "") checkVerification(task, at);
      checkSize(task, at);
    }
    if (task.repro !== "") {
      const path = bare(task.repro);
      if (!lists(at, path)) defect(`task ${id}: Repro "${path}" must be one path of its own Files`);
      if (task.tdd !== "none") defect(`task ${id}: Repro needs "TDD: none" - the reproduction test is already RED`);
    }
    const criteria = criteriaOf(task.covers);
    if (criteria.length === 0) defect(`task ${id}: Covers references no acceptance criterion`);
    for (const number of criteria) {
      if (!doc.criteria.has(Number(number))) defect(`task ${id}: Covers AC${number}, absent from acceptance criteria`);
      else covered.add(Number(number));
    }
    checkUses(task, at);
    checkDeps(task, at);
  };

  for (const [at, task] of tasks.entries()) {
    if (!task.broken) {
      checkTask(task, at);
      continue;
    }
    for (const number of criteriaOf(task.covers)) covered.add(Number(number));
    for (const block of entriesOf(task.uses)) used.add(block);
    for (const entry of task.files.split(",")) broken.add(bare(trim(entry)));
  }

  // Deps point backwards only, so one forward pass resolves ancestry.
  const before: Array<Set<number>> = [];
  for (const ids of deps) {
    const own = ids.map((id) => places.get(id) ?? -1);
    before.push(new Set(own.flatMap((place) => [place, ...before[place]])));
  }
  const placeOf = (id: string): number => places.get(id) ?? -1;
  if (fresh !== null) {
    for (const [at, ids] of deps.entries()) {
      ids.forEach((id, k) => {
        const through = ids.find((other, t) => t !== k && before[placeOf(other)].has(placeOf(id)));
        if (through !== undefined) defect(`task ${tasks[at].id}: Depends-on ${id} is already reached through ${through} - drop it`);
      });
    }
  }
  // Tasks with no dependency path between them run at the same time, so they may not share a file.
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      for (const path of before[j].has(i) ? [] : files[i]) {
        if (lists(j, path)) defect(`tasks ${tasks[i].id} and ${tasks[j].id} both list ${path}, with no dependency path between them`);
      }
    }
  }
  if (fresh !== null) {
    for (const [i, task] of tasks.entries()) {
      if (task.broken) continue;
      // The Delivers of a decision record task is no reading: it records what other tasks build.
      const record = files[i].length > 0 && files[i].every((path) => path.startsWith("docs/adr/"));
      const text = `${task.verification} ${record ? "" : `${task.delivers} `}${task.dod}`;
      for (let j = 0; j < i; j++) {
        for (const path of before[i].has(j) ? [] : files[j]) {
          if (!lists(i, path) && namesPath(text, path)) defect(`task ${task.id} reads ${path}, listed by ${tasks[j].id}, but has no dependency path to ${tasks[j].id} - add ${tasks[j].id} to its Depends-on`);
        }
      }
      const named = new Set<string>();
      for (let j = i + 1; j < n; j++) {
        for (const path of files[j]) {
          if (lists(i, path) || named.has(path) || files.slice(0, i).some((paths) => paths.includes(path))) continue;
          if (!namesPath(text, path) || held(path)) continue;
          named.add(path);
          defect(`task ${task.id} reads ${path}, which only the later task ${tasks[j].id} creates - move the reading after ${tasks[j].id} (Read after)`);
        }
      }
    }
  }

  // Nothing downstream gates the specification as a whole.
  for (const number of [...doc.criteria].sort((a, b) => a - b)) if (number > 0 && !covered.has(number)) defect(`acceptance criterion AC${number} is covered by no task`);
  for (const [k, block] of doc.contracts.entries()) {
    if (fresh !== null && block !== `C${k + 1}`) defect(`contract ${block}: id must be C${k + 1}, the ${k + 1}th block in order - renumber the blocks (Blocks)`);
    if (!used.has(block)) defect(`contract ${block} is used by no task`);
    // An appendix where no block carries the line predates it: a frozen plan cannot grow it.
    if (!doc.contractFiles.has(block) && (fresh !== null || doc.contractFiles.size > 0)) defect(`contract ${block}: missing File - name the paths the shape is declared in, or "none"`);
  }

  // A block's file decides who writes it, so the appendix and the task map have to meet.
  const feeds: Array<Map<string, number>> = tasks.map(() => new Map());
  for (const block of doc.contracts) {
    const value = doc.contractFiles.get(block) ?? "";
    if (value === "" || value === "none" || value === "-") continue;
    const unordered = new Set<string>();
    for (const entry of value.split(",")) {
      const path = bare(trim(entry));
      if (path === "") {
        defect(`contract ${block}: empty entry in File`);
        continue;
      }
      if (patterned(path) || /^[/~]|\/$|[ \t\n\v\f\r]/.test(path)) {
        defect(`contract ${block}: File entry "${path}" must be one bare repo-relative file path`);
        continue;
      }
      const holders = [...tasks.keys()].filter((i) => lists(i, path));
      const writers = holders.filter((i) => uses[i].has(block));
      const named = holders.map((i) => tasks[i].id).filter((id) => id !== "");
      if (named.length === 0) {
        if (!held(path) && !broken.has(path)) defect(`contract ${block} declares ${path}, which no task creates - put it in the Files of the task that writes the shape`);
      } else if (writers.length === 0) {
        defect(`contract ${block} declares ${path}, held by ${named.join(",")}, but no holder names ${block} in Uses - its writer would never see the shape`);
      }
      // A consumer runs after every lower-numbered writer, or it would be built beside the code it calls.
      for (const j of fresh === null ? [] : writers) {
        for (let i = j + 1; i < n; i++) {
          if (!uses[i].has(block) || before[i].has(j) || unordered.has(`${i} ${j}`)) continue;
          unordered.add(`${i} ${j}`);
          defect(`task ${tasks[i].id} uses ${block}, written by ${tasks[j].id}, but has no dependency path to ${tasks[j].id} - add ${tasks[j].id} to its Depends-on`);
        }
      }
      for (const i of holders) {
        const count = uses.filter((blocks, j) => j !== i && blocks.has(block)).length;
        if (count > 0) feeds[i].set(block, count);
      }
    }
  }

  // A task file takes 3 notes: plan-build.sh keeps a note past them in the plan, so more is a hand edit.
  const noted = new Map<string, number>();
  for (const item of doc.openItems) {
    if (item.where === "plan") continue;
    if (!places.has(item.where)) defect(`open items: ${item.where} names no task of the plan (Open items)`);
    else if (item.kind === "note") noted.set(item.where, (noted.get(item.where) ?? 0) + 1);
  }
  for (const [id, count] of noted) if (count > 3) defect(`open items: task ${id} holds ${count} notes, past 3 (Open items)`);

  return {
    defects,
    tasks: tasks.map((task, i) => ({ task, files: files[i], deps: deps[i], feeds: doc.contracts.flatMap((block) => (feeds[i].has(block) ? [{ block, count: feeds[i].get(block) ?? 0 }] : [])) })),
  };
}
