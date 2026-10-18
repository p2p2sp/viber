/*
 * memory-map.test.ts - proves viber/skills/memory/scripts/memory-map.sh's
 * contract: with no argument it MAPS the host repository's `CLAUDE.md`
 * cascade (one line per node with its own and its chain's character count,
 * the `CLAUDE.<topic>.md` sections beside a node and the unlinked ones,
 * orphan nodes, directories that deserve a node, nodes and sections carrying
 * uncommitted work), and with `--reset` it deletes the nodes and sections it
 * is given, a node taking its sections along - all of them or none.
 *
 * Two properties carry the design. The map ALWAYS exits 0, because it is a
 * `!` preload where a non-zero exit aborts the whole skill load - a directory
 * that is no repository at all is the empty map, not an error. And `--reset`
 * is all-or-nothing: one modified or untracked target refuses the whole call
 * with nothing deleted, so a user never loses half a cascade.
 *
 * Every case builds its own throwaway git repo through `withGitRepo`, so no
 * test reads this repository's index or the developer's ~/.gitconfig, and
 * several may run at once in the same tree.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run
 * directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/memory-map.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { runScript } from "../harness/run.ts";
import { withGitRepo, withTempDir, type GitRepo } from "../harness/tmp.ts";

const SUT = path.resolve(import.meta.dirname, "../../viber/skills/memory/scripts/memory-map.sh");

function run(repo: GitRepo, args: string[] = []) {
  return runScript(SUT, args, { cwd: repo.dir, env: repo.env, shell: "bash" });
}

/** stdout split into lines, the trailing empty one dropped. */
function lines(stdout: string): string[] {
  return stdout.replace(/\n$/, "").split("\n");
}

/** Writes each `path -> content` pair into the repo, creating directories. */
function write(repo: GitRepo, files: Record<string, string>): void {
  for (const [rel, body] of Object.entries(files)) {
    const full = path.join(repo.dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, body);
  }
}

/** Writes the files and commits them, so every one of them is tracked. */
async function commit(repo: GitRepo, files: Record<string, string>): Promise<void> {
  write(repo, files);
  await repo.git("add", "-A");
  await repo.git("commit", "-m", "seed");
}

test("a repository with no tracked file at all is the empty map", async () => {
  await withGitRepo(async (repo) => {
    const result = await run(repo);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    const out = lines(result.stdout);
    assert.equal(out[0], "# viber memory map");
    assert.match(out[1], /^id: \d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}$/);
    assert.deepEqual(out.slice(2), ["state: none", "total: nodes 0"]);
  });
});

/** The lines of `out` opening with `prefix`, in the order printed. */
function pick(out: string[], prefix: string): string[] {
  return out.filter((line) => line.startsWith(prefix));
}

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

/** A CLAUDE.md body of exactly `chars` bytes, newline included. */
function node(chars: number): string {
  return `${"x".repeat(chars - 1)}\n`;
}

test("nodes come root first then in depth order, each chain adding every ancestor node above it", async () => {
  await withGitRepo(async (repo) => {
    await commit(repo, {
      "CLAUDE.md": node(100),
      "docs/CLAUDE.md": node(50),
      "docs/deep/CLAUDE.md": node(30),
      // no api/CLAUDE.md: this chain skips the gap and lands on the root
      "api/v1/CLAUDE.md": node(20),
    });

    const result = await run(repo);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.deepEqual(pick(lines(result.stdout), "node:"), [
      "node: CLAUDE.md 100 chain 100 ok",
      "node: docs/CLAUDE.md 50 chain 150 ok",
      "node: api/v1/CLAUDE.md 20 chain 120 ok",
      "node: docs/deep/CLAUDE.md 30 chain 180 ok",
    ]);
  });
});

test("a root CLAUDE.md past the 4000 byte root budget reads OVER-NODE", async () => {
  await withGitRepo(async (repo) => {
    await commit(repo, { "CLAUDE.md": node(4001) });

    const result = await run(repo);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.deepEqual(pick(lines(result.stdout), "node:"), [
      "node: CLAUDE.md 4001 chain 4001 OVER-NODE",
    ]);
  });
});

