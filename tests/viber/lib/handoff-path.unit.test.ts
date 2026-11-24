/*
 * handoff-path.unit.test.ts - the handoff-path core on fake ports: it answers
 * exactly four lines (FILE=, EXISTS=, BRANCH=, TARGET=) naming where the
 * handoff file goes, on which branch the conversation stands and whether the
 * first argument word was taken as the path or left to the prompt.
 *
 * Two properties carry the design. It answers a `!` preload, so every input
 * gets the four lines and nothing else. And the root is the repository's,
 * never the caller's cwd, so a session started in a subdirectory writes under
 * the same `.temp/`.
 *
 * The backslash and drive-letter spellings run here on every system: the fake
 * file system holds a `C:/...` path as the text it is. The fake clock is built
 * from local-time fields, so the stamp reads the same in any time zone.
 */

import assert from "node:assert/strict";
import { fakeClock, fakeFs, fakeGit, type FakeRepo } from "../../harness/fakes.ts";
import { test } from "../../harness/test.ts";
import type { Fs } from "../../../viber/lib/ports.ts";
import { runHandoffPath } from "../../../viber/lib/handoff-path.ts";

const ROOT = "/r";
const AT = new Date(2026, 10, 24, 17, 14, 16);
const STAMP = "2026-11-24-17-14-16";

interface Scene {
  cwd?: string;
  /** The repository; null for no repository. Left out: one at ROOT on `main`. */
  repo?: FakeRepo | null;
  fs?: Fs;
  at?: Date;
}

function run(argv: string[], scene: Scene = {}): string {
  const repo = scene.repo === undefined ? { root: ROOT, tracked: [] } : scene.repo;
  return runHandoffPath(argv, scene.cwd ?? repo?.root ?? ROOT, { fs: scene.fs ?? fakeFs({}), git: fakeGit(repo), clock: fakeClock(scene.at ?? AT) });
}

const lines = (file: string, exists: boolean, branch: string, target: "named" | "default"): string => `FILE=${file}\nEXISTS=${exists}\nBRANCH=${branch}\nTARGET=${target}\n`;
const DEFAULT = lines(`${ROOT}/.temp/viber/handoff/${STAMP}_{slug}.md`, false, "main", "default");

test("no argument inside a repository is a stamped placeholder under <root>/.temp/viber/handoff, not existing, on the current branch", () => {
  assert.equal(run([]), DEFAULT);
});

for (const arg of ["", "   ", " \t\r\n", "$0"]) {
  test(`an empty, blank or literal $0 argument is the default directory: ${JSON.stringify(arg)} (Claude Code leaves $0 unsubstituted when the user named nothing)`, () => {
    assert.equal(run([arg]), DEFAULT);
  });
}

for (const arg of ["notes", "focus", "C:", "x.MD", '"', '""', '"notes"']) {
  test(`a first word that is not path-like opens the prompt: ${JSON.stringify(arg)} gives the default directory, even where a directory of that name exists (a bare word is a prompt, not a path)`, () => {
    assert.equal(run([arg], { fs: fakeFs({}, { dirs: [`${ROOT}/notes`] }) }), DEFAULT);
  });
}

test("a subdirectory cwd resolves the same repository root (a session started below the root must not write a second .temp/)", () => {
  assert.equal(run([], { cwd: `${ROOT}/src/deep` }), DEFAULT);
});

test("a relative .md argument is that file under the root, also from a subdirectory", () => {
  const want = lines(`${ROOT}/docs/notes.md`, false, "main", "named");
  assert.deepEqual([run(["docs/notes.md"]), run(["docs/notes.md"], { cwd: `${ROOT}/src` })], [want, want]);
});

test("an absolute .md argument is kept as it is", () => {
  assert.equal(run(["/outside/handoff.md"]), lines("/outside/handoff.md", false, "main", "named"));
});

for (const arg of ["notes/", "./notes/", "notes\\", "./notes"]) {
  test(`a path-like argument not ending in .md is a directory: ${JSON.stringify(arg)} gives a stamped placeholder inside it, never EXISTS=true even when the directory exists`, () => {
    const out = run([arg], { fs: fakeFs({}, { dirs: [`${ROOT}/notes`] }) });
    assert.equal(out, lines(`${ROOT}/notes/${STAMP}_{slug}.md`, false, "main", "named"));
  });
}

test("an existing .md file is EXISTS=true, so the skill stops instead of overwriting it", () => {
  assert.equal(run(["old.md"], { fs: fakeFs({ [`${ROOT}/old.md`]: "kept\n" }) }), lines(`${ROOT}/old.md`, true, "main", "named"));
});

test("an existing .md path is EXISTS=true whatever it is: an unreadable file and a directory count (only its existence is asked)", () => {
  const fs = fakeFs({}, { unreadable: [`${ROOT}/locked.md`], dirs: [`${ROOT}/dir.md`] });
  assert.deepEqual([run(["locked.md"], { fs }), run(["dir.md"], { fs })], [lines(`${ROOT}/locked.md`, true, "main", "named"), lines(`${ROOT}/dir.md`, true, "main", "named")]);
});

test("an existing absolute .md file outside the repository is EXISTS=true", () => {
  assert.equal(run(["/outside/old.md"], { fs: fakeFs({ "/outside/old.md": "kept\n" }) }), lines("/outside/old.md", true, "main", "named"));
});

test("?, *, [ and spaces pass through unchanged", () => {
  assert.equal(run(["a?*[b] c/n x.md"]), lines(`${ROOT}/a?*[b] c/n x.md`, false, "main", "named"));
});

test("one pair of surrounding double quotes and surrounding whitespace are dropped (a user who quoted a path with a space)", () => {
  assert.equal(run([' "my notes.md" ']), lines(`${ROOT}/my notes.md`, false, "main", "named"));
});

