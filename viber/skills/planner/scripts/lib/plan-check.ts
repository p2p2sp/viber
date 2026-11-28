/*
 * plan-check.ts - every rule a script can hold a plan draft to. Each break is
 * one `FIX:` line naming the task and what to change.
 */

import { blockers, fileEntries, globRegex, isIntegration, ownedFiles } from "./plan-order.ts";
import { FIELDS, type Plan } from "./plan-parse.ts";

// A task's title is the subject of its commit, behind `T<n> - `.
const MAX_TITLE = 64;
// Past this many tasks one plan is too much for one build: the user decides whether to split the spec.
export const LARGE_PLAN = 20;

const TDD_NONE = ["no-runtime", "refactor", "shape", "repro"];
const TESTS = ["none", "unit", "composite", "integration"];
// A directory named integration, integration-tests and the like, or a file name holding `.integration.`.
const INTEGRATION_RE = /(^|\/)integration([-_.]?tests?)?(\/|$)|\.integration\./i;
// The design references a `UI` line may name: files of the ui-designer skill's references/, the `.md` cut. The ones that choose a look (anti-slop, concepting, distinctiveness, process, ux-psychology) stay out: a coder builds in the host's look.
const UI_REFS = ["accessibility", "color", "components-states", "forms", "layout-spacing", "mobile", "motion", "saas-dashboards", "tokens", "typography"];
// The fields every task carries; `Hard` and `UI` are optional and the script writes `Model`.
const REQUIRED = FIELDS.filter((name) => name !== "Hard" && name !== "UI" && name !== "Model");

export interface Checked {
  fix: string[];
  open: string[];
}

