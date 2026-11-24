/*
 * ports-contract.ts - the contract cases of the Fs, Git and Clock ports,
 * written against the ports alone. The fake passes them as a unit file, each
 * real adapter as an integration file, over the one arranged state SCENE_STATE.
 * A case that writes does it under a directory of its own name below the
 * scratch directory, never in the repository.
 */

import assert from "node:assert/strict";
import type { Clock, Fs, Git } from "../../viber/lib/ports.ts";
import { test } from "./test.ts";

/** The arranged state the fakes are seeded with and the shared scene writes: repo-relative paths. links: a directory link to the directory it names. */
export const SCENE_STATE: { files: Record<string, string>; exec: string[]; untracked: string[]; links: Record<string, string> } = {
  files: {
    "README.md": "hello\n",
    "src/b.txt": "bee\n",
    "src/a.txt": "ay\n",
    "bin/run.sh": "#!/bin/sh\nexit 0\n",
    "scratch.txt": "not tracked\n",
  },
  exec: ["bin/run.sh"],
  untracked: ["scratch.txt"],
  links: { link: "src" },
};

/** scratch: an existing directory the cases may write into. linked: whether the scene holds its directory link. */
export function fsContract(label: string, make: () => { fs: Fs; root: string; scratch: string; linked: boolean }): void {
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

  test(`${label}: a file reads back as its bytes, an absent path and a directory as null`, () => {
    const { fs, root } = make();
    assert.deepEqual([...(fs.readBytes(`${root}/src/a.txt`) ?? [])], [0x61, 0x79, 0x0a]);
    assert.deepEqual([fs.readBytes(`${root}/nope.txt`), fs.readBytes(`${root}/src`)], [null, null]);
  });

  test(`${label}: kind is file for a file, dir for a directory and null for an absent path`, () => {
    const { fs, root } = make();
    assert.deepEqual([fs.kind(`${root}/README.md`), fs.kind(`${root}/src`), fs.kind(`${root}/nope`)], ["file", "dir", null]);
  });

  test(`${label}: realPath of a file or a directory reached by no link is the path itself, of an absent path null`, () => {
    const { fs, root } = make();
    assert.deepEqual([fs.realPath(`${root}/src/a.txt`), fs.realPath(`${root}/src`), fs.realPath(`${root}/nope`)], [`${root}/src/a.txt`, `${root}/src`, null]);
  });

  test(`${label}: a directory link reads as a directory and realPath names what it links to, for the link and for a file through it`, (t) => {
    const { fs, root, linked } = make();
    if (!linked) {
      t.skip("this account cannot create a directory link");
      return;
    }
    assert.equal(fs.kind(`${root}/link`), "dir");
    assert.equal(fs.readText(`${root}/link/a.txt`), "ay\n");
    assert.deepEqual([fs.realPath(`${root}/link`), fs.realPath(`${root}/link/a.txt`)], [`${root}/src`, `${root}/src/a.txt`]);
  });

  test(`${label}: makeDir creates a directory with its missing parents and is true again once it exists`, () => {
    const { fs, scratch } = make();
    const dir = `${scratch}/make-dir/a/b`;
    assert.deepEqual([fs.makeDir(dir), fs.kind(dir), fs.listDir(`${scratch}/make-dir`), fs.listDir(dir), fs.makeDir(dir)], [true, "dir", ["a"], [], true]);
  });

  test(`${label}: makeDir on a file or below one is false and leaves the file`, () => {
    const { fs, scratch } = make();
    const file = `${scratch}/make-dir-on-file/f.txt`;
    assert.equal(fs.makeDir(`${scratch}/make-dir-on-file`), true);
    assert.equal(fs.writeBytes(file, Uint8Array.of(0x78)), true);
    assert.deepEqual([fs.makeDir(file), fs.makeDir(`${file}/sub`), fs.kind(file)], [false, false, "file"]);
  });

  test(`${label}: writeBytes creates a file holding exactly its bytes, invalid UTF-8 included`, () => {
    const { fs, scratch } = make();
    const file = `${scratch}/write-bytes/raw.bin`;
    const bytes = Uint8Array.of(0xff, 0xfe, 0x0a, 0x00, 0xc3, 0x61);
    assert.equal(fs.makeDir(`${scratch}/write-bytes`), true);
    assert.deepEqual([fs.writeBytes(file, bytes), fs.kind(file)], [true, "file"]);
    assert.deepEqual([...(fs.readBytes(file) ?? [])], [...bytes]);
  });

  test(`${label}: writeBytes over an existing file replaces its whole content (a shorter write leaves no tail)`, () => {
    const { fs, scratch } = make();
    const file = `${scratch}/write-over/f.txt`;
    assert.equal(fs.makeDir(`${scratch}/write-over`), true);
    assert.equal(fs.writeBytes(file, new TextEncoder().encode("a long first content\n")), true);
    assert.equal(fs.writeBytes(file, new TextEncoder().encode("short\n")), true);
    assert.equal(fs.readText(file), "short\n");
    assert.equal(fs.writeBytes(file, new Uint8Array(0)), true);
    assert.deepEqual([fs.readText(file), fs.kind(file)], ["", "file"]);
  });

  test(`${label}: writeBytes into an absent directory or onto a directory is false and creates nothing`, () => {
    const { fs, scratch } = make();
    const dir = `${scratch}/write-refused`;
    assert.equal(fs.makeDir(dir), true);
    assert.deepEqual([fs.writeBytes(`${dir}/absent/f.txt`, Uint8Array.of(0x78)), fs.writeBytes(dir, Uint8Array.of(0x78))], [false, false]);
    assert.deepEqual([fs.exists(`${dir}/absent`), fs.kind(dir), fs.listDir(dir)], [false, "dir", []]);
  });
}

export function clockContract(label: string, make: () => Clock): void {
  test(`${label}: now is a valid instant, and a later call never answers an earlier one`, () => {
    const clock = make();
    const first = clock.now().getTime();
    const second = clock.now().getTime();
    assert.ok(Number.isFinite(first) && second >= first, `${first} then ${second}`);
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
