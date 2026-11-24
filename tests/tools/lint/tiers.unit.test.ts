/*
 * tiers.unit.test.ts - proves the `tiers` rule type of tools/lint/rules/tiers.ts: the legacy
 * critical-sibling pairing, its stale exemptions, empty critical files and the critical budget.
 *
 *   node --test tests/tools/lint/tiers.unit.test.ts
 */

import { test } from "../../harness/test.ts";
import assert from "node:assert/strict";
import tiers from "../../../tools/lint/rules/tiers.ts";
import { treeOf } from "./tree-fixture.ts";

const CASE = 'test("x", () => {});\n';

test("a legacy logic file with no critical sibling is reported, one with a sibling or an exemption is not", () => {
  const tree = treeOf({
    "tests/viber/a.test.ts": "",
    "tests/viber/a.critical.test.ts": CASE,
    "tests/viber/b.test.ts": "",
    "tests/github/r.test.ts": "",
  });
  const out = tiers.check(tree, { root: "tests", exempt: ["tests/github/r.test.ts"], budget: 10 });
  assert.deepEqual(out, [{ path: "tests/viber/b.test.ts", line: 0, message: "logic file has no critical sibling" }]);
});

test("an exemption naming a missing file, a non-logic file or a file with a sibling is reported stale", () => {
  const tree = treeOf({
    "tests/a.test.ts": "",
    "tests/a.critical.test.ts": CASE,
    "tests/c.unit.test.ts": "",
  });
  const out = tiers.check(tree, {
    root: "tests",
    exempt: ["tests/gone.test.ts", "tests/c.unit.test.ts", "tests/a.test.ts"],
    budget: 10,
  });
  assert.deepEqual(
    out.map((f) => f.path),
    ["tests/gone.test.ts", "tests/c.unit.test.ts", "tests/a.test.ts"],
  );
});

test("a critical file registering no case is reported", () => {
  const out = tiers.check(treeOf({ "tests/a.critical.test.ts": "// nothing" }), { root: "tests", exempt: [], budget: 10 });
  assert.deepEqual(out, [{ path: "tests/a.critical.test.ts", line: 0, message: "critical file registers no case" }]);
});

test("a critical tier over its budget is reported with both numbers, counting a loop once and a mention in a line never", () => {
  const source = ['test("one", () => {});', "for (const x of xs) {", "  test(`two ${x}`, () => {});", "}", '// see test("three")'].join("\n");
  const out = tiers.check(treeOf({ "tests/a.critical.test.ts": source }), { root: "tests", exempt: [], budget: 1 });
  assert.deepEqual(out, [{ path: "tests", line: 0, message: "2 case sites in the critical tier, budget 1" }]);
});

test("a unit file and an integration file need no sibling and count toward no budget", () => {
  const tree = treeOf({ "tests/a.unit.test.ts": CASE, "tests/b.integration.test.ts": CASE });
  assert.deepEqual(tiers.check(tree, { root: "tests", exempt: [], budget: 0 }), []);
});
