/*
 * archive-run.unit.test.ts - the archive-run core on a fake file system and a
 * fake repository: the gates that refuse a path or an unfinished run before
 * anything moves, what reaches the archive and its one commit, the failing step
 * that ends the call, the two directory keys and the scratch of the build. What
 * git itself does is held by the contract cases of the GitWrite port, the key
 * grammar by tests/viber/config/; the wrapper, the rename of an edited spec.md in
 * the history included, is run as a process by
 * tests/viber/archive-run.critical.test.ts.
 */

import assert from "node:assert/strict";
import { fakeFs, fakeGit, fakeRepository, type FakeRepositoryOpts } from "../../harness/fakes.ts";
import { test } from "../../harness/test.ts";
import { runArchiveRun } from "../../../viber/lib/archive-run.ts";
import type { Fs } from "../../../viber/lib/ports.ts";

const KEY = "2026-09-19-17-30-00_add-login";
const RUN = `docs/_specs/${KEY}`;
const DEST = `docs/specs/${KEY}`;

const plan = (...ids: string[]): string => ids.map((id) => `<!-- TASK -->\n### ${id} - do ${id}\n<!-- /TASK -->\n`).join("\n");

/** A finished run directory as a build leaves one. */
const runFiles = (dir = RUN): Record<string, string> => ({
  [`${dir}/plan.md`]: plan("T1", "T2"),
  [`${dir}/status.md`]: "# status\n\ndone: T1 T2\nskipped: none\n",
  [`${dir}/spec.md`]: "spec\n",
  [`${dir}/qa.md`]: "qa\n",
  [`${dir}/tasks/T1.md`]: "task\n",
  [`${dir}/work/T1-coder.md`]: "trail\n",
});

interface Scene {
  /** The files of HEAD and of the work tree, over those of the run: null takes one away. */
  head?: Record<string, string | null>;
  /** What the work tree holds besides. */
  tree?: Record<string, string>;
  opts?: Partial<FakeRepositoryOpts>;
  links?: Record<string, string>;
  fs?: Partial<Fs>;
  cwd?: string;
  /** No repository. */
  bare?: boolean;
}

function scene(given: Scene = {}) {
  const head = Object.fromEntries(Object.entries({ ...runFiles(), ...given.head }).filter((entry): entry is [string, string] => entry[1] !== null));
  const files = Object.entries({ ...head, ...given.tree }).map(([path, text]) => [`/r/${path}`, text]);
  const fs = { ...fakeFs(Object.fromEntries(files), { dirs: ["/r"], links: given.links }), ...given.fs };
  const repo = fakeRepository("/r", fs, { head, ...given.opts });
  const git = given.bare ? fakeGit(null) : repo.git;
  const under = (dir: string): string[] => fs.listDir(`/r/${dir}`).flatMap((name) => (fs.kind(`/r/${dir}/${name}`) === "dir" ? under(`${dir}/${name}`) : [`${dir}/${name}`]));
  return {
    ...repo,
    fs,
    under,
    archive: (...argv: string[]) => runArchiveRun(argv, given.cwd ?? "/r", { fs, git, write: repo.write }),
    staged: () => repo.git.stagedFiles("/r", null)?.map((file) => file.path),
  };
}

const archived = (n: number, dest = DEST) => ({ stdout: `ARCHIVED: ${dest} (${n} files)\n`, stderr: "", exit: 0 });
const stopped = (exit: number, reason: string) => ({ stdout: "", stderr: reason === "" ? "" : `error: ${reason}\n`, exit });

test("a finished run moves to the archive in one commit: its documents in, its scaffolding out, its edit and a file not yet committed with it, a path staged elsewhere left staged", () => {
  const at = scene({ tree: { [`${RUN}/spec.md`]: "spec [D1]\n", [`${RUN}/attachments/mockup.html`]: "<h1>\n", "other.ts": "o\n" } });
  at.write.stage("/r", ["other.ts"]);
  assert.deepEqual(at.archive(RUN), archived(3));
  assert.deepEqual(at.commits, [
    {
      message: `docs(viber): archive run ${KEY}`,
      files: {
        [`${DEST}/attachments/mockup.html`]: { mode: "100644", text: "<h1>\n" },
        [`${DEST}/qa.md`]: { mode: "100644", text: "qa\n" },
        [`${DEST}/spec.md`]: { mode: "100644", text: "spec [D1]\n" },
      },
    },
  ]);
  assert.deepEqual(at.staged(), ["other.ts"]);
  assert.deepEqual(at.under("docs"), [`${DEST}/attachments/mockup.html`, `${DEST}/qa.md`, `${DEST}/spec.md`]);
  assert.equal(at.fs.exists("/r/docs/_specs"), false);
});

