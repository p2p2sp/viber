/*
 * simple-list.ts - the session's task list as a function of the run's state:
 * one entry a stage, one the full test run, one the code review with the fix
 * of its findings, one the memory writer, one the rules writer unless
 * `build.rules` is `false`. simple-run.ts prints the entries a call changed,
 * the simple-implementor skill mirrors them with the task-list tools.
 */

import type { Stage } from "./simple-stages.ts";
import type { State } from "./simple-state.ts";

export const TESTS = "Full test run";
export const REVIEW = "Code review";
export const MEMORY = "Update project memory";
export const RULES = "Update project rules";

const line = (done: boolean, now: boolean, subject: string): string => `${done ? "completed" : now ? "in_progress" : "pending"} | ${subject}`;

/** Every entry as `<status> | <subject>`, in list order. `rules`: `build.rules` is not `false`. */
export function listOf(state: State, stages: Stage[], rules: boolean): string[] {
  const out = stages.map((stage, index) => line(index < state.stage, index === state.stage && state.step === "stage", `${stage.num}. ${stage.goal}`));
  // The fix step belongs to the review it repairs.
  out.push(line(state.tested, state.step === "tests", TESTS), line(state.review !== null && state.step !== "fix", state.step === "review" || state.step === "fix", REVIEW));
  // A writer of the step in flight is done once no dispatch of its own is awaited, one never sent too.
  const writer = (prefix: string, subject: string): string => {
    const now = state.step === "writers" && state.waiting.some((id) => id.startsWith(prefix));
    return line(state.step === "writers" && !now, now, subject);
  };
  out.push(writer("memory.", MEMORY));
  if (rules) out.push(writer("rules.", RULES));
  return out;
}
