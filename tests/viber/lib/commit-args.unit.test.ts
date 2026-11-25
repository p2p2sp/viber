/*
 * commit-args.unit.test.ts - the selector reading of the commit skill on fake
 * ports: which paths, mode and issue references the raw argument string of
 * commit and commit-context names. What git itself answers for a path is held
 * by the contract cases of the Git port; the drive-letter and MSYS spellings run
 * here on every system, since the fakes hold a path as text.
 */

import assert from "node:assert/strict";
import { fakeFs, fakeGit, type FakeRepo } from "../../harness/fakes.ts";
import { test } from "../../harness/test.ts";
import { diskPath, readSelector } from "../../../viber/lib/commit-args.ts";

interface Scene {
  /** The files on disk, below the root. */
  files?: string[];
  root?: string;
  /** Below the root. */
  cwd?: string;
  /** What git holds beside them. */
  repo?: Partial<FakeRepo>;
  /** No repository around the cwd. */
  outside?: boolean;
}

function read(raw: string, scene: Scene = {}) {
  const root = scene.root ?? "/r";
  const fs = fakeFs(Object.fromEntries((scene.files ?? []).map((file) => [`${root}/${file}`, "x\n"])), { dirs: [root, `${root}${scene.cwd ?? ""}`] });
  const git = fakeGit(scene.outside ? null : { root, tracked: [], ...scene.repo });
  const { mode, paths, missing, refs } = readSelector(raw, `${root}${scene.cwd ?? ""}`, { fs, git });
  return { mode, paths, missing, refs };
}

type Selected = ReturnType<typeof read>;
const all = (...refs: string[]): Selected => ({ mode: "all", paths: [], missing: "", refs });
const paths = (list: string[], ...refs: string[]): Selected => ({ mode: "paths", paths: list, missing: "", refs });
const missing = (text: string, ...refs: string[]): Selected => ({ mode: "missing", paths: [], missing: text, refs });

const URL = "https://github.com/owner/repo/issues";

