/*
 * memory-map.unit.test.ts - the memory-map core on fake ports: with no argument
 * it MAPS the host repository's `CLAUDE.md` cascade (one line per node with its
 * own and its chain's byte count, the `CLAUDE.<topic>.md` sections beside a node
 * and the unlinked ones, orphan nodes, directories that deserve a node, nodes
 * and sections carrying uncommitted work), and with `--reset` it deletes the
 * nodes and sections it is given, a node taking its sections along - all of them
 * or none. With `--targets <mode>` it prints the target lines of a mode and the
 * `NEXT:` directive that ends them, with `--id` and `--keep` the planned set and
 * one `memory-auditor` block per kept fix target with its `shape:` lines, and
 * with `--reconcile` the writer blocks of the nodes the write waves left off.
 *
 * Two properties carry the design. The map ALWAYS exits 0, because it is a
 * `!` preload where a non-zero exit aborts the whole skill load - a directory
 * that is no repository at all is the empty map, not an error. And `--reset`
 * is all-or-nothing: one modified or untracked target refuses the whole call
 * with nothing deleted, so a user never loses half a cascade.
 *
 * What git answers is given as the tables of a `fakeGit` repository. The wrapper
 * is run as a process by tests/viber/memory-map.critical.test.ts.
 */

import assert from "node:assert/strict";
import { fakeClock, fakeFs, fakeGit, type FakeFsOpts, type FakeRepo } from "../../harness/fakes.ts";
import { test } from "../../harness/test.ts";
import type { Fs } from "../../../viber/lib/ports.ts";
import { runMemoryMap } from "../../../viber/lib/memory-map.ts";

const ROOT = "/r";
const SCRIPT = "/plugin/viber/skills/memory/scripts/memory-map.ts";
const AT = new Date(2026, 10, 24, 17, 4, 6);
const MAP_ID = "2026-11-19-10-00-00";

interface Repo {
  fs: Fs;
  git: FakeRepo;
}

/** A repository whose every file is tracked and clean: the tree a map is taken of. */
function seed(files: Record<string, string>, opts: FakeFsOpts = {}): Repo {
  const repo: Repo = { fs: fakeFs({}, { dirs: [ROOT], ...opts }), git: { root: ROOT, tracked: [], status: [] } };
  track(repo, files);
  return repo;
}

function put(repo: Repo, path: string, text: string): void {
  const file = `${ROOT}/${path}`;
  repo.fs.makeDir(file.slice(0, file.lastIndexOf("/")));
  assert.equal(repo.fs.writeBytes(file, new TextEncoder().encode(text)), true);
}

/** Adds the files as tracked and clean. */
function track(repo: Repo, files: Record<string, string>): void {
  for (const [path, text] of Object.entries(files)) {
    put(repo, path, text);
    repo.git.tracked.push({ path, mode: "100644" });
  }
  repo.git.tracked.sort((a, b) => (a.path < b.path ? -1 : 1));
}

/** Writes each file the way a user edits it: a tracked one reads modified, any other untracked. */
function write(repo: Repo, files: Record<string, string>): void {
  for (const [path, text] of Object.entries(files)) {
    put(repo, path, text);
    repo.git.status?.push({ code: repo.git.tracked.some((file) => file.path === path) ? " M" : "??", path });
  }
}

/** Puts a CLAUDE.md at each path, tracked nowhere: the reconcile call reads the tree alone. */
function present(repo: Repo, ...paths: string[]): void {
  for (const path of paths) put(repo, path, node(40));
}

/** Deletes a tracked file and leaves the deletion unstaged. */
function drop(repo: Repo, path: string): void {
  repo.fs.remove(`${ROOT}/${path}`);
  repo.git.status?.push({ code: " D", path });
}

function run(repo: Repo, args: string[] = [], cwd = ROOT) {
  return runMemoryMap(args, cwd, SCRIPT, { fs: repo.fs, git: fakeGit(repo.git), clock: fakeClock(AT) });
}

const exists = (repo: Repo, path: string): boolean => repo.fs.exists(`${ROOT}/${path}`);

/** stdout split into lines, the trailing empty one dropped. */
function lines(stdout: string): string[] {
  return stdout.replace(/\n$/, "").split("\n");
}

/** The lines of `out` opening with `prefix`, in the order printed. */
function pick(out: string[], prefix: string): string[] {
  return out.filter((line) => line.startsWith(prefix));
}

/** A CLAUDE.md body of exactly `chars` bytes, newline included. */
function node(chars: number): string {
  return `${"x".repeat(chars - 1)}\n`;
}

/** A node body from its `## ` sections, each a heading line followed by its content lines. */
function body(...parts: string[]): string {
  return `# area - what it owns\n\nOwns the area.\n\n${parts.join("\n")}`;
}

test("a repository with no tracked file at all is the empty map", () => {
  const repo = seed({});

  const result = run(repo);

  assert.equal(result.exit, 0, `stderr: ${result.stderr}`);
  const out = lines(result.stdout);
  assert.equal(out[0], "# viber memory map");
  assert.match(out[1], /^id: \d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}$/);
  assert.deepEqual(out.slice(2), ["state: none", "total: nodes 0"]);
});

test("nodes come root first then in depth order, each chain adding every ancestor node above it", () => {
  const repo = seed({
    "CLAUDE.md": node(100),
    "docs/CLAUDE.md": node(50),
    "docs/deep/CLAUDE.md": node(30),
    // no api/CLAUDE.md: this chain skips the gap and lands on the root
    "api/v1/CLAUDE.md": node(20),
  });

  const result = run(repo);

  assert.equal(result.exit, 0, `stderr: ${result.stderr}`);
  assert.deepEqual(pick(lines(result.stdout), "node:"), [
    "node: CLAUDE.md 100 chain 100 ok",
    "node: docs/CLAUDE.md 50 chain 150 ok",
    "node: api/v1/CLAUDE.md 20 chain 120 ok",
    "node: docs/deep/CLAUDE.md 30 chain 180 ok",
  ]);
});

test("a root CLAUDE.md past the 4000 byte root budget reads OVER-NODE", () => {
  const repo = seed({ "CLAUDE.md": node(4001) });

  const result = run(repo);

  assert.equal(result.exit, 0, `stderr: ${result.stderr}`);
  assert.deepEqual(pick(lines(result.stdout), "node:"), [
    "node: CLAUDE.md 4001 chain 4001 OVER-NODE",
  ]);
});

test("a root CLAUDE.md of exactly 4000 bytes is within the root budget and reads ok", () => {
  const repo = seed({ "CLAUDE.md": node(4000) });

  const result = run(repo);

  assert.equal(result.exit, 0, `stderr: ${result.stderr}`);
  assert.deepEqual(pick(lines(result.stdout), "node:"), [
    "node: CLAUDE.md 4000 chain 4000 ok",
  ]);
});

test("a node below the root keeps the 12000 byte budget: 12000 reads ok and 12001 OVER-NODE (the root budget never reaches below the root)", () => {
  const repo = seed({
    "CLAUDE.md": node(40),
    "a/CLAUDE.md": node(12000),
    "b/CLAUDE.md": node(12001),
  });

  const result = run(repo);

  assert.equal(result.exit, 0, `stderr: ${result.stderr}`);
  assert.deepEqual(pick(lines(result.stdout), "node:"), [
    "node: CLAUDE.md 40 chain 40 ok",
    "node: a/CLAUDE.md 12000 chain 12040 ok",
    "node: b/CLAUDE.md 12001 chain 12041 OVER-NODE",
  ]);
});

test("a section beside the root keeps the 12000 byte budget and reads ok at 12000 (the root budget is the node's alone)", () => {
  const repo = seed({
    "CLAUDE.md": "read CLAUDE.release.md before a release\n",
    "CLAUDE.release.md": node(12000),
  });

  const result = run(repo);

  assert.equal(result.exit, 0, `stderr: ${result.stderr}`);
  assert.deepEqual(pick(lines(result.stdout), "section:"), [
    "section: CLAUDE.release.md 12000 ok",
  ]);
});

test("a chain past the 32000 character budget reads OVER-CHAIN while each node of it stays ok", () => {
  const repo = seed({
    // each node sits exactly on its own budget, not past it
    "CLAUDE.md": node(4000),
    "a/CLAUDE.md": node(12000),
    "a/b/CLAUDE.md": node(12000),
    "a/b/c/CLAUDE.md": node(5000),
  });

  const result = run(repo);

  assert.equal(result.exit, 0, `stderr: ${result.stderr}`);
  assert.deepEqual(pick(lines(result.stdout), "node:"), [
    "node: CLAUDE.md 4000 chain 4000 ok",
    "node: a/CLAUDE.md 12000 chain 16000 ok",
    "node: a/b/CLAUDE.md 12000 chain 28000 ok",
    "node: a/b/c/CLAUDE.md 5000 chain 33000 OVER-CHAIN",
  ]);
});

