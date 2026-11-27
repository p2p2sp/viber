/*
 * build-list.ts - the session's task list as a function of the run's state:
 * one entry a plan task, one a close step, one a writer of the step that
 * sends three together. build-run.ts prints the entries a
 * call changed, the spec-implementor skill mirrors them with the task-list tools.
 */

import { configPath, extensionSteps, qaOn, rulesOn } from "./build-config.ts";
import { runOf, type Ctx, type Step } from "./build-state.ts";

// The close steps in run order. A fix step belongs to the check it repairs. The writers of one step have an entry each, told by the prefix of their ids.
const CLOSE: Array<{ subject: string; steps: Step[]; id?: string }> = [
  { subject: "Final review", steps: ["final-review", "final-fix"] },
  { subject: "Final test run", steps: ["tests", "test-fix"] },
  { subject: "Update project memory", steps: ["writers"], id: "memory." },
  { subject: "Update project rules", steps: ["writers"], id: "rules." },
  { subject: "Write QA scenarios", steps: ["writers"], id: "qa." },
  { subject: "Run extensions", steps: ["extensions"] },
  { subject: "Finalize", steps: ["finalize"] },
];

/**
 * Every entry as `<status> | <subject>`, in list order. A plan task's subject
 * is the subject of its commit, with ` [TDD]` behind `T<n>` on `TDD:
 * required`. A held or skipped task reads `pending`: the next start runs it
 * again.
 */
export function listOf(ctx: Ctx): string[] {
  const out = ctx.tasks.map((task) => {
    const state = runOf(ctx, task.num)?.state;
    const tdd = task.fields.get("TDD")?.value === "required" ? " [TDD]" : "";
    return `${state === "done" ? "completed" : state === "coder" || state === "review" ? "in_progress" : "pending"} | T${task.num}${tdd} - ${task.title}`;
  });
  const close = ctx.state.close;
  const at = close.step === "end" ? CLOSE.length : CLOSE.findIndex((entry) => entry.steps.includes(close.step));
  const yaml = ctx.fs.readText(configPath(ctx.root));
  const extensions = extensionSteps(yaml).steps.length > 0;
  const rules = rulesOn(yaml);
  const qa = qaOn(yaml);
  CLOSE.forEach((entry, index) => {
    if (entry.subject === "Update project rules" && !rules) return;
    if (entry.subject === "Write QA scenarios" && !qa) return;
    if (entry.subject === "Run extensions" && !extensions) return;
    // A partial run closes on its summary alone: no step before it runs.
    const runs = !close.partial || index === CLOSE.length - 1;
    // A writer of the step in flight is done once no dispatch of its own is awaited.
    const now = entry.steps.includes(close.step);
    const done = now && entry.id !== undefined && !close.open.some((id) => id.startsWith(entry.id ?? ""));
    out.push(`${!runs || (index > at && !now) ? "pending" : now && !done ? "in_progress" : "completed"} | ${entry.subject}`);
  });
  return out;
}
