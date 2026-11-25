/*
 * ports-contract.ts - the contract cases of the Fs, Git, GitWrite and Clock ports,
 * written against the ports alone. The fake passes them as a unit file, each
 * real adapter as an integration file, over the arranged states SCENE_STATE,
 * HISTORY_STATE and WRITE_STATE.
 * A case that writes files does it under a directory of its own name below the
 * scratch directory, never in the two read-only repositories; a case that writes
 * through git has a throwaway repository of its own.
 */

import assert from "node:assert/strict";
import type { ChangedFile, Clock, Fs, Git, GitWrite, StagedFile, StatusEntry } from "../../viber/lib/ports.ts";
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

/**
 * The second repository of the scene. commits: oldest first, a path to its text
 * and null removing the file; the last one is checked out detached. tree: the
 * work tree changed after it, null removing the file. staged: the paths then
 * added to the index. The rest is what git answers over that state: status,
 * the files changed against HEAD (head), against the first commit (first) and
 * against no base (none), the untracked files, the tracked files an ignore rule
 * excludes (trackedIgnored) and every path one excludes (ignored), the files of
 * HEAD and of the index, what the index holds against HEAD (stagedFiles) and a
 * line of each report.
 */
export const HISTORY_STATE: {
  commits: Array<Record<string, string | null>>;
  tree: Record<string, string | null>;
  staged: string[];
  status: StatusEntry[];
  changed: { head: ChangedFile[]; first: ChangedFile[]; none: ChangedFile[] };
  untracked: string[];
  trackedIgnored: string[];
  ignored: string[];
  head: string[];
  index: string[];
  stagedFiles: StagedFile[];
  reports: Record<"log" | "status" | "stat" | "diff", string>;
} = {
  commits: [
    {
      ".gitignore": "ignored.log\n",
      "kept.txt": "kept\nthe second line\n",
      "edited.txt": "one\n",
      "gone.txt": "gone\n",
      "noted.log": "a note\n",
      "staged.txt": "one\n",
      "old name.txt": "the same text under both names\n",
      "docs/run/plan.md": "plan\n",
    },
    { ".gitignore": "ignored.log\nnoted.log\nb[12]*.log\n", "docs/run/plan.md": null },
    { "docs/run/plan.md": "plan again\n", "late.txt": "late\n" },
  ],
  tree: {
    "edited.txt": "two\n",
    "gone.txt": null,
    "staged.txt": "two\n",
    "old name.txt": null,
    "new name.txt": "the same text under both names\n",
    "untracked dir/za\u017c\u00f3\u0142\u0107.txt": "new\n",
    "ignored.log": "noise\n",
  },
  staged: ["staged.txt", "old name.txt", "new name.txt"],
  status: [
    { code: " M", path: "edited.txt" },
    { code: " D", path: "gone.txt" },
    { code: "R ", path: "new name.txt" },
    { code: "M ", path: "staged.txt" },
    { code: "??", path: "untracked dir/za\u017c\u00f3\u0142\u0107.txt" },
  ],
  changed: {
    head: [
      { status: "M", path: "edited.txt" },
      { status: "D", path: "gone.txt" },
      { status: "R", path: "new name.txt" },
      { status: "M", path: "staged.txt" },
    ],
    first: [
      { status: "M", path: ".gitignore" },
      { status: "M", path: "docs/run/plan.md" },
      { status: "M", path: "edited.txt" },
      { status: "D", path: "gone.txt" },
      { status: "A", path: "late.txt" },
      { status: "R", path: "new name.txt" },
      { status: "M", path: "staged.txt" },
    ],
    none: [
      { status: "A", path: ".gitignore" },
      { status: "A", path: "docs/run/plan.md" },
      { status: "A", path: "edited.txt" },
      { status: "A", path: "kept.txt" },
      { status: "A", path: "late.txt" },
      { status: "A", path: "new name.txt" },
      { status: "A", path: "noted.log" },
      { status: "A", path: "staged.txt" },
    ],
  },
  untracked: ["untracked dir/za\u017c\u00f3\u0142\u0107.txt"],
  trackedIgnored: ["noted.log"],
  ignored: ["ignored.log", "noted.log", "b1 za\u017c.log", "absent dir/ignored.log"],
  head: [".gitignore", "docs/run/plan.md", "edited.txt", "gone.txt", "kept.txt", "late.txt", "noted.log", "old name.txt", "staged.txt"],
  index: [".gitignore", "docs/run/plan.md", "edited.txt", "gone.txt", "kept.txt", "late.txt", "new name.txt", "noted.log", "staged.txt"],
  stagedFiles: [
    { path: "new name.txt", from: "000000", mode: "100644" },
    { path: "old name.txt", from: "100644", mode: "000000" },
    { path: "staged.txt", from: "100644", mode: "100644" },
  ],
  reports: {
    log: "3333333 commit 3\n2222222 commit 2\n1111111 commit 1\n",
    status: " M edited.txt\n",
    stat: " edited.txt | 2 +-\n",
    diff: "--- a/edited.txt\n+++ b/edited.txt\n@@ -1 +1 @@\n-one\n+two\n",
  },
};

/** The throwaway repository a case that writes through git starts from. files: the work tree, all of it committed but the file untracked names; ignored: what its .gitignore excludes. */
export const WRITE_STATE = {
  files: {
    ".gitignore": "ign/\n",
    "app/[id]/page.tsx": "id\n",
    "app/i/page.tsx": "i\n",
    "kept.txt": "kept\n",
    "other.txt": "other\n",
    "ign/tracked.txt": "tracked\n",
    "run/plan.md": "plan\n",
    "run/spec.md": "spec\n",
    "tool.sh": "#!/bin/sh\n",
    "new.txt": "new\n",
  } as Record<string, string>,
  untracked: "new.txt",
  ignored: ["ign"],
};

