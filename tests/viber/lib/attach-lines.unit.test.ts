/*
 * attach-lines.unit.test.ts - the attach-lines core on fake ports: it answers
 * one `Attachment: <absolute path>` line per argument naming an existing file
 * or directory strictly under <repository root>/.temp/ (absolute, forward
 * slashes, in argument order, a repeat once, a relative path resolved from the
 * cwd, a symlinked directory resolved), nothing for any other argument, and
 * exits 2 with one `error:` line and an empty stdout with no argument or
 * outside a git repository.
 *
 * The backslash, drive-letter and network spellings run here on every system:
 * the fake file system holds a `C:/...` path as the text it is.
 */

import assert from "node:assert/strict";
import { fakeFs, fakeGit, type FakeFsOpts } from "../../harness/fakes.ts";
import { test } from "../../harness/test.ts";
import { runAttachLines, type AttachLinesResult } from "../../../viber/lib/attach-lines.ts";

const ROOT = "/r";

interface Scene extends FakeFsOpts {
  /** Paths of files, each holding one line. */
  files?: string[];
  cwd?: string;
  /** The repository root; null for no repository. */
  root?: string | null;
}

function run(argv: string[], scene: Scene = {}): AttachLinesResult {
  const root = scene.root === undefined ? ROOT : scene.root;
  const files = Object.fromEntries((scene.files ?? []).map((file) => [file, "x\n"]));
  const git = fakeGit(root === null ? null : { root, tracked: [] });
  return runAttachLines(argv, scene.cwd ?? root ?? ROOT, { fs: fakeFs(files, scene), git });
}

const lines = (...paths: string[]): AttachLinesResult => ({ stdout: paths.map((p) => `Attachment: ${p}\n`).join(""), stderr: "", exit: 0 });

test("a file and a directory under .temp/ print one Attachment: line each, absolute with forward slashes, in argument order", () => {
  const out = run([".temp/viber/shots", ".temp/findings.md", "/r/.temp/viber/prototype/mock.html"], {
    files: ["/r/.temp/viber/prototype/mock.html", "/r/.temp/findings.md"],
    dirs: ["/r/.temp/viber/shots"],
  });
  assert.deepEqual(out, lines("/r/.temp/viber/shots", "/r/.temp/findings.md", "/r/.temp/viber/prototype/mock.html"));
});

test("a path named twice, once relative and once absolute, prints once at its first place", () => {
  const out = run([".temp/a.md", ".temp/b.md", "/r/.temp/a.md", "./.temp/b.md"], { files: ["/r/.temp/a.md", "/r/.temp/b.md"] });
  assert.deepEqual(out, lines("/r/.temp/a.md", "/r/.temp/b.md"));
});

test("a relative path resolves against the cwd, not the repository root", () => {
  const out = run(["../.temp/viber/n.md", ".temp/inner.md"], { cwd: "/r/src", files: ["/r/.temp/viber/n.md", "/r/src/.temp/inner.md"] });
  assert.deepEqual(out, lines("/r/.temp/viber/n.md"));
});

test("a path outside .temp/, a missing one, the .temp/ directory itself and an empty argument print nothing and exit 0", () => {
  const out = run(["src/app.ts", "docs/.temp-notes.md", ".temp/missing.md", ".temp", ".temp/", "", ".temp/../src/app.ts"], {
    files: ["/r/src/app.ts", "/r/docs/.temp-notes.md", "/r/.temp/real.md"],
  });
  assert.deepEqual(out, lines());
});

test("a path outside .temp/ between two valid ones is dropped without disturbing their lines or order", () => {
  const out = run([".temp/two.md", "README.md", ".temp/one.md"], { files: ["/r/.temp/one.md", "/r/.temp/two.md", "/r/README.md"] });
  assert.deepEqual(out, lines("/r/.temp/two.md", "/r/.temp/one.md"));
});

test("no argument exits 2 with one error: line and an empty stdout", () => {
  assert.deepEqual(run([], { files: ["/r/.temp/a.md"] }), {
    stdout: "",
    stderr: "error: attach-lines.sh: usage: attach-lines.sh <path> [<path>]...\n",
    exit: 2,
  });
});

test("outside a git repository it exits 2 with one error: line and an empty stdout, even for a path under a .temp/", () => {
  assert.deepEqual(run([".temp/a.md"], { root: null, cwd: "/work", files: ["/work/.temp/a.md"] }), {
    stdout: "",
    stderr: "error: attach-lines.sh: not inside a git repository\n",
    exit: 2,
  });
});

