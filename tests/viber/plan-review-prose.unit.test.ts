/*
 * plan-review-prose.unit.test.ts - pins where the scripted plan rules live: every rule `plan-index.sh`
 * rejects, tagged `(script)`, sits in `references/plan-rules-script.md`, which `planner` reads
 * beside `plan-rules.md` and no planner reviewer reads. `plan-rules.md` keeps the `(review)` rules in
 * its four sections and says where the scripted ones went. The files read here are shipped prompts,
 * whose text is the behaviour. Nothing is spawned. Each check is a pure function proven on a
 * synthetic bad sample before it is held to the tree.
 *
 * Run directly by Node's type stripping:
 *   node --test tests/viber/plan-review-prose.unit.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { section } from "../harness/markdown.ts";

const VIBER = path.resolve(import.meta.dirname, "../../viber");

function read(relative: string): string {
  return fs.readFileSync(path.join(VIBER, relative), "utf8");
}

const PLAN_RULES = read("references/plan-rules.md");
const SCRIPT_RULES = read("references/plan-rules-script.md");
const PLANNER = read("skills/planner/SKILL.md");
const REVIEWERS = ["planner-review", "planner-spec-review", "planner-graph-review", "planner-task-review"];

function lines(text: string): string[] {
  return text.split(/\r?\n/);
}

function scriptLines(text: string): string[] {
  return lines(text).filter((line) => line.trimEnd().endsWith("(script)"));
}

function namesScriptRules(text: string): boolean {
  return text.includes("plan-rules-script.md") || text.includes("(script)");
}

function plannerReadsBoth(text: string): boolean {
  const step = section(text, "1. Map the files first");
  return step.includes("references/plan-rules.md") && step.includes("references/plan-rules-script.md");
}

function ruleName(line: string): string {
  return line.slice(2, line.indexOf(":"));
}

const SAMPLE_PLANNER = "## 1. Map the files first\n\nRead `${CLAUDE_PLUGIN_ROOT}/references/plan-rules.md` and `${CLAUDE_PLUGIN_ROOT}/references/plan-rules-script.md` first.\n";

test("a line ending in (script) is found and a (review) line is not", () => {
  assert.deepEqual(scriptLines("- A: x. (script)\n- B: y. (review)\n"), ["- A: x. (script)"]);
});

const REVIEWER_SAMPLES: [string, string, boolean][] = [
  ["names the script rule file", "Read plan-rules-script.md too.", true],
  ["names a (script) rule", "The `(script)` rules are validated.", true],
  ["names only (review) rules", "Gate every `(review)` rule.", false],
];

for (const [label, sample, caught] of REVIEWER_SAMPLES) {
  test(`a reviewer text that ${label} is ${caught ? "caught" : "passed"}`, () => {
    assert.equal(namesScriptRules(sample), caught);
  });
}

const PLANNER_SAMPLES: [string, string, boolean][] = [
  ["reads both rule files", SAMPLE_PLANNER, true],
  ["stops reading the script rule file", SAMPLE_PLANNER.replace("plan-rules-script.md", "other.md"), false],
];

for (const [label, sample, passes] of PLANNER_SAMPLES) {
  test(`a planner step that ${label} is ${passes ? "passed" : "caught"}`, () => {
    assert.equal(plannerReadsBoth(sample), passes);
  });
}

test("plan-rules.md holds no line ending in (script)", () => {
  assert.deepEqual(scriptLines(PLAN_RULES), []);
});

test("plan-rules.md keeps exactly its four sections", () => {
  assert.deepEqual(lines(PLAN_RULES).filter((line) => line.startsWith("## ")), ["## Spec", "## Graph", "## Task", "## Contracts"]);
});

for (const heading of ["Spec", "Graph", "Task", "Contracts"]) {
  test(`the ${heading} section of plan-rules.md holds review rules only, at least one`, () => {
    const rules = lines(section(PLAN_RULES, heading)).filter((line) => line.startsWith("- "));
    assert.ok(rules.length > 0 && rules.every((line) => line.endsWith("(review)")));
  });
}

test("plan-rules.md opens by saying the scripted rules live in plan-rules-script.md", () => {
  const opening = lines(PLAN_RULES).find((line) => line.startsWith("Every rule a plan must hold.")) ?? "";
  assert.ok(opening.includes("`plan-rules-script.md`"));
});

test("plan-rules-script.md keeps the sections of plan-rules.md its scripted rules came from", () => {
  assert.deepEqual(lines(SCRIPT_RULES).filter((line) => line.startsWith("## ")), ["## Graph", "## Task", "## Contracts"]);
});

const SCRIPT_SECTIONS: [string, string[]][] = [
  ["Graph", ["Depends", "Minimal", "Read after", "Disjoint", "Leaf", "Covers"]],
  ["Task", ["Paths", "Exclusive", "Hard", "Uses", "Supplied", "Provable", "Reproduced", "Self-proven", "Layered"]],
  ["Contracts", ["Block body", "Named", "Homed", "Seen", "Consumed after"]],
];

for (const [heading, names] of SCRIPT_SECTIONS) {
  test(`the ${heading} section of plan-rules-script.md holds the scripted ${heading} rules by name`, () => {
    assert.deepEqual(lines(section(SCRIPT_RULES, heading)).filter((line) => line.startsWith("- ")).map(ruleName), names);
  });

  test(`every rule of the ${heading} section of plan-rules-script.md ends in (script)`, () => {
    assert.ok(lines(section(SCRIPT_RULES, heading)).filter((line) => line.startsWith("- ")).every((line) => line.endsWith("(script)")));
  });
}

const ERROR_MESSAGES: [string, string][] = [
  ["Uses", "with `error: task <id>: <DoD|Delivers> names <block id>, missing from its Uses - add it to Uses`. (script)"],
  ["Provable", "with `error: task <id>: Verification runs git grep without --untracked over <path>, which this task creates and git grep never reads - add --untracked or use grep (Provable)`. (script)"],
  ["Layered", "with `error: task <id>: Files writes <path> under an integration test directory, which no Verification command names - list or type-check that file or its test project there (Layered)`. (script)"],
];

for (const [rule, text] of ERROR_MESSAGES) {
  test(`the ${rule} rule keeps its error message word for word in plan-rules-script.md`, () => {
    assert.ok(SCRIPT_RULES.includes(text));
  });
}

test("planner step 1 reads plan-rules.md together with plan-rules-script.md", () => {
  assert.ok(plannerReadsBoth(PLANNER));
});

test("planner step 1 holds the plan to every rule in both rule files", () => {
  assert.ok(section(PLANNER, "1. Map the files first").includes("hold the plan to every rule in both"));
});

for (const name of REVIEWERS) {
  test(`${name} names neither plan-rules-script.md nor a (script) rule`, () => {
    assert.ok(!namesScriptRules(read(`agents/${name}.md`)));
  });
}
