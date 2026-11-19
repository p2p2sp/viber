/*
 * commit-args.test.ts - proves commit-args.sh's `resolve_commit_selector <raw>`
 * contract: it is a library meant to be SOURCED (not executed), so every case
 * here drives it through a tiny bash wrapper that sources it, calls
 * `enter_repo_root` and `resolve_commit_selector "$1"` the way both callers do, and prints COMMIT_MODE / COMMIT_PATHS (joined
 * with "|") / COMMIT_ISSUE_REFS, one per line. commit-args.sh is `#!/usr/bin/env bash`
 * and uses bash-only constructs (BASH_REMATCH, [[ ]]), so every case runs
 * under `forEachShell("bash", ...)` - never a POSIX shell.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run
 * directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/commit-args.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { withGitRepo, withTempDir } from "../harness/tmp.ts";
import { slash } from "../harness/paths.ts";
import { resolve, assertBash } from "./commit-args-fixture.ts";

// --- selector resolution ------------------------------------------------------

test("empty input resolves to mode 'all' with no path", async () => {
  await assertBash(async (bash) => {
    await withTempDir("p2p2-commit-args-", async (dir) => {
      const sel = await resolve(bash, dir, "");
      assert.deepEqual(sel, { mode: "all", path: "", issueRefs: "" });
    });
  });
});

test("'staged' is no longer a keyword: with no such path it falls back to mode 'all'", async () => {
  await assertBash(async (bash) => {
    await withTempDir("p2p2-commit-args-", async (dir) => {
      const sel = await resolve(bash, dir, "staged");
      assert.deepEqual(sel, { mode: "all", path: "", issueRefs: "" });
    });
  });
});

test("prose that happens to hold no path-shaped token still falls back to mode 'all', while one existing path among missing ones stays mode 'paths'", async () => {
  await assertBash(async (bash) => {
    await withTempDir("p2p2-commit-args-", async (dir) => {
      fs.writeFileSync(path.join(dir, "a.txt"), "a\n");
      assert.equal((await resolve(bash, dir, "update the docs")).mode, "all");
      assert.deepEqual(await resolve(bash, dir, "a.txt src/gone.ts"), { mode: "paths", path: "a.txt", issueRefs: "" });
    });
  });
});

test("an existing path named 'all' resolves to mode 'paths' - existing path wins over the keyword", async () => {
  await assertBash(async (bash) => {
    await withTempDir("p2p2-commit-args-", async (dir) => {
      fs.writeFileSync(path.join(dir, "all"), "content\n");
      const sel = await resolve(bash, dir, "all");
      assert.deepEqual(sel, { mode: "paths", path: "all", issueRefs: "" });
    });
  });
});

test("a single issue URL is stripped before selector resolution, leaving mode 'all'", async () => {
  await assertBash(async (bash) => {
    await withTempDir("p2p2-commit-args-", async (dir) => {
      const sel = await resolve(bash, dir, "https://github.com/owner/repo/issues/42");
      assert.deepEqual(sel, { mode: "all", path: "", issueRefs: "42" });
    });
  });
});

test("several issue URLs are all stripped, unique and in order of appearance", async () => {
  await assertBash(async (bash) => {
    await withTempDir("p2p2-commit-args-", async (dir) => {
      const raw = "https://github.com/owner/repo/issues/42 https://github.com/owner/repo/issues/7";
      const sel = await resolve(bash, dir, raw);
      assert.deepEqual(sel, { mode: "all", path: "", issueRefs: "42 7" });
    });
  });
});

test("a repeated issue URL is deduplicated to one reference", async () => {
  await assertBash(async (bash) => {
    await withTempDir("p2p2-commit-args-", async (dir) => {
      const raw = "https://github.com/owner/repo/issues/42 https://github.com/owner/repo/issues/42";
      const sel = await resolve(bash, dir, raw);
      assert.deepEqual(sel, { mode: "all", path: "", issueRefs: "42" });
    });
  });
});

test("an issue URL plus an existing path resolves to mode 'paths' with the issue ref captured separately", async () => {
  await assertBash(async (bash) => {
    await withTempDir("p2p2-commit-args-", async (dir) => {
      fs.mkdirSync(path.join(dir, "src"));
      fs.writeFileSync(path.join(dir, "src", "foo"), "content\n");
      const raw = "src/foo https://github.com/owner/repo/issues/42";
      const sel = await resolve(bash, dir, raw);
      assert.deepEqual(sel, { mode: "paths", path: "src/foo", issueRefs: "42" });
    });
  });
});

test("a bare '#42' reference is stripped before selector resolution, leaving mode 'all'", async () => {
  await assertBash(async (bash) => {
    await withTempDir("p2p2-commit-args-", async (dir) => {
      const sel = await resolve(bash, dir, "#42");
      assert.deepEqual(sel, { mode: "all", path: "", issueRefs: "42" });
    });
  });
});

test("several bare references are all stripped, unique and in order of appearance", async () => {
  await assertBash(async (bash) => {
    await withTempDir("p2p2-commit-args-", async (dir) => {
      const sel = await resolve(bash, dir, "#42 #7 #42");
      assert.deepEqual(sel, { mode: "all", path: "", issueRefs: "42 7" });
    });
  });
});

test("a bare reference next to punctuation is still recognised", async () => {
  await assertBash(async (bash) => {
    await withTempDir("p2p2-commit-args-", async (dir) => {
      const sel = await resolve(bash, dir, "(#42,#7)");
      assert.deepEqual(sel, { mode: "all", path: "", issueRefs: "42 7" });
    });
  });
});

test("a bare reference plus an existing path resolves to mode 'paths' with the ref captured separately", async () => {
  await assertBash(async (bash) => {
    await withTempDir("p2p2-commit-args-", async (dir) => {
      fs.mkdirSync(path.join(dir, "src"));
      fs.writeFileSync(path.join(dir, "src", "foo"), "content\n");
      const sel = await resolve(bash, dir, "src/foo #42");
      assert.deepEqual(sel, { mode: "paths", path: "src/foo", issueRefs: "42" });
    });
  });
});

test("an existing path holding '#12' resolves to mode 'paths' with that path and no reference (the reference cut used to mangle it)", async () => {
  await assertBash(async (bash) => {
    await withTempDir("p2p2-commit-args-", async (dir) => {
      fs.mkdirSync(path.join(dir, "bugs"));
      fs.writeFileSync(path.join(dir, "bugs", "#12.md"), "bug\n");
      const sel = await resolve(bash, dir, "bugs/#12.md");
      assert.deepEqual(sel, { mode: "paths", path: "bugs/#12.md", issueRefs: "" });
    });
  });
});

test("a whitespace token that is an existing path holding '#12' stays a path beside a bare reference, which is still cut", async () => {
  await assertBash(async (bash) => {
    await withTempDir("p2p2-commit-args-", async (dir) => {
      fs.mkdirSync(path.join(dir, "bugs"));
      fs.writeFileSync(path.join(dir, "bugs", "#12.md"), "bug\n");
      fs.writeFileSync(path.join(dir, "a.txt"), "a\n");
      const sel = await resolve(bash, dir, "a.txt bugs/#12.md #5");
      assert.deepEqual(sel, { mode: "paths", path: "a.txt|bugs/#12.md", issueRefs: "5" });
    });
  });
});

test("a path-shaped token holding '#12' that does not exist resolves to mode 'missing' (the cut removes only the '#12', so the rest stays path-shaped)", async () => {
  await assertBash(async (bash) => {
    await withTempDir("p2p2-commit-args-", async (dir) => {
      const sel = await resolve(bash, dir, "bugs/#12.md");
      assert.equal(sel.mode, "missing");
    });
  });
});

test("an issue URL and a bare reference combine into one deduplicated ref list", async () => {
  await assertBash(async (bash) => {
    await withTempDir("p2p2-commit-args-", async (dir) => {
      const raw = "https://github.com/owner/repo/issues/42 #7 #42";
      const sel = await resolve(bash, dir, raw);
      assert.deepEqual(sel, { mode: "all", path: "", issueRefs: "42 7" });
    });
  });
});

test("a '#' token that is not a bare issue number yields no reference", async () => {
  await assertBash(async (bash) => {
    await withTempDir("p2p2-commit-args-", async (dir) => {
      // hex colour, alnum suffix and a bare '#' - none of them is an issue number
      const sel = await resolve(bash, dir, "#1a2b3c #42abc #");
      assert.deepEqual(sel, { mode: "all", path: "", issueRefs: "" });
    });
  });
});

test("a URL fragment after the issue number does not leak a second reference", async () => {
  await assertBash(async (bash) => {
    await withTempDir("p2p2-commit-args-", async (dir) => {
      const raw = "https://github.com/owner/repo/issues/42#issuecomment-99";
      const sel = await resolve(bash, dir, raw);
      assert.deepEqual(sel, { mode: "all", path: "", issueRefs: "42" });
    });
  });
});

test("a path containing a space resolves to mode 'paths' with the space preserved verbatim", async () => {
  await assertBash(async (bash) => {
    await withTempDir("p2p2-commit-args-", async (dir) => {
      fs.writeFileSync(path.join(dir, "my file.txt"), "content\n");
      const sel = await resolve(bash, dir, "my file.txt");
      assert.deepEqual(sel, { mode: "paths", path: "my file.txt", issueRefs: "" });
    });
  });
});

test("several space-separated existing paths resolve to mode 'paths' with every path kept in order", async () => {
  await assertBash(async (bash) => {
    await withTempDir("p2p2-commit-args-", async (dir) => {
      fs.writeFileSync(path.join(dir, "a.txt"), "a\n");
      fs.mkdirSync(path.join(dir, "src"));
      const sel = await resolve(bash, dir, "a.txt src");
      assert.deepEqual(sel, { mode: "paths", path: "a.txt|src", issueRefs: "" });
    });
  });
});

test("a comma-separated list is split like a space-separated one", async () => {
  await assertBash(async (bash) => {
    await withTempDir("p2p2-commit-args-", async (dir) => {
      fs.writeFileSync(path.join(dir, "a.txt"), "a\n");
      fs.writeFileSync(path.join(dir, "b.txt"), "b\n");
      const sel = await resolve(bash, dir, "a.txt, b.txt");
      assert.deepEqual(sel, { mode: "paths", path: "a.txt|b.txt", issueRefs: "" });
    });
  });
});

test("a list mixing existing and missing paths keeps only the existing ones", async () => {
  await assertBash(async (bash) => {
    await withTempDir("p2p2-commit-args-", async (dir) => {
      fs.writeFileSync(path.join(dir, "a.txt"), "a\n");
      const sel = await resolve(bash, dir, "a.txt missing.txt #7");
      assert.deepEqual(sel, { mode: "paths", path: "a.txt", issueRefs: "7" });
    });
  });
});

test("a list with no existing path falls back to mode 'all' (a prose description is not a selector)", async () => {
  await assertBash(async (bash) => {
    await withTempDir("p2p2-commit-args-", async (dir) => {
      const sel = await resolve(bash, dir, "fix the manifest wording");
      assert.deepEqual(sel, { mode: "all", path: "", issueRefs: "" });
    });
  });
});

// --- run from a subdirectory of the repository --------------------------------

test("run from a subdirectory: a cwd-relative, a root-relative and an absolute path all resolve, the relative ones to the root-relative form", async () => {
  await assertBash(async (bash) => {
    await withGitRepo(async (repo) => {
      fs.mkdirSync(path.join(repo.dir, "pkg", "src"), { recursive: true });
      fs.writeFileSync(path.join(repo.dir, "pkg", "src", "f.txt"), "f\n");
      const abs = slash(path.join(fs.realpathSync.native(repo.dir), "pkg", "src", "f.txt"));
      const drive = /^([A-Za-z]):\//.exec(abs);
      const cases: Array<[raw: string, resolved: string]> = [
        ["src/f.txt", "pkg/src/f.txt"],
        ["./src/f.txt", "pkg/src/f.txt"],
        ["pkg/src/f.txt", "pkg/src/f.txt"],
        [abs, abs],
        ...(drive ? [[`/${drive[1].toLowerCase()}${abs.slice(2)}`, `/${drive[1].toLowerCase()}${abs.slice(2)}`] as [string, string]] : []),
        ["src/f.txt, pkg/src/f.txt", "pkg/src/f.txt|pkg/src/f.txt"],
      ];
      for (const [raw, resolved] of cases) {
        const sel = await resolve(bash, path.join(repo.dir, "pkg"), raw);
        assert.deepEqual(sel, { mode: "paths", path: resolved, issueRefs: "" }, raw);
      }
    });
  });
});

test("run from a subdirectory: a path that exists under neither the cwd nor the root resolves to mode missing (the root fallback must not widen the commit)", async () => {
  await assertBash(async (bash) => {
    await withGitRepo(async (repo) => {
      fs.mkdirSync(path.join(repo.dir, "pkg"), { recursive: true });
      const sel = await resolve(bash, path.join(repo.dir, "pkg"), "src/nothing.txt");
      assert.deepEqual(sel, { mode: "missing", path: "", issueRefs: "" });
    });
  });
});
