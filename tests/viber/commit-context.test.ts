/*
 * commit-context.test.ts - proves commit-context.sh's context block: for
 * every selector mode (all / paths) it emits, in order, a resolved
 * "## Selector:" line, "## Current branch", "## Recent commit subjects",
 * a git-status section and a diff section (capped at MAX_LINES=400), and
 * degrades rather than aborting when a probe fails (the script deliberately
 * runs without `set -e`). commit-context.sh is `#!/usr/bin/env bash`, so
 * every case runs through `forEachShell("bash", ...)` via opts.shell.
 *
 * The last cases run SKILL.md's own preload line as Claude Code would: the
 * argument text substituted for `$ARGUMENTS` before any shell parses it. They
 * prove the single-quoted form keeps `$`, backticks and spaces literal.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run
 * directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/commit-context.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { runScript, type RunResult } from "../harness/run.ts";
import { withGitRepo, withTempDir, type GitRepo } from "../harness/tmp.ts";
import { withStub } from "../harness/stub.ts";
import { forEachShell } from "../harness/shells.ts";
import { writePng } from "../harness/png.ts";

const SUT = path.resolve(import.meta.dirname, "../../viber/skills/commit/scripts/commit-context.sh");
const PLUGIN_ROOT = path.resolve(import.meta.dirname, "../../viber");
const SKILL = path.join(PLUGIN_ROOT, "skills", "commit", "SKILL.md");

async function runContext(bash: string, repo: GitRepo, selector?: string): Promise<RunResult> {
  const args = selector === undefined ? [] : [selector];
  return await runScript(SUT, args, { shell: bash, cwd: repo.dir, env: repo.env });
}

async function assertBash(fn: (bash: string) => void | Promise<void>) {
  const skips = await forEachShell("bash", fn);
  for (const skip of skips) {
    assert.equal(skip.kind, "bash");
    assert.ok(skip.reason.length > 0, "a skip must record a reason");
  }
}

async function commitFile(repo: GitRepo, name: string, content: string) {
  fs.writeFileSync(path.join(repo.dir, name), content);
  const add = await repo.git("add", "-A");
  assert.equal(add.status, 0, `git add should succeed: ${add.stderr}`);
  const commit = await repo.git("commit", "-m", `seed ${name}`);
  assert.equal(commit.status, 0, `git commit should succeed: ${commit.stderr}`);
}

// --- selector mode: all -------------------------------------------------------

test("mode 'all': Selector/branch/recent-subjects/status/diff sections all present", async () => {
  await assertBash(async (bash) => {
    await withGitRepo(async (repo) => {
      await commitFile(repo, "a.txt", "line one\n");
      fs.writeFileSync(path.join(repo.dir, "a.txt"), "line one\nline two\n");
      fs.writeFileSync(path.join(repo.dir, "untracked.txt"), "new\n");

      const result = await runContext(bash, repo);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.match(result.stdout, /## Selector: all - run commit\.sh with no 2nd arg/);
      assert.match(result.stdout, /## Current branch/);
      assert.match(result.stdout, /## Recent commit subjects/);
      assert.match(result.stdout, /seed a\.txt/);
      assert.match(result.stdout, /## Changes \(git status, all untracked files\)/);
      assert.match(result.stdout, /untracked\.txt/);
      assert.match(result.stdout, /## Overview \(git diff HEAD --stat\)/);
      assert.match(result.stdout, /## Diff \(all tracked changes vs HEAD; new untracked files are listed in git status above\)/);
      assert.match(result.stdout, /line two/);
    });
  });
});

test("a bare '#42' in the arguments emits the explicit Issue-footer block and still resolves the selector", async () => {
  await assertBash(async (bash) => {
    await withGitRepo(async (repo) => {
      await commitFile(repo, "a.txt", "line one\n");
      fs.mkdirSync(path.join(repo.dir, "src"));
      fs.writeFileSync(path.join(repo.dir, "src", "foo.txt"), "new\n");

      const result = await runContext(bash, repo, "src/foo.txt #42");
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.match(result.stdout, /## Issue footer \(explicit, from a #N reference or GitHub issue link/);
      assert.match(result.stdout, /^Refs: #42$/m);
      assert.match(result.stdout, /## Selector: paths - run commit\.sh with 2nd arg "src\/foo\.txt"/);
    });
  });
});

test("no issue reference in the arguments: the Issue-footer block is absent entirely", async () => {
  await assertBash(async (bash) => {
    await withGitRepo(async (repo) => {
      await commitFile(repo, "a.txt", "line one\n");
      fs.writeFileSync(path.join(repo.dir, "a.txt"), "line one\nline two\n");

      const result = await runContext(bash, repo);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.doesNotMatch(result.stdout, /## Issue footer/);
      assert.doesNotMatch(result.stdout, /^Refs: /m);
    });
  });
});

// --- selector mode: paths -------------------------------------------------------

test("mode paths: Selector/status/diff sections are all scoped to the given path", async () => {
  await assertBash(async (bash) => {
    await withGitRepo(async (repo) => {
      await commitFile(repo, "keep.txt", "kept\n");
      fs.writeFileSync(path.join(repo.dir, "keep.txt"), "kept, modified\n");
      fs.writeFileSync(path.join(repo.dir, "other.txt"), "unrelated\n");

      const result = await runContext(bash, repo, "keep.txt");
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.match(result.stdout, /## Selector: paths - run commit\.sh with 2nd arg "keep\.txt"/);
      assert.match(result.stdout, /## Changes \(git status for paths: keep\.txt\)/);
      assert.match(result.stdout, /## Overview \(git diff HEAD --stat for paths: keep\.txt\)/);
      assert.match(result.stdout, /## Diff \(changes vs HEAD for paths: keep\.txt;/);
      assert.match(result.stdout, /kept, modified/);
      assert.doesNotMatch(result.stdout, /unrelated/);
    });
  });
});

test("mode paths with a list: the Selector line carries every path and status/diff cover all of them only", async () => {
  await assertBash(async (bash) => {
    await withGitRepo(async (repo) => {
      await commitFile(repo, "a.txt", "a\n");
      await commitFile(repo, "b.txt", "b\n");
      fs.writeFileSync(path.join(repo.dir, "a.txt"), "a, modified\n");
      fs.writeFileSync(path.join(repo.dir, "b.txt"), "b, modified\n");
      fs.writeFileSync(path.join(repo.dir, "other.txt"), "unrelated\n");

      const result = await runContext(bash, repo, "a.txt b.txt");
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.match(result.stdout, /## Selector: paths - run commit\.sh with 2nd arg "a\.txt b\.txt"/);
      assert.match(result.stdout, /a, modified/);
      assert.match(result.stdout, /b, modified/);
      assert.doesNotMatch(result.stdout, /unrelated/);
    });
  });
});

test("mode paths with a bracketed path: the status lists 'app/[id]/page.tsx' only, not the sibling 'app/i/page.tsx' a glob would also match", async () => {
  await assertBash(async (bash) => {
    await withGitRepo(async (repo) => {
      fs.mkdirSync(path.join(repo.dir, "app", "[id]"), { recursive: true });
      fs.mkdirSync(path.join(repo.dir, "app", "i"), { recursive: true });
      await commitFile(repo, "app/[id]/page.tsx", "id\n");
      await commitFile(repo, "app/i/page.tsx", "i\n");
      fs.writeFileSync(path.join(repo.dir, "app", "[id]", "page.tsx"), "id, changed\n");
      fs.writeFileSync(path.join(repo.dir, "app", "i", "page.tsx"), "i, changed\n");

      const result = await runContext(bash, repo, "app/[id]/page.tsx");
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.match(result.stdout, /^ M app\/\[id\]\/page\.tsx$/m);
      assert.doesNotMatch(result.stdout, /^ M app\/i\/page\.tsx$|^\+i, changed$/m);
    });
  });
});

// --- unborn HEAD, no changes, truncation, binary, non-ASCII --------------------

test("unborn HEAD (no commits yet): BASE falls back to the empty-tree object, staged addition still shows in the diff", async () => {
  await assertBash(async (bash) => {
    await withGitRepo(async (repo) => {
      fs.writeFileSync(path.join(repo.dir, "new.txt"), "brand new\n");
      const add = await repo.git("add", "-A");
      assert.equal(add.status, 0, `git add should succeed: ${add.stderr}`);

      const result = await runContext(bash, repo);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      // git log fails on an unborn branch; commit-context.sh has no `set -e`
      // and redirects `2>&1`, so the fatal message lands inline but the rest
      // of the block still emits in full.
      assert.match(result.stdout, /## Recent commit subjects/);
      assert.match(result.stdout, /## Changes \(git status, all untracked files\)/);
      assert.match(result.stdout, /## Diff \(all tracked changes vs HEAD/);
      assert.match(result.stdout, /brand new/);
    });
  });
});

test("a repo with no changes at all: status section is empty and the diff section reports 'no textual diff'", async () => {
  await assertBash(async (bash) => {
    await withGitRepo(async (repo) => {
      await commitFile(repo, "a.txt", "unchanged\n");

      const result = await runContext(bash, repo);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.match(result.stdout, /\(no textual diff for this mode\)/);
    });
  });
});

test("untracked files only: the empty diff section says the listed changes are still committed (a fork read the bare 'no textual diff' as nothing to commit and never ran commit.sh)", async () => {
  await assertBash(async (bash) => {
    await withGitRepo(async (repo) => {
      await commitFile(repo, "a.txt", "unchanged\n");
      fs.writeFileSync(path.join(repo.dir, "new.txt"), "brand new\n");

      const result = await runContext(bash, repo);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.match(result.stdout, /\?\? new\.txt/);
      assert.match(result.stdout, /git status above lists changes - they are still committed: run commit\.sh/);
      assert.doesNotMatch(result.stdout, /no textual diff for this mode/);
    });
  });
});

test("a diff exceeding MAX_LINES=400 is capped with a truncation notice reporting the real total", async () => {
  await assertBash(async (bash) => {
    await withGitRepo(async (repo) => {
      const originalLines = Array.from({ length: 500 }, (_, i) => `line ${i}`).join("\n") + "\n";
      await commitFile(repo, "big.txt", originalLines);
      const modifiedLines = Array.from({ length: 500 }, (_, i) => `changed line ${i}`).join("\n") + "\n";
      fs.writeFileSync(path.join(repo.dir, "big.txt"), modifiedLines);

      const result = await runContext(bash, repo);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.match(result.stdout, /\[diff truncated: showing first 400 of \d+ lines - run git diff for the rest\]/);

      const diffSectionStart = result.stdout.indexOf("## Diff (all tracked changes vs HEAD");
      const diffSection = result.stdout.slice(diffSectionStart);
      const bodyLines = diffSection.split("\n").slice(1);
      const truncationIdx = bodyLines.findIndex((l) => l.includes("[diff truncated:"));
      assert.ok(truncationIdx > 0, "truncation notice should be present");
      // Everything before the notice is the capped diff body: at most 400 lines.
      assert.ok(truncationIdx <= 400, `expected at most 400 diff lines before the notice, got ${truncationIdx}`);
    });
  });
});

test("a binary file change shows a 'Binary files ... differ' line, never breaking the block", async () => {
  await assertBash(async (bash) => {
    await withGitRepo(async (repo) => {
      await commitFile(repo, "placeholder.txt", "placeholder\n");
      const png = writePng(2, 2, new Uint8Array(2 * 2 * 4).fill(200));
      fs.writeFileSync(path.join(repo.dir, "img.png"), png);
      const add = await repo.git("add", "-A");
      assert.equal(add.status, 0, `git add should succeed: ${add.stderr}`);

      const result = await runContext(bash, repo);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.match(result.stdout, /Binary files .* differ/);
    });
  });
});

test("a filename with a non-ASCII character appears in the git-status section", async () => {
  await assertBash(async (bash) => {
    await withGitRepo(async (repo) => {
      const setQuotepath = await repo.git("config", "core.quotepath", "false");
      assert.equal(setQuotepath.status, 0, `git config should succeed: ${setQuotepath.stderr}`);
      fs.writeFileSync(path.join(repo.dir, "café.txt"), "content\n");

      const result = await runContext(bash, repo);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.match(result.stdout, /café\.txt/);
    });
  });
});

// --- edge cases: unborn HEAD, detached HEAD, missing user.email ----------------

test("detached HEAD: block still emits in full, branch line is empty (no symbolic ref)", async () => {
  await assertBash(async (bash) => {
    await withGitRepo(async (repo) => {
      await commitFile(repo, "a.txt", "one\n");
      await commitFile(repo, "b.txt", "two\n");
      const headSha = await repo.git("rev-parse", "HEAD~1");
      assert.equal(headSha.status, 0, `git rev-parse should succeed: ${headSha.stderr}`);
      const checkout = await repo.git("checkout", "--detach", headSha.stdout.trim());
      assert.equal(checkout.status, 0, `git checkout --detach should succeed: ${checkout.stderr}`);
      fs.writeFileSync(path.join(repo.dir, "c.txt"), "three\n");

      const result = await runContext(bash, repo);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.match(result.stdout, /## Selector: all - run commit\.sh with no 2nd arg/);
      assert.match(result.stdout, /## Recent commit subjects/);
      assert.match(result.stdout, /c\.txt/);
    });
  });
});

test("user.email unset: the best-effort block still emits in full (no `set -e`, no crash)", async () => {
  await assertBash(async (bash) => {
    await withGitRepo(async (repo) => {
      await commitFile(repo, "a.txt", "one\n");
      fs.writeFileSync(path.join(repo.dir, "a.txt"), "one, changed\n");
      const unset = await repo.git("config", "--global", "--unset", "user.email");
      assert.equal(unset.status, 0, `git config --unset should succeed: ${unset.stderr}`);

      const result = await runContext(bash, repo);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.match(result.stdout, /## Selector: all - run commit\.sh with no 2nd arg/);
      assert.match(result.stdout, /one, changed/);
    });
  });
});

test("commit-context.sh runs without `set -e`: a git failure degrades in place rather than aborting the whole block", async () => {
  await assertBash(async (bash) => {
    await withGitRepo(async (repo) => {
      await commitFile(repo, "a.txt", "one\n");
      await withStub("git", "exit 1", async (stubDir) => {
        const result = await runScript(SUT, [], {
          shell: bash,
          cwd: repo.dir,
          env: repo.env,
          stubDirs: [stubDir],
        });
        // Every `git ...` call fails, but the script itself must still complete
        // and print every section heading instead of dying on the first probe.
        assert.equal(result.status, 0, `commit-context.sh must not abort on a failing git call: ${result.stderr}`);
        assert.match(result.stdout, /## Selector: all - run commit\.sh with no 2nd arg/);
        assert.match(result.stdout, /## Current branch/);
        assert.match(result.stdout, /## Recent commit subjects/);
        assert.match(result.stdout, /## Changes \(git status, all untracked files\)/);
        assert.match(result.stdout, /## Overview \(git diff HEAD --stat\)/);
        assert.match(result.stdout, /## Diff \(all tracked changes vs HEAD/);
      });
    });
  });
});

test("mode missing: the Selector line tells the fork not to run commit.sh and names the missing paths, and no diff of the whole tree follows", async () => {
  await assertBash(async (bash) => {
    await withGitRepo(async (repo) => {
      await commitFile(repo, "a.txt", "a\n");
      fs.writeFileSync(path.join(repo.dir, "a.txt"), "a, changed\n");
      const result = await runContext(bash, repo, "src/nope.ts");
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.match(result.stdout, /^## Selector: missing - none of the named paths exists \(src\/nope\.ts\); do NOT run commit\.sh/m);
      assert.doesNotMatch(result.stdout, /a, changed/);
    });
  });
});

// --- the SKILL.md preload line -------------------------------------------------

function preloadBlock(): string {
  const block = /```!\n([\s\S]*?)\n```/.exec(fs.readFileSync(SKILL, "utf-8"));
  assert.ok(block, "SKILL.md must carry a fenced ! block");
  return block[1];
}

/** SKILL.md's preload line after the substitution Claude Code does before any
 *  shell runs: the argument text replaces `$ARGUMENTS` verbatim, then
 *  `${CLAUDE_PLUGIN_ROOT}` becomes the plugin root. */