/** Checks a parsed draft against its spec ids and the files of the tree. */
export function checkPlan(plan: Plan, ids: Set<string>, tree: string[]): Checked {
  const fix: string[] = [];
  const open = plan.open.map((entry) => `OPEN: line ${entry.line}: ${entry.value}`);
  const held = new Set(tree);

  if (plan.title === null) fix.push("FIX: line 1: the first line must be the title: '# <title>'");
  if (plan.tasksLine === 0) fix.push("FIX: no '## Tasks' heading: put every task under it");
  for (const line of plan.above) fix.push(`FIX: line ${line}: only the title, OPEN: lines and tasks belong in a draft: move it into a task or drop it`);
  for (const heading of plan.headings) fix.push(`FIX: line ${heading.line}: heading '${heading.value}' opens no task: a task is '### T<n> - <title>', and the script writes every other section`);
  if (plan.tasksLine > 0 && plan.tasks.length === 0) fix.push("FIX: '## Tasks' holds no task");

  const created = new Set<string>();
  const covered = new Set<string>();

  plan.tasks.forEach((task, index) => {
    const id = `T${task.num}`;
    const say = (text: string) => fix.push(`FIX: ${id}: ${text}`);
    const value = (name: string) => task.fields.get(name)?.value ?? "";

    if (task.title.length > MAX_TITLE) say(`the title holds ${task.title.length} characters, the limit is ${MAX_TITLE}: it is the subject of the task's commit`);
    if (task.num !== index + 1) say(`id must be T${index + 1}, the task's place in the plan: renumber the tasks and every Blocked-by`);
    for (const line of task.stray) fix.push(`FIX: line ${line}: ${id} holds a line that is no field and no DoD clause: fold it into Delivers or a DoD clause, or drop it`);
    for (const name of task.repeated) say(`${name} is written twice: keep one`);
    for (const name of REQUIRED) if (!task.fields.has(name)) say(`${name} is missing`);
    for (const name of ["Delivers", "Covers", "Files", "Blocked-by", "TDD", "Tests", "Seam", "Hard", "UI", "Verify"]) {
      if (task.fields.has(name) && value(name) === "") say(`${name} is empty`);
    }
    for (const token of value("UI").split(",").map((part) => part.trim()).filter((part) => part !== "")) {
      if (!UI_REFS.includes(token)) say(`UI names '${token}': it takes only ${UI_REFS.join(", ")}`);
    }
    if (task.fields.has("Model")) say("drop the Model line: the script assigns the model");
    if (task.block.some((line) => line.includes("{{") || line.includes("}}"))) say("a template placeholder is left: fill it");

    for (const token of value("Covers").split(",").map((part) => part.trim()).filter((part) => part !== "")) {
      if (!/^[RD]\d+$/.test(token)) say(`Covers token '${token}' is no R<n> or D<n>`);
      else if (!ids.has(token)) say(`Covers names ${token}, which the spec does not hold`);
      else covered.add(token);
    }

    const tdd = value("TDD");
    const none = /^none \(([a-z-]+)\)$/.exec(tdd);
    const reason = none ? none[1] : "";
    const required = tdd === "required";
    if (task.fields.has("TDD") && tdd !== "" && !required && !TDD_NONE.includes(reason)) {
      say(`TDD must be 'required' or 'none (<reason>)' with one of: ${TDD_NONE.join(", ")}`);
    }

    const files = fileEntries(value("Files"));
    if (task.fields.has("Files") && value("Files") !== "") {
      for (const raw of files.bad) say(`Files entry '${raw}' is no repo-relative path: no blank, quote, leading '/' or '..', and no '+' or '-' on a glob`);
      for (const entry of files.entries) {
        if (entry.kind === "glob") {
          const pattern = globRegex(entry.path);
          if (!tree.some((file) => pattern.test(file))) say(`Files glob '${entry.path}' matches no file of the tree`);
        } else if (entry.kind === "create") {
          if (held.has(entry.path)) say(`Files marks '${entry.path}' with '+', but the tree holds it: drop the '+'`);
        } else if (!held.has(entry.path) && !created.has(entry.path)) {
          say(`Files names '${entry.path}', which the tree does not hold and no earlier task creates: correct the path or mark it '+'`);
        }
      }
    }

    const tests = value("Tests");
    if (task.fields.has("Tests") && tests !== "" && !TESTS.includes(tests)) say(`Tests must be one of: ${TESTS.join(", ")}`);
    if (required && tests === "none") say("TDD required needs a test layer: set Tests");
    const matched = files.entries.find((entry) => INTEGRATION_RE.test(entry.path));
    if (matched && TESTS.includes(tests) && !isIntegration(task)) say(`Files holds the integration test path '${matched.path}': set Tests to integration`);

    const seam = value("Seam");
    if (seam === "none") {
      if (required || reason === "repro") say("Seam is none: name the public entry and the test file as '<entry> | <test file>'");
    } else if (seam !== "") {
      const parts = seam.split("|").map((part) => part.trim());
      // The test side takes several files separated by commas, each with an optional ` (<note>)` behind it: a path holds no blank, so the note is never part of one.
      const testFiles = (parts[1] ?? "").replace(/\s+\([^()]*\)(?=\s*(,|$))/g, "").split(",").map((part) => part.trim().replace(/^\.\//, ""));
      const unlisted = testFiles.filter((file) => !files.entries.some((entry) => entry.kind !== "glob" && entry.path === file));
      if (parts.length !== 2 || parts[0] === "" || testFiles.includes("")) say("Seam must be '<public entry> | <test file>' or 'none'");
      else if (unlisted.length > 0) for (const file of unlisted) say(`Seam names the test file '${file}', which Files does not list`);
      else if (reason === "repro" && !testFiles.some((file) => held.has(file))) say(`TDD none (repro) needs the failing test in the tree, and '${testFiles.join(", ")}' is not there`);
    }

    for (const num of blockers(task)) {
      if (num >= task.num) say(`Blocked-by names T${num}: a task is blocked only by a lower-numbered task, so reorder the tasks`);
    }
    if (task.fields.has("Blocked-by") && !/^(none|T\d+(\s*,\s*T\d+)*)$/.test(value("Blocked-by"))) say("Blocked-by must be 'none' or task ids separated by commas");

    if (task.fields.has("DoD")) {
      if (value("DoD") !== "") say("DoD takes its clauses on the lines below it, each as '- <clause>'");
      if (task.dod.length === 0) say("DoD holds no '- <clause>' line");
      if (task.dod.some((clause) => clause === "")) say("DoD holds an empty clause");
    }
    if (/^`.*`$/.test(value("Verify"))) say("Verify is wrapped in backticks: write the command bare");

    for (const entry of files.entries) if (entry.kind === "create") created.add(entry.path);
  });

  for (const id of [...ids].filter((each) => each.startsWith("R"))) {
    if (!covered.has(id)) fix.push(`FIX: ${id} is covered by no task: add it to the Covers of the task that delivers it, or add that task`);
  }
  return { fix, open };
}

/**
 * One `FIX:` line per code-map entry no task's Files holds: the writer sees no
 * file the map leaves out, so a dropped entry is a file the build never touches.
 * A glob entry counts as the tree files it matches.
 */
export function checkMap(plan: Plan, map: string, tree: string[]): string[] {
  const owned = new Set<string>();
  for (const task of plan.tasks) for (const file of ownedFiles(task, tree)) owned.add(file);
  const fix: string[] = [];
  map.split(/\r?\n/).forEach((line, index) => {
    if (line.trim() === "" || line.trimStart().startsWith("#")) return;
    const path = line.split("|")[0].trim().replace(/^\+/, "").replace(/\s*\(\d+ files?\)$/, "").replace(/^\.\//, "");
    if (path === "none" || path === "conflict" || path === "") return;
    const files = /[*?]/.test(path) ? tree.filter((file) => globRegex(path).test(file)) : [path];
    if (files.some((file) => !owned.has(file))) fix.push(`FIX: map line ${index + 1}: no task's Files holds '${path}': add it to the task whose DoD changes it`);
  });
  return fix;
}

/** The lines of a map file that carry an entry: written, and no `#` comment. */
export function mapEntries(text: string): string[] {
  return text.split(/\r?\n/).filter((line) => line.trim() !== "" && !line.trimStart().startsWith("#"));
}
