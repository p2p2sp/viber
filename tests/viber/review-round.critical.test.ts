/*
 * review-round.critical.test.ts - the critical tier of
 * viber/skills/planner/scripts/review-round.sh: start on a small plan prints
 * the planner-review block, down to the sum: line the plan gate reads and the
 * out: file under the repository, and the refs lines keep the drive-letter
 * spelling of the invoked path on Windows.
 *
 * A case lives here when its failure means lost user work, an open gate, a
 * break only one platform shows or a script that no longer starts; the rest
 * of the contract is proven by review-round.test.ts. This file runs on every
 * operating system, under the full shell matrix in CI.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run
 * directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/review-round.critical.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";

import { runScript } from "../harness/run.ts";
import { withGitRepo } from "../harness/tmp.ts";
import { SUT, REFS, PLAN_REL, write, litePlan, start, shaped } from "./review-round-fixture.ts";

test("start on a plan of 12 tasks or fewer prints one planner-review block with the plan, refs, memory, sum and out lines and the input addition", async () => {
  await withGitRepo(async (repo) => {
    write(repo.dir, PLAN_REL, litePlan(2));
    write(repo.dir, ".claude/viber.yml", "build:\n  memory: true\n");

    const result = await start(repo, PLAN_REL);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(
      shaped(repo, result.stdout),
      [
        "NEXT: review | member: 1 | agent: viber:planner-review | round: 1 | add: input | add: answered",
        `plan: ${PLAN_REL}`,
        `refs: ${REFS}`,
        "memory: true",
        "sum: <sum>",
        "out: <dir>/review-1.md",
        "",
      ].join("\n"),
    );
  });
});

// The refs line spells the plugin root the way the script was invoked: a `C:\` or `C:/` path
// prints `C:/...`, a `/c/` path prints `/c/...`. Only Windows has those spellings of a file.
const NATIVE_SPELLINGS_SKIP = process.platform === "win32" ? false : "a drive-letter spelling of a script exists on Windows only";

function refsLines(stdout: string): string[] {
  return stdout.split("\n").filter((line) => line.startsWith("refs: "));
}

for (const spelling of [
  { name: "a C:\\ path", script: SUT.replace(/\//g, "\\"), refs: REFS },
  { name: "a C:/ path", script: SUT.replace(/\\/g, "/"), refs: REFS },
  {
    name: "a /c/ path",
    script: SUT.replace(/\\/g, "/").replace(/^([A-Za-z]):\//, (_, drive: string) => `/${drive.toLowerCase()}/`),
    refs: REFS.replace(/^([A-Za-z]):\//, (_, drive: string) => `/${drive.toLowerCase()}/`),
  },
]) {
  test(`start invoked by ${spelling.name} prints every refs line as ${spelling.refs} (the printed plugin path keeps the invoked spelling)`, { skip: NATIVE_SPELLINGS_SKIP }, async () => {
    await withGitRepo(async (repo) => {
      write(repo.dir, PLAN_REL, litePlan(13));

      const result = await runScript(spelling.script, [PLAN_REL, "start"], { cwd: repo.dir, env: repo.env, shell: "bash" });

      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.deepEqual(refsLines(result.stdout), Array(4).fill(`refs: ${spelling.refs}`));
    });
  });
}