test("OVER-NODE wins over OVER-CHAIN when a node is past both budgets", () => {
  const repo = seed({
    "CLAUDE.md": node(4000),
    "a/CLAUDE.md": node(12000),
    "a/b/CLAUDE.md": node(12000),
    "a/b/c/CLAUDE.md": node(12001),
  });

  const result = run(repo);

  assert.equal(result.exit, 0, `stderr: ${result.stderr}`);
  assert.deepEqual(pick(lines(result.stdout), "node:"), [
    "node: CLAUDE.md 4000 chain 4000 ok",
    "node: a/CLAUDE.md 12000 chain 16000 ok",
    "node: a/b/CLAUDE.md 12000 chain 28000 ok",
    "node: a/b/c/CLAUDE.md 12001 chain 40001 OVER-NODE",
  ]);
});

test("only a node with no other tracked file anywhere beneath its directory is an orphan", () => {
  const repo = seed({
    "CLAUDE.md": node(40),
    "README.md": "readme\n",
    "lonely/CLAUDE.md": node(40),
    "docs/CLAUDE.md": node(40),
    "docs/guide.md": "guide\n",
    // a node over a subtree documents that subtree, orphan it is not
    "deep/CLAUDE.md": node(40),
    "deep/sub/impl.ts": "export const a = 1;\n",
  });

  const result = run(repo);

  assert.equal(result.exit, 0, `stderr: ${result.stderr}`);
  assert.deepEqual(pick(lines(result.stdout), "orphan:"), ["orphan: lonely/CLAUDE.md"]);
});

test("a directory deserving a node is a candidate, marked toolchain only when it holds a manifest", () => {
  const repo = seed({
    "CLAUDE.md": node(40),
    "src/a.ts": "aaa\n",
    "src/b.ts": "bbbb\n",
    "src/c.ts": "c\n",
    "web/package.json": "{}\n",
    "web/index.js": "x\n",
    "web/style.css": "y\n",
  });

  const result = run(repo);

  assert.equal(result.exit, 0, `stderr: ${result.stderr}`);
  assert.deepEqual(pick(lines(result.stdout), "cand:"), [
    "cand: src files 3 bytes 11 plain",
    "cand: web files 3 bytes 7 toolchain",
  ]);
});

