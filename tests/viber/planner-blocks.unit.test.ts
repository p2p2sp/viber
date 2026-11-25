/*
 * planner-blocks.unit.test.ts - holds the `## Input` of each planning agent (`plan-surveyor`,
 * `plan-architect`, `plan-detailer`, `plan-fixer`) to the dispatch block the plan-build core prints
 * for it: every line of the block is a line the agent's Input names, every line the Input names is
 * one the block can carry, and every `add:` field of the block is a text the Input describes.
 *
 * It reads the four agents from the tree as text and calls the core in process on fake ports, each
 * time in the scene that prints the fullest block of that agent: no script is spawned. The lines of
 * each block are proven case by case in tests/viber/lib/plan-build.unit.test.ts; the blocks of the
 * plan reviewers, which a shell script prints, are held to its header by
 * planner-agents-prose.unit.test.ts.
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

const STATE = { [`${DIR}/plan-build`]: rows(`plan: ${PLAN}`, "input: /s.md", "candidates: /c.md") };
const BARE = { [`${DIR}/plan-build`]: rows(`plan: ${PLAN}`, "input: ", "candidates: ") };

const ONE_TASK_PLAN = rows(
  "---",
  `source: ${PLAN}`,
  "---",
  "",
  "## Acceptance criteria",
  "",
  "1. First criterion.",
  "",
  "## Scope",
  "",
  "### File map",
  "",
  "- modify - src/f1.ts - the loop",
  "",
  "## Tasks",
  "",
  "<!-- TASK -->",
  "### T1 - Task 1",
  "- TDD: required",
  "- Covers: AC1",
  "- Uses: none",
  "- Depends-on: none",
  "- Files: src/f1.ts",
  "- Delivers: thing 1",
  "- Verification: PENDING",
  "- DoD: PENDING",
  "<!-- /TASK -->",
);

const SURVEY = rows("TASKS: 9", "FILE: modify | src/auth.ts | core | the loop", "TARGET: src/auth.ts");

/**
 * [agent, its fullest block, its block with every add: field, the labels its Input names that no
 * block line carries]: the second scene has no summary file, so the block asks for the input text.
 */
const SCENES: [string, () => string[], () => string[], string[]][] = [
  [
    "plan-surveyor",
    () => printed(["survey", PLAN, "--phase", "--input", "/s.md"], { ...BARE, [`${DIR}/outline.md`]: "TASKS: 3\n" }),
    () => printed(["survey", PLAN], {}),
    [],
  ],
  [
    "plan-architect",
    () => printed(["outline", PLAN, "/a/survey.md"], { ...STATE, "/a/survey.md": SURVEY }, { "docs/x.md": "See src/auth.ts.\n" }),
    () => printed(["outline", PLAN, "/a/survey.md"], { ...BARE, "/a/survey.md": SURVEY }),
    // `source:` is the frontmatter key the architect fills from its `plan:` line.
    ["source"],
  ],
  [
    "plan-detailer",
    () => printed(["slices", PLAN], { ...STATE, [PLAN]: ONE_TASK_PLAN }),
    () => printed(["slices", PLAN], { ...BARE, [PLAN]: ONE_TASK_PLAN }),
    [],
  ],
  [
    "plan-fixer",
    () => printed(["fix", PLAN, "--findings", "/f/1.md", "--brief", "/b/1.md", "--gaps"], { ...STATE, [`${DIR}/decisions.md`]: "a decision\n" }),
    () => printed(["fix", PLAN], BARE),
    // The blocks of `add: lines` and the lines a refused apply appends, below the block.
    ["change", "records", "rejected"],
  ],
];

/** [add: field, a phrase of the Input bullet describing the text the planner appends for it]. */
const ADD_TEXTS: Record<string, string> = {
  input: "`input:` is the confirmed `viber:intent` summary or `viber:fixer` diagnosis, verbatim.",
  answered: "An `Answered: <decision> -> <option>` line",
  lines: "`FIX:` and `SPLIT:` lines, a `records:` block, a `change:` block and a `rejected:` block (each optional) are what to fix",
};

test("the labels of an Input are the backticked `label:` words of its bullets, a `tasks: T<a>-T<b>` included and a value line such as `fix: <where>` left out", () => {
  const sample = "## Input\n\nThe prompt carries `skipped:` lines:\n\n- `plan:` is the path, `refs:` the directory.\n- `tasks: T<a>-T<b>` is the range.\n- `FIX:` lines and one `fix: <where> - <change>` line.\n\n## Read\n\n- `late:`\n";
  assert.deepEqual(inputLabels(sample), ["plan", "refs", "tasks"]);
});

test("a block is cut from its NEXT: line to the next one, its labels and add: fields read from its lines", () => {
  const stdout = ["TASKS: 9", "NEXT: dispatch | agent: viber:plan-fixer | add: lines | add: answered", "plan: /p.md", "findings: /f/1.md", "findings: /f/2.md", "NEXT: dispatch | agent: viber:plan-detailer | tasks: T1-T2", "plan: /p.md"];
  const block = blockOf(stdout, "plan-fixer");
  assert.deepEqual([block.length, lineLabels(block), addFields(block)], [4, ["findings", "plan"], ["lines", "answered"]]);
});

for (const [agent, fullest, asking, outside] of SCENES) {
  const text = fs.readFileSync(path.join(AGENTS_DIR, `${agent}.md`), "utf8");

  test(`the Input of ${agent} names exactly the lines of the fullest block plan-build prints for it`, () => {
    const named = inputLabels(text).filter((label) => !outside.includes(label));
    assert.deepEqual(named, lineLabels(blockOf(fullest(), agent)));
  });

  test(`the Input of ${agent} still names each label set apart here as carried by no block line (a stale exemption would hide a dropped line)`, () => {
    assert.deepEqual(outside.filter((label) => !inputLabels(text).includes(label)), []);
  });

  test(`the Input of ${agent} describes the text of every add: field its block carries`, () => {
    const fields = addFields(blockOf(asking(), agent));
    assert.deepEqual(fields.filter((field) => !section(text, "Input").includes(ADD_TEXTS[field])), []);
  });

  test(`the block of ${agent} opens on plan: and refs:, the two lines its Input names first`, () => {
    const block = blockOf(fullest(), agent);
    assert.deepEqual([block[1].startsWith("plan: "), block[2].startsWith("refs: ")], [true, true]);
    const bullets = section(text, "Input").split(/\r?\n/).filter((line) => line.startsWith("- "));
    assert.deepEqual([bullets[0].startsWith("- `plan:`"), bullets[1].startsWith("- `refs:`")], [true, true]);
  });
}

// [agent, the add: fields of its block when no summary file was given]
const ADD_FIELDS: [string, string[]][] = [
  ["plan-surveyor", ["input"]],
  ["plan-architect", ["answered", "input"]],
  ["plan-detailer", []],
  ["plan-fixer", ["lines", "answered", "input"]],
];

for (const [agent, fields] of ADD_FIELDS) {
  test(`the block of ${agent} asks the planner for ${fields.length === 0 ? "no text" : fields.map((field) => `add: ${field}`).join(", ")} when no summary file was given`, () => {
    const scene = SCENES.find(([name]) => name === agent);
    assert.ok(scene !== undefined);
    assert.deepEqual(addFields(blockOf(scene[2](), agent)), fields);
  });
}
