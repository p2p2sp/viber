/*
 * diff-files.unit.test.ts - the diff-files core on fake ports: the
 * `BASE <merge-base sha> | BASE HEAD | BASE none` line, then the changed files
 * of the diff scope - sorted by their bytes, unique, as they are, deleted ones
 * excluded, nothing under `.temp/viber/code-auditor/` - plus the
 * `BAD_BASE <value>` and `NOT_A_REPO <root>` refusals (exit 1) and the usage
 * (exit 2).
 *
 * The base rules are the design: an explicit base wins, no commit reads none,
 * and the merge base with the default branch (origin/HEAD, else main, else
 * master) is taken only from a branch that is not the default one. Each case
 * states what git holds as the tables of a fake repository; HEAD is asked for
 * by its sha, so `changed` is keyed by the sha the base resolves to.
 *
 * What git itself answers (a deleted file as `D`, a type change as `T`, a
 * tracked file deleted from disk missing from a repository with no commit, a
 * path with a blank or a non-ASCII character as it is) is held by the contract
 * cases of the Git port; the wrapper is run as a process by
 * tests/viber/diff-files.critical.test.ts. The backslash and drive-letter
 * spellings run here on every system: the fakes hold a path as text.
 */

import assert from "node:assert/strict";
import { fakeFs, fakeGit, type FakeRepo } from "../../harness/fakes.ts";
import { test } from "../../harness/test.ts";
import type { ChangedFile, Fs } from "../../../viber/lib/ports.ts";
import { runDiffFiles } from "../../../viber/lib/diff-files.ts";

const ROOT = "/r";
const HEAD = "a".repeat(40);
const MAIN = "b".repeat(40);
const FORK = "c".repeat(40);
const OLD = "d".repeat(40);

const files = (...rows: string[]): ChangedFile[] => rows.map((row) => ({ status: row.slice(0, 1), path: row.slice(2) }));
const lines = (...rows: string[]): string => rows.map((row) => `${row}\n`).join("");
const ok = (...rows: string[]) => ({ stdout: lines(...rows), stderr: "", exit: 0 });
const refused = (row: string) => ({ stdout: lines(row), stderr: "", exit: 1 });

interface Scene {
  cwd?: string;
  fs?: Fs;
}

function run(argv: string[], repo: Partial<FakeRepo> | null = {}, scene: Scene = {}) {
  const whole = repo === null ? null : { root: ROOT, tracked: [], ...repo };
  return runDiffFiles(argv, scene.cwd ?? "/elsewhere", { fs: scene.fs ?? fakeFs({}), git: fakeGit(whole) });
}

/** A feature branch forked from main at FORK. */
const FEATURE: Partial<FakeRepo> = { branch: "feature", commits: { HEAD, "refs/heads/main": MAIN }, mergeBases: { "HEAD refs/heads/main": FORK } };
/** The branch main with one commit, HEAD on it. */
const ON_MAIN: Partial<FakeRepo> = { branch: "main", commits: { HEAD, "refs/heads/main": HEAD } };

test("a feature branch prints its merge base with main, then a committed, a staged, an unstaged and an untracked path once each", () => {
  const result = run([ROOT], { ...FEATURE, changed: { [FORK]: files("A committed.txt", "M edited.txt", "M staged.txt") }, untracked: ["untracked.txt"] });
  assert.deepEqual(result, ok(`BASE ${FORK}`, "committed.txt", "edited.txt", "staged.txt", "untracked.txt"));
});

test("a file deleted since the base is not printed, and neither is an unmerged one", () => {
  const result = run([ROOT], { ...FEATURE, changed: { [FORK]: files("D gone.txt", "D gone-too.txt", "A added.txt", "U clash.txt") } });
  assert.deepEqual(result, ok(`BASE ${FORK}`, "added.txt"));
});

