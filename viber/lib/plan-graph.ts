/*
 * plan-graph.ts - the dependency graph of a plan, computed: the order its
 * tasks take so that each follows what it needs, and which earlier tasks each
 * one then waits for, from the files the tasks list and the contract blocks
 * they use. plan-build.ts moves the task blocks into that order and writes the
 * result as every `Depends-on` line, so no author orders tasks and the three
 * graph checks of plan-index/check.ts (a shared file, a consumer beside its
 * writer, a reader beside the task it reads) hold by construction.
 */

import { namesPath } from "./plan-index/check.ts";
import { bare } from "./plan-index/text.ts";

/** What the graph reads of one task, in plan order. */
export interface GraphTask {
  /** The paths of its Files. */
  files: string[];
  /** The contract blocks its Uses names. */
  uses: string[];
  verification: string;
  delivers: string;
  dod: string;
}

/**
 * Per task, the places (from 0) of the earlier tasks it depends on, ascending.
 * blockFiles: the `File:` paths of each contract block. A task j depends on an
 * earlier task i when both list one file, when j uses a block whose file i
 * lists while naming that block in its own Uses, or when the Verification,
 * Delivers or DoD of j names a file i lists; then every edge reached through
 * another is dropped.
 */
export function orderTasks(tasks: GraphTask[], blockFiles: Map<string, string[]>): number[][] {
  const files = tasks.map((task) => new Set(task.files.map(bare)));
  const uses = tasks.map((task) => new Set(task.uses));
  const writes = (at: number, block: string): boolean => uses[at].has(block) && (blockFiles.get(block) ?? []).some((path) => files[at].has(bare(path)));
  const reached: Array<Set<number>> = [];
  const kept: number[][] = [];
  for (const [j, task] of tasks.entries()) {
    // The Delivers of a decision record task is no reading: it records what other tasks build.
    const record = files[j].size > 0 && [...files[j]].every((path) => path.startsWith("docs/adr/"));
    const text = `${task.verification} ${record ? "" : `${task.delivers} `}${task.dod}`;
    const direct: number[] = [];
    for (let i = 0; i < j; i++) {
      const shared = [...files[i]].some((path) => files[j].has(path));
      const consumed = [...uses[j]].some((block) => writes(i, block));
      const read = [...files[i]].some((path) => !files[j].has(path) && namesPath(text, path));
      if (shared || consumed || read) direct.push(i);
    }
    kept.push(direct.filter((i) => !direct.some((other) => other !== i && reached[other].has(i))));
    reached.push(new Set(direct.flatMap((i) => [i, ...reached[i]])));
  }
  return kept;
}

/** One step of a ring of tasks that wait for each other: the place of a task, in the order given, and what it needs of the next one of the ring. */
export interface Waiting {
  at: number;
  needs: string;
}

export interface Arranged {
  /** The order the tasks take: order[k] is the place, in the order given, of the task that goes to place k. */
  order: number[];
  /** Each ring no order satisfies, the last task of one needing the first. */
  cycles: Waiting[][];
}

/**
 * The order in which every task follows what it needs, the order given kept
 * wherever nothing asks otherwise. A task follows every earlier task orderTasks
 * makes it depend on, and two producers that stand after it: the first writer
 * of a contract block it uses with no writer before it, and the first task
 * listing a file its Verification, Delivers or DoD names, when no task before
 * it lists that file and the tree does not hold it (held). Tasks that need each
 * other in a ring are reported in cycles, the ring opened at its first task.
 */
export function arrangeTasks(tasks: GraphTask[], blockFiles: Map<string, string[]>, held: (path: string) => boolean): Arranged {
  const files = tasks.map((task) => new Set(task.files.map(bare)));
  const uses = tasks.map((task) => new Set(task.uses));
  const writes = (at: number, block: string): boolean => uses[at].has(block) && (blockFiles.get(block) ?? []).some((path) => files[at].has(bare(path)));
  /** Per task, each task it follows and what it needs of it. */
  const after: Array<Map<number, string>> = tasks.map(() => new Map());
  const need = (j: number, i: number, what: string): void => void (after[j].has(i) || after[j].set(i, what));
  for (const [j, task] of tasks.entries()) {
    const record = files[j].size > 0 && [...files[j]].every((path) => path.startsWith("docs/adr/"));
    const text = `${task.verification} ${record ? "" : `${task.delivers} `}${task.dod}`;
    for (let i = 0; i < j; i++) {
      const shared = [...files[i]].find((path) => files[j].has(path));
      const consumed = [...uses[j]].find((block) => writes(i, block));
      const read = [...files[i]].find((path) => !files[j].has(path) && namesPath(text, path));
      if (shared !== undefined) need(j, i, shared);
      else if (consumed !== undefined) need(j, i, consumed);
      else if (read !== undefined) need(j, i, read);
    }
    for (const block of uses[j]) {
      if (writes(j, block)) continue;
      const writers = [...tasks.keys()].filter((i) => writes(i, block));
      if (writers.length > 0 && writers[0] > j) need(j, writers[0], block);
    }
    const named = new Set<string>();
    for (let i = j + 1; i < tasks.length; i++) {
      for (const path of files[i]) {
        if (files[j].has(path) || named.has(path) || !namesPath(text, path)) continue;
        named.add(path);
        if (!held(path) && !files.slice(0, j).some((paths) => paths.has(path))) need(j, i, path);
      }
    }
  }
  const order: number[] = [];
  const placed = new Set<number>();
  const cycles: Waiting[][] = [];
  const ready = (at: number): boolean => [...after[at].keys()].every((i) => placed.has(i));
  while (order.length < tasks.length) {
    const left = [...tasks.keys()].filter((at) => !placed.has(at));
    let next = left.find(ready);
    if (next === undefined) {
      // Nothing left can go first: walk from the first task left along what each still waits for, until the walk closes.
      const walk: number[] = [];
      let at = left[0];
      while (!walk.includes(at)) {
        walk.push(at);
        at = [...after[at].keys()].find((i) => !placed.has(i)) as number;
      }
      const ring = walk.slice(walk.indexOf(at));
      cycles.push(ring.map((each, k) => ({ at: each, needs: after[each].get(ring[(k + 1) % ring.length]) as string })));
      // The ring opens at its first task: the others then follow what they need of it.
      next = Math.min(...ring);
    }
    order.push(next);
    placed.add(next);
  }
  return { order, cycles };
}

/** The value of a Depends-on line: `none`, or the ids of the places ascending, comma separated. */
export const dependsValue = (deps: number[], ids: string[]): string => (deps.length === 0 ? "none" : [...deps].sort((a, b) => a - b).map((at) => ids[at]).join(", "));