test("a root CLAUDE.md of exactly 4000 bytes is within the root budget and reads ok", async () => {
  await withGitRepo(async (repo) => {
    await commit(repo, { "CLAUDE.md": node(4000) });

    const result = await run(repo);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.deepEqual(pick(lines(result.stdout), "node:"), [
      "node: CLAUDE.md 4000 chain 4000 ok",
    ]);
  });
});

test("a node below the root keeps the 12000 byte budget: 12000 reads ok and 12001 OVER-NODE (the root budget never reaches below the root)", async () => {
  await withGitRepo(async (repo) => {
    await commit(repo, {
      "CLAUDE.md": node(40),
      "a/CLAUDE.md": node(12000),
      "b/CLAUDE.md": node(12001),
    });

    const result = await run(repo);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.deepEqual(pick(lines(result.stdout), "node:"), [
      "node: CLAUDE.md 40 chain 40 ok",
      "node: a/CLAUDE.md 12000 chain 12040 ok",
      "node: b/CLAUDE.md 12001 chain 12041 OVER-NODE",
    ]);
  });
});

test("a section beside the root keeps the 12000 byte budget and reads ok at 12000 (the root budget is the node's alone)", async () => {
  await withGitRepo(async (repo) => {
    await commit(repo, {
      "CLAUDE.md": "read CLAUDE.release.md before a release\n",
      "CLAUDE.release.md": node(12000),
    });

    const result = await run(repo);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.deepEqual(pick(lines(result.stdout), "section:"), [
      "section: CLAUDE.release.md 12000 ok",
    ]);
  });
});

test("a chain past the 32000 character budget reads OVER-CHAIN while each node of it stays ok", async () => {
  await withGitRepo(async (repo) => {
    await commit(repo, {
      // each node sits exactly on its own budget, not past it
      "CLAUDE.md": node(4000),
      "a/CLAUDE.md": node(12000),
      "a/b/CLAUDE.md": node(12000),
      "a/b/c/CLAUDE.md": node(5000),
    });

    const result = await run(repo);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.deepEqual(pick(lines(result.stdout), "node:"), [
      "node: CLAUDE.md 4000 chain 4000 ok",
      "node: a/CLAUDE.md 12000 chain 16000 ok",
      "node: a/b/CLAUDE.md 12000 chain 28000 ok",
      "node: a/b/c/CLAUDE.md 5000 chain 33000 OVER-CHAIN",
    ]);
  });
});

test("OVER-NODE wins over OVER-CHAIN when a node is past both budgets", async () => {
  await withGitRepo(async (repo) => {
    await commit(repo, {
      "CLAUDE.md": node(4000),
      "a/CLAUDE.md": node(12000),
      "a/b/CLAUDE.md": node(12000),
      "a/b/c/CLAUDE.md": node(12001),
    });

    const result = await run(repo);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.deepEqual(pick(lines(result.stdout), "node:"), [
      "node: CLAUDE.md 4000 chain 4000 ok",
      "node: a/CLAUDE.md 12000 chain 16000 ok",
      "node: a/b/CLAUDE.md 12000 chain 28000 ok",
      "node: a/b/c/CLAUDE.md 12001 chain 40001 OVER-NODE",
    ]);
  });
});

