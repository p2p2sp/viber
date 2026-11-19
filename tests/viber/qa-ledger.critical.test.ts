/*
 * qa-ledger.critical.test.ts - the critical tier of
 * viber/skills/e2e/scripts/qa-ledger.sh: list prints one state line per
 * automatable scenario with counts, and the script invoked by a C:\, C:/ or
 * /c/ path still names the references directory.
 *
 * A case lives here when its failure means lost user work, an open gate, a
 * break only one platform shows or a script that no longer starts; the rest
 * of the contract is proven by qa-ledger.test.ts. This file runs on every
 * operating system, under the full shell matrix in CI.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run
 * directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/qa-ledger.critical.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { runScript } from "../harness/run.ts";
import { forEachShell } from "../harness/shells.ts";
import { withTempDir } from "../harness/tmp.ts";
import { slash } from "../harness/paths.ts";
import { SUT, HANDOFF, NEXT_ARGS, run, block } from "./qa-ledger-fixture.ts";

test("list prints one id line per automatable scenario in file order with its state and title, none for a not automatable one, then the counts", async () => {
  const result = await run(HANDOFF, ["list"]);
  assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  assert.equal(
    result.stdout,
    [
      "id: QA-01 | file | Sign in",
      "id: QA-02 | blocked | Create a project",
      "id: QA-04 | pending | List projects",
      "id: QA-05 | pending | Delete a project",
      "counts: 1 file, 1 blocked, 2 pending",
      "",
    ].join("\n"),
  );
});

const ON_WINDOWS = process.platform === "win32";
const ROOT = slash(path.resolve(import.meta.dirname, "../../viber"));
const MSYS_ROOT = `/${ROOT[0].toLowerCase()}${ROOT.slice(2)}`;
const SPELLINGS = [
  { name: "a C:\\ path", sut: SUT.replace(/\//g, "\\"), root: ROOT },
  { name: "a C:/ path", sut: SUT.replace(/\\/g, "/"), root: ROOT },
  { name: "a /c/ path", sut: `${MSYS_ROOT}/skills/e2e/scripts/qa-ledger.sh`, root: MSYS_ROOT },
];

for (const row of SPELLINGS) {
  test(`invoked by ${row.name}, the refs: line names the references directory under ${row.root} (a backslash spelling never reaches the dispatch block)`, { skip: ON_WINDOWS ? false : "the drive spellings exist only on Windows" }, async () => {
    const skips = await forEachShell("bash", async (bash) => {
      await withTempDir("p2p2-qa-ledger-", async (dir) => {
        const handoff = path.join(dir, "qa.e2e.md");
        fs.writeFileSync(handoff, HANDOFF);
        const result = await runScript(row.sut, [handoff, "next", ...NEXT_ARGS], { shell: bash, cwd: dir });
        assert.equal(result.status, 0, `stderr: ${result.stderr}`);
        assert.equal(result.stdout, block(slash(handoff), "QA-02", `${row.root}/references`));
      });
    });
    assert.ok(skips.every((skip) => skip.reason.length > 0), "a skip must record a reason");
  });
}
