/*
 * handoff-path.critical.test.ts - the critical tier of
 * viber/skills/handoff/scripts/handoff-path.sh, the wrapper of the
 * handoff-path.ts entry: with no argument the script prints a stamped
 * placeholder under .temp/viber/handoff, and an MSYS /c/ argument and
 * backslashes become the C:/ and forward slash forms.
 *
 * A case lives here when its failure means lost user work, an open gate, a
 * break only one platform shows or a script that no longer starts; the target
 * rules, the branch and the stamp are proven in process by
 * tests/viber/lib/handoff-path.unit.test.ts. This file runs on every operating
 * system, under the full shell matrix in CI.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run
 * directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/handoff-path.critical.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import { withGitRepo, withTempDir } from "../harness/tmp.ts";
import { slash } from "../harness/paths.ts";
import { run, parse, sameFile, stampedDir, rootOf } from "./handoff-path-fixture.ts";

test("no argument inside a repository is a stamped placeholder under <root>/.temp/viber/handoff, not existing, on the current branch", async () => {
  await withGitRepo(async (repo) => {
    const printed = parse(await run([], repo.dir, repo.env));
    const dir = stampedDir(printed.file);
    assert.ok(dir.endsWith("/.temp/viber/handoff"), dir);
    assert.ok(sameFile(dir.slice(0, -"/.temp/viber/handoff".length), repo.dir));
    assert.equal(printed.exists, "false");
    assert.equal(printed.branch, "main");
  });
});

test("an MSYS absolute argument (/c/...) becomes the C:/ form on its way to node", { skip: process.platform === "win32" ? false : "the /c/ spelling means a drive only under Git Bash; elsewhere it is an ordinary absolute path" }, async () => {
  await withTempDir("p2p2-viber-", async (outside) => {
    await withGitRepo(async (repo) => {
      const native = slash(outside);
      const msys = `/${native[0].toLowerCase()}${native.slice(2)}/handoff.md`;
      const printed = parse(await run([msys], repo.dir, repo.env));
      assert.match(printed.file, /^[A-Za-z]:\//);
      assert.ok(sameFile(rootOf(printed.file, "handoff.md"), outside));
    });
  });
});

test("backslashes become forward slashes", async () => {
  await withGitRepo(async (repo) => {
    const printed = parse(await run(["docs\\sub\\x.md"], repo.dir, repo.env));
    assert.ok(sameFile(rootOf(printed.file, "docs/sub/x.md"), repo.dir), printed.file);
  });
});
