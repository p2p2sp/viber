/*
 * plan-build.unit.test.ts - the plan-build core on fake ports:
 * `<command> <plan> ...` prints the dispatch blocks of the planner's writing
 * agents (survey, outline, slices, fix) and moves what they wrote into the plan
 * (skeleton, merge, apply), keeping its work files under
 * `.temp/viber/planner/` of the repository.
 *
 * The cases pin what the planner skill and the agents rely on: the lines of
 * every block and the `add:` fields on its first line, the outline counts and
 * the two thresholds with their split proposal, the reach files, the plan and
 * the decision log cut at the `<!-- DECISIONS -->` line, the content of a slice
 * brief, a merge touching the Verification and DoD lines alone, a fix applied
 * all or none, and the refusals: exit 2 on misuse, 4 with one `FIX:` line per
 * defect and nothing written, 5 when the plan file itself cannot be written.
 *
 * The reach search is held by reach.unit.test.ts, the plan reader by
 * plan-text.unit.test.ts; the wrapper's exec bit by the `invocations` lint rule.
 */

import assert from "node:assert/strict";
import { fakeClock, fakeFs, fakeGit } from "../../harness/fakes.ts";
import { test } from "../../harness/test.ts";
import { runPlanBuild } from "../../../viber/lib/plan-build.ts";

const ROOT = "/r";
const DIR = `${ROOT}/.temp/viber/planner`;
const PLAN = "/plans/plan.md";
const SCRIPT = "/plug/skills/planner/scripts/plan-build.ts";
const HEAD = [`plan: ${PLAN}`, "refs: /plug/references"];
const AT = new Date(2026, 10, 24, 17, 14, 16);

const rows = (...lines: string[]): string => lines.map((line) => `${line}\n`).join("");

/** files: what the file system holds; texts: the text files git searches. */
function build(argv: string[], files: Record<string, string> = {}, texts: Record<string, string> = {}, dirs = [ROOT, "/plans", "/a"]) {
  const fs = fakeFs(files, { dirs });
  const git = fakeGit({ root: ROOT, tracked: [], texts });
  return { ...runPlanBuild(argv, ROOT, SCRIPT, { fs, git, clock: fakeClock(AT) }), fs };
}

const task = (n: number, more: string[] = []): string[] => ["<!-- TASK -->", `### T${n} - Task ${n}`, "- TDD: required", `- Covers: AC${n <= 2 ? n : 1}`, `- Uses: ${n === 1 ? "C1" : "none"}`, "- Depends-on: none", `- Files: src/f${n}.ts`, `- Delivers: thing ${n}`, ...more, "<!-- /TASK -->", ""];
const PENDING = ["- Verification: PENDING", "- DoD: PENDING"];

/** A plan of count tasks, each carrying the lines of more(n). */
function planOf(count: number, more: (n: number) => string[] = () => PENDING): string {
  return rows(
    "---",
    `source: ${PLAN}`,
    "---",
    "",
    "## Current behaviour",
    "",
    "### Must not change",
    "",
    "- the login keeps its route",
    "",
    "## Acceptance criteria",
    "",
    "1. First criterion.",
    "2. Second criterion.",
    "",
    "## Scope",
    "",
    "### File map",
    "",
    "- modify - src/f1.ts - the loop",
    "- add - src/f9.ts - its helper",
    "",
    "## Tasks",
    "",
    ...Array.from({ length: count }, (_, i) => task(i + 1, more(i + 1))).flat(),
    "## Contracts",
    "",
    "### C1 - Retry",
    "",
    "File: src/f1.ts",
  );
}

