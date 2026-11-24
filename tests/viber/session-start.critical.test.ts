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
import {
  NODE_ABSENT_SKIP,
  SUT,
  addNodeMissing,
  fakePluginRoot,
  isolatedScript,
  run,
  runWithNode,
  runWithoutNode,
} from "./session-start-fixture.ts";

const REFUSAL = "viber needs Node.js 22.18 or newer: install it and start a new session.";
const START = JSON.stringify({ source: "startup" });

async function nodeRoot(dir: string, manifest: string): Promise<string> {
  return addNodeMissing(fakePluginRoot(path.join(dir, "viber-1.2.3"), manifest), REFUSAL);
}

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

test("no node on PATH -> the banner ends on the note reading none and the refusal text opens additionalContext ahead of the manifest", { skip: NODE_ABSENT_SKIP }, async () => {
  await withTempDir("p2p2-viber-session-start-", async (dir) => {
    const root = await nodeRoot(dir, "MANIFEST");
    const json = await runWithoutNode(SUT, START, { CLAUDE_PLUGIN_ROOT: root });
    assert.equal(json.systemMessage, "viber loaded viber-1.2.3 - Node.js 22.18 or newer is required, found none");
    assert.equal(json.hookSpecificOutput.additionalContext, `${REFUSAL}\n\nMANIFEST`);
  });
});

for (const version of ["v22.17.9", "v20.19.0", "v18.0.0"]) {
  test(`node reporting ${version} -> the note names that version and the refusal text precedes the manifest`, async () => {
    await withTempDir("p2p2-viber-session-start-", async (dir) => {
      const root = await nodeRoot(dir, "MANIFEST");
      const json = await runWithNode(SUT, START, version, { CLAUDE_PLUGIN_ROOT: root });
      assert.equal(json.systemMessage, `viber loaded viber-1.2.3 - Node.js 22.18 or newer is required, found ${version}`);
      assert.equal(json.hookSpecificOutput.additionalContext, `${REFUSAL}\n\nMANIFEST`);
    });
  });
}

for (const version of ["v22.18.0", "v22.20.1", "v23.0.0", "v24.11.0"]) {
  test(`node reporting ${version} -> the output is the plain banner and the manifest alone`, async () => {
    await withTempDir("p2p2-viber-session-start-", async (dir) => {
      const root = await nodeRoot(dir, "MANIFEST");
      const json = await runWithNode(SUT, START, version, { CLAUDE_PLUGIN_ROOT: root });
      assert.equal(json.systemMessage, "viber loaded viber-1.2.3");
      assert.equal(json.hookSpecificOutput.additionalContext, "MANIFEST");
    });
  });
}

test("a node whose version does not parse is treated as no Node", async () => {
  await withTempDir("p2p2-viber-session-start-", async (dir) => {
    const root = await nodeRoot(dir, "MANIFEST");
    const json = await runWithNode(SUT, START, "not a version", { CLAUDE_PLUGIN_ROOT: root });
    assert.equal(json.systemMessage, "viber loaded viber-1.2.3 - Node.js 22.18 or newer is required, found none");
    assert.equal(json.hookSpecificOutput.additionalContext, `${REFUSAL}\n\nMANIFEST`);
  });
});

test("no usable Node and no readable manifest -> additionalContext is the refusal text alone", async () => {
  await withTempDir("p2p2-viber-session-start-", async (dir) => {
    const script = isolatedScript(path.join(dir, "isolated"));
    const root = addNodeMissing(path.join(dir, "viber-1.2.3"), REFUSAL);
    const json = await runWithNode(script, START, "v20.0.0", { CLAUDE_PLUGIN_ROOT: root });
    assert.equal(json.hookSpecificOutput.additionalContext, REFUSAL);
  });
});

test("no usable Node and no readable refusal file -> the note still prints and additionalContext is the manifest alone", async () => {
  await withTempDir("p2p2-viber-session-start-", async (dir) => {
    const script = isolatedScript(path.join(dir, "isolated"));
    const root = fakePluginRoot(path.join(dir, "viber-1.2.3"), "MANIFEST");
    const json = await runWithNode(script, START, "v20.0.0", { CLAUDE_PLUGIN_ROOT: root });
    assert.equal(json.systemMessage, "viber loaded viber-1.2.3 - Node.js 22.18 or newer is required, found v20.0.0");
    assert.equal(json.hookSpecificOutput.additionalContext, "MANIFEST");
  });
});
