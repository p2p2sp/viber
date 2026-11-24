/*
 * engine.unit.test.ts - proves `runLint` of tools/lint/engine.ts: the finding, summary, self-check and
 * unknown type lines, the status codes and the selection of rules by argument. Rule types here are
 * small fakes built in the test; the tree is the in-memory one of tree-fixture.ts.
 *
 *   node --test tests/tools/lint/engine.unit.test.ts
 */

import { test } from "../../harness/test.ts";
import assert from "node:assert/strict";
import { runLint, type RuleInstance, type RuleType } from "../../../tools/lint/engine.ts";
import { treeOf } from "./tree-fixture.ts";

const tree = treeOf({ "a.md": "text" });

function typeReporting(name: string, reports: boolean): RuleType<null> {
  const check = () => (reports ? [{ path: "a.md", line: 3, message: "bad" }] : []);
  return { name, check, selfCheck: { tree, params: null } };
}

// A type whose check reports only on its self-check sample, as a broken rule would not.
function typeBlindOnRealTree(name: string): RuleType<null> {
  const sample = treeOf({ "sample.md": "x" });
  return {
    name,
    check: (t) => (t === sample ? [{ path: "sample.md", line: 0, message: "bad" }] : []),
    selfCheck: { tree: sample, params: null },
  };
}

// A type whose check reports on the real tree but not on its own bad sample: a broken self-check.
function typeBlindOnSample(name: string): RuleType<null> {
  const sample = treeOf({ "sample.md": "x" });
  return {
    name,
    check: (t) => (t === sample ? [] : [{ path: "a.md", line: 3, message: "bad" }]),
    selfCheck: { tree: sample, params: null },
  };
}

function rule(id: string): RuleInstance {
  return { id, type: id.split("/")[0], params: null, why: "test" };
}

test("a rule whose check reports gives one finding line in the C6 form and status 1", () => {
  const out = runLint(tree, [typeReporting("t", true)], [rule("t/one")], []);
  assert.deepEqual(out, { lines: ["a.md:3: [t/one] bad", "lint: 1 findings, 1 rules"], status: 1 });
});

test("a run with no finding gives status 0 and only the summary line", () => {
  const out = runLint(tree, [typeBlindOnRealTree("t")], [rule("t/one"), rule("t/two")], []);
  assert.deepEqual(out, { lines: ["lint: 0 findings, 2 rules"], status: 0 });
});

test("a selected type whose bad sample yields no finding prints the self-check line, fails the run and runs none of its rules", () => {
  const out = runLint(tree, [typeBlindOnSample("t")], [rule("t/one")], []);
  assert.deepEqual(out, {
    lines: ["self-check: t reported nothing on its bad sample", "lint: 0 findings, 1 rules"],
    status: 1,
  });
});

test("a selected rule naming a missing type prints the unknown type line with status 1", () => {
  const out = runLint(tree, [], [rule("ghost/one")], []);
  assert.deepEqual(out, { lines: ["ghost/one: unknown rule type ghost", "lint: 0 findings, 1 rules"], status: 1 });
});

test("an argument selecting no rule gives status 2", () => {
  const out = runLint(tree, [typeBlindOnRealTree("t")], [rule("t/one")], ["nothing"]);
  assert.equal(out.status, 2);
});

test("a type argument selects only the rules of that type, and the self-check of an unselected type is skipped", () => {
  const types = [typeReporting("a", true), typeReporting("b", false)];
  const out = runLint(tree, types, [rule("a/one"), rule("b/one")], ["a"]);
  assert.deepEqual(out, { lines: ["a.md:3: [a/one] bad", "lint: 1 findings, 1 rules"], status: 1 });
});

test("a rule id argument selects that rule alone, not a rule whose id merely starts with it", () => {
  const types = [typeReporting("a", true)];
  const out = runLint(tree, types, [rule("a/one"), rule("a/one-more")], ["a/one"]);
  assert.deepEqual(out.lines, ["a.md:3: [a/one] bad", "lint: 1 findings, 1 rules"]);
});