test("a candidate already carrying a node, one under three files, one behind a dot segment and one at depth 3 are all left out", () => {
  const repo = seed({
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

  const result = run(repo);

  assert.equal(result.exit, 0, `stderr: ${result.stderr}`);
  assert.deepEqual(pick(lines(result.stdout), "cand:"), [
    "cand: deep files 3 bytes 6 plain",
    "cand: deep/one files 3 bytes 6 plain",
  ]);
});

test("a node or section below a dot directory or under the host's .gitignore is never mapped, even tracked and modified, and --reset refuses it as not-a-node", () => {
  const repo = seed({
    "CLAUDE.md": node(40),
    ".gitignore": "build/\n",
    ".github/CLAUDE.md": node(40),
    ".github/CLAUDE.ci.md": "ci\n",
    ".github/workflows/a.yml": "x\n",
  });
  track(repo, { "build/CLAUDE.md": node(40), "build/out.js": "x\n" });
  repo.git.trackedIgnored = ["build/CLAUDE.md", "build/out.js"];
  repo.git.ignored = ["build/CLAUDE.md", "build/out.js"];
  write(repo, { ".github/CLAUDE.md": node(50), "build/CLAUDE.md": node(50), ".cfg/CLAUDE.md": node(40) });

  const result = run(repo);

  assert.equal(result.exit, 0, `stderr: ${result.stderr}`);
  const out = lines(result.stdout);
  assert.deepEqual(pick(out, "node:"), ["node: CLAUDE.md 40 chain 40 ok"]);
  for (const kind of ["section:", "unlinked:", "orphan:", "cand:", "dirty:"]) {
    assert.deepEqual(pick(out, kind), [], `${kind} lines: ${out.join(" | ")}`);
  }
  assert.ok(out.includes("total: nodes 1"));

  const reset = run(repo, ["--reset", ".github/CLAUDE.md", "build/CLAUDE.md"]);

  assert.equal(reset.exit, 3, `stderr: ${reset.stderr}`);
  assert.deepEqual(lines(reset.stdout), [
    "refused: .github/CLAUDE.md not-a-node",
    "refused: build/CLAUDE.md not-a-node",
  ]);
  assert.ok(exists(repo, ".github/CLAUDE.md"));
});

test("a tracked file the host's .gitignore excludes counts toward no candidate, while a file whose own name starts with a dot does", () => {
  const repo = seed({
    "CLAUDE.md": node(40),
    ".gitignore": "*.log\n",
    "lib/a.ts": "x\n",
    "lib/b.ts": "x\n",
    "lib/.eslintrc": "x\n",
    "logs/a.ts": "x\n",
    "logs/b.ts": "x\n",
  });
  track(repo, { "logs/c.log": "x\n", "logs/d.log": "x\n" });
  repo.git.trackedIgnored = ["logs/c.log", "logs/d.log"];

  const result = run(repo);

  assert.equal(result.exit, 0, `stderr: ${result.stderr}`);
  assert.deepEqual(pick(lines(result.stdout), "cand:"), ["cand: lib files 3 bytes 6 plain"]);
});

/** `count` two-byte files named f00.ts, f01.ts... inside `dir`. */
function many(dir: string, count: number): Record<string, string> {
  const files: Record<string, string> = {};
  for (let i = 0; i < count; i++) files[`${dir}/f${String(i).padStart(2, "0")}.ts`] = "x\n";
  return files;
}

test("past depth 2 a directory is a candidate only with its own manifest, or twenty files while it is no passthrough", () => {
  const repo = seed({
    "CLAUDE.md": node(40),
    "pkgs/web/app/package.json": "{}\n",
    "pkgs/web/app/index.js": "x\n",
    ...many("src/mod/big", 20),
    ...many("src/mod/small", 19),
    ...many("lib/core/wrap/inner", 20),
  });

  const result = run(repo);

  assert.equal(result.exit, 0, `stderr: ${result.stderr}`);
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

/** The one `state:` line of a map. */
function state(out: string[]): string {
  return pick(out, "state:")[0];
}

test("state reads complete when a root node exists and no candidate is left without one", () => {
  const repo = seed({
    "CLAUDE.md": node(40),
    "src/CLAUDE.md": node(40),
    "src/a.ts": "x\n",
    "src/b.ts": "x\n",
    "src/c.ts": "x\n",
  });

  const result = run(repo);

  assert.equal(result.exit, 0, `stderr: ${result.stderr}`);
  const out = lines(result.stdout);
  assert.deepEqual(pick(out, "cand:"), []);
  assert.equal(state(out), "state: complete");
});

test("state reads partial while a candidate is still without a node", () => {
  const repo = seed({
    "CLAUDE.md": node(40),
    "src/a.ts": "x\n",
    "src/b.ts": "x\n",
    "src/c.ts": "x\n",
  });

  const result = run(repo);

  assert.equal(result.exit, 0, `stderr: ${result.stderr}`);
  const out = lines(result.stdout);
  assert.deepEqual(pick(out, "cand:"), ["cand: src files 3 bytes 6 plain"]);
  assert.equal(state(out), "state: partial");
});

test("state reads partial while nodes exist but the root node does not", () => {
  const repo = seed({
    "src/CLAUDE.md": node(40),
    "src/a.ts": "x\n",
    "src/b.ts": "x\n",
    "src/c.ts": "x\n",
  });

  const result = run(repo);

  assert.equal(result.exit, 0, `stderr: ${result.stderr}`);
  const out = lines(result.stdout);
  assert.deepEqual(pick(out, "cand:"), []);
  assert.equal(state(out), "state: partial");
});

test("a node carrying uncommitted work is dirty, and an untracked one is no node at all", () => {
  const repo = seed({
    "CLAUDE.md": node(40),
    "docs/CLAUDE.md": node(40),
    "docs/guide.md": "x\n",
  });
  write(repo, {
    "CLAUDE.md": node(60),
    "new/CLAUDE.md": node(40),
  });

  const result = run(repo);

  assert.equal(result.exit, 0, `stderr: ${result.stderr}`);
  const out = lines(result.stdout);
  assert.deepEqual(pick(out, "dirty:"), [
    "dirty: CLAUDE.md modified",
    "dirty: new/CLAUDE.md untracked",
  ]);
  assert.deepEqual(pick(out, "total:"), ["total: nodes 2"]);
});

test("a node deleted by --reset and left unstaged is no node, carries no dirty entry, and its directory is a candidate again", () => {
  const repo = seed({
    "CLAUDE.md": node(40),
    "docs/CLAUDE.md": node(40),
    "docs/a.md": "x\n",
    "docs/b.md": "x\n",
    "docs/c.md": "x\n",
  });

  const reset = run(repo, ["--reset", "docs/CLAUDE.md"]);
  assert.equal(reset.exit, 0, `stderr: ${reset.stderr}`);
  drop(repo, "docs/CLAUDE.md");

  const result = run(repo);

  assert.equal(result.exit, 0, `stderr: ${result.stderr}`);
  const out = lines(result.stdout);
  assert.deepEqual(pick(out, "node:"), ["node: CLAUDE.md 40 chain 40 ok"]);
  assert.deepEqual(pick(out, "dirty:"), []);
  assert.deepEqual(pick(out, "cand:"), ["cand: docs files 3 bytes 6 plain"]);
  assert.deepEqual(pick(out, "total:"), ["total: nodes 1"]);
});

test("a node deleted with git rm, staged but uncommitted, is no node, carries no dirty entry, and its directory is a candidate again", () => {
  const repo = seed({
    "CLAUDE.md": node(40),
    "docs/CLAUDE.md": node(40),
    "docs/a.md": "x\n",
    "docs/b.md": "x\n",
    "docs/c.md": "x\n",
  });
  // staged: out of the index, its deletion reported under its first letter
  repo.fs.remove(`${ROOT}/docs/CLAUDE.md`);
  repo.git.tracked = repo.git.tracked.filter((file) => file.path !== "docs/CLAUDE.md");
  repo.git.status?.push({ code: "D ", path: "docs/CLAUDE.md" });

  const result = run(repo);

  assert.equal(result.exit, 0, `stderr: ${result.stderr}`);
  const out = lines(result.stdout);
  assert.deepEqual(pick(out, "node:"), ["node: CLAUDE.md 40 chain 40 ok"]);
  assert.deepEqual(pick(out, "dirty:"), []);
  assert.deepEqual(pick(out, "cand:"), ["cand: docs files 3 bytes 6 plain"]);
  assert.deepEqual(pick(out, "total:"), ["total: nodes 1"]);
});

test("a tracked root CLAUDE.md deleted but not staged is absent: it does not complete the state, and measuring it prints nothing on stderr", () => {
  const repo = seed({
    "CLAUDE.md": node(40),
    "a/CLAUDE.md": node(40),
    "a/b/CLAUDE.md": node(40),
  });
  drop(repo, "CLAUDE.md");

  const result = run(repo);

  assert.equal(result.exit, 0, `stderr: ${result.stderr}`);
  assert.equal(result.stderr, "");
  const out = lines(result.stdout);
  assert.notEqual(state(out), "state: complete");
  assert.deepEqual(pick(out, "node:"), [
    "node: a/CLAUDE.md 40 chain 40 ok",
    "node: a/b/CLAUDE.md 40 chain 80 ok",
  ]);
  assert.deepEqual(pick(out, "total:"), ["total: nodes 2"]);
});

test("--reset still refuses a target whose earlier deletion was left uncommitted and unstaged", () => {
  const repo = seed({
    "CLAUDE.md": node(40),
    "a/CLAUDE.md": node(40),
  });

  const first = run(repo, ["--reset", "a/CLAUDE.md"]);
  assert.equal(first.exit, 0, `stderr: ${first.stderr}`);
  drop(repo, "a/CLAUDE.md");

  const result = run(repo, ["--reset", "a/CLAUDE.md"]);

  assert.equal(result.exit, 3, `stderr: ${result.stderr}`);
  assert.deepEqual(lines(result.stdout), ["refused: a/CLAUDE.md modified"]);
  assert.equal(exists(repo, "CLAUDE.md"), true);
});

test("a directory that is no repository at all maps as the empty layer and still exits 0", () => {
  const result = runMemoryMap([], "/plain", SCRIPT, { fs: fakeFs({ "/plain/CLAUDE.md": node(40) }), git: fakeGit(null), clock: fakeClock(AT) });

  assert.equal(result.exit, 0, `stderr: ${result.stderr}`);
  const out = lines(result.stdout);
  assert.equal(out[0], "# viber memory map");
  assert.deepEqual(out.slice(2), ["state: none", "total: nodes 0"]);
});

test("run from a subdirectory, the map and --reset still read every path relative to the repository root", () => {
  const repo = seed({
    "CLAUDE.md": node(40),
    "docs/CLAUDE.md": node(40),
    "docs/guide.md": "x\n",
  });
  const sub = `${ROOT}/docs`;

  const fromRoot = lines(run(repo).stdout).slice(2);
  const map = run(repo, [], sub);
  assert.equal(map.exit, 0, `stderr: ${map.stderr}`);
  assert.deepEqual(lines(map.stdout).slice(2), fromRoot);

  const reset = run(repo, ["--reset", "docs/CLAUDE.md"], sub);
  assert.equal(reset.exit, 0, `stderr: ${reset.stderr}`);
  assert.deepEqual(lines(reset.stdout), ["removed: docs/CLAUDE.md", "removed: 1"]);
  assert.equal(exists(repo, "docs/CLAUDE.md"), false);
});

test("--reset refuses a target that is not a node, one that is tracked nowhere and one that is untracked", () => {
  const repo = seed({ "CLAUDE.md": node(40), "README.md": "readme\n" });
  write(repo, { "new/CLAUDE.md": node(40) });

  const result = run(repo, [
    "--reset",
    "CLAUDE.md",
    "README.md",
    "gone/CLAUDE.md",
    "new/CLAUDE.md",
  ]);

  assert.equal(result.exit, 3, `stderr: ${result.stderr}`);
  assert.deepEqual(lines(result.stdout), [
    "refused: README.md not-a-node",
    "refused: gone/CLAUDE.md not-a-node",
    "refused: new/CLAUDE.md untracked",
  ]);
  assert.equal(exists(repo, "CLAUDE.md"), true);
  assert.equal(exists(repo, "new/CLAUDE.md"), true);
});

test("a repository with tracked files but no node at all is state none, its candidates still listed", () => {
  const repo = seed({
    "README.md": "readme\n",
    "src/a.ts": "x\n",
    "src/b.ts": "x\n",
    "src/c.ts": "x\n",
  });

  const result = run(repo);

  assert.equal(result.exit, 0, `stderr: ${result.stderr}`);
  const out = lines(result.stdout);
  assert.equal(state(out), "state: none");
  assert.deepEqual(pick(out, "node:"), []);
  assert.deepEqual(pick(out, "cand:"), ["cand: src files 3 bytes 6 plain"]);
  assert.deepEqual(pick(out, "total:"), ["total: nodes 0"]);
});

test("--reset with no path at all deletes nothing and exits 2", () => {
  const repo = seed({ "CLAUDE.md": node(40) });

  const result = run(repo, ["--reset"]);

  assert.equal(result.exit, 2);
  assert.equal(result.stdout, "");
  assert.equal(exists(repo, "CLAUDE.md"), true);
});

test("a tracked section is one section line with its own size and flag, never counted toward a chain or the node total", () => {
  const root = "read CLAUDE.release.md before a release\n";
  const docs = "read CLAUDE.tests.md before editing tests\n";
  const repo = seed({
    "CLAUDE.md": root,
    "CLAUDE.release.md": node(12001),
    "docs/CLAUDE.md": docs,
    "docs/CLAUDE.tests.md": node(300),
    "docs/guide.md": "x\n",
  });

  const result = run(repo);

  assert.equal(result.exit, 0, `stderr: ${result.stderr}`);
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

test("a section with no node beside it, or one its node never names, is unlinked", () => {
  const repo = seed({
    "CLAUDE.md": node(40),
    "CLAUDE.tests.md": node(40),
    "lib/CLAUDE.api.md": node(40),
    "lib/a.ts": "x\n",
  });

  const result = run(repo);

  assert.equal(result.exit, 0, `stderr: ${result.stderr}`);
  assert.deepEqual(pick(lines(result.stdout), "unlinked:"), [
    "unlinked: CLAUDE.tests.md",
    "unlinked: lib/CLAUDE.api.md",
  ]);
});

test("CLAUDE.local.md and a name outside the topic alphabet are no section (the user's own auto-loaded file is never a section)", () => {
  const repo = seed({
    "CLAUDE.md": node(40),
    "CLAUDE.local.md": node(40),
    "CLAUDE.Tests.md": node(40),
    "CLAUDE.a.b.md": node(40),
  });

  const result = run(repo);

  assert.equal(result.exit, 0, `stderr: ${result.stderr}`);
  const out = lines(result.stdout);
  assert.deepEqual(pick(out, "section:"), []);
  assert.deepEqual(pick(out, "unlinked:"), []);
});

test("a node whose only other file is its own section is still an orphan", () => {
  const repo = seed({
    "CLAUDE.md": node(40),
    "README.md": "readme\n",
    "lonely/CLAUDE.md": `read CLAUDE.tests.md before editing tests\n`,
    "lonely/CLAUDE.tests.md": node(40),
    "kept/CLAUDE.md": node(40),
    "kept/CLAUDE.local.md": node(40),
  });

  const result = run(repo);

  assert.equal(result.exit, 0, `stderr: ${result.stderr}`);
  assert.deepEqual(pick(lines(result.stdout), "orphan:"), ["orphan: lonely/CLAUDE.md"]);
});

test("a section carrying uncommitted work is dirty, and an untracked one is no section at all", () => {
  const repo = seed({
    "CLAUDE.md": `read CLAUDE.tests.md before editing tests\n`,
    "CLAUDE.tests.md": node(40),
  });
  write(repo, {
    "CLAUDE.tests.md": node(60),
    "CLAUDE.release.md": node(40),
  });

  const result = run(repo);

  assert.equal(result.exit, 0, `stderr: ${result.stderr}`);
  const out = lines(result.stdout);
  assert.deepEqual(pick(out, "section:"), ["section: CLAUDE.tests.md 60 ok"]);
  assert.deepEqual(pick(out, "dirty:"), [
    "dirty: CLAUDE.tests.md modified",
    "dirty: CLAUDE.release.md untracked",
  ]);
});

test("--reset of a node also deletes every tracked section beside it, one removed line per file", () => {
  const repo = seed({
    "CLAUDE.md": node(40),
    "CLAUDE.release.md": node(40),
    "docs/CLAUDE.md": node(40),
    "docs/CLAUDE.tests.md": node(40),
    "docs/api/CLAUDE.api.md": node(40),
  });

  const result = run(repo, ["--reset", "docs/CLAUDE.md", "docs/CLAUDE.tests.md"]);

  assert.equal(result.exit, 0, `stderr: ${result.stderr}`);
  assert.deepEqual(lines(result.stdout), [
    "removed: docs/CLAUDE.md",
    "removed: docs/CLAUDE.tests.md",
    "removed: 2",
  ]);
  assert.equal(exists(repo, "docs/CLAUDE.tests.md"), false);
  assert.equal(exists(repo, "docs/api/CLAUDE.api.md"), true);
  assert.equal(exists(repo, "CLAUDE.release.md"), true);
});

test("a modified section beside a node refuses the whole --reset and deletes nothing", () => {
  const repo = seed({
    "CLAUDE.md": node(40),
    "a/CLAUDE.md": node(40),
    "a/CLAUDE.tests.md": node(40),
  });
  write(repo, { "a/CLAUDE.tests.md": node(60) });

  const result = run(repo, ["--reset", "CLAUDE.md", "a/CLAUDE.md"]);

  assert.equal(result.exit, 3, `stderr: ${result.stderr}`);
  assert.deepEqual(lines(result.stdout), ["refused: a/CLAUDE.tests.md modified"]);
  assert.equal(exists(repo, "CLAUDE.md"), true);
  assert.equal(exists(repo, "a/CLAUDE.md"), true);
});

test("a tracked section deleted but not committed is no section, measuring it prints nothing on stderr, and --reset of its node is refused", () => {
  const repo = seed({
    "CLAUDE.md": `read CLAUDE.tests.md before editing tests\n`,
    "CLAUDE.tests.md": node(40),
  });
  drop(repo, "CLAUDE.tests.md");

  const result = run(repo);

  assert.equal(result.exit, 0, `stderr: ${result.stderr}`);
  assert.equal(result.stderr, "");
  const out = lines(result.stdout);
  assert.deepEqual(pick(out, "section:"), []);
  assert.deepEqual(pick(out, "unlinked:"), []);
  assert.deepEqual(pick(out, "dirty:"), []);

  const reset = run(repo, ["--reset", "CLAUDE.md"]);
  assert.equal(reset.exit, 3, `stderr: ${reset.stderr}`);
  assert.deepEqual(lines(reset.stdout), ["refused: CLAUDE.tests.md modified"]);
  assert.equal(exists(repo, "CLAUDE.md"), true);
});

test("a section beside an untracked node is unlinked (an untracked node is no node)", () => {
  const repo = seed({ "CLAUDE.tests.md": node(40), "README.md": "readme\n" });
  write(repo, { "CLAUDE.md": `read CLAUDE.tests.md before editing tests\n` });

  const result = run(repo);

  assert.equal(result.exit, 0, `stderr: ${result.stderr}`);
  assert.deepEqual(pick(lines(result.stdout), "unlinked:"), ["unlinked: CLAUDE.tests.md"]);
});

test("--reset of a node leaves an untracked section beside it, and refuses an untracked section named on its own", () => {
  const repo = seed({ "CLAUDE.md": node(40), "a/CLAUDE.md": node(40) });
  write(repo, { "a/CLAUDE.tests.md": node(40), "CLAUDE.new.md": node(40) });

  const refused = run(repo, ["--reset", "CLAUDE.new.md"]);
  assert.equal(refused.exit, 3, `stderr: ${refused.stderr}`);
  assert.deepEqual(lines(refused.stdout), ["refused: CLAUDE.new.md untracked"]);

  const result = run(repo, ["--reset", "a/CLAUDE.md"]);

  assert.equal(result.exit, 0, `stderr: ${result.stderr}`);
  assert.deepEqual(lines(result.stdout), ["removed: a/CLAUDE.md", "removed: 1"]);
  assert.equal(exists(repo, "a/CLAUDE.tests.md"), true);
});

test("--reset of a section alone deletes that section and leaves its node", () => {
  const repo = seed({
    "CLAUDE.md": node(40),
    "CLAUDE.tests.md": node(40),
    "CLAUDE.release.md": node(40),
  });

  const result = run(repo, ["--reset", "CLAUDE.tests.md"]);

  assert.equal(result.exit, 0, `stderr: ${result.stderr}`);
  assert.deepEqual(lines(result.stdout), ["removed: CLAUDE.tests.md", "removed: 1"]);
  assert.equal(exists(repo, "CLAUDE.md"), true);
  assert.equal(exists(repo, "CLAUDE.release.md"), true);
});

test("an unknown argument is refused with no map printed", () => {
  const repo = seed({ "CLAUDE.md": node(40) });

  const result = run(repo, ["--wipe"]);

  assert.equal(result.exit, 2);
  assert.equal(result.stdout, "");
});

/** `--targets <mode> ...args`, the call a mode of the memory command makes. */
function targets(repo: Repo, ...args: string[]) {
  return run(repo, ["--targets", ...args]);
}

test("--targets review prints one fix line per node, root first then by depth, and no create line for a candidate", () => {
  const repo = seed({
    "CLAUDE.md": node(100),
    "docs/CLAUDE.md": node(50),
    "docs/deep/CLAUDE.md": node(30),
    "api/v1/CLAUDE.md": node(12001),
    "src/a.ts": "x\n",
    "src/b.ts": "x\n",
    "src/c.ts": "x\n",
  });

  const result = targets(repo, "review");

  assert.equal(result.exit, 0, `stderr: ${result.stderr}`);
  assert.deepEqual(lines(result.stdout), [
    "target: fix CLAUDE.md 100 chain 100 ok",
    "target: fix docs/CLAUDE.md 50 chain 150 ok",
    "target: fix api/v1/CLAUDE.md 12001 chain 12101 OVER-NODE",
    "target: fix docs/deep/CLAUDE.md 30 chain 180 ok",
    "NEXT: approve",
  ]);
});

test("--targets extend prints a create line per candidate and per unlinked section with no node beside it, never one for a section whose node exists", () => {
  const repo = seed({
    "CLAUDE.md": node(40),
    "src/a.ts": "x\n",
    "src/b.ts": "x\n",
    "src/c.ts": "x\n",
    "lib/CLAUDE.api.md": node(40),
    "lib/a.ts": "x\n",
    "docs/CLAUDE.md": node(40),
    "docs/CLAUDE.tests.md": node(40),
    "docs/g.md": "x\n",
  });

  const result = targets(repo, "extend");

  assert.equal(result.exit, 0, `stderr: ${result.stderr}`);
  assert.deepEqual(lines(result.stdout), [
    "target: create src/CLAUDE.md files 3 bytes 6 plain",
    "target: create lib/CLAUDE.md unlinked lib/CLAUDE.api.md",
    "NEXT: approve",
  ]);
});

test("--targets extend adds the repository root as a create target when the map carries no root node", () => {
  const repo = seed({ "src/CLAUDE.md": node(40), "src/a.ts": "x\n" });

  const result = targets(repo, "extend");

  assert.equal(result.exit, 0, `stderr: ${result.stderr}`);
  assert.deepEqual(lines(result.stdout), ["target: create CLAUDE.md root", "NEXT: approve"]);
});

test("--targets both prints the fix lines, then the create lines of candidates, unlinked sections and the root", () => {
  const repo = seed({
    "docs/CLAUDE.md": node(50),
    "docs/g.md": "x\n",
    "src/a.ts": "x\n",
    "src/b.ts": "x\n",
    "src/c.ts": "x\n",
    "lib/CLAUDE.api.md": node(40),
    "lib/a.ts": "x\n",
  });

  const result = targets(repo, "both");

  assert.equal(result.exit, 0, `stderr: ${result.stderr}`);
  assert.deepEqual(lines(result.stdout), [
    "target: fix docs/CLAUDE.md 50 chain 50 ok",
    "target: create src/CLAUDE.md files 3 bytes 6 plain",
    "target: create lib/CLAUDE.md unlinked lib/CLAUDE.api.md",
    "target: create CLAUDE.md root",
    "NEXT: approve",
  ]);
});

test("--targets reset prints a create line per candidate and per directory the removed nodes and sections emptied, the candidate form winning for a directory in both", () => {
  const repo = seed({
    "CLAUDE.md": node(40),
    "docs/CLAUDE.md": node(40),
    "docs/CLAUDE.tests.md": node(40),
    "docs/a.md": "x\n",
    "docs/b.md": "x\n",
    "docs/c.md": "x\n",
    "other/CLAUDE.md": node(40),
    "other/x.md": "x\n",
    "src/a.ts": "x\n",
    "src/b.ts": "x\n",
    "src/c.ts": "x\n",
  });
  drop(repo, "docs/CLAUDE.md");
  drop(repo, "docs/CLAUDE.tests.md");
  drop(repo, "other/CLAUDE.md");

  const result = targets(
    repo,
    "reset",
    "--removed",
    "docs/CLAUDE.md",
    "--removed",
    "docs/CLAUDE.tests.md",
    "--removed",
    "other/CLAUDE.md",
  );

  assert.equal(result.exit, 0, `stderr: ${result.stderr}`);
  assert.deepEqual(lines(result.stdout), [
    "target: create docs/CLAUDE.md files 3 bytes 6 plain",
    "target: create src/CLAUDE.md files 3 bytes 6 plain",
    "target: create other/CLAUDE.md removed",
    "NEXT: approve",
  ]);
});

test("--targets reset names the root once when the root node and a root section are both removed", () => {
  const repo = seed({
    "CLAUDE.md": node(40),
    "CLAUDE.release.md": node(40),
    "README.md": "x\n",
  });
  drop(repo, "CLAUDE.md");
  drop(repo, "CLAUDE.release.md");

  const result = targets(repo, "reset", "--removed", "CLAUDE.md", "--removed", "CLAUDE.release.md");

  assert.equal(result.exit, 0, `stderr: ${result.stderr}`);
  assert.deepEqual(lines(result.stdout), ["target: create CLAUDE.md removed", "NEXT: approve"]);
});

test("--targets reset gives no create line to a directory whose node survives a removed section", () => {
  const repo = seed({
    "CLAUDE.md": node(40),
    "a/CLAUDE.md": node(40),
    "a/CLAUDE.tests.md": node(40),
  });
  drop(repo, "a/CLAUDE.tests.md");

  const result = targets(repo, "reset", "--removed", "a/CLAUDE.tests.md");

  assert.equal(result.exit, 0, `stderr: ${result.stderr}`);
  assert.equal(result.stdout, "NEXT: none\n");
});

test("--targets reset gives a create line to the directory a removed section with no node beside it emptied", () => {
  const repo = seed({
    "CLAUDE.md": node(40),
    "lib/CLAUDE.api.md": node(40),
    "lib/a.ts": "x\n",
  });
  drop(repo, "lib/CLAUDE.api.md");

  const result = targets(repo, "reset", "--removed", "lib/CLAUDE.api.md");

  assert.equal(result.exit, 0, `stderr: ${result.stderr}`);
  assert.deepEqual(lines(result.stdout), ["target: create lib/CLAUDE.md removed", "NEXT: approve"]);
});

test("--targets reset with no --removed path exits 2 with one error line and an empty stdout", () => {
  const repo = seed({ "CLAUDE.md": node(40) });

  const result = targets(repo, "reset");

  assert.equal(result.exit, 2);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /^error: [^\n]+\n$/);
});

test("a directory that is a candidate and holds an unlinked section gets the one candidate create line", () => {
  const repo = seed({
    "CLAUDE.md": node(40),
    "lib/CLAUDE.api.md": node(40),
    "lib/a.ts": "x\n",
    "lib/b.ts": "x\n",
    "lib/c.ts": "x\n",
  });

  const result = targets(repo, "extend");

  assert.equal(result.exit, 0, `stderr: ${result.stderr}`);
  assert.deepEqual(lines(result.stdout), [
    "target: create lib/CLAUDE.md files 4 bytes 46 plain",
    "NEXT: approve",
  ]);
});

test("an unlinked root section wins over the root form, so the root gets the one unlinked create line", () => {
  const repo = seed({ "CLAUDE.release.md": node(40), "README.md": "x\n" });

  const result = targets(repo, "extend");

  assert.equal(result.exit, 0, `stderr: ${result.stderr}`);
  assert.deepEqual(lines(result.stdout), [
    "target: create CLAUDE.md unlinked CLAUDE.release.md",
    "NEXT: approve",
  ]);
});

test("a directory holding a section on a dirty line gets no create line (the section is the user's uncommitted work)", () => {
  const repo = seed({
    "CLAUDE.md": node(40),
    "src/a.ts": "x\n",
    "src/b.ts": "x\n",
    "src/c.ts": "x\n",
  });
  write(repo, { "src/CLAUDE.notes.md": node(40) });

  const result = targets(repo, "extend");

  assert.equal(result.exit, 0, `stderr: ${result.stderr}`);
  assert.equal(result.stdout, "NEXT: none\n");
});

test("--targets review on a layer with no node prints NEXT: none alone", () => {
  const repo = seed({ "README.md": "x\n" });

  const result = targets(repo, "review");

  assert.equal(result.exit, 0, `stderr: ${result.stderr}`);
  assert.equal(result.stdout, "NEXT: none\n");
});

test("--targets with an unknown mode exits 2 with one error line and an empty stdout", () => {
  const repo = seed({ "CLAUDE.md": node(40) });

  const result = targets(repo, "wipe");

  assert.equal(result.exit, 2);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /^error: [^\n]+\n$/);
});

test("a --removed path outside the reset mode exits 2 with one error line and an empty stdout", () => {
  const repo = seed({ "CLAUDE.md": node(40) });

  const result = targets(repo, "extend", "--removed", "CLAUDE.md");

  assert.equal(result.exit, 2);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /^error: [^\n]+\n$/);
});

/** `--targets <mode> --id <id> --keep <path>...`, the call that follows the approval of the targets. */
function kept(repo: Repo, mode: string, ...keep: string[]) {
  return targets(repo, mode, "--id", MAP_ID, ...keep.flatMap((p) => ["--keep", p]));
}

test("--keep prints the planned set first: every node of the map plus the node of each kept create target, root first then by depth", () => {
  const repo = seed({
    "CLAUDE.md": node(40),
    "docs/CLAUDE.md": node(40),
    "api/v1/CLAUDE.md": node(40),
    "src/a.ts": "x\n",
    "src/b.ts": "x\n",
    "src/c.ts": "x\n",
    "lib/a.ts": "x\n",
    "lib/b.ts": "x\n",
    "lib/c.ts": "x\n",
  });

  const result = kept(repo, "both", "docs/CLAUDE.md", "src/CLAUDE.md");

  assert.equal(result.exit, 0, `stderr: ${result.stderr}`);
  assert.equal(lines(result.stdout)[0], "planned: CLAUDE.md,docs/CLAUDE.md,src/CLAUDE.md,api/v1/CLAUDE.md");
});

test("--keep prints one memory-auditor block per kept fix target in the planned order, each with its target, scope, out and refs lines, a create target getting none", () => {
  const repo = seed({
    "CLAUDE.md": node(40),
    "docs/CLAUDE.md": node(40),
    "api/v1/CLAUDE.md": node(40),
    "src/a.ts": "x\n",
    "src/b.ts": "x\n",
    "src/c.ts": "x\n",
  });

  const result = kept(repo, "both", "api/v1/CLAUDE.md", "src/CLAUDE.md", "CLAUDE.md");

  const out = lines(result.stdout);
  assert.equal(result.exit, 0, `stderr: ${result.stderr}`);
  assert.deepEqual(
    out.filter((l) => !l.startsWith("refs: ")),
    [
      "planned: CLAUDE.md,docs/CLAUDE.md,src/CLAUDE.md,api/v1/CLAUDE.md",
      "NEXT: memory-auditor",
      "target: CLAUDE.md",
      "scope: .",
      `out: .temp/viber/${MAP_ID}/`,
      "NEXT: memory-auditor",
      "target: api/v1/CLAUDE.md",
      "scope: api/v1",
      `out: .temp/viber/${MAP_ID}/`,
    ],
  );
  assert.match(out.filter((l) => l.startsWith("refs: ")).join("\n"), /^refs: .+\/viber\/references\nrefs: .+\/viber\/references$/);
});

test("--keep with no kept fix target prints the planned set and NEXT: none", () => {
  const repo = seed({
    "CLAUDE.md": node(40),
    "src/a.ts": "x\n",
    "src/b.ts": "x\n",
    "src/c.ts": "x\n",
  });

  const result = kept(repo, "both", "src/CLAUDE.md");

  assert.equal(result.exit, 0, `stderr: ${result.stderr}`);
  assert.equal(result.stdout, "planned: CLAUDE.md,src/CLAUDE.md\nNEXT: none\n");
});

test("a block carries a shape line per heading outside the template, per heading out of order and per empty heading, the node first then its sections alphabetically (a heading line is read without its trailing spaces)", () => {
  const repo = seed({
    "CLAUDE.md": node(40),
    "docs/CLAUDE.md": body(
      "## Traps\n\n- trap\n",
      "## Terms\n\n- term\n",
      "## Overview   \n\n- o\n",
      "## Commands\n",
      "## Relationships\n\n- r\n",
    ),
    "docs/CLAUDE.tests.md": body("## Traps\n\n"),
    "docs/CLAUDE.api.md": body("## Zebra\n\n- z\n"),
  });

  const result = kept(repo, "review", "docs/CLAUDE.md");

  assert.equal(result.exit, 0, `stderr: ${result.stderr}`);
  assert.deepEqual(
    lines(result.stdout).filter((l) => l.startsWith("shape: ")),
    [
      "shape: CLAUDE.md: out of order: Traps",
      "shape: CLAUDE.md: heading outside the template: Overview",
      "shape: CLAUDE.md: out of order: Commands",
      "shape: CLAUDE.md: empty heading: Commands",
      "shape: CLAUDE.api.md: heading outside the template: Zebra",
      "shape: CLAUDE.tests.md: empty heading: Traps",
    ],
  );
});

test("a ## line inside a fenced block is no heading, and the fence is content of the heading above it", () => {
  const repo = seed({
    "CLAUDE.md": node(40),
    "docs/CLAUDE.md": body("## Commands\n\n```sh\n## Bogus\n# note\n```\n"),
  });

  const result = kept(repo, "review", "docs/CLAUDE.md");

  assert.equal(result.exit, 0, `stderr: ${result.stderr}`);
  assert.deepEqual(lines(result.stdout).filter((l) => l.startsWith("shape: ")), []);
});

test("a ### line is content, so a heading holding nothing else is no empty heading", () => {
  const repo = seed({
    "CLAUDE.md": node(40),
    "docs/CLAUDE.md": body("## Terms\n\n### Detail\n"),
  });

  const result = kept(repo, "review", "docs/CLAUDE.md");

  assert.equal(result.exit, 0, `stderr: ${result.stderr}`);
  assert.deepEqual(lines(result.stdout).filter((l) => l.startsWith("shape: ")), []);
});

test("the root node and a section beside it carry no shape line", () => {
  const repo = seed({
    "CLAUDE.md": body("## Zebra\n\n- z\n"),
    "CLAUDE.release.md": body("## Zebra\n"),
    "src/a.ts": "x\n",
  });

  const result = kept(repo, "review", "CLAUDE.md");

  assert.equal(result.exit, 0, `stderr: ${result.stderr}`);
  assert.deepEqual(lines(result.stdout).filter((l) => l.startsWith("shape: ")), []);
});

test("an untracked section beside a node carries no shape line", () => {
  const repo = seed({
    "CLAUDE.md": node(40),
    "docs/CLAUDE.md": body("## Terms\n\n- t\n"),
  });
  write(repo, { "docs/CLAUDE.notes.md": body("## Zebra\n\n- z\n") });

  const result = kept(repo, "review", "docs/CLAUDE.md");

  assert.equal(result.exit, 0, `stderr: ${result.stderr}`);
  assert.deepEqual(lines(result.stdout).filter((l) => l.startsWith("shape: ")), []);
});

test("## Sections is a heading outside the template in a section and a listed one in a node", () => {
  const repo = seed({
    "CLAUDE.md": node(40),
    "docs/CLAUDE.md": body("## Terms\n\n- t\n", "## Sections\n\n- s\n"),
    "docs/CLAUDE.tests.md": body("## Sections\n\n- s\n"),
  });

  const result = kept(repo, "review", "docs/CLAUDE.md");

  assert.equal(result.exit, 0, `stderr: ${result.stderr}`);
  assert.deepEqual(
    lines(result.stdout).filter((l) => l.startsWith("shape: ")),
    ["shape: CLAUDE.tests.md: heading outside the template: Sections"],
  );
});

test("a --keep path that is no target of the mode exits 2 with one error line and an empty stdout", () => {
  const repo = seed({
    "CLAUDE.md": node(40),
    "src/a.ts": "x\n",
    "src/b.ts": "x\n",
    "src/c.ts": "x\n",
  });

  const result = kept(repo, "review", "src/CLAUDE.md");

  assert.equal(result.exit, 2);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /^error: [^\n]+\n$/);
});

test("--targets extend prints the create line of a candidate directory whose name holds a space under its full path", () => {
  const repo = seed({
    "CLAUDE.md": node(40),
    "My Docs/a.md": "x\n",
    "My Docs/b.md": "x\n",
    "My Docs/c.md": "x\n",
  });

  const result = targets(repo, "extend");

  assert.equal(result.exit, 0, `stderr: ${result.stderr}`);
  assert.deepEqual(lines(result.stdout), ["target: create My Docs/CLAUDE.md files 3 bytes 6 plain", "NEXT: approve"]);
});

test("--keep of the create target of a directory holding a space puts its full path in the planned set", () => {
  const repo = seed({
    "CLAUDE.md": node(40),
    "My Docs/a.md": "x\n",
    "My Docs/b.md": "x\n",
    "My Docs/c.md": "x\n",
  });

  const result = kept(repo, "extend", "My Docs/CLAUDE.md");

  assert.equal(result.exit, 0, `stderr: ${result.stderr}`);
  assert.equal(result.stdout, "planned: CLAUDE.md,My Docs/CLAUDE.md\nNEXT: none\n");
});

test("--keep of the fix target of a node whose directory holds a space gives its auditor block the full path in target and scope", () => {
  const repo = seed({ "CLAUDE.md": node(40), "My Docs/CLAUDE.md": node(40), "My Docs/a.md": "x\n" });

  const result = kept(repo, "review", "My Docs/CLAUDE.md");

  assert.equal(result.exit, 0, `stderr: ${result.stderr}`);
  assert.deepEqual(
    lines(result.stdout).filter((l) => !l.startsWith("refs: ")),
    [
      "planned: CLAUDE.md,My Docs/CLAUDE.md",
      "NEXT: memory-auditor",
      "target: My Docs/CLAUDE.md",
      "scope: My Docs",
      `out: .temp/viber/${MAP_ID}/`,
    ],
  );
});

test("a --keep path naming only the first word of a target path holding a space exits 2 (the path is no target)", () => {
  const repo = seed({
    "CLAUDE.md": node(40),
    "My Docs/a.md": "x\n",
    "My Docs/b.md": "x\n",
    "My Docs/c.md": "x\n",
  });

  const result = kept(repo, "extend", "My");

  assert.equal(result.exit, 2);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /^error: [^\n]+\n$/);
});

test("--keep without --id exits 2 with one error line and an empty stdout", () => {
  const repo = seed({ "CLAUDE.md": node(40) });

  const result = targets(repo, "review", "--keep", "CLAUDE.md");

  assert.equal(result.exit, 2);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /^error: [^\n]+\n$/);
});

