/*
 * planner-blocks.unit.test.ts - holds the `## Input` of each planning agent (`plan-surveyor`,
 * `plan-architect`, `plan-author`) and of the plan judge (`plan-judge`) to the dispatch blocks
 * the plan-build core prints for it: every line of a block is a line the agent's Input names,
 * every line the Input names is one some block of the agent carries, and every `add:` field of
 * a block is a text the Input describes.
 *
 * It reads the four agents from the tree as text and calls the core in process on fake ports, each
 * agent in the scenes that print each kind of block it gets (a writing block, a fix block): no
 * script is spawned. The lines of each block are proven case by case in
 * tests/viber/lib/plan-build.unit.test.ts.
 *
 * Run directly by Node's type stripping:
 *   node --test tests/viber/planner-blocks.unit.test.ts
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fakeClock, fakeFs, fakeGit } from "../harness/fakes.ts";
import { section } from "../harness/markdown.ts";
import { test } from "../harness/test.ts";
import { runPlanBuild } from "../../viber/lib/plan-build.ts";

const AGENTS_DIR = path.resolve(import.meta.dirname, "../../viber/agents");

const ROOT = "/r";
const DIR = `${ROOT}/.temp/viber/planner`;
const PLAN = "/plans/plan.md";
const SCRIPT = "/plug/skills/planner/scripts/plan-build.ts";
const AT = new Date(2026, 10, 24, 17, 14, 16);

const rows = (...all: string[]): string => all.map((line) => `${line}\n`).join("");

/** The stdout of one plan-build call over the files a scene plants. */
function printed(argv: string[], files: Record<string, string>, texts: Record<string, string> = {}): string[] {
  const ports = { fs: fakeFs(files, { dirs: [ROOT, "/plans", "/a"] }), git: fakeGit({ root: ROOT, tracked: [], texts }), clock: fakeClock(AT) };
  const result = runPlanBuild(argv, ROOT, SCRIPT, ports);
  assert.deepEqual([result.exit, result.stderr], [0, ""]);
  return result.stdout.split("\n").filter((line) => line !== "");
}

/** The block of an agent in a stdout: its `NEXT:` line and the lines below it up to the next one. */
function blockOf(stdout: string[], agent: string): string[] {
  const start = stdout.findIndex((line) => line.startsWith(`NEXT: dispatch | agent: viber:${agent}`));
  assert.notEqual(start, -1);
  const next = stdout.findIndex((line, index) => index > start && line.startsWith("NEXT: "));
  return stdout.slice(start, next === -1 ? undefined : next);
}

function lineLabels(block: string[]): string[] {
  return [...new Set(block.slice(1).map((line) => line.slice(0, line.indexOf(":"))))].sort();
}

function addFields(block: string[]): string[] {
  return block[0].split(" | ").filter((field) => field.startsWith("add: ")).map((field) => field.slice(5));
}

/** The labels of the lines a `## Input` names in its bullets: `label:` alone in backticks, or `tasks: T<a>-T<b>`. */
function inputLabels(text: string): string[] {
  const bullets = section(text, "Input").split(/\r?\n/).filter((line) => line.startsWith("- "));
  const labels = bullets.flatMap((line) => [...line.matchAll(/`([a-z]+):(?:`| T<)/g)].map((match) => match[1]));
  return [...new Set(labels)].sort();
}

const state = (input: string, slices: number, more: string[] = []): string => rows(`plan: ${PLAN}`, `input: ${input}`, "candidates: /c.md", "split: no", ...more, `slices: ${slices}`);
const task = (id: string, title: string, uses: string, covers: string, file: string): string[] => ["<!-- TASK -->", `### ${id} - ${title}`, "- TDD: required", `- Covers: ${covers}`, `- Uses: ${uses}`, "- Depends-on: none", `- Files: ${file}`, "- Delivers: a thing", "- Verification: npm test -> green", "- DoD: it works", "<!-- /TASK -->", ""];
const SPEC = ["---", `source: ${PLAN}`, "---", "", "## Acceptance criteria", "", "1. First criterion.", "2. Second criterion.", "", "## Scope", "", "### File map", "", "- add - src/f1.ts - the loop", ""];
const C1 = ["### C1 - Retry", "", "File: src/f1.ts", "", "retry(n)"];
/** A sound plan of two tasks, and the same plan as its frame left it. */
const WHOLE = rows(...SPEC, "## Tasks", "", ...task("T1", "Task 1", "C1", "AC1", "src/f1.ts"), ...task("T2", "Task 2", "none", "AC2", "src/f2.ts"), "## Contracts", "", ...C1);
const FRAMED = rows(...SPEC, "## Tasks", "", "## Contracts", "", ...C1);

