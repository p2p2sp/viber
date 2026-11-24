/*
 * frame.unit.test.ts - the frame core on fake ports: the lens list or scope
 * question when one is missing, every stop line of the Frame phase, and on a
 * framed run the workspace (`reports/`, `worktrees/`, `run.md`) and the `RUN:`
 * line of map-signals.sh, checked as text (map-signals.sh is never run here).
 *
 * The lens files are planted in the fake file system with the `Worktree:` line
 * a case needs; the shipped lens files are held to their names and that line
 * by tests/viber/lenses.unit.test.ts. What the diff scope lists is given as
 * the tables of a `fakeGit` repository, the base rules being proven by
 * tests/viber/lib/diff-files.unit.test.ts.
 *
 * The wrapper is run as a process by tests/viber/frame.critical.test.ts, and
 * its exec bit is held by the `invocations` lint rule.
 */

import assert from "node:assert/strict";
import { fakeClock, fakeFs, fakeGit, type FakeRepo } from "../../harness/fakes.ts";
import { test } from "../../harness/test.ts";
import type { ChangedFile } from "../../../viber/lib/ports.ts";
import { runFrame } from "../../../viber/lib/frame.ts";

const ROOT = "/r";
const SKILL_DIR = "/plugin/skills/code-auditor";
const SCRIPT = `${SKILL_DIR}/scripts/frame.ts`;
const AT = new Date(2026, 10, 24, 17, 4, 6);
const RUN_ID = "20261124-170406";
const HEAD = "a".repeat(40);
const MAIN = "b".repeat(40);
const FORK = "c".repeat(40);
const OLD = "d".repeat(40);

const LENSES = ["bugs", "security", "web-performance", "runtime-performance", "tests", "design"];
const LENS_LIST = "(lenses: bugs, security, web-performance, runtime-performance, tests, design)";
const ARGUMENT_STOP = "STOP: code-auditor: give at most one lens and one scope: [<lens>] [diff | diff:<sha> | <directory> | repo]\n";

const lines = (...rows: string[]): string => rows.map((row) => `${row}\n`).join("");
const files = (...rows: string[]): ChangedFile[] => rows.map((row) => ({ status: row.slice(0, 1), path: row.slice(2) }));

/** The branch main with one commit, HEAD on it. */
const ON_MAIN: Partial<FakeRepo> = { branch: "main", commits: { HEAD, "refs/heads/main": HEAD } };
/** A repository with no commit yet. */
const NO_COMMIT: Partial<FakeRepo> = {};

interface Scene {
  /** Files below the root, a repo-relative path to its text. */
  files?: Record<string, string>;
  /** Files anywhere, by absolute path. */
  outside?: Record<string, string>;
  /** Directory links: the link's absolute path to the directory it names. */
  links?: Record<string, string>;
  /** null: no repository anywhere. */
  repo?: Partial<FakeRepo> | null;
  root?: string;
  cwd?: string;
  script?: string;
}

function frame(argv: string[], scene: Scene = {}) {
  const root = scene.root ?? ROOT;
  const script = scene.script ?? SCRIPT;
  const skillDir = script.replaceAll("\\", "/").split("/").slice(0, -2).join("/");
  const seeded: Record<string, string> = { ...scene.outside };
  for (const lens of LENSES) seeded[`${skillDir}/references/lenses/${lens}.md`] = `## Verify\nWorktree: ${lens === "design" ? "none" : "required"}\n`;
  for (const [rel, body] of Object.entries(scene.files ?? {})) seeded[`${root}/${rel}`] = body;
  const fs = fakeFs(seeded, { dirs: [root], links: scene.links });
  const repo = scene.repo === undefined ? ON_MAIN : scene.repo;
  const git = fakeGit(repo === null ? null : { root, tracked: [], ...repo });
  const stdout = runFrame(argv, scene.cwd ?? root, script, { fs, git, clock: fakeClock(AT) });
  const ws = `${root}/.temp/viber/code-auditor/${RUN_ID}`;
  return { stdout, fs, ws, runFile: fs.readText(`${ws}/run.md`), wrote: fs.exists(`${root}/.temp`) };
}

/** The RUN line of a framed run under the root. */
const runLine = (root = ROOT, skillDir = SKILL_DIR): string => `RUN: sh "${skillDir}/scripts/map-signals.sh" "${root}/.temp/viber/code-auditor/${RUN_ID}"\n`;