test("outside a repository the same move happens with no commit, and the line says so", () => {
  const at = scene({ bare: true });
  assert.deepEqual(at.archive(RUN), { stdout: `ARCHIVED: ${DEST} (2 files - no git repository)\n`, stderr: "", exit: 0 });
  assert.deepEqual(at.under("docs"), [`${DEST}/qa.md`, `${DEST}/spec.md`]);
  assert.equal(at.fs.exists("/r/docs/_specs"), false);
  assert.deepEqual(at.commits, []);
});

const KEPT: Array<{ file: string; state: string; given: Scene }> = ["notes/handover.md", "roadmap.md", "rulings.md", "outcome.md", "attachments/findings.md"].flatMap((file) => [
  { file, state: "committed", given: { head: { [`${RUN}/${file}`]: "kept\n" } } },
  { file, state: "still uncommitted", given: { tree: { [`${RUN}/${file}`]: "kept\n" } } },
]);
for (const row of KEPT) {
  test(`${row.file}, ${row.state}, reaches the archive commit (the removal list is enumerated)`, () => {
    const at = scene(row.given);
    assert.deepEqual(at.archive(RUN), archived(3));
    assert.equal(at.commits[0].files[`${DEST}/${row.file}`].text, "kept\n");
    assert.deepEqual(at.staged(), []);
  });
}

test("a link in the run is moved but not counted", () => {
  const at = scene({ links: { [`/r/${RUN}/l`]: "/r/elsewhere" }, bare: true });
  assert.equal(at.archive(RUN).stdout, `ARCHIVED: ${DEST} (2 files - no git repository)\n`);
  assert.equal(at.fs.isLink(`/r/${DEST}/l`), true);
});

test("an exec bit staged over a plain file reaches the archive commit under core.fileMode=false", () => {
  const at = scene({ head: { [`${RUN}/attachments/run.sh`]: "#!/bin/sh\n" }, opts: { fileMode: false } });
  at.stageMode(`${RUN}/attachments/run.sh`, "100755");
  assert.deepEqual(at.archive(RUN), archived(3));
  assert.equal(at.commits[0].files[`${DEST}/attachments/run.sh`].mode, "100755");
  assert.deepEqual(at.staged(), []);
});

for (const bare of [false, true]) {
  test(`docs/<runs>/ still holding a sibling is kept ${bare ? "outside" : "in"} a repository`, () => {
    const at = scene({ tree: { "docs/_specs/other/status.md": "x\n" }, bare });
    assert.equal(at.archive(RUN).exit, 0);
    assert.deepEqual(at.under("docs/_specs"), ["docs/_specs/other/status.md"]);
  });
}

test("a bracket in the run's name is one exact path, a sibling it would match as a glob left as edited", () => {
  const dir = "docs/_specs/x[ab]";
  const at = scene({ head: { ...runFiles(dir), "docs/_specs/xa/keep.md": "original\n" }, tree: { "docs/_specs/xa/keep.md": "edited\n" } });
  assert.deepEqual(at.archive(dir), archived(2, "docs/specs/x[ab]"));
  assert.equal(at.fs.readText("/r/docs/_specs/xa/keep.md"), "edited\n");
  assert.equal(at.commits[0].files["docs/_specs/xa/keep.md"].text, "original\n");
});

const SPELLINGS = [
  { name: "a leading ./", arg: `./${RUN}` },
  { name: "a trailing /", arg: `${RUN}/` },
  { name: "several trailing slashes", arg: `${RUN}//` },
  { name: "backslashes", arg: RUN.replaceAll("/", "\\") },
  { name: "an absolute path", arg: `/r/${RUN}` },
  { name: "an absolute path through a link", arg: `/l/${RUN}`, links: { "/l": "/r" } },
  { name: "a relative path from a subdirectory", arg: RUN, cwd: "/r/docs" },
];
for (const row of SPELLINGS) {
  test(`${row.name} archives the same run`, () => {
    assert.deepEqual(scene({ cwd: row.cwd, links: row.links }).archive(row.arg), archived(2));
  });
}

