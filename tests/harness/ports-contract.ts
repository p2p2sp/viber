/*
 * ports-contract.ts - the contract cases of the Fs, Git and Clock ports,
 * written against the ports alone. The fake passes them as a unit file, each
 * real adapter as an integration file, over the arranged states SCENE_STATE
 * and HISTORY_STATE.
 * A case that writes does it under a directory of its own name below the
 * scratch directory, never in the repository.
 */

import assert from "node:assert/strict";
import type { ChangedFile, Clock, Fs, Git, StatusEntry } from "../../viber/lib/ports.ts";
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
 * against no base (none), and the untracked files.
 */
export const HISTORY_STATE: {
  commits: Array<Record<string, string | null>>;
  tree: Record<string, string | null>;
  staged: string[];
  status: StatusEntry[];
  changed: { head: ChangedFile[]; first: ChangedFile[]; none: ChangedFile[] };
  untracked: string[];
} = {
  commits: [
    {
      ".gitignore": "ignored.log\n",
      "kept.txt": "kept\nthe second line\n",
      "edited.txt": "one\n",
      "gone.txt": "gone\n",
      "staged.txt": "one\n",
      "old name.txt": "the same text under both names\n",
      "docs/run/plan.md": "plan\n",
    },
    { "docs/run/plan.md": null },
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
      { status: "A", path: "staged.txt" },
    ],
  },
  untracked: ["untracked dir/za\u017c\u00f3\u0142\u0107.txt"],
};

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

  test(`${label}: status lists the unstaged, staged, renamed (its old path dropped) and untracked paths with their two letters, an ignored file left out, and nothing outside a repository`, () => {
    const { git, outside, history } = make();
    assert.deepEqual([git.status(history), git.status(outside)], [HISTORY_STATE.status, []]);
  });

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
