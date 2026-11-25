/*
 * commit.unit.test.ts - the commit core on a fake file system and a fake
 * repository git can write: what each selector commits and leaves, the result
 * line, the exits, and the staged exec bits under both values of core.fileMode.
 * What git itself does on a write is held by the contract cases of the GitWrite
 * port, how a selector is read by commit-args.unit.test.ts; the wrapper is run as
 * a process by tests/viber/commit.critical.test.ts.
 */

import assert from "node:assert/strict";
import { fakeFs, fakeRepository, type FakeRepositoryOpts } from "../../harness/fakes.ts";
import { test } from "../../harness/test.ts";
import { runCommit } from "../../../viber/lib/commit.ts";
import type { GitWrite } from "../../../viber/lib/ports.ts";

const ROOT = "/r";

interface Scene {
  /** The files of HEAD; null: no commit yet. */
  head: Record<string, string> | null;
  /** What the work tree holds otherwise: a text, or null for a file gone. */
  tree?: Record<string, string | null>;
  /** The paths then staged. */
  staged?: string[];
  opts?: Omit<FakeRepositoryOpts, "head">;
  /** The files on disk carrying an exec bit. */
  exec?: string[];
  write?: Partial<GitWrite>;
}

function scene(given: Scene) {
  const files = Object.entries({ ...given.head, ...given.tree }).filter((entry): entry is [string, string] => entry[1] !== null);
  const fs = fakeFs(Object.fromEntries(files.map(([path, text]) => [`${ROOT}/${path}`, text])), { dirs: [ROOT], exec: (given.exec ?? []).map((path) => `${ROOT}/${path}`) });
  const repo = fakeRepository(ROOT, fs, { head: given.head, ...given.opts });
  for (const path of given.staged ?? []) repo.write.stageAll(ROOT, path);
  const write = { ...repo.write, ...given.write };
  return {
    ...repo,
    fs,
    commit: (...argv: string[]) => runCommit(argv, ROOT, { fs, git: repo.git, write }),
    /** The committed files that differ from HEAD's first commit, a text or null for a deletion. */
    took: () => {
      const last = repo.commits.at(-1)?.files ?? {};
      const before = given.head ?? {};
      return Object.fromEntries([...new Set([...Object.keys(before), ...Object.keys(last)])].filter((path) => before[path] !== last[path]?.text).map((path) => [path, last[path]?.text ?? null]));
    },
    staged: () => repo.git.stagedFiles(ROOT, null)?.map((file) => file.path),
  };
}

const said = (line: string) => ({ stdout: `${line}\n`, stderr: "", exit: 0 });

const TOOK: Array<{ name: string; given: Scene; argv: string[]; took: Record<string, string | null>; staged?: string[] }> = [
  { name: "no selector commits an edit, a new file and a deletion", given: { head: { "a.txt": "a", "gone.txt": "g" }, tree: { "a.txt": "a2", "gone.txt": null, "new.txt": "n" } }, argv: [], took: { "a.txt": "a2", "gone.txt": null, "new.txt": "n" } },
  { name: "a list commits an edit, a new file and a deletion and nothing else", given: { head: { "a.txt": "a", "gone.txt": "g", "c.txt": "c" }, tree: { "a.txt": "a2", "new.txt": "n", "gone.txt": null, "c.txt": "c2" } }, argv: ["a.txt new.txt gone.txt"], took: { "a.txt": "a2", "new.txt": "n", "gone.txt": null } },
  { name: "a list split across several arguments reads as one", given: { head: { "a.txt": "a", "b.txt": "b", "c.txt": "c" }, tree: { "a.txt": "a2", "b.txt": "b2", "c.txt": "c2" } }, argv: ["a.txt", "b.txt"], took: { "a.txt": "a2", "b.txt": "b2" } },
  { name: "a directory takes its tracked and its new files, an ignored one left out", given: { head: { "d/a.txt": "a" }, tree: { "d/a.txt": "a2", "d/new.txt": "n", "d/x.log": "l" }, opts: { ignored: ["d/x.log"] } }, argv: ["d"], took: { "d/a.txt": "a2", "d/new.txt": "n" } },
  { name: "an untracked file an ignore rule covers is not force-added", given: { head: {}, tree: { "a.txt": "a", "build/out.js": "g" }, opts: { ignored: ["build"] } }, argv: ["a.txt build/out.js"], took: { "a.txt": "a" } },
  { name: "a tracked file under an ignored directory is committed", given: { head: { "ign/t.txt": "t" }, tree: { "ign/t.txt": "t2" }, opts: { ignored: ["ign"] } }, argv: ["ign/t.txt"], took: { "ign/t.txt": "t2" } },
  { name: "a path already removed with git rm is committed, work staged elsewhere stays staged", given: { head: { "gone.txt": "g", "o.txt": "o" }, tree: { "gone.txt": null, "o.txt": "o2" }, staged: ["gone.txt", "o.txt"] }, argv: ["gone.txt"], took: { "gone.txt": null }, staged: ["o.txt"] },
  { name: "a file named bugs/#12.md is committed alone, its #12 no reference", given: { head: { "bugs/#12.md": "b", "bugs/o.md": "o" }, tree: { "bugs/#12.md": "b2", "bugs/o.md": "o2" } }, argv: ["bugs/#12.md"], took: { "bugs/#12.md": "b2" } },
];

for (const row of TOOK) {
  test(row.name, () => {
    const at = scene(row.given);
    const result = at.commit("m", ...row.argv);
    assert.equal(result.exit, 0);
    assert.match(result.stdout, /^[0-9]{7} \| m \(VERIFIED\)\n$/);
    assert.deepEqual(at.took(), row.took);
    assert.deepEqual(at.staged(), row.staged ?? []);
  });
}

