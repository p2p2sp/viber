/*
 * dispatch.ts - the --dispatch answer: the labelled lines of one task's coder or
 * reviewer dispatch, a line left out when it has no value.
 */

import type { Checked } from "./check.ts";
import type { RunState } from "./state.ts";
import { words } from "./text.ts";

export interface DispatchOpts {
  id: string;
  form: "coder" | "reviewer";
  plan: string;
  dir: string;
  pluginRoot: string;
  baseline: boolean;
  /** The text of .temp/viber/lessons; null: no file. */
  lessons: string | null;
}

/** The task and every task it depends on, directly or through another. */
function relatedTo(id: string, tasks: Checked[]): Set<string> {
  const related = new Set([id]);
  // Deps point backwards only, so one pass from the last task up reaches them all.
  for (const { task, deps } of [...tasks].reverse()) if (related.has(task.id)) deps.forEach((dep) => related.add(dep));
  return related;
}

export function dispatchLines(tasks: Checked[], state: RunState, opts: DispatchOpts): string[] {
  const { id, dir } = opts;
  const coder = opts.form === "coder";
  const work = `${dir}/work`;
  const line = (label: string, value: string): string[] => (value === "" ? [] : [`${label}: ${value}`]);
  const related = relatedTo(id, tasks);
  const deferred = words(state.deferred).flatMap((entry) => (entry.startsWith(`${id}:`) ? [entry.slice(id.length + 1)] : []));
  const prior = tasks.find(({ task }) => task.id === id)?.deps.map((dep) => `${work}/${dep}-coder.md`) ?? [];
  const lessons = (opts.lessons?.split("\n")[1] ?? "").replaceAll("\r", "").replace(/^lessons: /, "");
  return [
    `task: ${dir}/tasks/${id}.md`,
    `notes: ${work}/${id}-coder.md`,
    `out: .temp/viber/${id}/`,
    `refs: ${opts.pluginRoot}/references`,
    ...(coder ? [`extras: ${work}/${id}-extra.md`, `decide-file: ${work}/${id}-options.md`] : []),
    ...line("baseline", opts.baseline ? `${work}/tests-baseline.md` : ""),
    ...line("deferred", deferred.join(", ")),
    ...(coder ? line("prior", prior.join(", ")) : []),
    ...state.decisions.filter((decision) => related.has(decision.slice("decision:".length).replace(/^ /, "").split(":")[0])),
    ...(coder ? line("run-lessons", lessons) : [`extras: ${work}/${id}-extra-review.md`, `scope: "${opts.pluginRoot}/scripts/plan-index.sh" "${opts.plan}" --extra "${id}"`]),
  ];
}