test("survey of a new plan path removes the work files of the earlier plan, keeps the round state and prints the surveyor block asking for the input text", () => {
  const result = build(["survey", PLAN], {
    [`${DIR}/plan-build`]: rows("plan: /plans/other.md", "input: /s.md", "candidates: /c.md"),
    [`${DIR}/outline.md`]: "TASKS: 3\n",
    [`${DIR}/slice-T1-T5.md`]: "x\n",
    [`${DIR}/findings-2.md`]: "x\n",
    [`${DIR}/review-2.md`]: "x\n",
    [`${DIR}/review-round`]: "plan: /plans/other.md\n",
  });
  assert.deepEqual([result.exit, result.stderr], [0, ""]);
  assert.equal(result.stdout, rows("NEXT: dispatch | agent: viber:plan-surveyor | add: input", ...HEAD, `out: ${DIR}/survey.md`));
  assert.deepEqual(result.fs.listDir(DIR), ["plan-build", "review-round"]);
  assert.equal(result.fs.readText(`${DIR}/plan-build`), rows(`plan: ${PLAN}`, "input: ", "candidates: "));
});

test("survey of the plan path surveyed last keeps its files and names the outline to start from, a summary file going on the input line", () => {
  const result = build(["survey", PLAN, "--input", "/s.md"], { [`${DIR}/plan-build`]: rows(`plan: ${PLAN}`, "input: ", "candidates: /c.md"), [`${DIR}/outline.md`]: "TASKS: 3\n" });
  assert.equal(result.stdout, rows("NEXT: dispatch | agent: viber:plan-surveyor", ...HEAD, `outline: ${DIR}/outline.md`, `out: ${DIR}/survey.md`, "input: /s.md"));
  assert.equal(result.fs.readText(`${DIR}/plan-build`), rows(`plan: ${PLAN}`, "input: /s.md", "candidates: /c.md"));
});

test("outline copies the survey file, writes both reach files for its targets and prints the counts, the decisions and the architect block in skeleton mode", () => {
  const survey = rows("TASKS: 9", "AREA: core - the loop", "FILE: modify | src/auth.ts | core | the loop", "FILE: add | src/b.ts | core | its helper", "TARGET: src/auth.ts", "TARGET: src/auth.ts | login", "DECIDE: Keep the old route? | yes | no | both", "NOTE: the loop retries twice");
  const result = build(["outline", PLAN, "/a/survey.md"], { "/a/survey.md": survey, [`${DIR}/plan-build`]: rows(`plan: ${PLAN}`, "input: /s.md", "candidates: ") }, { "docs/x.md": "See src/auth.ts and login.\n" });
  const candidates = `${DIR}/reach-2026-11-24-17-14-16.md`;
  assert.deepEqual([result.exit, result.stderr], [0, ""]);
  assert.equal(
    result.stdout,
    rows(
      "TASKS: 9",
      "FILES: 2",
      "DECIDE: Keep the old route? | yes | no | both",
      "NEXT: dispatch | agent: viber:plan-architect | add: answered",
      ...HEAD,
      "templates: /plug/skills/planner/templates",
      "memory: false",
      "mode: skeleton",
      `outline: ${DIR}/outline.md`,
      `reach: ${DIR}/reach-paths.md`,
      `candidates: ${candidates}`,
      `out: ${DIR}/architect.md`,
      "input: /s.md",
    ),
  );
  assert.equal(result.fs.readText(`${DIR}/outline.md`), survey);
  assert.equal(result.fs.readText(`${DIR}/reach-paths.md`), rows("## src/auth.ts", "docs/x.md | 1", "## src/auth.ts | login", "docs/x.md | 1"));
  assert.equal(result.fs.readText(candidates), rows("## src/auth.ts", "terms: src/auth.ts, auth.ts, auth", "docs/x.md:1: See src/auth.ts and login.", "## src/auth.ts | login", "terms: login", "docs/x.md:1: See src/auth.ts and login."));
  assert.equal(result.fs.readText(`${DIR}/plan-build`), rows(`plan: ${PLAN}`, "input: /s.md", `candidates: ${candidates}`));
});

