/*
 * root-relative.unit.test.ts - an absolute path as its form below a root: a file,
 * one standing in the root itself, a directory, a path not there yet and one
 * through a link, and what is left as it is.
 */

import assert from "node:assert/strict";
import { fakeFs } from "../../harness/fakes.ts";
import { test } from "../../harness/test.ts";
import { rootRelative } from "../../../viber/lib/root-relative.ts";

const fs = fakeFs({ "/r/src/a.ts": "a\n", "/r/README.md": "r\n", "/other/b.ts": "b\n" }, { links: { "/alias": "/r", "/r/out": "/other", "/r/l.ts": "/other/b.ts" } });

// [path, its form below /r]
const ROWS: Array<[string, string]> = [
  ["/r/src/a.ts", "src/a.ts"],
  ["/r/README.md", "README.md"],
  ["/r/src", "src"],
  ["/r/new/x.ts", "new/x.ts"],
  ["/alias/src/a.ts", "src/a.ts"],
  ["/r/l.ts", "l.ts"],
  ["/r/out/b.ts", "/r/out/b.ts"],
  ["/other/b.ts", "/other/b.ts"],
  ["/r", "/r"],
  ["src/a.ts", "src/a.ts"],
];
for (const [path, below] of ROWS) {
  test(`${path} is ${below}`, () => {
    assert.equal(rootRelative(path, "/r", fs), below);
  });
}
