/*
 * run-summary.critical.test.ts - the critical tier of
 * viber/scripts/run-summary.sh: a run directory prints the elapsed line
 * followed by the token report, and review transcripts naming the plan by a
 * backslash path are counted as rounds.
 *
 * A case lives here when its failure means lost user work, an open gate, a
 * break only one platform shows or a script that no longer starts; the rest
 * of the contract is proven by run-summary.test.ts. This file runs on every
 * operating system, under the full shell matrix in CI.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run
 * directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/run-summary.critical.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { slash } from "../harness/paths.ts";
import { withTempDir } from "../harness/tmp.ts";
import {
  NOW,
  runAtNow,
  SONNET,
  NOT_COUNTED,
  prompt,
  assistant,
  seed,
  transcript,
  report,
  reportLines,
  PLANNED,
  writePlan,
  review,
} from "./run-summary-fixture.ts";

test("a run directory after the mark follows the elapsed line with the token report", async () => {
  await withTempDir("p2p2-viber-", async (tmp) => {
    const fx = seed(tmp);
    const result = await runAtNow([String(NOW - 8043), slash(fx.runDir)], tmp, {
      CLAUDE_CONFIG_DIR: slash(path.join(tmp, "missing-config")),
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(
      result.stdout,
      "elapsed: 2h 14m 03s\ntokens: unavailable - no projects directory\nrounds: plan review unavailable - no projects directory\n",
    );
  });
});

test("every planner-review and planner-graph-review transcript naming the planned path counts once, the backslash form, a retried dispatch and a transcript older than the run day included, and the rounds line follows the token lines", async () => {
  await withTempDir("p2p2-viber-", async (tmp) => {
    const fx = seed(tmp);
    writePlan(fx, PLANNED);
    transcript(fx, "s1", "a0", "viber:task-coder", [
      prompt(fx.runPrompt),
      assistant("m1", SONNET, { in: 1, out: 2, cacheRead: 3, cacheWrite: 4 }),
    ]);
    review(fx, "r1", "viber:planner-review", PLANNED);
    review(fx, "r2", "viber:planner-review", "C:\\plans\\p.md");
    review(fx, "r3", "viber:planner-review", PLANNED);
    review(fx, "r4", "viber:planner-graph-review", PLANNED);
    const old = new Date("2019-06-01T00:00:00Z");
    fs.utimesSync(path.join(fx.config, "projects", "proj", "plan", "subagents", "agent-r3.jsonl"), old, old);
    const result = await report(tmp, fx);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(reportLines(result.stdout), [
      "tokens: viber:task-coder claude-sonnet-4 in 1 out 2 cache-read 3 cache-write 4",
      NOT_COUNTED,
      "rounds: plan review 4",
    ]);
  });
});
