/*
 * The Seam rule of plan-check.ts: the test side takes one test file or several,
 * each of them a Files entry.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { checkPlan } from "../../../../../viber/skills/planner/scripts/lib/plan-check.ts";
import { parsePlan } from "../../../../../viber/skills/planner/scripts/lib/plan-parse.ts";

const TREE = ["src/a.ts", "tests/a.test.ts", "tests/b.test.ts", "app/(shop)/cart.test.ts"];

function fixes(seam: string, files = "src/a.ts, tests/a.test.ts, tests/b.test.ts", tdd = "required"): string[] {
  const draft = `# T\n\n## Tasks\n\n### T1 - a\nDelivers: x\nCovers: R1\nFiles: ${files}\nBlocked-by: none\nTDD: ${tdd}\nTests: unit\nSeam: ${seam}\nDoD:\n- done\nVerify: true\n`;
  return checkPlan(parsePlan(draft), new Set(["R1"]), TREE).fix;
}

describe("checkPlan Seam", () => {
  it("takes one test file of Files", () => {
    assert.deepEqual(fixes("run() | tests/a.test.ts"), []);
    assert.deepEqual(fixes("run() | ./tests/a.test.ts"), []);
  });

  it("takes several test files separated by commas", () => {
    assert.deepEqual(fixes("run() | tests/a.test.ts, tests/b.test.ts"), []);
  });

  it("takes a note in parentheses behind a test file", () => {
    assert.deepEqual(fixes("run() | tests/a.test.ts (fake side), tests/b.test.ts (real side)"), []);
    assert.deepEqual(fixes("run() | tests/a.test.ts (fake, shared)"), []);
  });

  it("keeps the parentheses of a path", () => {
    assert.deepEqual(fixes("run() | app/(shop)/cart.test.ts (real side)", "src/a.ts, app/(shop)/cart.test.ts"), []);
  });

  it("names each test file Files does not list", () => {
    assert.deepEqual(fixes("run() | tests/a.test.ts (fake side), tests/c.test.ts, tests/d.test.ts"), [
      "FIX: T1: Seam names the test file 'tests/c.test.ts', which Files does not list",
      "FIX: T1: Seam names the test file 'tests/d.test.ts', which Files does not list",
    ]);
  });

  it("refuses a missing side or an empty test file", () => {
    const shape = ["FIX: T1: Seam must be '<public entry> | <test file>' or 'none'"];
    assert.deepEqual(fixes("tests/a.test.ts"), shape);
    assert.deepEqual(fixes("| tests/a.test.ts"), shape);
    assert.deepEqual(fixes("run() | tests/a.test.ts,"), shape);
    assert.deepEqual(fixes("run() | a | tests/a.test.ts"), shape);
  });

  it("on repro wants one of the test files in the tree", () => {
    assert.deepEqual(fixes("run() | tests/a.test.ts, tests/new.test.ts", "src/a.ts, tests/a.test.ts, +tests/new.test.ts", "none (repro)"), []);
    assert.deepEqual(fixes("run() | tests/new.test.ts", "src/a.ts, +tests/new.test.ts", "none (repro)"), [
      "FIX: T1: TDD none (repro) needs the failing test in the tree, and 'tests/new.test.ts' is not there",
    ]);
  });
});
