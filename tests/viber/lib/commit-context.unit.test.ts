/*
 * commit-context.unit.test.ts - the commit-context core on fake ports: the RUN:
 * or STOP: line, the issue footer, the branch and the sections over what git
 * reports, the diff capped. What git prints (an unborn branch, a binary file, a
 * name outside ASCII, a path read literally) is held by the contract cases of the
 * Git port, how a selector is read by commit-args.unit.test.ts; the wrapper is
 * run as a process by tests/viber/commit-context.critical.test.ts.
 */

import assert from "node:assert/strict";
import { fakeFs, fakeGit, type FakeRepo } from "../../harness/fakes.ts";
import { test } from "../../harness/test.ts";
import { runCommitContext } from "../../../viber/lib/commit-context.ts";

const SCRIPT = "/p/viber/skills/commit/scripts/commit-context.ts";
const RUN = 'RUN: "/p/viber/skills/commit/scripts/commit.sh" "<message>"';
const HEADING = "## Issue footer (after the subject and one blank line; none -> no footer)";
const REPORTS = { log: "1111111 seed\n", status: " M a.txt\n", stat: " a.txt | 2 +-\n", diff: "-a\n+b\n" };

function context(raw: string, repo: Partial<FakeRepo> | null = {}, opts: { files?: string[]; cwd?: string; script?: string } = {}): string {
  const fs = fakeFs(Object.fromEntries((opts.files ?? []).map((file) => [`/r/${file}`, "x\n"])), { dirs: ["/r"] });
  const git = fakeGit(repo === null ? null : { root: "/r", tracked: [], commits: { HEAD: "1".repeat(40) }, reports: REPORTS, ...repo });
  return runCommitContext([raw], opts.cwd ?? "/r", opts.script ?? SCRIPT, { fs, git });
}

/** The lines of one section, from its heading on. */
const section = (out: string, heading: string): string[] => out.slice(out.indexOf(heading)).split("\n\n")[0].split("\n");

test("with no selector the block is the RUN: line, then every section over the whole tree, in order", () => {
  assert.equal(
    context(""),
    [
      RUN,
      "",
      HEADING,
      "none",
      "",
      "## Current branch",
      "main",
      "",
      "## Recent commit subjects (match this type/scope style)",
      "1111111 seed",
      "",
      "## Changes (git status, all untracked files)",
      " M a.txt",
      "",
      "## Overview (git diff HEAD --stat)",
      " a.txt | 2 +-",
      "",
      "## Diff (all tracked changes vs HEAD; new untracked files are listed in git status above)",
      "-a",
      "+b",
      "",
    ].join("\n"),
  );
});

test("named paths stand on the RUN: line and in the three headings, root-relative though given from a subdirectory", () => {
  const out = context("src/f.txt b.txt", {}, { files: ["pkg/src/f.txt", "b.txt"], cwd: "/r/pkg" });
  assert.deepEqual(
    out.split("\n").filter((line) => /^RUN:|paths/.test(line)),
    [
      `${RUN} 'pkg/src/f.txt b.txt'`,
      "## Changes (git status for paths: pkg/src/f.txt b.txt)",
      "## Overview (git diff HEAD --stat for paths: pkg/src/f.txt b.txt)",
      "## Diff (changes vs HEAD for paths: pkg/src/f.txt b.txt; a new untracked file appears only in git status above)",
    ],
  );
});

test("named paths that are not there print the STOP: line alone", () => {
  assert.equal(context("src/nope.ts"), "STOP: Nothing committed - paths not found: src/nope.ts\n");
});

test("a path with $, backticks and parentheses stands on the RUN: line as it is", () => {
  const name = "odd $HOME `x` (1).txt";
  assert.equal(context(`${name} #42`, {}, { files: [name] }).split("\n")[0], "RUN: \"/p/viber/skills/commit/scripts/commit.sh\" \"<message>\" 'odd $HOME `x` (1).txt'");
});

test("the plugin root of a script started by a backslash path is printed with forward slashes", () => {
  const out = context("", {}, { script: "C:\\p\\viber\\skills\\commit\\scripts\\commit-context.ts" });
  assert.equal(out.split("\n")[0], 'RUN: "C:/p/viber/skills/commit/scripts/commit.sh" "<message>"');
});

const FOOTERS: Array<{ name: string; raw: string; branch: string; want: string }> = [
  { name: "the references of the arguments, the branch's own number ignored", raw: "#42 https://github.com/acme/app/issues/7", branch: "feature/task.99-other", want: "Refs: #42, #7" },
  { name: "a bare reference beside a path", raw: "src/foo.txt #42", branch: "main", want: "Refs: #42" },
  { name: "the number the branch names", raw: "", branch: "feature/Task.42-login", want: "Refs: #42" },
  { name: "none for a branch naming two numbers", raw: "", branch: "feature/issue.3-task.4", want: "none" },
  { name: "the one number a branch names twice", raw: "", branch: "issue.3-task.3", want: "Refs: #3" },
  { name: "none for a branch naming no number", raw: "", branch: "main", want: "none" },
];

for (const row of FOOTERS) {
  test(`the footer is ${row.name}`, () => {
    assert.deepEqual(section(context(row.raw, { branch: row.branch }, { files: ["src/foo.txt"] }), HEADING), [HEADING, row.want]);
  });
}

test("on a detached HEAD the branch is HEAD", () => {
  assert.deepEqual(section(context("", { branch: null }), "## Current branch"), ["## Current branch", "HEAD"]);
});

test("new files alone say outright that they are still committed (a fork read the bare line as nothing to commit)", () => {
  const out = context("", { reports: { ...REPORTS, status: "?? new.txt\n", stat: "", diff: "" } });
  assert.equal(section(out, "## Diff")[1], "(no textual diff, but git status above lists changes - they are still committed: run commit.sh)");
});

test("no change at all says there is no textual diff", () => {
  const out = context("", { reports: { log: "1111111 seed\n" } });
  assert.deepEqual(section(out, "## Changes"), ["## Changes (git status, all untracked files)"]);
  assert.equal(section(out, "## Diff")[1], "(no textual diff for this mode)");
});

test("a diff past 400 lines is cut there, its notice naming the real total", () => {
  const out = context("", { reports: { ...REPORTS, diff: Array.from({ length: 402 }, (_, i) => `+line ${i}\n`).join("") } });
  assert.deepEqual(section(out, "## Diff").slice(400), ["+line 399", "... [diff truncated: showing first 400 of 402 lines - run git diff for the rest]", ""]);
});

test("a diff of 400 lines is printed whole, with no notice", () => {
  const out = context("", { reports: { ...REPORTS, diff: Array.from({ length: 400 }, (_, i) => `+line ${i}\n`).join("") } });
  assert.deepEqual(section(out, "## Diff").slice(400), ["+line 399", ""]);
});

test("where every git call fails the RUN: line and every heading still stand, the sections empty", () => {
  const out = context("", null);
  assert.deepEqual(
    out.split("\n").filter((line) => line !== ""),
    [
      RUN,
      HEADING,
      "none",
      "## Current branch",
      "## Recent commit subjects (match this type/scope style)",
      "## Changes (git status, all untracked files)",
      "## Overview (git diff HEAD --stat)",
      "## Diff (all tracked changes vs HEAD; new untracked files are listed in git status above)",
      "(no textual diff for this mode)",
    ],
  );
});