test("an added, a copied, a modified, a renamed and a type-changed file are each printed (a symlink turned into a regular file is a change of the scope)", () => {
  const result = run([ROOT], { ...FEATURE, changed: { [FORK]: files("T link.txt", "R moved.txt", "C copy.txt", "M mod.txt", "A add.txt") } });
  assert.deepEqual(result, ok(`BASE ${FORK}`, "add.txt", "copy.txt", "link.txt", "mod.txt", "moved.txt"));
});

test("on main only the uncommitted paths are printed and the base reads HEAD", () => {
  const result = run([ROOT], { ...ON_MAIN, changed: { [HEAD]: files("M tracked.txt") }, untracked: ["untracked.txt"] });
  assert.deepEqual(result, ok("BASE HEAD", "tracked.txt", "untracked.txt"));
});

test("on main with origin/HEAD at main an unpushed commit is not printed and the base reads HEAD (the merge base with origin would list it)", () => {
  const result = run([ROOT], {
    branch: "main",
    commits: { HEAD, "refs/heads/main": HEAD, "refs/remotes/origin/main": MAIN },
    symbolic: { "refs/remotes/origin/HEAD": "refs/remotes/origin/main" },
    mergeBases: { "HEAD refs/remotes/origin/main": MAIN },
    changed: { [MAIN]: files("A unpushed.txt") },
  });
  assert.deepEqual(result, ok("BASE HEAD"));
});

test("origin/HEAD names the default branch before a local main does: on main, with origin/HEAD at trunk, the base is the merge base with origin/trunk", () => {
  const result = run([ROOT], {
    branch: "main",
    commits: { HEAD, "refs/heads/main": HEAD, "refs/remotes/origin/trunk": MAIN },
    symbolic: { "refs/remotes/origin/HEAD": "refs/remotes/origin/trunk" },
    mergeBases: { "HEAD refs/remotes/origin/trunk": FORK, "HEAD refs/heads/main": HEAD },
    changed: { [FORK]: files("A since-trunk.txt") },
  });
  assert.deepEqual(result, ok(`BASE ${FORK}`, "since-trunk.txt"));
});

test("a branch named as origin/HEAD's target is the default branch, whatever a local main holds: the base reads HEAD", () => {
  const result = run([ROOT], {
    branch: "trunk",
    commits: { HEAD, "refs/heads/main": MAIN, "refs/remotes/origin/trunk": OLD },
    symbolic: { "refs/remotes/origin/HEAD": "refs/remotes/origin/trunk" },
    mergeBases: { "HEAD refs/remotes/origin/trunk": OLD, "HEAD refs/heads/main": FORK },
    changed: { [HEAD]: files("M edited.txt") },
  });
  assert.deepEqual(result, ok("BASE HEAD", "edited.txt"));
});

test("an origin/HEAD whose target holds no commit is passed over for the local main", () => {
  const result = run([ROOT], { ...FEATURE, symbolic: { "refs/remotes/origin/HEAD": "refs/remotes/origin/gone" }, changed: { [FORK]: files("A committed.txt") } });
  assert.deepEqual(result, ok(`BASE ${FORK}`, "committed.txt"));
});

test("with no main the local master is the default branch", () => {
  const result = run([ROOT], { branch: "feature", commits: { HEAD, "refs/heads/master": MAIN }, mergeBases: { "HEAD refs/heads/master": FORK }, changed: { [FORK]: files("A committed.txt") } });
  assert.deepEqual(result, ok(`BASE ${FORK}`, "committed.txt"));
});

test("on master with no main the base reads HEAD", () => {
  const result = run([ROOT], { branch: "master", commits: { HEAD, "refs/heads/master": HEAD }, mergeBases: { "HEAD refs/heads/master": HEAD }, changed: { [HEAD]: files("M edited.txt") } });
  assert.deepEqual(result, ok("BASE HEAD", "edited.txt"));
});

test("with no origin/HEAD, main or master the base reads HEAD and a commit of the branch is not printed", () => {
  const result = run([ROOT], { branch: "dev", commits: { HEAD }, changed: { [OLD]: files("A two.txt") } });
  assert.deepEqual(result, ok("BASE HEAD"));
});

