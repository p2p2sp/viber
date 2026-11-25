/*
 * plan-text.ts - reads the text of a plan file for the plan-build core: its task
 * blocks, contract blocks, acceptance criteria and the two sections a slice brief
 * quotes; cuts the files the planning agents write (the frame file, an author
 * file, the text of a slice); numbers the tasks of an assembled plan and writes
 * their Depends-on lines; and reads and writes the "## Open items" section the
 * plan-build core keeps. It reads text only and checks nothing: validation stays
 * with plan-index/.
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
  /** The `- <action> - <path>[, <path>]... - <text>` lines under `### File map`, by each path they name. */
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
    const fence = /^(```|~~~)/.test(line);
    if (fence) fenced = !fenced;
    // A fenced block opens no section, and one under Must not change is quoted whole, both fence lines with it.
    if (fenced || fence) {
      if (sub === "Must not change") plan.mustNot.push(line);
      return;
    }
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
      // At column 0 alone, as plan-index.sh counts a criterion: an indented numbered line is a step of the criterion above it.
      const item = /^(\d+)\.[ \t]/.exec(line);
      if (item !== null) {
        close(at - 1);
        block = { id: `AC${item[1]}`, first: at, last: at };
        plan.criteria.push(block);
      }
      return;
    }
    if (sub === "Must not change") plan.mustNot.push(line);
    if (sub === "File map") {
      // The path list as plan-index.sh reads it: up to the first " - ", one path per comma.
      const entry = /^- [a-z]+[ \t]+-[ \t]+(.*)$/.exec(line);
      const paths = entry === null ? [] : entry[1].split(" - ")[0].split(",");
      for (const part of paths) {
        const path = part
          .trim()
          .replace(/^`(.*)`$/, "$1")
          .trim()
          .replace(/^\.\//, "");
        if (path !== "") plan.fileMap.set(path, line);
      }
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

/**
 * The count tasks cut into ceil(count / 8) runs of consecutive tasks, sizes
 * differing by at most one, the larger first: the cut of
 * plan-index/final-review.ts.
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

/** One line of the "## Open items" section: an open critical problem or a note, of one task or of the plan. */
export interface OpenItem {
  kind: "critical" | "note";
  /** A task id, or "plan". */
  where: string;
  text: string;
}

const OPEN_HEADING = /^## Open items[ \t]*$/;
const OPEN_ITEM = /^- (critical|note) \| (\S+) \| (.*\S)[ \t]*$/;
/** A task file takes this many notes; a note past them stays in the plan for the user. */
export const NOTE_CAP = 3;
/** What a note of a fix made after the last review opens on: kept ahead of every other note of its task. */
export const FIXED_AFTER = "fixed after the last review:";

export const openItemLine = (item: OpenItem): string => `- ${item.kind} | ${item.where} | ${item.text}`;

/** The first and the line after the last of the section whose "## " heading matches; null when the plan has none. A heading inside a task block or a fenced block opens nothing. */
export function sectionOf(lines: string[], heading: RegExp): { from: number; to: number } | null {
  let from = -1;
  let task = false;
  let fenced = false;
  for (const [at, line] of lines.entries()) {
    if (TASK_OPEN.test(line)) task = true;
    else if (TASK_CLOSE.test(line)) task = false;
    else if (/^(```|~~~)/.test(line)) fenced = !fenced;
    if (task || fenced || !line.startsWith("## ")) continue;
    if (from >= 0) return { from, to: at };
    if (heading.test(line)) from = at;
  }
  return from < 0 ? null : { from, to: lines.length };
}

/** The items of the "## Open items" section, in line order; a line of another shape is none. */
export function openItemsOf(lines: string[]): OpenItem[] {
  const section = sectionOf(lines, OPEN_HEADING);
  if (section === null) return [];
  return lines.slice(section.from + 1, section.to).flatMap((line) => {
    const item = OPEN_ITEM.exec(line);
    return item === null ? [] : [{ kind: item[1] as OpenItem["kind"], where: item[2], text: item[3] }];
  });
}

