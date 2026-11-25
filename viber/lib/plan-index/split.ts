/*
 * split.ts - the decomposition of --split: cuts a plan into its specification,
 * its phases and one file per task, and writes and commits them beside it.
 */

import { byteOrder } from "../byte-order.ts";
import { baseOf } from "../map-answer.ts";
import type { Fs, Git, GitWrite } from "../ports.ts";
import { CLOSE_TASK, headingOf, OPEN_TASK, PHASES, SECTION, SUBSECTION, TASKS } from "./read.ts";
import { clausesOf, closesFence, criteriaOf, entriesOf, fenceReader, linesOf, opensFence, trim, valueOf, type Fence } from "./text.ts";

export interface Decomposed {
  spec: string;
  /** null: the plan carries no phases section. */
  phases: string | null;
  tasks: Array<{ id: string; text: string }>;
}

interface Line {
  text: string;
  fenced: boolean;
}

const rows = (lines: string[]): string => lines.map((line) => `${line}\n`).join("");

/** The body under a heading, up to the next heading of any level: the blank lines at both ends dropped, those inside kept. */
function sectionOf(lines: Line[], heading: RegExp): string {
  const at = lines.findIndex((line) => !line.fenced && heading.test(line.text));
  if (at < 0) return "";
  const end = lines.findIndex((line, i) => i > at && !line.fenced && line.text.startsWith("##"));
  const body = lines.slice(at + 1, end < 0 ? lines.length : end).map((line) => line.text);
  const kept = (line: string): boolean => trim(line) !== "";
  return rows(body.slice(Math.max(body.findIndex(kept), 0), body.findLastIndex(kept) + 1).map((line) => (kept(line) ? line : "")));
}

/** Lines written one by one, a run of blank ones between two collapsed into one. */
function collapsed(): { add(line: string): void; lines: string[] } {
  const lines: string[] = [];
  let blank = false;
  return {
    lines,
    add(line) {
      if (trim(line) === "") {
        blank = true;
        return;
      }
      if (blank && lines.length > 0) lines.push("");
      blank = false;
      lines.push(line);
    },
  };
}

/**
 * Everything above the task list, less the frontmatter and every HTML comment,
 * which belong to the run; the `issue:` key alone outlives it. The phases section
 * holds what this plan does not build, so it goes to a text of its own. A fenced
 * block is content and stays line for line, a comment in it included.
 */
function headOf(lines: string[]): { spec: string; phases: string | null } {
  let from = 0;
  let issue = "";
  if (trim(lines[0] ?? "") === "---") {
    for (const [i, line] of lines.entries()) {
      const text = trim(line);
      if (i > 0 && text === "---") {
        from = i + 1;
        break;
      }
      if (text.startsWith("issue:")) issue = valueOf(text);
    }
  }
  const spec = collapsed();
  const phases = collapsed();
  let inPhases = false;
  let comment = false;
  let fence: Fence | null = null;
  for (const line of lines.slice(from)) {
    const text = trim(line);
    if (comment || (fence === null && text.startsWith("<!--"))) {
      comment = !text.includes("-->");
      continue;
    }
    if (fence !== null) {
      // Straight to the lines: a blank one inside a fence is content.
      (inPhases ? phases : spec).lines.push(line);
      if (closesFence(text, fence)) fence = null;
      continue;
    }
    const opens = SECTION.test(line);
    if (opens) inPhases = PHASES.test(line);
    fence = opensFence(text);
    (inPhases ? phases : spec).add(opens && inPhases ? "## Phases" : line);
  }
  const front = issue === "" ? [] : ["---", `issue: ${issue}`, "---", ""];
  return { spec: rows([...front, ...spec.lines]), phases: phases.lines.length === 0 ? null : rows(phases.lines) };
}

/** The text of each contract block by id, its heading line first. */
function contractsOf(lines: Line[]): Map<string, string> {
  const blocks = new Map<string, string>();
  let inside = false;
  let id = "";
  for (const { text, fenced } of lines) {
    if (!fenced && SECTION.test(text)) {
      inside = text.includes("Contracts");
      id = "";
    } else if (inside && !fenced && SUBSECTION.test(text)) {
      id = headingOf(text)?.id ?? trim(text.slice(3));
      blocks.set(id, `${text}\n`);
    } else if (inside && id !== "") blocks.set(id, `${blocks.get(id)}${text}\n`);
  }
  return blocks;
}

