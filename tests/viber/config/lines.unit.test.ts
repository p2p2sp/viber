/*
 * lines.unit.test.ts - the group and child reading of viber.yml text: which
 * indented key line belongs to which column-0 group, and which value it keeps.
 */

import assert from "node:assert/strict";
import { test } from "../../harness/test.ts";
import { readChildren } from "../../../viber/lib/config/lines.ts";

test("a blank line and a column-0 comment leave the group open", () => {
  const got = readChildren("build:\n  memory: true\n\n# note\n  qa: yes\n");
  assert.deepEqual([got.get("build.memory"), got.get("build.qa")], ["true", "yes"]);
});

test("the next column-0 key closes the group, so a later child belongs to the new group", () => {
  const got = readChildren("planning:\n  adr: true\nbuild:\n  rules: true\n");
  assert.deepEqual([got.get("planning.adr"), got.get("build.rules"), got.get("planning.rules")], ["true", "true", undefined]);
});

test("a column-0 key is no child of any group", () => {
  const got = readChildren("memory: true\nbuild:\n  qa: true\n");
  assert.deepEqual([...got.keys()], ["build.qa"]);
});

test("a CR never reaches a value", () => {
  const got = readChildren("build:\r\n  memory: true\r\n");
  assert.equal(got.get("build.memory"), "true");
});

test("blanks before the colon of a group and after the colon of a child are not part of the name or the value", () => {
  const got = readChildren("build :\n  memory :   true # on\n");
  assert.equal(got.get("build.memory"), "true # on");
});
