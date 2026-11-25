/*
 * plan-text.ts - reads the text of a plan file for the plan-build core: its task
 * blocks, contract blocks, acceptance criteria and the two sections a slice brief
 * quotes, and cuts the tasks into the slices the review dispatches use. It reads
 * text only and checks nothing: validation stays with scripts/plan-index.sh.
 */

/** One `<!-- TASK -->` block: first and last are line indexes of its two markers. */
export interface PlanTask {
  id: string;
  first: number;
  last: number;
  /** The value of each `- <Label>: <value>` line of the block, by label. */
  fields: Map<string, string>;
}

/** One `### <id> - <name>` block under `## Contracts`: first is its heading, last its final line. */
export interface PlanBlock {
  id: string;
  first: number;
  last: number;
}

export interface Plan {
  lines: string[];
  tasks: PlanTask[];
  contracts: PlanBlock[];
  /** The numbered items under `## Acceptance criteria`, id `AC<n>`. */
  criteria: PlanBlock[];
  /** The body lines under `### Must not change`, without the heading. */
  mustNot: string[];
  /** The `- <action> - <path> ...` lines under `### File map`, by path. */
  fileMap: Map<string, string>;
}

const TASK_OPEN = /^[ \t]*<!-- TASK -->[ \t]*$/;
const TASK_CLOSE = /^[ \t]*<!-- \/TASK -->[ \t]*$/;
const FIELD = /^- ([A-Za-z][A-Za-z-]*):[ \t]*(.*)$/;

/** The lines of a text, a final line feed and every carriage return dropped. */
export function linesOf(text: string): string[] {
  const lines = text.split("\n").map((line) => line.replace(/\r$/, ""));
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

export const textOf = (lines: string[]): string => lines.map((line) => `${line}\n`).join("");

/** The comma-separated entries of a field value, `none` and blanks dropped. */
export function listOf(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "" && entry !== "none");
}

export function parsePlan(text: string): Plan {
  const lines = linesOf(text);
  const plan: Plan = { lines, tasks: [], contracts: [], criteria: [], mustNot: [], fileMap: new Map() };
  let task: PlanTask | null = null;
  let section = "";
  let sub = "";
  let fenced = false;
  let block: PlanBlock | null = null;
  const close = (at: number): void => {
    if (block !== null) block.last = at;
    block = null;
  };

  lines.forEach((line, at) => {
    if (task !== null) {
      const heading = /^### (\S+) - /.exec(line);
      if (heading !== null && task.id === "") task.id = heading[1];
      const field = FIELD.exec(line);
      if (field !== null && !task.fields.has(field[1])) task.fields.set(field[1], field[2].trim());
      if (TASK_CLOSE.test(line)) {
        task.last = at;
        plan.tasks.push(task);
        task = null;
      }
      return;
    }
    if (TASK_OPEN.test(line)) {
      close(at - 1);
      task = { id: "", first: at, last: at, fields: new Map() };
      return;
    }
    if (/^(```|~~~)/.test(line)) fenced = !fenced;
    if (fenced) return;
    if (line.startsWith("## ")) {
      close(at - 1);
      section = line.slice(3).trim();
      sub = "";
      return;
    }
    if (line.startsWith("### ")) {
      close(at - 1);
      sub = line.slice(4).trim();
      const contract = /^### (\S+) - /.exec(line);
      if (section === "Contracts" && contract !== null) {
        block = { id: contract[1], first: at, last: at };
        plan.contracts.push(block);
      }
      return;
    }
    if (section === "Acceptance criteria") {
      const item = /^[ \t]*(\d+)\.[ \t]/.exec(line);
      if (item !== null) {
        close(at - 1);
        block = { id: `AC${item[1]}`, first: at, last: at };
        plan.criteria.push(block);
      }
      return;
    }
    if (sub === "Must not change") plan.mustNot.push(line);
    if (sub === "File map") {
      const entry = /^- [a-z]+[ \t]+-[ \t]+`?([^\s`]+)`?/.exec(line);
      if (entry !== null) plan.fileMap.set(entry[1].replace(/^\.\//, ""), line);
    }
  });
  close(lines.length - 1);
  // A block ends before the blank lines that only separate it from what follows.
  for (const part of [...plan.contracts, ...plan.criteria]) {
    while (part.last > part.first && lines[part.last].trim() === "") part.last -= 1;
  }
  while (plan.mustNot.length > 0 && plan.mustNot[plan.mustNot.length - 1].trim() === "") plan.mustNot.pop();
  while (plan.mustNot.length > 0 && plan.mustNot[0].trim() === "") plan.mustNot.shift();
  return plan;
}

/** A run of consecutive tasks, as positions counted from 1. */
export interface Slice {
  from: number;
  to: number;
}

/** The label a dispatch carries for a slice of these tasks: `T3-T9`, by the ids the plan gives them. */
export const rangeOf = (plan: Plan, slice: Slice): string => `${plan.tasks[slice.from - 1].id}-${plan.tasks[slice.to - 1].id}`;

/**
 * The count tasks cut into ceil(count / 8) runs of consecutive tasks, sizes
 * differing by at most one, the larger first: the cut scripts/plan-index.sh and
 * hooks/scripts/plan-gate.sh make for the task reviewers.
 */
export function slicesOf(count: number): Slice[] {
  if (count < 1) return [];
  const runs = Math.ceil(count / 8);
  const base = Math.floor(count / runs);
  const extra = count % runs;
  const slices: Slice[] = [];
  let from = 1;
  for (let run = 1; run <= runs; run++) {
    const to = from + base - 1 + (run <= extra ? 1 : 0);
    slices.push({ from, to });
    from = to + 1;
  }
  return slices;
}
