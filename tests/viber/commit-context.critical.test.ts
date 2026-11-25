/*
 * commit-context.critical.test.ts - the critical tier of
 * viber/skills/commit/scripts/commit-context.sh, the wrapper of the commit-context.ts entry: the context block emits in
 * full for mode all, scopes status and diff to a bracketed path literally,
 * stops on a missing path, and names commit.sh under every Windows drive
 * spelling.
 *
 * A case lives here when its failure means lost user work, an open gate, a
 * break only one platform shows or a script that no longer starts; the rest
 * of the contract is proven in process by
 * tests/viber/lib/commit-context.unit.test.ts. This file runs on every operating system,
 * under the full shell matrix in CI.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run
 * directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/commit-context.critical.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { runScript } from "../harness/run.ts";
import { shellUtilsPath } from "../harness/stub.ts";
import { withGitRepo } from "../harness/tmp.ts";
import {
  SUT,
  ROOT,
  COMMIT,
  firstLine,
  runContext,
  assertBash,
  commitFile,
} from "./commit-context-fixture.ts";

test("mode 'all': Selector/branch/recent-subjects/status/diff sections all present", async () => {
  await assertBash(async (bash) => {
    await withGitRepo(async (repo) => {
      await commitFile(repo, "a.txt", "line one\n");
      fs.writeFileSync(path.join(repo.dir, "a.txt"), "line one\nline two\n");
      fs.writeFileSync(path.join(repo.dir, "untracked.txt"), "new\n");

      const result = await runContext(bash, repo);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(firstLine(result.stdout), `RUN: ${COMMIT}`);
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

test("mode missing: stdout is the one STOP line naming the missing paths, exit 0, and no diff of the whole tree follows", async () => {
  await assertBash(async (bash) => {
    await withGitRepo(async (repo) => {
      await commitFile(repo, "a.txt", "a\n");
      fs.writeFileSync(path.join(repo.dir, "a.txt"), "a, changed\n");
      const result = await runContext(bash, repo, "src/nope.ts");
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(result.stdout, "STOP: Nothing committed - paths not found: src/nope.ts\n");
    });
  });
});

const ON_WINDOWS = process.platform === "win32";
const SPELLINGS = [
  { name: "a C:\\ path", sut: SUT.replace(/\//g, "\\"), root: ROOT },
  { name: "a C:/ path", sut: SUT.replace(/\\/g, "/"), root: ROOT },
  { name: "a /c/ path", sut: `/${ROOT[0].toLowerCase()}${ROOT.slice(2)}/skills/commit/scripts/commit-context.sh`, root: ROOT },
];

for (const row of SPELLINGS) {
  test(`invoked by ${row.name}, the RUN: line names commit.sh under ${row.root} (the MSYS runtime hands node the C:/ form of a /c/ path)`, { skip: ON_WINDOWS ? false : "the drive spellings exist only on Windows" }, async () => {
    await assertBash(async (bash) => {
      await withGitRepo(async (repo) => {
        const result = await runScript(row.sut, [], { shell: bash, cwd: repo.dir, env: repo.env });
        assert.equal(result.status, 0, `stderr: ${result.stderr}`);
        assert.equal(firstLine(result.stdout), `RUN: "${row.root}/skills/commit/scripts/commit.sh" "<message>"`);
      });
    });
  });
}

test("with no node on PATH the one line is a STOP: and the exit 0 (a preload never aborts the skill load, and the fork commits on no directive)", async () => {
  await assertBash(async (bash) => {
    await withGitRepo(async (repo) => {
      const result = await runScript(SUT, [], { shell: bash, cwd: repo.dir, env: { ...repo.env, PATH: shellUtilsPath() } });
      assert.equal(result.status, 0);
      assert.match(result.stdout, /^STOP: Nothing committed - node .*\n$/);
    });
  });
});

/** SKILL.md's preload line after the substitution Claude Code does before any shell runs: the argument text replaces `$ARGUMENTS` verbatim, then `${CLAUDE_PLUGIN_ROOT}` becomes the plugin root. */
function preload(args: string): string {
  const block = /```!\n([\s\S]*?)\n```/.exec(fs.readFileSync(path.join(ROOT, "skills/commit/SKILL.md"), "utf-8"));
  assert.ok(block, "SKILL.md must carry a fenced ! block");
  assert.equal(block[1], '"${CLAUDE_PLUGIN_ROOT}/skills/commit/scripts/commit-context.sh" \'$ARGUMENTS\'');
  return block[1].split("$ARGUMENTS").join(args).split("${CLAUDE_PLUGIN_ROOT}").join(ROOT);
}

test("the substituted SKILL.md preload line hands the script $, backticks, parentheses and spaces verbatim", async () => {
  await assertBash(async (bash) => {
    await withGitRepo(async (repo) => {
      const name = "odd $HOME `x` (1).txt";
      await commitFile(repo, name, "new\n");
      const script = path.join(repo.dir, ".git", "preload.sh");
      fs.writeFileSync(script, `#!/usr/bin/env bash\n${preload(`${name} #42`)}\n`, { mode: 0o755 });
      const result = await runScript(script, [], { shell: bash, cwd: repo.dir, env: repo.env });
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(firstLine(result.stdout), `RUN: ${COMMIT} '${name}'`);
      assert.match(result.stdout, /^Refs: #42$/m);
    });
  });
});