test("the result names the subject alone, the first line of the message, which is committed verbatim", () => {
  const at = scene({ head: { "a.txt": "a" }, tree: { "a.txt": "a2" } });
  const result = at.commit("-feat: change a\n\nbody paragraph");
  assert.deepEqual(result, said("0000002 | -feat: change a (VERIFIED)"));
  assert.deepEqual(at.commits.map((commit) => commit.message), ["-feat: change a\n\nbody paragraph"]);
});

test("the first commit of a branch is verified too", () => {
  assert.deepEqual(scene({ head: null, tree: { "first.txt": "f" } }).commit("chore: root"), said("0000001 | chore: root (VERIFIED)"));
});

for (const row of [
  { name: "a clean tree", given: { head: { "a.txt": "a" } }, argv: [] },
  { name: "a clean path beside a changed one", given: { head: { "a.txt": "a", "b.txt": "b" }, tree: { "b.txt": "b2" } }, argv: ["a.txt"] },
  { name: "an ignored new file alone", given: { head: { "a.txt": "a" }, tree: { "x.log": "l" }, opts: { ignored: ["x.log"] } }, argv: ["x.log"] },
] as Array<{ name: string; given: Scene; argv: string[] }>) {
  test(`${row.name} is nothing to commit, exit 0`, () => {
    const at = scene(row.given);
    assert.deepEqual(at.commit("no-op", ...row.argv), said("Nothing to commit"));
    assert.deepEqual(at.commits, []);
  });
}

test("git exiting 0 with HEAD unmoved is FAILED, never VERIFIED", () => {
  const at = scene({ head: { "a.txt": "a" }, tree: { "a.txt": "a2" }, write: { commit: () => 0 } });
  assert.deepEqual(at.commit("m"), said("0000001 | m (FAILED)"));
});

const STOPS: Array<{ name: string; argv: string[]; fails: FakeRepositoryOpts["fails"]; exit: number }> = [
  { name: "a commit git refuses (a hook, no identity, a signing failure)", argv: [], fails: { commit: 128 }, exit: 128 },
  { name: "staging everything failing", argv: [], fails: { stageAll: 128 }, exit: 128 },
  { name: "staging a tracked path failing", argv: ["a.txt new.txt"], fails: { stageTracked: 9 }, exit: 9 },
  { name: "adding a new path failing", argv: ["a.txt new.txt"], fails: { stage: 7 }, exit: 7 },
];

for (const row of STOPS) {
  test(`${row.name} ends the call on git's exit, nothing on stdout and nothing committed`, () => {
    const at = scene({ head: { "a.txt": "a" }, tree: { "a.txt": "a2", "new.txt": "n" }, opts: { fails: row.fails } });
    assert.deepEqual(at.commit("m", ...row.argv), { stdout: "", stderr: "", exit: row.exit });
    assert.deepEqual(at.commits, []);
  });
}

test("no message is refused with the usage and commits nothing", () => {
  const at = scene({ head: {}, tree: { "a.txt": "a" } });
  assert.deepEqual(at.commit(), { stdout: "", stderr: "error: missing required parameter 'message'\nusage: commit.sh <message> [selector...]\n", exit: 1 });
  assert.deepEqual(at.commits, []);
});

test("named paths none of which exists exit 3, a glob-shaped one included, and nothing is staged or committed", () => {
  const at = scene({ head: { "src/a.ts": "a" }, tree: { "src/a.ts": "a2" } });
  assert.deepEqual(at.commit("x", "src/*.ts lib/gone"), { stdout: "", stderr: "error: none of the named paths exists: src/*.ts lib/gone - nothing committed\n", exit: 3 });
  assert.deepEqual(at.commits, []);
  assert.deepEqual(at.staged(), []);
});

const MODES: Array<{ name: string; fileMode: boolean; staged: string; exec?: string[]; headExec?: string[]; argv: string[]; want: string }> = [
  { name: "an exec bit staged over a plain file", fileMode: true, staged: "100755", argv: ["run.sh"], want: "100755" },
  { name: "an exec bit staged over a plain file", fileMode: true, staged: "100755", argv: [], want: "100755" },
  { name: "an exec bit staged over a plain file", fileMode: false, staged: "100755", argv: ["run.sh"], want: "100755" },
  { name: "an exec bit staged over a plain file beside an edit", fileMode: false, staged: "100755", argv: ["run.sh a.txt"], want: "100755" },
  { name: "a staged removal of the bit the file on disk carries", fileMode: true, staged: "100644", exec: ["run.sh"], headExec: ["run.sh"], argv: ["run.sh"], want: "100644" },
];

for (const row of MODES) {
  test(`${row.name} is committed under core.fileMode=${row.fileMode} with the selector '${row.argv.join("")}' (git took the mode back from the tree)`, () => {
    const at = scene({ head: { "run.sh": "r", "a.txt": "a" }, tree: { "a.txt": "a2" }, exec: row.exec, opts: { fileMode: row.fileMode, exec: row.headExec } });
    at.stageMode("run.sh", row.staged);
    assert.equal(at.commit("m", ...row.argv).exit, 0);
    assert.equal(at.commits.at(-1)?.files["run.sh"].mode, row.want);
  });
}

test("a mode only the tree changed is left on disk as the caller set it", () => {
  const at = scene({ head: { "run.sh": "r", "a.txt": "a" }, tree: { "a.txt": "a2" }, exec: ["run.sh"], opts: { fileMode: false } });
  assert.equal(at.commit("m").exit, 0);
  assert.equal(at.fs.executable(`${ROOT}/run.sh`), true);
});
