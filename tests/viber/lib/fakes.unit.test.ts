/*
 * fakes.unit.test.ts - the in-memory Fs and Git of tests/harness/fakes.ts pass
 * the port contract cases, and hold the state they are seeded with.
 */

import assert from "node:assert/strict";
import { fakeFs, fakeGit, fakeScene } from "../../harness/fakes.ts";
import { fsContract, gitContract } from "../../harness/ports-contract.ts";
import { test } from "../../harness/test.ts";

fsContract("fake fs", () => {
  const scene = fakeScene();
  return { fs: scene.fs, root: scene.root };
});

gitContract("fake git", () => {
  const scene = fakeScene();
  return { git: scene.git, root: scene.root, outside: scene.outside };
});

test("a path marked unreadable exists yet reads as null", () => {
  const fs = fakeFs({ "/r/a.txt": "alpha\n" }, { unreadable: ["/r/secret.txt"] });
  assert.deepEqual([fs.exists("/r/secret.txt"), fs.readText("/r/secret.txt")], [true, null]);
});

test("the fake file system lists a directory once among the entry names, however many files sit below it", () => {
  const fs = fakeFs({ "/r/b.txt": "", "/r/sub/deep/x.txt": "", "/r/a.txt": "", "/r/sub/y.txt": "" });
  assert.deepEqual(fs.listDir("/r"), ["a.txt", "b.txt", "sub"]);
});

test("the fake git answers the root for a cwd below it and null for a sibling sharing its prefix (a prefix match would claim /rx for /r)", () => {
  const git = fakeGit({ root: "/r", tracked: [] });
  assert.deepEqual([git.repoRoot("/r"), git.repoRoot("/r/sub/deep"), git.repoRoot("/rx"), git.repoRoot("/elsewhere")], ["/r", "/r", null, null]);
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
