/*
 * fakes.unit.test.ts - the in-memory Fs, Git and Clock of
 * tests/harness/fakes.ts pass the port contract cases, and hold the state they
 * are seeded with.
 */

import assert from "node:assert/strict";
import { fakeClock, fakeFs, fakeGit, fakeScene } from "../../harness/fakes.ts";
import { clockContract, fsContract, gitContract } from "../../harness/ports-contract.ts";
import { test } from "../../harness/test.ts";

fsContract("fake fs", () => fakeScene());

gitContract("fake git", () => {
  const scene = fakeScene();
  return { git: scene.git, root: scene.root, outside: scene.outside, detached: scene.detached };
});

clockContract("fake clock", () => fakeClock(new Date(2020, 0, 1)));

test("a path marked unreadable exists as a file yet reads as null, as text and as bytes", () => {
  const fs = fakeFs({ "/r/a.txt": "alpha\n" }, { unreadable: ["/r/secret.txt"] });
  assert.deepEqual([fs.exists("/r/secret.txt"), fs.kind("/r/secret.txt"), fs.readText("/r/secret.txt"), fs.readBytes("/r/secret.txt")], [true, "file", null, null]);
});

test("the fake file system copies what it is seeded with and what it hands out (a caller changing its bytes changes no file)", () => {
  const seed = Uint8Array.of(1, 2, 3);
  const fs = fakeFs({ "/r/raw.bin": seed });
  seed[0] = 9;
  const read = fs.readBytes("/r/raw.bin") ?? new Uint8Array(0);
  read[1] = 9;
  assert.deepEqual([...(fs.readBytes("/r/raw.bin") ?? [])], [1, 2, 3]);
});

test("a directory named in dirs exists empty, and a link is listed in its directory and resolves a path below it", () => {
  const fs = fakeFs({ "/r/real/x.txt": "x\n" }, { dirs: ["/r/empty"], links: { "/r/alias": "/r/real" } });
  assert.deepEqual([fs.kind("/r/empty"), fs.listDir("/r/empty"), fs.listDir("/r")], ["dir", [], ["alias", "empty", "real"]]);
  assert.deepEqual([fs.readText("/r/alias/x.txt"), fs.realPath("/r/alias/x.txt"), fs.realPath("/r/alias/nope")], ["x\n", "/r/real/x.txt", null]);
});

test("the fake clock answers the instant it was given, a fresh Date each call", () => {
  const at = new Date(2026, 10, 24, 17, 14, 16);
  const clock = fakeClock(at);
  clock.now().setFullYear(1999);
  assert.equal(clock.now().getTime(), at.getTime());
});

test("the fake file system lists a directory once among the entry names, however many files sit below it", () => {
  const fs = fakeFs({ "/r/b.txt": "", "/r/sub/deep/x.txt": "", "/r/a.txt": "", "/r/sub/y.txt": "" });
  assert.deepEqual(fs.listDir("/r"), ["a.txt", "b.txt", "sub"]);
});

test("the fake git answers the root for a cwd below it and null for a sibling sharing its prefix (a prefix match would claim /rx for /r)", () => {
  const git = fakeGit({ root: "/r", tracked: [] });
  assert.deepEqual([git.repoRoot("/r"), git.repoRoot("/r/sub/deep"), git.repoRoot("/rx"), git.repoRoot("/elsewhere")], ["/r", "/r", null, null]);
});

test("the fake git answers main for a repository given no branch, the branch it was given, and null for a detached HEAD or outside every repository", () => {
  const git = fakeGit([
    { root: "/a", tracked: [] },
    { root: "/b", tracked: [], branch: "feature/x" },
    { root: "/c", tracked: [], branch: null },
  ]);
  assert.deepEqual([git.branch("/a/src"), git.branch("/b"), git.branch("/c"), git.branch("/d"), fakeGit(null).branch("/a")], ["main", "feature/x", null, null, null]);
});

test("the fake git holding several repositories answers each root and its own tracked files", () => {
  const git = fakeGit([
    { root: "/a", tracked: [{ path: "x.txt", mode: "100644" }] },
    { root: "/b", tracked: [] },
  ]);
  assert.deepEqual([git.repoRoot("/a/src"), git.repoRoot("/b"), git.repoRoot("/ab")], ["/a", "/b", null]);
  assert.deepEqual([git.trackedFiles("/a"), git.trackedFiles("/b")], [[{ path: "x.txt", mode: "100644" }], []]);
});

test("the fake git lists the tracked files it was given with their modes in order", () => {
  const tracked = [
    { path: "z.txt", mode: "100644" },
    { path: "bin/run.sh", mode: "100755" },
  ];
  const git = fakeGit({ root: "/r", tracked });
  assert.deepEqual(git.trackedFiles("/r"), [
    { path: "z.txt", mode: "100644" },
    { path: "bin/run.sh", mode: "100755" },
  ]);
});