const ROWS: Array<{ name: string; raw: string; scene?: Scene; want: Selected }> = [
  // the keyword, prose and paths that are not there
  { name: "empty input selects every change", raw: "", want: all() },
  { name: "the keyword is read in any case", raw: "ALL", want: all() },
  { name: "'staged' is no keyword: with no such path it selects every change", raw: "staged", want: all() },
  { name: "prose holding no path-shaped token selects every change", raw: "fix the manifest wording", want: all() },
  { name: "a glob token beside prose is never expanded", raw: "*.txt nothing", scene: { files: ["a.txt"] }, want: all() },
  { name: "commas alone select every change", raw: ",,,", want: all() },
  { name: "a path that is not there is missing, never every change (a typo must not widen the commit)", raw: "does/not/exist.txt", want: missing("does/not/exist.txt") },
  { name: "a list of backslashed paths none of which exists is missing", raw: "src\\gone.ts lib\\old.ts", want: missing("src\\gone.ts lib\\old.ts") },
  { name: "a path-shaped token is missing with its '#12' cut, the rest kept", raw: "bugs/#12.md", want: missing("bugs/.md", "12") },
  // paths
  { name: "an existing path is passed as given", raw: "foo.txt", scene: { files: ["foo.txt"] }, want: paths(["foo.txt"]) },
  { name: "an existing path named 'all' wins over the keyword", raw: "all", scene: { files: ["all"] }, want: paths(["all"]) },
  { name: "a path holding a blank is one path when it is the whole selector", raw: "my file.txt", scene: { files: ["my file.txt"] }, want: paths(["my file.txt"]) },
  { name: "blanks around a path are dropped", raw: "  a.txt\t", scene: { files: ["a.txt"] }, want: paths(["a.txt"]) },
  { name: "a list split on blanks keeps every path in order", raw: "a.txt src", scene: { files: ["a.txt", "src/x"] }, want: paths(["a.txt", "src"]) },
  { name: "a list is split on commas too", raw: "a.txt, b.txt", scene: { files: ["a.txt", "b.txt"] }, want: paths(["a.txt", "b.txt"]) },
  { name: "one existing path among missing ones keeps that one", raw: "a.txt src/gone.ts missing.txt", scene: { files: ["a.txt"] }, want: paths(["a.txt"]) },
  { name: "a path gone from disk the index still holds is a path", raw: "gone.txt", scene: { repo: { tracked: [{ path: "gone.txt", mode: "100644" }] } }, want: paths(["gone.txt"]) },
  { name: "a directory HEAD alone holds (removed with git rm) is a path beside one on disk", raw: "kept.txt gone", scene: { files: ["kept.txt"], repo: { head: ["gone/f.txt"] } }, want: paths(["kept.txt", "gone"]) },
  { name: "outside a repository a path on disk is one", raw: "a.txt", scene: { files: ["a.txt"], outside: true }, want: paths(["a.txt"]) },
  // issue references
  { name: "an issue link is cut", raw: `${URL}/42`, want: all("42") },
  { name: "several issue links keep their order", raw: `${URL}/42 ${URL}/7`, want: all("42", "7") },
  { name: "a repeated issue link counts once", raw: `${URL}/42 ${URL}/42`, want: all("42") },
  { name: "the fragment of an issue link is no second reference", raw: `${URL}/42#issuecomment-99`, want: all("42") },
  { name: "an issue link beside a path leaves the path", raw: `src/foo ${URL}/42`, scene: { files: ["src/foo"] }, want: paths(["src/foo"], "42") },
  { name: "bare references count once each, in order", raw: "#42 #7 #42", want: all("42", "7") },
  { name: "bare references beside punctuation are read", raw: "(#42,#7)", want: all("42", "7") },
  { name: "a bare reference beside a path leaves the path", raw: "src/foo #42", scene: { files: ["src/foo"] }, want: paths(["src/foo"], "42") },
  { name: "a link and bare references make one list", raw: `${URL}/42 #7 #42`, want: all("42", "7") },
  { name: "a hex colour, a number run into letters and a bare '#' are no references", raw: "#1a2b3c #42abc #", want: all() },
  { name: "a number after a letter outside ASCII is no reference", raw: "\u017c#42", want: all() },
  { name: "a reference after one run into letters is cut at its own place", raw: "x,#42abc,#42", want: all("42") },
  { name: "an existing path holding '#12' is that path, no reference", raw: "bugs/#12.md", scene: { files: ["bugs/#12.md"] }, want: paths(["bugs/#12.md"]) },
  { name: "such a path in a list stays whole beside a reference that is cut", raw: "a.txt bugs/#12.md #5", scene: { files: ["a.txt", "bugs/#12.md"] }, want: paths(["a.txt", "bugs/#12.md"], "5") },
  // a subdirectory
  { name: "from a subdirectory a cwd-relative path becomes root-relative", raw: "src/f.txt", scene: { files: ["pkg/src/f.txt"], cwd: "/pkg" }, want: paths(["pkg/src/f.txt"]) },
  { name: "from a subdirectory a leading ./ is dropped", raw: "./src/f.txt", scene: { files: ["pkg/src/f.txt"], cwd: "/pkg" }, want: paths(["pkg/src/f.txt"]) },
  { name: "from a subdirectory a root-relative path stays", raw: "pkg/src/f.txt", scene: { files: ["pkg/src/f.txt"], cwd: "/pkg" }, want: paths(["pkg/src/f.txt"]) },
  { name: "from a subdirectory an absolute path stays as given", raw: "/r/pkg/src/f.txt", scene: { files: ["pkg/src/f.txt"], cwd: "/pkg" }, want: paths(["/r/pkg/src/f.txt"]) },
  { name: "from a subdirectory both spellings in a list resolve", raw: "src/f.txt, pkg/src/f.txt", scene: { files: ["pkg/src/f.txt"], cwd: "/pkg" }, want: paths(["pkg/src/f.txt", "pkg/src/f.txt"]) },
  { name: "from a subdirectory a path under neither the cwd nor the root is missing", raw: "src/nothing.txt", scene: { files: ["pkg/x"], cwd: "/pkg" }, want: missing("src/nothing.txt") },
  { name: "from a subdirectory no selector is every change, never that directory", raw: "", scene: { files: ["pkg/x"], cwd: "/pkg" }, want: all() },
  { name: "from a subdirectory a reference alone is every change", raw: "#42", scene: { files: ["pkg/x"], cwd: "/pkg" }, want: all("42") },
  // Windows
  { name: "under a drive root an MSYS path inside a list is read as the drive path (the shell converts a lone argument only)", raw: "a.txt /c/r/b.txt", scene: { root: "C:/r", files: ["a.txt", "b.txt"] }, want: paths(["a.txt", "C:/r/b.txt"]) },
  { name: "under a drive root a C:/ path stays as given", raw: "C:/r/a.txt", scene: { root: "C:/r", files: ["a.txt"] }, want: paths(["C:/r/a.txt"]) },
  { name: "under a POSIX root /c/ is a directory like any other", raw: "/c/a.txt b", scene: { files: ["c/a.txt", "b"] }, want: paths(["b"]) },
];

for (const row of ROWS) {
  test(row.name, () => {
    assert.deepEqual(read(row.raw, row.scene), row.want);
  });
}

for (const row of [
  { path: "a.txt", root: "/r", want: "/r/a.txt" },
  { path: "/x/a.txt", root: "/r", want: "/x/a.txt" },
  { path: "\\a.txt", root: "/r", want: "/r/\\a.txt" },
  { path: "C:\\r\\a.txt", root: "C:/r", want: "C:\\r\\a.txt" },
  { path: "\\a.txt", root: "C:/r", want: "\\a.txt" },
]) {
  test(`the path ${row.path} lies at ${row.want} on disk under the root ${row.root}`, () => {
    assert.equal(diskPath(row.path, row.root), row.want);
  });
}