test("on a detached HEAD the base reads HEAD and a commit of the branch left behind is not printed", () => {
  const result = run([ROOT], { ...FEATURE, branch: null, changed: { [FORK]: files("A feature.txt") } });
  assert.deepEqual(result, ok("BASE HEAD"));
});

test("on an orphan branch sharing no history with main the base reads HEAD", () => {
  const result = run([ROOT], { branch: "island", commits: { HEAD, "refs/heads/main": MAIN }, changed: { [MAIN]: files("A island.txt") } });
  assert.deepEqual(result, ok("BASE HEAD"));
});

test("files under .temp/viber/code-auditor/ are never printed, tracked or not, and a sibling directory of that name start is", () => {
  const result = run([ROOT], {
    ...ON_MAIN,
    changed: { [HEAD]: files("M .temp/viber/code-auditor/run-0/run.md") },
    untracked: [".temp/viber/code-auditor/run-1/findings.md", ".temp/viber/code-auditor-notes.md", "after.txt"],
  });
  assert.deepEqual(result, ok("BASE HEAD", ".temp/viber/code-auditor-notes.md", "after.txt"));
});

test("an explicit base two commits back on main prints that sha and the files of the two later commits plus the uncommitted ones (an explicit base wins on the default branch)", () => {
  const result = run([ROOT, OLD], { ...ON_MAIN, commits: { HEAD, "refs/heads/main": HEAD, [OLD]: OLD }, changed: { [OLD]: files("A b.txt", "A c.txt"), [HEAD]: [] }, untracked: ["u.txt"] });
  assert.deepEqual(result, ok(`BASE ${OLD}`, "b.txt", "c.txt", "u.txt"));
});

test("an explicit base given as a ref name prints its full sha", () => {
  const result = run([ROOT, "start"], { ...ON_MAIN, commits: { HEAD, "refs/heads/main": HEAD, start: OLD }, changed: { [OLD]: files("A b.txt") } });
  assert.deepEqual(result, ok(`BASE ${OLD}`, "b.txt"));
});

test("an explicit base wins over the merge base of a feature branch", () => {
  const onFeature = run([ROOT, "start"], { ...FEATURE, commits: { HEAD, "refs/heads/main": MAIN, start: OLD }, changed: { [OLD]: files("A old.txt"), [FORK]: files("A fork.txt") } });
  assert.deepEqual(onFeature, ok(`BASE ${OLD}`, "old.txt"));
});

test("an empty explicit base means none was given", () => {
  const result = run([ROOT, ""], { ...FEATURE, changed: { [FORK]: files("A committed.txt") } });
  assert.deepEqual(result, ok(`BASE ${FORK}`, "committed.txt"));
});

for (const base of ["no-such-commit", "-n", "--all"]) {
  test(`an explicit base naming no commit prints BAD_BASE and exits 1: ${base} (one starting with a hyphen is never handed to git)`, () => {
    const asked: string[] = [];
    const real = fakeGit({ root: ROOT, tracked: [], commits: { HEAD, "-n": OLD, "--all": OLD } });
    const git = { ...real, commit: (root: string, ref: string) => (asked.push(ref), real.commit(root, ref)) };
    assert.deepEqual(runDiffFiles([ROOT, base], ROOT, { fs: fakeFs({}), git }), refused(`BAD_BASE ${base}`));
    assert.equal(asked.includes(base), !base.startsWith("-"));
  });
}

test("a path the diff and the untracked list both hold is printed once, and the paths come sorted whatever order git gave", () => {
  const result = run([ROOT], { ...FEATURE, changed: { [FORK]: files("A b.txt", "M a.txt") }, untracked: ["c.txt", "a.txt"] });
  assert.deepEqual(result, ok(`BASE ${FORK}`, "a.txt", "b.txt", "c.txt"));
});

