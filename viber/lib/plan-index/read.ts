/*
 * read.ts - reads a plan once, line by line: its title, phases, criteria,
 * contract blocks, attachments map, open items and task blocks, and the defects a
 * single line shows (a template slot, a scenario heading, a file map path, a
 * malformed heading, a line of the Open items section of another shape), in line
 * order. What the blocks say to each other is check.ts.
 */

import { bare, fenceReader, trim, valueOf } from "./text.ts";

export interface PlanTask {
  id: string;
  title: string;
  /** The heading is malformed: reported alone, every later check of the block skipped. */
  broken: boolean;
  /** The block opens above the `## Tasks` heading. */
  early: boolean;
  tdd: string;
  exclusive: string;
  repro: string;
  /** null: no Hard line. */
  hard: string | null;
  covers: string;
  uses: string;
  deps: string;
  files: string;
  delivers: string;
  verification: string;
  dod: string;
}

/** One line of the "## Open items" section: an open critical problem or a note, of the task where names or of the plan. */
export interface OpenItem {
  kind: "critical" | "note";
  where: string;
  text: string;
}

export interface PlanDoc {
  title: string;
  tasks: PlanTask[];
  /** The criterion numbers of the plan. */
  criteria: Set<number>;
  /** The well-formed contract ids, in order. */
  contracts: string[];
  /** The value of each `File:` line, by contract id. */
  contractFiles: Map<string, string>;
  /** The indented entry lines of the attachments map; null: the frontmatter has no such key. */
  attachments: string[] | null;
  hasTasks: boolean;
  hasRootCause: boolean;
  /** The phase names in build order, and the place (from 1) of the first one marked "(this plan)", 0 for none. */
  phases: string[];
  thisPhase: number;
  /** The well-formed lines of the Open items section, in order. */
  openItems: OpenItem[];
  defects: string[];
}

/** What the checks of a fresh plan alone need. held: the tree holds a file at the repo-relative path. */
export interface Fresh {
  slots: string[];
  held: (path: string) => boolean;
}

/** The `<...>` spans of the planner templates outside their HTML comments, each once. */
export function slotsOf(templates: string[]): string[] {
  const text = templates.map((template) => template.replace(/\n?$/, "\n")).join("").replace(/<!--[\s\S]*?(-->|$)/g, (comment) => (comment.includes("\n") ? "\n" : " "));
  return [...new Set(text.split("\n").flatMap((line) => line.replace(/\r$/, "").match(/<[^<>]+>/g) ?? []))];
}

export const OPEN_TASK = /^[ \t\n\v\f\r]*<!--[ \t\n\v\f\r]*TASK[ \t\n\v\f\r]*-->[ \t\n\v\f\r]*$/;
export const CLOSE_TASK = /^[ \t\n\v\f\r]*<!--[ \t\n\v\f\r]*\/TASK[ \t\n\v\f\r]*-->[ \t\n\v\f\r]*$/;
export const PHASES = /^##[ \t\v\f\r]*(Phases|Roadmap)[ \t\v\f\r]*$/;
export const TASKS = /^##[ \t\v\f\r]*Tasks/;
export const OPEN_ITEMS = /^##[ \t\v\f\r]*Open items[ \t\v\f\r]*$/;
export const SECTION = /^##[ \t\v\f\r]/;
export const SUBSECTION = /^###[ \t\v\f\r]/;

/** The item a line of the Open items section holds: `- critical|note | <task id>|plan | <text>`, the text everything after the second bar; null for any other line. */
export function openItemOf(line: string): OpenItem | null {
  const item = /^- (critical|note) \| ([^ \t|]+) \| (.*)$/s.exec(line.replace(/\r$/, ""));
  if (item === null || trim(item[3]) === "") return null;
  return { kind: item[1] as OpenItem["kind"], where: item[2], text: trim(item[3]) };
}

/** The `<id> - <name>` of a `### ` heading; null when it holds no " - ". */
export function headingOf(line: string): { id: string; name: string } | null {
  const text = trim(line.slice(3));
  const cut = text.indexOf(" - ");
  return cut < 0 ? null : { id: trim(text.slice(0, cut)), name: trim(text.slice(cut + 3)) };
}