test("--id without --keep exits 2 with one error line and an empty stdout", () => {
  const repo = seed({ "CLAUDE.md": node(40) });

  const result = targets(repo, "review", "--id", MAP_ID);

  assert.equal(result.exit, 2);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /^error: [^\n]+\n$/);
});

/** `--reconcile --planned <planned> ...rest`, the call the memory command makes after its write waves. */
function reconcile(repo: Repo, planned: string[], ...rest: string[]) {
  return run(repo, ["--reconcile", "--planned", planned.join(","), ...rest]);
}

/** stdout lines with the plugin-root path of each `refs:` line replaced by a fixed word. */
function reconciled(stdout: string): string[] {
  return lines(stdout).map((l) => (/^refs: .+\/viber\/references$/.test(l) ? "refs: REFS" : l));
}

/** The reconcile writer block of `node` for `wave`, `planned` being its `planned:` value. */
function writerBlock(wave: number, nodePath: string, planned: string): string[] {
  return [
    `NEXT: memory-node-writer | wave: ${wave}`,
    "mode: fix",
    `node: ${nodePath}`,
    "findings: none",
    `planned: ${planned}`,
    "refs: REFS",
  ];
}

test("--reconcile counts a planned path present in the tree and a present CLAUDE.md of a write wave --files outside the plan, an untracked one among them, and never another untracked node", () => {
  const repo = seed({ "CLAUDE.md": node(40), "docs/CLAUDE.md": node(40) });
  present(repo, "lib/CLAUDE.md", "api/CLAUDE.md", "docs/new/CLAUDE.md", "docs/ghost/CLAUDE.md");

  const result = reconcile(
    repo,
    ["CLAUDE.md", "docs/CLAUDE.md", "docs/a/CLAUDE.md", "lib/CLAUDE.md"],
    "--fix", "docs/CLAUDE.md", "--files", "docs/CLAUDE.md,api/CLAUDE.md,docs/new/CLAUDE.md",
  );

  assert.equal(result.exit, 0, `stderr: ${result.stderr}`);
  assert.deepEqual(
    reconciled(result.stdout),
    writerBlock(1, "docs/CLAUDE.md", "CLAUDE.md,api/CLAUDE.md,docs/CLAUDE.md,lib/CLAUDE.md,docs/new/CLAUDE.md"),
  );
});