test("only one pair of quotes is dropped, and whitespace inside the pair stays", () => {
  assert.deepEqual(
    [run(['""a/x.md""']), run(['" x.md"'])],
    [lines(`${ROOT}/"a/x.md"/${STAMP}_{slug}.md`, false, "main", "named"), lines(`${ROOT}/ x.md`, false, "main", "named")],
  );
});

test("a leading ./ is stripped exactly once (././x.md keeps its second ./)", () => {
  assert.deepEqual([run(["./x.md"]), run(["././x.md"])], [lines(`${ROOT}/x.md`, false, "main", "named"), lines(`${ROOT}/./x.md`, false, "main", "named")]);
});

test("`.` alone, and `./`, are the root directory itself", () => {
  const want = lines(`${ROOT}/${STAMP}_{slug}.md`, false, "main", "named");
  assert.deepEqual([run(["."]), run(["./"])], [want, want]);
});

test("the path is not normalized further: a .. segment and a doubled slash stay as written, one trailing slash of a directory is dropped", () => {
  assert.deepEqual(
    [run(["../x.md"]), run(["a/../b/"]), run(["a//"]), run(["/"])],
    [
      lines(`${ROOT}/../x.md`, false, "main", "named"),
      lines(`${ROOT}/a/../b/${STAMP}_{slug}.md`, false, "main", "named"),
      lines(`${ROOT}/a//${STAMP}_{slug}.md`, false, "main", "named"),
      lines(`/${STAMP}_{slug}.md`, false, "main", "named"),
    ],
  );
});

test("`..` alone holds no slash, so it opens the prompt like any other word", () => {
  assert.equal(run([".."]), DEFAULT);
});

test("backslashes become forward slashes", () => {
  assert.equal(run(["docs\\sub\\x.md"]), lines(`${ROOT}/docs/sub/x.md`, false, "main", "named"));
});

for (const [label, arg, file] of [
  ["a backslash drive-letter file", "C:\\Users\\me\\notes\\h.md", "C:/Users/me/notes/h.md"],
  ["a forward slash drive-letter file", "C:/Users/me/notes/h.md", "C:/Users/me/notes/h.md"],
  ["a drive-letter directory with a trailing backslash", "D:\\notes\\", `D:/notes/${STAMP}_{slug}.md`],
  ["a drive-relative file", "c:h.md", "c:h.md"],
] as const) {
  test(`on a Windows drive ${label} is kept as written with forward slashes, never joined to the root (${arg})`, () => {
    assert.equal(run([arg], { repo: { root: "C:/Users/me/repo", tracked: [] } }), lines(file, false, "main", "named"));
  });
}

test("on a Windows drive a backslash cwd below the root gives the root git reports, and a relative target lands under it", () => {
  const repo = { root: "C:/Users/me/repo", tracked: [] };
  const fs = fakeFs({ "C:/Users/me/repo/old.md": "kept\n" });
  assert.deepEqual(
    [run([], { repo, cwd: "C:\\Users\\me\\repo\\src", fs }), run(["old.md"], { repo, cwd: "C:\\Users\\me\\repo\\src", fs })],
    [lines(`C:/Users/me/repo/.temp/viber/handoff/${STAMP}_{slug}.md`, false, "main", "default"), lines("C:/Users/me/repo/old.md", true, "main", "named")],
  );
});

test("a repository at a drive root and one at the file system root put one slash before .temp", () => {
  assert.deepEqual(
    [run([], { repo: { root: "C:/", tracked: [] } }), run([], { repo: { root: "/", tracked: [] } })],
    [lines(`C:/.temp/viber/handoff/${STAMP}_{slug}.md`, false, "main", "default"), lines(`/.temp/viber/handoff/${STAMP}_{slug}.md`, false, "main", "default")],
  );
});

test("the branch HEAD stands on is printed whole, a slash in its name included", () => {
  assert.equal(run([], { repo: { root: ROOT, tracked: [], branch: "feature/x" } }), DEFAULT.replace("BRANCH=main", "BRANCH=feature/x"));
});

test("a detached HEAD prints BRANCH=none", () => {
  assert.equal(run([], { repo: { root: ROOT, tracked: [], branch: null } }), DEFAULT.replace("BRANCH=main", "BRANCH=none"));
});

test("outside a repository the cwd is the root and BRANCH=none", () => {
  assert.deepEqual(
    [run([], { repo: null, cwd: "/work/notes" }), run(["x.md"], { repo: null, cwd: "C:\\work\\notes" })],
    [lines(`/work/notes/.temp/viber/handoff/${STAMP}_{slug}.md`, false, "none", "default"), lines("C:/work/notes/x.md", false, "none", "named")],
  );
});

test("nothing is created: the directory is left to the writer", () => {
  const fs = fakeFs({ [`${ROOT}/README.md`]: "x\n" });
  run([], { fs });
  run(["notes/x.md"], { fs });
  run(["notes/"], { fs });
  assert.deepEqual([fs.exists(`${ROOT}/.temp`), fs.exists(`${ROOT}/notes`), fs.listDir(ROOT)], [false, false, ["README.md"]]);
});

test("a second argument is ignored: only the first word can name the target", () => {
  assert.deepEqual([run(["notes", "x/y.md"]), run(["old.md", "second word"])], [DEFAULT, lines(`${ROOT}/old.md`, false, "main", "named")]);
});

test("the stamp is zero-padded local time, and reads unknown when the clock gives no valid time", () => {
  assert.equal(run([], { at: new Date(2026, 0, 5, 3, 4, 9) }), DEFAULT.replace(STAMP, "2026-01-05-03-04-09"));
  assert.equal(run([], { at: new Date(Number.NaN) }), DEFAULT.replace(STAMP, "unknown"));
});
