/*
 * diff-files.critical.test.ts - the critical tier of
 * viber/skills/code-auditor/scripts/diff-files.sh, the wrapper of the
 * diff-files.ts entry: a feature branch prints its merge base and each
 * committed, staged, unstaged and untracked path once.
 *
 * A case lives here when its failure means lost user work, an open gate, a
 * break only one platform shows or a script that no longer starts; the base
 * rules, the path list and the refusals are proven in process by
 * tests/viber/lib/diff-files.unit.test.ts. This file runs on every operating
 * system, under the full shell matrix in CI.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run
 * directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/diff-files.critical.test.ts
 */

import { test } from "../harness/test.ts";
import { withGitRepo } from "../harness/tmp.ts";
import { assertPosix, run, git, write, commitFiles, lines, assertOutput } from "./diff-files-fixture.ts";

test("a feature branch prints its merge base, then a committed, a staged, an unstaged and an untracked path once each", async () => {
  await assertPosix(async (shell) => {
    await withGitRepo(async (repo) => {
      const mainSha = await commitFiles(repo, { "base.txt": "1\n", "edited.txt": "1\n", "staged.txt": "1\n" });
      await git(repo, "checkout", "-b", "feature");
      await commitFiles(repo, { "committed.txt": "1\n" });
      write(repo, "staged.txt", "2\n");
      await git(repo, "add", "staged.txt");
      write(repo, "edited.txt", "2\n");
      write(repo, "untracked.txt", "1\n");
      assertOutput(
        await run(shell, repo),
        lines(`BASE ${mainSha}`, "committed.txt", "edited.txt", "staged.txt", "untracked.txt"),
      );
    });
  });
});