test("--reconcile never marks a node absent from the tree off, whatever was created below it", () => {
  const repo = seed({});
  present(repo, "CLAUDE.md", "src/x/CLAUDE.md");

  const result = reconcile(
    repo,
    ["CLAUDE.md", "src/CLAUDE.md", "src/x/CLAUDE.md"],
    "--create", "src/x/CLAUDE.md", "--files", "src/x/CLAUDE.md",
  );

  assert.equal(result.exit, 0, `stderr: ${result.stderr}`);
  assert.deepEqual(lines(result.stdout), ["NEXT: none"]);
});

test("--reconcile marks a node its dispatch wrote off when a planned node below it never came into being", () => {
  const repo = seed({});
  present(repo, "CLAUDE.md", "docs/CLAUDE.md");

  const result = reconcile(
    repo,
    ["CLAUDE.md", "docs/CLAUDE.md", "docs/a/CLAUDE.md"],
    "--fix", "docs/CLAUDE.md", "--files", "docs/CLAUDE.md",
  );

  assert.equal(result.exit, 0, `stderr: ${result.stderr}`);
  assert.deepEqual(reconciled(result.stdout), writerBlock(1, "docs/CLAUDE.md", "CLAUDE.md,docs/CLAUDE.md"));
});

test("--reconcile leaves a node its dispatch wrote alone when the nodes below it are the planned ones plus the ones that dispatch created", () => {
  const repo = seed({});
  present(repo, "CLAUDE.md", "docs/CLAUDE.md", "docs/new/CLAUDE.md");

  const result = reconcile(
    repo,
    ["CLAUDE.md", "docs/CLAUDE.md"],
    "--fix", "docs/CLAUDE.md", "--files", "docs/CLAUDE.md,docs/new/CLAUDE.md",
  );

  assert.equal(result.exit, 0, `stderr: ${result.stderr}`);
  assert.deepEqual(lines(result.stdout), ["NEXT: none"]);
});

