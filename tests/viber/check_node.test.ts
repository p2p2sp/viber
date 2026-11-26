/*
 * check_node.test.ts - proves viber/skills/ui-designer/scripts/check_node.sh's single-line
 * contract across every documented Node version threshold: `NODE_OK <cmd>`
 * (node, or node --experimental-strip-types) below the type-stripping
 * cutover, or `NODE_MISSING` when node is absent, unparsable, or too old -
 * always exiting 0 (fail-open).
 *
 * check_node.sh is `#!/bin/sh`, so every case runs through
 * forEachShell("posix", ...) via opts.shell, never executed directly.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run
 * directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/check_node.test.ts
 */

import { test } from "../harness/test.ts";
import fs from "node:fs";
import path from "node:path";

import { runScript } from "../harness/run.ts";
import { withStub } from "../harness/stub.ts";
import { SUT, assertPosix, assertOneLine } from "./check_node-fixture.ts";

/** The real PATH, minus every directory that resolves a real `node` - so
 *  "no node on PATH" is genuine even on a dev machine that has node
 *  installed, on every OS. */
function pathWithoutNode(): string {
  const nodeNames = process.platform === "win32" ? ["node.exe", "node.cmd", "node.bat", "node"] : ["node"];
  const dirs = (process.env.PATH ?? "").split(path.delimiter).filter(Boolean);
  const kept = dirs.filter((dir) => !nodeNames.some((name) => fs.existsSync(path.join(dir, name))));
  return kept.join(path.delimiter);
}
const NODE_OK_STRIP_VERSIONS = ["v23.5.0", "v22.6.0"];

test("22.6 <= node < 23.6 -> NODE_OK node --experimental-strip-types", async () => {
  await assertPosix(async (shell) => {
    for (const version of NODE_OK_STRIP_VERSIONS) {
      await withStub("node", `echo '${version}'`, async (stubDir) => {
        const result = await runScript(SUT, [], { shell, stubDirs: [stubDir] });
        assertOneLine(result, "NODE_OK node --experimental-strip-types");
      });
    }
  });
});

test("no node on PATH -> NODE_MISSING", async () => {
  await assertPosix(async (shell) => {
    const result = await runScript(SUT, [], { shell, env: { PATH: pathWithoutNode() } });
    assertOneLine(result, "NODE_MISSING");
  });
});

test("node present but `node -v` exits non-zero -> NODE_MISSING", async () => {
  await assertPosix(async (shell) => {
    await withStub("node", "exit 3", async (stubDir) => {
      const result = await runScript(SUT, [], { shell, stubDirs: [stubDir] });
      assertOneLine(result, "NODE_MISSING");
    });
  });
});

test("a malformed version string -> NODE_MISSING", async () => {
  await assertPosix(async (shell) => {
    await withStub("node", "echo 'not-a-version'", async (stubDir) => {
      const result = await runScript(SUT, [], { shell, stubDirs: [stubDir] });
      assertOneLine(result, "NODE_MISSING");
    });
  });
});
