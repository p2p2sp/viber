/*
 * run-changes.unit.test.ts - the run-changes core on a fake git: it prints the
 * base commit of a run and one `changed:` line per path that differs from it,
 * with no model involved.
 *
 * Properties that carry the design. The base of a run directory is the oldest
 * commit that added its `plan.md`, so a plan deleted and added again still
 * starts the run at its first commit; with no argument the base is HEAD; a run
 * no commit added prints `base: none` and nothing else. The changed paths are
 * the tracked paths that differ from the base (committed since or not, a
 * deleted one included) and then the untracked ones, a path both lists hold
 * printed once. The repository root is where the work happens, so a call from
 * a subdirectory prints what a call from the root prints. Exit 2 is the only
 * refusal: outside a repository, or with more than one argument.
 *
 * What git itself answers (the oldest of several adding commits, a literal
 * path, a rename as its new path, a path with a blank as it is) is held by the
 * contract cases of the Git port; the wrapper is run as a process by
 * tests/viber/run-changes.critical.test.ts. The backslash and drive-letter
 * spellings run here on every system: the fake holds a path as text.
 */

import assert from "node:assert/strict";
import { fakeGit, type FakeRepo } from "../../harness/fakes.ts";
import { test } from "../../harness/test.ts";
import type { ChangedFile } from "../../../viber/lib/ports.ts";
import { runRunChanges } from "../../../viber/lib/run-changes.ts";

const ROOT = "/r";
const RUN = "docs/_specs/2026-01-01-00-00-00_demo";
const PLAN = `${RUN}/plan.md`;
const FIRST = "1".repeat(40);
const AGAIN = "2".repeat(40);

const files = (...rows: string[]): ChangedFile[] => rows.map((row) => ({ status: row.slice(0, 1), path: row.slice(2) }));

function run(argv: string[], repo: Partial<FakeRepo> | null = {}, cwd?: string) {
  const whole = repo === null ? null : { root: ROOT, tracked: [], ...repo };
  return runRunChanges(argv, cwd ?? whole?.root ?? ROOT, { git: fakeGit(whole) });
}

const ok = (stdout: string) => ({ stdout, stderr: "", exit: 0 });

test("a run directory prints the commit that added its plan, then the tracked paths that differ from it and the untracked ones", () => {
  const result = run([RUN], { added: { [PLAN]: [FIRST] }, changed: { [FIRST]: files("M other.txt", "M tracked.txt") }, untracked: ["new.txt"] });
  assert.deepEqual(result, ok(`base: ${FIRST}\nchanged: other.txt\nchanged: tracked.txt\nchanged: new.txt\n`));
});

test("a plan added, deleted and added again starts the run at its first commit (the oldest of the commits adding it)", () => {
  const result = run([RUN], { added: { [PLAN]: [FIRST, AGAIN] }, changed: { [FIRST]: files(`M ${PLAN}`), [AGAIN]: [] } });
  assert.deepEqual(result, ok(`base: ${FIRST}\nchanged: ${PLAN}\n`));
});

test("a path deleted since the base and written again untracked is printed once (the diff and the untracked list both hold it)", () => {
  const result = run([RUN], { added: { [PLAN]: [FIRST] }, changed: { [FIRST]: files("D tracked.txt") }, untracked: ["tracked.txt"] });
  assert.deepEqual(result, ok(`base: ${FIRST}\nchanged: tracked.txt\n`));
});

test("a path both lists hold keeps its first place, the paths around it in the order git gave them", () => {
  const result = run([], { changed: { HEAD: files("M b.txt", "M a.txt") }, untracked: ["z.txt", "a.txt", "c.txt"] });
  assert.deepEqual(result, ok("base: HEAD\nchanged: b.txt\nchanged: a.txt\nchanged: z.txt\nchanged: c.txt\n"));
});

for (const argv of [[], [""]]) {
  test(`no argument or an empty one makes the base HEAD, so only the uncommitted and untracked paths are changes: ${JSON.stringify(argv)}`, () => {
    const result = run(argv, { added: { [PLAN]: [FIRST] }, changed: { HEAD: files("M other.txt"), [FIRST]: files("M other.txt", "M tracked.txt") }, untracked: ["new.txt"] });
    assert.deepEqual(result, ok("base: HEAD\nchanged: other.txt\nchanged: new.txt\n"));
  });
}