for (const [label, arg] of [
  ["a trailing slash on a directory", ".temp/viber/"],
  ["several trailing slashes", ".temp/viber///"],
  ["a doubled slash inside the path", ".temp//viber"],
  ["a leading ./", "./.temp/viber"],
  ["a . segment inside the path", ".temp/./viber"],
  ["a .. segment that stays under .temp/", ".temp/other/../viber"],
  ["backslashes in a relative path", ".temp\\viber"],
  ["a backslash and a trailing backslash", ".\\.temp\\viber\\"],
  ["an absolute path with a doubled slash", "/r//.temp/viber"],
] as const) {
  test(`${label} names the same directory and prints it spelled one way (${arg})`, () => {
    assert.deepEqual(run([arg], { files: ["/r/.temp/viber/a.md"] }), lines("/r/.temp/viber"));
  });
}

test("every spelling of one file prints one line (the repeat check compares the resolved path)", () => {
  const out = run([".temp/a.md", ".temp//a.md", ".temp\\a.md", "./.temp/./a.md", "src/../.temp/a.md", "/r/.temp/a.md/"], { files: ["/r/.temp/a.md"] });
  assert.deepEqual(out, lines("/r/.temp/a.md"));
});

for (const [label, cwd, arg] of [
  ["a backslash drive-letter argument", "C:/Users/me/repo", "C:\\Users\\me\\repo\\.temp\\viber\\mock.html"],
  ["a forward slash drive-letter argument", "C:/Users/me/repo", "C:/Users/me/repo/.temp/viber/mock.html"],
  ["a relative backslash argument from a backslash cwd", "C:\\Users\\me\\repo\\src", "..\\.temp\\viber\\mock.html"],
  ["a relative argument from a backslash cwd at the root", "C:\\Users\\me\\repo", ".temp/viber/mock.html"],
] as const) {
  test(`on a Windows drive ${label} prints the C:/ form with forward slashes`, () => {
    const out = run([arg], { root: "C:/Users/me/repo", cwd, files: ["C:/Users/me/repo/.temp/viber/mock.html", "C:/Users/me/repo/src/a.ts"] });
    assert.deepEqual(out, lines("C:/Users/me/repo/.temp/viber/mock.html"));
  });
}

test("on a Windows drive a path on another drive, and one differing in letter case, print nothing (the compare is exact text)", () => {
  const out = run(["D:\\Users\\me\\repo\\.temp\\a.md", "c:/Users/me/repo/.temp/a.md"], {
    root: "C:/Users/me/repo",
    files: ["C:/Users/me/repo/.temp/a.md", "D:/Users/me/repo/.temp/a.md", "c:/Users/me/repo/.temp/a.md"],
  });
  assert.deepEqual(out, lines());
});

test("a repository at a drive root and one at the file system root still find their .temp/", () => {
  assert.deepEqual(run(["C:\\.temp\\a.md", ".temp/a.md"], { root: "C:/", files: ["C:/.temp/a.md"] }), lines("C:/.temp/a.md"));
  assert.deepEqual(run(["/.temp/a.md", "/a.md"], { root: "/", cwd: "/", files: ["/.temp/a.md", "/a.md"] }), lines("/.temp/a.md"));
});

test("a network path keeps its two leading slashes", () => {
  const out = run(["\\\\host\\share\\repo\\.temp\\a.md"], { root: "//host/share/repo", files: ["//host/share/repo/.temp/a.md"] });
  assert.deepEqual(out, lines("//host/share/repo/.temp/a.md"));
});

test("a directory reached through a link outside .temp/ prints the real path under .temp/, for the directory and for a file in it", () => {
  const out = run(["shortcut", "shortcut/a.md", ".temp/viber/a.md"], { files: ["/r/.temp/viber/a.md"], links: { "/r/shortcut": "/r/.temp/viber" } });
  assert.deepEqual(out, lines("/r/.temp/viber", "/r/.temp/viber/a.md"));
});

test("a link under .temp/ naming a directory outside it prints nothing, for the link and for a file through it", () => {
  const out = run([".temp/out", ".temp/out/app.ts"], { files: ["/r/src/app.ts", "/r/.temp/keep.md"], links: { "/r/.temp/out": "/r/src" } });
  assert.deepEqual(out, lines());
});

test("a path that climbs above the root with .. stops at the root", () => {
  assert.deepEqual(run(["../../../r/.temp/a.md"], { files: ["/r/.temp/a.md"] }), lines("/r/.temp/a.md"));
});

test("a directory whose name only starts with .temp, and a .temp/ below a subdirectory, print nothing", () => {
  const out = run([".temporary/a.md", ".temp-notes", "src/.temp/a.md"], { files: ["/r/.temporary/a.md", "/r/.temp-notes/b.md", "/r/src/.temp/a.md"] });
  assert.deepEqual(out, lines());
});

test("a file that exists yet cannot be read still prints its line (only its existence is asked)", () => {
  assert.deepEqual(run([".temp/locked.md"], { unreadable: ["/r/.temp/locked.md"] }), lines("/r/.temp/locked.md"));
});
