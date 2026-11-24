/*
 * run-header.unit.test.ts - the header of run.md: the first `<key>: <value>`
 * line before the first `## ` line.
 */

import assert from "node:assert/strict";
import { test } from "../../harness/test.ts";
import { headerValue } from "../../../viber/lib/run-header.ts";

test("a key answers its first line, a trailing carriage return removed, and never a longer key sharing its start", () => {
  const text = "Lens file: /l.md\r\nLens: bugs\nLens: tests\n";
  assert.deepEqual([headerValue(text, "Lens"), headerValue(text, "Lens file")], ["bugs", "/l.md"]);
});

test("a key below the first ## line, and one that is absent, are empty", () => {
  assert.deepEqual([headerValue("Lens: a\n## Map\nScope: diff\n", "Scope"), headerValue("", "Scope")], ["", ""]);
});
