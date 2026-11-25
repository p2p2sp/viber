/*
 * final-review.ts - the --final-review answer: one dispatch block per slice of
 * consecutive tasks, or the skip when the review is closed or nothing is done.
 */

import { slicesOf } from "../plan-text.ts";
import { clampTier, type Tiers } from "./listing.ts";
import type { PlanTask } from "./read.ts";
import type { RunState } from "./state.ts";
import { words } from "./text.ts";

export interface FinalReviewOpts {
  plan: string;
  dir: string;
  pluginRoot: string;
  tiers: Tiers;
  memory: string;
}

export function finalReviewLines(tasks: PlanTask[], state: RunState, { plan, dir, pluginRoot, tiers, memory }: FinalReviewOpts): string[] {
  if (words(state.closed).includes("final-review") || !tasks.some((task) => state.done.has(task.id))) return ["NEXT: skip"];
  return slicesOf(tasks.length).flatMap(({ from, to }, k) => {
    const ids = tasks.slice(from - 1, to).map((task) => task.id);
    return [
      `NEXT: final-review | slice: ${k + 1} | model: ${clampTier("sonnet", tiers)}`,
      `run: ${dir}`,
      `tasks: ${ids.join(", ")}`,
      `report: ${dir}/work/final-review-${k + 1}.md`,
      `refs: ${pluginRoot}/references`,
      `memory: ${memory}`,
      `scope: "${pluginRoot}/scripts/plan-index.sh" "${plan}" --slice "${ids.join(",")}"`,
    ];
  });
}
