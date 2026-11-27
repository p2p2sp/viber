/*
 * Characterization of the config read of e2e-run.ts: `find` with no argument
 * looks for the newest qa.e2e.md under the `directories` of
 * <root>/.claude/viber.yml.
 */

import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { removeDir, runEntry, tempDir, writeFiles } from "../../../../temp-repo.ts";

const ENTRY = "viber/skills/e2e/scripts/e2e.ts";
let dir = "";
afterEach(() => removeDir(dir));

describe("e2e find", () => {
  it("reads directories from <root>/.claude/viber.yml", () => {
    dir = tempDir(true);
    writeFiles(dir, {
      ".claude/viber.yml": "directories:\n  runs: open-runs\n  specifications: done\n",
      "docs/open-runs/20260101-a/qa.e2e.md": "# QA\n",
      "docs/_specs/20260202-b/qa.e2e.md": "# QA\n",
    });
    assert.equal(runEntry(ENTRY, ["find"], dir)[0], `HANDOFF=${dir}/docs/open-runs/20260101-a/qa.e2e.md`);
  });

  it("no config: the default directories", () => {
    dir = tempDir(true);
    writeFiles(dir, { "docs/open-runs/20260101-a/qa.e2e.md": "# QA\n", "docs/_specs/20260202-b/qa.e2e.md": "# QA\n" });
    assert.equal(runEntry(ENTRY, ["find"], dir)[0], `HANDOFF=${dir}/docs/_specs/20260202-b/qa.e2e.md`);
  });
});
