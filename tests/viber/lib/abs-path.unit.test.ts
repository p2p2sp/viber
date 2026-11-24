/*
 * abs-path.unit.test.ts - absolutePath of viber/lib/abs-path.ts: a
 * forward-slash path made absolute against the cwd and spelled one way, so a
 * core asks a port (and a fake, which matches a path as text) for one spelling
 * of every path. It touches no port: every case is text in, text out.
 */

import assert from "node:assert/strict";
import { test } from "../../harness/test.ts";
import { absolutePath } from "../../../viber/lib/abs-path.ts";

for (const [label, path, cwd, want] of [
  ["a relative path", "a/b.md", "/r", "/r/a/b.md"],
  ["an absolute path, whatever the cwd", "/x/y.md", "/r", "/x/y.md"],
  ["a leading ./", "./a.md", "/r", "/r/a.md"],
  ["a . segment inside the path", "a/./b.md", "/r", "/r/a/b.md"],
  ["a doubled slash", "a//b.md", "/r", "/r/a/b.md"],
  ["a trailing slash", "a/b/", "/r", "/r/a/b"],
  ["several trailing slashes", "a/b///", "/r", "/r/a/b"],
  ["a .. segment", "a/../b.md", "/r", "/r/b.md"],
  ["a .. segment climbing out of the cwd", "../b.md", "/r/src", "/r/b.md"],
  ["an empty path", "", "/r/src", "/r/src"],
  ["a cwd ending on a slash", "a.md", "/r/", "/r/a.md"],
  ["the file system root as the cwd", "a.md", "/", "/a.md"],
  ["the file system root itself", "/", "/r", "/"],
] as const) {
  test(`${label} is spelled one way (${JSON.stringify(path)} from ${cwd} is ${want})`, () => {
    assert.equal(absolutePath(path, cwd), want);
  });
}

test("a .. segment past the root stops at the root (nothing lies above it)", () => {
  assert.deepEqual([absolutePath("../../../a.md", "/r"), absolutePath("/../a.md", "/r"), absolutePath("C:/../../a.md", "/r")], ["/a.md", "/a.md", "C:/a.md"]);
});

for (const [label, path, cwd, want] of [
  ["a drive-letter path", "C:/Users/me/a.md", "/r", "C:/Users/me/a.md"],
  ["a relative path from a drive-letter cwd", "src/../a.md", "C:/Users/me", "C:/Users/me/a.md"],
  ["a drive root", "C:/", "/r", "C:/"],
  ["a relative path from a drive root", "a.md", "C:/", "C:/a.md"],
  ["a lower-case drive letter, kept as written", "c:/x//y/", "/r", "c:/x/y"],
] as const) {
  test(`on a Windows drive ${label} keeps its drive and one slash after it (${path} from ${cwd} is ${want})`, () => {
    assert.equal(absolutePath(path, cwd), want);
  });
}

test("a network path keeps its two leading slashes, and three slashes are the plain root", () => {
  assert.deepEqual([absolutePath("//host/share/a/../b.md", "/r"), absolutePath("///a.md", "/r")], ["//host/share/b.md", "/a.md"]);
});

test("a drive-relative path (C:a.md) is no absolute path: it resolves below the cwd as a segment (the caller hands in forward slashes, never a bare drive)", () => {
  assert.equal(absolutePath("C:a.md", "/r"), "/r/C:a.md");
});
