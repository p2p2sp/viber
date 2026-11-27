/*
 * build-cut.ts - the cut of one task: the one file its coder and its reviewer
 * are handed, holding the task, the spec lines it covers and what the tasks it
 * is blocked by built.
 */

import { blockers } from "../../../planner/scripts/lib/plan-order.ts";
import { FIELDS, specSections, type Task } from "../../../planner/scripts/lib/plan-parse.ts";

// The spec sections that bind every task, in the order of the spec. A decision is a choice of the whole change: one cut by `Covers` would miss the tasks it also binds.
const WHOLE = ["Out of scope", "Must not change", "Decisions", "Contracts", "Constraints", "Root cause"];
// The mockup of the change, beside the spec: the spec skill's spec-paths.sh copies it there under this name, and the spec names it in one `R`.
export const MOCKUP = "prototype.html";
const FIELD_RE = new RegExp(`^(${FIELDS.join("|")}):`);

export interface SpecCut {
  /** Each `- R<n>:` item of Requirements by id, its continuation lines included. */
  items: Map<string, string[]>;
  /** The body of each WHOLE section the spec holds. */
  sections: Map<string, string[]>;
}

/** The lines with the blank ones at both ends cut. */
function trimmed(lines: string[]): string[] {
  const written = (line: string): boolean => line.trim() !== "";
  return lines.slice(Math.max(lines.findIndex(written), 0), lines.findLastIndex(written) + 1);
}

export function readSpec(text: string): SpecCut {
  const all = specSections(text);
  const items = new Map<string, string[]>();
  let item: string[] | null = null;
  for (const line of all.get("Requirements") ?? []) {
    const id = /^- (R\d+): /.exec(line);
    if (id) {
      item = [line];
      items.set(id[1], item);
    } else if (item !== null && (line.trim() === "" || /^\s/.test(line))) item.push(line);
    else item = null;
  }
  for (const [id, lines] of items) items.set(id, trimmed(lines));
  const sections = new Map<string, string[]>();
  for (const name of WHOLE) {
    const body = all.get(name);
    if (body !== undefined) sections.set(name, trimmed(body));
  }
  return { items, sections };
}

/** The file of one task. `Model` and `Blocked-by` are the script's, so they stay out; each DoD clause gets the number a finding cites. `mockup` is the path of the run's mockup, null when it has none: a task covering the `R` that names it is handed the path. */
export function cutTask(task: Task, tasks: Task[], spec: SpecCut, mockup: string | null): string {
  const out = [`# T${task.num} - ${task.title}`];
  let inDod = false;
  let clause = 0;
  for (const line of task.block.slice(1)) {
    const field = FIELD_RE.exec(line);
    if (field) inDod = field[1] === "DoD";
    if (field && (field[1] === "Model" || field[1] === "Blocked-by")) continue;
    const written = inDod ? /^- +(.*?)\s*$/.exec(line) : null;
    out.push(written ? `- DoD.${++clause}: ${written[1]}` : line);
  }

  const covered = (task.fields.get("Covers")?.value ?? "").split(",").flatMap((id) => spec.items.get(id.trim()) ?? []);
  if (covered.length > 0) out.push("", "## Spec", "", ...covered);
  if (mockup !== null && covered.some((line) => line.includes(MOCKUP))) out.push("", "## Mockup", "", mockup);
  for (const name of WHOLE) {
    const body = spec.sections.get(name) ?? [];
    if (body.length > 0) out.push("", `## ${name}`, "", ...body);
  }

  const before = blockers(task).flatMap((num) => tasks.find((each) => each.num === num) ?? []);
  if (before.length > 0) out.push("", "## Built before");
  for (const each of before) {
    out.push("", `### T${each.num} - ${each.title}`, `Delivers: ${each.fields.get("Delivers")?.value ?? ""}`, `Files: ${each.fields.get("Files")?.value ?? ""}`);
  }
  return `${out.join("\n")}\n`;
}