test("--reconcile marks a node off when the node below it was created by another dispatch (only the nodes its own dispatch created are counted)", () => {
  const repo = seed({});
  present(repo, "CLAUDE.md", "docs/CLAUDE.md", "docs/a/CLAUDE.md", "docs/a/b/CLAUDE.md");

  const result = reconcile(
    repo,
    ["CLAUDE.md", "docs/CLAUDE.md", "docs/a/CLAUDE.md"],
    "--fix", "docs/CLAUDE.md", "--files", "docs/CLAUDE.md",
    "--fix", "docs/a/CLAUDE.md", "--files", "docs/a/CLAUDE.md,docs/a/b/CLAUDE.md",
  );

  assert.equal(result.exit, 0, `stderr: ${result.stderr}`);
  assert.deepEqual(
    reconciled(result.stdout),
    writerBlock(1, "docs/CLAUDE.md", "CLAUDE.md,docs/CLAUDE.md,docs/a/CLAUDE.md,docs/a/b/CLAUDE.md"),
  );
});

test("--reconcile marks a node no dispatch wrote off when a dispatch created a node below it, and never the root", () => {
  const repo = seed({});
  present(repo, "CLAUDE.md", "docs/CLAUDE.md", "docs/a/CLAUDE.md");

  const result = reconcile(
    repo,
    ["CLAUDE.md", "docs/CLAUDE.md", "docs/a/CLAUDE.md"],
    "--create", "docs/a/CLAUDE.md", "--files", "docs/a/CLAUDE.md",
  );

  assert.equal(result.exit, 0, `stderr: ${result.stderr}`);
  assert.deepEqual(
    reconciled(result.stdout),
    writerBlock(1, "docs/CLAUDE.md", "CLAUDE.md,docs/CLAUDE.md,docs/a/CLAUDE.md"),
  );
});