const under = "a run directory lives under docs/_specs/";
const REFUSED: Array<{ name: string; argv: string[]; exit: number; reason: string; given?: Scene }> = [
  { name: "no argument", argv: [], exit: 2, reason: "usage: archive-run.sh <run-dir>" },
  { name: "an empty argument", argv: [""], exit: 2, reason: "usage: archive-run.sh <run-dir>" },
  { name: "two arguments", argv: [RUN, "b"], exit: 2, reason: "usage: archive-run.sh <run-dir>" },
  { name: "'.'", argv: ["."], exit: 2, reason: "refused . - no run key" },
  { name: "'./'", argv: ["./"], exit: 2, reason: "refused ./ - no run key" },
  { name: "slashes alone", argv: ["//"], exit: 2, reason: "refused // - no run key" },
  { name: "a '..' segment under docs/<runs>/", argv: [`${RUN}/../../..`], exit: 2, reason: `refused ${RUN}/../../.. - a run directory carries no '..' segment` },
  { name: "an absolute path naming the run through a '..' segment", argv: [`/r/${RUN}/../${KEY}`], exit: 2, reason: `refused /r/${RUN}/../${KEY} - a run directory carries no '..' segment` },
  { name: "a path outside docs/<runs>/", argv: ["docs/other/run"], exit: 2, reason: `refused docs/other/run - ${under}` },
  { name: "an absolute path in the repository outside docs/<runs>/", argv: ["/r/docs/other/run"], exit: 2, reason: `refused docs/other/run - ${under}` },
  { name: "an absolute path outside the repository", argv: [`/q/${RUN}`], exit: 2, reason: `refused /q/${RUN} - ${under}` },
  { name: "a directory that is not there", argv: ["docs/_specs/none"], exit: 2, reason: "run directory not found: docs/_specs/none" },
  { name: "an absolute one that is not there", argv: ["/r/docs/_specs/none"], exit: 2, reason: "run directory not found: docs/_specs/none" },
  { name: "a directory holding no status.md", argv: ["docs/_specs/loose"], exit: 2, reason: "refused docs/_specs/loose - no status.md, so this is not a run directory", given: { tree: { "docs/_specs/loose/notes.md": "x\n" } } },
  { name: "an existing destination", argv: [RUN], exit: 3, reason: `${DEST} already exists - nothing was moved`, given: { tree: { [`${DEST}/spec.md`]: "earlier\n" } } },
  { name: "a task in neither done: nor skipped:", argv: [RUN], exit: 4, reason: `refused ${RUN} - the run is unfinished: 1 of 2 tasks settled`, given: { head: { [`${RUN}/status.md`]: "done: T1\nskipped: none\n" } } },
  { name: "an id naming no task in place of a real one", argv: [RUN], exit: 4, reason: `refused ${RUN} - the run is unfinished: 1 of 2 tasks settled`, given: { head: { [`${RUN}/status.md`]: "done: T1 BOGUS\n" } } },
  { name: "an id repeated in place of a second one", argv: [RUN], exit: 4, reason: `refused ${RUN} - the run is unfinished: 1 of 2 tasks settled`, given: { head: { [`${RUN}/status.md`]: "done: T1 T1\n" } } },
  { name: "docs/<specifications> standing as a file", argv: [RUN], exit: 1, reason: "could not create docs/specs - nothing was moved", given: { tree: { "docs/specs": "x\n" } } },
];

for (const row of REFUSED) {
  test(`${row.name} is refused with exit ${row.exit}, the run and the scratch of its build untouched`, () => {
    const at = scene({ ...row.given, tree: { ...row.given?.tree, ".temp/viber/T2/state": "x\n" } });
    const before = at.under("docs");
    assert.deepEqual(at.archive(...row.argv), stopped(row.exit, row.reason));
    assert.deepEqual(at.under("docs"), before);
    assert.equal(at.fs.exists("/r/.temp/viber/T2/state"), true);
  });
}

const SETTLED = [
  { name: "a task the user dropped", status: "done: T1\nskipped: T2\n", text: plan("T1", "T2") },
  { name: "a TASK marker inside prose, whose heading is no task", status: "done: T1\n", text: `${plan("T1")}\nSee the <!-- TASK --> marker.\n\n### T2 - no task\n\n<!-- /TASK -->\n` },
  { name: "a plan and a status with CRLF line ends", status: "done: T1 T2\r\n", text: plan("T1", "T2").replaceAll("\n", "\r\n") },
  { name: "a plan with no task block", status: "done: none\n", text: "# Plan\n" },
];
for (const row of SETTLED) {
  test(`${row.name} leaves the run finished`, () => {
    assert.deepEqual(scene({ head: { [`${RUN}/plan.md`]: row.text, [`${RUN}/status.md`]: row.status } }).archive(RUN), archived(2));
  });
}