export interface ThrowawayOpts {
  /** core.fileMode, true when left out. */
  fileMode?: boolean;
  /** A pre-commit hook that refuses every commit. */
  refuse?: boolean;
  /** A post-checkout hook that fails. */
  checkout?: boolean;
  /** No commit yet, an empty index. */
  unborn?: boolean;
  /** A detached HEAD. */
  detached?: boolean;
}

/** execBits: whether the file system keeps an exec bit. */
export interface Throwaway {
  fs: Fs;
  git: Git;
  write: GitWrite;
  root: string;
  execBits: boolean;
  stageMode(path: string, mode: string): void;
}

/** scratch: an existing directory the cases may write into. linked: whether the scene holds its directory link. execBits: whether the system refuses to run a file given no exec bit. */
export function fsContract(label: string, make: () => { fs: Fs; root: string; scratch: string; linked: boolean; execBits: boolean }): void {
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

  test(`${label}: size is the byte count of a file, its link followed, null for a directory and for an absent path`, () => {
    const { fs, root, scratch } = make();
    const file = `${scratch}/size/f.txt`;
    assert.equal(fs.makeDir(`${scratch}/size`), true);
    assert.equal(fs.writeBytes(file, new TextEncoder().encode("\u017c\n")), true);
    assert.deepEqual([fs.size(file), fs.size(`${root}/src/a.txt`), fs.size(`${root}/src`), fs.size(`${root}/nope`)], [3, 3, null, null]);
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

  test(`${label}: executable is true for a file carrying an exec bit and false for an absent path`, () => {
    const { fs, root } = make();
    assert.deepEqual([fs.executable(`${root}/bin/run.sh`), fs.executable(`${root}/nope.sh`)], [true, false]);
  });

  test(`${label}: executable is false for a file carrying no exec bit`, (t) => {
    const { fs, root, execBits } = make();
    if (!execBits) {
      t.skip("this system keeps no exec bit");
      return;
    }
    assert.equal(fs.executable(`${root}/README.md`), false);
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

  test(`${label}: remove deletes a file and is true again for the path then absent, its directory and the file beside it left`, () => {
    const { fs, scratch } = make();
    const dir = `${scratch}/remove`;
    assert.equal(fs.makeDir(dir), true);
    assert.deepEqual([fs.writeBytes(`${dir}/gone.txt`, Uint8Array.of(0x78)), fs.writeBytes(`${dir}/kept.txt`, Uint8Array.of(0x79))], [true, true]);
    assert.deepEqual([fs.remove(`${dir}/gone.txt`), fs.exists(`${dir}/gone.txt`), fs.remove(`${dir}/gone.txt`), fs.listDir(dir)], [true, false, true, ["kept.txt"]]);
  });

  test(`${label}: remove on a directory is false and leaves it with what it holds`, () => {
    const { fs, scratch } = make();
    const dir = `${scratch}/remove-dir`;
    assert.equal(fs.makeDir(`${dir}/empty`), true);
    assert.equal(fs.writeBytes(`${dir}/f.txt`, Uint8Array.of(0x78)), true);
    assert.deepEqual([fs.remove(dir), fs.remove(`${dir}/empty`), fs.listDir(dir)], [false, false, ["empty", "f.txt"]]);
  });

  test(`${label}: appendBytes creates a file, then adds its bytes after what it holds, invalid UTF-8 included`, () => {
    const { fs, scratch } = make();
    const file = `${scratch}/append/raw.bin`;
    assert.equal(fs.makeDir(`${scratch}/append`), true);
    assert.deepEqual([fs.appendBytes(file, Uint8Array.of(0xff, 0x0a)), fs.appendBytes(file, Uint8Array.of(0xc3, 0x61))], [true, true]);
    assert.deepEqual([...(fs.readBytes(file) ?? [])], [0xff, 0x0a, 0xc3, 0x61]);
  });

  test(`${label}: appendBytes into an absent directory or onto a directory is false and creates nothing`, () => {
    const { fs, scratch } = make();
    const dir = `${scratch}/append-refused`;
    assert.equal(fs.makeDir(dir), true);
    assert.deepEqual([fs.appendBytes(`${dir}/absent/f.txt`, Uint8Array.of(0x78)), fs.appendBytes(dir, Uint8Array.of(0x78))], [false, false]);
    assert.deepEqual([fs.exists(`${dir}/absent`), fs.kind(dir), fs.listDir(dir)], [false, "dir", []]);
  });

  test(`${label}: replace moves a file over another, whose content is then its own, and to an absent path, leaving nothing behind`, () => {
    const { fs, scratch } = make();
    const dir = `${scratch}/replace`;
    assert.equal(fs.makeDir(dir), true);
    assert.deepEqual([fs.writeBytes(`${dir}/new.txt`, Uint8Array.of(0xff, 0x0a)), fs.writeBytes(`${dir}/old.txt`, new TextEncoder().encode("a longer content\n"))], [true, true]);
    assert.deepEqual([fs.replace(`${dir}/new.txt`, `${dir}/old.txt`), fs.listDir(dir), [...(fs.readBytes(`${dir}/old.txt`) ?? [])]], [true, ["old.txt"], [0xff, 0x0a]]);
    assert.deepEqual([fs.replace(`${dir}/old.txt`, `${dir}/moved.txt`), fs.listDir(dir)], [true, ["moved.txt"]]);
  });

  test(`${label}: replace is false for an absent file, for a directory, onto a directory and into an absent one, everything left as it was`, () => {
    const { fs, scratch } = make();
    const dir = `${scratch}/replace-refused`;
    assert.equal(fs.makeDir(`${dir}/sub`), true);
    assert.equal(fs.writeBytes(`${dir}/f.txt`, Uint8Array.of(0x78)), true);
    assert.deepEqual(
      [fs.replace(`${dir}/nope`, `${dir}/f.txt`), fs.replace(`${dir}/sub`, `${dir}/other`), fs.replace(`${dir}/f.txt`, `${dir}/sub`), fs.replace(`${dir}/f.txt`, `${dir}/absent/f.txt`)],
      [false, false, false, false],
    );
    assert.deepEqual([fs.listDir(dir), fs.listDir(`${dir}/sub`), fs.readText(`${dir}/f.txt`)], [["f.txt", "sub"], [], "x"]);
  });

  for (const path of ["src", "README.md", "nope"]) {
    test(`${label}: isLink is false for ${path}, a directory, a file or nothing at all`, () => {
      const { fs, root } = make();
      assert.equal(fs.isLink(`${root}/${path}`), false);
    });
  }

  test(`${label}: isLink is true for a directory link, and false for a file reached through it`, (t) => {
    const { fs, root, linked } = make();
    if (!linked) {
      t.skip("this account cannot create a directory link");
      return;
    }
    assert.deepEqual([fs.isLink(`${root}/link`), fs.isLink(`${root}/link/a.txt`)], [true, false]);
  });

  for (const on of [true, false]) {
    test(`${label}: setExecutable ${on} leaves a file ${on ? "carrying" : "without"} its exec bit, its content kept`, (t) => {
      const { fs, scratch, execBits } = make();
      if (!execBits) {
        t.skip("this system keeps no exec bit");
        return;
      }
      const file = `${scratch}/set-executable-${on}/f.sh`;
      fs.makeDir(`${scratch}/set-executable-${on}`);
      fs.writeBytes(file, Uint8Array.of(0x78));
      fs.setExecutable(file, !on);
      assert.equal(fs.setExecutable(file, on), true);
      assert.equal(fs.executable(file), on);
      assert.equal(fs.readText(file), "x");
    });
  }

  test(`${label}: setExecutable is false for an absent path`, () => {
    const { fs, root } = make();
    assert.equal(fs.setExecutable(`${root}/nope`, true), false);
  });

  test(`${label}: move takes a directory with all it holds, an empty one included`, () => {
    const { fs, scratch } = make();
    const dir = `${scratch}/move-dir`;
    fs.makeDir(`${dir}/from/empty`);
    fs.writeBytes(`${dir}/from/f.txt`, Uint8Array.of(0x78));
    assert.equal(fs.move(`${dir}/from`, `${dir}/to`), true);
    assert.deepEqual(fs.listDir(dir), ["to"]);
    assert.deepEqual(fs.listDir(`${dir}/to`), ["empty", "f.txt"]);
    assert.equal(fs.readText(`${dir}/to/f.txt`), "x");
  });

  for (const row of [
    { name: "from an absent path", from: "nope", to: "c" },
    { name: "onto an empty directory", from: "a", to: "b" },
    { name: "onto a file", from: "a", to: "f.txt" },
    { name: "into an absent directory", from: "a", to: "absent/a" },
  ]) {
    test(`${label}: move ${row.name} is false, everything left as it was`, () => {
      const { fs, scratch } = make();
      const dir = `${scratch}/move-${row.name.replaceAll(" ", "-")}`;
      fs.makeDir(`${dir}/a`);
      fs.makeDir(`${dir}/b`);
      fs.writeBytes(`${dir}/f.txt`, Uint8Array.of(0x78));
      assert.equal(fs.move(`${dir}/${row.from}`, `${dir}/${row.to}`), false);
      assert.deepEqual(fs.listDir(dir), ["a", "b", "f.txt"]);
      assert.equal(fs.readText(`${dir}/f.txt`), "x");
    });
  }

  test(`${label}: removeTree deletes a directory with everything below it, a name outside ASCII included, and leaves its sibling`, () => {
    const { fs, scratch } = make();
    const dir = `${scratch}/remove-tree`;
    fs.makeDir(`${dir}/gone/żółw/deep`);
    fs.writeBytes(`${dir}/gone/żółw/deep/f.txt`, Uint8Array.of(0x78));
    fs.writeBytes(`${dir}/f.txt`, Uint8Array.of(0x78));
    assert.equal(fs.removeTree(`${dir}/gone`), true);
    assert.deepEqual(fs.listDir(dir), ["f.txt"]);
  });

  test(`${label}: removeTree deletes a file`, () => {
    const { fs, scratch } = make();
    const dir = `${scratch}/remove-tree-file`;
    fs.makeDir(dir);
    fs.writeBytes(`${dir}/f.txt`, Uint8Array.of(0x78));
    assert.equal(fs.removeTree(`${dir}/f.txt`), true);
    assert.deepEqual(fs.listDir(dir), []);
  });

  test(`${label}: removeTree is true for an absent path`, () => {
    const { fs, scratch } = make();
    assert.equal(fs.removeTree(`${scratch}/remove-tree-absent`), true);
  });

  test(`${label}: removeEmptyDir deletes a directory whose last file was removed, its parent left, and is false for the path then absent`, () => {
    const { fs, scratch } = make();
    const dir = `${scratch}/remove-empty-dir`;
    assert.equal(fs.makeDir(`${dir}/area`), true);
    assert.deepEqual([fs.writeBytes(`${dir}/area/f.txt`, Uint8Array.of(0x78)), fs.remove(`${dir}/area/f.txt`)], [true, true]);
    assert.deepEqual([fs.removeEmptyDir(`${dir}/area`), fs.exists(`${dir}/area`), fs.kind(dir), fs.removeEmptyDir(`${dir}/area`)], [true, false, "dir", false]);
  });

  test(`${label}: removeEmptyDir is false for a directory holding a file or a directory and for a file, each left as it was`, () => {
    const { fs, scratch } = make();
    const dir = `${scratch}/remove-full-dir`;
    assert.equal(fs.makeDir(`${dir}/outer/inner`), true);
    assert.equal(fs.makeDir(`${dir}/full`), true);
    assert.equal(fs.writeBytes(`${dir}/full/f.txt`, Uint8Array.of(0x78)), true);
    assert.deepEqual([fs.removeEmptyDir(`${dir}/full`), fs.removeEmptyDir(`${dir}/outer`), fs.removeEmptyDir(`${dir}/full/f.txt`)], [false, false, false]);
    assert.deepEqual([fs.listDir(`${dir}/full`), fs.listDir(`${dir}/outer`)], [["f.txt"], ["inner"]]);
  });

  test(`${label}: removeEmptyDir on a directory link is false and leaves the link and what it names`, (t) => {
    const { fs, root, linked } = make();
    if (!linked) {
      t.skip("this account cannot create a directory link");
      return;
    }
    assert.deepEqual([fs.removeEmptyDir(`${root}/link`), fs.kind(`${root}/link`), fs.listDir(`${root}/src`)], [false, "dir", ["a.txt", "b.txt"]]);
  });
}

/** make: a fresh repository of WRITE_STATE for each case. */
export function gitWriteContract(label: string, make: (opts?: ThrowawayOpts) => Throwaway): void {
  const put = (repo: Throwaway, path: string, text: string): void => {
    const file = `${repo.root}/${path}`;
    repo.fs.makeDir(file.slice(0, file.lastIndexOf("/")));
    repo.fs.writeBytes(file, new TextEncoder().encode(text));
  };
  const staged = (repo: Throwaway): string[] | undefined => repo.git.stagedFiles(repo.root, null)?.map((file) => file.path);
  const mode = (repo: Throwaway, path: string): string | undefined => repo.git.trackedFiles(repo.root).find((file) => file.path === path)?.mode;
  const held = (repo: Throwaway, ...paths: string[]): boolean[] => paths.map((path) => repo.git.headHolds(repo.root, path));
  const privateIndexes = (repo: Throwaway): string[] => repo.fs.listDir(`${repo.root}/.git`).filter((name) => name.startsWith("index."));

  test(`${label}: stageTracked stages an edit and a deletion at and below the path and no new file`, () => {
    const repo = make();
    put(repo, "run/spec.md", "edited\n");
    put(repo, "run/more.md", "new\n");
    repo.fs.remove(`${repo.root}/run/plan.md`);
    assert.equal(repo.write.stageTracked(repo.root, "run"), 0);
    assert.deepEqual(repo.git.stagedFiles(repo.root, null), [
      { path: "run/plan.md", from: "100644", mode: "000000" },
      { path: "run/spec.md", from: "100644", mode: "100644" },
    ]);
  });

  test(`${label}: stageTracked stages a tracked file under an ignored directory and leaves the new one beside it (git add of that directory is refused)`, () => {
    const repo = make();
    put(repo, "ign/tracked.txt", "edited\n");
    put(repo, "ign/new.txt", "new\n");
    assert.equal(repo.write.stageTracked(repo.root, "ign"), 0);
    assert.deepEqual(staged(repo), ["ign/tracked.txt"]);
  });

  test(`${label}: stageTracked reads a path as a literal one (a bracket expanded as a glob would stage app/i too)`, () => {
    const repo = make();
    put(repo, "app/[id]/page.tsx", "id, edited\n");
    put(repo, "app/i/page.tsx", "i, edited\n");
    assert.equal(repo.write.stageTracked(repo.root, "app/[id]"), 0);
    assert.deepEqual(staged(repo), ["app/[id]/page.tsx"]);
  });

  test(`${label}: stageTracked fails on a path git tracks nothing at`, () => {
    const repo = make();
    assert.notEqual(repo.write.stageTracked(repo.root, "new.txt"), 0);
    assert.deepEqual(staged(repo), []);
  });

  test(`${label}: stage adds the named files alone, a list longer than one command line of Windows holds included`, () => {
    const repo = make();
    const names = Array.from({ length: 300 }, (_, i) => `many/${String(i).padStart(3, "0")}${"x".repeat(90)}.txt`);
    for (const name of names) put(repo, name, "x\n");
    assert.equal(repo.write.stage(repo.root, names), 0);
    assert.deepEqual(staged(repo), names);
  });

  for (const row of [
    { name: "a path nothing stands at, the file beside it not staged", paths: ["new.txt", "nope.txt"] },
    { name: "a new file an ignore rule covers", paths: ["ign/new.txt"] },
  ]) {
    test(`${label}: stage fails on ${row.name}`, () => {
      const repo = make();
      put(repo, "ign/new.txt", "new\n");
      assert.notEqual(repo.write.stage(repo.root, row.paths), 0);
      assert.deepEqual(staged(repo), []);
    });
  }

  for (const row of [
    { name: "every edit, deletion and new file but an ignored one", path: null, want: ["kept.txt", "new.txt", "other.txt", "run/more.md"] },
    { name: "with a path those at and below it alone", path: "run", want: ["run/more.md"] },
  ]) {
    test(`${label}: stageAll stages ${row.name}`, () => {
      const repo = make();
      put(repo, "kept.txt", "edited\n");
      put(repo, "run/more.md", "new\n");
      put(repo, "ign/new.txt", "new\n");
      repo.fs.remove(`${repo.root}/other.txt`);
      assert.equal(repo.write.stageAll(repo.root, row.path), 0);
      assert.deepEqual(staged(repo), row.want);
    });
  }

  for (const row of [
    { name: "under core.fileMode=true loses an exec bit staged over a plain file", disk: false, fileMode: true, want: "100644" },
    { name: "under core.fileMode=true keeps a staged exec bit the file on disk carries", disk: true, fileMode: true, want: "100755" },
    { name: "under core.fileMode=false keeps an exec bit staged over a plain file", disk: false, fileMode: false, want: "100755" },
  ]) {
    test(`${label}: staging ${row.name}`, (t) => {
      const repo = make({ fileMode: row.fileMode });
      if (row.fileMode && !repo.execBits) {
        t.skip("this system keeps no exec bit");
        return;
      }
      repo.stageMode("tool.sh", "100755");
      put(repo, "tool.sh", "#!/bin/sh\nedited\n");
      repo.fs.setExecutable(`${repo.root}/tool.sh`, row.disk);
      assert.equal(repo.write.stageTracked(repo.root, "tool.sh"), 0);
      assert.equal(mode(repo, "tool.sh"), row.want);
    });
  }

  test(`${label}: commit of the index moves HEAD, leaves nothing staged and an unstaged edit as it was, its message verbatim though it opens on a dash`, () => {
    const repo = make();
    const before = repo.git.commit(repo.root, "HEAD");
    put(repo, "kept.txt", "edited\n");
    put(repo, "other.txt", "edited\n");
    repo.write.stageTracked(repo.root, "kept.txt");
    assert.equal(repo.write.commit(repo.root, "-fix: dash-led\n\nbody", null, true), 0);
    assert.notEqual(repo.git.commit(repo.root, "HEAD"), before);
    assert.deepEqual(staged(repo), []);
    assert.deepEqual(repo.git.changedFiles(repo.root, "HEAD"), [{ status: "M", path: "other.txt" }]);
    assert.match(repo.git.report(repo.root, "log", null), /^[0-9a-f]+ -fix: dash-led\n/);
  });

  test(`${label}: commit of named paths takes an edit, a new file and a staged deletion, a bracket literally, and whatever else is staged stays staged`, () => {
    const repo = make();
    put(repo, "app/[id]/page.tsx", "id, edited\n");
    put(repo, "app/i/page.tsx", "i, edited\n");
    put(repo, "other.txt", "edited\n");
    repo.write.stageAll(repo.root, null);
    repo.write.removeTracked(repo.root, "run/plan.md");
    assert.equal(repo.write.commit(repo.root, "named", ["app/[id]", "new.txt", "run"], true), 0);
    assert.deepEqual(staged(repo), ["app/i/page.tsx", "other.txt"]);
    assert.deepEqual(held(repo, "new.txt", "run/plan.md", "run/spec.md"), [true, false, true]);
    assert.deepEqual(privateIndexes(repo), []);
  });

  test(`${label}: commit of a named path under core.fileMode=false holds an exec bit staged over a plain file (git commit -- <path> took the mode from HEAD)`, () => {
    const repo = make({ fileMode: false });
    repo.stageMode("tool.sh", "100755");
    assert.equal(repo.write.commit(repo.root, "exec", ["tool.sh"], true), 0);
    assert.deepEqual(staged(repo), []);
    assert.equal(mode(repo, "tool.sh"), "100755");
  });

  for (const row of [
    { name: "the index", paths: null },
    { name: "named paths", paths: ["kept.txt"] },
  ]) {
    test(`${label}: a commit of ${row.name} a hook refuses fails, HEAD and the index as they were, no private index left`, () => {
      const repo = make({ refuse: true });
      const before = repo.git.commit(repo.root, "HEAD");
      put(repo, "kept.txt", "edited\n");
      repo.write.stageTracked(repo.root, "kept.txt");
      assert.notEqual(repo.write.commit(repo.root, "refused", row.paths, true), 0);
      assert.equal(repo.git.commit(repo.root, "HEAD"), before);
      assert.deepEqual(staged(repo), ["kept.txt"]);
      assert.deepEqual(privateIndexes(repo), []);
    });

    test(`${label}: a commit of ${row.name} holding nothing staged fails and HEAD stays`, () => {
      const repo = make();
      const before = repo.git.commit(repo.root, "HEAD");
      put(repo, "kept.txt", "edited\n");
      assert.notEqual(repo.write.commit(repo.root, "nothing", row.paths, true), 0);
      assert.equal(repo.git.commit(repo.root, "HEAD"), before);
    });
  }

  test(`${label}: a commit on a detached HEAD moves it and leaves it detached`, () => {
    const repo = make({ detached: true });
    const before = repo.git.commit(repo.root, "HEAD");
    repo.write.stageAll(repo.root, null);
    assert.equal(repo.write.commit(repo.root, "detached", null, true), 0);
    assert.notEqual(repo.git.commit(repo.root, "HEAD"), before);
    assert.equal(repo.git.branch(repo.root), null);
  });

  test(`${label}: on a branch with no commit yet a commit of named paths is the first one, the rest left staged as new`, () => {
    const repo = make({ unborn: true });
    repo.write.stage(repo.root, ["kept.txt", "other.txt"]);
    assert.equal(repo.write.commit(repo.root, "first", ["kept.txt"], true), 0);
    assert.deepEqual(held(repo, "kept.txt", "other.txt"), [true, false]);
    assert.deepEqual(repo.git.stagedFiles(repo.root, null), [{ path: "other.txt", from: "000000", mode: "100644" }]);
  });

  test(`${label}: move takes a directory on disk and in the index, an edit not staged and an untracked file with it`, () => {
    const repo = make();
    put(repo, "run/spec.md", "edited\n");
    put(repo, "run/more.md", "new\n");
    repo.fs.makeDir(`${repo.root}/docs`);
    assert.equal(repo.write.move(repo.root, "run", "docs/run"), 0);
    assert.equal(repo.fs.exists(`${repo.root}/run`), false);
    assert.equal(repo.fs.readText(`${repo.root}/docs/run/spec.md`), "edited\n");
    assert.deepEqual(repo.fs.listDir(`${repo.root}/docs/run`), ["more.md", "plan.md", "spec.md"]);
    assert.deepEqual(staged(repo), ["docs/run/plan.md", "docs/run/spec.md", "run/plan.md", "run/spec.md"]);
  });

  test(`${label}: move of a path git tracks nothing at fails and moves nothing`, () => {
    const repo = make();
    put(repo, "loose/x.md", "x\n");
    assert.notEqual(repo.write.move(repo.root, "loose", "moved"), 0);
    assert.deepEqual([repo.fs.exists(`${repo.root}/loose/x.md`), repo.fs.exists(`${repo.root}/moved`)], [true, false]);
  });

  test(`${label}: removeTracked deletes a changed tracked file from disk and index, its directory with the last one`, () => {
    const repo = make();
    put(repo, "run/plan.md", "edited\n");
    assert.equal(repo.write.removeTracked(repo.root, "run"), 0);
    assert.equal(repo.fs.exists(`${repo.root}/run`), false);
    assert.deepEqual(staged(repo), ["run/plan.md", "run/spec.md"]);
  });

  test(`${label}: removeTracked leaves an untracked file`, () => {
    const repo = make();
    put(repo, "run/loose.txt", "loose\n");
    assert.equal(repo.write.removeTracked(repo.root, "run"), 0);
    assert.deepEqual(repo.fs.listDir(`${repo.root}/run`), ["loose.txt"]);
  });

  test(`${label}: removeTracked is 0 where git tracks nothing`, () => {
    const repo = make();
    assert.equal(repo.write.removeTracked(repo.root, "nope"), 0);
  });

  test(`${label}: addWorktree checks HEAD out, never the work tree, at a path that is then a work tree of its own`, () => {
    const repo = make();
    const wt = `${repo.root}-wt`;
    put(repo, "kept.txt", "edited\n");
    assert.equal(repo.write.addWorktree(repo.root, wt).exit, 0);
    assert.equal(repo.git.repoRoot(wt), wt);
    assert.equal(repo.fs.kind(`${wt}/.git`), "file");
    assert.equal(repo.fs.readText(`${wt}/kept.txt`), "kept\n");
    assert.equal(repo.fs.exists(`${wt}/new.txt`), false);
  });

  test(`${label}: addWorktree fails, naming why, on a worktree already there`, () => {
    const repo = make();
    const wt = `${repo.root}-wt`;
    repo.write.addWorktree(repo.root, wt);
    const again = repo.write.addWorktree(repo.root, wt);
    assert.notEqual(again.exit, 0);
    assert.notEqual(again.output, "");
  });

  test(`${label}: addWorktree fails on a path whose worktree was deleted by hand`, () => {
    const repo = make();
    const wt = `${repo.root}-wt`;
    repo.write.addWorktree(repo.root, wt);
    repo.fs.removeTree(wt);
    assert.notEqual(repo.write.addWorktree(repo.root, wt).exit, 0);
  });

  test(`${label}: pruneWorktrees forgets a worktree deleted by hand, so its path can be added again`, () => {
    const repo = make();
    const wt = `${repo.root}-wt`;
    repo.write.addWorktree(repo.root, wt);
    repo.fs.removeTree(wt);
    repo.write.pruneWorktrees(repo.root);
    assert.equal(repo.write.addWorktree(repo.root, wt).exit, 0);
  });

  test(`${label}: addWorktree makes the worktree yet carries the status of a failing post-checkout hook`, () => {
    const repo = make({ checkout: true });
    const wt = `${repo.root}-wt`;
    assert.notEqual(repo.write.addWorktree(repo.root, wt).exit, 0);
    assert.equal(repo.git.repoRoot(wt), wt);
  });

  test(`${label}: addWorktree makes nothing on a branch with no commit yet`, () => {
    const repo = make({ unborn: true });
    assert.notEqual(repo.write.addWorktree(repo.root, `${repo.root}-wt`).exit, 0);
    assert.equal(repo.fs.exists(`${repo.root}-wt`), false);
  });

  test(`${label}: removeWorktree takes a worktree with the untracked file it holds`, () => {
    const repo = make();
    const wt = `${repo.root}-wt`;
    repo.write.addWorktree(repo.root, wt);
    repo.fs.writeBytes(`${wt}/poc.py`, Uint8Array.of(0x78));
    assert.equal(repo.write.removeWorktree(repo.root, wt).exit, 0);
    assert.equal(repo.fs.exists(wt), false);
  });

  test(`${label}: removeWorktree fails on a directory that is no worktree and leaves it`, () => {
    const repo = make();
    assert.notEqual(repo.write.removeWorktree(repo.root, `${repo.root}/run`).exit, 0);
    assert.equal(repo.fs.exists(`${repo.root}/run/plan.md`), true);
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

/** history: the repository of HISTORY_STATE, on a detached HEAD; the repository at root has no commit yet. */
export function gitContract(label: string, make: () => { git: Git; root: string; outside: string; history: string }): void {
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

  test(`${label}: the branch of a repository with no commit yet is the name HEAD stands on, from the root and from a directory below it`, () => {
    const { git, root } = make();
    assert.deepEqual([git.branch(root), git.branch(`${root}/src`)], ["main", "main"]);
  });

  test(`${label}: the branch of a detached HEAD and of a directory in no repository is null`, () => {
    const { git, outside, history } = make();
    assert.deepEqual([git.branch(history), git.branch(outside)], [null, null]);
  });

  test(`${label}: commit gives HEAD and each commit behind it a full sha of its own, and a sha names itself`, () => {
    const { git, history } = make();
    const shas = [git.commit(history, "HEAD"), git.commit(history, "HEAD~1"), git.commit(history, "HEAD~2")];
    for (const sha of shas) assert.match(sha ?? "", /^([0-9a-f]{40}|[0-9a-f]{64})$/);
    assert.equal(new Set(shas).size, 3);
    assert.equal(git.commit(history, shas[1] ?? ""), shas[1]);
  });

  test(`${label}: commit is null for a ref naming no commit, behind the first commit, on a branch with no commit yet and outside a repository`, () => {
    const { git, root, outside, history } = make();
    assert.deepEqual([git.commit(history, "no-such-ref"), git.commit(history, "HEAD~3"), git.commit(root, "HEAD"), git.commit(outside, "HEAD")], [null, null, null, null]);
  });

  test(`${label}: symbolicRef of HEAD is the full branch ref, a branch with no commit yet included, and null on a detached HEAD, for a ref that does not exist and outside a repository`, () => {
    const { git, root, outside, history } = make();
    assert.deepEqual(
      [git.symbolicRef(root, "HEAD"), git.symbolicRef(history, "HEAD"), git.symbolicRef(root, "refs/remotes/origin/HEAD"), git.symbolicRef(outside, "HEAD")],
      ["refs/heads/main", null, null, null],
    );
  });

  test(`${label}: mergeBase of HEAD and a commit behind it is that commit, and null when a side names no commit`, () => {
    const { git, root, history } = make();
    const first = git.commit(history, "HEAD~2");
    assert.notEqual(first, null);
    assert.deepEqual([git.mergeBase(history, "HEAD", "HEAD~2"), git.mergeBase(history, "HEAD", "no-such-ref"), git.mergeBase(root, "HEAD", "HEAD")], [first, null, null]);
  });

  test(`${label}: firstAdded is the oldest commit adding the path, for a file a later commit added again too, and takes an absolute path`, () => {
    const { git, history } = make();
    const [first, last] = [git.commit(history, "HEAD~2"), git.commit(history, "HEAD")];
    assert.notEqual(first, null);
    assert.deepEqual([git.firstAdded(history, "docs/run/plan.md"), git.firstAdded(history, "late.txt"), git.firstAdded(history, `${history}/late.txt`)], [first, last, last]);
  });

  test(`${label}: firstAdded is null for a path no commit added, for a glob that would match one (the path is literal) and in a repository with no commit`, () => {
    const { git, root, history } = make();
    assert.deepEqual([git.firstAdded(history, "never.txt"), git.firstAdded(history, "docs/run/*.md"), git.firstAdded(root, "README.md")], [null, null, null]);
  });

  test(`${label}: changedFiles against HEAD lists a modified, a deleted, a renamed (as its new path alone) and a staged file with their letters, a path with a blank as it is`, () => {
    const { git, history } = make();
    assert.deepEqual(git.changedFiles(history, "HEAD"), HISTORY_STATE.changed.head);
  });

  test(`${label}: changedFiles against an older commit adds what the commits since changed`, () => {
    const { git, history } = make();
    assert.deepEqual(git.changedFiles(history, "HEAD~2"), HISTORY_STATE.changed.first);
  });

  test(`${label}: changedFiles against no base lists every tracked file present in the work tree as added, a tracked file deleted from disk left out, also in a repository with no commit`, () => {
    const { git, root, history } = make();
    assert.deepEqual(git.changedFiles(history, null), HISTORY_STATE.changed.none);
    assert.deepEqual(
      git.changedFiles(root, null).map((file) => `${file.status} ${file.path}`),
      ["A README.md", "A bin/run.sh", "A src/a.txt", "A src/b.txt"],
    );
  });

  test(`${label}: changedFiles is empty for a base naming no commit, for HEAD in a repository with no commit and outside a repository`, () => {
    const { git, root, outside, history } = make();
    assert.deepEqual([git.changedFiles(history, "no-such-ref"), git.changedFiles(root, "HEAD"), git.changedFiles(outside, "HEAD")], [[], [], []]);
  });

  test(`${label}: untrackedFiles lists an untracked directory file by file, a blank and a non-ASCII character as they are, an ignored file left out, and nothing outside a repository`, () => {
    const { git, outside, history } = make();
    assert.deepEqual([git.untrackedFiles(history), git.untrackedFiles(outside)], [HISTORY_STATE.untracked, []]);
  });

  test(`${label}: trackedIgnored lists a file tracked before its ignore rule, never an untracked ignored one, and nothing outside a repository`, () => {
    const { git, outside, history } = make();
    assert.deepEqual([git.trackedIgnored(history), git.trackedIgnored(outside)], [HISTORY_STATE.trackedIgnored, []]);
  });

  test(`${label}: ignored is true for a path the rules exclude, untracked, tracked or absent, a blank and a non-ASCII character in it, and false for another, for a name an expanded glob would match (the path is literal) and outside a repository`, () => {
    const { git, outside, history } = make();
    assert.deepEqual(
      HISTORY_STATE.ignored.map((path) => git.ignored(history, path)),
      HISTORY_STATE.ignored.map(() => true),
    );
    assert.deepEqual([git.ignored(history, "edited.txt"), git.ignored(history, "untracked dir/new.txt"), git.ignored(history, "ignored.*"), git.ignored(outside, "ignored.log")], [false, false, false, false]);
  });

  test(`${label}: status lists the unstaged, staged, renamed (its old path dropped) and untracked paths with their two letters, an ignored file left out, and nothing outside a repository`, () => {
    const { git, outside, history } = make();
    assert.deepEqual([git.status(history), git.status(outside)], [HISTORY_STATE.status, []]);
  });

  for (const row of [
    { name: "the root", at: "", want: true },
    { name: "a directory below it", at: "/src", want: true },
    { name: "the .git directory, which is no work tree", at: "/.git", want: true },
  ]) {
    test(`${label}: isRepository is true for ${row.name}`, () => {
      const { git, root } = make();
      assert.equal(git.isRepository(`${root}${row.at}`), row.want);
    });
  }

  test(`${label}: isRepository is false outside a repository`, () => {
    const { git, outside } = make();
    assert.equal(git.isRepository(outside), false);
  });

  test(`${label}: shortCommit is the front of the sha of HEAD`, () => {
    const { git, history } = make();
    const short = git.shortCommit(history, "HEAD") ?? "";
    assert.match(short, /^[0-9a-f]{4,39}$/);
    assert.ok((git.commit(history, "HEAD") ?? "").startsWith(short), short);
  });

  test(`${label}: shortCommit is null on a branch with no commit yet`, () => {
    const { git, root } = make();
    assert.equal(git.shortCommit(root, "HEAD"), null);
  });

  for (const row of [
    { name: "a file", path: "kept.txt", want: [true, true] },
    { name: "a directory above one", path: "docs", want: [true, true] },
    { name: "a tracked file deleted from disk", path: "gone.txt", want: [true, true] },
    { name: "the new path of a staged rename", path: "new name.txt", want: [true, false] },
    { name: "the old path of a staged rename", path: "old name.txt", want: [false, true] },
    { name: "an untracked directory", path: "untracked dir", want: [false, false] },
    { name: "a glob that would match (the path is literal)", path: "*.txt", want: [false, false] },
  ]) {
    test(`${label}: indexHolds and headHolds of ${row.name} are ${row.want.join(" and ")}`, () => {
      const { git, history } = make();
      assert.deepEqual([git.indexHolds(history, row.path), git.headHolds(history, row.path)], row.want);
    });
  }

  test(`${label}: indexHolds and headHolds take an absolute path`, () => {
    const { git, history } = make();
    assert.deepEqual([git.indexHolds(history, `${history}/kept.txt`), git.headHolds(history, `${history}/kept.txt`)], [true, true]);
  });

  test(`${label}: on a branch with no commit yet the index holds a file HEAD does not`, () => {
    const { git, root } = make();
    assert.deepEqual([git.indexHolds(root, "README.md"), git.headHolds(root, "README.md")], [true, false]);
  });

  for (const row of [
    { name: "with both modes, a rename as its two paths", paths: null, want: HISTORY_STATE.stagedFiles },
    { name: "narrowed to the named paths, one not staged left out", paths: ["staged.txt", "edited.txt"], want: HISTORY_STATE.stagedFiles.slice(2) },
    { name: "narrowed to a literal path, never a glob", paths: ["*.txt"], want: [] },
  ]) {
    test(`${label}: stagedFiles lists what the index holds against HEAD, ${row.name}`, () => {
      const { git, history } = make();
      assert.deepEqual(git.stagedFiles(history, row.paths), row.want);
    });
  }

  test(`${label}: stagedFiles is null outside a repository`, () => {
    const { git, outside } = make();
    assert.equal(git.stagedFiles(outside, null), null);
  });

  for (const row of [
    { name: "lists what lies below a directory", path: "untracked dir", want: HISTORY_STATE.untracked },
    { name: "is empty for a directory holding none", path: "docs", want: [] },
    { name: "reads the path as a literal one", path: "untracked*", want: [] },
  ]) {
    test(`${label}: untrackedFiles with a path ${row.name}`, () => {
      const { git, history } = make();
      assert.deepEqual(git.untrackedFiles(history, row.path), row.want);
    });
  }

  for (const row of [
    { kind: "log", want: /^[0-9a-f]+ commit 3\n[0-9a-f]+ commit 2\n[0-9a-f]+ commit 1\n$/ },
    { kind: "status", want: /^ M edited\.txt\n$/ },
    { kind: "stat", want: /^ edited\.txt \| 2 \+-\n/ },
    { kind: "diff", want: /--- a\/edited\.txt\n\+\+\+ b\/edited\.txt\n@@ -1 \+1 @@\n-one\n\+two\n$/ },
  ] as const) {
    test(`${label}: report gives the ${row.kind} of a named path as git prints it`, () => {
      const { git, history } = make();
      assert.match(git.report(history, row.kind, ["edited.txt"]), row.want);
    });
  }

  test(`${label}: grep answers the path, the line number and the whole line of each line holding a term, in path order, the work tree read rather than the last commit`, () => {
    const { git, history } = make();
    assert.deepEqual(git.grep(history, ["second", "two"], false), [
      { path: "edited.txt", line: 1, text: "two" },
      { path: "kept.txt", line: 2, text: "the second line" },
      { path: "staged.txt", line: 1, text: "two" },
    ]);
  });

  test(`${label}: grep reads an untracked file, its path with a blank and a non-ASCII character as it is, and leaves an ignored file out`, () => {
    const { git, history } = make();
    assert.deepEqual(git.grep(history, ["new", "noise"], false), [{ path: "untracked dir/zażółć.txt", line: 1, text: "new" }]);
  });

  test(`${label}: grep reads a term as a fixed string (a dot is no wildcard) and with word true holds only a whole word`, () => {
    const { git, history } = make();
    const names = [{ path: "new name.txt", line: 1, text: "the same text under both names" }];
    assert.deepEqual([git.grep(history, ["t.o"], false), git.grep(history, ["name"], false), git.grep(history, ["name"], true), git.grep(history, ["names"], true)], [[], names, [], names]);
  });

  test(`${label}: grep is empty for a term no line holds, with no term and outside a repository`, () => {
    const { git, outside, history } = make();
    assert.deepEqual([git.grep(history, ["no such text"], false), git.grep(history, [], false), git.grep(outside, ["kept"], false)], [[], [], []]);
  });
}