test("outline of 8 tasks with no target prints whole mode and no reach line, asks for the input text and drops an earlier reach paths file", () => {
  const result = build(["outline", PLAN, "/a/survey.md"], { "/a/survey.md": "TASKS: 8\nFILE: add | a.ts | x | y\n", [`${DIR}/reach-paths.md`]: "## old\n" });
  assert.equal(result.stdout, rows("TASKS: 8", "FILES: 1", "NEXT: dispatch | agent: viber:plan-architect | add: answered | add: input", ...HEAD, "templates: /plug/skills/planner/templates", "memory: false", "mode: whole", `outline: ${DIR}/outline.md`, `out: ${DIR}/architect.md`));
  assert.equal(result.fs.exists(`${DIR}/reach-paths.md`), false);
});

test("outline past 30 tasks and past 60 files prints both threshold lines and the split proposal with the open decisions", () => {
  const survey = rows("TASKS: 31", ...Array.from({ length: 61 }, (_, i) => `FILE: add | src/f${i}.ts | a | x`), "DECIDE: Keep the route? | yes | no | both", "PHASE: 1. Core - owns: the loop; consumes: nothing; files: src/a.ts; tasks: 16", "PHASE: 2. Screen - owns: the page; consumes: the loop; files: src/b.ts; tasks: 15");
  const result = build(["outline", PLAN, "/a/survey.md"], { "/a/survey.md": survey });
  assert.deepEqual(result.stdout.split("\n").slice(0, 11), [
    "TASKS: 31",
    "FILES: 61",
    "threshold: 31 tasks, past 30",
    "threshold: 61 files, past 60",
    "DECIDE: Keep the route? | yes | no | both",
    "Split proposal:",
    "1. Core - owns: the loop; consumes: nothing; files: src/a.ts; tasks: 16",
    "2. Screen - owns: the page; consumes: the loop; files: src/b.ts; tasks: 15",
    "Open decisions:",
    "- Keep the route?",
    "NEXT: dispatch | agent: viber:plan-architect | add: answered | add: input",
  ]);
});

test("outline of a survey file with no TASKS line exits 4 on one FIX line and writes no outline", () => {
  const result = build(["outline", PLAN, "/a/survey.md"], { "/a/survey.md": "FILE: add | a.ts | x | y\n" });
  assert.deepEqual([result.exit, result.stdout, result.stderr], [4, "", "FIX: the survey file holds no TASKS: line\n"]);
  assert.equal(result.fs.exists(`${DIR}/outline.md`), false);
});

test("skeleton writes the lines above the decisions marker into the plan and the lines below it into the decision log, a leaked closing tag dropped, and tells a skeleton by its PENDING lines", () => {
  const result = build(["skeleton", PLAN, "/a/architect.md"], { "/a/architect.md": `${planOf(2)}\n<!-- DECISIONS -->\n\n- the copy lives in its own table: one writer\n</content>\n` });
  assert.deepEqual([result.exit, result.stderr], [0, ""]);
  assert.equal(result.stdout, rows(`plan: ${PLAN}`, "tasks: 2", "mode: skeleton", `decisions: ${DIR}/decisions.md`));
  assert.equal(result.fs.readText(PLAN), planOf(2));
  assert.equal(result.fs.readText(`${DIR}/decisions.md`), "- the copy lives in its own table: one writer\n");
});

test("skeleton of a plan with every task written and no decisions marker prints whole mode and removes an earlier decision log", () => {
  const whole = planOf(1, () => ["- Verification: node --test a -> pass", "- DoD: it works"]);
  const result = build(["skeleton", PLAN, "/a/architect.md"], { "/a/architect.md": whole, [`${DIR}/decisions.md`]: "old\n" });
  assert.equal(result.stdout, rows(`plan: ${PLAN}`, "tasks: 1", "mode: whole"));
  assert.equal(result.fs.exists(`${DIR}/decisions.md`), false);
});

test("skeleton of a text with no frontmatter and no task exits 4 on both FIX lines and writes no plan", () => {
  const result = build(["skeleton", PLAN, "/a/architect.md"], { "/a/architect.md": "# Title\n" });
  assert.deepEqual([result.exit, result.stdout, result.stderr], [4, "", rows("FIX: the plan text does not open with its frontmatter line ---", "FIX: the plan text holds no task block")]);
  assert.equal(result.fs.exists(PLAN), false);
});

