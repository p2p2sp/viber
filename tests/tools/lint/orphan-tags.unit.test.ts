/*
 * orphan-tags.unit.test.ts - proves the `orphan-tags` rule type of tools/lint/rules/orphan-tags.ts:
 * a line holding only a closing tag with no opener of that name in the same file is reported.
 * Samples are built from escapes so the rule passes over this file too.
 *
 *   node --test tests/tools/lint/orphan-tags.unit.test.ts
 */

import { test } from "../../harness/test.ts";
import assert from "node:assert/strict";
import orphanTags from "../../../tools/lint/rules/orphan-tags.ts";
import { treeOf } from "./tree-fixture.ts";

const PARAMS = { exclude: ["docs/", ".docs/"], binaryExtensions: [".png", ".woff"] };

function run(files: Record<string, string>) {
  return orphanTags.check(treeOf(files), PARAMS);
}

test("a trailing bare closing tag with no opener is reported with its line (the write-call artifact)", () => {
  const out = run({ "a.md": "# Title\n\nsome prose\n</content>\n" });
  assert.equal(out.length, 1);
  assert.equal(out[0].path, "a.md");
  assert.equal(out[0].line, 4);
  assert.match(out[0].message, /orphan closing tag <\/content>/);
});

test("an indented closing tag in the middle of a file is reported", () => {
  const out = run({ "b.md": "line one\n  </parameter>\nline three\n" });
  assert.equal(out.length, 1);
  assert.equal(out[0].line, 2);
});

test("balanced HTML with an attribute-bearing opener is not reported", () => {
  const html = '<html lang="en">\n<head>\n<style>\nbody { margin: 0 }\n</style>\n</head>\n</html>\n';
  assert.deepEqual(run({ "t.html": html }), []);
});

test("a namespaced closing tag whose opener is in the same file is not reported", () => {
  assert.deepEqual(run({ "m.md": "<x:manifest>\n\ntext\n\n</x:manifest>\n" }), []);
});

test("a closing tag named inline in prose is not reported", () => {
  const prose = "- a trailing bare closing tag\n  (`</content>`, `</parameter>`) is an artifact.\n";
  assert.deepEqual(run({ "agent.md": prose }), []);
});

test("a binary file and a file under docs/ are not swept (a closing tag there is kept as recorded)", () => {
  const bad = "x\n</content>\n";
  assert.deepEqual(run({ "img.PNG": bad, "docs/note.md": bad, ".docs/n.md": bad }), []);
});
