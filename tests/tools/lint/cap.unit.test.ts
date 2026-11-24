/*
 * cap.unit.test.ts - proves the `cap` rule type of tools/lint/rules/cap.ts: a read set of whole files
 * and named "## " sections counted in words or UTF-8 bytes against its cap.
 *
 *   node --test tests/tools/lint/cap.unit.test.ts
 */

import { test } from "../../harness/test.ts";
import assert from "node:assert/strict";
import cap from "../../../tools/lint/rules/cap.ts";
import { treeOf } from "./tree-fixture.ts";

test("a file over its word cap is reported with its count and its cap", () => {
  const tree = treeOf({ "a.md": "one  two\nthree" });
  const out = cap.check(tree, { files: [{ path: "a.md" }], unit: "words", max: 2 });
  assert.deepEqual(out, [{ path: "a.md", line: 0, message: "3 words, cap 2" }]);
});

test("a file exactly at its word cap passes", () => {
  const tree = treeOf({ "a.md": "one two three" });
  assert.deepEqual(cap.check(tree, { files: [{ path: "a.md" }], unit: "words", max: 3 }), []);
});

test("a read set over its byte cap is reported with its bytes and its cap, counting UTF-8 bytes of every file", () => {
  const tree = treeOf({ "a.md": "ééé", "b.md": "abcd" });
  const out = cap.check(tree, { files: [{ path: "a.md" }, { path: "b.md" }], unit: "bytes", max: 9 });
  assert.deepEqual(out, [{ path: "a.md, b.md", line: 0, message: "10 bytes, cap 9" }]);
});

test("a named section counts from its heading to the next heading and nothing else of the file", () => {
  const tree = treeOf({ "a.md": "intro words here\n## Keep\none two\n## Other\nlots of other words" });
  const out = cap.check(tree, { files: [{ path: "a.md", sections: ["Keep"] }], unit: "words", max: 3 });
  assert.deepEqual(out, [{ path: "a.md", line: 0, message: "4 words, cap 3" }]);
});

test("a section running to the end of the file is counted whole", () => {
  const tree = treeOf({ "a.md": "## Last\none two three" });
  const out = cap.check(tree, { files: [{ path: "a.md", sections: ["Last"] }], unit: "words", max: 4 });
  assert.deepEqual(out, [{ path: "a.md", line: 0, message: "5 words, cap 4" }]);
});