const FIELDS: Array<[RegExp, keyof PlanTask]> = [
  [/^-[ \t\v\f\r]*TDD:/, "tdd"],
  [/^-[ \t\v\f\r]*Exclusive:/, "exclusive"],
  [/^-[ \t\v\f\r]*Repro:/, "repro"],
  [/^-[ \t\v\f\r]*Hard:/, "hard"],
  [/^-[ \t\v\f\r]*Covers:/, "covers"],
  [/^-[ \t\v\f\r]*Uses:/, "uses"],
  [/^-[ \t\v\f\r]*Depends-on:/, "deps"],
  [/^-[ \t\v\f\r]*Files:/, "files"],
  [/^-[ \t\v\f\r]*Delivers:/, "delivers"],
  [/^-[ \t\v\f\r]*Verification:/, "verification"],
  [/^-[ \t\v\f\r]*DoD:/, "dod"],
];

const newTask = (early: boolean): PlanTask => ({ id: "", title: "", broken: false, early, tdd: "", exclusive: "", repro: "", hard: null, covers: "", uses: "", deps: "", files: "", delivers: "", verification: "", dod: "" });

/** The plan text of a line: every backtick span and HTML comment cut, a comment open at its end carried on. */
function plainReader(): (line: string) => string {
  let open = false;
  return (raw) => {
    let text = raw.replace(/\r$/, "");
    if (open) {
      const end = text.indexOf("-->");
      if (end < 0) return "";
      text = text.slice(end + 3);
      open = false;
    }
    text = text.replace(/`[^`]*`/g, " ").replace(/<!--.*?-->/gs, " ");
    const start = text.indexOf("<!--");
    if (start < 0) return text;
    open = true;
    return text.slice(0, start);
  };
}

/** The paths of a `- modify - ...` or `- delete - ...` line of the file map; none for any other line. */
function mapPaths(line: string): { kind: string; paths: string[] } {
  const entry = /^-[ \t\v\f\r]+(modify|delete)[ \t\v\f\r]+-[ \t\v\f\r]+(.*)$/s.exec(line.replace(/\r$/, ""));
  if (entry === null) return { kind: "", paths: [] };
  const paths = entry[2].split(" - ")[0].split(",").map((part) => {
    const path = trim(part);
    return bare(/^`.*`$/s.test(path) ? trim(path.slice(1, -1)) : path);
  });
  return { kind: entry[1], paths: paths.filter((path) => path !== "") };
}

/** fresh null: the plan is frozen, and the checks added after plans were frozen are skipped. */
export function readPlan(lines: string[], fresh: Fresh | null): PlanDoc {
  const doc: PlanDoc = { title: "", tasks: [], criteria: new Set(), contracts: [], contractFiles: new Map(), attachments: null, hasTasks: false, hasRootCause: false, phases: [], thisPhase: 0, openItems: [], defects: [] };
  const defect = (text: string): void => void doc.defects.push(`FIX: ${text}`);
  const fenced = fenceReader();
  const plain = plainReader();
  let front = false;
  let inMap = false;
  let phaseComment = false;
  let inPhases = false;
  let inCriteria = false;
  let inContracts = false;
  let inBehaviour = false;
  let inFileMap = false;
  let inOpen = false;
  let scenarios = 0;
  let contract = "";
  /** The next non-blank line is the first of the contract block. */
  let opening = false;
  let task: PlanTask | null = null;

  const readFrontmatter = (raw: string): void => {
    const line = raw.replace(/\r$/, "");
    if (/^---[ \t]*$/.test(line)) front = false;
    else if (inMap && /^[ \t]*$/.test(line)) return;
    else if (inMap && /^[ \t]/.test(line)) doc.attachments?.push(line);
    else {
      inMap = /^attachments:[ \t]*$/.test(line);
      if (inMap) doc.attachments ??= [];
    }
  };

  const readPhase = (line: string, fence: boolean): void => {
    const text = trim(line);
    if (phaseComment || text.startsWith("<!--")) phaseComment = !text.includes("-->");
    else if (!fence && SECTION.test(line)) inPhases = PHASES.test(line);
    else if (inPhases && /^[0-9]+\. /.test(line)) {
      const name = trim(line.replace(/^[0-9]+\./, ""));
      doc.phases.push(name);
      if (doc.thisPhase === 0 && name.endsWith("(this plan)")) doc.thisPhase = doc.phases.length;
    }
  };

  const readScenario = (line: string, at: number): void => {
    const heading = trim(line.slice(3));
    if (heading === "Edge cases") return;
    scenarios += 1;
    const numbered = /^S([1-9][0-9]*) - (.*)$/s.exec(heading);
    if (numbered !== null && trim(numbered[2]) !== "" && Number(numbered[1]) === scenarios) return;
    defect(`line ${at}: scenario heading "${heading}" must be "### S<k> - <title>", the ${scenarios}th scenario in order - number it (Scenarios)`);
  };

  const readContractHeading = (line: string): void => {
    contract = "";
    const heading = headingOf(line);
    if (heading === null) return defect(`contract heading must be "### <id> - <name>", got: ${trim(line.slice(3))}`);
    contract = heading.id;
    opening = true;
    if (!/^[A-Za-z0-9_-]+$/.test(contract)) defect(`contract id "${contract}": letters, digits, "-" and "_" only - a Uses line references it by name`);
    else if (doc.contracts.includes(contract)) defect(`duplicate contract id: ${contract}`);
    else doc.contracts.push(contract);
  };

  const readTaskLine = (into: PlanTask, line: string, fence: boolean): void => {
    if (!fence && SUBSECTION.test(line)) {
      const heading = headingOf(line);
      if (heading === null) {
        defect(`task heading must be "### <id> - <title>", got: ${trim(line.slice(3))}`);
        into.broken = true;
      } else {
        into.id = heading.id;
        into.title = heading.name;
      }
      return;
    }
    const field = FIELDS.find(([label]) => label.test(line));
    if (field !== undefined) Object.assign(into, { [field[1]]: valueOf(line) });
  };

  for (const [index, line] of lines.entries()) {
    const at = index + 1;
    if (at === 1) front = /^---[ \t]*\r?$/.test(line);
    else if (front) readFrontmatter(line);
    const fence = fenced(line);

    if (fresh !== null && fresh.slots.length > 0 && !fence) {
      // The heading line itself is read as the section it opens.
      const text = plain(line);
      // A script wrote the open items from a review: a slot quoted there is no slot of the plan.
      const appendix = SECTION.test(line) ? line.includes("Contracts") : inContracts || inOpen;
      for (const slot of appendix ? [] : fresh.slots) {
        if (text.includes(slot)) defect(`line ${at}: template slot ${slot} left unfilled - replace it (Filled)`);
      }
    }

    if (!fence && doc.title === "" && /^#[ \t\v\f\r]/.test(line)) {
      doc.title = trim(line.slice(1));
      continue;
    }
    if (!doc.hasTasks) readPhase(line, fence);
    if (!fence && TASKS.test(line)) doc.hasTasks = true;
    if (!fence && SECTION.test(line)) {
      inCriteria = line.includes("Acceptance criteria");
      inContracts = line.includes("Contracts");
      inBehaviour = /^##[ \t\v\f\r]*Behaviour[ \t\v\f\r]*$/.test(line);
      inOpen = OPEN_ITEMS.test(line);
      scenarios = 0;
      contract = "";
    } else if (inOpen && task === null && trim(line) !== "" && !OPEN_TASK.test(line)) {
      const item = fence ? null : openItemOf(line);
      if (item === null) defect(`open items: line ${at} is not "- critical|note | <task id>|plan | <text>" (Open items)`);
      else doc.openItems.push(item);
    }
    if (fresh !== null && !fence && inBehaviour && SUBSECTION.test(line)) readScenario(line, at);
    if (!fence && /^#+[ \t\v\f\r]/.test(line)) inFileMap = /^###[ \t\v\f\r]+File map[ \t\v\f\r]*$/.test(line);
    if (fresh !== null && !fence && inFileMap) {
      const { kind, paths } = mapPaths(line);
      for (const path of paths) {
        if (!fresh.held(path)) defect(`file map: ${kind} ${path}, which the tree does not hold - correct the path or list it as add (File map)`);
      }
    }
    if (!fence && /^##[ \t\v\f\r]+Root cause[ \t\v\f\r]*$/.test(line)) doc.hasRootCause = true;
    if (inCriteria && /^[0-9]+\./.test(line)) doc.criteria.add(Number(line.split(".")[0]));

    if (inContracts && task === null) {
      if (!fence && SUBSECTION.test(line)) {
        readContractHeading(line);
        continue;
      }
      // Only the opening line of a block counts, so a "File:" inside the shape stays shape.
      if (contract !== "" && opening && /^-?[ \t\v\f\r]*File:/.test(line)) {
        doc.contractFiles.set(contract, valueOf(line));
        opening = false;
        continue;
      }
      if (contract !== "" && trim(line) !== "") opening = false;
    }
    if (OPEN_TASK.test(line)) {
      task = newTask(!doc.hasTasks);
      doc.tasks.push(task);
    } else if (CLOSE_TASK.test(line)) task = null;
    else if (task !== null) readTaskLine(task, line, fence);
  }
  return doc;
}
