/*
 * simple-list.ts - the session's task list as a function of the run's state:
 * one entry a stage, one the full test run, one the code review, one the fix
 * of the findings once that step runs, one the memory and rules writers once
 * one is sent. simple-run.ts prints the entries a call
 * changed, the simple-implementor skill mirrors them with the task-list tools.
 */

import type { Stage } from "./simple-stages.ts";
import type { State } from "./simple-state.ts";

export const TESTS = "Full test run";
export const REVIEW = "Code review";
export const FIX = "Fix the review findings";
export const WRITERS = "Project memory and rules";

const line = (done: boolean, now: boolean, subject: string): string => `${done ? "completed" : now ? "in_progress" : "pending"} | ${subject}`;

/** Every entry as `<status> | <subject>`, in list order. */
export function listOf(state: State, stages: Stage[]): string[] {
  const out = stages.map((stage, index) => line(index < state.stage, index === state.stage && state.step === "stage", `${stage.num}. ${stage.goal}`));
  out.push(line(state.tested, state.step === "tests", TESTS), line(state.review !== null, state.step === "review", REVIEW));
  if (state.step === "fix" || state.fixed) out.push(line(state.fixed, state.step === "fix", FIX));
  // A change list is set only when at least one writer is sent.
  if (state.listed.length > 0) out.push(line(state.step !== "writers", state.step === "writers", WRITERS));
  return out;
}
