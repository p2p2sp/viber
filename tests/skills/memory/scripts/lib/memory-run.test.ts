/*
 * Characterization of the node-or-section pattern of memory-run.ts (on a file
 * name, the root directory excluded), driven through `memory.sh prepare
 * <id> rewrite .`: it refuses every untracked node or section below the root.
 */

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { removeDir, runEntry, tempDir, writeFiles } from "../../../../temp-repo.ts";

// [path, a node or section of the memory skill today]
const TABLE: Array<[string, boolean]> = [
  ["CLAUDE.md", false],
  ["CLAUDE.api.md", false],
  ["CLAUDE.local.md", false],
  ["sub/CLAUDE.md", true],
  ["sub/CLAUDE.api.md", true],
  ["sub/deep/CLAUDE.x.y.md", true],
  ["sub/CLAUDE.local.x.md", true],
  ["sub/CLAUDE.local.md", false],
  ["sub/CLAUDE.md.bak", false],
  ["sub/MYCLAUDE.md", false],
  ["sub/README.md", false],
];

describe("memory-run: the node or section pattern", () => {
  let dir = "";
  let refused: string[] = [];

  before(() => {
    dir = tempDir(true);
    writeFiles(dir, Object.fromEntries(TABLE.map(([path]) => [path, "x\n"])));
    refused = runEntry("viber/skills/memory/scripts/memory.ts", ["prepare", "t1", "rewrite", "."], dir);
  });
  after(() => removeDir(dir));

  it("prints only REFUSED lines, in path order", () => {
    assert.deepEqual(refused, TABLE.filter(([, node]) => node).map(([path]) => `REFUSED: ${path}`).sort());
  });

  for (const [path, expected] of TABLE) {
    it(`${path}: ${expected ? "a node or section" : "not a node or section"}`, () => {
      assert.equal(refused.includes(`REFUSED: ${path}`), expected);
    });
  }
});