const NO_LENS_ROWS: Array<{ label: string; args: string[]; stdout: string }> = [
  { label: "no token", args: [], stdout: lines("NEXT: ask-lens | numbers: 1-6") },
  { label: "the performance group token", args: ["performance"], stdout: lines("NEXT: ask-lens | numbers: 3,4") },
  { label: "the quality group token", args: ["quality"], stdout: lines("NEXT: ask-lens | numbers: 5,6") },
  { label: "a directory token only", args: ["src/api"], stdout: lines("NEXT: ask-lens | numbers: 1-6", "scope: src/api") },
  { label: "the diff scope with a base only", args: ["diff:abc123"], stdout: lines("NEXT: ask-lens | numbers: 1-6", "scope: diff:abc123") },
  { label: "the performance group and the repo scope", args: ["performance", "repo"], stdout: lines("NEXT: ask-lens | numbers: 3,4", "scope: repo") },
  { label: "a scope then the quality group", args: ["diff", "quality"], stdout: lines("NEXT: ask-lens | numbers: 5,6", "scope: diff") },
];

for (const row of NO_LENS_ROWS) {
  test(`${row.label} with no lens prints the lens list numbers (carrying the scope token given) and writes nothing`, () => {
    const result = frame(row.args);
    assert.deepEqual([result.stdout, result.wrote], [row.stdout, false]);
  });
}

test("an empty token is ignored: a lens beside two of them still asks the scope question", () => {
  assert.equal(frame(["", "bugs", ""]).stdout, lines("ASK: changes -> diff | directory -> directory | whole repository -> repo", "lens: bugs"));
});

for (const lens of LENSES) {
  test(`the ${lens} lens alone beside a directory named ${lens} asks the scope question for the lens and writes nothing (the name reads as the lens, never the directory)`, () => {
    const result = frame([lens], { files: { [`${lens}/a.txt`]: "1\n" } });
    assert.deepEqual([result.stdout, result.wrote], [lines("ASK: changes -> diff | directory -> directory | whole repository -> repo", `lens: ${lens}`), false]);
  });

  test(`the ${lens} lens beside ./${lens} frames a run on the directory of that name`, () => {
    const result = frame([lens, `./${lens}`], { files: { [`${lens}/a.txt`]: "1\n" } });
    assert.equal(result.stdout, runLine());
    assert.equal(result.runFile, lines(`Lens: ${lens}`, `Lens file: ${SKILL_DIR}/references/lenses/${lens}.md`, `Scope: ${lens}`, `Target root: ${ROOT}`));
  });
}

const ARGUMENT_ROWS: Array<{ label: string; args: string[] }> = [
  { label: "two lens tokens", args: ["bugs", "security"] },
  { label: "two scope tokens", args: ["diff", "repo"] },
  { label: "two directory tokens", args: ["src", "docs"] },
  { label: "a lens beside a group token", args: ["bugs", "performance"] },
  { label: "three tokens", args: ["bugs", "repo", "src"] },
];

for (const row of ARGUMENT_ROWS) {
  test(`${row.label} print the argument stop line and write nothing`, () => {
    const result = frame(row.args, { files: { "src/a.txt": "1\n", "docs/a.txt": "1\n" } });
    assert.deepEqual([result.stdout, result.wrote], [ARGUMENT_STOP, false]);
  });
}

const DIRECTORY_ROWS: Array<{ label: string; token: string; value: string }> = [
  { label: "a directory that does not exist", token: "missing/dir", value: "missing/dir" },
  { label: "a file that is no directory", token: "src/a.txt", value: "src/a.txt" },
  { label: "a directory above the root", token: "../outside", value: "../outside" },
  { label: "an existing directory reached through a .. segment", token: "src/../src", value: "src/../src" },
  { label: "an absolute path to a directory that does not exist under the root", token: "/no-such-dir-p2p2/x", value: "/no-such-dir-p2p2/x" },
  { label: "a token holding an apostrophe", token: "sr'c", value: "sr'c" },
  { label: "the --apostrophe token", token: "--apostrophe", value: "<token>" },
];

for (const row of DIRECTORY_ROWS) {
  test(`${row.label} stops with the directory line naming ${row.value}, writing nothing`, () => {
    const result = frame(["bugs", row.token], { files: { "src/a.txt": "1\n", "sr'c/a.txt": "1\n" }, outside: { "/outside/a.txt": "1\n" } });
    assert.deepEqual([result.stdout, result.wrote], [lines(`STOP: code-auditor: area directory not found under ${ROOT}: ${row.value} ${LENS_LIST}`), false]);
  });
}

