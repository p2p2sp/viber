/*
 * lint_skill.critical.test.ts - the critical tier of
 * viber/skills/skill-designer/scripts/lint_skill.sh: a valid SKILL.md prints
 * FAIL=0 WARN=0 and exits 0.
 *
 * A case lives here when its failure means lost user work, an open gate, a
 * break only one platform shows or a script that no longer starts; the rest
 * of the contract is proven by lint_skill.test.ts. This file runs on every
 * operating system, under the full shell matrix in CI.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run
 * directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/lint_skill.critical.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import { VALID_LINES, lint } from "./lint_skill-fixture.ts";

test("a valid SKILL.md with LF endings prints FAIL=0 WARN=0 and exits 0", async () => {
  const res = await lint(VALID_LINES.join("\n"));
  assert.equal(res.stdout.trim(), "FAIL=0 WARN=0");
  assert.equal(res.status, 0);
});
