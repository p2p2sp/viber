/*
 * plan-hints.critical.test.ts - the critical tier of
 * viber/hooks/scripts/plan-hints.sh: plan mode without a planner injects the
 * review hint as parseable context, and a planner episode keeps the hook
 * silent.
 *
 * A case lives here when its failure means lost user work, an open gate, a
 * break only one platform shows or a script that no longer starts; the rest
 * of the contract is proven by plan-hints.test.ts. This file runs on every
 * operating system, under the full shell matrix in CI.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run
 * directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/plan-hints.critical.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import { withTempDir } from "../harness/tmp.ts";
import { writeTranscript, skillUse, permissionMode, runPayload, assertHint } from "./plan-hints-fixture.ts";

test("plan mode with no planner in the transcript -> additionalContext carries every rule", async () => {
  await withTempDir("p2p2-plan-hints-", async (dir) => {
    const f = writeTranscript(dir, [permissionMode("plan")]);
    assertHint(await runPayload({ permission_mode: "plan", transcript_path: f }));
  });
});

test("a planner Skill tool_use in the current episode -> nothing printed (the viber planner covers these rules)", async () => {
  await withTempDir("p2p2-plan-hints-", async (dir) => {
    const f = writeTranscript(dir, [permissionMode("plan"), skillUse()]);
    assert.equal(await runPayload({ permission_mode: "plan", transcript_path: f }), "");
    const bare = writeTranscript(dir, [skillUse("planner")]);
    assert.equal(await runPayload({ permission_mode: "plan", transcript_path: bare }), "");
  });
});
