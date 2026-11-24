/*
 * tree-record.unit.test.ts - the tree-record core on fake ports: `--save`
 * writes the paths `git status` reports (staged, unstaged, untracked, a rename
 * as its new path; everything under .temp/ left out) to
 * `.temp/viber/fixer/tree-record` and prints `NEXT: trace` plus one `recorded:`
 * line per path; `--check [<test path>]` lists, as `path:` lines under a
 * `STOP:` line, every reported path that is neither recorded nor the given
 * test path, or prints `NEXT: handoff` when there is none; a missing or unknown
 * mode, an extra argument, a `--check` without a record, a record that cannot
 * be written and a run outside a git repository exit 2 with one `error:` line
 * and an empty stdout.
 *
 * A path is recorded by name, never by content: a recorded path changed
 * further is no finding. What git itself reports (an ignored file left out, an
 * untracked directory file by file, the old path of a rename dropped) is held
 * by the contract cases of the Git port; the wrapper is run as a process by
 * tests/viber/tree-record.critical.test.ts. The drive-letter and backslash
 * spellings run here on every system: the fakes hold a path as text.
 */

import assert from "node:assert/strict";
import { fakeFs, fakeGit, type FakeFsOpts } from "../../harness/fakes.ts";
import { test } from "../../harness/test.ts";
import type { Fs, StatusEntry } from "../../../viber/lib/ports.ts";
import { runTreeRecord } from "../../../viber/lib/tree-record.ts";

const ROOT = "/r";
const STOP = "STOP: changed since the record - revert before the handoff";
const RECORD = ".temp/viber/fixer/tree-record";

const entries = (...rows: string[]): StatusEntry[] => rows.map((row) => ({ code: row.slice(0, 2), path: row.slice(3) }));

interface Scene {
  root?: string;
  cwd?: string;
  fs?: Fs;
  /** The text of the record file; left out: no record. */
  record?: string;
  /** null: no repository. */
  status?: StatusEntry[] | null;
  opts?: FakeFsOpts;
}

function tree(argv: string[], scene: Scene = {}) {
  const root = scene.root ?? ROOT;
  const fs = scene.fs ?? fakeFs(scene.record === undefined ? {} : { [`${root}/${RECORD}`]: scene.record }, { dirs: [root], ...scene.opts });
  const git = fakeGit(scene.status === null ? null : { root, tracked: [], status: scene.status ?? [] });
  return { ...runTreeRecord(argv, scene.cwd ?? root, { fs, git }), fs };
}

const out = (result: { stdout: string; stderr: string; exit: number }) => ({ stdout: result.stdout, stderr: result.stderr, exit: result.exit });
const ok = (...rows: string[]) => ({ stdout: rows.map((row) => `${row}\n`).join(""), stderr: "", exit: 0 });
const refused = (reason: string) => ({ stdout: "", stderr: `error: ${reason}\n`, exit: 2 });

test("--save records a modified, a staged and an untracked file, leaves out everything under .temp/, and prints NEXT: trace then one recorded: line each", () => {
  const result = tree(["--save"], { status: entries(" M mod.txt", "M  stg.txt", "?? .temp/scratch.txt", "?? new/dir/f.txt") });
  assert.deepEqual(out(result), ok("NEXT: trace", "recorded: mod.txt", "recorded: new/dir/f.txt", "recorded: stg.txt"));
  assert.equal(result.fs.readText(`${ROOT}/${RECORD}`), "mod.txt\nnew/dir/f.txt\nstg.txt\n");
});

test("--save records a renamed file as its new path only", () => {
  const result = tree(["--save"], { status: entries("R  renamed.txt") });
  assert.deepEqual(out(result), ok("NEXT: trace", "recorded: renamed.txt"));
  assert.equal(result.fs.readText(`${ROOT}/${RECORD}`), "renamed.txt\n");
});

test("--save on a clean tree prints NEXT: trace alone and writes an empty record, so a later --check has a record to compare with", () => {
  const result = tree(["--save"]);
  assert.deepEqual(out(result), ok("NEXT: trace"));
  assert.deepEqual([result.fs.readText(`${ROOT}/${RECORD}`), result.fs.kind(`${ROOT}/${RECORD}`)], ["", "file"]);
});

test("--save replaces an earlier record whole (a shorter list leaves no line of the old one)", () => {
  const result = tree(["--save"], { record: "old-a.txt\nold-b.txt\nold-c.txt\n", status: entries(" M now.txt") });
  assert.equal(result.fs.readText(`${ROOT}/${RECORD}`), "now.txt\n");
});