/**
 * The plan with these items as its "## Open items" section, the last one above
 * "## Tasks", in place of the section it held; no section for no item. Critical
 * problems come first, then the notes task by task: per task the notes fixed
 * after the last review, then the others in the order given, NOTE_CAP of them
 * kept and each one past that rewritten as a plan note naming its task.
 */
export function withOpenItems(lines: string[], items: OpenItem[]): string[] {
  const old = sectionOf(lines, OPEN_HEADING);
  const rest = old === null ? [...lines] : [...lines.slice(0, old.from), ...lines.slice(old.to)];
  const seen = new Set<string>();
  const once = items.filter((item) => !seen.has(openItemLine(item)) && seen.add(openItemLine(item)));
  const byTask = new Map<string, OpenItem[]>();
  for (const item of once) if (item.kind === "note" && item.where !== "plan") byTask.set(item.where, [...(byTask.get(item.where) ?? []), item]);
  const kept: OpenItem[] = [];
  const over: OpenItem[] = [];
  for (const [where, notes] of byTask) {
    const ordered = [...notes.filter((item) => item.text.startsWith(FIXED_AFTER)), ...notes.filter((item) => !item.text.startsWith(FIXED_AFTER))];
    kept.push(...ordered.slice(0, NOTE_CAP));
    over.push(...ordered.slice(NOTE_CAP).map((item): OpenItem => ({ kind: "note", where: "plan", text: `(${where}) ${item.text}` })));
  }
  const written = [...once.filter((item) => item.kind === "critical"), ...kept, ...once.filter((item) => item.kind === "note" && item.where === "plan"), ...over];
  if (written.length === 0) return rest;
  const tasks = sectionOf(rest, /^## Tasks/);
  const at = tasks === null ? rest.length : tasks.from;
  const gap = at > 0 && rest[at - 1].trim() !== "" ? [""] : [];
  return [...rest.slice(0, at), ...gap, "## Open items", "", ...written.map(openItemLine), "", ...rest.slice(at)];
}

/** The lines without the blank ones at both ends. */
function unpadded(lines: string[]): string[] {
  let from = 0;
  let to = lines.length;
  while (from < to && lines[from].trim() === "") from += 1;
  while (to > from && lines[to - 1].trim() === "") to -= 1;
  return lines.slice(from, to);
}

/** One "SLICE: <k> | covers: AC1, AC3 | uses: C1 | <what the slice delivers>" line of a frame file. */
export interface FrameSlice {
  slice: number;
  covers: string[];
  uses: string[];
  delivers: string;
}

const SLICE_LINE = /^[ \t]*(?:[-*][ \t]+)?SLICE:[ \t]*(\d+)[ \t]*\|(.*)$/;

/** The SLICE: lines among the lines: the fields opening on "covers:" and "uses:" read as lists, every other field the text of what the slice delivers. */
export function frameSlicesOf(lines: string[]): FrameSlice[] {
  return lines.flatMap((line) => {
    const row = SLICE_LINE.exec(line);
    if (row === null) return [];
    const fields = row[2].split("|").map((field) => field.trim());
    const listed = (label: string): string[] => fields.filter((field) => field.startsWith(label)).flatMap((field) => listOf(field.slice(label.length)));
    return [{ slice: Number(row[1]), covers: listed("covers:"), uses: listed("uses:"), delivers: fields.filter((field) => !field.startsWith("covers:") && !field.startsWith("uses:")).join(" | ") }];
  });
}

/**
 * A frame file cut at its "<!-- SLICES -->" and "<!-- DECISIONS -->" lines: the
 * plan text above the first of them, the SLICE: lines and the decision log, the
 * blank lines at both ends of the text and of the log dropped.
 */
export function cutFrame(lines: string[]): { text: string[]; slices: FrameSlice[]; decisions: string[] } {
  const marks = lines.flatMap((line, at) => (["<!-- SLICES -->", "<!-- DECISIONS -->"].includes(line.trim()) ? [at] : []));
  const below = (mark: string): string[] => {
    const at = marks.find((each) => lines[each].trim() === mark);
    return at === undefined ? [] : lines.slice(at + 1, marks.find((each) => each > at) ?? lines.length);
  };
  return { text: unpadded(lines.slice(0, marks[0] ?? lines.length)), slices: frameSlicesOf(below("<!-- SLICES -->")), decisions: unpadded(below("<!-- DECISIONS -->")) };
}

/**
 * An author file cut at its "<!-- NOTES -->" line: the text above it and, below
 * it, the FACT: lines as written, the text of each GAP: line and the path and
 * text of each "OUTSIDE: <path> | <text>" line. A list mark or blanks in front of
 * a note line are dropped, and any other line below the marker is left out.
 */
export function cutAuthor(lines: string[]): { text: string[]; facts: string[]; gaps: string[]; outside: { path: string; text: string }[] } {
  const cut = lines.findIndex((line) => line.trim() === "<!-- NOTES -->");
  const author = { text: unpadded(cut < 0 ? lines : lines.slice(0, cut)), facts: [] as string[], gaps: [] as string[], outside: [] as { path: string; text: string }[] };
  for (const line of cut < 0 ? [] : lines.slice(cut + 1)) {
    const note = /^[ \t]*(?:[-*][ \t]+)?(FACT|GAP|OUTSIDE):[ \t]*(.*\S)[ \t]*$/.exec(line);
    if (note === null) continue;
    const bar = note[2].indexOf("|");
    if (note[1] === "FACT") author.facts.push(`FACT: ${note[2]}`);
    else if (note[1] === "GAP") author.gaps.push(note[2]);
    else if (bar > 0 && note[2].slice(bar + 1).trim() !== "") author.outside.push({ path: note[2].slice(0, bar).trim(), text: note[2].slice(bar + 1).trim() });
  }
  return author;
}

/**
 * The text of a slice as its author wrote it: the task blocks, marker to marker,
 * and the contract blocks that follow them, each from its "### <id> - <name>"
 * heading to its last line with text. A line outside both is left out, and a
 * heading inside a task block or a fenced block opens nothing.
 */
export function cutSliceText(lines: string[]): { tasks: string[][]; blocks: { id: string; lines: string[] }[] } {
  const tasks: string[][] = [];
  const blocks: { id: string; lines: string[] }[] = [];
  let task: string[] | null = null;
  let block: { id: string; lines: string[] } | null = null;
  let fenced = false;
  for (const line of lines) {
    if (task !== null) {
      task.push(line);
      if (TASK_CLOSE.test(line)) task = null;
      continue;
    }
    if (TASK_OPEN.test(line)) {
      block = null;
      task = [line];
      tasks.push(task);
      continue;
    }
    if (/^(```|~~~)/.test(line)) fenced = !fenced;
    else if (!fenced && /^##? /.test(line)) block = null;
    else if (!fenced && line.startsWith("### ")) {
      const heading = /^### (\S+) - /.exec(line);
      block = heading === null ? null : { id: heading[1], lines: [] };
      if (block !== null) blocks.push(block);
    }
    block?.lines.push(line);
  }
  for (const each of blocks) each.lines = unpadded(each.lines);
  return { tasks, blocks };
}

/**
 * The lines with the task blocks numbered T1.. in order, on the first
 * "### <id> - <title>" heading of each, and the id each block held before ("" for
 * a block with no such heading, which is left as it is).
 */
export function renumberTasks(lines: string[]): { lines: string[]; ids: { old: string; fresh: string }[] } {
  const out = [...lines];
  const ids: { old: string; fresh: string }[] = [];
  let open = false;
  let named = false;
  for (const [at, line] of lines.entries()) {
    if (TASK_OPEN.test(line)) {
      open = true;
      named = false;
      ids.push({ old: "", fresh: `T${ids.length + 1}` });
    } else if (TASK_CLOSE.test(line)) open = false;
    else if (open && !named) {
      const heading = /^### (\S+) - /.exec(line);
      if (heading === null) continue;
      named = true;
      const id = ids[ids.length - 1];
      id.old = heading[1];
      out[at] = `### ${id.fresh}${line.slice(4 + heading[1].length)}`;
    }
  }
  return { lines: out, ids };
}

/** The text with each whole token that is a key of the map replaced by its value: a run of letters, digits, "_" and "-" that is no part of a path (a sentence period after it allowed). */
export function renameIn(text: string, names: Map<string, string>): string {
  return names.size === 0 ? text : text.replace(/(?<![A-Za-z0-9_./-])[A-Za-z0-9_-]+(?![A-Za-z0-9_/-]|\.[A-Za-z0-9_])/g, (token) => names.get(token) ?? token);
}

/** The lines of a task block with those tokens renamed in its Uses, Delivers and DoD lines, and in no other. */
export function renameTokens(block: string[], names: Map<string, string>): string[] {
  return block.map((line) => (/^- (Uses|Delivers|DoD):/.test(line) ? `${line.slice(0, line.indexOf(":") + 1)}${renameIn(line.slice(line.indexOf(":") + 1), names)}` : line));
}

/**
 * The lines of a task block with the task ids of the map renamed in its
 * Delivers, Verification and DoD lines, outside backtick spans, where
 * plan-index.sh reads a task id too. Only an id of letters then digits counts
 * (T3, NEW1): a plain word an author took as an id is left alone.
 */
export function renameTaskIds(block: string[], names: Map<string, string>): string[] {
  const ids = new Map([...names].filter(([old, fresh]) => old !== fresh && /^[A-Za-z]+\d+$/.test(old)));
  if (ids.size === 0) return block;
  const outside = (text: string): string => text.split(/(`[^`]*`)/).map((part, at) => (at % 2 === 0 ? renameIn(part, ids) : part)).join("");
  return block.map((line) => (/^- (Delivers|Verification|DoD):/.test(line) ? `${line.slice(0, line.indexOf(":") + 1)}${outside(line.slice(line.indexOf(":") + 1))}` : line));
}

/** The first and last line of each task block, in order. */
function taskSpans(lines: string[]): { first: number; last: number }[] {
  const spans: { first: number; last: number }[] = [];
  let first = -1;
  for (const [at, line] of lines.entries()) {
    if (TASK_OPEN.test(line)) first = at;
    else if (first >= 0 && TASK_CLOSE.test(line)) {
      spans.push({ first, last: at });
      first = -1;
    }
  }
  return spans;
}

/** The lines with each task block rewritten by the function given its lines and its place from 0. */
export function mapTasks(lines: string[], each: (block: string[], at: number) => string[]): string[] {
  const out: string[] = [];
  let from = 0;
  taskSpans(lines).forEach((span, at) => {
    out.push(...lines.slice(from, span.first), ...each(lines.slice(span.first, span.last + 1), at));
    from = span.last + 1;
  });
  return [...out, ...lines.slice(from)];
}

/**
 * The lines with the task blocks moved into the order given: order[k] is the
 * place, from 0, of the block that goes to place k. The lines between the
 * blocks stay where they are. An order that does not name every block once
 * moves nothing.
 */
export function reorderTasks(lines: string[], order: number[]): string[] {
  const spans = taskSpans(lines);
  if (order.length !== spans.length || order.every((from, at) => from === at) || new Set(order).size !== spans.length || order.some((from) => spans[from] === undefined)) return lines;
  return mapTasks(lines, (_, at) => lines.slice(spans[order[at]].first, spans[order[at]].last + 1));
}

/**
 * The lines with the value of each task block, in order, as its "- Depends-on:"
 * line: in place of the one the block holds, else below its Uses line, else
 * below its heading. A block past the values given is left as it is.
 */
export function withDepends(lines: string[], values: string[]): string[] {
  const out: string[] = [];
  let task = -1;
  let from = -1;
  for (const line of lines) {
    if (TASK_OPEN.test(line)) {
      task += 1;
      from = out.length;
    } else if (from >= 0 && TASK_CLOSE.test(line)) {
      if (task < values.length) {
        const row = `- Depends-on: ${values[task]}`;
        const block = out.slice(from);
        const at = block.findIndex((each) => each.startsWith("- Depends-on:"));
        const uses = block.findIndex((each) => each.startsWith("- Uses:"));
        const heading = block.findIndex((each) => each.startsWith("### "));
        if (at >= 0) out[from + at] = row;
        else out.splice(from + (uses >= 0 ? uses : heading >= 0 ? heading : 0) + 1, 0, row);
      }
      from = -1;
    }
    out.push(line);
  }
  return out;
}