test("only a node with no other tracked file anywhere beneath its directory is an orphan", async () => {
  await withGitRepo(async (repo) => {
    await commit(repo, {
      "CLAUDE.md": node(40),
      "README.md": "readme\n",
      "lonely/CLAUDE.md": node(40),
      "docs/CLAUDE.md": node(40),
      "docs/guide.md": "guide\n",
      // a node over a subtree documents that subtree, orphan it is not
      "deep/CLAUDE.md": node(40),
      "deep/sub/impl.ts": "export const a = 1;\n",
    });

    const result = await run(repo);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.deepEqual(pick(lines(result.stdout), "orphan:"), ["orphan: lonely/CLAUDE.md"]);
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

test("a directory deserving a node is a candidate, marked toolchain only when it holds a manifest", async () => {
  await withGitRepo(async (repo) => {
    await commit(repo, {
      "CLAUDE.md": node(40),
      "src/a.ts": "aaa\n",
      "src/b.ts": "bbbb\n",
      "src/c.ts": "c\n",
      "web/package.json": "{}\n",
      "web/index.js": "x\n",
      "web/style.css": "y\n",
    });

    const result = await run(repo);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.deepEqual(pick(lines(result.stdout), "cand:"), [
      "cand: src files 3 bytes 11 plain",
      "cand: web files 3 bytes 7 toolchain",
    ]);
  });
});

test("a candidate already carrying a node, one under three files, one behind a dot segment and one at depth 3 are all left out", async () => {
  await withGitRepo(async (repo) => {
    await commit(repo, {
      "CLAUDE.md": node(40),
      "docs/CLAUDE.md": node(40),
      "docs/a.md": "x\n",
      "docs/b.md": "x\n",
      "docs/c.md": "x\n",
      "tiny/a.txt": "x\n",
      "tiny/b.txt": "x\n",
      ".github/workflows/a.yml": "x\n",
      ".github/workflows/b.yml": "x\n",
      ".github/workflows/c.yml": "x\n",
      "deep/one/two/a.ts": "x\n",
      "deep/one/two/b.ts": "x\n",
      "deep/one/two/c.ts": "x\n",
    });

    const result = await run(repo);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.deepEqual(pick(lines(result.stdout), "cand:"), [
      "cand: deep files 3 bytes 6 plain",
      "cand: deep/one files 3 bytes 6 plain",
    ]);
  });
});

test("a node or section below a dot directory or under the host's .gitignore is never mapped, even tracked and modified, and --reset refuses it as not-a-node", async () => {
  await withGitRepo(async (repo) => {
    await commit(repo, {
      "CLAUDE.md": node(40),
      ".gitignore": "build/\n",
      ".github/CLAUDE.md": node(40),
      ".github/CLAUDE.ci.md": "ci\n",
      ".github/workflows/a.yml": "x\n",
    });
    write(repo, { "build/CLAUDE.md": node(40), "build/out.js": "x\n" });
    await repo.git("add", "-f", "build");
    await repo.git("commit", "-m", "force-add an ignored directory");
    write(repo, { ".github/CLAUDE.md": node(50), "build/CLAUDE.md": node(50), ".cfg/CLAUDE.md": node(40) });

    const result = await run(repo);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    const out = lines(result.stdout);
    assert.deepEqual(pick(out, "node:"), ["node: CLAUDE.md 40 chain 40 ok"]);
    for (const kind of ["section:", "unlinked:", "orphan:", "cand:", "dirty:"]) {
      assert.deepEqual(pick(out, kind), [], `${kind} lines: ${out.join(" | ")}`);
    }
    assert.ok(out.includes("total: nodes 1"));

    const reset = await run(repo, ["--reset", ".github/CLAUDE.md", "build/CLAUDE.md"]);

    assert.equal(reset.status, 3, `stderr: ${reset.stderr}`);
    assert.deepEqual(lines(reset.stdout), [
      "refused: .github/CLAUDE.md not-a-node",
      "refused: build/CLAUDE.md not-a-node",
    ]);
    assert.ok(fs.existsSync(path.join(repo.dir, ".github/CLAUDE.md")));
  });
});

test("a tracked file the host's .gitignore excludes counts toward no candidate, while a file whose own name starts with a dot does", async () => {
  await withGitRepo(async (repo) => {
    await commit(repo, {
      "CLAUDE.md": node(40),
      ".gitignore": "*.log\n",
      "lib/a.ts": "x\n",
      "lib/b.ts": "x\n",
      "lib/.eslintrc": "x\n",
      "logs/a.ts": "x\n",
      "logs/b.ts": "x\n",
    });
    write(repo, { "logs/c.log": "x\n", "logs/d.log": "x\n" });
    await repo.git("add", "-f", "logs");
    await repo.git("commit", "-m", "force-add ignored logs");

    const result = await run(repo);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.deepEqual(pick(lines(result.stdout), "cand:"), ["cand: lib files 3 bytes 6 plain"]);
  });
});

/** `count` two-byte files named f00.ts, f01.ts... inside `dir`. */
function many(dir: string, count: number): Record<string, string> {
  const files: Record<string, string> = {};
  for (let i = 0; i < count; i++) files[`${dir}/f${String(i).padStart(2, "0")}.ts`] = "x\n";
  return files;
}

test("past depth 2 a directory is a candidate only with its own manifest, or twenty files while it is no passthrough", async () => {
  await withGitRepo(async (repo) => {
    await commit(repo, {
      "CLAUDE.md": node(40),
      "pkgs/web/app/package.json": "{}\n",
      "pkgs/web/app/index.js": "x\n",
      ...many("src/mod/big", 20),
      ...many("src/mod/small", 19),
      ...many("lib/core/wrap/inner", 20),
    });

    const result = await run(repo);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.deepEqual(pick(lines(result.stdout), "cand:"), [
      "cand: lib files 20 bytes 40 plain",
      "cand: lib/core files 20 bytes 40 plain",
      "cand: lib/core/wrap/inner files 20 bytes 40 plain",
      "cand: pkgs/web/app files 2 bytes 5 toolchain",
      "cand: src files 39 bytes 78 plain",
      "cand: src/mod files 39 bytes 78 plain",
      "cand: src/mod/big files 20 bytes 40 plain",
    ]);
  });
});

/** The one `state:` line of a map. */
function state(out: string[]): string {
  return pick(out, "state:")[0];
}

test("state reads complete when a root node exists and no candidate is left without one", async () => {
  await withGitRepo(async (repo) => {
    await commit(repo, {
      "CLAUDE.md": node(40),
      "src/CLAUDE.md": node(40),
      "src/a.ts": "x\n",
      "src/b.ts": "x\n",
      "src/c.ts": "x\n",
    });

    const result = await run(repo);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    const out = lines(result.stdout);
    assert.deepEqual(pick(out, "cand:"), []);
    assert.equal(state(out), "state: complete");
  });
});

test("state reads partial while a candidate is still without a node", async () => {
  await withGitRepo(async (repo) => {
    await commit(repo, {
      "CLAUDE.md": node(40),
      "src/a.ts": "x\n",
      "src/b.ts": "x\n",
      "src/c.ts": "x\n",
    });

    const result = await run(repo);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    const out = lines(result.stdout);
    assert.deepEqual(pick(out, "cand:"), ["cand: src files 3 bytes 6 plain"]);
    assert.equal(state(out), "state: partial");
  });
});

test("state reads partial while nodes exist but the root node does not", async () => {
  await withGitRepo(async (repo) => {
    await commit(repo, {
      "src/CLAUDE.md": node(40),
      "src/a.ts": "x\n",
      "src/b.ts": "x\n",
      "src/c.ts": "x\n",
    });

    const result = await run(repo);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    const out = lines(result.stdout);
    assert.deepEqual(pick(out, "cand:"), []);
    assert.equal(state(out), "state: partial");
  });
});

test("a node carrying uncommitted work is dirty, and an untracked one is no node at all", async () => {
  await withGitRepo(async (repo) => {
    await commit(repo, {
      "CLAUDE.md": node(40),
      "docs/CLAUDE.md": node(40),
      "docs/guide.md": "x\n",
    });
    write(repo, {
      "CLAUDE.md": node(60),
      "new/CLAUDE.md": node(40),
    });

    const result = await run(repo);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    const out = lines(result.stdout);
    assert.deepEqual(pick(out, "dirty:"), [
      "dirty: CLAUDE.md modified",
      "dirty: new/CLAUDE.md untracked",
    ]);
    assert.deepEqual(pick(out, "total:"), ["total: nodes 2"]);
  });
});

test("a node deleted by --reset and left unstaged is no node, carries no dirty entry, and its directory is a candidate again", async () => {
  await withGitRepo(async (repo) => {
    await commit(repo, {
      "CLAUDE.md": node(40),
      "docs/CLAUDE.md": node(40),
      "docs/a.md": "x\n",
      "docs/b.md": "x\n",
      "docs/c.md": "x\n",
    });

    const reset = await run(repo, ["--reset", "docs/CLAUDE.md"]);
    assert.equal(reset.status, 0, `stderr: ${reset.stderr}`);

    const result = await run(repo);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    const out = lines(result.stdout);
    assert.deepEqual(pick(out, "node:"), ["node: CLAUDE.md 40 chain 40 ok"]);
    assert.deepEqual(pick(out, "dirty:"), []);
    assert.deepEqual(pick(out, "cand:"), ["cand: docs files 3 bytes 6 plain"]);
    assert.deepEqual(pick(out, "total:"), ["total: nodes 1"]);
  });
});

test("a node deleted with git rm, staged but uncommitted, is no node, carries no dirty entry, and its directory is a candidate again", async () => {
  await withGitRepo(async (repo) => {
    await commit(repo, {
      "CLAUDE.md": node(40),
      "docs/CLAUDE.md": node(40),
      "docs/a.md": "x\n",
      "docs/b.md": "x\n",
      "docs/c.md": "x\n",
    });
    await repo.git("rm", "-q", "docs/CLAUDE.md");

    const result = await run(repo);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    const out = lines(result.stdout);
    assert.deepEqual(pick(out, "node:"), ["node: CLAUDE.md 40 chain 40 ok"]);
    assert.deepEqual(pick(out, "dirty:"), []);
    assert.deepEqual(pick(out, "cand:"), ["cand: docs files 3 bytes 6 plain"]);
    assert.deepEqual(pick(out, "total:"), ["total: nodes 1"]);
  });
});

test("a tracked root CLAUDE.md deleted but not staged is absent: it does not complete the state, and measuring it prints nothing on stderr", async () => {
  await withGitRepo(async (repo) => {
    await commit(repo, {
      "CLAUDE.md": node(40),
      "a/CLAUDE.md": node(40),
      "a/b/CLAUDE.md": node(40),
    });
    fs.rmSync(path.join(repo.dir, "CLAUDE.md"));

    const result = await run(repo);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stderr, "");
    const out = lines(result.stdout);
    assert.notEqual(state(out), "state: complete");
    assert.deepEqual(pick(out, "node:"), [
      "node: a/CLAUDE.md 40 chain 40 ok",
      "node: a/b/CLAUDE.md 40 chain 80 ok",
    ]);
    assert.deepEqual(pick(out, "total:"), ["total: nodes 2"]);
  });
});

test("--reset still refuses a target whose earlier deletion was left uncommitted and unstaged", async () => {
  await withGitRepo(async (repo) => {
    await commit(repo, {
      "CLAUDE.md": node(40),
      "a/CLAUDE.md": node(40),
    });

    const first = await run(repo, ["--reset", "a/CLAUDE.md"]);
    assert.equal(first.status, 0, `stderr: ${first.stderr}`);

    const result = await run(repo, ["--reset", "a/CLAUDE.md"]);

    assert.equal(result.status, 3, `stderr: ${result.stderr}`);
    assert.deepEqual(lines(result.stdout), ["refused: a/CLAUDE.md modified"]);
    assert.equal(fs.existsSync(path.join(repo.dir, "CLAUDE.md")), true);
  });
});

test("a directory that is no repository at all maps as the empty layer and still exits 0", async () => {
  await withTempDir("p2p2-nogit-", async (dir) => {
    fs.writeFileSync(path.join(dir, "CLAUDE.md"), node(40));

    const result = await runScript(SUT, [], { cwd: dir, shell: "bash" });

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    const out = lines(result.stdout);
    assert.equal(out[0], "# viber memory map");
    assert.deepEqual(out.slice(2), ["state: none", "total: nodes 0"]);
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

test("run from a subdirectory, the map and --reset still read every path relative to the repository root", async () => {
  await withGitRepo(async (repo) => {
    await commit(repo, {
      "CLAUDE.md": node(40),
      "docs/CLAUDE.md": node(40),
      "docs/guide.md": "x\n",
    });
    const sub = { ...repo, dir: path.join(repo.dir, "docs") };

    const fromRoot = lines((await run(repo)).stdout).slice(2);
    const map = await run(sub);
    assert.equal(map.status, 0, `stderr: ${map.stderr}`);
    assert.deepEqual(lines(map.stdout).slice(2), fromRoot);

    const reset = await run(sub, ["--reset", "docs/CLAUDE.md"]);
    assert.equal(reset.status, 0, `stderr: ${reset.stderr}`);
    assert.deepEqual(lines(reset.stdout), ["removed: docs/CLAUDE.md", "removed: 1"]);
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

test("--reset refuses a target that is not a node, one that is tracked nowhere and one that is untracked", async () => {
  await withGitRepo(async (repo) => {
    await commit(repo, { "CLAUDE.md": node(40), "README.md": "readme\n" });
    write(repo, { "new/CLAUDE.md": node(40) });

    const result = await run(repo, [
      "--reset",
      "CLAUDE.md",
      "README.md",
      "gone/CLAUDE.md",
      "new/CLAUDE.md",
    ]);

    assert.equal(result.status, 3, `stderr: ${result.stderr}`);
    assert.deepEqual(lines(result.stdout), [
      "refused: README.md not-a-node",
      "refused: gone/CLAUDE.md not-a-node",
      "refused: new/CLAUDE.md untracked",
    ]);
    assert.equal(fs.existsSync(path.join(repo.dir, "CLAUDE.md")), true);
    assert.equal(fs.existsSync(path.join(repo.dir, "new/CLAUDE.md")), true);
  });
});

test("a repository with tracked files but no node at all is state none, its candidates still listed", async () => {
  await withGitRepo(async (repo) => {
    await commit(repo, {
      "README.md": "readme\n",
      "src/a.ts": "x\n",
      "src/b.ts": "x\n",
      "src/c.ts": "x\n",
    });

    const result = await run(repo);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    const out = lines(result.stdout);
    assert.equal(state(out), "state: none");
    assert.deepEqual(pick(out, "node:"), []);
    assert.deepEqual(pick(out, "cand:"), ["cand: src files 3 bytes 6 plain"]);
    assert.deepEqual(pick(out, "total:"), ["total: nodes 0"]);
  });
});

test("--reset with no path at all deletes nothing and exits 2", async () => {
  await withGitRepo(async (repo) => {
    await commit(repo, { "CLAUDE.md": node(40) });

    const result = await run(repo, ["--reset"]);

    assert.equal(result.status, 2);
    assert.equal(result.stdout, "");
    assert.equal(fs.existsSync(path.join(repo.dir, "CLAUDE.md")), true);
  });
});

test("a tracked section is one section line with its own size and flag, never counted toward a chain or the node total", async () => {
  await withGitRepo(async (repo) => {
    const root = "read CLAUDE.release.md before a release\n";
    const docs = "read CLAUDE.tests.md before editing tests\n";
    await commit(repo, {
      "CLAUDE.md": root,
      "CLAUDE.release.md": node(12001),
      "docs/CLAUDE.md": docs,
      "docs/CLAUDE.tests.md": node(300),
      "docs/guide.md": "x\n",
    });

    const result = await run(repo);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    const out = lines(result.stdout);
    assert.deepEqual(pick(out, "node:"), [
      `node: CLAUDE.md ${root.length} chain ${root.length} ok`,
      `node: docs/CLAUDE.md ${docs.length} chain ${root.length + docs.length} ok`,
    ]);
    assert.deepEqual(pick(out, "section:"), [
      "section: CLAUDE.release.md 12001 OVER-NODE",
      "section: docs/CLAUDE.tests.md 300 ok",
    ]);
    assert.deepEqual(pick(out, "unlinked:"), []);
    assert.deepEqual(pick(out, "total:"), ["total: nodes 2"]);
  });
});

test("a section with no node beside it, or one its node never names, is unlinked", async () => {
  await withGitRepo(async (repo) => {
    await commit(repo, {
      "CLAUDE.md": node(40),
      "CLAUDE.tests.md": node(40),
      "lib/CLAUDE.api.md": node(40),
      "lib/a.ts": "x\n",
    });

    const result = await run(repo);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.deepEqual(pick(lines(result.stdout), "unlinked:"), [
      "unlinked: CLAUDE.tests.md",
      "unlinked: lib/CLAUDE.api.md",
    ]);
  });
});

test("CLAUDE.local.md and a name outside the topic alphabet are no section (the user's own auto-loaded file is never a section)", async () => {
  await withGitRepo(async (repo) => {
    await commit(repo, {
      "CLAUDE.md": node(40),
      "CLAUDE.local.md": node(40),
      "CLAUDE.Tests.md": node(40),
      "CLAUDE.a.b.md": node(40),
    });

    const result = await run(repo);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    const out = lines(result.stdout);
    assert.deepEqual(pick(out, "section:"), []);
    assert.deepEqual(pick(out, "unlinked:"), []);
  });
});

test("a node whose only other file is its own section is still an orphan", async () => {
  await withGitRepo(async (repo) => {
    await commit(repo, {
      "CLAUDE.md": node(40),
      "README.md": "readme\n",
      "lonely/CLAUDE.md": `read CLAUDE.tests.md before editing tests\n`,
      "lonely/CLAUDE.tests.md": node(40),
      "kept/CLAUDE.md": node(40),
      "kept/CLAUDE.local.md": node(40),
    });

    const result = await run(repo);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.deepEqual(pick(lines(result.stdout), "orphan:"), ["orphan: lonely/CLAUDE.md"]);
  });
});

test("a section carrying uncommitted work is dirty, and an untracked one is no section at all", async () => {
  await withGitRepo(async (repo) => {
    await commit(repo, {
      "CLAUDE.md": `read CLAUDE.tests.md before editing tests\n`,
      "CLAUDE.tests.md": node(40),
    });
    write(repo, {
      "CLAUDE.tests.md": node(60),
      "CLAUDE.release.md": node(40),
    });

    const result = await run(repo);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    const out = lines(result.stdout);
    assert.deepEqual(pick(out, "section:"), ["section: CLAUDE.tests.md 60 ok"]);
    assert.deepEqual(pick(out, "dirty:"), [
      "dirty: CLAUDE.tests.md modified",
      "dirty: CLAUDE.release.md untracked",
    ]);
  });
});

test("--reset of a node also deletes every tracked section beside it, one removed line per file", async () => {
  await withGitRepo(async (repo) => {
    await commit(repo, {
      "CLAUDE.md": node(40),
      "CLAUDE.release.md": node(40),
      "docs/CLAUDE.md": node(40),
      "docs/CLAUDE.tests.md": node(40),
      "docs/api/CLAUDE.api.md": node(40),
    });

    const result = await run(repo, ["--reset", "docs/CLAUDE.md", "docs/CLAUDE.tests.md"]);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.deepEqual(lines(result.stdout), [
      "removed: docs/CLAUDE.md",
      "removed: docs/CLAUDE.tests.md",
      "removed: 2",
    ]);
    assert.equal(fs.existsSync(path.join(repo.dir, "docs/CLAUDE.tests.md")), false);
    assert.equal(fs.existsSync(path.join(repo.dir, "docs/api/CLAUDE.api.md")), true);
    assert.equal(fs.existsSync(path.join(repo.dir, "CLAUDE.release.md")), true);
  });
});

test("a modified section beside a node refuses the whole --reset and deletes nothing", async () => {
  await withGitRepo(async (repo) => {
    await commit(repo, {
      "CLAUDE.md": node(40),
      "a/CLAUDE.md": node(40),
      "a/CLAUDE.tests.md": node(40),
    });
    write(repo, { "a/CLAUDE.tests.md": node(60) });

    const result = await run(repo, ["--reset", "CLAUDE.md", "a/CLAUDE.md"]);

    assert.equal(result.status, 3, `stderr: ${result.stderr}`);
    assert.deepEqual(lines(result.stdout), ["refused: a/CLAUDE.tests.md modified"]);
    assert.equal(fs.existsSync(path.join(repo.dir, "CLAUDE.md")), true);
    assert.equal(fs.existsSync(path.join(repo.dir, "a/CLAUDE.md")), true);
  });
});

test("a tracked section deleted but not committed is no section, measuring it prints nothing on stderr, and --reset of its node is refused", async () => {
  await withGitRepo(async (repo) => {
    await commit(repo, {
      "CLAUDE.md": `read CLAUDE.tests.md before editing tests\n`,
      "CLAUDE.tests.md": node(40),
    });
    fs.rmSync(path.join(repo.dir, "CLAUDE.tests.md"));

    const result = await run(repo);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stderr, "");
    const out = lines(result.stdout);
    assert.deepEqual(pick(out, "section:"), []);
    assert.deepEqual(pick(out, "unlinked:"), []);
    assert.deepEqual(pick(out, "dirty:"), []);

    const reset = await run(repo, ["--reset", "CLAUDE.md"]);
    assert.equal(reset.status, 3, `stderr: ${reset.stderr}`);
    assert.deepEqual(lines(reset.stdout), ["refused: CLAUDE.tests.md modified"]);
    assert.equal(fs.existsSync(path.join(repo.dir, "CLAUDE.md")), true);
  });
});

test("a section beside an untracked node is unlinked (an untracked node is no node)", async () => {
  await withGitRepo(async (repo) => {
    await commit(repo, { "CLAUDE.tests.md": node(40), "README.md": "readme\n" });
    write(repo, { "CLAUDE.md": `read CLAUDE.tests.md before editing tests\n` });

    const result = await run(repo);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.deepEqual(pick(lines(result.stdout), "unlinked:"), ["unlinked: CLAUDE.tests.md"]);
  });
});

test("--reset of a node leaves an untracked section beside it, and refuses an untracked section named on its own", async () => {
  await withGitRepo(async (repo) => {
    await commit(repo, { "CLAUDE.md": node(40), "a/CLAUDE.md": node(40) });
    write(repo, { "a/CLAUDE.tests.md": node(40), "CLAUDE.new.md": node(40) });

    const refused = await run(repo, ["--reset", "CLAUDE.new.md"]);
    assert.equal(refused.status, 3, `stderr: ${refused.stderr}`);
    assert.deepEqual(lines(refused.stdout), ["refused: CLAUDE.new.md untracked"]);

    const result = await run(repo, ["--reset", "a/CLAUDE.md"]);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.deepEqual(lines(result.stdout), ["removed: a/CLAUDE.md", "removed: 1"]);
    assert.equal(fs.existsSync(path.join(repo.dir, "a/CLAUDE.tests.md")), true);
  });
});

test("--reset of a section alone deletes that section and leaves its node", async () => {
  await withGitRepo(async (repo) => {
    await commit(repo, {
      "CLAUDE.md": node(40),
      "CLAUDE.tests.md": node(40),
      "CLAUDE.release.md": node(40),
    });

    const result = await run(repo, ["--reset", "CLAUDE.tests.md"]);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.deepEqual(lines(result.stdout), ["removed: CLAUDE.tests.md", "removed: 1"]);
    assert.equal(fs.existsSync(path.join(repo.dir, "CLAUDE.md")), true);
    assert.equal(fs.existsSync(path.join(repo.dir, "CLAUDE.release.md")), true);
  });
});

test("an unknown argument is refused with no map printed", async () => {
  await withGitRepo(async (repo) => {
    await commit(repo, { "CLAUDE.md": node(40) });

    const result = await run(repo, ["--wipe"]);

    assert.equal(result.status, 2);
    assert.equal(result.stdout, "");
  });
});