test("--save sorts the paths by their bytes and records each once: an upper-case letter before a lower-case one, a non-ASCII character after ASCII, a blank kept as it is", () => {
  const accented = "za\u017c\u00f3\u0142\u0107.txt";
  const result = tree(["--save"], { status: entries("?? b.txt", ` M ${accented}`, "?? B.txt", " M a b.txt", "M  b.txt") });
  assert.deepEqual(out(result), ok("NEXT: trace", "recorded: B.txt", "recorded: a b.txt", "recorded: b.txt", `recorded: ${accented}`));
});

test("--save from a subdirectory writes the record under the repository root, the paths relative to the root", () => {
  const result = tree(["--save"], { cwd: `${ROOT}/src/deep`, status: entries(" M src/deep/a.txt"), opts: { dirs: [ROOT, `${ROOT}/src/deep`] } });
  assert.deepEqual(out(result), ok("NEXT: trace", "recorded: src/deep/a.txt"));
  assert.equal(result.fs.readText(`${ROOT}/${RECORD}`), "src/deep/a.txt\n");
});

test("--save that cannot create the record directory, or cannot write the record, prints one error: line, an empty stdout and exits 2", () => {
  const blocked = tree(["--save"], { fs: fakeFs({ [`${ROOT}/.temp`]: "a file where the directory goes\n" }) });
  const occupied = tree(["--save"], { fs: fakeFs({ [`${ROOT}/${RECORD}/inside.txt`]: "the record path is a directory\n" }) });
  assert.deepEqual([out(blocked), out(occupied)], [refused("cannot create .temp/viber/fixer"), refused(`cannot write ${RECORD}`)]);
});

for (const spelling of ["tests/repro.test.ts", "./tests/repro.test.ts", `${ROOT}/tests/repro.test.ts`]) {
  test(`--check "${spelling}" after only that test was added prints NEXT: handoff`, () => {
    const result = tree(["--check", spelling], { record: "mod.txt\n", status: entries(" M mod.txt", "?? tests/repro.test.ts") });
    assert.deepEqual(out(result), ok("NEXT: handoff"));
  });
}

test("--check given the reproduction test relative to a subdirectory of the repository prints NEXT: handoff", () => {
  const scene = { cwd: `${ROOT}/tests`, record: "mod.txt\n", status: entries(" M mod.txt", "?? tests/repro.test.ts"), opts: { dirs: [`${ROOT}/tests`] } };
  assert.deepEqual([out(tree(["--check", "repro.test.ts"], scene)), out(tree(["--check", "./repro.test.ts"], scene))], [ok("NEXT: handoff"), ok("NEXT: handoff")]);
});

test("--check from a subdirectory reached through a link reads the relative path against the directory the link names", () => {
  const fs = fakeFs({ [`${ROOT}/${RECORD}`]: "", [`${ROOT}/tests/repro.test.ts`]: "x\n" }, { links: { "/alias": `${ROOT}/tests` } });
  const git = { ...fakeGit({ root: ROOT, tracked: [], status: entries("?? tests/repro.test.ts") }), repoRoot: () => ROOT };
  assert.deepEqual(out(runTreeRecord(["--check", "repro.test.ts"], "/alias", { fs, git })), ok("NEXT: handoff"));
});

test("--check drops a leading ./ once only: ././tests/repro.test.ts names another path, so the test file still counts as changed", () => {
  const result = tree(["--check", "././tests/repro.test.ts"], { record: "", status: entries("?? tests/repro.test.ts") });
  assert.deepEqual(out(result), ok(STOP, "path: tests/repro.test.ts"));
});

test("--check given an absolute path outside the repository compares it as given, so the test file still counts as changed", () => {
  const result = tree(["--check", "/elsewhere/tests/repro.test.ts"], { record: "", status: entries("?? tests/repro.test.ts") });
  assert.deepEqual(out(result), ok(STOP, "path: tests/repro.test.ts"));
});

test("--check given the reproduction test as an absolute path still prints the STOP: line naming a second changed file", () => {
  const result = tree(["--check", `${ROOT}/tests/repro.test.ts`], { record: "", status: entries("?? src/other.ts", "?? tests/repro.test.ts") });
  assert.deepEqual(out(result), ok(STOP, "path: src/other.ts"));
});

test("--check after another file changed prints the STOP: line and a path: line for that file only, never a recorded path changed further nor the test path", () => {
  const result = tree(["--check", "tests/repro.test.ts"], { record: "mod.txt\n", status: entries("MM mod.txt", "?? src/other.ts", "?? tests/repro.test.ts") });
  assert.deepEqual(out(result), ok(STOP, "path: src/other.ts"));
});

