/*
 * summary-path.unit.test.ts - the summary-path core on fake ports: with no
 * argument it answers one
 * `NEXT: write | path: <root>/.temp/viber/intent/summary-<stamp>.md` line
 * (absolute path, forward slashes, stamp `YYYY-MM-DD-HH-MM-SS` in local time),
 * creates that directory and writes no file; <root> is the repository root from
 * any subdirectory and the cwd outside a repository; any argument, or a
 * directory that cannot be created, exits 2 with one `error:` line and an empty
 * stdout.
 *
 * The fake clock is built from local-time fields, so every stamp reads the same
 * in any time zone.
 */

import assert from "node:assert/strict";
import { fakeClock, fakeFs, fakeGit } from "../../harness/fakes.ts";
import { test } from "../../harness/test.ts";
import type { Fs } from "../../../viber/lib/ports.ts";
import { runSummaryPath, type SummaryPathResult } from "../../../viber/lib/summary-path.ts";

const AT = new Date(2026, 10, 24, 17, 14, 16);
const STAMP = "2026-11-24-17-14-16";

/** One call at the instant AT; root: the repository root, null for no repository. */
function run(argv: string[], cwd: string, root: string | null, fs: Fs = fakeFs({}), at: Date = AT): SummaryPathResult {
  const git = fakeGit(root === null ? null : { root, tracked: [] });
  return runSummaryPath(argv, cwd, { fs, git, clock: fakeClock(at) });
}

test("in a repository it answers the NEXT: write line with the root, the .temp/viber/intent/ directory and a stamped file name", () => {
  assert.deepEqual(run([], "/r", "/r"), {
    stdout: `NEXT: write | path: /r/.temp/viber/intent/summary-${STAMP}.md\n`,
    stderr: "",
    exit: 0,
  });
});

test("it creates the .temp/viber/intent/ directory and writes no file in it (the hand-off writes the summary itself)", () => {
  const fs = fakeFs({ "/r/README.md": "x\n" });
  run([], "/r", "/r", fs);
  assert.deepEqual([fs.kind("/r/.temp/viber/intent"), fs.listDir("/r/.temp/viber/intent")], ["dir", []]);
});

test("a directory that already holds a summary is kept with its file", () => {
  const fs = fakeFs({ "/r/.temp/viber/intent/summary-2026-01-01-00-00-00.md": "old\n" });
  const result = run([], "/r", "/r", fs);
  assert.equal(result.exit, 0);
  assert.deepEqual(fs.listDir("/r/.temp/viber/intent"), ["summary-2026-01-01-00-00-00.md"]);
});

test("run from a subdirectory it names the repository root, not the subdirectory", () => {
  const fs = fakeFs({ "/r/src/deep/a.ts": "x\n" });
  const result = run([], "/r/src/deep", "/r", fs);
  assert.equal(result.stdout, `NEXT: write | path: /r/.temp/viber/intent/summary-${STAMP}.md\n`);
  assert.deepEqual([fs.exists("/r/src/deep/.temp"), fs.kind("/r/.temp/viber/intent")], [false, "dir"]);
});

test("outside a repository it names the cwd as the root and creates the directory there", () => {
  const fs = fakeFs({});
  const result = run([], "/work/notes", null, fs);
  assert.deepEqual(result, { stdout: `NEXT: write | path: /work/notes/.temp/viber/intent/summary-${STAMP}.md\n`, stderr: "", exit: 0 });
  assert.equal(fs.kind("/work/notes/.temp/viber/intent"), "dir");
});

for (const [label, cwd, root, want] of [
  ["a backslash drive-letter cwd outside a repository", "C:\\Users\\me\\notes", null, "C:/Users/me/notes"],
  ["a backslash drive-letter cwd inside a repository", "C:\\Users\\me\\repo\\src", "C:/Users/me/repo", "C:/Users/me/repo"],
  ["a forward slash drive-letter cwd outside a repository", "C:/Users/me/notes", null, "C:/Users/me/notes"],
  ["a cwd ending on a slash outside a repository", "/work/notes/", null, "/work/notes"],
  ["a drive root outside a repository", "C:\\", null, "C:"],
  ["the file system root outside a repository", "/", null, ""],
] as const) {
  test(`${label} prints the root with forward slashes and one slash before .temp (${want}/.temp)`, () => {
    const fs = fakeFs({});
    const result = run([], cwd, root, fs);
    assert.deepEqual(result, { stdout: `NEXT: write | path: ${want}/.temp/viber/intent/summary-${STAMP}.md\n`, stderr: "", exit: 0 });
    assert.equal(fs.kind(`${want}/.temp/viber/intent`), "dir");
  });
}

for (const [label, at, stamp] of [
  ["a single-digit month, day, hour, minute and second", new Date(2026, 0, 5, 3, 4, 9), "2026-01-05-03-04-09"],
  ["the last second of a year", new Date(2026, 11, 31, 23, 59, 59), "2026-12-31-23-59-59"],
  ["midnight", new Date(2027, 1, 1, 0, 0, 0), "2027-02-01-00-00-00"],
] as const) {
  test(`the stamp of ${label} is ${stamp}, every field zero-padded and the month counted from 1`, () => {
    assert.equal(run([], "/r", "/r", fakeFs({}), at).stdout, `NEXT: write | path: /r/.temp/viber/intent/summary-${stamp}.md\n`);
  });
}

for (const argv of [["extra"], [""], ["--help"], ["a", "b"]]) {
  test(`the arguments ${JSON.stringify(argv)} exit 2 with one error: line and an empty stdout, creating nothing`, () => {
    const fs = fakeFs({ "/r/README.md": "x\n" });
    assert.deepEqual(run(argv, "/r", "/r", fs), { stdout: "", stderr: "error: summary-path.sh takes no argument\n", exit: 2 });
    assert.equal(fs.exists("/r/.temp"), false);
  });
}

test("a file standing where the directory must go exits 2 with one error: line naming the directory and an empty stdout", () => {
  const fs = fakeFs({ "/r/.temp": "a file, not a directory\n" });
  assert.deepEqual(run([], "/r", "/r", fs), { stdout: "", stderr: "error: cannot create /r/.temp/viber/intent\n", exit: 2 });
  assert.equal(fs.readText("/r/.temp"), "a file, not a directory\n");
});
