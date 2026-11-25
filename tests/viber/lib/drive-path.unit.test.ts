/*
 * drive-path.unit.test.ts - the MSYS spelling of a drive path, read under a drive
 * root alone.
 */

import assert from "node:assert/strict";
import { test } from "../../harness/test.ts";
import { drivePath } from "../../../viber/lib/drive-path.ts";

const ROWS: Array<[string, string, string]> = [
  ["/c/r/a.ts", "C:/r", "C:/r/a.ts"],
  ["/c/r/a.ts", "/r", "/c/r/a.ts"],
  ["/cc/r/a.ts", "C:/r", "/cc/r/a.ts"],
];
for (const [path, root, read] of ROWS) {
  test(`${path} under ${root} is ${read}`, () => {
    assert.equal(drivePath(path, root), read);
  });
}
