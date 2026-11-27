/*
 * The memory-file predicate the memory skill and the build share: a node or
 * section on a repo-relative path, below the root only.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isMemoryFile } from "../../../../../viber/skills/memory/scripts/lib/memory-file.ts";

// [path, a memory file]
const TABLE: Array<[string, boolean]> = [
  ["CLAUDE.md", false],
  ["CLAUDE.api.md", false],
  ["CLAUDE.local.md", false],
  ["src/CLAUDE.md", true],
  ["src/CLAUDE.api.md", true],
  ["a/b/CLAUDE.x.y.md", true],
  ["src/CLAUDE.local.x.md", true],
  ["src/CLAUDE.local.md", false],
  ["a/b/CLAUDE.local.md", false],
  ["src/CLAUDE.md.bak", false],
  ["src/CLAUDE..md", false],
  ["src/MYCLAUDE.md", false],
  ["src/README.md", false],
  ["CLAUDE.md/README.md", false],
];

describe("isMemoryFile", () => {
  for (const [path, expected] of TABLE) {
    it(`${path}: ${expected ? "a memory file" : "not a memory file"}`, () => {
      assert.equal(isMemoryFile(path), expected);
    });
  }
});
