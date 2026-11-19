/*
 * synthesize.critical.test.ts - the critical tier of
 * viber/skills/code-auditor/scripts/synthesize.sh: the summary line and fill
 * block print for a finished audit, and a workspace given with backslash
 * separators or a backslash in its last component still yields the right run
 * id.
 *
 * A case lives here when its failure means lost user work, an open gate, a
 * break only one platform shows or a script that no longer starts; the rest
 * of the contract is proven by synthesize.test.ts. This file runs on every
 * operating system, under the full shell matrix in CI.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run
 * directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/synthesize.critical.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { runScript } from "../harness/run.ts";
import { withTempDir } from "../harness/tmp.ts";
import { SUT, assertPosix, build, scenario, verified } from "./synthesize-fixture.ts";

const WINDOWS = process.platform === "win32";
const RUN_TITLE = "# Findings - 20260101-000000 (bugs, repo)";
const SPELLINGS: [string, (ws: string) => string][] = [
  ["backslash separators", (ws) => ws.replaceAll("/", "\\")],
  ["backslash separators and a trailing backslash", (ws) => ws.replaceAll("/", "\\") + "\\"],
  ["slash separators and a trailing slash", (ws) => ws.replaceAll("\\", "/") + "/"],
  ["slash separators and a trailing backslash", (ws) => ws.replaceAll("\\", "/") + "\\"],
  ["backslash separators and a trailing slash", (ws) => ws.replaceAll("/", "\\") + "/"],
];

for (const [spelling, spell] of SPELLINGS) {
  test(`a workspace written with ${spelling} gets the run id of its last component in findings.md`, { skip: WINDOWS ? false : "a Windows path resolves only on win32" }, async () => {
    await assertPosix(async (shell) => {
      await withTempDir("p2p2-synth-", async (dir) => {
        const ws = build(dir, { findings: [verified("U1-1")] });
        const result = await runScript(SUT, [spell(ws)], { shell, cwd: dir });
        assert.equal(result.status, 0, `unexpected exit status: stderr=${result.stderr}`);
        assert.equal(fs.readFileSync(path.join(ws, "findings.md"), "utf8").split("\n")[0], RUN_TITLE);
      });
    });
  });
}

test("a workspace whose last component holds a backslash gets the run id after the backslash", { skip: WINDOWS ? "a backslash is a separator on win32, never a file name character" : false }, async () => {
  await assertPosix(async (shell) => {
    await withTempDir("p2p2-synth-", async (dir) => {
      const ws = build(dir, { findings: [verified("U1-1")] }, "code-auditor\\20260101-000000");
      const result = await runScript(SUT, [ws], { shell, cwd: dir });
      assert.equal(result.status, 0, `unexpected exit status: stderr=${result.stderr}`);
      assert.equal(fs.readFileSync(path.join(ws, "findings.md"), "utf8").split("\n")[0], RUN_TITLE);
    });
  });
});

test("stdout is the summary line, then the fill block with one entry line per full entry and the cited report", async () => {
  await scenario(
    {
      scope: "repo",
      units: ["U1", "U2", "U3"],
      findings: [
        verified("U1-1", { sev: "8.0", observed: "segfault seen" }),
        { id: "U2-1", verdict: "INCONCLUSIVE", sev: "5.0", observed: "no oracle" },
        verified("U3-1", { sev: "2.0" }),
      ],
    },
    (ws, result) => {
      assert.equal(
        result.stdout,
        [
          "summary: units 3 | hunts 3 | confirmed 2 | not investigated 0",
          `last-line: /viber:intent ${ws}/findings.md`,
          `NEXT: fill | findings: ${ws}/findings.md`,
          `entry: 1 | reports: ${ws}/reports/U1-1.md | verdict: VERIFIED | observed: segfault seen`,
          `entry: 2 | reports: ${ws}/reports/U2-1.md | verdict: INCONCLUSIVE | observed: no oracle`,
          "",
        ].join("\n"),
      );
    },
  );
});
