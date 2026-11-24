/*
 * forbidden.unit.test.ts - proves the `forbidden` rule type of tools/lint/rules/forbidden.ts and the
 * dash rule of tools/lint/data/dashes.ts: tokens kept out of the tracked files under include globs,
 * minus exclude globs.
 *
 *   node --test tests/tools/lint/forbidden.unit.test.ts
 */

import { test } from "../../harness/test.ts";
import assert from "node:assert/strict";
import forbidden from "../../../tools/lint/rules/forbidden.ts";
import { rules } from "../../../tools/lint/data/dashes.ts";
import { treeOf } from "./tree-fixture.ts";

test("a tracked file under the include globs holding a token is reported with the line", () => {
  const tree = treeOf({ "src/a.md": "fine\nsay bad here\nfine", "other/b.md": "bad" });
  const out = forbidden.check(tree, { tokens: ["bad"], include: ["src/**"], exclude: [] });
  assert.deepEqual(out, [{ path: "src/a.md", line: 2, message: 'forbidden token "bad"' }]);
});

test("a file under the exclude globs is not reported", () => {
  const tree = treeOf({ "src/a.md": "bad", "src/skip/b.md": "bad" });
  const out = forbidden.check(tree, { tokens: ["bad"], include: ["src/**"], exclude: ["src/skip/**"] });
  assert.deepEqual(out, [{ path: "src/a.md", line: 1, message: 'forbidden token "bad"' }]);
});

// Built from code points so this file holds neither dash and the dash rule spares it.
const EM = String.fromCharCode(0x2014);
const EN = String.fromCharCode(0x2013);

test("the dash rule reports a dash outside docs and spares docs and the named files", () => {
  const tree = treeOf({
    "viber/a.md": `x ${EM} y`,
    "docs/b.md": `x ${EN} y`,
    "viber/hooks/content/manifest.md": EM,
    "tests/viber/ui-tells.unit.test.ts": EN,
  });
  const out = forbidden.check(tree, rules[0].params as never);
  assert.deepEqual(out, [{ path: "viber/a.md", line: 1, message: `forbidden token "${EM}"` }]);
});
