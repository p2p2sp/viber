/*
 * ports-contract.ts - the contract cases of the Fs and Git ports, written
 * against the ports alone. The fake passes them as a unit file, each real
 * adapter as an integration file, over the one arranged state SCENE_STATE.
 */

import assert from "node:assert/strict";
import type { Fs, Git } from "../../viber/lib/ports.ts";
import { test } from "./test.ts";

/** The arranged state the fakes are seeded with and the shared scene writes: repo-relative paths. */
export const SCENE_STATE: { files: Record<string, string>; exec: string[]; untracked: string[] } = {
  files: {
    "README.md": "hello\n",
    "src/b.txt": "bee\n",
    "src/a.txt": "ay\n",
    "bin/run.sh": "#!/bin/sh\nexit 0\n",
    "scratch.txt": "not tracked\n",
  },
  exec: ["bin/run.sh"],
  untracked: ["scratch.txt"],
};

export function fsContract(label: string, make: () => { fs: Fs; root: string }): void {
  test(`${label}: a file reads back as its text`, () => {
    const { fs, root } = make();
    assert.equal(fs.readText(`${root}/src/a.txt`), "ay\n");
  });

  test(`${label}: an absent path reads as null`, () => {
    const { fs, root } = make();
    assert.equal(fs.readText(`${root}/nope.txt`), null);
  });

  test(`${label}: a directory reads as null`, () => {
    const { fs, root } = make();
    assert.equal(fs.readText(`${root}/src`), null);
  });

  test(`${label}: exists is true for a file and for a directory, false for an absent path`, () => {
    const { fs, root } = make();
    assert.deepEqual([fs.exists(`${root}/README.md`), fs.exists(`${root}/src`), fs.exists(`${root}/nope`)], [true, true, false]);
  });

  test(`${label}: listDir gives the entry names of a directory sorted`, () => {
    const { fs, root } = make();
    assert.deepEqual(fs.listDir(`${root}/src`), ["a.txt", "b.txt"]);
  });

  test(`${label}: listDir of an absent path or of a file is empty`, () => {
    const { fs, root } = make();
    assert.deepEqual([fs.listDir(`${root}/nope`), fs.listDir(`${root}/README.md`)], [[], []]);
  });
}

export function gitContract(label: string, make: () => { git: Git; root: string; outside: string }): void {
  test(`${label}: the repository root of the root itself and of a directory below it is the root`, () => {
    const { git, root } = make();
    assert.deepEqual([git.repoRoot(root), git.repoRoot(`${root}/src`)], [root, root]);
  });

  test(`${label}: the repository root of a directory in no repository is null`, () => {
    const { git, outside } = make();
    assert.equal(git.repoRoot(outside), null);
  });

  test(`${label}: trackedFiles lists the index in order with its modes and leaves an untracked file out`, () => {
    const { git, root } = make();
    assert.deepEqual(git.trackedFiles(root), [
      { path: "README.md", mode: "100644" },
      { path: "bin/run.sh", mode: "100755" },
      { path: "src/a.txt", mode: "100644" },
      { path: "src/b.txt", mode: "100644" },
    ]);
  });
}
