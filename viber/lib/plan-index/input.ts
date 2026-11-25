/*
 * input.ts - the planner's summary file of `--input` against the plan: its
 * attachments, its root cause and its reproduction test.
 */

import type { PlanDoc } from "./read.ts";
import { bare, linesOf, trim, valueOf } from "./text.ts";

/** The defects the input file shows in the plan. Its lines open at line start with "Attachment:", "Root cause:" or "Repro:". */
export function checkInput(input: string, doc: PlanDoc): string[] {
  const lines = linesOf(input).map((line) => line.replace(/\r$/, ""));
  const named = (label: string): string[] => [...new Set(lines.filter((line) => line.startsWith(label)).map((line) => trim(line.slice(label.length))))].filter((path) => path !== "");
  const paths = named("Attachment:");
  const cause = lines.some((line) => line.startsWith("Root cause:")) || paths.some((path) => path.includes(".temp/viber/code-auditor/"));
  const held = (doc.attachments ?? []).map((entry) => valueOf(entry).replace(/^(["'])(.*)\1$/s, "$2"));
  const repros = doc.tasks.map((task) => bare(task.repro));
  return [
    ...paths.filter((path) => !held.includes(path)).map((path) => `FIX: input: Attachment ${path} has no entry in the attachments map - add one (Attachments)`),
    ...(cause && !doc.hasRootCause ? ['FIX: input gives a root cause but the plan has no "## Root cause" section - add it (Root cause)'] : []),
    ...(!cause && doc.hasRootCause ? ['FIX: the plan carries a "## Root cause" section its input gives no cause for - drop it (Root cause)'] : []),
    ...named("Repro:").filter((path) => !repros.includes(bare(path))).map((path) => `FIX: input: Repro ${path} is on no task Repro: line - put it on the fixing task (Reproduced)`),
  ];
}
