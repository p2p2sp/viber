/*
 * plugin-root.critical.test.ts - the critical tier of
 * viber/scripts/plugin-root.sh: the plugin root is printed from the invoked
 * path in its drive-letter, backslash and MSYS spellings, and sourcing the
 * library under set -u leaves the option on.
 *
 * A case lives here when its failure means lost user work, an open gate, a
 * break only one platform shows or a script that no longer starts; the rest
 * of the contract is proven by plugin-root.test.ts. This file runs on every
 * operating system, under the full shell matrix in CI.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run
 * directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/plugin-root.critical.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import { SOURCE_LINE, assertShells, runThrowaway } from "./plugin-root-fixture.ts";

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