/** The text of each criterion by number, its continuation lines included. */
function criteriaTexts(lines: Line[]): Map<number, string> {
  const criteria = new Map<number, string>();
  let inside = false;
  let number = 0;
  for (const { text, fenced } of lines) {
    const item = /^([0-9]+)\./.exec(text);
    if (!fenced && SECTION.test(text)) {
      inside = text.includes("Acceptance criteria");
      number = 0;
    } else if (!inside) continue;
    else if (item !== null) {
      number = Number(item[1]);
      criteria.set(number, text);
    } else if (trim(text) === "") number = 0;
    else if (number > 0) criteria.set(number, `${criteria.get(number)}\n${text}`);
  }
  return criteria;
}

/** The DoD line as one numbered line per clause: a coder answers for each and a reviewer gates each. One holding no clause stays as it is. */
function clauseLines(line: string): string[] {
  const clauses = clausesOf(line.replace(/^[^:]*:/, ""));
  return clauses.length === 0 ? [line] : clauses.map((clause, k) => `- DoD.${k + 1}: ${clause}`);
}

/** The whole job of one coder, which is handed nothing else: its block, the goal, the criteria it covers, the contracts it uses and the boundaries it may not cross. */
function taskText(body: string[], covers: string[], uses: string[], shared: { goal: string; mustNot: string; out: string; criteria: Map<number, string>; contracts: Map<string, string> }): string {
  const named = uses.flatMap((id) => shared.contracts.get(id) ?? []);
  const under = (heading: string, text: string): string => (text === "" ? "" : `\n## ${heading}\n${text}`);
  return [
    rows(body),
    under("Goal", shared.goal),
    covers.length === 0 ? "" : `\n## Covered criteria\n${rows(covers.flatMap((number) => shared.criteria.get(Number(number)) ?? []))}`,
    named.length === 0 ? "" : `\n## Contracts\n${named.map((block) => `\n${block.replace(/\n[ \t\n\v\f\r]*\n$/, "\n")}`).join("")}`,
    under("Must not change", shared.mustNot),
    under("Out of scope", shared.out),
  ].join("");
}