test("--reconcile marks a node no dispatch wrote off when a dispatch deleted a node below it", () => {
  const repo = seed({});
  present(repo, "CLAUDE.md", "docs/CLAUDE.md", "docs/b/CLAUDE.md");

  const result = reconcile(
    repo,
    ["CLAUDE.md", "docs/CLAUDE.md", "docs/a/CLAUDE.md", "docs/b/CLAUDE.md"],
    "--fix", "docs/b/CLAUDE.md", "--files", "docs/b/CLAUDE.md,docs/a/CLAUDE.md",
  );

  assert.equal(result.exit, 0, `stderr: ${result.stderr}`);
  assert.deepEqual(
    reconciled(result.stdout),
    writerBlock(1, "docs/CLAUDE.md", "CLAUDE.md,docs/CLAUDE.md,docs/b/CLAUDE.md"),
  );
});

/** The planned set of a tree two branches deep, each branch holding a leaf below an inner node. */
const BRANCHES = [
  "CLAUDE.md",
  "a/CLAUDE.md",
  "a/x/CLAUDE.md",
  "a/x/w/CLAUDE.md",
  "b/CLAUDE.md",
  "b/y/CLAUDE.md",
  "b/y/z/CLAUDE.md",
];
const BRANCH_CREATES = ["--create", "a/x/w/CLAUDE.md", "--files", "a/x/w/CLAUDE.md", "--create", "b/y/z/CLAUDE.md", "--files", "b/y/z/CLAUDE.md"];
const BRANCHES_PLANNED = "CLAUDE.md,a/CLAUDE.md,b/CLAUDE.md,a/x/CLAUDE.md,b/y/CLAUDE.md,a/x/w/CLAUDE.md,b/y/z/CLAUDE.md";

test("--reconcile prints one writer block per off node of the deepest depth alone, each with its wave", () => {
  const repo = seed({});
  present(repo, ...BRANCHES);

  const result = reconcile(repo, BRANCHES, ...BRANCH_CREATES);

  assert.equal(result.exit, 0, `stderr: ${result.stderr}`);
  assert.deepEqual(reconciled(result.stdout), [
    ...writerBlock(2, "a/x/CLAUDE.md", BRANCHES_PLANNED),
    ...writerBlock(2, "b/y/CLAUDE.md", BRANCHES_PLANNED),
  ]);
});

test("--reconcile moves to the next depth up once the nodes of the deepest one are named by --done", () => {
  const repo = seed({});
  present(repo, ...BRANCHES);

  const result = reconcile(
    repo,
    BRANCHES,
    ...BRANCH_CREATES,
    "--done", "a/x/CLAUDE.md", "--files", "",
    "--done", "b/y/CLAUDE.md", "--files", "",
  );

  assert.equal(result.exit, 0, `stderr: ${result.stderr}`);
  assert.deepEqual(reconciled(result.stdout), [
    ...writerBlock(1, "a/CLAUDE.md", BRANCHES_PLANNED),
    ...writerBlock(1, "b/CLAUDE.md", BRANCHES_PLANNED),
  ]);
});

test("--reconcile prints NEXT: none once every off node is named by --done", () => {
  const repo = seed({});
  present(repo, ...BRANCHES);

  const result = reconcile(
    repo,
    BRANCHES,
    ...BRANCH_CREATES,
    "--done", "a/x/CLAUDE.md", "--files", "",
    "--done", "b/y/CLAUDE.md", "--files", "",
    "--done", "a/CLAUDE.md", "--files", "",
    "--done", "b/CLAUDE.md", "--files", "",
  );

  assert.equal(result.exit, 0, `stderr: ${result.stderr}`);
  assert.deepEqual(lines(result.stdout), ["NEXT: none"]);
});

test("--reconcile counts in planned: the nodes a --done dispatch created and leaves out the ones it deleted", () => {
  const repo = seed({});
  present(repo, ...BRANCHES, "a/x/n/CLAUDE.md");
  drop(repo, "b/y/z/CLAUDE.md");

  const result = reconcile(
    repo,
    BRANCHES,
    ...BRANCH_CREATES,
    "--done", "a/x/CLAUDE.md", "--files", "a/x/CLAUDE.md,a/x/n/CLAUDE.md",
    "--done", "b/y/CLAUDE.md", "--files", "b/y/CLAUDE.md,b/y/z/CLAUDE.md",
  );

  assert.equal(result.exit, 0, `stderr: ${result.stderr}`);
  assert.deepEqual(reconciled(result.stdout), [
    ...writerBlock(1, "a/CLAUDE.md", "CLAUDE.md,a/CLAUDE.md,b/CLAUDE.md,a/x/CLAUDE.md,b/y/CLAUDE.md,a/x/n/CLAUDE.md,a/x/w/CLAUDE.md"),
    ...writerBlock(1, "b/CLAUDE.md", "CLAUDE.md,a/CLAUDE.md,b/CLAUDE.md,a/x/CLAUDE.md,b/y/CLAUDE.md,a/x/n/CLAUDE.md,a/x/w/CLAUDE.md"),
  ]);
});

