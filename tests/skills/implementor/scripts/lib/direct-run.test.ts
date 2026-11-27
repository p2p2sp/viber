/*
 * runDirect: the files kept as the user's at start, the paths handed to the
 * commit skill, the END lines of a commit made, not made, not needed and of a
 * stopped build, and a project with no git repository.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runDirect } from "../../../../../viber/skills/implementor/scripts/lib/direct-run.ts";
import { fakeFs, fakeGit, ROOT } from "../../../../fake-ports.ts";

const STATE = `${ROOT}/.temp/viber/s1/direct/state.json`;

function run() {
  const fs = fakeFs();
  const git = fakeGit(["mine.ts", ".temp/x"]);
  const call = (...args: string[]) => runDirect(["s1", ...args], ROOT, { fs, git, tree: { root: () => ROOT, files: () => [] } });
  return { fs, git, call };
}

describe("runDirect", () => {
  it("start keeps what differs from HEAD as the user's files, .temp/ dropped", () => {
    const { fs, call } = run();
    assert.deepEqual(call("start"), { stdout: "STARTED\n", stderr: "", exit: 0 });
    assert.deepEqual(JSON.parse(fs.readText(STATE) ?? "null").before, ["mine.ts"]);
  });

  it("done: the reported files alone go to the commit skill; committed names the commit and the rest", () => {
    const { git, call } = run();
    call("start");
    git.dirtyPaths.push("src/a.ts", "src/b.ts", "my file.ts", "stray.log");
    assert.equal(call("done", `src\\a.ts, ${ROOT}/src/b.ts, ./mine.ts, my file.ts, .temp/x, gone.ts`).stdout, "SKILL: viber:commit\nsrc/a.ts src/b.ts\n");
    git.dirtyPaths = ["mine.ts", ".temp/x", "my file.ts", "stray.log"];
    git.head = () => "1111111aaaa";
    assert.equal(
      call("committed").stdout,
      [
        "END",
        "The change is committed: 1111111.",
        "Left uncommitted: my file.ts",
        "Left uncommitted, changed before the run too: mine.ts",
        "Left uncommitted, reported by no coder: stray.log",
        "",
      ].join("\n"),
    );
  });

  it("committed with HEAD where it was: not committed, the files named", () => {
    const { git, call } = run();
    call("start");
    git.dirtyPaths.push("src/a.ts");
    call("done", "src/a.ts");
    assert.equal(call("committed").stdout, "END\nThe change is not committed.\nLeft uncommitted: src/a.ts\n");
  });

  it("done with no reported file that differs: END, nothing to commit", () => {
    const { git, call } = run();
    call("start");
    git.dirtyPaths.push("stray.log");
    assert.equal(call("done").stdout, "END\nNothing to commit.\nLeft uncommitted, reported by no coder: stray.log\n");
    assert.equal(call("committed").stdout, "END\nNothing to commit.\nLeft uncommitted, reported by no coder: stray.log\n");
  });

  it("stopped: no commit, the reported and the unreported files named", () => {
    const { git, call } = run();
    call("start");
    git.dirtyPaths.push("src/a.ts", "stray.log");
    assert.equal(call("stopped", "src/a.ts").stdout, "END\nNothing is committed: the build stopped.\nLeft uncommitted: src/a.ts\nLeft uncommitted, reported by no coder: stray.log\n");
  });

  it("no git repository with a commit: start succeeds, done ends with no commit", () => {
    const { git, call } = run();
    git.head = () => null;
    assert.equal(call("start").stdout, "STARTED\n");
    assert.equal(call("done", "src/a.ts").stdout, "END\nNo git repository with a commit: nothing is committed.\n");
  });

  it("refused: a call before start, a bad session id, a call of no form", () => {
    const { fs, git, call } = run();
    assert.deepEqual(call("done"), { stdout: "", stderr: "direct.sh: no build of this session: call 'direct.sh <session-id> start' first\n", exit: 2 });
    assert.equal(runDirect(["..", "start"], ROOT, { fs, git, tree: { root: () => ROOT, files: () => [] } }).stderr, "direct.sh: .. is no session id\n");
    assert.equal(call("start", "x").exit, 2);
    assert.equal(call("finish").exit, 2);
    assert.equal(runDirect([], ROOT, { fs, git, tree: { root: () => ROOT, files: () => [] } }).exit, 2);
  });
});