/** Cuts a plan the checks passed. */
export function decompose(text: string): Decomposed {
  const fenced = fenceReader();
  const lines = linesOf(text).map((line): Line => ({ text: line, fenced: fenced(line) }));
  const found = lines.findIndex((line) => !line.fenced && TASKS.test(line.text));
  const cut = found < 0 ? lines.length : found;
  const shared = {
    goal: sectionOf(lines, /^##[ \t\v\f\r]*Goal[ \t\v\f\r]*$/),
    mustNot: sectionOf(lines, /^###[ \t\v\f\r]*Must not change[ \t\v\f\r]*$/),
    out: sectionOf(lines, /^###[ \t\v\f\r]*Out of scope[ \t\v\f\r]*$/),
    criteria: criteriaTexts(lines.slice(0, cut)),
    contracts: contractsOf(lines),
  };
  const tasks: Decomposed["tasks"] = [];
  let open: { id: string; body: string[]; covers: string[]; uses: string[] } | null = null;
  for (const { text: line, fenced: inFence } of lines.slice(cut)) {
    if (OPEN_TASK.test(line)) open = { id: "", body: [], covers: [], uses: [] };
    else if (open === null) continue;
    else if (CLOSE_TASK.test(line)) {
      if (open.id !== "") tasks.push({ id: open.id, text: taskText(open.body, open.covers, open.uses, shared) });
      open = null;
    } else if (/^-[ \t\v\f\r]*DoD:/.test(line)) open.body.push(...clauseLines(line));
    else {
      open.body.push(line);
      if (open.id === "" && !inFence && SUBSECTION.test(line)) open.id = headingOf(line)?.id ?? trim(line.slice(3));
      if (/^-[ \t\v\f\r]*Covers:/.test(line)) open.covers = criteriaOf(valueOf(line));
      if (/^-[ \t\v\f\r]*Uses:/.test(line)) open.uses = ["none", "-"].includes(valueOf(line)) ? [] : entriesOf(valueOf(line));
    }
  }
  return { ...headOf(lines.slice(0, cut).map((line) => line.text)), tasks };
}

/** The `#<n>` of the frontmatter's `issue:` key, a full GitHub issue URL; null for none. */
function issueOf(text: string): string | null {
  const lines = linesOf(text).map((line) => trim(line));
  const end = lines[0] === "---" ? lines.indexOf("---", 1) : -1;
  const value = lines.slice(1, Math.max(end, 1)).findLast((line) => line.startsWith("issue:")) ?? "";
  const url = /\/issues\/([0-9]+)([/?#].*)?$/s.exec(value);
  return url === null ? null : `#${url[1]}`;
}

/** The files and directories the run holds under attachments/, by path, a directory ending in "/". */
function attachmentsAt(dir: string, disk: (path: string) => string, fs: Fs): string[] {
  const at = `${dir}/attachments`;
  return fs
    .listDir(disk(at))
    .filter((name) => !name.startsWith("."))
    .sort(byteOrder)
    .flatMap((name) => {
      const kind = fs.kind(disk(`${at}/${name}`));
      return kind === null ? [] : [`${at}/${name}${kind === "dir" ? "/" : ""}`];
    });
}

const EMPTY_STATE = (count: number): string => rows(["# status", "", `progress: 0/${count}`, "done: none", "skipped: none", "unreviewed: none", "deferred: none", "closed: none"]);

export interface SplitPorts {
  fs: Fs;
  git: Git;
  write: GitWrite;
}

export interface SplitRun {
  /** The plan as decompose cut it, its text and the count of its task blocks. */
  parts: Decomposed;
  text: string;
  count: number;
  /** The run directory as printed, and where a printed path lies. */
  dir: string;
  disk: (path: string) => string;
  root: string;
}

/**
 * Writes the decomposition into the run directory and commits the paths it owns,
 * never the whole directory: a trail file under work/ belongs to a task's commit.
 * A refused commit changes nothing: the files are on disk either way. The path
 * that could not be written, else null.
 */
export function writeSplit({ parts, text, count, dir, disk, root }: SplitRun, { fs, git, write }: SplitPorts): string | null {
  for (const name of ["tasks", "phases.md", "roadmap.md"]) {
    if (!fs.removeTree(disk(`${dir}/${name}`))) return `${dir}/${name}`;
  }
  if (!fs.makeDir(disk(`${dir}/tasks`))) return `${dir}/tasks`;
  const attachments = attachmentsAt(dir, disk, fs);
  const files: Array<[string, string]> = [
    [`${dir}/spec.md`, parts.spec + (attachments.length === 0 ? "" : `\n## Attachments\n${rows(attachments)}`)],
    ...(parts.phases === null ? [] : [[`${dir}/phases.md`, parts.phases] as [string, string]]),
    ...parts.tasks.map(({ id, text: body }): [string, string] => [`${dir}/tasks/${id}.md`, body]),
    // An existing one carries the run's progress.
    ...(fs.kind(disk(`${dir}/status.md`)) === "file" ? [] : [[`${dir}/status.md`, EMPTY_STATE(count)] as [string, string]]),
  ];
  for (const [path, body] of files) if (!fs.writeBytes(disk(path), new TextEncoder().encode(body))) return path;

  const paths = ["plan.md", "spec.md", "tasks", "status.md", ...(parts.phases === null ? [] : ["phases.md"])].map((name) => `${dir}/${name}`);
  // A run split under the name roadmap.md: its removal is committed too.
  if (git.indexHolds(root, `${dir}/roadmap.md`)) paths.push(`${dir}/roadmap.md`);
  if (attachments.length > 0) paths.push(`${dir}/attachments`);
  if (git.isRepository(root)) {
    const issue = issueOf(text);
    write.stage(root, paths);
    if (git.stagedFiles(root, paths)?.length !== 0) write.commit(root, `chore(viber): decompose plan ${baseOf(dir)}${issue === null ? "" : `\n\nRefs: ${issue}`}`, paths, false);
  }
  return null;
}