test("skeleton exits 5 when the plan file cannot be written (its directory is absent), so the caller writes it itself", () => {
  const result = build(["skeleton", "/gone/plan.md", "/a/architect.md"], { "/a/architect.md": planOf(1) });
  assert.deepEqual([result.exit, result.stdout, result.stderr], [5, "", "error: cannot write the plan file: /gone/plan.md\n"]);
});

test("slices writes one brief per run of at most 8 tasks, an earlier cut removed, and prints one detailer block per run", () => {
  const result = build(["slices", PLAN], {
    [PLAN]: planOf(9),
    [`${DIR}/plan-build`]: rows(`plan: ${PLAN}`, "input: /s.md", "candidates: /c.md"),
    [`${DIR}/slice-T1-T9.md`]: "old\n",
    [`${DIR}/reach-paths.md`]: rows("## src/f1.ts | retry", "docs/x.md | 2", "## src/f6.ts", "docs/y.md | 1"),
  });
  assert.deepEqual([result.exit, result.stderr], [0, ""]);
  const block = (range: string): string[] => [`NEXT: dispatch | agent: viber:plan-detailer | tasks: ${range}`, ...HEAD, "memory: false", `tasks: ${range}`, `brief: ${DIR}/slice-${range}.md`, "candidates: /c.md", `out: ${DIR}/tasks-${range}.md`];
  assert.equal(result.stdout, rows(...block("T1-T5"), ...block("T6-T9")));
  assert.deepEqual(result.fs.listDir(DIR).filter((name) => name.startsWith("slice-")), ["slice-T1-T5.md", "slice-T6-T9.md"]);
  const brief = (result.fs.readText(`${DIR}/slice-T1-T5.md`) ?? "").split("\n");
  assert.deepEqual(brief.slice(0, 10), ["# Slice T1-T5", "", "## Must not change", "", "- the login keeps its route", "", "## Acceptance criteria", "", "1. First criterion.", "2. Second criterion."]);
  assert.deepEqual(brief.slice(brief.indexOf("## Contracts")), ["## Contracts", "", "### C1 - Retry", "", "File: src/f1.ts", "", "## File map", "", "- modify - src/f1.ts - the loop", "", "## Reach", "", "## src/f1.ts | retry", "docs/x.md | 2", ""]);
  assert.equal(brief.filter((line) => line === "<!-- TASK -->").length, 5);
  const second = result.fs.readText(`${DIR}/slice-T6-T9.md`) ?? "";
  assert.deepEqual([second.includes("### C1 - Retry"), second.includes("2. Second criterion."), second.includes("## src/f6.ts\ndocs/y.md | 1")], [false, false, true]);
});

test("merge puts the Verification and DoD lines of each task file into its tasks alone, writes the briefs again and names the tasks still pending", () => {
  const tasks = rows("### T1", "- Verification: node --test a -> pass", "- DoD: the loop retries; the log holds it", "### T2 - with its title", "- DoD: done two", "- Verification: run two -> ok");
  const result = build(["merge", PLAN, "T1-T2=/a/t.md"], { [PLAN]: planOf(3), "/a/t.md": tasks, [`${DIR}/gaps.md`]: "old\n" });
  assert.deepEqual([result.exit, result.stderr], [0, ""]);
  assert.equal(result.stdout, rows("merged: 2 tasks", "pending: T3"));
  assert.equal(
    result.fs.readText(PLAN),
    planOf(3, (n) => (n === 1 ? ["- Verification: node --test a -> pass", "- DoD: the loop retries; the log holds it"] : n === 2 ? ["- Verification: run two -> ok", "- DoD: done two"] : PENDING)),
  );
  assert.equal((result.fs.readText(`${DIR}/slice-T1-T3.md`) ?? "").includes("- DoD: done two"), true);
  assert.equal(result.fs.exists(`${DIR}/gaps.md`), false);
});

