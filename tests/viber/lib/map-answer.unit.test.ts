/*
 * map-answer.unit.test.ts - the helpers the two layer maps share: the answer,
 * the refused call, the project root and the file name of a path.
 */

import assert from "node:assert/strict";
import { fakeGit } from "../../harness/fakes.ts";
import { test } from "../../harness/test.ts";
import { answer, baseOf, fail, projectRoot } from "../../../viber/lib/map-answer.ts";

test("an answer ends each line on a line feed and exits 0 unless told otherwise, no line being an empty stdout", () => {
  assert.deepEqual(answer(["a", "b"]), { stdout: "a\nb\n", stderr: "", exit: 0 });
  assert.deepEqual(answer([], 3), { stdout: "", stderr: "", exit: 3 });
});

test("a refused call is one error line on stderr and exit 2", () => {
  assert.deepEqual(fail("no"), { stdout: "", stderr: "error: no\n", exit: 2 });
});

test("the project root is the repository root, outside a repository the cwd in forward slashes, the file system root empty", () => {
  const git = fakeGit({ root: "/r", tracked: [] });
  assert.deepEqual([projectRoot("/r/sub", git), projectRoot("C:\\p\\x", git), projectRoot("/", git)], ["/r", "C:/p/x", ""]);
});

test("the file name of a path is its last segment, a path without a slash being its own", () => {
  assert.deepEqual([baseOf("a/b/c.md"), baseOf("c.md")], ["c.md", "c.md"]);
});
