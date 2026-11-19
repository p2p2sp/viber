/*
 * task-step.critical.test.ts - the critical tier of
 * viber/scripts/task-step.sh: start answers the first coder block, step state
 * under .temp is discarded on another mark and kept on the same mark, a
 * reviewer PASS answers the commit with every reported path, and plugin roots
 * keep their Windows spelling.
 *
 * A case lives here when its failure means lost user work, an open gate, a
 * break only one platform shows or a script that no longer starts; the rest
 * of the contract is proven by task-step.test.ts. This file runs on every
 * operating system, under the full shell matrix in CI.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run
 * directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/task-step.critical.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";

import { slash } from "../harness/paths.ts";
import { withGitRepo } from "../harness/tmp.ts";
import {
  SUT,
  PLAN_DIR,
  PLAN_REL,
  ROOT,
  seedPlan,
  step,
  arrange,
  lines,
  coderLines,
  START_T1,
  START_T4_WAIVED,
  T1_FAIL,
  T1_PASS,
} from "./task-step-fixture.ts";

test("start answers the first coder block with the tiers it was given and the coder lines of the plan", async () => {
  await withGitRepo(async (repo) => {
    seedPlan(repo);

    const result = await step(repo, ["T3", "100", "start", "--tier", "sonnet", "--review", "opus"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(
      result.stdout,
      lines(
        "NEXT: coder | attempt: 1 | model: sonnet | review: opus",
        ...coderLines("T3", [`prior: ${PLAN_DIR}/work/T2-coder.md`]),
      ),
    );
  });
});

// The invoked spelling is the contract: a C:\ or C:/ path is printed as C:/, a /c/ path as /c/.
// Neither spelling names a file outside Windows, so the cases skip there.
const WINDOWS_ONLY = process.platform === "win32" ? false : "a C:\\ or /c/ spelling names a file only on Windows";
const MSYS = (p: string) => slash(p).replace(/^([A-Za-z]):/, (_, drive: string) => `/${drive.toLowerCase()}`);

const SPELLINGS: Array<{ label: string; invoked: string; root: string }> = [
  { label: "a C:\\ path", invoked: SUT, root: ROOT },
  { label: "a C:/ path", invoked: slash(SUT), root: ROOT },
  { label: "a /c/ path", invoked: MSYS(SUT), root: MSYS(ROOT) },
];

for (const row of SPELLINGS) {
  test(`invoked by ${row.label}, the RUN: commands name the plugin root in that spelling (AC1)`, { skip: WINDOWS_ONLY }, async () => {
    await withGitRepo(async (repo) => {
      seedPlan(repo);
      await arrange(repo, [START_T4_WAIVED]);

      const result = await step(repo, ["T4", "100", "coder", "PASS"], row.invoked);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(result.stdout, lines("NEXT: commit", `RUN: "${row.root}/scripts/commit-task.sh" "${PLAN_REL}" "T4"`));
    });
  });
}

test("start under another started mark discards the state and answers attempt 1", async () => {
  await withGitRepo(async (repo) => {
    seedPlan(repo);
    await arrange(repo, [START_T1, T1_FAIL]);

    const result = await step(repo, ["T1", "101", "start", "--tier", "sonnet", "--review", "opus"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(
      result.stdout,
      lines("NEXT: coder | attempt: 1 | model: sonnet | review: opus", ...coderLines("T1")),
    );
  });
});

test("start under the current mark keeps the state and prints the current attempt's coder block again", async () => {
  await withGitRepo(async (repo) => {
    seedPlan(repo);
    await arrange(repo, [START_T1, T1_FAIL]);

    const result = await step(repo, START_T1);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(
      result.stdout,
      lines("NEXT: coder | attempt: 2 | model: opus | review: opus", ...coderLines("T1")),
    );
  });
});

test("a reviewer PASS answers the commit with every --with path the coder and the reviewers reported and the --defer entries", async () => {
  await withGitRepo(async (repo) => {
    seedPlan(repo);
    await arrange(repo, [
      START_T1,
      [...T1_PASS, "--with", "lib/x.ts", "--defer", "T2:src/x.ts"],
    ]);

    const result = await step(repo, ["T1", "100", "reviewer", "PASS", "--with", "lib/y.ts,lib/x.ts"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(
      result.stdout,
      lines("NEXT: commit", `RUN: "${ROOT}/scripts/commit-task.sh" "${PLAN_REL}" "T1" --with "lib/x.ts" "lib/y.ts" --defer "T2:src/x.ts"`),
    );
  });
});
