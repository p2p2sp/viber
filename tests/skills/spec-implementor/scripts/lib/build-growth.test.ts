/*
 * Characterization of which paths the build measures: the memory-file pattern
 * of memoryPaths (on a repo-relative path) and the `before` filter of
 * memoryPaths and rulesPaths.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { memoryPaths, rulesPaths } from "../../../../../viber/skills/spec-implementor/scripts/lib/build-growth.ts";
import { fakeCtx, fakeGit } from "../../../../fake-ports.ts";

// [path, a memory file of the build]
const TABLE: Array<[string, boolean]> = [
  ["CLAUDE.md", false],
  ["CLAUDE.api.md", false],
  ["CLAUDE.local.md", false],
  ["src/CLAUDE.md", true],
  ["src/CLAUDE.api.md", true],
  ["a/b/CLAUDE.x.y.md", true],
  ["src/CLAUDE.local.x.md", true],
  // Changed on purpose: <dir>/CLAUDE.local.md is the user's, not a memory file.
  ["src/CLAUDE.local.md", false],
  ["src/CLAUDE.md.bak", false],
  ["src/MYCLAUDE.md", false],
  ["src/README.md", false],
];

describe("memoryPaths: the memory file pattern", () => {
  for (const [path, expected] of TABLE) {
    it(`${path}: ${expected ? "a memory file" : "not a memory file"}`, () => {
      const ctx = fakeCtx({ git: fakeGit([path]) });
      assert.deepEqual(memoryPaths(ctx), expected ? [path] : []);
    });
  }
});

describe("the before filter", () => {
  it("memoryPaths leaves out a path of before", () => {
    const ctx = fakeCtx({ git: fakeGit(["src/CLAUDE.md", "lib/CLAUDE.md"]), before: ["src/CLAUDE.md"] });
    assert.deepEqual(memoryPaths(ctx), ["lib/CLAUDE.md"]);
  });

  it("rulesPaths leaves out a path of before and every path outside .claude/rules/viber/", () => {
    const ctx = fakeCtx({ git: fakeGit([".claude/rules/viber/a.md", ".claude/rules/viber/b.md", ".claude/rules/other.md"]), before: [".claude/rules/viber/b.md"] });
    assert.deepEqual(rulesPaths(ctx), [".claude/rules/viber/a.md"]);
  });

  it("a state without before has no user files", () => {
    const ctx = fakeCtx({ git: fakeGit(["src/CLAUDE.md", ".claude/rules/viber/a.md"]) });
    assert.equal(ctx.state.before, undefined);
    assert.deepEqual(memoryPaths(ctx), ["src/CLAUDE.md"]);
    assert.deepEqual(rulesPaths(ctx), [".claude/rules/viber/a.md"]);
  });
});