const SURVEY_ONE = rows("AREA: core | 3 | the loop", "FILE: modify | src/auth.ts | core | the loop", "TARGET: src/auth.ts");
const SURVEY_TWO = rows("AREA: core | 6 | the loop", "AREA: page | 5 | the screen", "FILE: modify | src/auth.ts | core | the loop", "FILE: add | src/page.ts | page | the screen", "TARGET: src/auth.ts");
const TEXTS = { "docs/x.md": "See src/auth.ts.\n" };
/** The work files of a framed plan of two slices, before its authors wrote. */
const cut = (input: string): Record<string, string> => ({
  [`${DIR}/plan-build`]: state(input, 2),
  [`${DIR}/slices.md`]: rows("SLICE: 1 | core | 10 | src/f1.ts", "SLICE: 2 | page | 0 | src/f2.ts"),
  [`${DIR}/frame-slices.md`]: rows("SLICE: 1 | covers: AC1 | uses: C1 | the loop", "SLICE: 2 | covers: AC2 | uses: none | the screen"),
  [`${DIR}/outline.md`]: SURVEY_TWO,
  [`${DIR}/decisions.md`]: "a decision\n",
  [`${DIR}/owners.md`]: rows("C1 | frame", "T1 | 1", "T2 | 2"),
  [`${DIR}/notes-1.md`]: "FACT: src/f1.ts:1 | x | y\n",
  [PLAN]: FRAMED,
});
const FRAME_FILE = `${FRAMED}<!-- SLICES -->\nSLICE: 1 | covers: AC1 | uses: C1 | the loop\nSLICE: 2 | covers: AC2 | uses: none | the screen\n`;
const JUDGE = "VERDICT: FAIL\nCRITICAL: T1 | wrong | fix it\nCRITICAL: spec | wrong | fix it\n";
/** The stdout of judged FAIL over the assembled framed plan: one fix block per owner of a critical line. */
const reviewed = (input: string): string[] => printed(["judged", PLAN, "FAIL", "--out", "/a/judge.md"], { ...cut(input), [`${DIR}/plan-build`]: state(input, 2, ["round: 1", "await: judge"]), [PLAN]: WHOLE, "/a/judge.md": JUDGE });
const gaps = (): string[] => printed(["assemble", PLAN, "1=/a/1.md", "2=/a/2.md"], { ...cut("/s.md"), "/a/1.md": rows(...task("T1", "Task 1", "C1", "AC1", "src/f1.ts"), "<!-- NOTES -->", "GAP: C1 names no error"), "/a/2.md": rows(...task("T1", "Task 2", "none", "AC2", "src/f2.ts")) });

/**
 * [agent, the scenes printing each kind of block it gets with a summary file, the scenes of its
 * blocks with no summary file and the add: fields of each, the labels its Input names that no
 * block line carries].
 */
const SCENES: [string, (() => string[])[], [() => string[], string[]][], string[]][] = [
  [
    "plan-surveyor",
    [() => printed(["survey", PLAN, "--phase", "--input", "/s.md"], { [`${DIR}/plan-build`]: rows(`plan: ${PLAN}`, "input: ", "candidates: ", "split: yes"), [`${DIR}/outline.md`]: SURVEY_ONE })],
    [[() => printed(["survey", PLAN], {}), ["input"]]],
    [],
  ],
  [
    "plan-architect",
    [() => printed(["outline", PLAN, "/a/survey.md"], { [`${DIR}/plan-build`]: state("/s.md", 0), "/a/survey.md": SURVEY_TWO }, TEXTS), () => reviewed("/s.md"), gaps],
    [
      [() => printed(["outline", PLAN, "/a/survey.md"], { [`${DIR}/plan-build`]: state("", 0), "/a/survey.md": SURVEY_TWO }), ["answered", "input"]],
      [() => reviewed(""), ["answered", "input"]],
      [() => printed(["fix", PLAN], cut("")), ["lines", "answered", "input"]],
    ],
    // `source:` is the frontmatter key the architect fills from its `plan:` line; the three blocks are what the planner appends below a fix block.
    ["change", "records", "rejected", "source"],
  ],
  [
    "plan-author",
    [() => printed(["outline", PLAN, "/a/survey.md"], { [`${DIR}/plan-build`]: state("/s.md", 0), "/a/survey.md": SURVEY_ONE }, TEXTS), () => printed(["frame", PLAN, "/a/frame.md"], { ...cut("/s.md"), "/a/frame.md": FRAME_FILE }), () => reviewed("/s.md")],
    [
      [() => printed(["outline", PLAN, "/a/survey.md"], { [`${DIR}/plan-build`]: state("", 0), "/a/survey.md": SURVEY_ONE }), ["answered", "input"]],
      [() => printed(["frame", PLAN, "/a/frame.md"], { ...cut(""), "/a/frame.md": FRAME_FILE }), ["answered"]],
      [() => reviewed(""), ["answered"]],
      [() => printed(["fix", PLAN], { [`${DIR}/plan-build`]: state("", 1) }), ["lines", "answered", "input"]],
    ],
    // The blocks the planner appends below a fix block.
    ["change", "records", "rejected"],
  ],
];

/** [add: field, a phrase of the Input bullet describing the text the planner appends for it]. */
const ADD_TEXTS: Record<string, string> = {
  input: "is the confirmed `viber:intent` summary or `viber:fixer` diagnosis, verbatim.",
  answered: "An `Answered: <decision> -> <option>` line",
  lines: "a `records:` block, a `change:` block and a `rejected:` block (each optional) are more to fix",
};

