/*
 * session-start.critical.test.ts - the critical tier of
 * viber/hooks/scripts/session-start.sh: the session start hook injects the
 * manifest verbatim with the version banner, and still prints the banner and
 * exits 0 when no manifest can be read.
 *
 * A case lives here when its failure means lost user work, an open gate, a
 * break only one platform shows or a script that no longer starts; the rest
 * of the contract is proven by session-start.test.ts. This file runs on every
 * operating system, under the full shell matrix in CI.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run
 * directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/session-start.critical.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { withTempDir } from "../harness/tmp.ts";
import { SUT, fakePluginRoot, isolatedScript, run } from "./session-start-fixture.ts";

test("manifest present -> additionalContext equals the manifest bytes verbatim, systemMessage carries the version", async () => {
  await withTempDir("p2p2-viber-session-start-", async (dir) => {
    // No trailing newline in the fixture: the script reads the file through a
    // `$(cat ...)` command substitution, which strips ALL trailing newlines
    // from the captured value (asserted on its own below), so "verbatim" can be
    // compared with plain equality here.
    const manifest = "# viber manifest\nsome instructions here.";
    const root = fakePluginRoot(path.join(dir, "viber-1.2.3"), manifest);
    const json = await run(SUT, JSON.stringify({ source: "startup" }), { CLAUDE_PLUGIN_ROOT: root });
    assert.equal(json.hookSpecificOutput.hookEventName, "SessionStart");
    assert.equal(json.hookSpecificOutput.additionalContext, manifest);
    assert.equal(json.systemMessage, `viber loaded ${path.basename(root)}`);
  });
});

test("manifest unreadable (none anywhere the script looks) -> additionalContext absent, systemMessage still present, exit 0", async () => {
  await withTempDir("p2p2-viber-session-start-", async (dir) => {
    const script = isolatedScript(path.join(dir, "isolated"));
    const emptyRoot = path.join(dir, "empty-root");
    fs.mkdirSync(emptyRoot, { recursive: true });
    const json = await run(script, JSON.stringify({ source: "startup" }), { CLAUDE_PLUGIN_ROOT: emptyRoot });
    assert.equal(json.hookSpecificOutput.hookEventName, "SessionStart");
    assert.equal(json.hookSpecificOutput.additionalContext, undefined);
    assert.equal(json.systemMessage, `viber loaded ${path.basename(emptyRoot)}`);
  });
});
