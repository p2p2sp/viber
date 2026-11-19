/*
 * memory-map.critical.test.ts - the critical tier of
 * viber/skills/memory/scripts/memory-map.sh: a tracked root node prints its
 * map line, reset deletes the given nodes in order and refuses the whole call
 * when one target is modified, and backslash directory names and Windows
 * invocation spellings are handled.
 *
 * A case lives here when its failure means lost user work, an open gate, a
 * break only one platform shows or a script that no longer starts; the rest
 * of the contract is proven by memory-map.test.ts. This file runs on every
 * operating system, under the full shell matrix in CI.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run
 * directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/memory-map.critical.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { runScript } from "../harness/run.ts";
import { withGitRepo } from "../harness/tmp.ts";
import { SUT, run, lines, write, commit, pick, node, MAP_ID, present } from "./memory-map-fixture.ts";

test("a tracked root CLAUDE.md is one node line carrying its own and its chain's character count", async () => {
  await withGitRepo(async (repo) => {
    await commit(repo, { "CLAUDE.md": `${"x".repeat(99)}\n`, "README.md": "readme\n" });

    const result = await run(repo);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    const out = lines(result.stdout);
    assert.deepEqual(pick(out, "node:"), ["node: CLAUDE.md 100 chain 100 ok"]);
    assert.deepEqual(pick(out, "total:"), ["total: nodes 1"]);
  });
});

test("a node whose directory name holds a backslash is no orphan when four other files are tracked beside it, like the same layout under a plain name (awk -v would read the backslash as an escape)", async () => {
  await withGitRepo(async (repo) => {
    const files: Record<string, string> = {};
    for (const dir of ["we\\tird", "plain"]) {
      files[`${dir}/CLAUDE.md`] = node(40);
      for (const name of ["a.ts", "b.ts", "c.ts", "d.ts"]) files[`${dir}/${name}`] = "export const a = 1;\n";
    }
    await commit(repo, files);

    const result = await run(repo);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.deepEqual(pick(lines(result.stdout), "orphan:"), []);
  });
});

test("--reset deletes every node it is given, in the order it was given them", async () => {
  await withGitRepo(async (repo) => {
    await commit(repo, {
      "CLAUDE.md": node(40),
      "docs/CLAUDE.md": node(40),
      "docs/guide.md": "x\n",
    });

    const result = await run(repo, ["--reset", "docs/CLAUDE.md", "CLAUDE.md"]);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.deepEqual(lines(result.stdout), [
      "removed: docs/CLAUDE.md",
      "removed: CLAUDE.md",
      "removed: 2",
    ]);
    assert.equal(fs.existsSync(path.join(repo.dir, "CLAUDE.md")), false);
    assert.equal(fs.existsSync(path.join(repo.dir, "docs/CLAUDE.md")), false);
  });
});

test("one modified target among several refuses the whole --reset and deletes nothing", async () => {
  await withGitRepo(async (repo) => {
    await commit(repo, {
      "CLAUDE.md": node(40),
      "a/CLAUDE.md": node(40),
      "b/CLAUDE.md": node(40),
    });
    write(repo, { "b/CLAUDE.md": node(60) });

    const result = await run(repo, ["--reset", "CLAUDE.md", "a/CLAUDE.md", "b/CLAUDE.md"]);

    assert.equal(result.status, 3, `stderr: ${result.stderr}`);
    assert.deepEqual(lines(result.stdout), ["refused: b/CLAUDE.md modified"]);
    assert.equal(fs.existsSync(path.join(repo.dir, "CLAUDE.md")), true);
    assert.equal(fs.existsSync(path.join(repo.dir, "a/CLAUDE.md")), true);
    assert.equal(fs.existsSync(path.join(repo.dir, "b/CLAUDE.md")), true);
  });
});

/** The ways a caller can spell the path it invokes the script by, each with the
 *  plugin root the script must print for it: on Windows the native `C:\...`, the
 *  mixed `C:/...` and the MSYS `/c/...` spellings, elsewhere the one absolute path. */
function invocations(): { form: string; script: string; root: string }[] {
  const plugin = path.resolve(import.meta.dirname, "../../viber");
  if (process.platform !== "win32") return [{ form: "absolute", script: SUT, root: plugin }];
  const mixed = (p: string) => p.replace(/\\/g, "/");
  const msys = (p: string) => mixed(p).replace(/^([A-Za-z]):/, (_, d: string) => `/${d.toLowerCase()}`);
  return [
    { form: "C:\\", script: path.win32.normalize(SUT), root: mixed(plugin) },
    { form: "C:/", script: mixed(SUT), root: mixed(plugin) },
    { form: "/c/", script: msys(SUT), root: msys(plugin) },
  ];
}

for (const { form, script, root } of invocations()) {
  test(`--targets with --keep invoked by a ${form} path prints the references path in that spelling`, async () => {
    await withGitRepo(async (repo) => {
      await commit(repo, { "CLAUDE.md": node(40), "src/a.ts": "x\n" });

      const result = await runScript(
        script,
        ["--targets", "review", "--id", MAP_ID, "--keep", "CLAUDE.md"],
        { cwd: repo.dir, env: repo.env, shell: "bash" },
      );

      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.deepEqual(pick(lines(result.stdout), "refs: "), [`refs: ${root}/references`]);
    });
  });

  test(`--reconcile invoked by a ${form} path prints the references path in that spelling`, async () => {
    await withGitRepo(async (repo) => {
      present(repo, "CLAUDE.md", "docs/CLAUDE.md");

      const result = await runScript(
        script,
        ["--reconcile", "--planned", "CLAUDE.md,docs/CLAUDE.md,docs/a/CLAUDE.md", "--fix", "docs/CLAUDE.md", "--files", "docs/CLAUDE.md"],
        { cwd: repo.dir, env: repo.env, shell: "bash" },
      );

      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.deepEqual(pick(lines(result.stdout), "refs: "), [`refs: ${root}/references`]);
    });
  });
}
