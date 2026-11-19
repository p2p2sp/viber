/*
 * handoff-path.test.ts - proves viber/skills/handoff/scripts/handoff-path.sh's
 * contract: exactly four lines (FILE=, EXISTS=, BRANCH=, TARGET=) naming where
 * the handoff file goes, on which branch the conversation stands and whether
 * the first argument word was taken as the path or left to the prompt.
 *
 * Two properties carry the design. It always exits 0 with an empty stderr,
 * because it runs as a `!` preload where a non-zero exit aborts the whole
 * skill load. And the root is the repository's, never the caller's cwd, so a
 * session started in a subdirectory writes under the same `.temp/`.
 *
 * Roots are compared as real paths (`sameFile`): git prints the resolved
 * `/private/var/...` on macOS and the `C:/...` form on Windows, the temp dir
 * may be spelled either way. The directory form's `.temp/viber/handoff` does
 * not exist, so the root is cut off the printed FILE before the comparison.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run
 * directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/handoff-path.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { withGitRepo, withTempDir } from "../harness/tmp.ts";
import { slash } from "../harness/paths.ts";
import { run, parse, sameFile, stampedDir, rootOf } from "./handoff-path-fixture.ts";

test("an empty, blank or literal $0 argument is the default directory (Claude Code leaves $0 unsubstituted when the user named nothing)", async () => {
  await withGitRepo(async (repo) => {
    for (const arg of ["", "   ", "$0"]) {
      const printed = parse(await run([arg], repo.dir, repo.env));
      const dir = stampedDir(printed.file);
      assert.ok(dir.endsWith("/.temp/viber/handoff"), `${JSON.stringify(arg)} -> ${dir}`);
      assert.equal(printed.target, "default");
    }
  });
});

test("a first word that is not path-like opens the prompt: default directory, TARGET=default (a bare word like 'notes' is a prompt, not a directory)", async () => {
  await withGitRepo(async (repo) => {
    fs.mkdirSync(path.join(repo.dir, "notes"));
    for (const arg of ["notes", "focus", "C:"]) {
      const printed = parse(await run([arg], repo.dir, repo.env));
      const dir = stampedDir(printed.file);
      assert.ok(dir.endsWith("/.temp/viber/handoff"), `${JSON.stringify(arg)} -> ${dir}`);
      assert.equal(printed.target, "default");
    }
  });
});

test("a subdirectory cwd resolves the same repository root (a session started below the root must not write a second .temp/)", async () => {
  await withGitRepo(async (repo) => {
    const sub = path.join(repo.dir, "src", "deep");
    fs.mkdirSync(sub, { recursive: true });
    const fromRoot = stampedDir(parse(await run([], repo.dir, repo.env)).file);
    const fromSub = stampedDir(parse(await run([], sub, repo.env)).file);
    assert.equal(fromSub, fromRoot);
  });
});

test("a relative .md argument is that file under the root, also from a subdirectory", async () => {
  await withGitRepo(async (repo) => {
    const sub = path.join(repo.dir, "src");
    fs.mkdirSync(sub);
    for (const cwd of [repo.dir, sub]) {
      const printed = parse(await run(["docs/notes.md"], cwd, repo.env));
      assert.ok(sameFile(rootOf(printed.file, "docs/notes.md"), repo.dir));
      assert.equal(printed.exists, "false");
      assert.equal(printed.target, "named");
    }
  });
});

test("an absolute .md argument is kept as it is, separators aside", async () => {
  await withTempDir("p2p2-viber-", async (outside) => {
    await withGitRepo(async (repo) => {
      const target = path.join(outside, "handoff.md");
      const printed = parse(await run([target], repo.dir, repo.env));
      assert.equal(printed.file, slash(target));
    });
  });
});

test("a path-like argument not ending in .md is a directory: stamped placeholder inside it, never EXISTS=true even when the directory exists", async () => {
  await withGitRepo(async (repo) => {
    fs.mkdirSync(path.join(repo.dir, "notes"));
    for (const arg of ["notes/", "./notes/", "notes\\"]) {
      const printed = parse(await run([arg], repo.dir, repo.env));
      assert.ok(sameFile(rootOf(stampedDir(printed.file), "notes"), repo.dir), printed.file);
      assert.equal(printed.exists, "false");
      assert.equal(printed.target, "named");
    }
  });
});

test("an existing .md file is EXISTS=true, so the skill stops instead of overwriting it", async () => {
  await withGitRepo(async (repo) => {
    fs.writeFileSync(path.join(repo.dir, "old.md"), "kept\n");
    const printed = parse(await run(["old.md"], repo.dir, repo.env));
    assert.ok(sameFile(rootOf(printed.file, "old.md"), repo.dir));
    assert.equal(printed.exists, "true");
  });
});

test("?, *, [ and spaces pass through unchanged (no glob expansion, no word split)", async () => {
  await withGitRepo(async (repo) => {
    const rel = "a?*[b] c/n x.md";
    const printed = parse(await run([rel], repo.dir, repo.env));
    assert.ok(sameFile(rootOf(printed.file, rel), repo.dir), printed.file);
    assert.equal(printed.exists, "false");
  });
});

test("one pair of surrounding double quotes and surrounding whitespace are dropped (a user who quoted a path with a space)", async () => {
  await withGitRepo(async (repo) => {
    const printed = parse(await run([' "my notes.md" '], repo.dir, repo.env));
    assert.ok(sameFile(rootOf(printed.file, "my notes.md"), repo.dir), printed.file);
  });
});

test("a leading ./ is stripped exactly once (././x.md keeps its second ./)", async () => {
  await withGitRepo(async (repo) => {
    const once = parse(await run(["./x.md"], repo.dir, repo.env));
    assert.ok(sameFile(rootOf(once.file, "x.md"), repo.dir), once.file);
    assert.ok(!once.file.includes("/./"), once.file);

    const twice = parse(await run(["././x.md"], repo.dir, repo.env));
    assert.ok(sameFile(rootOf(twice.file, "./x.md"), repo.dir), twice.file);
  });
});

test("`.` alone is the root directory itself", async () => {
  await withGitRepo(async (repo) => {
    const printed = parse(await run(["."], repo.dir, repo.env));
    assert.ok(sameFile(stampedDir(printed.file), repo.dir), printed.file);
  });
});

test("a detached HEAD prints BRANCH=none", async () => {
  await withGitRepo(async (repo) => {
    assert.equal((await repo.git("commit", "--allow-empty", "-m", "seed")).status, 0);
    assert.equal((await repo.git("checkout", "--detach")).status, 0);
    assert.equal(parse(await run([], repo.dir, repo.env)).branch, "none");
  });
});

test("outside a repository the cwd is the root and BRANCH=none", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    const printed = parse(await run([], dir, { GIT_CEILING_DIRECTORIES: dir }));
    const stamped = stampedDir(printed.file);
    assert.ok(stamped.endsWith("/.temp/viber/handoff"), stamped);
    assert.ok(sameFile(stamped.slice(0, -"/.temp/viber/handoff".length), dir));
    assert.equal(printed.branch, "none");
  });
});

test("nothing is created: the directory is left to the writer", async () => {
  await withGitRepo(async (repo) => {
    parse(await run([], repo.dir, repo.env));
    parse(await run(["notes/x.md"], repo.dir, repo.env));
    assert.equal(fs.existsSync(path.join(repo.dir, ".temp")), false);
    assert.equal(fs.existsSync(path.join(repo.dir, "notes")), false);
  });
});
