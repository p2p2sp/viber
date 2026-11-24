/*
 * plugin-root.unit.test.ts - the root cut: the directory a number of levels
 * above the one holding a script entry, as text.
 */

import assert from "node:assert/strict";
import { test } from "../../harness/test.ts";
import { rootAbove } from "../../../viber/lib/plugin-root.ts";

test("one level above an entry of a skill is the skill directory, three the plugin root", () => {
  const script = "/plugin/skills/rules/scripts/rules-map.ts";
  assert.deepEqual([rootAbove(script, 1), rootAbove(script, 3)], ["/plugin/skills/rules", "/plugin"]);
});

test("a backslash path is cut to its forward-slash form, the drive kept", () => {
  assert.equal(rootAbove("C:\\p\\skills\\e2e\\scripts\\qa-ledger.ts", 3), "C:/p");
});
