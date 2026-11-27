/*
 * plan-parse.ts - reads the text of a plan into its tasks. It judges nothing:
 * every line it cannot place is kept with its number for plan-check.ts.
 */

/** The task field names, in the order the template gives them. `DoD` opens the clause list. */
export const FIELDS = ["Delivers", "Covers", "Files", "Blocked-by", "TDD", "Tests", "Seam", "Hard", "UI", "Model", "DoD", "Verify"];

export interface Field {
  value: string;
  line: number;
}

export interface Task {
  /** The number of `T<n>` as written. */
  num: number;
  title: string;
  /** The 1-based line of the `### T<n> - <title>` heading. */
  line: number;
  /** The first occurrence of each field. */
  fields: Map<string, Field>;
  /** The names of the fields written more than once. */
  repeated: string[];
  /** The `- ` clauses under `DoD:`, the marker cut. */
  dod: string[];
  /** The lines that are no field, no clause and not blank. */
  stray: number[];
  /** The raw lines of the block, heading first, trailing blank lines cut. */
  block: string[];
}

export interface Plan {
  /** The text of the first `# ` heading, null when the first written line is no such heading. */
  title: string | null;
  /** The `OPEN:` lines above `## Tasks`. */
  open: Field[];
  /** The other written lines above `## Tasks`, the title left out. */
  above: number[];
  /** The line of `## Tasks`, 0 when missing. */
  tasksLine: number;
  /** The `##` and `###` headings below `## Tasks` that open no task. */
  headings: Field[];
  tasks: Task[];
}

const TASK_RE = /^### T(\d+) - (.*\S)\s*$/;
const FIELD_RE = new RegExp(`^(${FIELDS.join("|")}):[ \\t]*(.*?)\\s*$`);
const CLAUSE_RE = /^- +(.*?)\s*$/;

/** Reads a plan. Never throws. */
export function parsePlan(text: string): Plan {
  const plan: Plan = { title: null, open: [], above: [], tasksLine: 0, headings: [], tasks: [] };
  const lines = text.split(/\r?\n/);
  let task: Task | null = null;
  let titleSeen = false;
  let inDod = false;

  lines.forEach((line, index) => {
    const n = index + 1;
    if (plan.tasksLine === 0) {
      if (/^## Tasks\s*$/.test(line)) plan.tasksLine = n;
      else if (line.trim() === "") return;
      else if (!titleSeen && /^# \S/.test(line)) plan.title = line.slice(2).trim();
      else if (/^OPEN:/.test(line)) plan.open.push({ value: line.slice(5).trim(), line: n });
      else plan.above.push(n);
      titleSeen = true;
      return;
    }

    const heading = TASK_RE.exec(line);
    if (heading) {
      task = { num: Number(heading[1]), title: heading[2], line: n, fields: new Map(), repeated: [], dod: [], stray: [], block: [line] };
      plan.tasks.push(task);
      inDod = false;
      return;
    }
    if (/^#{1,3} /.test(line)) {
      plan.headings.push({ value: line.trim(), line: n });
      task = null;
      return;
    }
    if (!task) {
      if (line.trim() !== "") plan.above.push(n);
      return;
    }

    task.block.push(line);
    if (line.trim() === "") return;
    const clause = CLAUSE_RE.exec(line);
    if (inDod && clause) {
      task.dod.push(clause[1]);
      return;
    }
    const field = FIELD_RE.exec(line);
    if (!field) {
      task.stray.push(n);
      return;
    }
    inDod = field[1] === "DoD";
    if (task.fields.has(field[1])) task.repeated.push(field[1]);
    else task.fields.set(field[1], { value: field[2], line: n });
  });

  for (const each of plan.tasks) {
    while (each.block.length > 1 && each.block[each.block.length - 1].trim() === "") each.block.pop();
  }
  return plan;
}

/** The body lines of each `## ` section of a spec, by name. A heading inside a code block opens none. */
export function specSections(text: string): Map<string, string[]> {
  const sections = new Map<string, string[]>();
  let body: string[] | null = null;
  let fenced = false;
  for (const line of text.split(/\r?\n/)) {
    const fence = /^\s*```/.test(line);
    const heading = fenced || fence ? null : /^## +(.*\S)\s*$/.exec(line);
    if (fence) fenced = !fenced;
    if (heading) {
      body = [];
      sections.set(heading[1], body);
    } else body?.push(line);
  }
  return sections;
}

/** The ids a spec declares: the `- R<n>: ` items of Requirements and the `- D<n>: ` items of Decisions. */
export function specIds(spec: string): Set<string> {
  const sections = specSections(spec);
  const ids = new Set<string>();
  for (const [name, item] of [["Requirements", /^- (R\d+): /], ["Decisions", /^- (D\d+): /]] as const) {
    for (const line of sections.get(name) ?? []) {
      const id = item.exec(line);
      if (id) ids.add(id[1]);
    }
  }
  return ids;
}
