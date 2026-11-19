/*
 * strip-tag.critical.test.ts - the critical tier of
 * viber/skills/code-auditor/scripts/strip-tag.sh: a trailing closing tag is
 * stripped from the listed files and a missing path is skipped without
 * stopping the others.
 *
 * A case lives here when its failure means lost user work, an open gate, a
 * break only one platform shows or a script that no longer starts; the rest
 * of the contract is proven by strip-tag.test.ts. This file runs on every
 * operating system, under the full shell matrix in CI.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run
 * directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/strip-tag.critical.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { runScript } from "../harness/run.ts";
import { withTempDir } from "../harness/tmp.ts";
import { SUT, CONTENT, PARAMETER, assertPosix, assertQuietSuccess } from "./strip-tag-fixture.ts";

test("a missing path is skipped and the other files are still handled (exit 0, nothing on stdout)", async () => {
  await assertPosix(async (shell) => {
    await withTempDir("strip-tag-", async (dir) => {
      const first = path.join(dir, "first.md");
      const second = path.join(dir, "second.md");
      fs.writeFileSync(first, `one\n${CONTENT}\n`);
      fs.writeFileSync(second, `two\n${PARAMETER}\n`);
      const result = await runScript(SUT, [first, path.join(dir, "absent.md"), second], { shell, cwd: dir });
      assertQuietSuccess(result);
      assert.equal(fs.readFileSync(first, "latin1"), "one\n");
      assert.equal(fs.readFileSync(second, "latin1"), "two\n");
    });
  });
});