test("an absolute directory that exists outside the root stops with the directory line", () => {
  const result = frame(["bugs", "/outside"], { files: { "src/a.txt": "1\n" }, outside: { "/outside/a.txt": "1\n" } });
  assert.deepEqual([result.stdout, result.wrote], [lines(`STOP: code-auditor: area directory not found under ${ROOT}: /outside ${LENS_LIST}`), false]);
});

test("an absolute directory that reads as outside the root and really lies under it frames with its root-relative path (a link to the checkout names the same tree)", () => {
  const result = frame(["bugs", "/alias/src/api"], { files: { "src/api/a.txt": "1\n" }, links: { "/alias": ROOT } });
  assert.equal(result.runFile, lines("Lens: bugs", `Lens file: ${SKILL_DIR}/references/lenses/bugs.md`, "Scope: src/api", `Target root: ${ROOT}`));
});

test("an unknown diff base stops with the diff base line", () => {
  const result = frame(["bugs", "diff:no-such-commit"]);
  assert.deepEqual([result.stdout, result.wrote], [lines("STOP: code-auditor: diff base not found: no-such-commit"), false]);
});

test("the diff scope outside a git repository stops with the repository line", () => {
  const result = frame(["bugs", "diff"], { repo: null });
  assert.deepEqual([result.stdout, result.wrote], [lines("STOP: code-auditor: the diff scope needs a git repository"), false]);
});

test("the diff scope with nothing changed stops naming the base it measured from", () => {
  const result = frame(["bugs", "diff"]);
  assert.deepEqual([result.stdout, result.wrote], [lines("STOP: code-auditor: nothing changed against HEAD"), false]);
});

test("the diff scope under a lens that verifies on a clean checkout, in a repository with no commit yet, stops with the no-commit line", () => {
  const result = frame(["bugs", "diff"], { repo: { ...NO_COMMIT, untracked: ["untracked.txt"] } });
  assert.deepEqual(
    [result.stdout, result.wrote],
    [lines("STOP: code-auditor: bugs verifies on a clean checkout and this repository has no commit yet: commit first, or pick the design lens"), false],
  );
});

const NO_COMMIT_ROWS: Array<{ label: string; args: string[] }> = [
  { label: "the repo scope under bugs", args: ["bugs", "repo"] },
  { label: "a directory scope under security", args: ["security", "src"] },
];

for (const row of NO_COMMIT_ROWS) {
  test(`${row.label} in a repository with no commit stops with the clean checkout line`, () => {
    const result = frame(row.args, { repo: NO_COMMIT, files: { "src/a.txt": "1\n" } });
    assert.deepEqual(
      [result.stdout, result.wrote],
      [lines(`STOP: code-auditor: ${row.args[0]} verifies on a clean checkout and ${ROOT} holds no git commit: commit first, or pick the design lens`), false],
    );
  });
}

test("the design lens frames the repo scope in a repository with no commit (its lens file reads Worktree: none)", () => {
  const result = frame(["design", "repo"], { repo: NO_COMMIT, files: { "src/a.txt": "1\n" } });
  assert.equal(result.stdout, runLine());
  assert.equal(result.runFile, lines("Lens: design", `Lens file: ${SKILL_DIR}/references/lenses/design.md`, "Scope: repo", `Target root: ${ROOT}`));
});

test("a framed repo run creates the reports and worktrees directories beside run.md", () => {
  const result = frame(["security", "repo"]);
  assert.deepEqual([result.fs.kind(`${result.ws}/reports`), result.fs.kind(`${result.ws}/worktrees`), result.fs.kind(`${result.ws}/run.md`)], ["dir", "dir", "file"]);
});

const SCOPE_ROWS: Array<{ label: string; token: string; scope: string }> = [
  { label: "a relative directory", token: "src/api", scope: "src/api" },
  { label: "a relative directory with a leading ./", token: "./src/api", scope: "src/api" },
  { label: "a relative directory with a trailing slash", token: "src/api/", scope: "src/api" },
  { label: "an absolute directory under the root", token: `${ROOT}/src/api`, scope: "src/api" },
  { label: "the root itself as an absolute path", token: `${ROOT}/`, scope: "." },
  { label: "a directory named diff", token: "./diff", scope: "./diff" },
  { label: "an absolute directory named repo", token: `${ROOT}/repo`, scope: "./repo" },
];

for (const row of SCOPE_ROWS) {
  test(`${row.label} is recorded as Scope: ${row.scope}`, () => {
    const result = frame(["bugs", row.token], { files: { "src/api/a.txt": "1\n", "diff/a.txt": "1\n", "repo/a.txt": "1\n" } });
    assert.equal(result.runFile, lines("Lens: bugs", `Lens file: ${SKILL_DIR}/references/lenses/bugs.md`, `Scope: ${row.scope}`, `Target root: ${ROOT}`));
  });
}

