/*
 * token-contract.unit.test.ts - proves the `token-contract` rule type of tools/lint/rules/token-contract.ts:
 * every listed file must exist in the tree and hold the token.
 *
 *   node --test tests/tools/lint/token-contract.unit.test.ts
 */

import { test } from "../../harness/test.ts";
import assert from "node:assert/strict";
import tokenContract from "../../../tools/lint/rules/token-contract.ts";
import { treeOf } from "./tree-fixture.ts";

test("a listed file lacking the token is reported with the file and the token", () => {
  const tree = treeOf({ "a.md": "has <ok/>", "b.md": "nothing" });
  const out = tokenContract.check(tree, { token: "<ok/>", files: ["a.md", "b.md"] });
  assert.deepEqual(out, [{ path: "b.md", line: 0, message: "missing token <ok/>" }]);
});

test("a listed file the tree does not hold is reported", () => {
  const tree = treeOf({ "a.md": "<ok/>" });
  const out = tokenContract.check(tree, { token: "<ok/>", files: ["a.md", "gone.md"] });
  assert.deepEqual(out, [{ path: "gone.md", line: 0, message: "file not found" }]);
});
