/*
 * worktree.unit.test.ts - the worktree core on a fake file system and a fake
 * repository: the one line and exit of add and remove, the recoveries, and the
 * guards that refuse a path before anything is deleted. What git itself does is
 * held by the contract cases of the GitWrite port; the wrapper, and the root "/"
 * it refuses itself, by tests/viber/worktree.critical.test.ts. The drive-letter
 * and backslash spellings run here on every system.
 */

import assert from "node:assert/strict";
import { fakeFs, fakeRepository, type FakeRepositoryOpts } from "../../harness/fakes.ts";
import { test } from "../../harness/test.ts";
import { runWorktree } from "../../../viber/lib/worktree.ts";

const WT = "/x/wt";

function scene(opts: Partial<FakeRepositoryOpts> & { files?: Record<string, string>; links?: Record<string, string> } = {}) {
  const fs = fakeFs({ "/r/src.txt": "one\n", ...opts.files }, { dirs: ["/r", "/x"], links: opts.links });
  const repo = fakeRepository("/r", fs, { head: { "src.txt": "one\n" }, ...opts });
  return { ...repo, fs, run: (...argv: string[]) => runWorktree(argv, { fs, git: repo.git, write: repo.write }) };
}

const READY = { stdout: `WORKTREE_READY ${WT}\n`, stderr: "", exit: 0 };
const REMOVED = { stdout: `WORKTREE_REMOVED ${WT}\n`, stderr: "", exit: 0 };
const failed = (reason: string, stderr = "") => ({ stdout: `WORKTREE_FAILED ${reason}\n`, stderr, exit: 1 });

const ARRANGED: Array<{ name: string; before: (at: ReturnType<typeof scene>) => void }> = [
  { name: "an absent path", before: () => {} },
  { name: "a worktree already registered", before: (at) => void at.run("add", "/r", WT) },
  { name: "a stale registration whose directory was deleted", before: (at) => (at.run("add", "/r", WT), void at.fs.removeTree(WT)) },
  { name: "an orphaned directory git never registered", before: (at) => (at.fs.makeDir(WT), void at.fs.writeBytes(`${WT}/leftover.txt`, Uint8Array.of(1))) },
];

for (const row of ARRANGED) {
  test(`add over ${row.name} checks HEAD out there and nothing else`, () => {
    const at = scene();
    row.before(at);
    assert.deepEqual(at.run("add", "/r", WT), READY);
    assert.deepEqual(at.fs.listDir(WT), [".git", "src.txt"]);
  });
}

test("remove takes a worktree with the untracked files it holds, and its path can be added again", () => {
  const at = scene();
  at.run("add", "/r", WT);
  at.fs.writeBytes(`${WT}/poc.py`, Uint8Array.of(1));
  assert.deepEqual(at.run("remove", "/r", WT), REMOVED);
  assert.equal(at.fs.exists(WT), false);
  assert.equal(at.write.addWorktree("/r", WT).exit, 0);
});

test("remove of an absent path succeeds", () => {
  assert.deepEqual(scene().run("remove", "/r", WT), REMOVED);
});

test("remove takes a directory git never registered", () => {
  const at = scene({ files: { [`${WT}/x`]: "x" } });
  assert.deepEqual(at.run("remove", "/r", WT), REMOVED);
  assert.equal(at.fs.exists(WT), false);
});

test("add is READY when only a post-checkout hook failed, git's output relayed (the worktree stands, so the status says nothing about it)", () => {
  const at = scene({ checkout: 1 });
  assert.deepEqual(at.run("add", "/r", WT), { ...READY, stderr: "fatal: cannot add\n" });
});

test("add fails with git's output and one stdout line when HEAD names no commit", () => {
  const at = scene({ head: null });
  assert.deepEqual(at.run("add", "/r", WT), failed(`worktree add failed after recovery: ${WT}`, "fatal: cannot add\n"));
  assert.equal(at.fs.exists(WT), false);
});

test("add fails when the parent of the path is a file, which is left", () => {
  const at = scene({ files: { "/x/blocker": "no directory" } });
  assert.deepEqual(at.run("add", "/r", "/x/blocker/wt"), failed("worktree add failed after recovery: /x/blocker/wt", "fatal: cannot add\n"));
  assert.equal(at.fs.kind("/x/blocker"), "file");
});

test("remove fails when the directory cannot be deleted", () => {
  const fs = { ...fakeFs({ [`${WT}/x`]: "x" }, { dirs: ["/r"] }), removeTree: () => false };
  const repo = fakeRepository("/r", fs, { head: {} });
  assert.deepEqual(runWorktree(["remove", "/r", WT], { fs, git: repo.git, write: repo.write }), failed(`could not remove ${WT}`, "fatal: not a working tree\n"));
});

const USAGE = "usage: worktree.sh add|remove <target-root> <worktree-path>";
const REFUSED: Array<{ name: string; argv: string[]; reason: string; links?: Record<string, string> }> = [
  { name: "no argument", argv: [], reason: USAGE },
  { name: "no root", argv: ["add"], reason: USAGE },
  { name: "no path", argv: ["add", "/r"], reason: USAGE },
  { name: "an unknown command", argv: ["reset", "/r", WT], reason: "unknown command: reset (expected add or remove)" },
  { name: "a relative path", argv: ["add", "/r", "wt"], reason: "worktree path must be absolute: wt" },
  { name: "a ./ path", argv: ["add", "/r", "./wt"], reason: "worktree path must be absolute: ./wt" },
  { name: "the root /", argv: ["remove", "/r", "/"], reason: "refusing to operate on a filesystem root: /" },
  { name: "the drive root C:/", argv: ["remove", "/r", "C:/"], reason: "refusing to operate on a filesystem root: C:/" },
  { name: "the drive root C:\\", argv: ["remove", "/r", "C:\\"], reason: "refusing to operate on a filesystem root: C:\\" },
  { name: "the target root with a trailing slash", argv: ["remove", "/r", "/r/"], reason: "worktree path must not be the target root: /r/" },
  { name: "the target root in the other separators", argv: ["remove", "C:\\r", "C:/r"], reason: "worktree path must not be the target root: C:/r" },
  { name: "a link to the target root", argv: ["remove", "/r", "/l"], reason: "worktree path holds the target root: /l", links: { "/l": "/r" } },
  { name: "the parent of the target root", argv: ["remove", "/r/deep", "/r"], reason: "worktree path holds the target root: /r" },
  { name: "the target root spelled with a trailing /./", argv: ["add", "/r", "/r/./"], reason: "worktree path holds the target root: /r/./", links: { "/r/.": "/r" } },
  { name: "a root that is no repository", argv: ["add", "/x", WT], reason: "not a git repository: /x" },
];

for (const row of REFUSED) {
  test(`${row.name} is refused and nothing is touched`, () => {
    const at = scene({ files: { "/r/deep/f": "f" }, links: row.links });
    assert.deepEqual(at.run(...row.argv), failed(row.reason));
    assert.equal(at.fs.readText("/r/src.txt"), "one\n");
  });
}

test("a path ending on .. is never deleted whole, as rm refuses it", () => {
  const at = scene({ files: { "/x/keep/f": "f" }, links: { "/x/keep/in/..": "/x/keep" } });
  assert.deepEqual(at.run("remove", "/r", "/x/keep/in/.."), failed("could not remove /x/keep/in/..", "fatal: not a working tree\n"));
  assert.equal(at.fs.readText("/x/keep/f"), "f");
});
