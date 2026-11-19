/*
 * run-changes.critical.test.ts - the critical tier of
 * viber/scripts/run-changes.sh: a run directory prints the commit that added
 * its plan and the tracked and untracked paths changed since.
 *
 * A case lives here when its failure means lost user work, an open gate, a
 * break only one platform shows or a script that no longer starts; the rest
 * of the contract is proven by run-changes.test.ts. This file runs on every
 * operating system, under the full shell matrix in CI.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run
 * directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/run-changes.critical.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import { withGitRepo } from "../harness/tmp.ts";
import { RUN, run, write, commitAll, seed } from "./run-changes-fixture.ts";

test("a run directory prints the commit that added its plan, then the tracked paths that differ from it and the untracked ones", async () => {
  await withGitRepo(async (repo) => {
    const base = await seed(repo);
    write(repo.dir, "tracked.txt", "two\n");
    await commitAll(repo, "work");
    write(repo.dir, "other.txt", "two\n");
    write(repo.dir, "new.txt", "new\n");

    const result = await run(repo.dir, repo.env, [RUN]);

    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, `base: ${base}\nchanged: other.txt\nchanged: tracked.txt\nchanged: new.txt\n`);
  });
});
