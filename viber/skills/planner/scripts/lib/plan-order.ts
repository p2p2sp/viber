/*
 * plan-order.ts - what a plan's task fields decide without judgement: the files
 * a task owns, the tasks it runs after, its wave and its model.
 */

import type { Task } from "./plan-parse.ts";

export interface FileEntry {
  /** The path or glob, the `+` or `-` mark and a leading `./` cut. */
  path: string;
  kind: "modify" | "create" | "delete" | "glob";
}

/** The entries of a `Files` value; an entry that is no path is returned in `bad` as written. */
export function fileEntries(value: string): { entries: FileEntry[]; bad: string[] } {
  const entries: FileEntry[] = [];
  const bad: string[] = [];
  for (const raw of value.split(",").map((part) => part.trim())) {
    const mark = raw.startsWith("+") ? "create" : raw.startsWith("-") ? "delete" : "modify";
    const path = (mark === "modify" ? raw : raw.slice(1)).replace(/^\.\//, "");
    const glob = /[*?]/.test(path);
    // A path is repo-relative, with no blank, quote or parent step, and a glob creates or deletes nothing.
    if (path === "" || /[\s`'"]/.test(path) || path.startsWith("/") || path.split("/").includes("..") || (glob && mark !== "modify")) {
      bad.push(raw);
    } else {
      entries.push({ path, kind: glob ? "glob" : mark });
    }
  }
  return { entries, bad };
}

/** The pattern of a glob: `**` crosses directories, `*` and `?` stay inside one segment. */
export function globRegex(glob: string): RegExp {
  let out = "";
  for (let i = 0; i < glob.length; i++) {
    const rest = glob.slice(i);
    if (rest.startsWith("**/")) {
      out += "(?:.*/)?";
      i += 2;
    } else if (rest.startsWith("**")) {
      out += ".*";
      i += 1;
    } else if (glob[i] === "*") out += "[^/]*";
    else if (glob[i] === "?") out += "[^/]";
    else out += glob[i].replace(/[.+^${}()|[\]\\]/, "\\$&");
  }
  return new RegExp(`^${out}$`);
}

/** Every file a task owns: its paths as written, a glob as the tree files it matches. */
export function ownedFiles(task: Task, tree: string[]): Set<string> {
  const owned = new Set<string>();
  for (const entry of fileEntries(task.fields.get("Files")?.value ?? "").entries) {
    if (entry.kind !== "glob") owned.add(entry.path);
    else {
      const pattern = globRegex(entry.path);
      for (const file of tree) if (pattern.test(file)) owned.add(file);
    }
  }
  return owned;
}

/** The task numbers a `Blocked-by` value names; `none` and unreadable tokens give none. */
export function blockers(task: Task): number[] {
  const value = task.fields.get("Blocked-by")?.value ?? "";
  return [...value.matchAll(/\bT(\d+)\b/g)].map((match) => Number(match[1]));
}

export function isIntegration(task: Task): boolean {
  return task.fields.get("Tests")?.value === "integration";
}

/**
 * The model of a task, from its other fields: a `Hard:` line asks for the
 * strongest, a task with no runtime behaviour or only a shape for the cheapest,
 * unless a `UI:` line hands it design references to apply.
 */
export function modelOf(task: Task): "haiku" | "sonnet" | "opus" {
  if (task.fields.has("Hard")) return "opus";
  if (task.fields.has("UI")) return "sonnet";
  return /^none \((no-runtime|shape)\)$/.test(task.fields.get("TDD")?.value ?? "") ? "haiku" : "sonnet";
}

export interface Order {
  /** Per task number, the lower-numbered tasks it runs after: its `Blocked-by`, every task sharing a file with it, every task whose glob matches a literal path of the other and every task whose glob matches a literal path of an earlier task that a glob of it matches too. */
  after: Map<number, number[]>;
  /** Per task number, its wave from 1. */
  wave: Map<number, number>;
}

/**
 * Orders the tasks, read in plan order. A task runs one wave after the last
 * task it runs after; an integration task moves on to the first wave holding
 * no other integration task, so no two of them ever run at once.
 */
export function orderOf(tasks: Task[], tree: string[]): Order {
  const after = new Map<number, number[]>();
  const wave = new Map<number, number>();
  const owned = new Map<number, Set<string>>();
  const literals = new Map<number, string[]>();
  const globs = new Map<number, RegExp[]>();
  const locked = new Set<number>();

  for (const task of tasks) {
    const files = ownedFiles(task, tree);
    const entries = fileEntries(task.fields.get("Files")?.value ?? "").entries;
    const mine = entries.filter((entry) => entry.kind !== "glob").map((entry) => entry.path);
    const patterns = entries.filter((entry) => entry.kind === "glob").map((entry) => globRegex(entry.path));
    const before = new Set(blockers(task).filter((num) => num < task.num && wave.has(num)));
    // The literal paths of the earlier tasks its globs match: another glob matching one meets it on that file.
    const met = [...literals.values()].flat().filter((path) => patterns.some((pattern) => pattern.test(path)));
    for (const [num, theirs] of owned) {
      for (const file of files) {
        if (theirs.has(file)) {
          before.add(num);
          break;
        }
      }
      // A glob resolved on the tree misses a file the other task creates: match it against the literal paths too.
      if (mine.some((path) => globs.get(num)!.some((pattern) => pattern.test(path)))) before.add(num);
      if (literals.get(num)!.some((path) => patterns.some((pattern) => pattern.test(path)))) before.add(num);
      if (met.some((path) => globs.get(num)!.some((pattern) => pattern.test(path)))) before.add(num);
    }
    owned.set(task.num, files);
    literals.set(task.num, mine);
    globs.set(task.num, patterns);
    after.set(task.num, [...before].sort((a, b) => a - b));

    let at = 1 + Math.max(0, ...[...before].map((num) => wave.get(num) ?? 0));
    if (isIntegration(task)) {
      while (locked.has(at)) at++;
      locked.add(at);
    }
    wave.set(task.num, at);
  }
  return { after, wave };
}

/** The waves as lists of task numbers, wave 1 first. */
export function wavesOf(order: Order): number[][] {
  const waves: number[][] = [];
  for (const [num, at] of order.wave) (waves[at - 1] ??= []).push(num);
  return waves.filter((wave) => wave !== undefined);
}