test("--check with no path, or an empty one, lists every path changed since the record, sorted, and never one under .temp/", () => {
  const scene = { record: "mod.txt\n", status: entries(" M mod.txt", "?? z.txt", "?? .temp/viber/fixer/tree-record", "?? a.txt") };
  const want = ok(STOP, "path: a.txt", "path: z.txt");
  assert.deepEqual([out(tree(["--check"], scene)), out(tree(["--check", ""], scene))], [want, want]);
});

test("--check on a tree changed no further than the record prints NEXT: handoff, and writes nothing", () => {
  const result = tree(["--check"], { record: "mod.txt\nnew/dir/f.txt\n", status: entries(" M mod.txt", "?? new/dir/f.txt") });
  assert.deepEqual(out(result), ok("NEXT: handoff"));
  assert.equal(result.fs.readText(`${ROOT}/${RECORD}`), "mod.txt\nnew/dir/f.txt\n");
});

test("--check matches a recorded path whole: a path that is the start or the end of a recorded one is still a change", () => {
  const result = tree(["--check"], { record: "src/mod.txt\n", status: entries(" M src/mod.txt", "?? mod.txt", "?? src/mod.txt.bak", "?? src/mod") });
  assert.deepEqual(out(result), ok(STOP, "path: mod.txt", "path: src/mod", "path: src/mod.txt.bak"));
});

for (const [label, spell] of [
  ["the C:/ form", "C:/r/tests/repro.test.ts"],
  ["the C:\\ form", "C:\\r\\tests\\repro.test.ts"],
  ["a drive letter in the other case", "c:/r/tests/repro.test.ts"],
  ["the other case with backslashes", "c:\\r\\tests\\repro.test.ts"],
] as const) {
  test(`under a drive root --check given the reproduction test as ${label} after only that test was added prints NEXT: handoff`, () => {
    const result = tree(["--check", spell], { root: "C:/r", record: "mod.txt\n", status: entries(" M mod.txt", "?? tests/repro.test.ts") });
    assert.deepEqual(out(result), ok("NEXT: handoff"));
  });
}

test("under a drive root an absolute path on another drive, and one in the /c/ form, is compared as given (Git Bash hands the entry C:/ for /c/, so the core holds no rule for it)", () => {
  const scene = { root: "C:/r", record: "", status: entries("?? tests/repro.test.ts") };
  const want = ok(STOP, "path: tests/repro.test.ts");
  assert.deepEqual([out(tree(["--check", "D:/r/tests/repro.test.ts"], scene)), out(tree(["--check", "/c/r/tests/repro.test.ts"], scene))], [want, want]);
});

test("under a root that is no drive a backslash in the given path is a character of its name, never a separator", () => {
  const result = tree(["--check", "tests\\repro.test.ts"], { record: "", status: entries("?? tests/repro.test.ts") });
  assert.deepEqual(out(result), ok(STOP, "path: tests/repro.test.ts"));
});

for (const [name, argv, reason] of [
  ["--check before any --save", ["--check", "tests/repro.test.ts"], "no record file: run tree-record.sh --save before the first edit"],
  ["an unknown mode", ["--bogus"], "unknown mode: --bogus"],
  ["no mode", [], "no mode: tree-record.sh --save | --check [<reproduction test path>]"],
  ["an empty mode", [""], "no mode: tree-record.sh --save | --check [<reproduction test path>]"],
  ["--save with an argument", ["--save", "extra"], "--save takes no argument"],
  ["--check with two arguments", ["--check", "a", "b"], "--check takes at most one argument: the reproduction test path"],
] as const) {
  test(`${name} prints one error: line, an empty stdout and exits 2`, () => {
    assert.deepEqual(out(tree([...argv], { status: entries(" M mod.txt") })), refused(reason));
  });
}

test("--check with a directory where the record file goes prints the no record error and exits 2", () => {
  const result = tree(["--check"], { fs: fakeFs({ [`${ROOT}/${RECORD}/inside.txt`]: "" }) });
  assert.deepEqual(out(result), refused("no record file: run tree-record.sh --save before the first edit"));
});

test("--save and --check outside a git repository print one error: line, an empty stdout and exit 2, and a wrong call is refused for its arguments first", () => {
  const outside = refused("not inside a git repository");
  assert.deepEqual([out(tree(["--save"], { status: null })), out(tree(["--check"], { status: null })), out(tree(["--save", "extra"], { status: null }))], [outside, outside, refused("--save takes no argument")]);
});