test("the labels of an Input are the backticked `label:` words of its bullets, a `tasks: T<a>-T<b>` included and a value line such as `fix: <where>` left out", () => {
  const sample = "## Input\n\nThe prompt carries `skipped:` lines:\n\n- `plan:` is the path, `refs:` the directory.\n- `tasks: T<a>-T<b>` is the range.\n- `FIX:` lines and one `fix: <where> - <change>` line.\n\n## Read\n\n- `late:`\n";
  assert.deepEqual(inputLabels(sample), ["plan", "refs", "tasks"]);
});

test("a block is cut from its NEXT: line to the next one, its labels and add: fields read from its lines", () => {
  const stdout = ["TASKS: 9", "NEXT: dispatch | agent: viber:plan-author | owner: 2 | add: lines | add: answered", "plan: /p.md", "findings: /f/1.md", "findings: /f/2.md", "NEXT: dispatch | agent: viber:plan-architect | owner: frame", "plan: /p.md"];
  const block = blockOf(stdout, "plan-author");
  assert.deepEqual([block.length, lineLabels(block), addFields(block)], [4, ["findings", "plan"], ["lines", "answered"]]);
});

for (const [agent, fullest, asking, outside] of SCENES) {
  const text = fs.readFileSync(path.join(AGENTS_DIR, `${agent}.md`), "utf8");

  test(`the Input of ${agent} names exactly the lines of the blocks plan-build prints for it, a writing block and a fix block together`, () => {
    const named = inputLabels(text).filter((label) => !outside.includes(label));
    assert.deepEqual(named, [...new Set(fullest.flatMap((scene) => lineLabels(blockOf(scene(), agent))))].sort());
  });

  test(`the Input of ${agent} still names each label set apart here as carried by no block line (a stale exemption would hide a dropped line)`, () => {
    assert.deepEqual(outside.filter((label) => !inputLabels(text).includes(label)), []);
  });

  test(`each block of ${agent} carries its add: fields when no summary file was given, and the Input describes the text of every one`, () => {
    for (const [scene, fields] of asking) {
      assert.deepEqual(addFields(blockOf(scene(), agent)), fields);
      assert.deepEqual(fields.filter((field) => !section(text, "Input").includes(ADD_TEXTS[field])), []);
    }
  });

  test(`every block of ${agent} opens on plan: and refs:, the two lines its Input names first`, () => {
    for (const scene of fullest) {
      const block = blockOf(scene(), agent);
      assert.deepEqual([block[1].startsWith("plan: "), block[2].startsWith("refs: ")], [true, true]);
    }
    const bullets = section(text, "Input").split(/\r?\n/).filter((line) => line.startsWith("- "));
    assert.deepEqual([bullets[0].startsWith("- `plan:`"), bullets[1].startsWith("- `refs:`")], [true, true]);
  });
}

// The judge block: it opens on plan: alone, since the judge reads no reference file.
const JUDGE_AGENT = fs.readFileSync(path.join(AGENTS_DIR, "plan-judge.md"), "utf8");
const roundState = (input: string, ...round: string[]) => ({ [PLAN]: WHOLE, [`${DIR}/plan-build`]: rows(`plan: ${PLAN}`, `input: ${input}`, "candidates: ", "split: no", ...round) });

test("the Input of plan-judge names exactly the lines of the fullest block plan-build prints for it: round 2, a summary file and a changed file", () => {
  const block = blockOf(printed(["judge", PLAN], { ...roundState("/s.md", "round: 2", "await: judge", "retry: 0"), [`${DIR}/changed.md`]: "fix: T1 - x\n" }), "plan-judge");
  assert.deepEqual(inputLabels(JUDGE_AGENT), lineLabels(block));
  assert.deepEqual(lineLabels(block), ["changed", "input", "out", "plan", "round"]);
});

test("the block of plan-judge opens on plan:, the line its Input names first, and carries no refs: line", () => {
  const block = blockOf(printed(["judge", PLAN], roundState("/s.md", "round: 0", "await: none", "retry: 0")), "plan-judge");
  assert.ok(block[1].startsWith("plan: "));
  assert.ok(!block.some((line) => line.startsWith("refs: ")));
  assert.ok((section(JUDGE_AGENT, "Input").split(/\r?\n/).find((line) => line.startsWith("- ")) ?? "").startsWith("- `plan:`"));
});

test("the block of plan-judge asks the planner for add: input, add: answered when no summary file was given, both texts its Input describes", () => {
  const block = blockOf(printed(["judge", PLAN], roundState("", "round: 0", "await: none", "retry: 0")), "plan-judge");
  assert.deepEqual(addFields(block), ["input", "answered"]);
  const input = section(JUDGE_AGENT, "Input");
  assert.ok(input.includes("`input:` is the confirmed `viber:intent` summary or `viber:fixer` diagnosis the plan answers, verbatim."));
  assert.ok(input.includes(ADD_TEXTS.answered));
});