test("the paths are sorted by their bytes: an upper-case letter before a lower-case one, a non-ASCII character after ASCII, a character past U+FFFF last", () => {
  const past = `${String.fromCodePoint(0x1f600)}.txt`;
  const wide = `${String.fromCodePoint(0xff21)}.txt`;
  const accented = "za\u017c\u00f3\u0142\u0107.txt";
  const result = run([ROOT], { ...ON_MAIN, untracked: [past, "b.txt", wide, "a b.txt", accented, "B.txt"] });
  assert.deepEqual(result, ok("BASE HEAD", "B.txt", "a b.txt", "b.txt", accented, wide, past));
});

test("a path with a blank, a quote or a backslash is printed as it is", () => {
  const result = run([ROOT], { ...ON_MAIN, untracked: ['say "hi".txt', "a b.txt", "back\\slash.txt"] });
  assert.deepEqual(result, ok("BASE HEAD", "a b.txt", "back\\slash.txt", 'say "hi".txt'));
});

test("in a repository with no commit the base reads none and the tracked files of the work tree and the untracked ones follow", () => {
  const result = run([ROOT], { changed: { "": files("A staged.txt") }, untracked: ["untracked.txt"] });
  assert.deepEqual(result, ok("BASE none", "staged.txt", "untracked.txt"));
});

test("with nothing changed only the base line is printed", () => {
  assert.deepEqual([run([ROOT], ON_MAIN), run([ROOT], FEATURE), run([ROOT], {})], [ok("BASE HEAD"), ok(`BASE ${FORK}`), ok("BASE none")]);
});

test("outside a repository it prints NOT_A_REPO with the root as given and exits 1", () => {
  assert.deepEqual([run(["/tmp/plain"], null), run(["plain\\dir"], null)], [refused("NOT_A_REPO /tmp/plain"), refused("NOT_A_REPO plain\\dir")]);
});

for (const argv of [[], [""], ["", "main"]]) {
  test(`a missing or empty root prints the usage on stderr, nothing on stdout and exits 2: ${JSON.stringify(argv)}`, () => {
    assert.deepEqual(run(argv, ON_MAIN), { stdout: "", stderr: "usage: diff-files.sh <repo-root> [<base>]\n", exit: 2 });
  });
}

test("a relative root resolves against the cwd, and the cwd matters for nothing else", () => {
  const repo = { ...ON_MAIN, untracked: ["new.txt"] };
  assert.deepEqual([run(["."], repo, { cwd: ROOT }), run(["r"], repo, { cwd: "/" }), run(["../r/./"], repo, { cwd: "/elsewhere" })], [ok("BASE HEAD", "new.txt"), ok("BASE HEAD", "new.txt"), ok("BASE HEAD", "new.txt")]);
});

test("a root below the top level prints only the paths below it, relative to it", () => {
  const repo = { ...FEATURE, changed: { [FORK]: files("M src/b.txt", "M top.txt", "M srcs/other.txt") }, untracked: ["src/deep/a.txt", "new.txt", "src/.temp/viber/code-auditor/x.md"] };
  assert.deepEqual(run([`${ROOT}/src`], repo, { fs: fakeFs({ [`${ROOT}/src/b.txt`]: "" }) }), ok(`BASE ${FORK}`, "b.txt", "deep/a.txt"));
});

test("a root reached through a link is read as the directory it names", () => {
  const fs = fakeFs({ [`${ROOT}/src/b.txt`]: "" }, { links: { "/alias": `${ROOT}/src` } });
  const git = { ...fakeGit({ root: ROOT, tracked: [], ...ON_MAIN, untracked: ["src/b.txt", "top.txt"] }), repoRoot: () => ROOT };
  assert.deepEqual(runDiffFiles(["/alias"], "/elsewhere", { fs, git }), ok("BASE HEAD", "b.txt"));
});

for (const [label, arg] of [
  ["the C:/ form", "C:/r"],
  ["the C:\\ form", "C:\\r"],
  ["a trailing separator", "C:\\r\\"],
] as const) {
  test(`a drive root given in ${label} is the same repository`, () => {
    assert.deepEqual(run([arg], { root: "C:/r", ...ON_MAIN, untracked: ["new.txt"] }), ok("BASE HEAD", "new.txt"));
  });
}