test("a framed diff run records the merge base and every changed path under Changed files", () => {
  const repo: Partial<FakeRepo> = {
    branch: "feature",
    commits: { HEAD, "refs/heads/main": MAIN },
    mergeBases: { "HEAD refs/heads/main": FORK },
    changed: { [FORK]: files("A committed.txt") },
    untracked: ["untracked.txt"],
  };
  const result = frame(["bugs", "diff"], { repo });
  assert.equal(result.stdout, runLine());
  assert.equal(
    result.runFile,
    lines("Lens: bugs", `Lens file: ${SKILL_DIR}/references/lenses/bugs.md`, "Scope: diff", `Target root: ${ROOT}`, `Base: ${FORK}`, "", "## Changed files", "committed.txt", "untracked.txt"),
  );
});

test("a framed diff:<sha> run records that commit as the base", () => {
  const result = frame(["security", `diff:${OLD}`], { repo: { ...ON_MAIN, commits: { ...ON_MAIN.commits, old: OLD }, changed: { [OLD]: files("A b.txt") } } });
  assert.equal(
    result.runFile,
    lines("Lens: security", `Lens file: ${SKILL_DIR}/references/lenses/security.md`, "Scope: diff", `Target root: ${ROOT}`, `Base: ${OLD}`, "", "## Changed files", "b.txt"),
  );
});

test("the design lens frames the diff scope in a repository with no commit and records Base: none", () => {
  const result = frame(["design", "diff"], { repo: { ...NO_COMMIT, untracked: ["untracked.txt"] } });
  assert.equal(
    result.runFile,
    lines("Lens: design", `Lens file: ${SKILL_DIR}/references/lenses/design.md`, "Scope: diff", `Target root: ${ROOT}`, "Base: none", "", "## Changed files", "untracked.txt"),
  );
});

test("from a subdirectory the root of the repository is the target, and outside a repository the cwd is", () => {
  const inside = frame(["design", "repo"], { cwd: `${ROOT}/src`, files: { "src/a.txt": "1\n" } });
  const outside = frame(["design", "repo"], { repo: null, cwd: `${ROOT}/src/`, files: { "src/a.txt": "1\n" } });
  assert.deepEqual([inside.stdout, outside.stdout], [runLine(), runLine(`${ROOT}/src`)]);
});

// The entry is started by a backslash path on Windows, and a directory token arrives there in a drive-letter spelling.
const WIN_ROOT = "C:/work/repo";
const WIN_SKILL_DIR = "C:/plugin/skills/code-auditor";

test("started by a C:\\ path, the skill paths are printed and written with forward slashes", () => {
  const result = frame(["design", "repo"], { root: WIN_ROOT, cwd: "C:\\work\\repo", script: "C:\\plugin\\skills\\code-auditor\\scripts\\frame.ts" });
  assert.equal(result.stdout, runLine(WIN_ROOT, WIN_SKILL_DIR));
  assert.equal(result.runFile, lines("Lens: design", `Lens file: ${WIN_SKILL_DIR}/references/lenses/design.md`, "Scope: repo", `Target root: ${WIN_ROOT}`));
});

const WINDOWS_FORM_ROWS: Array<{ label: string; token: string }> = [
  { label: "the root in C:\\ form", token: "C:\\work\\repo\\src" },
  { label: "the root with the other case of its drive letter", token: "c:/work/repo/src" },
  { label: "the root in C:\\ form with the other case of its drive letter and a trailing slash", token: "c:\\work\\repo\\src\\" },
];

for (const row of WINDOWS_FORM_ROWS) {
  test(`a src directory given as ${row.label} frames with Scope: src`, () => {
    const result = frame(["bugs", row.token], { root: WIN_ROOT, files: { "src/a.txt": "1\n" } });
    assert.equal(result.runFile, lines("Lens: bugs", `Lens file: ${SKILL_DIR}/references/lenses/bugs.md`, "Scope: src", `Target root: ${WIN_ROOT}`));
  });
}

test("a directory on another drive stops with the directory line naming the token as given", () => {
  const result = frame(["bugs", "D:\\work\\repo\\src"], { root: WIN_ROOT, files: { "src/a.txt": "1\n" } });
  assert.equal(result.stdout, lines(`STOP: code-auditor: area directory not found under ${WIN_ROOT}: D:\\work\\repo\\src ${LENS_LIST}`));
});