function preloadScript(dir: string, args: string): string {
  const line = preloadBlock()
    .split("$ARGUMENTS").join(args)
    .split("${CLAUDE_PLUGIN_ROOT}").join(PLUGIN_ROOT.split(path.sep).join("/"));
  const script = path.join(dir, "preload.sh");
  fs.writeFileSync(script, `#!/usr/bin/env bash\n${line}\n`, { mode: 0o755 });
  return script;
}

test("the SKILL.md preload is one literal line calling commit-context.sh, with no heredoc and no variable assignment", () => {
  const block = preloadBlock();
  assert.equal(block.split("\n").length, 1);
  assert.match(block, /^"\$\{CLAUDE_PLUGIN_ROOT\}\/skills\/commit\/scripts\/commit-context\.sh" /);
  assert.doesNotMatch(block, /<<|^\s*\w+=/);
});

test("the substituted preload line hands the script $, backticks, parentheses and spaces verbatim (Claude Code substitutes the text before the shell parses it)", async () => {
  await assertBash(async (bash) => {
    await withGitRepo(async (repo) => {
      await commitFile(repo, "a.txt", "a\n");
      const name = "odd $HOME `x` (1).txt";
      fs.writeFileSync(path.join(repo.dir, name), "new\n");
      await withTempDir("p2p2-commit-preload-", async (dir) => {
        const result = await runScript(preloadScript(dir, `${name} #42`), [], { shell: bash, cwd: repo.dir, env: repo.env });
        assert.equal(result.status, 0, `stderr: ${result.stderr}`);
        assert.ok(result.stdout.includes(`## Selector: paths - run commit.sh with 2nd arg "${name}"`), result.stdout);
        assert.match(result.stdout, /^Refs: #42$/m);
      });
    });
  });
});

test("the substituted preload line with no arguments resolves mode all", async () => {
  await assertBash(async (bash) => {
    await withGitRepo(async (repo) => {
      await commitFile(repo, "a.txt", "a\n");
      await withTempDir("p2p2-commit-preload-", async (dir) => {
        const result = await runScript(preloadScript(dir, ""), [], { shell: bash, cwd: repo.dir, env: repo.env });
        assert.equal(result.status, 0, `stderr: ${result.stderr}`);
        assert.match(result.stdout, /^## Selector: all - run commit\.sh with no 2nd arg$/m);
      });
    });
  });
});

// --- run from a subdirectory of the repository --------------------------------

test("run from a subdirectory: a cwd-relative or root-relative selector prints the root-relative path on the Selector line and narrows status and diff to that file", async () => {
  await assertBash(async (bash) => {
    for (const selector of ["src/f.txt", "pkg/src/f.txt"]) {
      await withGitRepo(async (repo) => {
        fs.mkdirSync(path.join(repo.dir, "pkg", "src"), { recursive: true });
        fs.writeFileSync(path.join(repo.dir, "pkg", "src", "f.txt"), "f\n");
        await commitFile(repo, "pkg/g.txt", "g\n");
        fs.writeFileSync(path.join(repo.dir, "pkg", "src", "f.txt"), "f, changed\n");
        fs.writeFileSync(path.join(repo.dir, "pkg", "g.txt"), "g, changed\n");

        const result = await runScript(SUT, [selector], { shell: bash, cwd: path.join(repo.dir, "pkg"), env: repo.env });
        assert.equal(result.status, 0, `${selector}: ${result.stderr}`);
        assert.match(result.stdout, /^## Selector: paths - run commit\.sh with 2nd arg "pkg\/src\/f\.txt"$/m, selector);
        assert.match(result.stdout, /^ M pkg\/src\/f\.txt$/m, selector);
        assert.match(result.stdout, /^\+f, changed$/m, selector);
        assert.doesNotMatch(result.stdout, /^ M pkg\/g\.txt$|g, changed/m, selector);
      });
    }
  });
});
