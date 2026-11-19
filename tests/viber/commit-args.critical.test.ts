/*
 * commit-args.critical.test.ts - the critical tier of
 * viber/skills/commit/scripts/commit-args.sh: an existing path resolves to
 * mode paths, a missing, backslashed or glob-looking selector never widens the
 * commit to all, and a path removed with git rm still counts as a path.
 *
 * A case lives here when its failure means lost user work, an open gate, a
 * break only one platform shows or a script that no longer starts; the rest
 * of the contract is proven by commit-args.test.ts. This file runs on every
 * operating system, under the full shell matrix in CI.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run
 * directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/commit-args.critical.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { withGitRepo, withTempDir } from "../harness/tmp.ts";
import { resolve, assertBash } from "./commit-args-fixture.ts";

test("an existing path resolves to mode 'paths' with the path passed verbatim", async () => {
  await assertBash(async (bash) => {
    await withTempDir("p2p2-commit-args-", async (dir) => {
      fs.writeFileSync(path.join(dir, "foo.txt"), "content\n");
      const sel = await resolve(bash, dir, "foo.txt");
      assert.deepEqual(sel, { mode: "paths", path: "foo.txt", issueRefs: "" });
    });
  });
});

test("a path that does not exist resolves to mode 'missing', never 'all' (a typo'd or stale path must not widen the commit to every change)", async () => {
  await assertBash(async (bash) => {
    await withTempDir("p2p2-commit-args-", async (dir) => {
      const sel = await resolve(bash, dir, "does/not/exist.txt");
      assert.deepEqual(sel, { mode: "missing", path: "", issueRefs: "" });
    });
  });
});

test("a list of backslashed Windows paths none of which exists resolves to mode 'missing'", async () => {
  await assertBash(async (bash) => {
    await withTempDir("p2p2-commit-args-", async (dir) => {
      const sel = await resolve(bash, dir, "src\\gone.ts lib\\old.ts");
      assert.equal(sel.mode, "missing");
    });
  });
});

test("a path already removed with git rm (gone from disk and index, still in HEAD) resolves to mode 'paths' (it used to be dropped, narrowing or widening the commit)", async () => {
  await assertBash(async (bash) => {
    await withGitRepo(async (repo) => {
      fs.mkdirSync(path.join(repo.dir, "gone"));
      fs.writeFileSync(path.join(repo.dir, "gone", "f.txt"), "f\n");
      fs.writeFileSync(path.join(repo.dir, "kept.txt"), "k\n");
      await repo.git("add", "-A");
      await repo.git("commit", "-m", "seed");
      await repo.git("rm", "-rq", "gone");
      const sel = await resolve(bash, repo.dir, "kept.txt gone");
      assert.deepEqual(sel, { mode: "paths", path: "kept.txt|gone", issueRefs: "" });
    });
  });
});

test("a glob token in a list is never expanded by the shell (only a literal existing path counts)", async () => {
  await assertBash(async (bash) => {
    await withTempDir("p2p2-commit-args-", async (dir) => {
      fs.writeFileSync(path.join(dir, "a.txt"), "a\n");
      const sel = await resolve(bash, dir, "*.txt nothing");
      assert.deepEqual(sel, { mode: "all", path: "", issueRefs: "" });
    });
  });
});
