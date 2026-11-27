/*
 * parseStages: the `## <n>. <goal>` headings in order, each with the paths of
 * the `Files:` line under it; the free lines above them are no stage.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseStages } from "../../../../../viber/skills/simple-implementor/scripts/lib/simple-stages.ts";

describe("parseStages", () => {
  it("reads each heading and its Files line, in plan order", () => {
    const plan = "Plan: /p/plan.md\nThe facts.\nFiles: not/a/stage.ts\n\n## 1. Add the parser\nFiles: a.ts, `b\\c.ts`\n\n## 2. Wire it in\n";
    assert.deepEqual(parseStages(plan), [
      { num: 1, goal: "Add the parser", files: ["a.ts", "b/c.ts"] },
      { num: 2, goal: "Wire it in", files: [] },
    ]);
  });

  it("no stage heading: none", () => {
    assert.deepEqual(parseStages("# Plan\n\n## Notes\nFiles: a.ts\n"), []);
  });
});
