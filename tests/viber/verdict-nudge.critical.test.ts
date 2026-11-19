/*
 * verdict-nudge.critical.test.ts - the critical tier of
 * viber/hooks/scripts/verdict-nudge.sh: a viber agent that ends without an
 * output line is blocked, an AUDIT line and an active stop hook let it stop,
 * and the hook finds the agent file when invoked by a C:\ path.
 *
 * A case lives here when its failure means lost user work, an open gate, a
 * break only one platform shows or a script that no longer starts; the rest
 * of the contract is proven by verdict-nudge.test.ts. This file runs on every
 * operating system, under the full shell matrix in CI.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run
 * directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/verdict-nudge.critical.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import {
  BLOCK,
  runPayload,
  runMessage,
  runInRoot,
  AGENT_FILE,
  LISTED,
  listedPayload,
} from "./verdict-nudge-fixture.ts";

test("DoD.1: a viber agent message with no VERDICT or AUDIT line prints the block object", async () => {
  assert.equal(await runMessage("I changed three files and the tests pass."), BLOCK);
});

test("DoD.4: an AUDIT: line prints nothing", async () => {
  assert.equal(await runMessage("review done\nAUDIT: 3 findings"), "");
});

test("DoD.5: stop_hook_active true prints nothing even without an output line", async () => {
  assert.equal(
    await runPayload({ agent_type: "viber:task-coder", stop_hook_active: true, last_assistant_message: "no line" }),
    "",
  );
});

test(
  "DoD.1: invoked by a C:\\ path, an agent ending on an unlisted value is blocked with the reason listing its agent file's values (the hook reads a backslash as a separator when it finds the agent file)",
  { skip: process.platform === "win32" ? false : "a C:\\ invoked path exists on Windows only" },
  async () => {
    assert.equal(await runInRoot({ "fixture-agent": AGENT_FILE }, listedPayload("work done\nVERDICT: MAYBE"), "native"), LISTED);
  },
);
