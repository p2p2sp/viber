/*
 * repo-prefix.unit.test.ts - repoPrefix of viber/lib/repo-prefix.ts: where a
 * directory lies below the repository root, as the text git puts before a path
 * of that directory. tree-record reads a relative path against it and
 * diff-files prints its paths relative to it.
 *
 * The directory is compared with its links resolved first, because git names
 * the root by its real path; the drive-letter spellings run here on every
 * system, the fake file system holding a `C:/...` path as the text it is.
 */

import assert from "node:assert/strict";
import { fakeFs } from "../../harness/fakes.ts";
import { test } from "../../harness/test.ts";
import { repoPrefix } from "../../../viber/lib/repo-prefix.ts";

const fs = fakeFs({ "/r/src/deep/a.txt": "a\n", "/elsewhere/b.txt": "b\n", "C:/r/src/a.txt": "a\n" }, { links: { "/alias": "/r/src", "/r/link": "/r/src/deep" } });

for (const [label, dir, root, want] of [
  ["the root itself", "/r", "/r", ""],
  ["the root given with a trailing slash", "/r/", "/r", ""],
  ["a directory below the root", "/r/src", "/r", "src/"],
  ["a directory two levels below the root", "/r/src/deep", "/r", "src/deep/"],
  ["a directory given with a trailing slash", "/r/src/", "/r", "src/"],
  ["a directory outside the root", "/elsewhere", "/r", ""],
  ["a sibling sharing the start of the root's name", "/rx", "/r", ""],
  ["a directory reached through a link from outside the root (git names the real path)", "/alias", "/r", "src/"],
  ["a directory below such a link", "/alias/deep", "/r", "src/deep/"],
  ["a link inside the root to another directory of it", "/r/link", "/r", "src/deep/"],
  ["a directory that does not exist, read as the text it is", "/r/gone/sub", "/r", "gone/sub/"],
  ["a root that is the file system root", "/r/src", "/", "r/src/"],
  ["a drive root", "C:/r", "C:/r", ""],
  ["a directory below a drive root", "C:/r/src", "C:/r", "src/"],
  ["a drive letter in the other case than the root's", "c:/r/src", "C:/r", "src/"],
  ["a root with a lower-case drive letter", "C:/r/src", "c:/r", "src/"],
  ["a directory on another drive", "D:/r/src", "C:/r", ""],
] as const) {
  test(`${label}: ${dir} under ${root} gives ${JSON.stringify(want)}`, () => {
    assert.equal(repoPrefix(dir, root, fs), want);
  });
}

test("the prefix keeps the case of every segment, only the drive letter is folded", () => {
  assert.equal(repoPrefix("c:/r/Src/Deep", "C:/r", fakeFs({})), "Src/Deep/");
});
