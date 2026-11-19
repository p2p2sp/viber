/*
 * lens-map-signals.critical.test.ts - the critical tier of
 * viber/skills/code-auditor/references/lenses/bugs.signals.md: the fix-history
 * signal command of the bugs lens runs under bash in a throwaway repository
 * and lists a recent fix only.
 *
 * A case lives here when its failure means lost user work, an open gate, a
 * break only one platform shows or a script that no longer starts; the rest
 * of the contract is proven by lens-map-signals.test.ts. This file runs on every
 * operating system, under the full shell matrix in CI.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run
 * directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/lens-map-signals.critical.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import { withGitRepo } from "../harness/tmp.ts";
import { assertBash, mapSignalCommands, buildHistory, runCommand } from "./lens-map-signals-fixture.ts";

test("the first map-signal command of bugs.signals.md, the fix history, lists a 5-day-old fix and leaves out a 400-day-old fix and a non-fix commit (git takes a --since it cannot parse as an empty window)", async () => {
  const fixHistory = mapSignalCommands("bugs.signals.md")[0];
  await withGitRepo(async (repo) => {
    await buildHistory(repo);
    await assertBash(async (shell) => {
      const result = await runCommand(shell, repo, fixHistory);
      assert.equal(result.status, 0, `the fix-history command must succeed: stderr=${result.stderr}`);
      assert.match(result.stdout, /src\/recent\.js/, `a fix inside the window must be listed:\n${fixHistory}\n${result.stdout}`);
      assert.doesNotMatch(result.stdout, /src\/ancient\.js/, "a fix older than 12 months is out of the window");
      assert.doesNotMatch(result.stdout, /src\/feature\.js/, "a non-fix subject is out of the fix history");
    });
  });
});