test("--reconcile judges the off nodes from the write wave alone: a node a --done dispatch created below another makes none off", () => {
  const repo = seed({});
  present(repo, "CLAUDE.md", "docs/CLAUDE.md", "docs/a/CLAUDE.md", "docs/a/n/CLAUDE.md");

  const result = reconcile(
    repo,
    ["CLAUDE.md", "docs/CLAUDE.md", "docs/a/CLAUDE.md"],
    "--fix", "docs/a/CLAUDE.md", "--files", "docs/a/CLAUDE.md",
    "--done", "docs/a/CLAUDE.md", "--files", "docs/a/CLAUDE.md,docs/a/n/CLAUDE.md",
  );

  assert.equal(result.exit, 0, `stderr: ${result.stderr}`);
  assert.deepEqual(lines(result.stdout), ["NEXT: none"]);
});

test("--reconcile judges the off nodes from the write wave alone: a node a --done dispatch deleted below a node a write dispatch wrote makes none off", () => {
  const repo = seed({});
  present(repo, "CLAUDE.md", "docs/CLAUDE.md", "docs/a/CLAUDE.md", "docs/a/new/CLAUDE.md");

  const result = reconcile(
    repo,
    ["CLAUDE.md", "docs/CLAUDE.md", "docs/a/CLAUDE.md", "docs/a/b/CLAUDE.md"],
    "--fix", "docs/CLAUDE.md", "--files", "docs/CLAUDE.md,docs/a/new/CLAUDE.md",
    "--done", "docs/a/CLAUDE.md", "--files", "docs/a/CLAUDE.md,docs/a/b/CLAUDE.md",
  );

  assert.equal(result.exit, 0, `stderr: ${result.stderr}`);
  assert.deepEqual(lines(result.stdout), ["NEXT: none"]);
});

test("--reconcile without --planned exits 2 with one error line and an empty stdout", () => {
  const repo = seed({});
  present(repo, "CLAUDE.md");

  const result = run(repo, ["--reconcile", "--fix", "CLAUDE.md", "--files", "CLAUDE.md"]);

  assert.equal(result.exit, 2);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /^error: [^\n]+\n$/);
});

test("--reconcile with a --files no dispatch flag opens exits 2 with one error line and an empty stdout", () => {
  const repo = seed({});
  present(repo, "CLAUDE.md");

  const result = reconcile(repo, ["CLAUDE.md"], "--files", "CLAUDE.md");

  assert.equal(result.exit, 2);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /^error: [^\n]+\n$/);
});

test("the id line is the stamp of the clock, and every plugin path is cut from the path the entry was started by", () => {
  const repo = seed({ "CLAUDE.md": node(40) });
  assert.equal(lines(run(repo).stdout)[1], "id: 2026-11-24-17-04-06");
  assert.deepEqual(pick(lines(kept(repo, "review", "CLAUDE.md").stdout), "refs:"), ["refs: /plugin/viber/references"]);
});

test("a node in a directory holding other tracked files is no orphan, a backslash in the directory name included", () => {
  const repo = seed({ "we\\ird/CLAUDE.md": node(40), "we\\ird/a.ts": "x\n", "plain/CLAUDE.md": node(40), "plain/a.ts": "x\n" });
  assert.deepEqual(pick(lines(run(repo).stdout), "orphan:"), []);
});

test("a node taken out of the index and left in the tree prints both its dirty lines, and --reset refuses it by the first", () => {
  const repo = seed({ "CLAUDE.md": node(40) });
  write(repo, { "a/CLAUDE.md": node(40) });
  repo.git.status?.unshift({ code: "D ", path: "a/CLAUDE.md" });

  assert.deepEqual(pick(lines(run(repo).stdout), "dirty:"), ["dirty: a/CLAUDE.md modified", "dirty: a/CLAUDE.md untracked"]);
  assert.equal(run(repo, ["--reset", "a/CLAUDE.md"]).stdout, "refused: a/CLAUDE.md modified\n");
});

test("a dirty or removed path the ignore rules exclude is named on no line (an untracked one through --removed too)", () => {
  const repo = seed({ "CLAUDE.md": node(40) });
  write(repo, { "out/CLAUDE.md": node(40) });
  repo.git.ignored = ["out/CLAUDE.md", "gone/CLAUDE.md"];

  assert.deepEqual(pick(lines(run(repo).stdout), "dirty:"), []);
  assert.equal(targets(repo, "reset", "--removed", "gone/CLAUDE.md", "--removed", ".x/CLAUDE.md").stdout, "NEXT: none\n");
});

test("a node that cannot be read counts 0 bytes, and a tracked directory entry (a submodule) counts toward no candidate", () => {
  const repo = seed({ "lib/a.ts": "x\n", "lib/b.ts": "x\n" }, { unreadable: [`${ROOT}/CLAUDE.md`], dirs: [ROOT, `${ROOT}/lib/sub`] });
  repo.git.tracked.push({ path: "CLAUDE.md", mode: "100644" }, { path: "lib/sub", mode: "160000" });

  const out = lines(run(repo).stdout);

  assert.deepEqual(pick(out, "node:"), ["node: CLAUDE.md 0 chain 0 ok"]);
  assert.deepEqual(pick(out, "cand:"), []);
});

test("candidates and nodes of one depth come in byte order, a capital before a small letter", () => {
  const repo = seed({ ...many("zed", 3), ...many("Zed", 3), ...many("a-b", 3), ...many("a b", 3), "y/CLAUDE.md": node(9), "Y/CLAUDE.md": node(9) });
  const out = lines(run(repo).stdout);
  assert.deepEqual(pick(out, "cand:").map((line) => line.slice(6, line.indexOf(" files"))), ["Zed", "a b", "a-b", "zed"]);
  assert.deepEqual(pick(out, "node:").map((line) => line.split(" ")[1]), ["Y/CLAUDE.md", "y/CLAUDE.md"]);
});

for (const { label, args, reason } of [
  { label: "no mode", args: ["--targets"], reason: "--targets needs a mode: review, extend, both or reset" },
  { label: "--id twice", args: ["--targets", "both", "--id", "a", "--id", "b"], reason: "--id given twice" },
  { label: "a --keep without a value", args: ["--targets", "both", "--keep"], reason: "--keep needs a node path" },
  { label: "a stray target argument", args: ["--targets", "both", "zz"], reason: "unknown argument zz" },
  { label: "--planned twice", args: ["--reconcile", "--planned", "a", "--planned", "b"], reason: "--planned given twice" },
  { label: "a dispatch without a node", args: ["--reconcile", "--planned", "a", "--done", ""], reason: "--done needs a node path" },
  { label: "--files without a value", args: ["--reconcile", "--planned", "a", "--fix", "b", "--files"], reason: '--files needs a path list, "" for none' },
  { label: "--files twice for one dispatch", args: ["--reconcile", "--planned", "a", "--fix", "./b", "--files", "", "--files", "y"], reason: "--files given twice for b" },
  { label: "a stray reconcile argument", args: ["--reconcile", "--planned", "a", "q"], reason: "unknown argument q" },
]) {
  test(`a call with ${label} exits 2, its one error line saying so`, () => {
    assert.deepEqual(run(seed({}), args), { stdout: "", stderr: `error: ${reason}\n`, exit: 2 });
  });
}

test("a fence closes only on its own character, at its own length and with nothing after it, so a ## line up to there is no heading", () => {
  const repo = seed({ "CLAUDE.md": node(40), "docs/CLAUDE.md": body("## Terms\n```` sh\n## a\n```\n~~~~\n```` x\n## b\n````\n## Zebra\n- z\n") });
  assert.deepEqual(pick(lines(kept(repo, "review", "docs/CLAUDE.md").stdout), "shape:"), ["shape: CLAUDE.md: heading outside the template: Zebra"]);
});

test("--reconcile reads one leading ./ off every path and finds an absolute --files path in the tree", () => {
  const repo = seed({});
  present(repo, "CLAUDE.md", "docs/CLAUDE.md", "docs/a/CLAUDE.md");

  const result = reconcile(repo, ["./CLAUDE.md", "./docs/CLAUDE.md"], "--create", "./docs/a/CLAUDE.md", "--files", "./docs/a/CLAUDE.md");
  assert.deepEqual(reconciled(result.stdout), writerBlock(1, "docs/CLAUDE.md", "CLAUDE.md,docs/CLAUDE.md,docs/a/CLAUDE.md"));

  const absolute = reconcile(repo, ["CLAUDE.md"], "--fix", "docs/CLAUDE.md", "--files", `${ROOT}/docs/a/CLAUDE.md`);
  assert.equal(absolute.stdout, "NEXT: none\n");
});
