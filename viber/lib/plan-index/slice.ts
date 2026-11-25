/*
 * slice.ts - the --slice answer: the commits of a final-review slice and the
 * files they changed, read off the history since the plan was added.
 */

import { byteOrder } from "../byte-order.ts";
import type { Git } from "../ports.ts";
import type { PlanTask } from "./read.ts";

/** True for the subject of a task's commit or of one of its numbered fixes. */
function isCommitOf(subject: string, { id, title }: PlanTask): boolean {
  return subject.startsWith(id) && subject.slice(id.length).replace(/^\([0-9]+\)/, "") === ` - ${title}`;
}

/** places: the tasks of the slice, by their place in the plan; plan: the plan file as git finds it. */
export function sliceLines(tasks: PlanTask[], places: Set<number>, plan: string, root: string, git: Pick<Git, "firstAdded" | "log" | "committedFiles">): string[] {
  const base = git.firstAdded(root, plan);
  if (base === null) return [];
  const last = Math.max(...places);
  const commits: string[] = [];
  const files = new Set<string>();
  const others = new Set<string>();
  for (const { short, subject } of git.log(root, base)) {
    const place = tasks.findIndex((task) => isCommitOf(subject, task));
    const inSlice = places.has(place);
    // A path a lower-numbered task outside the slice also changed belongs to an earlier slice.
    if (place < 0 || (!inSlice && place >= last)) continue;
    if (inSlice) commits.push(`commit: ${tasks[place].id} | ${short} | ${subject}`);
    for (const path of git.committedFiles(root, short)) (inSlice ? files : others).add(path);
  }
  if (commits.length === 0) return [];
  return [...commits, ...[...files].filter((path) => !others.has(path)).sort(byteOrder).map((path) => `file: ${path}`)];
}
