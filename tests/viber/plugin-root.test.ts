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
import fs from "node:fs";
import path from "node:path";

import { runScript, type RunResult } from "../harness/run.ts";
import { forEachShell, type Shell } from "../harness/shells.ts";
import { withTempDir } from "../harness/tmp.ts";

const SUT = path.resolve(import.meta.dirname, "../../viber/scripts/plugin-root.sh");

const SOURCE_LINE = '. "$(dirname -- "$0")/plugin-root.sh"';

async function assertShells(kind: "posix" | "bash", fn: (shell: Shell) => void | Promise<void>) {
  const skips = await forEachShell(kind, fn);
  for (const skip of skips) {
    assert.equal(skip.kind, kind);
    assert.ok(skip.reason.length > 0, "a skip must record a reason");
  }
}

async function runThrowaway(shell: Shell, lines: string[], args: string[]): Promise<RunResult> {
  return await withTempDir("plugin-root-", async (dir) => {
    fs.copyFileSync(SUT, path.join(dir, "plugin-root.sh"));
    const script = path.join(dir, "caller.sh");
    fs.writeFileSync(script, ["#!/bin/sh", ...lines, ""].join("\n"));
    return await runScript(script, args, { shell });
  });
}

// --- plugin_root_of (DoD 1 to 3) ---------------------------------------------------------

const ROOTS: { name: string; invoked: string; levels: string; root: string }[] = [
  { name: "a Windows backslash path, one level", invoked: "C:\\p\\viber\\scripts\\x.sh", levels: "1", root: "C:/p/viber" },
  { name: "a Windows slash path, three levels", invoked: "C:/p/viber/skills/code-auditor/scripts/x.sh", levels: "3", root: "C:/p/viber" },
  { name: "an MSYS /c/ path", invoked: "/c/p/viber/scripts/x.sh", levels: "1", root: "/c/p/viber" },
  { name: "a POSIX path whose root is named like a skills directory", invoked: "/home/u/skills/viber/scripts/x.sh", levels: "1", root: "/home/u/skills/viber" },
  { name: "a POSIX path holding a scripts directory above the plugin root", invoked: "/home/u/scripts/viber/skills/rules/scripts/x.sh", levels: "3", root: "/home/u/scripts/viber" },
  { name: "a relative path that ends exactly at the root", invoked: "skills/memory/scripts/x.sh", levels: "3", root: "." },
  { name: "a bare file name, one level", invoked: "x.sh", levels: "1", root: "./.." },
  { name: "a bare file name, three levels", invoked: "x.sh", levels: "3", root: "./../../.." },
];

for (const row of ROOTS) {
  test(`plugin_root_of prints ${row.root} for ${row.name}`, async () => {
    await assertShells("posix", async (shell) => {
      const result = await runThrowaway(shell, [SOURCE_LINE, 'plugin_root_of "$1" "$2"'], [row.invoked, row.levels]);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(result.stdout, `${row.root}\n`);
    });
  });
}

// --- sourcing leaves the caller's options (DoD 4) -----------------------------------------

const KEEPS_NOUNSET_REPORT = 'case $- in *u*) echo nounset-on;; *) echo nounset-off;; esac';

for (const kind of ["posix", "bash"] as const) {
  test(`sourcing under set -u leaves set -u on and the function still answers (${kind} shells)`, async () => {
    await assertShells(kind, async (shell) => {
      const result = await runThrowaway(
        shell,
        ["set -u", SOURCE_LINE, "plugin_root_of x.sh 1", KEEPS_NOUNSET_REPORT],
        [],
      );
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(result.stdout, "./..\nnounset-on\n");
    });
  });
}

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