test("a run directory whose plan.md no commit added prints base: none alone, whatever else changed", () => {
  const result = run(["docs/_specs/no-such-run"], { added: { [PLAN]: [FIRST] }, changed: { HEAD: files("M other.txt") }, untracked: ["new.txt"] });
  assert.deepEqual(result, ok("base: none\n"));
});

test("a call from a subdirectory prints the same lines as a call from the repository root (the argument and the paths stay relative to the root)", () => {
  const repo = { added: { [PLAN]: [FIRST] }, changed: { [FIRST]: files("M other.txt") }, untracked: ["sub/new.txt"] };
  const want = ok(`base: ${FIRST}\nchanged: other.txt\nchanged: sub/new.txt\n`);
  assert.deepEqual([run([RUN], repo, `${ROOT}/sub`), run([RUN], repo)], [want, want]);
});

test("nothing changed prints the base line alone", () => {
  assert.deepEqual([run([]), run([RUN], { added: { [PLAN]: [FIRST] } })], [ok("base: HEAD\n"), ok(`base: ${FIRST}\n`)]);
});

test("a deleted path is a change and a renamed one is its new path, each printed as it is: a blank, a quote, a backslash and a non-ASCII character stay themselves", () => {
  const result = run([], { changed: { HEAD: files("D gone.txt", "R new name.txt", 'M say "hi".txt', "M back\\slash.txt") }, untracked: ["za\u017c\u00f3\u0142\u0107.txt"] });
  assert.deepEqual(result, ok('base: HEAD\nchanged: gone.txt\nchanged: new name.txt\nchanged: say "hi".txt\nchanged: back\\slash.txt\nchanged: za\u017c\u00f3\u0142\u0107.txt\n'));
});

for (const [label, arg] of [
  ["a trailing slash", `${RUN}/`],
  ["several trailing slashes", `${RUN}///`],
  ["backslashes", RUN.replaceAll("/", "\\")],
  ["a backslash at the end", `${RUN}\\`],
  ["a leading ./", `./${RUN}`],
  ["a doubled slash", RUN.replace("/", "//")],
  ["a .. segment", `docs/x/../${RUN.slice(5)}`],
  ["the absolute path below the root", `${ROOT}/${RUN}`],
  ["the absolute path with a trailing slash", `${ROOT}/${RUN}/`],
] as const) {
  test(`the run directory spelled with ${label} names the same plan: ${arg}`, () => {
    assert.deepEqual(run([arg], { added: { [PLAN]: [FIRST] } }), ok(`base: ${FIRST}\n`));
  });
}

for (const [label, arg] of [
  ["the C:/ form", `C:/r/${RUN}`],
  ["the C:\\ form", `C:\\r\\${RUN.replaceAll("/", "\\")}`],
] as const) {
  test(`under a drive root the run directory given absolute in ${label} names the same plan`, () => {
    assert.deepEqual(run([arg], { root: "C:/r", added: { [PLAN]: [FIRST] } }), ok(`base: ${FIRST}\n`));
  });
}

test("a run directory name holding a bracket or a star is asked for as it is (a literal path, never a glob)", () => {
  const added = { "docs/_specs/app[id]*/plan.md": [FIRST] };
  assert.deepEqual([run(["docs/_specs/app[id]*"], { added }), run(["docs/_specs/appi"], { added })], [ok(`base: ${FIRST}\n`), ok("base: none\n")]);
});

test("an absolute run directory that does not read as below the root goes to git as written, and a path git holds no commit for prints base: none", () => {
  const asked: string[] = [];
  const git = { ...fakeGit({ root: ROOT, tracked: [] }), firstAdded: (_root: string, path: string) => (asked.push(path), null) };
  const results = ["/elsewhere/link/../run", "../outside"].map((arg) => runRunChanges([arg], ROOT, { git }));
  assert.deepEqual(results, [ok("base: none\n"), ok("base: none\n")]);
  assert.deepEqual(asked, ["/elsewhere/link/../run/plan.md", "../outside/plan.md"]);
});

test("outside a repository it exits 2 with one error: line and prints nothing on stdout", () => {
  assert.deepEqual(run([RUN], null), { stdout: "", stderr: "error: not inside a git repository\n", exit: 2 });
});

test("more than one argument exits 2 with the usage on stderr and prints nothing on stdout, also outside a repository", () => {
  const want = { stdout: "", stderr: "error: usage: run-changes.sh [<run-dir>]\n", exit: 2 };
  assert.deepEqual([run([RUN, "second"], { added: { [PLAN]: [FIRST] } }), run([RUN, "second"], null)], [want, want]);
});