const left = (leaf: string): string => `could not remove ${DEST}/${leaf} - the move stands, nothing was committed`;
const STEPS: Array<{ name: string; given: Scene; exit: number; reason: string; moved: boolean }> = [
  { name: "git mv", given: { opts: { fails: { move: 128 } } }, exit: 5, reason: `could not move ${RUN} to ${DEST} - nothing was moved`, moved: false },
  { name: "git rm of the scaffolding", given: { opts: { fails: { removeTracked: 1 } } }, exit: 5, reason: left("plan.md"), moved: true },
  { name: "deleting the scaffolding", given: { fs: { removeTree: () => false } }, exit: 1, reason: left("plan.md"), moved: true },
  { name: "staging the archive", given: { opts: { fails: { stageAll: 128 } } }, exit: 5, reason: "", moved: true },
  { name: "the commit", given: { opts: { hook: 1 } }, exit: 5, reason: "", moved: true },
  { name: "a run of scaffolding alone", given: { head: { [`${RUN}/spec.md`]: null, [`${RUN}/qa.md`]: null } }, exit: 1, reason: `${DEST} holds no file - the move stands, nothing was committed`, moved: true },
];

for (const row of STEPS) {
  test(`${row.name} failing ends the call with exit ${row.exit}, nothing committed and the scratch kept`, () => {
    const at = scene({ ...row.given, tree: { ".temp/viber/T1/state": "x\n" } });
    assert.deepEqual(at.archive(RUN), stopped(row.exit, row.reason));
    assert.deepEqual(at.commits, []);
    assert.equal(at.fs.exists(`/r/${RUN}/plan.md`), !row.moved);
    assert.equal(at.fs.exists("/r/.temp/viber/T1/state"), true);
  });
}

test("a branch with no commit yet ends with exit 5, the move standing and nothing committed", () => {
  const at = scene({ opts: { head: null } });
  at.write.stageAll("/r", null);
  assert.deepEqual(at.archive(RUN), stopped(5, "HEAD names no commit - the move stands, nothing was committed"));
  assert.deepEqual(at.commits, []);
});

const YML = ".claude/viber.yml";
const DIRS: Array<{ name: string; yml: string; run: string; dest: string }> = [
  { name: "the directories group names both ends", yml: "directories:\n  runs: builds\n  specifications: archive\n", run: `docs/builds/${KEY}`, dest: `docs/archive/${KEY}` },
  { name: "an unusable name is ignored", yml: "directories:\n  runs: ../escape\n  specifications: /absolute\n", run: RUN, dest: DEST },
  { name: "a key outside the group is not this key", yml: "runs: builds\nspecifications: archive\n", run: RUN, dest: DEST },
];
for (const row of DIRS) {
  test(`${row.name}: ${row.run} goes to ${row.dest}`, () => {
    const at = scene({ head: { ...runFiles(row.run), [YML]: row.yml } });
    assert.deepEqual(at.archive(row.run), archived(2, row.dest));
    assert.deepEqual(at.under(row.dest), [`${row.dest}/qa.md`, `${row.dest}/spec.md`]);
  });
}

test("the scratch of the build and its planning goes with the run, every other file under .temp/ stays, a task id reaching outside .temp/viber/ included", () => {
  const gone = ["T1/state", "lessons", "test-runner/T1.cmd", "final-fix/x.log", "repair-1/x.log", "extension-docs/x.md", "intent/summary-2026.md", "planner/reach-2026.md", "planner/review-round", "fixer/tree-record"];
  const kept = ["T9/state", "code-auditor/r1/findings.md", "intent/notes.md", "intent/summary.txt", "prototype/mockup.html", "repairs/x"];
  const at = scene({
    head: { [`${RUN}/plan.md`]: plan("T1", ".."), [`${RUN}/status.md`]: "done: T1 ..\n" },
    tree: { ...Object.fromEntries([...gone, ...kept].map((path) => [`.temp/viber/${path}`, "x\n"])), ".temp/logs/l": "x\n" },
  });
  assert.deepEqual(at.archive(RUN), archived(2));
  assert.deepEqual(at.under(".temp").filter((path) => path !== ".temp/logs/l"), [...kept].map((path) => `.temp/viber/${path}`));
  assert.equal(at.fs.exists("/r/.temp/logs/l"), true);
});
