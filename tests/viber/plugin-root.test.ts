/*
 * plugin-root.test.ts - proves viber/scripts/plugin-root.sh, the sourced library
 * whose plugin_root_of prints a script's plugin root from the path it was invoked
 * by: a `C:\...` or `C:/...` spelling comes out as `C:/...`, a `/c/...` spelling
 * as `/c/...`, a relative spelling as a relative root, and sourcing it leaves the
 * caller's shell options as they were.
 *
 * Every case copies the library beside a throwaway `#!/bin/sh` script that sources
 * it the way a viber script does (`. "$(dirname -- "$0")/plugin-root.sh"`) and
 * passes the invoked spelling and the level count as arguments, so each spelling
 * is exercised on every OS. The library is POSIX, so the cases run through
 * forEachShell("posix", ...); the set -u case also runs under bash.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run
 * directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/plugin-root.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import { SOURCE_LINE, assertShells, runThrowaway } from "./plugin-root-fixture.ts";

// --- sourcing leaves the caller's options (DoD 4) -----------------------------------------

test("sourcing without set -u and set -e leaves both off (the library sets no option of its own)", async () => {
  await assertShells("posix", async (shell) => {
    const result = await runThrowaway(
      shell,
      [SOURCE_LINE, "plugin_root_of x.sh 1", 'case $- in *[ue]*) echo options-changed;; *) echo options-kept;; esac'],
      [],
    );
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, "./..\noptions-kept\n");
  });
});