test("merge adds a missing Verification and DoD line before the closing marker, in that order", () => {
  const result = build(["merge", PLAN, "T1-T1=/a/t.md"], { [PLAN]: planOf(1, () => []), "/a/t.md": rows("### T1", "- Verification: run -> ok", "- DoD: done") });
  assert.equal(result.fs.readText(PLAN), planOf(1, () => ["- Verification: run -> ok", "- DoD: done"]));
});

test("merge writes the GAP lines of the task files to the gaps file and ends on the fixer block naming it", () => {
  const result = build(["merge", PLAN, "T1-T1=/a/t.md"], { [PLAN]: planOf(1), "/a/t.md": rows("### T1", "- Verification: run -> ok", "- DoD: done", "GAP: T1 | src/x.test.ts asserts the old route and is in no Files"), [`${DIR}/decisions.md`]: "d\n" });
  assert.equal(result.stdout, rows("merged: 1 tasks", "gaps: 1", "NEXT: dispatch | agent: viber:plan-fixer | add: answered | add: input", ...HEAD, "templates: /plug/skills/planner/templates", "memory: false", `decisions: ${DIR}/decisions.md`, `gaps: ${DIR}/gaps.md`, `out: ${DIR}/fix.md`));
  assert.equal(result.fs.readText(`${DIR}/gaps.md`), "GAP: T1 | src/x.test.ts asserts the old route and is in no Files\n");
});

test("merge exits 4 with one FIX line per defect and leaves the plan as it was: a task with no line, one left PENDING, a task outside the slice, a file that cannot be read", () => {
  const result = build(["merge", PLAN, "T1-T2=/a/t.md", "T3-T3=/a/gone.md"], { [PLAN]: planOf(3), "/a/t.md": rows("### T1", "- Verification: run -> ok", "### T3", "- DoD: x", "### T2", "- Verification: PENDING", "- DoD: done") });
  assert.deepEqual([result.exit, result.stdout], [4, ""]);
  assert.equal(result.stderr, rows("FIX: T1-T2: T3 is not a task of this slice", "FIX: T1-T2: T1 has no DoD line", "FIX: T1-T2: T2 has no Verification line", "FIX: T3-T3: cannot read /a/gone.md"));
  assert.equal(result.fs.readText(PLAN), planOf(3));
});

test("apply replaces the text of each edit block in order, saves the fix lines and writes the briefs again when the plan has some", () => {
  const fix = rows("@@ EDIT", "- the login keeps its route", "@@ WITH", "- the login keeps its route and its name", "- the audit stays", "@@ END", "fix: Must not change - the audit added", "@@ EDIT", "2. Second criterion.   ", "@@ WITH", "@@ END", "fix: AC2 - dropped");
  const result = build(["apply", PLAN, "/a/fix.md"], { [PLAN]: planOf(1), "/a/fix.md": fix, [`${DIR}/slice-T1-T1.md`]: "old\n" });
  assert.deepEqual([result.exit, result.stderr], [0, ""]);
  assert.equal(result.stdout, rows("applied: 2 edits", `fixes: ${DIR}/fixes.md`));
  assert.equal(result.fs.readText(PLAN), planOf(1).replace("- the login keeps its route\n", "- the login keeps its route and its name\n- the audit stays\n").replace("2. Second criterion.\n", ""));
  assert.equal(result.fs.readText(`${DIR}/fixes.md`), rows("fix: Must not change - the audit added", "fix: AC2 - dropped"));
  assert.equal((result.fs.readText(`${DIR}/slice-T1-T1.md`) ?? "").includes("- the audit stays"), true);
});

test("apply exits 4 and writes nothing when one edit matches no text or more than one place, naming each on a FIX line", () => {
  const fix = rows("@@ EDIT", "1. First criterion.", "@@ WITH", "1. First.", "@@ END", "@@ EDIT", "", "@@ WITH", "x", "@@ END", "@@ EDIT", "no such line", "@@ WITH", "y", "@@ END");
  const result = build(["apply", PLAN, "/a/fix.md"], { [PLAN]: planOf(1), "/a/fix.md": fix });
  assert.deepEqual([result.exit, result.stdout], [4, ""]);
  assert.match(result.stderr, /^FIX: edit 2: its text occurs \d+ times in the plan, it must occur once: \nFIX: edit 3: its text occurs 0 times in the plan, it must occur once: no such line\n$/);
  assert.equal(result.fs.readText(PLAN), planOf(1));
  assert.equal(result.fs.exists(`${DIR}/fixes.md`), false);
});

// [case, the fix file, the FIX line]
for (const [name, fix, line] of [
  ["no edit block", "fix: nothing\n", "FIX: the fix file holds no @@ EDIT block"],
  ["an edit block never closed", "@@ EDIT\nx\n@@ WITH\ny\n", "FIX: the last @@ EDIT block of the fix file has no @@ END line"],
] as [string, string, string][]) {
  test(`apply of a fix file with ${name} exits 4 on its FIX line`, () => {
    const result = build(["apply", PLAN, "/a/fix.md"], { [PLAN]: planOf(1), "/a/fix.md": fix });
    assert.deepEqual([result.exit, result.stdout, result.stderr], [4, "", `${line}\n`]);
  });
}

test("fix with findings and briefs prints the fixer block naming them, the summary file of the survey and the candidates file", () => {
  const result = build(["fix", PLAN, "--findings", "/f/1.md", "--brief", "/b/1.md", "--findings", "/f/2.md"], { [`${DIR}/plan-build`]: rows(`plan: ${PLAN}`, "input: /s.md", "candidates: /c.md") });
  assert.equal(result.stdout, rows("NEXT: dispatch | agent: viber:plan-fixer | add: answered", ...HEAD, "templates: /plug/skills/planner/templates", "memory: false", "findings: /f/1.md", "findings: /f/2.md", "brief: /b/1.md", "candidates: /c.md", `out: ${DIR}/fix.md`, "input: /s.md"));
});

test("fix with neither findings nor gaps asks for the lines to fix", () => {
  const result = build(["fix", PLAN]);
  assert.equal(result.stdout.split("\n")[0], "NEXT: dispatch | agent: viber:plan-fixer | add: lines | add: answered | add: input");
});

// [case, argv, the error line]: a refusal prints one error line on stderr and nothing on stdout.
for (const [name, argv, reason] of [
  ["an unknown command", ["constructor", PLAN], "usage: plan-build.sh <survey|outline|skeleton|slices|merge|apply|fix> <plan> [arguments]"],
  ["no plan", ["survey"], "usage: plan-build.sh <survey|outline|skeleton|slices|merge|apply|fix> <plan> [arguments]"],
  ["an unknown flag", ["fix", PLAN, "--nope"], "fix: unknown argument: --nope"],
  ["a flag with no value", ["survey", PLAN, "--input"], "survey: --input needs a value"],
  ["a merge pair with no file", ["merge", PLAN, "T1-T1="], "merge: expected <first id>-<last id>=<file>, got: T1-T1="],
  ["a survey file that is absent", ["outline", PLAN, "/a/none.md"], "cannot read /a/none.md"],
] as [string, string[], string][]) {
  test(`${name} exits 2 on one error line`, () => {
    const result = build(argv, { [PLAN]: planOf(1) });
    assert.deepEqual([result.exit, result.stdout, result.stderr], [2, "", `error: ${reason}\n`]);
  });
}

test("a merge range naming a task the plan lacks, and a call outside a repository, exit 2", () => {
  const range = build(["merge", PLAN, "T1-T9=/a/t.md"], { [PLAN]: planOf(2) });
  assert.deepEqual([range.exit, range.stderr], [2, "error: merge: T1-T9 names no run of tasks of the plan\n"]);
  const outside = runPlanBuild(["survey", PLAN], "/x", SCRIPT, { fs: fakeFs({}), git: fakeGit(null), clock: fakeClock(AT) });
  assert.deepEqual([outside.exit, outside.stderr], [2, "error: not inside a git repository\n"]);
});
